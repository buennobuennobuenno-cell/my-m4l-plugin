"""Inspect the frozen device, its single UI control and native audio graph."""
from pathlib import Path
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "test"))
from archive_test import read_device
spec = importlib.util.spec_from_file_location("all_builder", ROOT / "build.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class AllPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.temp.name)
        cls.device = builder.build(cls.output)
        cls.resources = read_device(cls.device.read_bytes())
        cls.patch = json.loads(cls.resources["All.amxd"][1])["patcher"]
        cls.boxes = {e["box"]["id"]: e["box"] for e in cls.patch["boxes"]}
        cls.gen = cls.boxes["dsp"]["patcher"]
        cls.code = next(e["box"]["code"] for e in cls.gen["boxes"] if e["box"]["maxclass"] == "codebox")
        cls.lines = [e["patchline"] for e in cls.patch["lines"]]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_all_runtime_resources_are_self_contained_and_identical_to_source(self):
        self.assertEqual(set(self.resources), {"All.amxd", "all_seed.js"})
        self.assertEqual(self.resources["All.amxd"][2], 17)
        self.assertEqual(self.resources["all_seed.js"][1], (ROOT / "src/all_seed.js").read_bytes())
        self.assertEqual(self.code, (ROOT / "src/all.genexpr").read_text())
        self.assertNotIn("/workspace", json.dumps(self.patch))
        self.assertNotIn("/tmp", json.dumps(self.patch))

    def test_exactly_one_visible_parameter_and_no_hidden_user_controls(self):
        parameters = [b for b in self.boxes.values() if b.get("parameter_enable")]
        self.assertEqual([b["id"] for b in parameters], ["mix"])
        self.assertEqual(parameters[0]["maxclass"], "live.dial")
        self.assertEqual(parameters[0]["presentation"], 1)
        self.assertFalse(parameters[0].get("hidden", 0))
        saved = parameters[0]["saved_attribute_attributes"]["valueof"]
        self.assertEqual(saved["parameter_longname"], "Dry/Wet")
        self.assertEqual((saved["parameter_mmin"], saved["parameter_mmax"]), (0, 100))
        self.assertEqual(saved["parameter_initial"], [10])
        self.assertEqual(self.patch["parameters"]["mix"], ["Dry/Wet", "Dry/Wet", 0])
        self.assertNotIn("Param ", self.code)

    def test_control_is_inside_the_compact_device_and_cannot_be_covered(self):
        self.assertEqual(self.patch["devicewidth"], 80)
        self.assertEqual(self.patch["openinpresentation"], 1)
        x, y, w, h = self.boxes["mix"]["presentation_rect"]
        self.assertGreaterEqual(x, 0); self.assertGreaterEqual(y, 0)
        self.assertLessEqual(x + w, 80); self.assertLessEqual(y + h, 169)
        self.assertEqual([b["id"] for b in self.boxes.values() if b.get("presentation")], ["mix"])
        self.assertNotIn("fontname", self.boxes["mix"])
        self.assertNotIn("fontsize", self.boxes["mix"])
        self.assertEqual(len(set(self.patch["bgcolor"][:3])), 1)
        self.assertGreater(self.patch["bgcolor"][0], 0.5)
        for b in self.boxes.values():
            if b.get("presentation") and b["id"] != "mix":
                xx, yy, ww, hh = b["presentation_rect"]
                self.assertFalse(x < xx + ww and xx < x + w and y < yy + hh and yy < y + h)
        self.assertNotIn("jsui", [b["maxclass"] for b in self.boxes.values()])

    def test_every_outer_and_inner_connection_references_existing_ports(self):
        for patch in (self.patch, self.gen):
            boxes = {e["box"]["id"]: e["box"] for e in patch["boxes"]}
            self.assertEqual(len(boxes), len(patch["boxes"]))
            for e in patch["lines"]:
                for end, count in (("source", "numoutlets"), ("destination", "numinlets")):
                    key, port = e["patchline"][end]
                    self.assertIn(key, boxes)
                    self.assertGreaterEqual(port, 0)
                    self.assertLess(port, boxes[key][count])

    def test_audio_reaches_both_outputs_only_through_the_embedded_gen_core(self):
        self.assertEqual(self.boxes["dsp"]["text"], "gen~")
        self.assertEqual(self.gen["classnamespace"], "dsp.gen")
        for channel in (0, 1):
            self.assertIn({"source": ["audio_in", channel], "destination": ["dsp", channel]}, self.lines)
            self.assertIn({"source": ["dsp", channel], "destination": ["audio_out", channel]}, self.lines)
        self.assertEqual(len([p for p in self.lines if p["destination"][0] == "audio_out"]), 2)
        self.assertEqual(self.patch["latency"], 0)

    def test_parameter_restore_reemits_saved_dial_and_seeds_only_at_startup(self):
        for src, out, dst in (("loaded", 0, "defer"), ("defer", 0, "initialize"),
                              ("initialize", 0, "mix"), ("initialize", 1, "seed"),
                              ("mix", 0, "mix_scale"), ("mix_scale", 0, "mix_signal")):
            self.assertIn({"source": [src, out], "destination": [dst, 0]}, self.lines)
        self.assertIn({"source": ["mix_signal", 0], "destination": ["dsp", 2]}, self.lines)
        self.assertEqual(self.boxes["mix_scale"]["text"], "* 0.01")
        script = self.resources["all_seed.js"][1].decode()
        for unwanted in ("Task", "LiveAPI", "setInterval", "qmetro"):
            # The script's leading explanatory comment may mention Task/API.
            executable = "\n".join(script.splitlines()[1:])
            self.assertNotIn(unwanted, executable)

    def test_no_mapping_remote_custom_external_or_audio_rate_javascript(self):
        texts = [b.get("text", "") for b in self.boxes.values()]
        self.assertEqual([s for s in texts if "~" in s], ["plugin~", "plugout~", "sig~ 0.1", "sig~ 13579.", "gen~"])
        for unwanted in ("live.remote", "live.observer", "live.path", "snapshot", "qmetro", "node.script", "js~"):
            self.assertNotIn(unwanted, "\n".join(texts))

    def test_buffer_bounds_and_sample_address_resolution_are_explicit(self):
        self.assertIn("Data allRaw(524288, 2);", self.code)
        self.assertEqual(self.code.count("Data "), 1)
        self.assertNotIn("allPre", self.code)
        for unwanted in ("hFeedback", "all_shape", "all_scene", "all_reflect"):
            self.assertNotIn(unwanted, self.code)
        self.assertIn("floor(delayL + 0.5)", self.code)
        self.assertIn("floor(delayR + 0.5)", self.code)
        self.assertIn("else if (dL <= available)", self.code)
        self.assertIn("else if (dR <= available)", self.code)
        for unwanted in ("resize", "Buffer ", "interp=", "while (", "for (", "exp(", "log(", "sin("):
            self.assertNotIn(unwanted, self.code)

    def test_build_is_reproducible_and_editable_patch_has_same_audio_source(self):
        before = self.device.read_bytes()
        self.assertEqual(before, builder.build(self.output).read_bytes())
        editable = json.loads((self.output / "All.maxpat").read_text())["patcher"]
        self.assertEqual(editable, self.patch)
        self.assertLess(len(before), 50000)

    def test_embedded_seed_script_runs_once_per_bang_with_valid_seed_range(self):
        script = self.resources["all_seed.js"][1].decode()
        probe = r'''
const vm=require('node:vm'),assert=require('node:assert/strict');
const events=[];
const context={outlet:(port,value)=>events.push([port,value]),
  Date:class {getTime(){return 1792620000000;}},
  Math:{floor:Math.floor,random:()=>0.125}};
vm.createContext(context);vm.runInContext(SOURCE,context);
assert.equal(events.length,0);
context.bang();assert.equal(events.length,1);
assert.equal(events[0][0],0);
assert.ok(Number.isInteger(events[0][1])&&events[0][1]>=1&&events[0][1]<=2147483000);
context.bang();assert.equal(events.length,2);
'''.replace("SOURCE", json.dumps(script))
        subprocess.run(["node", "-e", probe], check=True, capture_output=True, text=True)


if __name__ == "__main__":
    unittest.main()
