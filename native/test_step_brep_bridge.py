import importlib.util
import tempfile
import unittest
from pathlib import Path

from step_brep_bridge import inspect_usd_brep, load_step_as_occt_brep, move_usd_faces


HAS_OCP = importlib.util.find_spec("OCP") is not None
HAS_USD_BREP = importlib.util.find_spec("usd_brep") is not None


@unittest.skipUnless(HAS_OCP, "cadquery-ocp is not installed")
class StepImportTests(unittest.TestCase):
    def test_step_reader_preserves_a_native_occt_brep_file(self):
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
        from OCP.STEPControl import STEPControl_AsIs, STEPControl_Writer

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            step_path = root / "box.step"
            brep_path = root / "box.brep"
            writer = STEPControl_Writer()
            self.assertEqual(writer.Transfer(BRepPrimAPI_MakeBox(10, 20, 30).Shape(), STEPControl_AsIs).value, 1)
            self.assertEqual(writer.Write(str(step_path)).value, 1)
            load_step_as_occt_brep(step_path, brep_path)
            self.assertGreater(brep_path.stat().st_size, 0)


@unittest.skipUnless(HAS_USD_BREP, "NVIDIA usd-brep is not installed")
class UsdBrepInspectionTests(unittest.TestCase):
    def test_inspection_returns_exact_face_metadata_and_render_mesh(self):
        import usd_brep

        with tempfile.TemporaryDirectory() as directory:
            usd_path = Path(directory) / "box.usda"
            usd_brep.usd.export_brep(usd_brep.create_box((0, 0, 0), 10, 20, 30), str(usd_path))
            result = inspect_usd_brep(usd_path)
        self.assertTrue(result["success"])
        brep = result["breps"][0]
        self.assertEqual(len(brep["faces"]), 6)
        self.assertTrue(all(face["planar"] for face in brep["faces"]))
        self.assertEqual(len(brep["mesh"]["positions"]) % 3, 0)
        self.assertEqual(len(brep["mesh"]["indices"]) % 3, 0)
        self.assertTrue(brep["mesh"]["indices"])
        self.assertEqual(len(brep["mesh"]["triangleFaces"]), len(brep["mesh"]["indices"]) // 3)
        self.assertEqual(set(brep["mesh"]["triangleFaces"]), set(range(6)))

    def test_xy_face_move_updates_the_exact_brep_and_preserves_the_asset_on_failure(self):
        import usd_brep

        with tempfile.TemporaryDirectory() as directory:
            usd_path = Path(directory) / "box.usda"
            usd_brep.usd.export_brep(usd_brep.create_box((0, 0, 0), 10, 20, 30), str(usd_path))
            # Face 3 is the +X side; the kernel adds the swept CAD volume and stitches it.
            moved = move_usd_faces(usd_path, 0, [3], 2, 0)
            updated = moved["breps"][0]
            self.assertEqual(len(updated["mesh"]["triangleFaces"]), len(updated["mesh"]["indices"]) // 3)
            self.assertGreaterEqual(len(updated["faces"]), 6)
            imported = usd_brep.usd.import_breps(str(usd_path), heal=False)[0]
            self.assertTrue(imported.is_manifold_solid())
            self.assertAlmostEqual(imported.volume(), 7200, places=4)
            self.assertAlmostEqual(imported.bounding_box()[1][0], 12, places=3)

            original = usd_path.read_bytes()
            with self.assertRaisesRegex(RuntimeError, "CAD face move failed"):
                # Moving a horizontal face only tangentially has no sweep volume.
                move_usd_faces(usd_path, 0, [1], 2, 0)
            self.assertEqual(usd_path.read_bytes(), original)

            inward_path = Path(directory) / "inward.usda"
            usd_brep.usd.export_brep(usd_brep.create_box((0, 0, 0), 10, 20, 30), str(inward_path))
            move_usd_faces(inward_path, 0, [3], -2, 0)
            inward = usd_brep.usd.import_breps(str(inward_path), heal=False)[0]
            self.assertTrue(inward.is_manifold_solid())
            self.assertAlmostEqual(inward.volume(), 4800, places=4)
            self.assertAlmostEqual(inward.bounding_box()[1][0], 8, places=3)

            multi_path = Path(directory) / "multi.usda"
            usd_brep.usd.export_brep(usd_brep.create_box((0, 0, 0), 10, 20, 30), str(multi_path))
            move_usd_faces(multi_path, 0, [3, 5], 1, 1)
            multi = usd_brep.usd.import_breps(str(multi_path), heal=False)[0]
            self.assertTrue(multi.is_manifold_solid())
            self.assertAlmostEqual(multi.volume(), 6900, places=4)


if __name__ == "__main__":
    unittest.main()
