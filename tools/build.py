"""Build an original, self-contained Max Audio Effect without requiring Max.

The AMPF/mx@c layout follows the files in Ableton's official Connection Kit:
https://github.com/Ableton/m4l-connection-kit (format reference, no copied code).
An archive integrity check is not a substitute for loading the device in Live.
"""
from __future__ import annotations

import json
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "Set and Forget Chaos"
RUNTIME = "chaos-runtime.js"


def chunk(tag: bytes, payload: bytes) -> bytes:
    return tag + struct.pack(">I", len(payload) + 8) + payload


def collective(files: list[tuple[str, bytes, bytes]]) -> bytes:
    """A Max collective: data followed by a big-endian resource directory."""
    data = bytearray()
    entries = []
    for index, (name, kind, content) in enumerate(files):
        filename = name.encode("utf-8") + b"\0"
        filename += b"\0" * (-len(filename) % 4)
        entry = b"".join([
            chunk(b"type", kind),
            chunk(b"fnam", filename),
            chunk(b"sz32", struct.pack(">I", len(content))),
            chunk(b"of32", struct.pack(">I", 16 + len(data))),
            chunk(b"vers", struct.pack(">I", 0)),
            chunk(b"flag", struct.pack(">I", 17 if index == 0 else 0)),
            chunk(b"mdat", struct.pack(">I", 0)),
        ])
        entries.append(chunk(b"dire", entry))
        data.extend(content)
    header = b"mx@c" + struct.pack(">III", 16, 0, 16 + len(data))
    return header + data + chunk(b"dlst", b"".join(entries))


def make_patch() -> dict:
    boxes, lines = [], []
    ink = [0.92, 0.94, 0.87, 1.0]
    muted = [0.57, 0.61, 0.57, 1.0]
    lime = [0.76, 0.98, 0.33, 1.0]

    def box(id, kind, rect, **attrs):
        item = dict(id=id, maxclass=kind, patching_rect=rect, **attrs)
        boxes.append({"box": item})
        return item

    def obj(id, text, x, y, inputs=1, outputs=1, **attrs):
        return box(id, "newobj", [x, y, max(80, len(text) * 6), 22],
                   text=text, numinlets=inputs, numoutlets=outputs, **attrs)

    def connect(source, destination, output=0, inlet=0):
        lines.append({"patchline": {"source": [source, output],
                                    "destination": [destination, inlet]}})

    def label(id, text, rect, size=11, color=None, **attrs):
        return box(id, "comment", rect, text=text, numinlets=1, numoutlets=0,
                   presentation=1, presentation_rect=rect, fontsize=size,
                   fontname="Arial", textcolor=color or ink, ignoreclick=1, **attrs)

    box("background", "panel", [0, 0, 420, 169], numinlets=1, numoutlets=0,
        presentation=1, presentation_rect=[0, 0, 420, 169],
        bgcolor=[0.075, 0.09, 0.085, 1], border=0, rounded=0)
    label("title", "SET / FORGET", [14, 8, 226, 29], 23, lime, fontface=1)
    label("edition", "CHAOS  /  01", [300, 17, 107, 17], 10, muted, textjustification=2)
    label("target-label", "TARGET", [15, 43, 60, 14], 9, muted)
    label("target", "NO TARGET", [73, 39, 331, 23], 13, ink, fontface=1)

    for id, text, texton, rect, mode, initial in [
        ("map", "MAP", "SELECT...", [15, 70, 105, 30], 0, 0),
        ("pause", "RUNNING", "PAUSED", [130, 70, 171, 30], 0, 0),
        ("clear", "CLEAR", "CLEAR", [311, 70, 94, 30], 1, 0),
    ]:
        enabled = 1 if id in ("pause", "map") else 0
        button = box(id, "live.text", rect, numinlets=1, numoutlets=2,
                     outlettype=["", ""], presentation=1, presentation_rect=rect,
                     text=text, texton=texton, mode=mode, parameter_enable=enabled,
                     varname=id + "_control", fontsize=11,
                     activebgcolor=[0.15, 0.18, 0.15, 1],
                     activebgoncolor=lime, activetextcolor=ink,
                     activetextoncolor=[0.06, 0.08, 0.06, 1],
                     bordercolor=[0.27, 0.32, 0.25, 1],
                     annotation={
                         "map": "Press MAP, then click an Ableton parameter. Press again to cancel.",
                         "pause": "Pause releases the target for manual control. Resume starts at its current value.",
                         "clear": "Remove the mapping and release the parameter.",
                     }[id])
        if enabled:
            button["saved_attribute_attributes"] = {"valueof": {
                "parameter_longname": "Pause" if id == "pause" else "Map",
                "parameter_shortname": "Pause" if id == "pause" else "Map",
                "parameter_type": 2, "parameter_enum": [text, texton],
                "parameter_initial": [initial], "parameter_initial_enable": 1,
                "parameter_mappable": 0,
            }}

    label("phase", "IDLE", [14, 108, 185, 24], 16, lime, fontface=1)
    label("value", "0 %", [300, 108, 105, 24], 16, ink, textjustification=2)
    label("status", "Press MAP, then click a parameter", [14, 137, 392, 20], 11, muted)

    obj("input", "plugin~", 20, 225, 2, 2, outlettype=["signal", "signal"])
    obj("output", "plugout~", 20, 275, 2, 2, outlettype=["signal", "signal"])
    connect("input", "output", 0, 0)
    connect("input", "output", 1, 1)
    obj("loaded", "live.thisdevice", 220, 225, 1, 3)
    obj("init", "deferlow", 220, 260)
    box("init-message", "message", [220, 295, 80, 22], text="initialize", numinlets=2, numoutlets=1)
    obj("controller", "js " + RUNTIME, 220, 360, 1, 6, varname="chaos_controller",
        saved_object_attributes={"filename": RUNTIME, "parameter_enable": 0})
    connect("loaded", "init")
    connect("init", "init-message")
    connect("init-message", "controller")
    obj("map-message", "prepend map", 420, 225)
    obj("pause-message", "prepend pause", 550, 225)
    obj("clear-filter", "sel 1", 700, 225, 1, 2)
    box("clear-message", "message", [700, 265, 80, 22], text="clear", numinlets=2, numoutlets=1)
    connect("map", "map-message")
    connect("pause", "pause-message")
    connect("clear", "clear-filter")
    connect("clear-filter", "clear-message")
    for source in ("map-message", "pause-message", "clear-message"):
        connect(source, "controller")

    obj("ramp", "line~ 0.", 220, 430, 2, 2, outlettype=["signal", "bang"])
    obj("remote", "live.remote~ @smoothing 0.", 220, 480, 2, 0,
        saved_object_attributes={"_persistence": 0, "smoothing": 0.0})
    obj("persist", "live.observer id", 520, 430, 2, 2,
        saved_object_attributes={"_persistence": 1})
    obj("restore", "prepend restoreid", 520, 475)
    connect("controller", "ramp", 0)
    connect("ramp", "remote")
    connect("controller", "remote", 1, 1)
    connect("controller", "persist", 2, 1)
    connect("persist", "restore")
    connect("restore", "controller")

    obj("target-message", "prepend set", 20, 560)
    obj("status-message", "prepend set", 160, 560)
    obj("ui-route", "route map phase value", 320, 560, 1, 4)
    obj("map-set", "prepend set", 320, 605)
    obj("phase-set", "prepend set", 470, 605)
    obj("percentage", "sprintf %.0f %%", 620, 605)
    obj("percentage-set", "prepend set", 620, 650)
    connect("controller", "target-message", 3)
    connect("target-message", "target")
    connect("controller", "status-message", 4)
    connect("status-message", "status")
    connect("controller", "ui-route", 5)
    connect("ui-route", "map-set", 0)
    connect("map-set", "map")
    connect("ui-route", "phase-set", 1)
    connect("phase-set", "phase")
    connect("ui-route", "percentage", 2)
    connect("percentage", "percentage-set")
    connect("percentage-set", "value")

    # Use Max's conventional object IDs, retaining readable scripting names.
    ids = {entry["box"]["id"]: f"obj-{index}"
           for index, entry in enumerate(boxes, 1)}
    for entry in boxes:
        item = entry["box"]
        item.setdefault("varname", item["id"])
        item["id"] = ids[item["id"]]
    for entry in lines:
        for port in ("source", "destination"):
            entry["patchline"][port][0] = ids[entry["patchline"][port][0]]

    return {"patcher": {
        "fileversion": 1,
        "appversion": {"major": 8, "minor": 5, "revision": 0,
                       "architecture": "x64", "modernui": 1},
        "classnamespace": "box", "rect": [0, 0, 1000, 760],
        "openrect": [0, 0, 420, 169], "devicewidth": 420,
        "openinpresentation": 1, "bglocked": 1,
        "default_fontsize": 12, "default_fontname": "Arial",
        "description": "Map once. Autonomous random parameter motion.",
        "boxes": boxes, "lines": lines,
        "parameters": {ids["pause"]: ["Pause", "Pause", 0], ids["map"]: ["Map", "Map", 0],
                       "parameterbanks": {"0": {"index": 0, "name": "Chaos",
                           "parameters": [ids["pause"], "-", "-", "-", "-", "-", "-", "-"]}}},
        "dependency_cache": [{"name": RUNTIME, "type": "TEXT", "implicit": 1}],
        "latency": 0, "autosave": 0,
        "project": {"version": 1, "autoorganize": 1, "hideprojectwindow": 1,
                    "showdependencies": 1, "autolocalize": 0,
                    "contents": {"patchers": {}, "media": {},
                                 "code": {RUNTIME: {"kind": "javascript", "local": 1}}},
                    "amxdtype": 0, "readonly": 1, "devpathtype": 0, "devpath": "."},
    }}


def build(destination: Path) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    runtime = "\n\n".join((ROOT / "src" / file).read_text(encoding="utf-8")
                            for file in ("chaos-engine.js", "live-controller.js"))
    patch = (json.dumps(make_patch(), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    archive = collective([
        (NAME + ".amxd", b"JSON", patch + b"\0"),
        (RUNTIME, b"TEXT", runtime.encode("utf-8")),
    ])
    # AMPF chunk sizes are little endian; its embedded Max archive is big endian.
    device = (b"ampf" + struct.pack("<I", 4) + b"aaaa"
              + b"meta" + struct.pack("<II", 4, 7)
              + b"ptch" + struct.pack("<I", len(archive)) + archive)
    paths = [destination / (NAME + ".amxd"), destination / (NAME + ".maxpat"),
             destination / RUNTIME]
    for path, content in zip(paths, [device, patch, runtime.encode("utf-8")]):
        path.write_bytes(content)
    readme = (ROOT / "LIESMICH.txt").read_bytes()
    zip_path = destination / "Set-and-Forget-Chaos.zip"
    # Fixed timestamps keep identical sources byte-for-byte reproducible.
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for filename, content in [(NAME + ".amxd", device), ("LIESMICH.txt", readme)]:
            info = zipfile.ZipInfo("Set and Forget Chaos/" + filename, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            bundle.writestr(info, content)
    return paths + [zip_path]


if __name__ == "__main__":
    for output in build(ROOT / "dist"):
        print(f"Built {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")
