"""Saltback drain node, Rev A: full CAD model in CadQuery.

    pip install cadquery trimesh
    python device/cad/saltback_node.py          (run from the saltback folder; about a minute)

Builds every part as a solid at real size (mm), places it in the assembly, and writes to device/out/:
    step/SB-xxx_name.step   one STEP per part (opens in Fusion 360, SolidWorks, Onshape, FreeCAD, Ansys, COMSOL)
    stl/SB-xxx_name.stl     one STL per part (printed parts in print orientation; for slicers and mesh tools)
    saltback-node.step      the whole assembly with part names and colours
    saltback-node.glb       the whole assembly for Blender, three.js and web viewers (glTF 2.0 binary)
    parts.json              part list: numbers, materials, sizes, volume, mass, buy links, explode directions
Then device/cad/check_exports.py re-opens every file and checks it.

Purchased parts (boards, probes, glands) are simplified to their outside shape and mounting features from the
datasheets linked in parts.json, which is what a fit check or a thermal/flow simulation needs. Printed parts are
the real design.
"""
import json
from pathlib import Path

import cadquery as cq
from cadquery import Vector as V

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
SEG_TOL, ANG_TOL = 0.05, 0.15            # STL quality (mm, rad)
GLB_TOL, GLB_ANG = 0.15, 0.35            # lighter mesh for the web viewer

# ------------------------------------------------------------------ key sizes
W, D, H = 150.0, 100.0, 70.0             # electronics box, outside (x, y, z); front of the box is -y
WALL, FLOOR, R_V, R_B = 3.2, 3.0, 10.0, 3.0
LID_T = 5.0
BOSS_R, BOSS_AT = 4.5, (W / 2 - WALL - 4.5, D / 2 - WALL - 4.5)
INSERT_D, INSERT_DEPTH = 4.0, 6.0        # M3 heat-set inserts
GROOVE_W, GROOVE_D = 1.6, 1.2            # gasket groove in the rim
GLAND_X, GLAND_Y, GLAND_HOLE = (-35.0, 0.0, 35.0), 34.0, 12.5
VENT_AT, VENT_HOLE = (55.0, -32.0), 12.2
POST_AT, POST_H = (60.5, 35.0), 32.0     # tray posts (tray sits at z = FLOOR + POST_H)
TRAY_T = 2.5
TRAY_Z = FLOOR + POST_H
EAR = dict(w=18.0, t=5.0, h=30.0, slot_w=5.5, slot_l=10.0)
EAR_Z = H - 6 - EAR["h"] / 2
PIPE_OD, PIPE_ID, PIPE_L = 48.26, 40.9, 250.0   # 1-1/2" schedule 40 PVC
HEAD_TOP = -250.0                        # top of the guard tube, 250 mm below the box
PROBE_HOLE_D, TEMP_HOLE_D = 12.6, 6.6
P_EC1, P_EC10, P_TEMP, P_TETHER = (-9.5, -4.0), (9.5, -4.0), (0.0, 11.0), (0.0, -15.0)


def wp(plane="XY"):
    return cq.Workplane(plane)


def rbox(w, d, h, r, z=0.0):
    return wp().box(w, d, h, centered=(True, True, False)).edges("|Z").fillet(r).translate((0, 0, z))


def cyl(r, h, x=0.0, y=0.0, z=0.0):
    return wp().circle(r).extrude(h).translate((x, y, z))


def corners(ax, ay):
    return [(sx * ax, sy * ay) for sx in (-1, 1) for sy in (-1, 1)]


# ================================================================== SB-100 housing (printed)
def enclosure_body():
    b = wp().box(W, D, H, centered=(True, True, False)).edges("|Z").fillet(R_V).faces("<Z").edges().fillet(R_B)
    b = b.faces(">Z").shell(-WALL)
    for x, y in corners(*BOSS_AT):                       # lid screw bosses with heat-set insert holes
        b = b.union(cyl(BOSS_R, H - FLOOR - 0.5, x, y, FLOOR))
        b = b.cut(cyl(INSERT_D / 2, INSERT_DEPTH + 0.5, x, y, H - INSERT_DEPTH - 0.5))
    for x, y in corners(*POST_AT):                       # posts for the electronics tray
        b = b.union(cyl(3.5, POST_H, x, y, FLOOR))
        b = b.cut(cyl(INSERT_D / 2, INSERT_DEPTH, x, y, FLOOR + POST_H - INSERT_DEPTH + 0.01))
    # gasket groove around the rim, centred in the wall
    o, i = rbox(W - WALL + GROOVE_W, D - WALL + GROOVE_W, GROOVE_D, R_V - WALL / 2 + GROOVE_W / 2, H - GROOVE_D), \
        rbox(W - WALL - GROOVE_W, D - WALL - GROOVE_W, GROOVE_D + 0.1, R_V - WALL / 2 - GROOVE_W / 2, H - GROOVE_D)
    b = b.cut(o.cut(i))
    for x in GLAND_X:                                    # PG7 cable glands
        b = b.cut(cyl(GLAND_HOLE / 2, FLOOR + 2, x, GLAND_Y, -1))
    b = b.cut(cyl(VENT_HOLE / 2, FLOOR + 2, VENT_AT[0], VENT_AT[1], -1))   # M12 pressure vent
    # mounting ears, flush with the back face (+y), with vertical adjustment slots for M5 bolts
    for s in (-1, 1):
        ear = wp().box(EAR["w"], EAR["t"], EAR["h"]).edges("|Y").fillet(3)
        ear = ear.translate((s * (W / 2 + EAR["w"] / 2 - 2), D / 2 - EAR["t"] / 2, EAR_Z))
        slot = wp("XZ").slot2D(EAR["slot_l"] + EAR["slot_w"], EAR["slot_w"], 90).extrude(-EAR["t"] - 2)
        slot = slot.translate((s * (W / 2 + EAR["w"] / 2 - 1), D / 2 - EAR["t"] - 1, EAR_Z))
        b = b.union(ear).cut(slot)
    # label recess on the front face, and the name in it
    b = b.cut(wp("XZ").center(0, 44).rect(78, 16).extrude(0.6).translate((0, -D / 2 + 0.6, 0)).edges("|Y").fillet(2))
    try:
        txt = wp("XZ").center(0, 44).text("SALTBACK", 8.5, 0.9, font="DejaVu Sans", kind="bold", halign="center", valign="center")
        b = b.union(txt.translate((0, -D / 2 + 0.6, 0)))   # stands 0.3 mm proud of the face
    except Exception:
        pass
    return b


def enclosure_lid():
    """Assembly orientation: plate on top, tongue pointing down into the gasket groove."""
    lid = rbox(W, D, LID_T, R_V).faces(">Z").edges().fillet(1.6)
    tongue = rbox(W - WALL + 1.0, D - WALL + 1.0, 1.0, R_V - WALL / 2 + 0.5, -1.0).cut(
        rbox(W - WALL - 1.0, D - WALL - 1.0, 1.2, R_V - WALL / 2 - 0.5, -1.1))
    lid = lid.union(tongue)
    for x, y in corners(*BOSS_AT):
        csk = wp().circle(3.4).workplane(offset=-1.8).circle(1.7).loft().translate((x, y, LID_T + 0.01))
        lid = lid.cut(cyl(1.7, LID_T + 3, x, y, -2)).cut(csk)
    # shallow pocket underneath for the flat LTE antenna, and a fine chamfer line on top
    lid = lid.cut(rbox(92, 24, 0.8, 2, 0).translate((0, 18, 0)))
    lid = lid.cut(rbox(W - 24, D - 24, 0.4, R_V - 6, LID_T - 0.4).cut(rbox(W - 25.6, D - 25.6, 0.5, R_V - 6.8, LID_T - 0.45)))
    return lid


def lid_gasket():
    o = rbox(W - WALL + GROOVE_W - 0.3, D - WALL + GROOVE_W - 0.3, 2.0, R_V - WALL / 2 + GROOVE_W / 2 - 0.15)
    i = rbox(W - WALL - GROOVE_W + 0.3, D - WALL - GROOVE_W + 0.3, 2.1, R_V - WALL / 2 - GROOVE_W / 2 + 0.15, -0.05)
    return o.cut(i)


def cable_gland():
    g = wp().polygon(6, 19 / 0.866).extrude(6)                    # outer hex body (sits under the floor)
    g = g.union(cyl(6.2, 6, z=6))                                 # thread through the wall
    g = g.union(wp().polygon(6, 19 / 0.866).extrude(5).translate((0, 0, 6 + FLOOR + 0.2)))   # locknut inside
    g = g.union(wp().circle(7.5).workplane(offset=-10).circle(5.2).loft().translate((0, 0, 0)))   # dome cap below
    return g.cut(cyl(3.0, 40, z=-15))


def pressure_vent():
    v = cyl(8.0, 6.5, z=-6.5).faces("<Z").edges().fillet(2)
    v = v.union(cyl(6.0, FLOOR + 0.5)).union(wp().polygon(6, 17 / 0.866).extrude(3).translate((0, 0, FLOOR + 0.5)))
    return v


def lid_screw():
    s = wp().circle(3.0).workplane(offset=-1.7).circle(1.5).loft()     # countersunk head (top at z = 0)
    s = s.cut(wp().rect(3, 0.6).extrude(1).translate((0, 0, -0.8)))
    return s.union(cyl(1.5, 10.3, z=-12))


def desiccant():
    return rbox(40, 28, 6, 3).edges(">Z").fillet(2)


# ================================================================== SB-200 electronics
def tray():
    t = rbox(128, 78, TRAY_T, 5)
    for x, y in corners(*POST_AT):
        t = t.cut(cyl(1.7, 5, x, y, -1))
    t = t.cut(wp().pushPoints([(-22, 0), (22, 0)]).slot2D(36, 6).extrude(5).translate((0, 0, -1)))   # cable passes
    for (cx, cy, bw, bd, holes) in BOARDS:           # standoffs under every board's mounting holes
        for hx, hy in holes:
            t = t.union(cyl(2.6, 4, cx + hx, cy + hy, TRAY_T)).cut(cyl(1.25, 6, cx + hx, cy + hy, TRAY_T - 1))
    return t


def pcb(w, d, color_parts):
    p = rbox(w, d, 1.6, 1.0)
    for part in color_parts:
        p = p.union(part)
    return p


def header(n, pitch=2.54):
    return wp().box(n * pitch, 2.5, 2.5, centered=(True, True, False))


def esp32_devkit():
    # ESP32-DevKitC-32E: 48.2 x 27.9 mm PCB, WROOM-32E module overhangs to 54.4 mm total
    p = rbox(48.2, 27.9, 1.6, 0.8).translate((-3.1, 0, 0))
    p = p.union(wp().box(18, 25.5, 0.8, centered=(True, True, False)).translate((16.2, 0, 1.6)))   # module PCB
    p = p.union(wp().box(15.5, 17.5, 2.4, centered=(True, True, False)).translate((12.0, 0, 2.4)))  # RF shield
    p = p.union(wp().box(8, 7.5, 3.2, centered=(True, True, False)).translate((-24.5, 0, 1.6)))      # USB connector
    p = p.union(header(19).translate((-3.1, 12.7, -2.5))).union(header(19).translate((-3.1, -12.7, -2.5)))
    return p


def modem_hat():
    # Waveshare SIM7080G Cat-M/NB-IoT HAT: 65 x 30.2 mm
    p = rbox(65, 30.2, 1.6, 1.5)
    p = p.union(wp().box(17.6, 15.7, 2.3, centered=(True, True, False)).translate((-6, 0, 1.6)))   # SIM7080G module
    p = p.union(wp().box(16, 14.5, 1.6, centered=(True, True, False)).translate((20, -4, 1.6)))   # nano SIM holder
    p = p.union(cyl(1.6, 1.6, -26, 9, 1.6)).union(cyl(1.6, 1.6, -26, -9, 1.6))                   # u.FL antenna jacks
    p = p.union(header(20).translate((0, 13.2, -2.5)))
    return p


def ec_board():
    # DFRobot Gravity EC signal board: 42 x 32 mm, BNC socket for the probe
    p = rbox(42, 32, 1.6, 2)
    p = p.union(wp().box(14, 14, 10, centered=(True, True, False)).translate((-11, 0, 1.6)))     # BNC body
    p = p.union(cyl(4.8, 9, z=0).rotate((0, 0, 0), (0, 1, 0), -90).translate((-18, 0, 6.6)))    # BNC barrel
    p = p.union(wp().box(8, 6, 6, centered=(True, True, False)).translate((15, 0, 1.6)))        # PH2.0 connector
    p = p.union(wp().box(5, 5, 1.2, centered=(True, True, False)).translate((4, 6, 1.6)))
    return p


def rtc_board():
    # Adafruit DS3231 #3013: 23 x 17.6 mm, CR1220 holder on the back (shown on top here)
    p = rbox(23, 17.6, 1.6, 1.5)
    return p.union(cyl(6.6, 3.2, 3, 0, 1.6)).union(wp().box(7.5, 10.3, 1.4, centered=(True, True, False)).translate((-6.5, 0, 1.6)))


def sd_board():
    # Adafruit microSD breakout+ #254: 31.85 x 25.4 mm
    p = rbox(31.85, 25.4, 1.6, 1.5)
    return p.union(wp().box(14.5, 15.2, 1.9, centered=(True, True, False)).translate((6, 0, 1.6))).union(
        header(9).rotate((0, 0, 0), (0, 0, 1), 90).translate((-14, 0, -2.5)))


def flat_antenna():
    return rbox(90, 22, 0.6, 2)


def coin_cell():
    return cyl(6.2, 2.0)


# board placement on the tray (centre x, y; size; mounting holes relative to centre)
BOARDS = [
    (-29.5, 22.0, 65.0, 30.2, [(-29.5, -12.1), (29.5, -12.1)]),          # modem HAT
    (31.2, 22.0, 54.4, 27.9, [(-25.5, -11.0), (19.0, -11.0)]),           # ESP32-DevKitC (standoff pads)
    (-41.0, -21.0, 42.0, 32.0, [(-18, -13), (18, -13), (-18, 13), (18, 13)]),   # EC board, standard probe
    (3.0, -21.0, 42.0, 32.0, [(-18, -13), (18, -13), (-18, 13), (18, 13)]),     # EC board, high-range probe
    (38.5, -29.0, 23.0, 17.6, [(-8.9, -6.2), (8.9, 6.2)]),              # RTC
    (44.0, -6.0, 31.85, 25.4, [(-13.3, -10.0), (13.3, 10.0)]),          # microSD
]
BOARD_Z = TRAY_Z + TRAY_T + 4.0


# ================================================================== SB-300 power
CELL_Y = (-32.0, -10.0, 12.0)


def battery_sled():
    s = rbox(84, 72, 2.5, 4).translate((0, -10, 0))
    for y in CELL_Y:                                                   # low rails that locate each holder
        for dx in (-40.5, 40.5):
            s = s.union(wp().box(2.0, 21.5, 5, centered=(True, True, False)).translate((dx, y, 2.5)))
    for x in (-25, 25):                                                # zip-tie slots
        s = s.cut(wp().box(3.2, 70, 5, centered=(True, True, False)).translate((x, -10, -1)).cut(
            wp().box(4, 64, 6, centered=(True, True, False)).translate((x, -10, -2))))
        s = s.cut(wp().pushPoints([(x, -44), (x, 24)]).rect(3.2, 5).extrude(5).translate((0, 0, -1)))
    return s


def keystone_1043():
    # Keystone 1043 single 18650 holder, about 77 x 21 x 20 mm, open top
    h = wp().box(77, 21, 18, centered=(True, True, False)).edges("|Z").fillet(1.5)
    h = h.cut(cyl(9.6, 70, z=0).rotate((0, 0, 0), (0, 1, 0), 90).translate((-35, 0, 12)))
    h = h.cut(wp().box(70, 12, 10, centered=(True, True, False)).translate((0, 0, 12)))
    return h


def cell_18650():
    c = cyl(9.25, 65, z=0).rotate((0, 0, 0), (0, 1, 0), 90).translate((-32.5, 0, 0))
    return c.union(cyl(3.5, 1.2).rotate((0, 0, 0), (0, 1, 0), 90).translate((32.5, 0, 0)))


# ================================================================== SB-400 probe guard
def probe_head():
    h = cyl(PIPE_ID / 2 - 0.15, 18).union(cyl(27.0, 4, z=18)).faces(">Z").edges().fillet(1.2)
    for (x, y), d in ((P_EC1, PROBE_HOLE_D), (P_EC10, PROBE_HOLE_D)):
        h = h.union(cyl(d / 2 + 3, 12, x, y, 22))                        # strain-relief collars
    h = h.union(cyl(TEMP_HOLE_D / 2 + 2.6, 10, P_TEMP[0], P_TEMP[1], 22))
    h = h.union(wp("XZ").center(P_TETHER[0], 28).rect(10, 12).extrude(2.5).translate((0, P_TETHER[1] + 1.25, 0)).edges("|Y").fillet(4))
    h = h.cut(wp("XZ").center(P_TETHER[0], 29).circle(2.2).extrude(5).translate((0, P_TETHER[1] + 2.5, 0)))
    for (x, y), d in ((P_EC1, PROBE_HOLE_D), (P_EC10, PROBE_HOLE_D), (P_TEMP, TEMP_HOLE_D)):
        h = h.cut(cyl(d / 2, 60, x, y, -5))
        h = h.cut(cyl(d / 2 + 3.5, 2.5, x, y, 27.5).cut(cyl(d / 2 + 2.2, 3, x, y, 27.3)))   # zip-tie grooves
    h = h.cut(cyl(1.6, 30, 15, -6, -5)).cut(cyl(1.6, 30, -15, -6, -5))   # air bleed holes
    return h


def guard_tube():
    t = cyl(PIPE_OD / 2, PIPE_L).cut(cyl(PIPE_ID / 2, PIPE_L + 2, z=-1))
    import math
    for row in range(9):
        z = 30 + row * 22
        for k in range(6):
            a = math.radians(k * 60 + (30 if row % 2 else 0))
            hole = cyl(4.0, 20).rotate((0, 0, 0), (0, 1, 0), 90).translate((PIPE_OD / 2 - 6, 0, z)).rotate((0, 0, 0), (0, 0, 1), math.degrees(a))
            t = t.cut(hole)
    return t


def silt_cap():
    import math
    c = cyl(PIPE_OD / 2 + 3.2, 26).cut(cyl(PIPE_OD / 2 + 0.25, 26, z=3))
    c = c.faces("<Z").edges().fillet(2)
    for k in range(6):
        c = c.cut(wp().slot2D(16, 3.2, k * 60).extrude(5).translate((0, 0, -1)).translate(
            (13 * math.cos(math.radians(k * 60)), 13 * math.sin(math.radians(k * 60)), 0)))
    return c.cut(cyl(4, 5, z=-1))


def ec_probe(kind):
    body = cyl(6.0, 115).faces(">Z").edges().fillet(2)
    body = body.union(cyl(4.2, 14, z=115)).union(cyl(2.6, 10, z=129))          # cable boot
    tip = cyl(6.2, 24, z=-24).cut(cyl(4.8, 22, z=-25))                         # protective sleeve
    for a in (0, 90):
        tip = tip.cut(wp().box(14, 3.0, 14).translate((0, 0, -14)).rotate((0, 0, 0), (0, 0, 1), a))
    tip = tip.union(cyl(1.0, 18, -2.2, 0, -20)).union(cyl(1.0, 18, 2.2, 0, -20))   # electrodes
    p = body.union(tip)
    if kind == 10:
        p = p.union(cyl(6.25, 4, z=100))                                        # marker band
    return p


def temp_probe():
    return cyl(3.0, 30).faces("<Z").edges().fillet(1.2).union(cyl(2.2, 12, z=30))


def cable(points, r=2.4):
    pts = [V(*p) for p in points]
    path = cq.Wire.assembleEdges([cq.Edge.makeSpline(pts)])
    t0 = (pts[1] - pts[0]).normalized()
    prof = cq.Wire.makeCircle(r, pts[0], t0)
    return cq.Workplane().add(cq.Solid.sweep(prof, [], path, True, True))


# ================================================================== SB-500 mounting
BR_T, BR_Y = 2.5, D / 2                       # bracket sits against the back of the box ears


def wall_bracket():
    b = wp("XZ").center(0, 80).rect(200, 150).extrude(-BR_T).edges("|Y").fillet(8)
    b = b.union(wp("XZ").center(0, -2).rect(30, 30).extrude(-BR_T).edges("|Y").fillet(6))       # tether tab
    b = b.cut(wp("XZ").center(0, 92).rect(96, 58).extrude(-BR_T - 2).translate((0, 1, 0)).edges("|Y").fillet(10))
    for s in (-1, 1):
        b = b.cut(wp("XZ").center(s * (W / 2 + EAR["w"] / 2 - 1), EAR_Z).circle(2.75).extrude(-BR_T - 2).translate((0, 1, 0)))
        b = b.cut(wp("XZ").center(s * 72, 140).slot2D(18, 9, 90).extrude(-BR_T - 2).translate((0, 1, 0)))
    b = b.cut(wp("XZ").center(0, -6).circle(3.2).extrude(-BR_T - 2).translate((0, 1, 0)))
    return b.translate((0, BR_Y, 0))


def wedge_anchor():
    """Built along +z (head first), then turned so the shaft points into the wall (+y)."""
    a = wp().polygon(6, 13 / 0.866).extrude(5.5).union(cyl(8, 1.6, z=5.5)).union(cyl(4, 60, z=7.1))
    return a.rotate((0, 0, 0), (1, 0, 0), -90)


def ear_bolt():
    b = wp().polygon(6, 8 / 0.866).extrude(3.5).union(cyl(2.5, 16, z=3.5))
    return b.rotate((0, 0, 0), (1, 0, 0), -90)


# ================================================================== parts list
GH = "https://github.com/pingusbot67-wq/diamond-challenge-stuff/blob/claude/clever-fermi-0by41q/saltback/device/out"
WHITE, ORANGE, BLACK, GRAPHITE, STEEL = (0.92, 0.93, 0.94), (0.91, 0.35, 0.05), (0.09, 0.09, 0.1), (0.25, 0.27, 0.3), (0.72, 0.74, 0.76)
PCB_BLK, PCB_BLU, PCB_GRN, SILVER, PVC, CELL = (0.1, 0.11, 0.12), (0.12, 0.25, 0.55), (0.1, 0.38, 0.24), (0.8, 0.81, 0.83), (0.86, 0.87, 0.86), (0.18, 0.36, 0.62)
DENS = {"ASA": 1.07, "TPU 95A": 1.21, "PVC": 1.40, "Stainless 304": 7.93}


def P(pn, key, name, sub, kind, material, build, loc=((0, 0, 0), 0), color=WHITE, qty=1, usd=0, buy=None, note="", explode=(0, 0, 0),
      instances=None, printed=False, print_flip=False):
    return dict(pn=pn, key=key, name=name, sub=sub, kind=kind, material=material, build=build, loc=loc, color=color, qty=qty, usd=usd,
                buy=buy, note=note, explode=explode, instances=instances, printed=printed, print_flip=print_flip)


DIG = "https://www.digikey.com/en/products/detail"
SUBS = {"SB-100": "Housing", "SB-200": "Electronics", "SB-300": "Power", "SB-400": "Probe guard", "SB-500": "Mounting"}
PARTS = [
    P("SB-101", "enclosure_body", "Enclosure body", "SB-100", "3D printed", "ASA", enclosure_body, printed=True, usd=5,
      note="3.2 mm walls, gasket groove, M3 heat-set insert bosses, tray posts, PG7 and M12 holes, slotted M5 mounting ears."),
    P("SB-102", "enclosure_lid", "Lid", "SB-100", "3D printed", "ASA", enclosure_lid, loc=((0, 0, H), 0), printed=True, print_flip=False, usd=2,
      explode=(0, 0, 150), note="Tongue presses the gasket into the groove; pocket underneath holds the flat LTE antenna."),
    P("SB-103", "lid_gasket", "Lid gasket", "SB-100", "3D printed", "TPU 95A", lid_gasket, loc=((0, 0, H - GROOVE_D), 0), color=ORANGE,
      printed=True, usd=1, explode=(0, 0, 105), note="Printed in flexible TPU to fit the groove exactly; 0.8 mm crush."),
    P("SB-104", "cable_gland", "Cable gland, PG7", "SB-100", "Purchased", "Nylon PA66", cable_gland, color=BLACK, qty=3, usd=6,
      buy="https://www.mcmaster.com/cord-grips/", note="For 3–6.5 mm cable, IP68.", explode=(0, 0, -45),
      instances=[((x, GLAND_Y, -6), 0) for x in GLAND_X]),
    P("SB-105", "pressure_vent", "Pressure vent, M12", "SB-100", "Purchased", "PA + ePTFE membrane", pressure_vent, color=GRAPHITE, usd=6,
      buy="https://www.digikey.co.uk/en/product-highlight/a/amphenol-ltw/screw-vent-m12-series", explode=(0, 0, -45),
      loc=((VENT_AT[0], VENT_AT[1], 0), 0), note="Lets the box breathe as the air warms and cools, so it doesn't pump in wet air."),
    P("SB-106", "lid_screw", "Lid screw, M3 x 12 + heat-set insert", "SB-100", "Purchased", "Stainless A2", lid_screw, color=STEEL, qty=4, usd=4,
      buy="https://www.mcmaster.com/heat-set-inserts/", explode=(0, 0, 190), instances=[((x, y, H + LID_T), 0) for x, y in corners(*BOSS_AT)]),
    P("SB-107", "desiccant", "Desiccant pack, 10 g", "SB-100", "Purchased", "Silica gel", desiccant, color=WHITE, usd=2,
      loc=((-48, 32, FLOOR), 0), explode=(-120, 0, 40)),
    P("SB-201", "electronics_tray", "Electronics tray", "SB-200", "3D printed", "ASA", tray, loc=((0, 0, TRAY_Z), 0), color=GRAPHITE,
      printed=True, usd=1, explode=(0, 0, 70), note="Carries every board on 4 mm standoffs; screws to the four posts."),
    P("SB-202", "esp32_devkitc", "ESP32-DevKitC-32E", "SB-200", "Purchased", "PCB", esp32_devkit, color=PCB_BLK, usd=11,
      buy=f"{DIG}/espressif-systems/ESP32-DEVKITC-32E/12091810", loc=((BOARDS[1][0], BOARDS[1][1], BOARD_Z), 0), explode=(0, 0, 95)),
    P("SB-203", "modem_sim7080g", "SIM7080G Cat-M / NB-IoT modem", "SB-200", "Purchased", "PCB", modem_hat, color=PCB_BLU, usd=40,
      buy="https://www.waveshare.com/sim7080g-cat-m-nb-iot-hat.htm", loc=((BOARDS[0][0], BOARDS[0][1], BOARD_Z), 0), explode=(0, 0, 95),
      note="Needs an IoT data SIM (about $2–5 a month)."),
    P("SB-204", "ec_board", "Conductivity signal board", "SB-200", "Purchased", "PCB", ec_board, color=PCB_BLU, qty=2, usd=0,
      note="Comes with each conductivity probe kit.", explode=(0, 0, 95),
      instances=[((BOARDS[2][0], BOARDS[2][1], BOARD_Z), 0), ((BOARDS[3][0], BOARDS[3][1], BOARD_Z), 0)]),
    P("SB-205", "rtc_ds3231", "Real-time clock, DS3231", "SB-200", "Purchased", "PCB", rtc_board, color=PCB_BLK, usd=18,
      buy="https://www.adafruit.com/products/3013", loc=((BOARDS[4][0], BOARDS[4][1], BOARD_Z), 0), explode=(0, 0, 95)),
    P("SB-206", "microsd", "microSD breakout + 8 GB card", "SB-200", "Purchased", "PCB", sd_board, color=PCB_BLU, usd=14,
      buy="https://www.adafruit.com/products/254", loc=((BOARDS[5][0], BOARDS[5][1], BOARD_Z), 0), explode=(0, 0, 95)),
    P("SB-207", "lte_antenna", "Flat LTE antenna", "SB-200", "Purchased", "Flex PCB", flat_antenna, color=GRAPHITE, usd=0,
      note="Comes with the modem; sticks into the pocket under the lid.", loc=((0, 18, H - 0.6), 0), explode=(0, 0, 150)),
    P("SB-301", "battery_sled", "Battery sled", "SB-300", "3D printed", "ASA", battery_sled, loc=((0, 0, FLOOR), 0), color=GRAPHITE,
      printed=True, usd=1, explode=(0, -150, 20), note="Locates three holders; two zip ties hold the cells in."),
    P("SB-302", "holder_1043", "18650 holder, Keystone 1043", "SB-300", "Purchased", "PBT + nickel steel", keystone_1043, color=BLACK, qty=3, usd=8,
      buy=f"{DIG}/keystone-electronics/1043/2745669", explode=(0, -150, 20), instances=[((0, y, FLOOR + 2.5), 0) for y in CELL_Y]),
    P("SB-303", "cell_18650", "Li-ion cell, 18650 protected", "SB-300", "Purchased", "Li-ion", cell_18650, color=CELL, qty=3, usd=24,
      buy="https://www.mcmaster.com/batteries/", note="Wired in parallel, about 10 Ah at 3.7 V.", explode=(0, -150, 45),
      instances=[((0, y, FLOOR + 2.5 + 12), 0) for y in CELL_Y]),
    P("SB-401", "probe_head", "Probe head", "SB-400", "3D printed", "ASA", probe_head, loc=((0, 0, HEAD_TOP - 18), 0), color=ORANGE,
      printed=True, usd=1, explode=(0, 0, 70), note="Plugs into the guard tube; holds three probes; zip-tie collars and a tether eye."),
    P("SB-402", "guard_tube", "Guard tube, 1½\" PVC, drilled", "SB-400", "Cut and drilled", "PVC", guard_tube, loc=((0, 0, HEAD_TOP - PIPE_L), 0),
      color=PVC, usd=8, buy="https://www.mcmaster.com/pvc-pipe/", explode=(0, 0, -60), note="250 mm of schedule 40 pipe, 54 holes of 8 mm."),
    P("SB-403", "silt_cap", "Silt cap", "SB-400", "3D printed", "ASA", silt_cap, loc=((0, 0, HEAD_TOP - PIPE_L - 3), 0), color=ORANGE,
      printed=True, usd=1, explode=(0, 0, -140), note="Slots let silt wash out the bottom of the tube."),
    P("SB-404", "probe_ec_k1", "Conductivity probe K=1 (DFR0300)", "SB-400", "Purchased", "Epoxy, platinum", lambda: ec_probe(1), color=BLACK, usd=70,
      buy="https://www.dfrobot.com/product-1123.html", loc=((P_EC1[0], -P_EC1[1], HEAD_TOP - 110), 0), explode=(0, 0, 70),
      note="0–20 mS/cm. Probe size approximate: measure before printing the probe head."),
    P("SB-405", "probe_ec_k10", "Conductivity probe K=10 (DFR0300-H)", "SB-400", "Purchased", "Epoxy, platinum", lambda: ec_probe(10), color=GRAPHITE, usd=90,
      buy="https://www.dfrobot.com/product-1797.html", loc=((P_EC10[0], -P_EC10[1], HEAD_TOP - 110), 0), explode=(0, 0, 70),
      note="Up to about 100 mS/cm, for the first flush of brine."),
    P("SB-406", "probe_temp", "Temperature probe, DS18B20", "SB-400", "Purchased", "Stainless steel", temp_probe, color=STEEL, usd=10,
      buy="https://www.adafruit.com/products/381", loc=((P_TEMP[0], -P_TEMP[1], HEAD_TOP - 75), 0), explode=(0, 0, 70)),
    P("SB-501", "wall_bracket", "Wall bracket", "SB-500", "Laser cut, 2.5 mm", "Stainless 304", wall_bracket, color=STEEL, usd=15,
      explode=(0, 110, 0), note="Flat plate, no bends: any laser-cutting service can make it from this file."),
    P("SB-502", "wedge_anchor", "Concrete wedge anchor, M8", "SB-500", "Purchased", "Stainless steel", wedge_anchor, color=STEEL, qty=2, usd=6,
      buy="https://www.mcmaster.com/concrete-anchors/", explode=(0, 60, 0), instances=[((s * 72, BR_Y - 7.1, 140), 0) for s in (-1, 1)]),
    P("SB-503", "ear_bolt", "M5 x 16 bolt + PEM nut", "SB-500", "Purchased", "Stainless A2", ear_bolt, color=STEEL, qty=2, usd=3,
      buy="https://www.mcmaster.com/socket-head-screws/", explode=(0, -50, 0),
      instances=[((s * (W / 2 + EAR["w"] / 2 - 1), D / 2 - EAR["t"] - 3.5, EAR_Z), 0) for s in (-1, 1)]),
]


def cables_and_tether():
    """SB-407 probe cables and SB-504 tether, routed in assembly coordinates."""
    tops = [(P_EC1[0], -P_EC1[1]), (P_EC10[0], -P_EC10[1]), (P_TEMP[0], -P_TEMP[1])]
    zs = [HEAD_TOP + 19, HEAD_TOP + 19, HEAD_TOP + 70 - 75 + 47]
    gx = [GLAND_X[0], GLAND_X[2], GLAND_X[1]]
    cab = None
    for (x, y), z0, g in zip(tops, [HEAD_TOP + 19 + 2, HEAD_TOP + 19 + 2, HEAD_TOP - 75 + 42], gx):
        c = cable([(x, y, z0 + 8 if z0 > HEAD_TOP else HEAD_TOP + 8), (x * 1.2, y, HEAD_TOP + 60), (g * 0.8, GLAND_Y * 0.7, -110), (g, GLAND_Y, -30), (g, GLAND_Y, -16)],
                  2.4 if g != GLAND_X[1] else 2.0)
        cab = c if cab is None else cab.union(c)
    teth = cable([(0, -P_TETHER[1], HEAD_TOP + 29), (10, 30, HEAD_TOP + 120), (0, BR_Y - 6, -60), (0, BR_Y + 1.2, -6)], 0.8)
    return cab, teth


EXTRA = [
    P("SB-407", "probe_cables", "Probe cables", "SB-400", "Purchased", "PVC jacket", None, color=BLACK, qty=3, usd=0, note="Come with the probes."),
    P("SB-504", "tether", "Tether, 1.5 mm stainless wire rope", "SB-500", "Purchased", "Stainless 316", None, color=STEEL, usd=6,
      buy="https://www.mcmaster.com/wire-rope/", note="Carries the probe guard's weight so the cables are never pulled."),
]


def fix_glb(path, meta):
    """glTF is in metres and Y-up. OpenCASCADE already turns Z-up into Y-up on the root node; here the root is also
    scaled from millimetres to metres, and each part node gets its part number, name and material as extras."""
    import struct
    raw = path.read_bytes()
    jlen = struct.unpack("<I", raw[12:16])[0]
    g = json.loads(raw[20:20 + jlen])
    rest = raw[20 + jlen:]
    by_node = {n: p for p in meta for n in p["nodes"]}
    for node in g["nodes"]:
        if node.get("name") == "saltback_node":
            node["scale"] = [0.001, 0.001, 0.001]
            node["extras"] = {"units": "Model built in millimetres; scaled to metres for glTF.", "revision": "A"}
        elif node.get("name") in by_node:
            p = by_node[node["name"]]
            node["extras"] = {"partNumber": p["pn"], "partName": p["name"], "material": p["material"], "subassembly": p["subName"]}
    g["asset"]["copyright"] = "Saltback, Diamond Challenge prototype"
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    out = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<I4s", len(js), b"JSON") + js + rest
    path.write_bytes(out)


def loc_of(l):
    (x, y, z), a = l
    return cq.Location(V(x, y, z), V(0, 0, 1), a)


def to_shape(w):
    return w.val() if isinstance(w, cq.Workplane) and len(w.vals()) == 1 else cq.Compound.makeCompound(w.vals()) if isinstance(w, cq.Workplane) else w


def main():
    for d in ("step", "stl"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    assy = cq.Assembly(name="saltback_node")
    meta = []
    cab, teth = cables_and_tether()
    all_parts = PARTS + EXTRA
    for p in all_parts:
        shape = cab if p["key"] == "probe_cables" else teth if p["key"] == "tether" else p["build"]()
        solid = to_shape(shape.clean() if hasattr(shape, "clean") else shape)
        if not solid.isValid():
            solid = solid.fix()
        stem = f"{p['pn']}_{p['key']}"
        # files: STEP in part coordinates; STL in print orientation for printed parts
        cq.exporters.export(cq.Workplane().add(solid), str(OUT / "step" / f"{stem}.step"))
        out_stl = solid
        if p["key"] == "enclosure_lid":
            out_stl = solid.rotate(V(0, 0, 0), V(1, 0, 0), 180)                      # print plate-down
        if p["key"] == "probe_head":
            out_stl = solid.rotate(V(0, 0, 0), V(1, 0, 0), 180)                      # print flange-down
        bb0 = out_stl.BoundingBox()
        out_stl = out_stl.translate(V(0, 0, -bb0.zmin))
        cq.exporters.export(cq.Workplane().add(out_stl), str(OUT / "stl" / f"{stem}.stl"), tolerance=SEG_TOL, angularTolerance=ANG_TOL)
        bb = solid.BoundingBox()
        vol = solid.Volume() / 1000.0
        mass = round(vol * DENS[p["material"]], 1) if p["material"] in DENS else None
        locs = p["instances"] or [p["loc"]]
        for i, l in enumerate(locs):
            name = p["pn"] if len(locs) == 1 else f"{p['pn']}-{i + 1}"
            assy.add(solid, name=name, loc=loc_of(l), color=cq.Color(*p["color"], 1.0))
        meta.append({k: p[k] for k in ("pn", "key", "name", "sub", "kind", "material", "qty", "usd", "buy", "note", "printed")} | {
            "subName": SUBS[p["sub"]], "color": "#%02x%02x%02x" % tuple(round(c * 255) for c in p["color"]),
            "size_mm": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)], "volume_cm3": round(vol, 1), "mass_g": mass,
            "explode": list(p["explode"]), "nodes": [p["pn"] if len(locs) == 1 else f"{p['pn']}-{i + 1}" for i in range(len(locs))],
            "files": {"step": f"{GH}/step/{stem}.step", "stl": f"{GH}/stl/{stem}.stl"}})
        print(f"{p['pn']} {p['name'][:40]:40s} valid={solid.isValid()} {bb.xlen:6.1f} x {bb.ylen:6.1f} x {bb.zlen:6.1f} mm  {vol:7.1f} cm3")
    assy.export(str(OUT / "saltback-node.step"))
    assy.export(str(OUT / "saltback-node.glb"), tolerance=GLB_TOL, angularTolerance=GLB_ANG)
    fix_glb(OUT / "saltback-node.glb", meta)
    total = sum(m["usd"] for m in meta)
    (OUT / "parts.json").write_text(json.dumps({"name": "Saltback drain node", "rev": "A", "units": "mm", "total_usd": total,
                                                 "subassemblies": SUBS, "parts": meta, "assembly": {"step": f"{GH}/saltback-node.step", "glb": f"{GH}/saltback-node.glb"}}, indent=1))
    # data for the web viewer (device/viewer) and the main site's Device page: the same GLB, as base64
    import base64
    viewer = ROOT / "viewer"
    viewer.mkdir(exist_ok=True)
    (viewer / "node-glb.js").write_text("/* Generated by device/cad/saltback_node.py: saltback-node.glb as base64. */\n"
                                       f"export const GLB = \"{base64.b64encode((OUT / 'saltback-node.glb').read_bytes()).decode()}\";\n")
    data = json.loads((OUT / "parts.json").read_text())
    (viewer / "parts.js").write_text("/* Generated by device/cad/saltback_node.py from out/parts.json. */\nexport const NODE = " + json.dumps(data) + ";\n")
    (ROOT.parent / "web" / "device" / "parts-data.js").write_text("/* Generated by device/cad/saltback_node.py. */\nwindow.SaltbackNode = " + json.dumps(data) + ";\n")
    print(f"{len(meta)} part numbers, about ${total} in parts. Wrote {OUT}")


if __name__ == "__main__":
    main()
