import re, math

COMMANDS = set("AaCcHhLlMmQqSsTtVvZz")
PARAMS = {'M':2,'L':2,'H':1,'V':1,'C':6,'S':4,'Q':4,'T':2,'A':7,'Z':0}

def _tokenize(d: str):
    for m in re.finditer(r'[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?', d):
        yield m.group()

def _parse(d: str):
    toks = list(_tokenize(d))
    segs, i, cmd = [], 0, None
    while i < len(toks):
        t = toks[i]
        if t in COMMANDS:
            cmd = t
            i += 1
        elif cmd is None:
            raise ValueError("Path must start with a command")
        n = PARAMS[cmd.upper()]
        if n == 0:
            segs.append((cmd, []))
            continue
        while i < len(toks) and toks[i] not in COMMANDS:
            if i + n > len(toks):
                raise ValueError("Incomplete parameter set")
            params = list(map(float, toks[i:i+n]))
            segs.append((cmd, params))
            i += n
            if cmd in "Mm":  # extra moveto pairs become lineto
                cmd = "L" if cmd == "M" else "l"
                n = PARAMS["L"]
    return segs

def _line_cubic(x0,y0,x1,y1):
    return (x0+(x1-x0)/3, y0+(y1-y0)/3,
            x0+2*(x1-x0)/3, y0+2*(y1-y0)/3,
            x1,y1)

def _quad_cubic(x0,y0,qx,qy,x1,y1):
    c1x = x0 + 2/3*(qx - x0)
    c1y = y0 + 2/3*(qy - y0)
    c2x = x1 + 2/3*(qx - x1)
    c2y = y1 + 2/3*(qy - y1)
    return (c1x,c1y,c2x,c2y,x1,y1)

def _arc_to_cubics(x1,y1, rx,ry, phi_deg, large_arc, sweep, x2,y2):
    if rx == 0 or ry == 0:
        return [_line_cubic(x1,y1,x2,y2)]

    rx, ry = abs(rx), abs(ry)
    phi = math.radians(phi_deg % 360.0)
    cosphi, sinphi = math.cos(phi), math.sin(phi)

    dx, dy = (x1 - x2)/2.0, (y1 - y2)/2.0
    x1p = cosphi*dx + sinphi*dy
    y1p = -sinphi*dx + cosphi*dy

    lam = (x1p*x1p)/(rx*rx) + (y1p*y1p)/(ry*ry)
    if lam > 1:
        s = math.sqrt(lam)
        rx *= s
        ry *= s

    rx2, ry2 = rx*rx, ry*ry
    x1p2, y1p2 = x1p*x1p, y1p*y1p
    num = rx2*ry2 - rx2*y1p2 - ry2*x1p2
    den = rx2*y1p2 + ry2*x1p2
    if den == 0:
        return [_line_cubic(x1,y1,x2,y2)]

    sq = max(0.0, num/den)
    coef = math.sqrt(sq)
    if bool(large_arc) == bool(sweep):
        coef = -coef

    cxp = coef * (rx*y1p)/ry
    cyp = coef * (-ry*x1p)/rx

    cx = cosphi*cxp - sinphi*cyp + (x1+x2)/2.0
    cy = sinphi*cxp + cosphi*cyp + (y1+y2)/2.0

    def vec_angle(ux,uy,vx,vy):
        return math.atan2(ux*vy - uy*vx, ux*vx + uy*vy)

    v1x = (x1p - cxp)/rx
    v1y = (y1p - cyp)/ry
    v2x = (-x1p - cxp)/rx
    v2y = (-y1p - cyp)/ry

    theta1 = math.atan2(v1y, v1x)
    delta = vec_angle(v1x,v1y,v2x,v2y)
    if not sweep and delta > 0: delta -= 2*math.pi
    if sweep and delta < 0:     delta += 2*math.pi

    segs = max(1, int(math.ceil(abs(delta)/(math.pi/2))))
    delta_seg = delta / segs

    def point(t):
        ct, st = math.cos(t), math.sin(t)
        return (
            cx + rx*cosphi*ct - ry*sinphi*st,
            cy + rx*sinphi*ct + ry*cosphi*st
        )

    def deriv(t):
        ct, st = math.cos(t), math.sin(t)
        return (
            -rx*cosphi*st - ry*sinphi*ct,
            -rx*sinphi*st + ry*cosphi*ct
        )

    cubics = []
    for i in range(segs):
        t1 = theta1 + i*delta_seg
        t2 = t1 + delta_seg
        p0 = point(t1)
        p3 = point(t2)
        d1 = deriv(t1)
        d2 = deriv(t2)
        k = 4/3 * math.tan((t2 - t1)/4)
        c1 = (p0[0] + k*d1[0], p0[1] + k*d1[1])
        c2 = (p3[0] - k*d2[0], p3[1] - k*d2[1])
        cubics.append((c1[0],c1[1],c2[0],c2[1],p3[0],p3[1]))
    return cubics

def d_to_abs_cubic_subpaths(d: str):
    segs = _parse(d)
    subpaths = []
    cx = cy = 0.0
    sx = sy = 0.0
    prev_c2 = None
    prev_q  = None
    prev_cmd = None
    cur = None  # current subpath: [('M',(x,y)), ('C',(....)), ...]

    for cmd, p in segs:
        rel = cmd.islower()
        C = cmd.upper()

        if C == "M":
            x,y = p
            if rel: x += cx; y += cy
            cx,cy = x,y
            sx,sy = x,y
            prev_c2 = prev_q = None
            prev_cmd = "M"
            if cur is not None:
                subpaths.append(cur)
            cur = [("M",(x,y))]
            continue

        if cur is None:
            cur = [("M",(cx,cy))]
            sx,sy = cx,cy

        x0,y0 = cx,cy

        if C == "Z":
            cur.append(("C", _line_cubic(x0,y0,sx,sy)))
            cx,cy = sx,sy
            prev_c2 = prev_q = None
            prev_cmd = "Z"
            continue

        if C == "L":
            x,y = p
            if rel: x += cx; y += cy
            cur.append(("C", _line_cubic(x0,y0,x,y)))
            cx,cy = x,y
            prev_c2 = prev_q = None
            prev_cmd = "L"
            continue

        if C == "H":
            (x,) = p
            if rel: x += cx
            cur.append(("C", _line_cubic(x0,y0,x,cy)))
            cx = x
            prev_c2 = prev_q = None
            prev_cmd = "H"
            continue

        if C == "V":
            (y,) = p
            if rel: y += cy
            cur.append(("C", _line_cubic(x0,y0,cx,y)))
            cy = y
            prev_c2 = prev_q = None
            prev_cmd = "V"
            continue

        if C == "C":
            x1,y1,x2,y2,x,y = p
            if rel:
                x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy
            cur.append(("C",(x1,y1,x2,y2,x,y)))
            cx,cy = x,y
            prev_c2 = (x2,y2)
            prev_q = None
            prev_cmd = "C"
            continue

        if C == "S":
            x2,y2,x,y = p
            if rel:
                x2 += cx; y2 += cy; x += cx; y += cy
            if prev_cmd in ("C","S") and prev_c2 is not None:
                x1 = 2*cx - prev_c2[0]
                y1 = 2*cy - prev_c2[1]
            else:
                x1,y1 = cx,cy
            cur.append(("C",(x1,y1,x2,y2,x,y)))
            cx,cy = x,y
            prev_c2 = (x2,y2)
            prev_q = None
            prev_cmd = "S"
            continue

        if C == "Q":
            qx,qy,x,y = p
            if rel:
                qx += cx; qy += cy; x += cx; y += cy
            cur.append(("C", _quad_cubic(x0,y0,qx,qy,x,y)))
            cx,cy = x,y
            prev_q = (qx,qy)
            prev_c2 = None
            prev_cmd = "Q"
            continue

        if C == "T":
            x,y = p
            if rel: x += cx; y += cy
            if prev_cmd in ("Q","T") and prev_q is not None:
                qx = 2*cx - prev_q[0]
                qy = 2*cy - prev_q[1]
            else:
                qx,qy = cx,cy
            cur.append(("C", _quad_cubic(x0,y0,qx,qy,x,y)))
            cx,cy = x,y
            prev_q = (qx,qy)
            prev_c2 = None
            prev_cmd = "T"
            continue

        if C == "A":
            rx,ry,phi,large,sweep,x,y = p
            if rel: x += cx; y += cy
            for cseg in _arc_to_cubics(x0,y0,rx,ry,phi, int(large)!=0, int(sweep)!=0, x,y):
                cur.append(("C", cseg))
                prev_c2 = (cseg[2], cseg[3])
                prev_cmd = "C"
            cx,cy = x,y
            prev_q = None
            continue

        raise ValueError(f"Unsupported command: {cmd}")

    if cur is not None:
        subpaths.append(cur)
    return subpaths

def format_mc(subpath, precision=6):
    def fmt(n):
        s = f"{n:.{precision}f}".rstrip("0").rstrip(".")
        return "0" if s == "-0" else s
    parts = []
    for cmd, vals in subpath:
        if cmd == "M":
            x,y = vals
            parts.append(f"M {fmt(x)} {fmt(y)}")
        else:  # "C"
            x1,y1,x2,y2,x,y = vals
            parts.append(f"C {fmt(x1)} {fmt(y1)} {fmt(x2)} {fmt(y2)} {fmt(x)} {fmt(y)}")
    return " ".join(parts)

def merge_subpaths_with_connectors(subpaths):
    if not subpaths:
        return []
    merged = [subpaths[0][0]] + subpaths[0][1:]  # keep only first M

    def end_point(path):
        for cmd, vals in reversed(path):
            if cmd == "C": return (vals[4], vals[5])
            if cmd == "M": return vals
        return (0.0, 0.0)

    cur_end = end_point(subpaths[0])
    for sp in subpaths[1:]:
        start = sp[0][1]
        merged.append(("C", _line_cubic(cur_end[0],cur_end[1], start[0],start[1])))
        merged += sp[1:]
        cur_end = end_point(sp)
    return merged

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python convert_path.py '<path data>'")
        sys.exit(1)
    d = sys.argv[1]
    subpaths = d_to_abs_cubic_subpaths(d)
    merged = merge_subpaths_with_connectors(subpaths)
    result = format_mc(merged)
    print(result)

