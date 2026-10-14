/* Continuous boundary gradient, row initialization and paper-lattice operations.
 * Match the JavaScript arithmetic and tie order. No libc, imports or fast-math. */
static double clamp(double x, double lo, double hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/* One family update from initialize.js. Batch all rows across the JS/Wasm
 * boundary; retain the exact prefix sums, strict DP ties and infeasible-row
 * fallback of fitRuns(). Spline projection remains in JavaScript. */
void grid_rows(const double *target, const double *weights,
    const unsigned char *flips, const double *priors, int n, int count,
    int family, int phase, int minimum, double weight, double weight_scale,
    double *scratch, int *back, double *out) {
  const int stride=n+1;
  double *prefix0=scratch, *prefix1=scratch+stride;
  for (int y=0; y<n; ++y) {
    double *previous=scratch+2*stride, *next=scratch+3*stride;
    const double *prior=priors+y*count;
    int weighted=0;
    if (weights) {
      weighted=weight_scale!=1;
      for (int x=0; x<n && !weighted; ++x)
        if (weights[family?x*n+y:y*n+x]!=1) weighted=1;
    }
    prefix0[0]=prefix1[0]=0;
    for (int x=0; x<n; ++x) {
      const int index=family?x*n+y:y*n+x;
      const double p=flips[y*n+x]?1-target[index]:target[index];
      if (weighted) {
        const double w=weights[index]*weight_scale;
        prefix0[x+1]=prefix0[x]+w*p;
        prefix1[x+1]=prefix1[x]+w*(1-p);
      } else {
        prefix0[x+1]=prefix0[x]+p;
        prefix1[x+1]=prefix1[x]+1-p;
      }
    }
    for (int i=0; i<stride; ++i) previous[i]=__builtin_inf();
    previous[0]=0;
    for (int region=0; region<=count; ++region) {
      const double *costs=(phase+region)%2?prefix1:prefix0;
      for (int i=0; i<stride; ++i) next[i]=__builtin_inf();
      double best=__builtin_inf(); int at=-1;
      for (int end=(region+1)*minimum; end<=n-(count-region)*minimum; ++end) {
        const int start=end-minimum;
        const double delta=region?(double)start/n-prior[region-1]:0;
        const double penalty=region?weight*n*(delta*delta):0;
        const double value=previous[start]-costs[start]+penalty;
        if (value<best) { best=value; at=start; }
        next[end]=best+costs[end]; back[region*stride+end]=at;
      }
      double *swap=previous; previous=next; next=swap;
    }
    if (!__builtin_isfinite(previous[n])) {
      for (int i=0; i<count; ++i) out[y*count+i]=prior[i];
    } else {
      int end=n;
      for (int region=count; region>0; --region) {
        end=back[region*stride+end]; out[y*count+region-1]=(double)end/n;
      }
    }
  }
}

/* The paper audit's squared Euclidean distance transform. Keep the original
 * column/row order, parabola tie decisions and 1e12 empty-seed sentinel. */
static void edt(const double *f, double *d, int *v, double *z, int n) {
  int k=0;
  v[0]=0; z[0]=-__builtin_inf(); z[1]=__builtin_inf();
  for (int q=1; q<n; ++q) {
    double qq=q, vv=v[k];
    double s=((f[q]+qq*qq)-(f[v[k]]+vv*vv))/(2*(q-v[k]));
    while (s<=z[k] && k>0) {
      --k; vv=v[k];
      s=((f[q]+qq*qq)-(f[v[k]]+vv*vv))/(2*(q-v[k]));
    }
    ++k; v[k]=q; z[k]=s; z[k+1]=__builtin_inf();
  }
  k=0;
  for (int q=0; q<n; ++q) {
    while (z[k+1]<q) ++k;
    double delta=q-v[k];
    d[q]=delta*delta+f[v[k]];
  }
}

void distance_transform(const unsigned char *seeds, int nx, int ny,
    double *first, double *out, double *f, double *d, int *v, double *z) {
  for (int x=0; x<nx; ++x) {
    for (int y=0; y<ny; ++y) f[y]=seeds[y*nx+x]?0:1e12;
    edt(f,d,v,z,ny);
    for (int y=0; y<ny; ++y) first[y*nx+x]=d[y];
  }
  for (int y=0; y<ny; ++y) {
    for (int x=0; x<nx; ++x) f[x]=first[y*nx+x];
    edt(f,d,v,z,nx);
    for (int x=0; x<nx; ++x) out[y*nx+x]=d[x];
  }
}

/* Four-neighbour flood fill, with the same component discovery and neighbour
 * order as material.js. Areas and significance are still calculated in JS. */
int label_core(const unsigned char *mask, int nx, int ny,
    double origin_y, double h, double width, double offset,
    int *labels, int *queue, int *sizes, unsigned char *anchors) {
  const int count=nx*ny;
  int id=0;
  for (int i=0; i<count; ++i) labels[i]=0;
  for (int i=0; i<count; ++i) {
    if (!mask[i] || labels[i]) continue;
    ++id;
    int tail=1, anchored=0;
    queue[0]=i; labels[i]=id;
    for (int head=0; head<tail; ++head) {
      const int p=queue[head], x=p%nx, y=p/nx;
      const double yy=origin_y+(y+.5)*h;
      if (yy<-offset*1.1 || yy>2*width+offset*1.1) anchored=1;
      int q=p-1;
      if (x>0 && mask[q] && !labels[q]) {labels[q]=id; queue[tail++]=q;}
      q=p+1;
      if (x<nx-1 && mask[q] && !labels[q]) {labels[q]=id; queue[tail++]=q;}
      q=p-nx;
      if (y>0 && mask[q] && !labels[q]) {labels[q]=id; queue[tail++]=q;}
      q=p+nx;
      if (y<ny-1 && mask[q] && !labels[q]) {labels[q]=id; queue[tail++]=q;}
    }
    sizes[id-1]=tail; anchors[id-1]=anchored;
  }
  return id;
}

void boundary_gradient(const double *points, int coordinates,
    const int *edges, const int *occurrences, const int *visible, int edge_count,
    const double *segments, const int *bin_starts, const int *bin_ids, int bins,
    const double *prob, int n, int phase, double width, int quadrature,
    const double *basis, const double *derivative, double *gradient) {
  for (int i = 0; i < coordinates; ++i) gradient[i] = 0;
  for (int e = 0; e < edge_count; ++e) {
    if (!visible[e]) continue;
    const int path = occurrences[3*e], family = occurrences[3*e+1];
    const int direction = occurrences[3*e+2];
    for (int j = 0; j < quadrature; ++j) {
      double x=0, y=0, vx=0, vy=0;
      for (int k = 0; k < 4; ++k) {
        int id = edges[4*e+k];
        x += basis[4*j+k]*points[2*id];
        y += basis[4*j+k]*points[2*id+1];
        vx += derivative[4*j+k]*points[2*id];
        vy += derivative[4*j+k]*points[2*id+1];
      }
      int bin = (int)clamp(y/width*bins, 0, bins-1), other = phase == -1;
      for (int q = bin_starts[bin]; q < bin_starts[bin+1]; ++q) {
        const double *s = segments+5*bin_ids[q];
        if ((int)s[4] == path || y < s[1] || y >= s[3]) continue;
        if (s[0]+(y-s[1])*(s[2]-s[0])/(s[3]-s[1]) > x) other ^= 1;
      }
      double xx = clamp(x*n/width-.5,0,n-1), yy = clamp(y*n/width-.5,0,n-1);
      int ix=(int)xx, iy=(int)yy, ix1=ix+1<n?ix+1:n-1, iy1=iy+1<n?iy+1:n-1;
      double u=xx-ix, v=yy-iy;
      double p=(1-v)*((1-u)*prob[iy*n+ix]+u*prob[iy*n+ix1])
                    +v*((1-u)*prob[iy1*n+ix]+u*prob[iy1*n+ix1]);
      double cost=1-2*p, coefficient=(2*other-1)*direction*(family==0?1:-1);
      double scale=cost*coefficient/(quadrature*width*width);
      for (int k = 0; k < 4; ++k) {
        int id=edges[4*e+k];
        gradient[2*id] += scale*vy*basis[4*j+k];
        gradient[2*id+1] -= scale*vx*basis[4*j+k];
      }
    }
  }
}
