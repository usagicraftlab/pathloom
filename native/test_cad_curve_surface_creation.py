"""Issue #16 acceptance fixtures against the real OCP runtime."""

import math
import unittest

from cad_runtime import Runtime, TOLERANCES


XY = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[0, 1, 0])


class CurveSurfaceCreationTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()
        self.sequence = 0

    def evaluate(self, operation, parameters, inputs=None, status="ok"):
        self.sequence += 1
        request = dict(
            protocolVersion=1,
            requestId=str(self.sequence),
            documentId="issue-16",
            documentRevision=0,
            workspaceEpoch=1,
            runtimeEpoch=1,
            sessionId=None,
            featureId=str(self.sequence),
            featureRevision=1,
            requestedHash="fixture",
            previewSequence=0,
            intent="commit",
            operation=dict(id=operation, version=1),
            parameters=parameters,
            inputs=inputs or {},
            tolerances=TOLERANCES,
        )
        result = self.runtime.handle(dict(type="evaluate", request=request))
        self.assertEqual(result["status"], status, result.get("diagnostics"))
        return result

    @staticmethod
    def ref(output, selector=None):
        return dict(
            handle=output["handle"],
            geometryHash=output["geometryHash"],
            selector=selector,
        )

    def line(self, start, end):
        return self.evaluate("curve.line", dict(start=start, end=end))["outputs"][0]

    def plane(self, z=0):
        return self.evaluate(
            "surface.plane",
            dict(
                plane={**XY, "origin": [0, 0, z]},
                anchorMode="corner",
                anchor=[0, 0, z],
                widthMm=20,
                heightMm=20,
            ),
        )["outputs"][0]

    def test_C11_C12_create_spatial_curves_with_recorded_accuracy(self):
        helix = self.evaluate(
            "curve.helix",
            dict(
                axis=dict(
                    origin=[0, 0, 0],
                    direction=[0, 0, 1],
                    referenceDirection=[1, 0, 0],
                ),
                radiusMm=5,
                pitchMm=2,
                turns=2,
                clockwise=False,
                fitToleranceMm=0.001,
            ),
        )["outputs"][0]
        spiral = self.evaluate(
            "curve.spiral",
            dict(
                plane=XY,
                center=[0, 0, 0],
                startRadiusMm=1,
                endRadiusMm=5,
                turns=2,
                clockwise=True,
                fitToleranceMm=0.001,
            ),
        )["outputs"][0]
        self.assertAlmostEqual(helix["summary"]["bbox"]["max"][2], 4, places=5)
        self.assertGreater(helix["summary"]["lengthMm"], math.tau * 5 * 2)
        self.assertAlmostEqual(spiral["summary"]["bbox"]["max"][2], 0, places=6)
        self.assertIn("estimatedMaxDeviationMm", helix["summary"]["accuracy"])

    def test_E13_project_and_pull_return_exact_reselectable_edges(self):
        target = self.plane()
        source = self.line([2, 2, 5], [18, 18, 5])
        for operation, parameters in (
            ("curve.project", dict(direction=[0, 0, -1])),
            ("curve.pull", dict(maxDistanceMm=10)),
        ):
            result = self.evaluate(
                operation,
                parameters,
                dict(curve=[self.ref(source)], targets=[self.ref(target)]),
            )
            self.assertGreaterEqual(len(result["outputs"]), 1)
            for output in result["outputs"]:
                self.assertEqual(output["kind"], "curve")
                self.assertAlmostEqual(output["summary"]["bbox"]["max"][2], 0, places=5)

    def test_E12_boundary_modes_copy_exact_edges_and_validate_selection(self):
        face = self.plane()
        edge = next(item for item in face["summary"]["topology"] if item["kind"] == "edge")
        selector = dict(kind="edge", topologyId=edge["topologyId"], orientation="forward")
        selected = self.evaluate(
            "curve.extractBoundary",
            dict(mode="selected"),
            dict(object=[self.ref(face)], edges=[self.ref(face, selector)]),
        )["outputs"]
        self.assertEqual(len(selected), 1)
        for mode in ("outer", "open", "all"):
            outputs = self.evaluate(
                "curve.extractBoundary",
                dict(mode=mode),
                dict(object=[self.ref(face)]),
            )["outputs"]
            self.assertEqual(len(outputs), 4)

    def test_E14_intersect_section_and_contour_preserve_all_outputs(self):
        face = self.plane()
        box = self.evaluate(
            "solid.box",
            dict(
                plane=XY,
                anchorMode="corner",
                anchor=[0, 0, -5],
                widthMm=10,
                depthMm=10,
                heightMm=10,
            ),
        )["outputs"][0]
        intersect = self.evaluate(
            "shape.intersect",
            {},
            dict(first=[self.ref(face)], second=[self.ref(box)]),
        )["outputs"]
        self.assertEqual(len(intersect), 4)
        contour = self.evaluate(
            "shape.contour",
            dict(
                origin=[0, 0, 0],
                normal=[0, 0, 1],
                spacingMm=2,
                startOffsetMm=-4,
                endOffsetMm=4,
            ),
            dict(objects=[self.ref(box)]),
        )["outputs"]
        self.assertGreater(len(contour), 4)
        section = self.evaluate(
            "shape.section",
            dict(plane=XY),
            dict(objects=[self.ref(box)]),
        )["outputs"][0]
        self.assertAlmostEqual(section["summary"]["lengthMm"], 40, places=5)

    def test_S08_S10_S11_create_surfaces_and_reopen_the_same_brep(self):
        rail1 = self.line([0, 0, 0], [0, 0, 10])
        rail2 = self.line([5, 0, 0], [5, 0, 10])
        section = self.line([0, 0, 0], [5, 0, 0])
        section_end = self.line([0, 0, 10], [5, 0, 10])
        sweep = self.evaluate(
            "surface.sweep2",
            dict(
                cap=False,
                sectionReversed=[False, False],
                sectionStations=[0, 1],
                sampleCount=9,
                sectionSampleCount=9,
                fitToleranceMm=0.01,
            ),
            dict(
                rails=[self.ref(rail1), self.ref(rail2)],
                sections=[self.ref(section), self.ref(section_end)],
            ),
        )["outputs"][0]
        self.assertAlmostEqual(sweep["summary"]["areaMm2"], 50, places=4)
        sweep_accuracy = sweep["summary"]["accuracy"]
        self.assertEqual(sweep_accuracy["exactness"], "approximate")
        self.assertLessEqual(sweep_accuracy["maxDeviationMm"], 0.01)
        self.assertLessEqual(sweep_accuracy["maxRailDeviationMm"], 0.01)
        self.assertLessEqual(sweep_accuracy["maxSectionDeviationMm"], 0.01)

        u = [self.line([0, y, 0], [10, y, 0]) for y in (0, 10)]
        v = [self.line([x, 0, 0], [x, 10, 0]) for x in (0, 10)]
        network = self.evaluate(
            "surface.network",
            dict(intersectionToleranceMm=0.01, fitToleranceMm=0.01),
            dict(
                uCurves=[self.ref(value) for value in u],
                vCurves=[self.ref(value) for value in v],
            ),
        )["outputs"][0]
        patch = self.evaluate(
            "surface.patch",
            dict(sampleCount=9, fitToleranceMm=0.01, smoothness=1),
            dict(boundaries=[self.ref(u[0]), self.ref(u[1])]),
        )["outputs"][0]
        self.assertAlmostEqual(network["summary"]["areaMm2"], 100, places=4)
        self.assertAlmostEqual(patch["summary"]["areaMm2"], 100, places=4)
        self.assertEqual(network["summary"]["accuracy"]["exactness"], "approximate")
        self.assertEqual(network["summary"]["accuracy"]["intersectionToleranceMm"], 0.01)
        self.assertLessEqual(network["summary"]["accuracy"]["maxDeviationMm"], 0.01)
        self.assertEqual(patch["summary"]["accuracy"]["exactness"], "approximate")
        self.assertLessEqual(patch["summary"]["accuracy"]["maxDeviationMm"], 0.01)

        assets = self.runtime.handle(dict(type="export", handles=[patch["handle"]]))[
            "assets"
        ]
        fresh = Runtime()
        restored = fresh.handle(
            dict(type="import", hash=patch["geometryHash"], asset=next(iter(assets.values())))
        )
        self.assertEqual(restored["geometryHash"], patch["geometryHash"])
        self.assertAlmostEqual(restored["summary"]["areaMm2"], 100, places=4)

    def test_S04_S06_S07_S09_modes_and_point_patch(self):
        boundaries = [
            self.line([0, 0, 0], [10, 0, 0]),
            self.line([10, 0, 0], [10, 10, 0]),
            self.line([10, 10, 0], [0, 10, 0]),
            self.line([0, 10, 0], [0, 0, 0]),
        ]
        filling = self.evaluate(
            "surface.edges",
            dict(boundaryReversed=[False, False, False, False]),
            dict(curves=[self.ref(value) for value in boundaries]),
        )["outputs"][0]
        self.assertAlmostEqual(filling["summary"]["areaMm2"], 100, places=4)
        self.assertEqual(filling["summary"]["accuracy"]["boundaryCount"], 4)
        triangle = self.evaluate(
            "surface.edges",
            dict(boundaryReversed=[False, False, False]),
            dict(curves=[self.ref(value) for value in [boundaries[0], boundaries[1], self.line([10, 10, 0], [0, 0, 0])]]),
        )["outputs"][0]
        self.assertAlmostEqual(triangle["summary"]["areaMm2"], 50, places=4)

        profile = self.line([5, 0, 0], [5, 0, 10])
        revolved = self.evaluate(
            "shape.revolve",
            dict(
                axis=dict(origin=[0, 0, 0], direction=[0, 0, 1]),
                startAngleRad=0.2,
                sweepAngleRad=math.pi,
                cap=False,
            ),
            dict(profile=[self.ref(profile)]),
        )["outputs"][0]
        self.assertFalse(revolved["summary"]["closure"]["enclosesVolume"])

        circle = self.evaluate(
            "curve.circle", dict(plane=XY, center=[0, 0, 0], radiusMm=2)
        )["outputs"][0]
        rail = self.line([0, 0, 0], [0, 0, 10])
        sweep = self.evaluate(
            "surface.sweep1",
            dict(
                frameMode="fixed",
                fixedFrame=dict(
                    origin=[0, 0, 0],
                    direction=[0, 0, 1],
                    referenceDirection=[1, 0, 0],
                ),
                sectionReversed=[False],
                sectionSeamParameters=[math.pi / 2],
                cap=True,
            ),
            dict(rail=[self.ref(rail)], sections=[self.ref(circle)]),
        )["outputs"][0]
        self.assertGreater(sweep["summary"]["volumeMm3"], 0)

        second_circle = self.evaluate(
            "curve.circle",
            dict(
                plane={**XY, "origin": [0, 0, 10]},
                center=[0, 0, 10],
                radiusMm=3,
            ),
        )["outputs"][0]
        loft = self.evaluate(
            "surface.loft",
            dict(
                cap=False,
                closed=False,
                style="smooth",
                sectionReversed=[False, True],
                sectionSeamParameters=[math.pi / 2, math.pi],
            ),
            dict(sections=[self.ref(circle), self.ref(second_circle)]),
        )["outputs"][0]
        self.assertGreater(loft["summary"]["areaMm2"], 0)
        closed_sections = [
            self.line([0, 0, 0], [0, 0, 5]),
            self.line([10, 0, 0], [10, 0, 5]),
            self.line([5, 10, 0], [5, 10, 5]),
        ]
        closed_loft = self.evaluate(
            "surface.loft",
            dict(
                cap=False,
                closed=True,
                style="ruled",
                sectionReversed=[False, False, False],
                sectionSeamParameters=[None, None, None],
            ),
            dict(sections=[self.ref(value) for value in closed_sections]),
        )["outputs"][0]
        self.assertTrue(closed_loft["summary"]["valid"])

        point_patch = self.evaluate(
            "surface.patch",
            dict(
                points=[
                    [[0, 0, 0], [10, 0, 0], [20, 0, 0]],
                    [[0, 10, 0], [10, 10, 3], [20, 10, 0]],
                    [[0, 20, 0], [10, 20, 0], [20, 20, 0]],
                ],
                sampleCountU=9,
                sampleCountV=9,
                fitToleranceMm=0.01,
                smoothness=2,
                weight=2,
            ),
        )["outputs"][0]
        self.assertLessEqual(point_patch["summary"]["accuracy"]["maxDeviationMm"], 0.01)

    def test_failures_are_typed_and_publish_no_partial_output(self):
        line = self.line([0, 0, 0], [10, 0, 0])
        cases = [
            ("curve.helix", dict(axis=dict(origin=[0, 0, 0], direction=[0, 0, 0]), radiusMm=1, pitchMm=1, turns=1), {}),
            ("curve.spiral", dict(plane=XY, center=[0, 0, 0], startRadiusMm=-1, endRadiusMm=5, turns=2, clockwise=False, fitToleranceMm=.001), {}),
            ("curve.extractBoundary", dict(mode="all"), {}),
            ("curve.project", dict(direction=[0, 0, -1]), {}),
            ("shape.intersect", {}, {}),
            ("surface.edges", dict(boundaryReversed=[]), {}),
            ("shape.revolve", dict(axis=dict(origin=[0, 0, 0], direction=[0, 0, 1]), startAngleRad=0, sweepAngleRad=math.pi, cap=False), {}),
            ("surface.sweep1", dict(frameMode="corrected-frame", sectionReversed=[], sectionSeamParameters=[], cap=False), {}),
            ("surface.sweep2", dict(cap=False, sectionReversed=[], sectionStations=None, sampleCount=9, sectionSampleCount=9, fitToleranceMm=.01), {}),
            ("surface.loft", dict(cap=False, closed=False, style="smooth", sectionReversed=[], sectionSeamParameters=[]), {}),
            ("surface.network", dict(intersectionToleranceMm=0.001, fitToleranceMm=0.01), dict(uCurves=[self.ref(line)], vCurves=[self.ref(line)])),
            ("surface.patch", dict(points=None, sampleCountU=9, sampleCountV=9, fitToleranceMm=.01, smoothness=1, weight=1), {}),
            ("shape.contour", dict(origin=[0, 0, 0], normal=[0, 0, 1], spacingMm=0, startOffsetMm=0, endOffsetMm=1), dict(objects=[self.ref(self.plane())])),
        ]
        for operation, parameters, inputs in cases:
            failed = self.evaluate(operation, parameters, inputs, "failed")
            self.assertEqual(failed["outputs"], [])
            self.assertTrue(failed["diagnostics"][0]["code"].startswith("CAD_"))


if __name__ == "__main__":
    unittest.main()
