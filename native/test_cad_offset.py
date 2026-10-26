"""AUD-004 (P1-04): curve.offset must actually process and validate its plane.

Extracted for Issue #7 from the Phase 1 separation source (PR #2), re-based on
current main. Runs against real OCP through the shared runtime fixtures.
"""
import math
import unittest
import test_cad_runtime as fixtures
from cad_runtime import TOLERANCES

XY = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[0, 1, 0])


class OffsetPlaneTests(unittest.TestCase):
    setUp = fixtures.CadRuntimeTests.setUp
    run_op = fixtures.CadRuntimeTests.run_op
    ref = fixtures.CadRuntimeTests.ref
    rectangle = fixtures.CadRuntimeTests.rectangle

    def reply(self, op, parameters, inputs=None):
        return self.r.handle(dict(type='evaluate', request=dict(protocolVersion=1,
            operation=dict(id=op, version=1), parameters=parameters,
            inputs=inputs or {}, tolerances=TOLERANCES)))

    def test_offset_uses_requested_planes_and_distance_sign(self):
        planes = [XY,
            dict(origin=[2, 3, 7], xAxis=[1, 0, 0], yAxis=[0, 0, 1]),
            dict(origin=[2, 3, 7], xAxis=[0, 1, 0], yAxis=[0, 0, 1]),
            dict(origin=[2, 3, 7], xAxis=[1, 0, 0], yAxis=[0, math.cos(.4), math.sin(.4)])]
        for plane in planes:
            with self.subTest(plane=plane):
                rect = self.run_op('curve.rectangle', dict(plane=plane, anchorMode='center',
                    anchor=plane['origin'], widthMm=60, heightMm=40, rounding=False, cornerRadiusMm=1))[0]
                for distance, length in [(1, 208), (-1, 192)]:
                    result = self.run_op('curve.offset', dict(plane=plane, distanceMm=distance,
                        joinStyle='miter'), dict(curve=[self.ref(rect)]))[0]
                    self.assertAlmostEqual(result['summary']['lengthMm'], length, places=5)
                rounded = self.run_op('curve.offset', dict(plane=plane, distanceMm=1,
                    joinStyle='round'), dict(curve=[self.ref(rect)]))[0]
                self.assertAlmostEqual(rounded['summary']['lengthMm'], 200 + 2*math.pi, places=5)

    def test_offset_rejects_invalid_or_mismatched_plane_and_unknown_settings(self):
        rect = self.rectangle()
        for plane, code in [
            (dict(origin=[0, 0, 0], xAxis=[0, 0, 0], yAxis=[0, 0, 0]), 'CAD_INPUT_DEGENERATE'),
            (dict(origin=[0, 0, 1], xAxis=[1, 0, 0], yAxis=[0, 1, 0]), 'CAD_INPUT_TYPE'),
            (dict(origin=[0, 0, 0], xAxis=[0, 1, 0], yAxis=[0, 0, 1]), 'CAD_INPUT_TYPE')]:
            reply = self.reply('curve.offset', dict(plane=plane, distanceMm=1, joinStyle='miter'),
                               dict(curve=[self.ref(rect)]))
            self.assertEqual(reply['status'], 'failed')
            self.assertEqual(reply['diagnostics'][0]['code'], code)
        nonplanar = self.run_op('curve.polyline', dict(points=[[0, 0, 0], [10, 0, 0], [10, 10, 5]], closed=False))[0]
        reply = self.reply('curve.offset', dict(plane=XY, distanceMm=1, joinStyle='miter'),
                           dict(curve=[self.ref(nonplanar)]))
        self.assertEqual(reply['diagnostics'][0]['code'], 'CAD_INPUT_TYPE')
        reply = self.reply('curve.offset', dict(plane=XY, distanceMm=1, joinStyle='miter', ignored=True),
                           dict(curve=[self.ref(rect)]))
        self.assertEqual(reply['diagnostics'][0]['code'], 'CAD_SCHEMA_UNSUPPORTED')

    def test_open_offset_respects_plane_normal_and_preserves_an_open_result(self):
        line = self.run_op('curve.line', dict(start=[0, 0, 0], end=[10, 0, 0]))[0]
        for yaxis, distance, expected_y in [([0, 1, 0], 1, -1), ([0, 1, 0], -1, 1), ([0, -1, 0], 1, 1)]:
            pl = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=yaxis)
            o = self.run_op('curve.offset', dict(plane=pl, distanceMm=distance, joinStyle='miter'), dict(curve=[self.ref(line)]))[0]
            self.assertAlmostEqual(o['summary']['lengthMm'], 10)
            self.assertFalse(o['summary']['closure']['curveClosed'])
            self.assertAlmostEqual(o['summary']['bbox']['min'][1], expected_y)


if __name__ == '__main__':
    unittest.main()
