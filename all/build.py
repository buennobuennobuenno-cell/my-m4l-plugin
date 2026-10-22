"""Build All, a self-contained Max Audio Effect with one visible parameter."""
from pathlib import Path
import json
import struct
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from tools.build import collective

NAME = "All"
VERSION = "1.0.0"


def patch():
    boxes, lines = [], []

    def box(key, cls="newobj", text=None, rect=(0, 0, 100, 22), **attrs):
        item = dict(id=key, maxclass=cls, patching_rect=list(rect), **attrs)
        if text is not None:
            item["text"] = text
        boxes.append({"box": item})

    def wire(src, out, dest, inlet=0):
        lines.append({"patchline": {"source": [src, out], "destination": [dest, inlet]}})

    box("title", "comment", "All", (8, 9, 94, 24), presentation=1,
        presentation_rect=[8, 9, 94, 24], fontsize=20, fontname="Arial", fontface=1,
        numinlets=1, numoutlets=0, ignoreclick=1,
        textcolor=[0.88, 0.94, 0.91, 1])
    box("mix", "live.dial", rect=(21, 51, 68, 79), presentation=1,
        presentation_rect=[21, 51, 68, 79], numinlets=1, numoutlets=2,
        outlettype=["", "float"], varname="dry_wet", parameter_enable=1,
        showname=1, shownumber=1, appearance=0, fontsize=10,
        activefgdialcolor=[0.45, 0.87, 0.70, 1],
        annotation="Dry/Wet. 0% = Eingang, 100% = All. Startet automatisch.",
        saved_attribute_attributes={"valueof": {
            "parameter_longname": "Dry/Wet", "parameter_shortname": "Dry/Wet",
            "parameter_type": 0, "parameter_mmin": 0.0, "parameter_mmax": 100.0,
            "parameter_initial_enable": 1, "parameter_initial": [100.0],
            "parameter_unitstyle": 5}})
    box("audio_in", text="plugin~", rect=(20, 230, 70, 22), numinlets=2, numoutlets=2,
        outlettype=["signal", "signal"])
    box("audio_out", text="plugout~", rect=(20, 550, 70, 22), numinlets=2, numoutlets=0)
    box("mix_scale", text="* 0.01", rect=(160, 230, 70, 22), numinlets=2, numoutlets=1)
    box("mix_signal", text="sig~ 1.", rect=(160, 270, 70, 22), numinlets=1, numoutlets=1,
        outlettype=["signal"])
    box("seed", text="js all_seed.js", rect=(300, 230, 110, 22), numinlets=1, numoutlets=1,
        saved_object_attributes={"filename": "all_seed.js", "autowatch": 0})
    box("seed_signal", text="sig~ 13579.", rect=(300, 270, 100, 22), numinlets=1, numoutlets=1,
        outlettype=["signal"])
    box("loaded", text="live.thisdevice", rect=(460, 230, 110, 22), numinlets=1, numoutlets=3)
    box("defer", text="deferlow", rect=(460, 270, 80, 22), numinlets=1, numoutlets=1)
    box("initialize", text="t b b", rect=(460, 310, 60, 22), numinlets=1, numoutlets=2)

    gen_boxes = [{"box": {
        "id": "code", "maxclass": "codebox", "numinlets": 4, "numoutlets": 2,
        "outlettype": ["", ""], "patching_rect": [20, 80, 850, 500],
        "code": (ROOT / "src/all.genexpr").read_text()}}]
    gen_lines = []
    for n in range(1, 5):
        gen_boxes.append({"box": {"id": "in" + str(n), "maxclass": "newobj",
            "text": "in " + str(n), "numinlets": 0, "numoutlets": 1,
            "patching_rect": [20 + 120 * (n - 1), 20, 60, 22]}})
        gen_lines.append({"patchline": {"source": ["in" + str(n), 0], "destination": ["code", n - 1]}})
    for n in (1, 2):
        gen_boxes.append({"box": {"id": "out" + str(n), "maxclass": "newobj",
            "text": "out " + str(n), "numinlets": 1, "numoutlets": 0,
            "patching_rect": [20 + 120 * (n - 1), 610, 60, 22]}})
        gen_lines.append({"patchline": {"source": ["code", n - 1], "destination": ["out" + str(n), 0]}})
    box("dsp", text="gen~", rect=(20, 400, 110, 22), numinlets=4, numoutlets=2,
        outlettype=["signal", "signal"], varname="all_dsp",
        patcher={"fileversion": 1, "classnamespace": "dsp.gen", "rect": [40, 40, 900, 670],
                 "boxes": gen_boxes, "lines": gen_lines})
    wire("audio_in", 0, "dsp", 0); wire("audio_in", 1, "dsp", 1)
    wire("dsp", 0, "audio_out", 0); wire("dsp", 1, "audio_out", 1)
    wire("mix", 0, "mix_scale"); wire("mix_scale", 0, "mix_signal"); wire("mix_signal", 0, "dsp", 2)
    wire("seed", 0, "seed_signal"); wire("seed_signal", 0, "dsp", 3)
    wire("loaded", 0, "defer"); wire("defer", 0, "initialize")
    wire("initialize", 1, "seed"); wire("initialize", 0, "mix")
    return {"patcher": {
        "fileversion": 1, "appversion": {"major": 8, "minor": 5, "revision": 8,
            "architecture": "x64", "modernui": 1}, "classnamespace": "box",
        "rect": [80, 80, 650, 650], "openrect": [0, 0, 110, 169], "devicewidth": 110.0,
        "openinpresentation": 1, "bglocked": 1,
        "bgcolor": [0.10, 0.12, 0.14, 1], "default_fontname": "Arial",
        "description": "All 1.0.0 — autonomous stereo sample-clocked gain/delay chaos. One Dry/Wet control.",
        "boxes": boxes, "lines": lines,
        "parameters": {"mix": ["Dry/Wet", "Dry/Wet", 0],
            "parameterbanks": {"0": {"index": 0, "name": "All",
                "parameters": ["mix", "-", "-", "-", "-", "-", "-", "-"]}},
            "inherited_shortname": 1},
        "dependency_cache": [{"name": "all_seed.js", "type": "TEXT", "implicit": 1}],
        "latency": 0, "autosave": 0}}


def build(destination=None):
    out = Path(destination) if destination else ROOT / "dist"
    out.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(patch(), ensure_ascii=False, indent=2) + "\n").encode()
    script = (ROOT / "src/all_seed.js").read_bytes()
    archive = collective([("All.amxd", b"JSON", raw), ("all_seed.js", b"TEXT", script)])
    prefix = b"ampf" + struct.pack("<I", 4) + b"aaaa" + b"meta" + struct.pack("<II", 4, 7)
    device = prefix + b"ptch" + struct.pack("<I", len(archive)) + archive
    target = out / "All.amxd"
    target.write_bytes(device)
    (out / "All.maxpat").write_bytes(raw)
    (out / "all_seed.js").write_bytes(script)
    return target


if __name__ == "__main__":
    target = build()
    print(str(target) + " (" + str(target.stat().st_size) + " bytes)")
