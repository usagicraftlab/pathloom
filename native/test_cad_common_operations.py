"""Issue #15: exact non-display transforms for common operations."""
import math
import unittest

from cad_runtime import Runtime, TOLERANCES


XY = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[0, 1, 0])


class CommonTransformTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()

    def evaluate(self, operation, parameters, inputs=None, status="ok"):
        request = dict(
            protocolVersion=1,
            operation=dict(id=operation, version=1),
            parameters=parameters,
            inputs=inputs or {},
            tolerances=TOLERANCES,
        )
        result = self.runtime.handle(dict(type="evaluate", request=request))
        self.assertEqual(result["status"], status, result.get("diagnostics"))
        return result

    def ref(self, output):
        return dict(
            handle=output["handle"],
            geometryHash=output["geometryHash"],
            selector=None,
        )

    def box(self):
        return self.evaluate(
            "solid.box",
            dict(
                plane=XY,
                anchorMode="corner",
                anchor=[0, 0, 0],
                widthMm=10,
                depthMm=20,
                heightMm=30,
            ),
        )["outputs"][0]

    def transform(self, parameters, status="ok"):
        return self.evaluate(
            "shape.transform",
            parameters,
            dict(object=[self.ref(self.box())]),
            status,
        )

    def test_rotate_scale_and_mirror_change_exact_brep(self):
        rotated = self.transform(
            dict(
                mode="rotate",
                axis=dict(origin=[0, 0, 0], direction=[0, 0, 1]),
                angleRad=math.pi / 2,
            )
        )["outputs"][0]["summary"]
        for got, want in zip(rotated["bbox"]["min"], [-20, 0, 0]):
            self.assertAlmostEqual(got, want, places=6)
        for got, want in zip(rotated["bbox"]["max"], [0, 10, 30]):
            self.assertAlmostEqual(got, want, places=6)

        scaled = self.transform(
            dict(mode="scale", center=[0, 0, 0], factor=2)
        )["outputs"][0]["summary"]
        self.assertAlmostEqual(scaled["volumeMm3"], 48000, places=5)
        self.assertEqual(scaled["bbox"]["max"], [20, 40, 60])

        mirrored = self.transform(dict(mode="mirror", plane=XY))["outputs"][0][
            "summary"
        ]
        self.assertAlmostEqual(mirrored["volumeMm3"], 6000, places=5)
        self.assertEqual(mirrored["bbox"]["min"], [0, 0, -30])
        self.assertEqual(mirrored["bbox"]["max"], [10, 20, 0])

    def test_invalid_transform_parameters_fail_without_output(self):
        for parameters in [
            dict(mode="scale", center=[0, 0, 0], factor=0),
            dict(
                mode="rotate",
                axis=dict(origin=[0, 0, 0], direction=[0, 0, 0]),
                angleRad=1,
            ),
            dict(mode="mirror", plane=dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[1, 0, 0])),
        ]:
            result = self.transform(parameters, "failed")
            self.assertEqual(result["outputs"], [])
            self.assertIn(
                result["diagnostics"][0]["code"],
                {"CAD_INPUT_DEGENERATE", "CAD_INPUT_NONFINITE"},
            )

    def test_axis_scale_keeps_pivot_and_exact_volume_without_changing_other_axes(self):
        result = self.transform(dict(mode="scale", center=[5, 10, 15], factor=1,
                                     axisFactors=[2, 1, 1]))["outputs"][0]
        summary = result["summary"]
        self.assertTrue(summary["valid"])
        self.assertAlmostEqual(summary["volumeMm3"], 12000, places=5)
        for got, want in zip(summary["bbox"]["min"], [-5, 0, 0]):
            self.assertAlmostEqual(got, want, places=6)
        for got, want in zip(summary["bbox"]["max"], [15, 20, 30]):
            self.assertAlmostEqual(got, want, places=6)
        exported = self.runtime.handle(dict(type="export", handles=[result["handle"]]))
        fresh = Runtime()
        asset = next(iter(exported["assets"].values()))
        restored = fresh.handle(dict(type="import", hash=result["geometryHash"], asset=asset))
        self.assertAlmostEqual(restored["summary"]["volumeMm3"], 12000, places=5)

    def test_invalid_axis_scale_fails_and_scalar_v1_still_works(self):
        for factors in ([0, 1, 1], [-1, 1, 1], [1, 1], [True, 1, 1]):
            result = self.transform(dict(mode="scale", center=[0, 0, 0], factor=1,
                                         axisFactors=factors), "failed")
            self.assertEqual(result["outputs"], [])
        scalar = self.transform(dict(mode="scale", center=[0, 0, 0], factor=2))
        self.assertAlmostEqual(scalar["outputs"][0]["summary"]["volumeMm3"], 48000, places=5)


if __name__ == "__main__":
    unittest.main()
