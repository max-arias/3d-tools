"""Lattice table lamp, built as separate printable pieces.

Run:  "C:/Program Files/FreeCAD 1.1/bin/python.exe" build_lamp.py [outdir]

Pieces (assembled coordinates, z up, mm):
  base_body    fluted cone, open at the bottom, socket-plate bosses inside
  base_plate   bottom cover, 4x M3, cord slot
  socket_plate E27 holder plate (M10 nipple), bayonet-notched, 3x M3
  shade_A      flange + plug into the base + neck (lattice starts here)
  shade_B      swelling middle, widest point
  shade_C      upper shade and rim
Shade pieces stack with a stepped spigot joint (0.2 mm clearance, glue or press).
"""
import math
import os
import sys

import FreeCAD as App
import Part
from FreeCAD import Vector as V

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

# ---- parameters -------------------------------------------------------------
BASE_H = 170.0
BASE_R0, BASE_R1 = 65.0, 42.0           # outer radius at bottom / top
BASE_WALL = 2.0                         # plus flute depth
FLUTES, FLUTE_AMP = 72, 0.45
RING_Z = 156.0                          # base top ring (plug seat) starts here
PLUG_R_OUT, PLUG_R_IN, PLUG_LEN = 32.0, 29.4, 14.0
SEAT_R = 32.3                           # recess in base ring, 0.3 clearance

SHADE_H = 250.0                         # above the flange underside
FLANGE_R, FLANGE_H = 40.0, 6.0
WALL = 1.6
RIB = 1.5
CELLS = 40                              # diamonds around
DZ = 7.0                                # row pitch
LATTICE_Z0, LATTICE_Z1 = 24.0, 244.0
SEAMS = (84.0, 168.0)
SPIGOT, COLLAR, CLR = 4.0, 3.0, 0.2
SPIGOT_T = 2.2

CTRL = [(6, 33.5), (14, 31.0), (28, 32.5), (45, 40.0), (65, 54.0), (90, 67.5),
        (123, 74.0), (155, 71.0), (190, 57.0), (220, 46.0), (250, 40.0)]


# ---- shade profile ----------------------------------------------------------
def _tangent(i):
    z0, r0 = CTRL[max(i - 1, 0)]
    z1, r1 = CTRL[min(i + 1, len(CTRL) - 1)]
    return (r1 - r0) / (z1 - z0)


def r_out(z):
    z = min(max(z, CTRL[0][0]), CTRL[-1][0])
    for i in range(len(CTRL) - 1):
        za, ra = CTRL[i]
        zb, rb = CTRL[i + 1]
        if za <= z <= zb:
            h = zb - za
            t = (z - za) / h
            ma, mb = _tangent(i) * h, _tangent(i + 1) * h
            h00, h10 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t
            h01, h11 = -2 * t**3 + 3 * t**2, t**3 - t**2
            return h00 * ra + h10 * ma + h01 * rb + h11 * mb
    return CTRL[-1][1]


def slope(z):
    return (r_out(z + 0.25) - r_out(z - 0.25)) / 0.5


def r_in(z):
    if z < PLUG_R_IN_Z:
        return PLUG_R_IN
    return r_out(z) - WALL * math.sqrt(1 + slope(z) ** 2)


PLUG_R_IN_Z = 14.0


def frange(a, b, step):
    n = max(1, int(math.ceil(abs(b - a) / step)))
    return [a + (b - a) * i / n for i in range(n + 1)]


def revolve(pts):
    pts = [V(r, 0, z) for r, z in pts]
    pts.append(pts[0])
    face = Part.Face(Part.makePolygon(pts))
    return face.revolve(V(0, 0, 0), V(0, 0, 1), 360)


# ---- shade pieces -----------------------------------------------------------
def wall_polygon(lo, hi):
    """(r, z) outline of the plain wall of one piece (no joint rings)."""
    top = hi if hi is not None else SHADE_H
    step = 2.0
    if lo is None:
        out = [(PLUG_R_IN, -PLUG_LEN), (PLUG_R_OUT, -PLUG_LEN), (PLUG_R_OUT, 0),
               (FLANGE_R, 0), (FLANGE_R, FLANGE_H), (r_out(FLANGE_H), FLANGE_H)]
        start, tail = FLANGE_H, [(PLUG_R_IN, FLANGE_H)]
    else:
        out = [(r_in(lo), lo), (r_out(lo), lo)]
        start, tail = lo, []
    out += [(r_out(z), z) for z in frange(start, top, step)[1:]]
    out.append((r_in(top), top))
    inn = [(r_in(z), z) for z in frange(top, start, step)[1:-1]]
    return out + inn + tail


def ring_polygon(hi):
    """Collar under the seam plus the spigot above it, kept clear of the lattice cuts."""
    out = [(r_in(z) + 0.3, z) for z in frange(hi - COLLAR, hi, 1.0)]
    out += [(r_in(z) - CLR, z) for z in frange(hi, hi + SPIGOT, 1.0)]
    out += [(r_in(z) - CLR - SPIGOT_T, z) for z in frange(hi + SPIGOT, hi - COLLAR, 1.0)]
    return out


def build_shade_piece(lo, hi):
    body = revolve(wall_polygon(lo, hi))
    zlo = LATTICE_Z0 if lo is None else lo
    zhi = hi if hi is not None else SHADE_H
    cells = []
    n = 0
    z = 0.0
    while z < LATTICE_Z1 + DZ:
        zc, row = z, n
        z += DZ
        n += 1
        rm = (r_out(zc) + r_in(max(zc, 14.0))) / 2
        a = math.pi * rm / CELLS
        L = math.hypot(a, DZ)
        f = max(1 - RIB * L / (2 * a * DZ), 0.35)
        bz = f * DZ
        if zc - bz < LATTICE_Z0 or zc + bz > LATTICE_Z1:
            continue
        if min(zc + bz, zhi) - max(zc - bz, zlo) < 1.0:     # no slivers at the seam
            continue
        h = abs(slope(zc)) * bz + 3.5
        poly = [V(rm - h, f * a, zc), V(rm - h, 0, zc + bz),
                V(rm - h, -f * a, zc), V(rm - h, 0, zc - bz)]
        prism = Part.Face(Part.makePolygon(poly + [poly[0]])).extrude(V(2 * h, 0, 0))
        for m in range(CELLS):
            c = prism.copy()
            c.rotate(V(0, 0, 0), V(0, 0, 1), 360.0 / CELLS * (m + 0.5 * (row & 1)))
            cells.append(c)
    if cells:
        body = body.cut(Part.makeCompound(cells))
    if hi is not None:
        body = body.fuse(revolve(ring_polygon(hi)))
    return body.removeSplitter()


# ---- base ---------------------------------------------------------------------
def base_r(z):
    return BASE_R0 + (BASE_R1 - BASE_R0) * z / BASE_H


def flute_wire(z):
    r = base_r(z)
    pts = []
    n = FLUTES * 2
    for i in range(n):
        ang = 2 * math.pi * i / n
        rr = r + (FLUTE_AMP if i % 2 == 0 else -FLUTE_AMP)
        pts.append(V(rr * math.cos(ang), rr * math.sin(ang), z))
    pts.append(pts[0])
    return Part.makePolygon(pts)


def cyl(r, h, x=0, y=0, z=0):
    return Part.makeCylinder(r, h, V(x, y, z), V(0, 0, 1))


def polar(r, deg):
    return r * math.cos(math.radians(deg)), r * math.sin(math.radians(deg))


def inner_r(z):
    return base_r(z) - FLUTE_AMP - BASE_WALL


BOLT_BOTTOM = [45, 135, 225, 315]
BOSS_Z = (126.0, 140.0)
BOSS_ANG = [90, 210, 330]
BOSS_R = 40.0
PLATE_Z, PLATE_T = 140.0, 4.0


def build_base_body():
    solid = Part.makeLoft([flute_wire(0), flute_wire(BASE_H)], True, True)
    cavity_pts = [(0, -0.1), (inner_r(0) + 0.0, -0.1)] + \
                 [(inner_r(z), z) for z in frange(0, 147, 10)] + \
                 [(SEAT_R, RING_Z), (SEAT_R, BASE_H + 0.1), (0, BASE_H + 0.1)]
    solid = solid.cut(revolve(cavity_pts))
    for a in BOLT_BOTTOM:
        x, y = polar(58.0, a)
        solid = solid.fuse(cyl(4.5, 10, x, y, 4.0)).cut(cyl(1.3, 9, x, y, 5.0))
    for a in BOSS_ANG:
        x, y = polar(BOSS_R, a)
        solid = solid.fuse(cyl(4.5, BOSS_Z[1] - BOSS_Z[0], x, y, BOSS_Z[0]))
    # bosses must not poke through the outer skin
    solid = solid.common(Part.makeLoft([flute_wire(0), flute_wire(BASE_H)], True, True))
    for a in BOSS_ANG:
        x, y = polar(BOSS_R, a)
        solid = solid.cut(cyl(1.3, 12, x, y, BOSS_Z[1] - 12))
    solid = solid.cut(Part.makeBox(30, 7, 5, V(45, -3.5, -0.01)))        # cord slot
    return solid.removeSplitter()


def build_base_plate():
    r = inner_r(PLATE_T) - 0.3
    plate = cyl(r, PLATE_T)
    for a in BOLT_BOTTOM:
        x, y = polar(58.0, a)
        plate = plate.cut(cyl(1.7, PLATE_T, x, y)).cut(cyl(3.2, 1.6, x, y, PLATE_T - 1.6))
    plate = plate.cut(Part.makeBox(30, 7, PLATE_T + 1, V(r - 12, -3.5, -0.5)))
    return plate


def build_socket_plate():
    r = inner_r(PLATE_Z + PLATE_T) - 0.5
    plate = cyl(r, PLATE_T)
    plate = plate.cut(cyl(5.2, PLATE_T))                      # M10 nipple
    for a in BOSS_ANG:
        x, y = polar(BOSS_R, a)
        plate = plate.cut(cyl(1.7, PLATE_T, x, y))            # screw holes
        # bayonet notch: insert with the plate turned +60 deg so bosses pass, turn back to lock
        nx, ny = polar(BOSS_R, a - 60)
        plate = plate.cut(cyl(5.4, PLATE_T + 1, nx, ny, -0.5))
    return plate


# ---- assemble -----------------------------------------------------------------
def moved(shape, dz=0.0, rot=0.0):
    s = shape.copy()
    s.rotate(V(0, 0, 0), V(0, 0, 1), rot)
    s.translate(V(0, 0, dz))
    return s


def main():
    seam1, seam2 = SEAMS
    parts = {
        "base_body": (build_base_body(), 0.0, (0.82, 0.82, 0.8)),
        "base_plate": (build_base_plate(), 0.0, (0.6, 0.6, 0.6)),
        "socket_plate": (build_socket_plate(), PLATE_Z, (0.45, 0.45, 0.5)),
        "shade_A": (build_shade_piece(None, seam1), BASE_H, (0.98, 0.9, 0.7)),
        "shade_B": (build_shade_piece(seam1, seam2), BASE_H, (0.98, 0.85, 0.6)),
        "shade_C": (build_shade_piece(seam2, None), BASE_H, (0.98, 0.9, 0.7)),
    }
    doc = App.newDocument("LatticeLamp")
    for name, (shape, dz, color) in parts.items():
        obj = doc.addObject("Part::Feature", name)
        obj.Shape = moved(shape, dz)
        if hasattr(obj, "ViewObject") and obj.ViewObject:
            obj.ViewObject.ShapeColor = color
    doc.recompute()
    os.makedirs(OUT, exist_ok=True)
    doc.saveAs(os.path.join(OUT, "lattice_lamp.FCStd"))

    import Mesh
    stl_dir = os.path.join(OUT, "stl")
    os.makedirs(stl_dir, exist_ok=True)
    for name, (shape, dz, _) in parts.items():
        s = shape.copy()
        s.translate(V(0, 0, -s.BoundBox.ZMin))          # print orientation: as built, on the bed
        m = Mesh.Mesh(s.tessellate(0.05))
        m.write(os.path.join(stl_dir, name + ".stl"))
        bb = s.BoundBox
        print(f"{name:13s} valid={s.isValid()} vol={s.Volume/1000:8.1f} cm3 "
              f"size={bb.XLength:6.1f} x {bb.YLength:6.1f} x {bb.ZLength:6.1f}")
    # assembled bounding box and interference check
    full = [moved(s, dz) for s, dz, _ in parts.values()]
    top = max(f.BoundBox.ZMax for f in full)
    wide = max(f.BoundBox.XLength for f in full)
    print(f"assembled height {top:.1f} mm, max width {wide:.1f} mm")
    names = list(parts)
    for i in range(len(full)):
        for j in range(i + 1, len(full)):
            v = full[i].common(full[j]).Volume
            if v > 1.0:
                print(f"INTERFERENCE {names[i]} / {names[j]}: {v:.1f} mm3")


main()
