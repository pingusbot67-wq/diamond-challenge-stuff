"""Saltback drain node, Rev B: the low-cost build from the AliExpress parts list.

    python device/cad/node_b.py          (run from the saltback folder; needs `pip install cadquery trimesh`)
    python device/cad/check_exports.py device/out-b

One node, at real size (mm). Writes device/out-b/ (STEP + STL per part, assembly STEP + GLB, parts.json), the viewer
data in device/viewer/b/, and web/device/parts-data.js for the main site.

What changed from Rev A: an IP67 ABS junction box (115 x 90 x 55) replaces the printed box; an industrial RS485
conductivity sensor in a 2" guard tube replaces the two DFRobot probes; ESP32-C3 SuperMini, RS485 module, DS3231,
MT3608 boost, TP4056 charger and two P-MOSFET power switches sit on one 9 x 7 cm perfboard above a 2 x 18650 holder;
the probe plugs into an SP13 connector so it unplugs without opening the box; two DS18B20s measure air and grate
temperature. Bought parts are simplified to their outside shape from typical listings: measure yours.
"""
import base64
import json
import math
import sys
from pathlib import Path

import cadquery as cq
from cadquery import Vector as V

sys.path.insert(0, str(Path(__file__).resolve().parent))
from saltback_node import (wp, rbox, cyl, corners, cable, cable_gland, pressure_vent, desiccant, cell_18650, header,  # noqa: E402
                           fix_glb, to_shape, DENS)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out-b"
GH = "https://github.com/pingusbot67-wq/diamond-challenge-stuff/blob/claude/clever-fermi-0by41q/saltback/device/out-b"

# ------------------------------------------------------------------ the junction box, in its own frame
# Box frame: base (the side screwed to the wall) at z = 0, lid on top at z = 55; x across (115), y up the wall (90).
BX, BY, BZ_BASE, BZ_LID, BT, BR = 115.0, 90.0, 40.0, 15.0, 2.5, 6.0
BOSS_IN = (BX / 2 - 7, BY / 2 - 7)               # lid screw bosses
PLATE_Z = BT + 0.0                                # printed mounting plate sits on the base floor
DECK_Z = 30.0                                     # perfboard height above the base floor
PEN_Z = 20.0                                      # penetrations: centre height in the base walls
PEN = {"vent": -46.0, "sp13": -25.0, "air": 0.0, "surface": 22.0, "level": 44.0}   # x of each hole in the bottom wall
# Box frame -> world: base against the wall (wall plane y = 0, wall plate 5 mm), bottom wall of the box facing down.
WALLPLATE_T = 5.0
TO_WORLD = cq.Location(V(0, -WALLPLATE_T, BY / 2)) * cq.Location(V(0, 0, 0), V(1, 0, 0), 90)
# with this, box (x, y, z) -> world (x, -z - 5, y + 45): world z = 0 is the box's bottom wall


def in_box(x=0, y=0, z=0, rz=0):
    return TO_WORLD * cq.Location(V(x, y, z), V(0, 0, 1), rz)


def world(x=0, y=0, z=0, rz=0):
    return cq.Location(V(x, y, z), V(0, 0, 1), rz)


def junction_box_base():
    b = rbox(BX, BY, BZ_BASE, BR).faces("<Z").edges().fillet(2).faces(">Z").shell(-BT)
    for x, y in corners(*BOSS_IN):
        b = b.union(cyl(4.2, BZ_BASE - BT, x, y, BT)).cut(cyl(1.6, 14, x, y, BZ_BASE - 13))
        b = b.cut(cyl(2.2, BT + 2, x, y, -1))                                         # base mounting holes
    for x, y in corners(40, 28):                                                       # internal plate bosses
        b = b.union(cyl(3.5, 4, x, y, BT)).cut(cyl(1.25, 5, x, y, BT))
    for k, x in PEN.items():                                                           # holes in the bottom wall (y = -BY/2)
        d = {"vent": 12.2, "sp13": 13.2}.get(k, 12.5)
        b = b.cut(wp("XZ").center(x, PEN_Z).circle(d / 2).extrude(-BT - 2).translate((0, -BY / 2 - 1, 0)))
    return b


def junction_box_lid():
    l = rbox(BX, BY, BZ_LID, BR).faces(">Z").edges().fillet(3)
    l = l.cut(rbox(BX - 2 * BT, BY - 2 * BT, BZ_LID - BT, BR - BT, 0))
    for x, y in corners(*BOSS_IN):
        l = l.union(cyl(4.2, BZ_LID - BT, x, y, 0)).cut(cyl(1.7, BZ_LID + 2, x, y, -1)).cut(cyl(3.2, 3, x, y, BZ_LID - 2.5))
    return l.cut(rbox(BX - 3, BY - 3, 0.6, BR - 1, -0.01).cut(rbox(BX - 7, BY - 7, 0.8, BR - 3, -0.1)))   # gasket channel


def mounting_plate():
    p = rbox(104, 78, 2.5, 4)
    for x, y in corners(40, 28):
        p = p.cut(cyl(1.7, 5, x, y, -1))
    for x, y in corners(41, 31):                                                       # standoffs for the perfboard deck
        p = p.union(cyl(3.0, DECK_Z - BT - 2.5, x, y, 2.5)).cut(cyl(1.25, 30, x, y, 1))
    for y in (-14, 34):                                                                # rails that locate the battery holder
        p = p.union(wp().box(70, 2, 4, centered=(True, True, False)).translate((0, y - 1 if y > 0 else y + 1, 2.5)))
    for x in (-25, 25):                                                                # zip-tie slots across the holder
        p = p.cut(wp().pushPoints([(x, -17), (x, 37)]).rect(3.2, 5).extrude(5).translate((0, 0, -1)))
    return p.cut(wp().pushPoints([(-44, -30), (44, -30)]).slot2D(10, 4, 90).extrude(5).translate((0, 0, -1)))   # wire passes


def battery_holder_2():
    h = wp().box(77, 41, 20, centered=(True, True, False)).edges("|Z").fillet(1.5)
    for y in (-10.25, 10.25):
        h = h.cut(cyl(9.5, 70, z=0).rotate((0, 0, 0), (0, 1, 0), 90).translate((-35, y, 12)))
    return h.cut(wp().box(70, 34, 10, centered=(True, True, False)).translate((0, 0, 13)))


def perfboard():
    b = rbox(90, 70, 1.6, 1)
    for x, y in corners(41, 31):
        b = b.cut(cyl(1.6, 4, x, y, -1))
    return b


def module(w, d, parts=(), r=1.0):
    m = rbox(w, d, 1.2, r)
    for p in parts:
        m = m.union(p)
    return m


def box(w, d, h, x=0, y=0, z=1.2):
    return wp().box(w, d, h, centered=(True, True, False)).translate((x, y, z))


def esp32c3_supermini():      # 22.5 x 18 mm, USB-C on one short edge, ceramic antenna on the other
    return module(22.5, 18, [box(5.0, 5.0, 0.9, 2, 0), box(9.0, 7.4, 3.2, -8.0, 0), box(6, 2, 1, 9, 0), box(3, 4, 1.5, -2, 6)])


def rs485_module():          # auto-direction TTL-RS485, about 44 x 14 mm with a screw terminal for A/B
    return module(44, 14, [box(5, 6, 1.6, -6, 0), box(10, 8, 9, 15, 0), header(4).rotate((0, 0, 0), (0, 0, 1), 90).translate((-20.5, 0, -2.5))])


def ds3231_zs042():          # 38 x 22 mm; the coin cell sits underneath
    return module(38, 22, [box(8, 10.5, 2.4, -6, 0), box(5, 6, 1.4, 6, 0), header(6).rotate((0, 0, 0), (0, 0, 1), 90).translate((-17.5, 0, -2.5)),
                           cyl(10.4, 3.4, 4, 0, -3.4)])


def mt3608_module():         # 36 x 17 mm boost converter with blue trimpot
    return module(36, 17, [box(3, 3, 1.2, 0, 0), box(7, 7, 3.5, -8, 0), box(9.5, 4.5, 9.5, 10, 3)])


def tp4056_module():         # 28 x 17 mm, USB-C at one end, with protection
    return module(28, 17, [box(9, 7.4, 3.2, -10.5, 0), box(5, 4, 1.5, 2, 2), box(3, 3, 1, 8, -3)])


def screw_terminal(n):
    t = box(5.08 * n, 7.5, 10, 0, 0, 0)
    for i in range(n):
        t = t.cut(cyl(1.6, 4, (i - (n - 1) / 2) * 5.08, -1.2, 7))
    return t


def power_switches():         # AO3401 x 2 + 2N7002 + resistors, SOT-23 on the perfboard (drawn on a small carrier)
    c = box(26, 16, 0.2, 0, 0, 0)
    for x, y in ((-8, 3), (0, 3), (8, 3)):
        c = c.union(box(2.9, 1.6, 1.1, x, y, 0.2))
    for x in (-9, -3, 3, 9):
        c = c.union(box(3.2, 1.6, 0.6, x, -4, 0.2))
    return c


def sp13_connector():        # panel socket through the bottom wall + the mating plug on the probe cable (axis = z)
    s = cyl(10, 2, z=-2).union(cyl(6.5, 12, z=0)).union(wp().polygon(6, 17 / 0.866).extrude(3).translate((0, 0, BT + 0.5)))
    s = s.union(cyl(8, 12, z=-14))                                                      # coupling body
    s = s.union(cyl(9, 26, z=-40).faces("<Z").edges().fillet(2)).union(cyl(4, 10, z=-50))   # plug + boot
    return s


def ec_sensor():             # RS485 4-electrode / graphite conductivity + temperature sensor, about 30 mm x 170 mm
    s = cyl(15, 120).faces("<Z").edges().fillet(1.5)
    s = s.union(cyl(13.3, 18, z=120)).union(cyl(8, 10, z=138)).union(cyl(3.5, 14, z=148))    # 3/4" thread, cap, cable
    cage = cyl(15, 30, z=-30).cut(cyl(12.5, 32, z=-31))
    for a in (0, 60, 120):
        cage = cage.cut(wp().box(40, 7, 20).translate((0, 0, -14)).rotate((0, 0, 0), (0, 0, 1), a))
    s = s.union(cage)
    for k in range(4):                                                                   # four electrodes
        s = s.union(cyl(1.2, 27, 6 * math.cos(k * math.pi / 2), 6 * math.sin(k * math.pi / 2), -24))   # run up into the body
    return s


def level_sensor():          # optional RS485 pressure level sensor, about 26 x 95 mm
    return cyl(13, 80).faces("<Z").edges().fillet(2).union(cyl(13.5, 6, z=-4)).union(cyl(4, 15, z=80))


def ds18b20():
    return cyl(3.0, 50).faces("<Z").edges().fillet(1.2).union(cyl(2.4, 12, z=50))


GT_OD, GT_ID, GT_L, GT_TOP = 60.3, 52.5, 300.0, -260.0   # 2" schedule 40 PVC guard tube
GT_XY = (0.0, -40.0)


def guard_tube_2in():
    t = cyl(GT_OD / 2, GT_L).cut(cyl(GT_ID / 2, GT_L + 2, z=-1))
    for row in range(10):
        z = 30 + row * 24
        for k in range(6):
            a = k * 60 + (30 if row % 2 else 0)
            t = t.cut(cyl(5, 20).rotate((0, 0, 0), (0, 1, 0), 90).translate((GT_OD / 2 - 8, 0, z)).rotate((0, 0, 0), (0, 0, 1), a))
    return t


def sensor_head():           # printed plug for the top of the 2" tube; the sensor hangs from it by its own shoulder
    h = cyl(GT_ID / 2 - 0.2, 16).union(cyl(GT_OD / 2 + 3, 4, z=16)).faces(">Z").edges().fillet(1.2)
    h = h.union(cyl(19, 10, z=20)).cut(cyl(13.9, 40, z=-5))                              # collar around the sensor thread
    h = h.cut(cyl(20.2, 2.4, z=24.5).cut(cyl(18.6, 3, z=24.3)))                          # hose-clamp / zip-tie groove
    h = h.union(wp("XZ").center(0, 26).rect(12, 12).extrude(3).translate((0, -24, 0)).edges("|Y").fillet(4))
    h = h.cut(wp("XZ").center(0, 27).circle(2.4).extrude(6).translate((0, -22, 0)))       # tether eye
    for x, y in ((18, 10), (-18, 10), (0, 20)):
        h = h.cut(cyl(2, 30, x, y, -5))                                                  # air bleed / level-sensor cable
    return h.cut(cyl(3.2, 30, 18, -12, -5))


def silt_cap_2in():
    c = cyl(GT_OD / 2 + 3.2, 28).cut(cyl(GT_OD / 2 + 0.25, 28, z=3)).faces("<Z").edges().fillet(2)
    for k in range(8):
        a = math.radians(k * 45)
        c = c.cut(wp().slot2D(18, 3.4, k * 45).extrude(5).translate((0, 0, -1)).translate((16 * math.cos(a), 16 * math.sin(a), 0)))
    return c.cut(cyl(5, 5, z=-1))


def wall_plate():            # printed backer: concrete screws at the corners, box screws into heat-set inserts
    p = wp("XZ").center(0, 45).rect(150, 112).extrude(WALLPLATE_T).edges("|Y").fillet(8)   # spans world y -5..0
    for x, z in corners(BOSS_IN[0], BOSS_IN[1]):
        p = p.cut(wp("XZ").center(x, z + 45).circle(2.9).extrude(WALLPLATE_T + 2).translate((0, 1, 0)))
    for x, z in corners(67, 48):
        p = p.cut(wp("XZ").center(x, z + 45).circle(3.4).extrude(WALLPLATE_T + 2).translate((0, 1, 0)))
        p = p.cut(wp("XZ").center(x, z + 45).circle(6).extrude(2).translate((0, -WALLPLATE_T + 2, 0)).translate((0, 0, 0)))
    return p.cut(wp("XZ").center(0, 45).rect(60, 40).extrude(WALLPLATE_T + 2).translate((0, 1, 0)).edges("|Y").fillet(6))


def concrete_screw():         # 6 mm concrete screw, head toward -y (built along +z then turned into the wall)
    s = cyl(6, 2.2).union(cyl(3, 45, z=2.2))
    return s.rotate((0, 0, 0), (1, 0, 0), -90)


def box_screw():              # M4 pan-head through the base into a heat-set insert in the wall plate (inside the box)
    return cyl(3.6, 2.6).union(cyl(2, 12, z=-12))


def foil_tape():
    return box(40, 25, 0.1, 0, 0, 0)


# ------------------------------------------------------------------ parts list
WHITE, LIGHT, ORANGE, BLACK, GRAPHITE, STEEL = (0.93, 0.94, 0.95), (0.80, 0.82, 0.84), (0.91, 0.35, 0.05), (0.09, 0.09, 0.1), (0.25, 0.27, 0.3), (0.72, 0.74, 0.76)
PCB_BLK, PCB_BLU, PCB_GRN, PERF, PVC, CELL, GREEN = (0.1, 0.11, 0.12), (0.12, 0.25, 0.55), (0.1, 0.38, 0.24), (0.72, 0.55, 0.3), (0.86, 0.87, 0.86), (0.18, 0.36, 0.62), (0.13, 0.55, 0.3)
ALI = "https://www.aliexpress.us/w/wholesale-{q}.html"
ali = lambda q: ALI.format(q=q.replace(" ", "-"))
SUBS = {"B-100": "Enclosure", "B-200": "Electronics", "B-300": "Power", "B-400": "Sensors & probe guard", "B-500": "Mounting"}

# deck layout on the perfboard (box frame, board centre at x 0, y 0)
DK = DECK_Z + 1.6
L = dict(esp=(-29.5, 21.0, 0), rs485=(19.0, 24.0, 0), rtc=(-23.0, -4.0, 0), boost=(21.0, 3.5, 0), charger=(-27.0, -24.0, 0),
         fets=(18.0, -22.0, 0), term_probe=(39.5, -10.0, 90), term_temp=(39.5, -24.0, 90))


def P(pn, key, name, sub, kind, material, build, locs, color, qty=1, low=0.0, high=0.0, buy=None, search=None, note="", explode=(0, 0, 0),
      printed=False, optional=False, added=False):
    return dict(pn=pn, key=key, name=name, sub=sub, kind=kind, material=material, build=build, locs=locs, color=color, qty=qty, low=low,
                high=high, buy=buy or (ali(search) if search else None), search=search, note=note, explode=explode, printed=printed,
                optional=optional, added=added)


OUTW = -BT - 0.5   # world z of a bottom-wall fitting's outer face
PARTS = [
    P("B-101", "box_base", "Junction box, IP67 ABS 115 x 90 x 55 (base)", "B-100", "Purchased", "ABS", junction_box_base, [in_box()], LIGHT,
      low=4, high=6, search="IP67 ABS waterproof junction box 115x90x55",
      note="Drill five holes in the bottom wall: 12.2 mm vent, 13.2 mm SP13, three 12.5 mm PG7. Measure your box: sizes vary by seller."),
    P("B-102", "box_lid", "Junction box lid", "B-100", "Purchased", "ABS", junction_box_lid, [in_box(z=BZ_BASE)], WHITE,
      note="Comes with the box, with its gasket and four screws.", explode=(0, -120, 0)),
    P("B-103", "cable_gland", "Cable gland, PG7", "B-100", "Purchased", "Nylon", cable_gland, [world(PEN[k], -BZ_BASE / 2 - WALLPLATE_T, -6) for k in ("air", "surface", "level")],
      BLACK, qty=3, low=1, high=1.5, search="PG7 cable gland nylon", note="Two for the DS18B20 cables, one for the optional level sensor (keep it plugged until then).", explode=(0, 0, -40)),
    P("B-104", "breather_vent", "Breather vent, ePTFE M12", "B-100", "Purchased", "PA + ePTFE", pressure_vent, [world(PEN["vent"], -BZ_BASE / 2 - WALLPLATE_T, 0)],
      GRAPHITE, low=1, high=2, search="ePTFE breather vent M12 waterproof", note="Stops the box pumping in wet air as it warms and cools.", explode=(0, 0, -40)),
    P("B-105", "sp13_connector", "SP13 waterproof connector, 4 pin (socket + plug)", "B-100", "Purchased", "Nylon + brass", sp13_connector,
      [world(PEN["sp13"], -BZ_BASE / 2 - WALLPLATE_T, 0)], BLACK, low=2, high=3, search="SP13 waterproof connector 4 pin",
      note="Socket in the bottom wall, plug on the probe cable: the probe unplugs without opening the box.", explode=(0, 0, -55)),
    P("B-106", "desiccant", "Silica gel packet, 5 g", "B-100", "Purchased", "Silica gel", desiccant, [in_box(36, -6, BT + 2.5)], WHITE,
      low=1, high=1.5, search="silica gel packets 5g", explode=(0, -60, 0)),
    P("B-107", "mounting_plate", "Mounting plate", "B-100", "3D printed", "ASA", mounting_plate, [in_box(z=PLATE_Z)], GRAPHITE, printed=True, low=1, high=1,
      note="Screws to the box's floor bosses; locates the battery holder and carries the perfboard on four standoffs.", explode=(0, -70, 0), added=True),
    P("B-201", "esp32_c3", "ESP32-C3 SuperMini", "B-200", "Purchased", "PCB", esp32c3_supermini, [in_box(*L["esp"][:2], DK + 2.5, 180)], PCB_BLK,
      low=2, high=3, search="ESP32-C3 SuperMini", note="Remove the red power LED (draws about 2 mA all the time).", explode=(0, -150, 0)),
    P("B-202", "rs485", "TTL to RS485 module, auto direction, 3.3 V", "B-200", "Purchased", "PCB", rs485_module, [in_box(*L["rs485"][:2], DK + 2.5)], PCB_BLU,
      low=1, high=2, search="TTL to RS485 module automatic flow control 3.3V", explode=(0, -150, 0)),
    P("B-203", "ds3231", "DS3231 real-time clock (ZS-042)", "B-200", "Purchased", "PCB", ds3231_zs042, [in_box(*L["rtc"][:2], DK + 2.5 + 3.4)], PCB_BLU,
      low=1, high=2, search="DS3231 RTC module", note="With a plain CR2032: remove the charging resistor (or diode) and the power LED.", explode=(0, -150, 0)),
    P("B-204", "mt3608", "MT3608 boost converter", "B-200", "Purchased", "PCB", mt3608_module, [in_box(*L["boost"][:2], DK + 2.5)], PCB_BLU,
      low=0.5, high=1, search="MT3608 boost converter module", note="Set it to 12 V with a multimeter BEFORE connecting the probe.", explode=(0, -150, 0)),
    P("B-205", "tp4056", "TP4056 USB-C charger with protection", "B-200", "Purchased", "PCB", tp4056_module, [in_box(*L["charger"][:2], DK + 2.5)], PCB_BLU,
      low=0.5, high=1, search="TP4056 type-C charger module protection", note="Charge only indoors, above 0 °C.", explode=(0, -150, 0)),
    P("B-206", "power_switches", "Power switches: 2 x AO3401 + 1 x 2N7002 + resistors", "B-200", "Purchased", "SOT-23 parts", power_switches,
      [in_box(*L["fets"][:2], DK)], BLACK, low=1.5, high=2.5, search="AO3401 P-channel MOSFET",
      note="One AO3401 switches the probe's 12 V supply (driven through the 2N7002), one switches the 3.3 V sensor rail.", explode=(0, -120, 0)),
    P("B-207", "perfboard", "Perfboard 9 x 7 cm + headers", "B-200", "Purchased", "FR4", perfboard, [in_box(z=DECK_Z)], PERF,
      low=2.5, high=4, search="perfboard 9x7 double sided", note="Holds every module; also heat shrink and 22 AWG silicone wire.", explode=(0, -100, 0)),
    P("B-208", "screw_terminals", "Screw terminals, 5.08 mm (4-pin + 3-pin)", "B-200", "Purchased", "PA + brass", lambda: screw_terminal(4),
      [in_box(*L["term_probe"][:2], DK, 90), in_box(*L["term_temp"][:2], DK, 90)], GREEN, qty=2, low=0.5, high=1, search="5.08mm PCB screw terminal",
      note="Probe and temperature wires land here, so nothing outside is soldered to the board.", explode=(0, -120, 0), added=True),
    P("B-301", "battery_holder", "18650 holder, 2 slot parallel", "B-300", "Purchased", "PP", battery_holder_2, [in_box(0, 10, PLATE_Z + 2.5)], BLACK,
      low=1, high=1.5, search="18650 battery holder 2 slot parallel", explode=(0, -40, -70)),
    P("B-302", "cell_18650", "18650 cell (Samsung 35E or Molicel)", "B-300", "Buy locally", "Li-ion", cell_18650,
      [in_box(0, y, PLATE_Z + 2.5 + 12) for y in (-0.25, 20.25)], CELL, qty=2, low=10, high=14, buy="https://www.18650batterystore.com/",
      note="Buy from a real battery store: AliExpress cells are often fake capacity. Charge both to the same voltage before paralleling.", explode=(0, -60, -80)),
    P("B-401", "ec_sensor", "RS485 conductivity + temperature sensor", "B-400", "Purchased", "ABS + graphite / 316L", ec_sensor,
      [world(GT_XY[0], GT_XY[1], GT_TOP - 150)], BLACK, low=35, high=60, search="RS485 conductivity sensor EC temperature water Modbus",
      note="4-electrode or graphite, IP68, highest range (0-100 or 0-200 mS/cm), Modbus RTU, 5-24 V. Shape drawn is typical: measure yours.", explode=(0, 0, 70)),
    P("B-402", "guard_tube", "Guard tube, 2\" PVC, drilled", "B-400", "Cut and drilled", "PVC", guard_tube_2in, [world(GT_XY[0], GT_XY[1], GT_TOP - GT_L)], PVC,
      low=6, high=10, buy="https://www.homedepot.com/s/2%20in%20pvc%20pipe%20schedule%2040",
      note="300 mm of schedule 40, 60 holes of 10 mm. Keeps leaves and grit off the electrodes.", explode=(0, 0, -60), added=True),
    P("B-403", "sensor_head", "Sensor head", "B-400", "3D printed", "ASA", sensor_head, [world(GT_XY[0], GT_XY[1], GT_TOP - 16)], ORANGE, printed=True, low=1, high=1,
      note="Plugs into the tube; the sensor hangs from it by its own shoulder. Hose clamp around the collar.", explode=(0, 0, 70), added=True),
    P("B-404", "silt_cap", "Silt cap", "B-400", "3D printed", "ASA", silt_cap_2in, [world(GT_XY[0], GT_XY[1], GT_TOP - GT_L - 3)], ORANGE, printed=True,
      low=1, high=1, note="Slots let silt wash out.", explode=(0, 0, -140), added=True),
    P("B-405", "ds18b20_air", "DS18B20 probe, air", "B-400", "Purchased", "Stainless", ds18b20, [world(PEN["air"], -BZ_BASE / 2 - WALLPLATE_T, -95)], STEEL,
      low=2, high=2.5, search="DS18B20 waterproof stainless probe 1m", note="From the 5-pack. Hangs in the air of the basin, out of the water.", explode=(0, 0, -30)),
    P("B-406", "ds18b20_surface", "DS18B20 probe, grate surface", "B-400", "Purchased", "Stainless", lambda: ds18b20().rotate((0, 0, 0), (0, 1, 0), 90),
      [world(PEN["surface"] + 30, -40, 140)], STEEL, low=0, high=0, note="Second probe from the 5-pack, taped flat under the grate with aluminium tape.", explode=(0, 0, 40)),
    P("B-407", "foil_tape", "Aluminium foil tape", "B-400", "Hardware store", "Aluminium", foil_tape, [world(PEN["surface"] + 30, -40, 143.1)], STEEL,
      low=2, high=3, note="Holds the surface probe on the grate and spreads heat to it.", explode=(0, 0, 40), added=True),
    P("B-408", "level_sensor", "RS485 level sensor 0-1 m (optional)", "B-400", "Purchased", "316L", level_sensor, [world(60, -40, GT_TOP - GT_L + 5)], STEEL,
      low=30, high=50, search="RS485 water level sensor pressure 0-1m", optional=True,
      note="Optional. Measures how much water flows, so load = concentration x volume. Shares the RS485 bus at Modbus address 2.", explode=(80, 0, -40)),
    P("B-501", "wall_plate", "Wall plate", "B-500", "3D printed", "ASA", wall_plate, [world()], ORANGE, printed=True, low=1, high=1,
      note="Screw this to the basin wall; the box screws to it with four M4 screws into heat-set inserts.", explode=(0, 60, 0), added=True),
    P("B-502", "concrete_screw", "Concrete screw 6 x 45 mm", "B-500", "Hardware store", "Stainless", concrete_screw,
      [world(x, -WALLPLATE_T - 2.2 + 2.2, z + 45) for x, z in corners(67, 48)], STEEL, qty=4, low=2, high=3, explode=(0, 90, 0), added=True),
    P("B-503", "box_screw", "M4 x 12 pan-head + heat-set insert", "B-500", "Hardware store", "Stainless", box_screw,
      [in_box(x, y, BT) for x, y in corners(*BOSS_IN)], STEEL, qty=4, low=1, high=1.5, explode=(0, -40, 0), added=True),
]


def cables():
    """Probe cable (SP13 plug -> sensor), DS18B20 leads and the tether, routed in world coordinates."""
    gx = lambda k: PEN[k]
    y0 = -BZ_BASE / 2 - WALLPLATE_T
    probe = cable([(gx("sp13"), y0, -55), (gx("sp13"), y0 - 5, -110), (GT_XY[0] - 8, GT_XY[1], GT_TOP + 70), (GT_XY[0], GT_XY[1], GT_TOP + 16)], 3.0)
    air = cable([(gx("air"), y0, -16), (gx("air"), y0, -45)], 1.9)
    surf = cable([(gx("surface"), y0, -16), (gx("surface") + 10, y0 - 12, -40), (gx("surface") + 30, -40, 40), (gx("surface") + 30, -40, 118)], 1.9)
    level = cable([(gx("level"), y0, -16), (gx("level") + 6, y0 - 15, -120), (60, -40, GT_TOP - GT_L + 85 + 8)], 2.6)
    tether = cable([(0, GT_XY[1] - 26, GT_TOP + 26), (-30, -20, -150), (-67, -2, -3)], 0.8)
    return probe.union(air).union(surf), level, tether


EXTRA = [
    P("B-409", "probe_cables", "Probe cable + DS18B20 leads", "B-400", "Purchased", "PVC / silicone", None, [world()], BLACK, qty=1,
      note="The sensor's own cable, fitted with the SP13 plug; DS18B20 leads come through the PG7 glands.", explode=(0, 0, 0)),
    P("B-410", "level_cable", "Level sensor cable (optional)", "B-400", "Purchased", "PVC", None, [world()], BLACK, optional=True, explode=(0, 0, 0)),
    P("B-504", "tether", "Stainless tether, 1.5 mm wire rope", "B-500", "Hardware store", "Stainless", None, [world()], STEEL, low=4, high=6,
      note="From the sensor head to a wall-plate screw: carries the tube's weight, never the cable.", explode=(0, 0, 0), added=True),
]


def main():
    for d in ("step", "stl"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    assy = cq.Assembly(name="saltback_node")
    meta = []
    probe_c, level_c, tether_c = cables()
    for p in PARTS + EXTRA:
        shape = {"probe_cables": probe_c, "level_cable": level_c, "tether": tether_c}.get(p["key"]) or p["build"]()
        solid = to_shape(shape.clean() if hasattr(shape, "clean") else shape)
        if not solid.isValid():
            solid = solid.fix()
        stem = f"{p['pn']}_{p['key']}"
        cq.exporters.export(cq.Workplane().add(solid), str(OUT / "step" / f"{stem}.step"))
        out_stl = solid.rotate(V(0, 0, 0), V(1, 0, 0), 180) if p["key"] in ("sensor_head",) else solid
        if p["key"] == "wall_plate":
            out_stl = solid.rotate(V(0, 0, 0), V(1, 0, 0), 90)                            # print flat
        bb0 = out_stl.BoundingBox()
        cq.exporters.export(cq.Workplane().add(out_stl.translate(V(0, 0, -bb0.zmin))), str(OUT / "stl" / f"{stem}.stl"), tolerance=0.05, angularTolerance=0.15)
        bb, vol = solid.BoundingBox(), solid.Volume() / 1000.0
        names = [p["pn"] if len(p["locs"]) == 1 else f"{p['pn']}-{i + 1}" for i in range(len(p["locs"]))]
        for name, loc in zip(names, p["locs"]):
            assy.add(solid, name=name, loc=loc, color=cq.Color(*p["color"], 1.0))
        meta.append({k: p[k] for k in ("pn", "key", "name", "sub", "kind", "material", "qty", "buy", "search", "note", "printed", "optional", "added")} | {
            "subName": SUBS[p["sub"]], "color": "#%02x%02x%02x" % tuple(round(c * 255) for c in p["color"]),
            "usd": round((p["low"] + p["high"]) / 2, 1), "usd_low": p["low"], "usd_high": p["high"],
            "size_mm": [round(bb.xlen, 1), round(bb.ylen, 1), round(bb.zlen, 1)], "volume_cm3": round(vol, 1),
            "mass_g": round(vol * DENS[p["material"]], 1) if p["material"] in DENS else None, "explode": list(p["explode"]), "nodes": names,
            "files": {"step": f"{GH}/step/{stem}.step", "stl": f"{GH}/stl/{stem}.stl"}})
        print(f"{p['pn']} {p['name'][:44]:44s} valid={solid.isValid()} solids={len(solid.Solids())} {bb.xlen:6.1f} x {bb.ylen:6.1f} x {bb.zlen:6.1f}")
    assy.export(str(OUT / "saltback-node.step"))
    assy.export(str(OUT / "saltback-node.glb"), tolerance=0.15, angularTolerance=0.35)
    fix_glb(OUT / "saltback-node.glb", meta)
    total = round(sum(m["usd"] for m in meta if not m["optional"]))
    data = {"name": "Saltback drain node", "rev": "B", "title": "Rev B · low-cost build", "units": "mm", "total_usd": total, "subassemblies": SUBS, "parts": meta,
            "assembly": {"step": f"{GH}/saltback-node.step", "glb": f"{GH}/saltback-node.glb"},
            "tree": "https://github.com/pingusbot67-wq/diamond-challenge-stuff/tree/claude/clever-fermi-0by41q/saltback/device/out-b"}
    (OUT / "parts.json").write_text(json.dumps(data, indent=1))
    vb = ROOT / "viewer" / "b"
    vb.mkdir(parents=True, exist_ok=True)
    (vb / "node-glb.js").write_text("/* Generated by device/cad/node_b.py. */\nexport const GLB = \"" + base64.b64encode((OUT / "saltback-node.glb").read_bytes()).decode() + "\";\n")
    (vb / "parts.js").write_text("/* Generated by device/cad/node_b.py. */\nexport const NODE = " + json.dumps(data) + ";\n")
    (ROOT.parent / "web" / "device" / "parts-data.js").write_text("/* Generated by device/cad/node_b.py. */\nwindow.SaltbackNode = " + json.dumps(data) + ";\n")
    print(f"{len(meta)} part numbers, about ${total} per node (not counting optional parts). Wrote {OUT}")


if __name__ == "__main__":
    main()
