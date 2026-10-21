"""Verify the actual device/resource graph; does not run native Max objects."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/"test"))
from archive_test import read_device
spec=importlib.util.spec_from_file_location("random_motion_v3_builder",ROOT/"build.py")
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)


class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.out=Path(cls.temp.name)
        cls.device=builder.build(cls.out)
        cls.files=read_device(cls.device.read_bytes())
        cls.patch=json.loads(cls.files[builder.STEM+".amxd"][1])["patcher"]
        cls.boxes={e["box"]["id"]:e["box"] for e in cls.patch["boxes"]}
        cls.wires=[e["patchline"] for e in cls.patch["lines"]]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_embedded_resources_match_the_reviewed_sources_exactly(self):
        self.assertEqual(set(self.files),{builder.STEM+".amxd",*builder.SOURCES})
        for name in builder.SOURCES:
            self.assertEqual(self.files[name][0],b"TEXT")
            self.assertEqual(self.files[name][1],(ROOT/"src"/name).read_bytes())
        self.assertEqual(self.files[builder.STEM+".amxd"][2],17)

    def test_sixteen_native_remotes_receive_direct_value_time_and_id_messages(self):
        for n in range(1,17):
            remote=self.boxes["remote"+str(n)]
            self.assertEqual(remote["text"],"live.remote~ @smoothing 0")
            self.assertEqual(remote["numinlets"],2)
            self.assertIn({"source":["value_route",n-1],"destination":[remote["id"],0]},self.wires)
            self.assertIn({"source":["id_route",n-1],"destination":[remote["id"],1]},self.wires)

    def test_no_own_audio_rate_curve_or_signal_scaling_chain_was_added(self):
        texts=[b.get("text","") for b in self.boxes.values() if b["maxclass"]=="newobj"]
        dsp=[s.split()[0] for s in texts if "~" in s.split()[0]]
        self.assertEqual(sorted(dsp),sorted(["plugin~","plugout~"]+["live.remote~"]*16))
        self.assertNotIn("@normalized",json.dumps(self.patch))
        for channel in (0,1):
            self.assertIn({"source":["audio_in",channel],"destination":["audio_out",channel]},self.wires)

    def test_one_shared_jsui_and_one_editor_replace_the_previous_32_pairs(self):
        self.assertEqual(sum(b["maxclass"]=="jsui" for b in self.boxes.values()),1)
        self.assertEqual(sum(b["maxclass"]=="flonum" for b in self.boxes.values()),1)
        self.assertLess(len(self.boxes),100)
        self.assertEqual(self.boxes["bound_editor"]["hidden"],1)

    def test_all_wires_and_native_control_handlers_exist(self):
        for wire in self.wires:
            for end,key in [("source","numoutlets"),("destination","numinlets")]:
                id,port=wire[end]
                self.assertIn(id,self.boxes)
                self.assertLess(port,self.boxes[id][key])
        source=(ROOT/"src/rm16_v3_mapping.js").read_text()
        for handler in ("init","active","contextchanged","map","edited","setting","edit","dismiss"):
            self.assertIn("function "+handler+"(",source)
        self.assertEqual(len(self.boxes),len(self.patch["boxes"]))

    def test_original_modulator_state_binding_is_preserved(self):
        self.assertEqual(self.boxes["engine"]["varname"],"engine")
        self.assertIn("pattr motion_state @bindto engine",self.boxes["state"]["text"])
        self.assertEqual(self.boxes["state"]["saved_attribute_attributes"]["valueof"]["parameter_type"],3)
        self.assertEqual(self.patch["parameters"]["state"][0],"Motion State")

    def test_context_change_bridge_matches_the_factory_mapping_pattern(self):
        self.assertEqual(self.boxes["self_path"]["text"],"live.path live_set view this_device")
        self.assertEqual(self.boxes["self_identity"]["text"],"live.observer id")
        self.assertIn({"source":["self_path",1],"destination":["self_identity",1]},self.wires)
        self.assertIn({"source":["self_changed",0],"destination":["engine",0]},self.wires)
        self.assertEqual(self.boxes["closing"]["text"],"freebang")
        self.assertEqual(self.boxes["closing_msg"]["text"],"notifydeleted")
        self.assertIn({"source":["closing_msg",0],"destination":["engine",0]},self.wires)

    def test_visible_objects_fit_the_original_device_height(self):
        for b in self.boxes.values():
            if b.get("presentation"):
                x,y,w,h=b["presentation_rect"]
                self.assertGreaterEqual(x,0);self.assertGreaterEqual(y,0)
                self.assertLessEqual(x+w,720);self.assertLessEqual(y+h,169)
        self.assertIn("V3",self.boxes["title"]["text"])

    def test_rebuilds_and_standalone_source_container_are_reproducible(self):
        before=self.device.read_bytes();builder.build(self.out)
        self.assertEqual(before,self.device.read_bytes())
        source=(self.out/(builder.STEM+"_Source.amxd")).read_bytes()
        self.assertEqual(source[:4],b"ampf")
        self.assertEqual(json.loads(source[32:].rstrip(b"\0"))["patcher"],self.patch)

    def test_original_baseline_fixtures_are_unmodified(self):
        expected={
            "rm16_v41_mapping.js":"b90065bd79388eb0c8d7a911214a54c93fedc96de7187e5ca3ef35da267394c7",
            "rm16_v41_motion.js":"f5df5e6d426e59b64302edda9bebfc523f29eb548637e547dc4c796fbeee6aff",
        }
        for name,digest in expected.items():
            self.assertEqual(hashlib.sha256((ROOT/"tests/fixtures/v41"/name).read_bytes()).hexdigest(),digest)


if __name__=="__main__":
    unittest.main()
