/* Continuous boundary gradient, with the same sampled polygons and quadrature
 * as boundary.js. Freestanding WebAssembly: no libc, imports or fast-math. */
static double clamp(double x, double lo, double hi) {
  return x < lo ? lo : x > hi ? hi : x;
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
