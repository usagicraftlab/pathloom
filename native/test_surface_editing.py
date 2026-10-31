"""Issue #17: exact/declared-approximate surface editing acceptance fixtures."""
import unittest

import test_cad_runtime as fixtures
from cad_runtime import Runtime

XY = fixtures.XY


class SurfaceEditingTests(unittest.TestCase):
    setUp = fixtures.CadRuntimeTests.setUp
    run_op = fixtures.CadRuntimeTests.run_op
    ref = fixtures.CadRuntimeTests.ref
    box = fixtures.CadRuntimeTests.box

    def plane(self, origin=(0, 0, 0), width=10, height=10):
        return self.run_op("surface.plane", dict(plane=XY, anchorMode="corner",
            anchor=list(origin), widthMm=width, heightMm=height))[0]

    def cutter(self, x=5):
        return self.run_op("surface.corners", dict(points=[
            [x, -5, -5], [x, 15, -5], [x, 15, 15], [x, -5, 15]]))[0]

    def topology_ref(self, output, kind, predicate=lambda item: True):
        item = next(item for item in output["summary"]["topology"]
                    if item["kind"] == kind and predicate(item))
        return self.ref(output, dict(kind=kind, topologyId=item["topologyId"],
            orientation="forward"))

    def test_trim_split_extend_and_boundaries(self):
        surface, cutter = self.plane(), self.cutter()
        split = self.run_op("shape.splitFace", dict(mode="split"), dict(
            face=[self.topology_ref(surface, "face")], cutters=[self.ref(cutter)]))
        self.assertEqual(len(split), 2)
        self.assertAlmostEqual(sum(part["summary"]["areaMm2"] for part in split), 100)
        trim = self.run_op("surface.trim", dict(mode="trim", keepPoint=[2, 2, 0]), dict(
            surface=[self.ref(surface)], cutters=[self.ref(cutter)]))[0]
        self.assertAlmostEqual(trim["summary"]["areaMm2"], 50)
        extended = self.run_op("surface.extend", dict(side="uEnd", parameterDelta=5),
            dict(surface=[self.ref(surface)]))[0]
        self.assertAlmostEqual(extended["summary"]["areaMm2"], 150)
        boundaries = self.run_op("shape.boundaries", dict(mode="open"),
            dict(object=[self.ref(surface)]))
        self.assertEqual(len(boundaries), 4)

    def test_extract_reverse_offset_and_solidify(self):
        box = self.box(); face_ref = self.topology_ref(box, "face")
        extracted = self.run_op("surface.extract", dict(keepOriginal=True), dict(
            object=[self.ref(box)], faces=[face_ref]))[0]
        self.assertEqual(extracted["kind"], "surface")
        reversed_face = self.run_op("surface.reverse", {}, dict(object=[self.ref(extracted)]))[0]
        self.assertAlmostEqual(reversed_face["summary"]["areaMm2"], extracted["summary"]["areaMm2"])
        face = self.plane()
        sides = self.run_op("surface.offset", dict(distanceMm=1, directionMode="normal",
            bothSides=True, solidify=False), dict(surface=[self.ref(face)]))
        self.assertEqual(len(sides), 2)
        self.assertEqual({round(side["summary"]["bbox"]["min"][2]) for side in sides}, {-1, 1})
        thick = self.run_op("surface.offset", dict(distanceMm=1, directionMode="normal",
            bothSides=False, solidify=True), dict(surface=[self.ref(face)]))[0]
        self.assertGreater(thick["summary"]["volumeMm3"], 0)

    def test_selected_untrim_removes_only_the_chosen_inner_boundary(self):
        outer = self.run_op("curve.rectangle", dict(plane=XY, anchorMode="corner",
            anchor=[0, 0, 0], widthMm=10, heightMm=10, rounding=False,
            cornerRadiusMm=1))[0]
        inner = self.run_op("curve.rectangle", dict(plane=XY, anchorMode="corner",
            anchor=[3, 3, 0], widthMm=4, heightMm=4, rounding=False,
            cornerRadiusMm=1))[0]
        region = self.run_op("surface.planarRegion", {}, dict(
            boundaries=[self.ref(outer), self.ref(inner)]))[0]
        self.assertAlmostEqual(region["summary"]["areaMm2"], 84)
        inner_edge = self.topology_ref(region, "edge", lambda item:
            2.9 < item["fingerprint"]["centroid"][0] < 7.1 and
            2.9 < item["fingerprint"]["centroid"][1] < 7.1)
        restored = self.run_op("surface.untrim", dict(mode="selected",
            domain=[0, 10, 0, 10]), dict(surface=[self.ref(region)],
            boundaries=[inner_edge]))[0]
        self.assertAlmostEqual(restored["summary"]["areaMm2"], 100)

    def test_blend_match_fillet_and_chamfer_are_explicit_connectors(self):
        first, second = self.plane(), self.plane((20, 0, 0))
        first_edge = self.topology_ref(first, "edge", lambda item:
            abs(item["fingerprint"]["centroid"][0] - 10) < 1e-7)
        second_edge = self.topology_ref(second, "edge", lambda item:
            abs(item["fingerprint"]["centroid"][0] - 20) < 1e-7)
        inputs = dict(first=[self.ref(first)], firstEdge=[first_edge],
                      second=[self.ref(second)], secondEdge=[second_edge])
        cases = [("surface.fillet", dict(radiusMm=2, trim=False, join=False)),
                 ("surface.chamfer", dict(distanceMm=2, trim=False, join=False))]
        cases += [(operation, dict(continuity=continuity, fitToleranceMm=.01))
                  for operation in ("surface.blend", "surface.match")
                  for continuity in ("G0", "G1", "G2")]
        for operation, parameters in cases:
            with self.subTest(operation=operation):
                output = self.run_op(operation, parameters, inputs)[0]
                self.assertEqual(output["kind"], "surface")
                self.assertTrue(output["summary"]["valid"])
                self.assertIn("accuracy", output["summary"])
                self.assertEqual(output["summary"]["accuracy"]["exactness"], "approximate")
                self.assertEqual(output["summary"]["accuracy"]["fitToleranceMm"], .01)
                self.assertIn("maxBoundaryDeviationMm", output["summary"]["accuracy"])
                self.assertEqual(output["summary"]["accuracy"]["achievedContinuity"],
                                 output["summary"]["accuracy"]["continuity"])
        joined = self.run_op("surface.chamfer", dict(distanceMm=2, trim=True,
            join=True), inputs)[0]
        self.assertEqual(joined["kind"], "shell")
        self.assertTrue(joined["summary"]["accuracy"]["joined"])
        self.assertTrue(joined["summary"]["accuracy"]["trimAtSelectedBoundaries"])

    def test_rebuild_edit_poles_and_typed_failure(self):
        face = self.run_op("surface.corners", dict(points=[
            [0, 0, 0], [10, 0, 0], [10, 10, 3], [0, 10, 0]]))[0]
        rebuilt = self.run_op("surface.rebuild", dict(uDegree=3, vDegree=3,
            maxSegments=16, acceptApproximation=True), dict(surface=[self.ref(face)]))[0]
        self.assertTrue(rebuilt["summary"]["valid"])
        self.assertIn("maxDeviationMm", rebuilt["summary"]["accuracy"])
        self.assertEqual(rebuilt["summary"]["accuracy"]["exactness"], "approximate")
        self.assertEqual(rebuilt["summary"]["accuracy"]["classification"],
                         "sampled-corresponding-parameter")
        self.assertLessEqual(rebuilt["summary"]["accuracy"]["maxDeviationMm"], .01)
        edited = self.run_op("surface.editPoles", dict(uIndex=1, vIndex=1,
            position=[0, 0, 1]), dict(surface=[self.ref(rebuilt)]))[0]
        self.assertGreater(edited["summary"]["bbox"]["max"][2], 0)
        self.run_op("surface.editPoles", dict(uIndex=999, vIndex=1,
            position=[0, 0, 1]), dict(surface=[self.ref(rebuilt)]), expect="failed")

        assets = self.r.handle(dict(type="export", handles=[
            rebuilt["handle"], edited["handle"]]))["assets"]
        fresh = Runtime()
        for output in (rebuilt, edited):
            restored = fresh.handle(dict(type="import", hash=output["geometryHash"],
                asset=assets[output["geometryHash"]]))
            self.assertEqual(restored["geometryHash"], output["geometryHash"])
            self.assertEqual(restored["kind"], output["kind"])
            self.assertEqual(restored["summary"]["bbox"], output["summary"]["bbox"])

    def test_move_face_detach_and_integrated_push_pull(self):
        box = self.box()
        top = self.topology_ref(box, "face", lambda item:
            abs(item["fingerprint"]["centroid"][2] - 10) < 1e-7)
        detached = self.run_op("shape.moveFace", dict(mode="detach", operation="add",
            translation=[0, 0, 2]), dict(body=[self.ref(box)], face=[top]))[0]
        self.assertEqual(detached["kind"], "surface")
        self.assertAlmostEqual(detached["summary"]["bbox"]["max"][2], 12)
        pushed = self.run_op("shape.moveFace", dict(mode="pushPull", operation="add",
            translation=[0, 0, 2]), dict(body=[self.ref(box)], face=[top]))[0]
        self.assertAlmostEqual(pushed["summary"]["volumeMm3"], 1200)
        self.run_op("shape.moveFace", dict(mode="pushPull", operation="invalid",
            translation=[0, 0, 2]), dict(body=[self.ref(box)], face=[top]),
            expect="failed")

    def test_typed_failures_do_not_silently_choose_geometry(self):
        face = self.plane(); cutter = self.cutter()
        missing = [
            ("surface.join", {}, {}),
            ("surface.explode", {"keepOriginal": False}, {}),
            ("surface.untrim", {"mode": "all", "domain": [-20, 20, -20, 20]}, {}),
            ("surface.fillet", {"radiusMm": 1, "trim": False, "join": False}, {}),
            ("surface.blend", {"continuity": "G1", "fitToleranceMm": .01}, {}),
            ("surface.match", {"continuity": "G1", "fitToleranceMm": .01}, {}),
            ("surface.rebuild", {"uDegree": 3, "vDegree": 3, "maxSegments": 16, "acceptApproximation": False}, {}),
            ("surface.reverse", {}, {}),
            ("shape.moveFace", {"mode": "detach", "operation": "add", "translation": [0, 0, 1]}, {}),
            ("shape.splitFace", {"mode": "split"}, {}),
        ]
        for operation, parameters, inputs in missing:
            with self.subTest(operation=operation):
                self.run_op(operation, parameters, inputs, expect="failed")
        self.run_op("surface.trim", dict(mode="trim", keepPoint=[5, 5, 0]),
            dict(surface=[self.ref(face)], cutters=[self.ref(cutter)]), expect="failed")
        self.run_op("surface.extend", dict(side="invalid", parameterDelta=1),
            dict(surface=[self.ref(face)]), expect="failed")
        self.run_op("surface.offset", dict(distanceMm=1, directionMode="sideways",
            bothSides=False, solidify=False), dict(surface=[self.ref(face)]),
            expect="failed")
        self.run_op("shape.boundaries", dict(mode="invalid"),
            dict(object=[self.ref(face)]), expect="failed")


if __name__ == "__main__": unittest.main()
