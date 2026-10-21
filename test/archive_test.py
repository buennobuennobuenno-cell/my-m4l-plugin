"""Independent resource reader: check emitted bytes rather than builder internals."""
import json
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from build import build


def chunks(data, start, stop):
    while start < stop:
        if start + 8 > stop:
            raise ValueError("truncated chunk")
        tag, length = struct.unpack_from(">4sI", data, start)
        if length < 8 or start + length > stop:
            raise ValueError("invalid chunk size")
        yield tag, data[start + 8:start + length]
        start += length
    if start != stop:
        raise ValueError("misaligned chunk end")


def read_device(data):
    if data[:4] != b"ampf" or data[8:12] != b"aaaa":
        raise ValueError("not a Max Audio Effect")
    if data[12:16] != b"meta" or data[24:28] != b"ptch":
        raise ValueError("missing AMPF chunks")
    if struct.unpack_from("<I", data, 28)[0] != len(data) - 32:
        raise ValueError("AMPF payload size mismatch")
    archive = data[32:]
    if archive[:4] != b"mx@c":
        raise ValueError("not a frozen Max collective")
    directory = struct.unpack_from(">I", archive, 12)[0]
    root_chunks = list(chunks(archive, directory, len(archive)))
    if len(root_chunks) != 1 or root_chunks[0][0] != b"dlst":
        raise ValueError("missing resource directory")
    files = {}
    for tag, entry in chunks(root_chunks[0][1], 0, len(root_chunks[0][1])):
        if tag != b"dire":
            raise ValueError("invalid directory entry")
        attrs = dict(chunks(entry, 0, len(entry)))
        name = attrs[b"fnam"].split(b"\0", 1)[0].decode()
        size = struct.unpack(">I", attrs[b"sz32"])[0]
        offset = struct.unpack(">I", attrs[b"of32"])[0]
        if offset < 16 or offset + size > directory:
            raise ValueError("resource outside data section")
        if name in files:
            raise ValueError("duplicate resource")
        files[name] = (attrs[b"type"], archive[offset:offset + size],
                       struct.unpack(">I", attrs[b"flag"])[0])
    return files


class ArchiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.temp.name)
        cls.paths = build(cls.output)
        cls.amxd = cls.output / "Set and Forget Chaos.amxd"
        cls.files = read_device(cls.amxd.read_bytes())
        cls.patch = json.loads(cls.files["Set and Forget Chaos.amxd"][1].rstrip(b"\0"))["patcher"]
        cls.ids = {ent["box"]["varname"]: ent["box"]["id"] for ent in cls.patch["boxes"]}

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_archive_is_self_contained(self):
        self.assertEqual(set(self.files), {"Set and Forget Chaos.amxd", "chaos-runtime.js"})
        kind, runtime, flag = self.files["chaos-runtime.js"]
        self.assertEqual(kind, b"TEXT")
        self.assertEqual(flag, 0)
        self.assertIn(b"var ChaosEngine", runtime)
        self.assertIn(b"function initialize()", runtime)
        self.assertNotIn(b"require(", runtime)
        self.assertEqual(self.files["Set and Forget Chaos.amxd"][2], 17)
        self.assertEqual(runtime, (self.output / "chaos-runtime.js").read_bytes())

    def test_all_patch_connections_reference_existing_ports(self):
        boxes = {ent["box"]["id"]: ent["box"] for ent in self.patch["boxes"]}
        self.assertEqual(len(boxes), len(self.patch["boxes"]))
        for line in self.patch["lines"]:
            source, outlet = line["patchline"]["source"]
            target, inlet = line["patchline"]["destination"]
            self.assertIn(source, boxes)
            self.assertIn(target, boxes)
            self.assertLess(outlet, boxes[source]["numoutlets"])
            self.assertLess(inlet, boxes[target]["numinlets"])

    def test_stereo_audio_has_a_direct_unmodified_path(self):
        connections = [entry["patchline"] for entry in self.patch["lines"]]
        for channel in (0, 1):
            self.assertIn({"source": [self.ids["input"], channel],
                           "destination": [self.ids["output"], channel]}, connections)
        self.assertEqual([c for c in connections if c["destination"][0] == self.ids["output"]],
                         [c for c in connections if c["source"][0] == self.ids["input"]])

    def test_remote_and_persistent_reference_have_separate_lifecycles(self):
        boxes = {ent["box"]["varname"]: ent["box"] for ent in self.patch["boxes"]}
        self.assertEqual(boxes["persist"]["saved_object_attributes"]["_persistence"], 1)
        self.assertEqual(boxes["remote"]["saved_object_attributes"]["_persistence"], 0)
        connections = [entry["patchline"] for entry in self.patch["lines"]]
        self.assertIn({"source": [self.ids["chaos_controller"], 1],
                       "destination": [self.ids["remote"], 1]}, connections)
        self.assertIn({"source": [self.ids["chaos_controller"], 2],
                       "destination": [self.ids["persist"], 1]}, connections)
        self.assertIn({"source": [self.ids["persist"], 0],
                       "destination": [self.ids["restore"], 0]}, connections)

    def test_dependencies_are_embedded_and_no_machine_specific_paths_are_saved(self):
        for dep in self.patch["dependency_cache"]:
            self.assertIn(dep["name"], self.files)
            self.assertNotIn("bootpath", dep)
        encoded = json.dumps(self.patch)
        self.assertNotIn("/workspace", encoded)
        self.assertNotIn("/tmp", encoded)

    def test_zip_contains_the_complete_device_and_german_instructions(self):
        with zipfile.ZipFile(self.output / "Set-and-Forget-Chaos.zip") as bundle:
            self.assertIsNone(bundle.testzip())
            self.assertEqual(len(bundle.namelist()), 2)
            self.assertEqual(bundle.read("Set and Forget Chaos/Set and Forget Chaos.amxd"),
                             self.amxd.read_bytes())
            self.assertIn(b"SO GEHT'S", bundle.read("Set and Forget Chaos/LIESMICH.txt"))

    def test_rebuilding_is_byte_for_byte_reproducible(self):
        before = {path.name: path.read_bytes() for path in self.paths}
        build(self.output)
        self.assertEqual(before, {path.name: path.read_bytes() for path in self.paths})

    def test_truncated_archive_is_rejected(self):
        with self.assertRaises(ValueError):
            read_device(self.amxd.read_bytes()[:-16])


if __name__ == "__main__":
    unittest.main()
