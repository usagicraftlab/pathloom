"""Phase 1 correctness regressions against real OCP, without transport mocks."""
import math
import unittest
import test_cad_runtime as fixtures
from cad_runtime import Runtime, TOLERANCES

XY = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[0, 1, 0])

class Phase1OperationTests(unittest.TestCase):
    setUp = fixtures.CadRuntimeTests.setUp
    run_op = fixtures.CadRuntimeTests.run_op
    ref = fixtures.CadRuntimeTests.ref
    box = fixtures.CadRuntimeTests.box
    rectangle = fixtures.CadRuntimeTests.rectangle

    def test_open_shell_and_rational_nurbs_round_trip_into_a_new_runtime(self):
        curve=self.run_op('curve.nurbs',dict(poles=[[0,0,-5],[10,5,0],[20,5,4],[30,0,0]],
            degree=3,knots=[0,1],multiplicities=[4,4],weights=[1,2,2,1],periodic=False))[0]
        line=self.run_op('curve.polyline',dict(points=[[0,0,-5],[10,0,-2],[10,10,1]],closed=False))[0]
        shell=self.run_op('shape.extrude',dict(direction=[0,0,1],distanceMm=10,bothSides=False,cap=False),dict(profile=[self.ref(line)]))[0]
        old=[curve,line,shell];assets=self.r.handle(dict(type='export',handles=[o['handle'] for o in old]))['assets']
        new=Runtime()
        for o in old:
            restored=new.handle(dict(type='import',hash=o['geometryHash'],asset=assets[o['geometryHash']]))
            self.assertEqual(restored['geometryHash'],o['geometryHash'])
            self.assertEqual(restored['kind'],o['kind'])
            self.assertEqual(restored['summary']['closure'],o['summary']['closure'])
            for metric in ['lengthMm','areaMm2','volumeMm3']:
                self.assertAlmostEqual(restored['summary'][metric],o['summary'][metric],places=6)
        from OCP.BRepAdaptor import BRepAdaptor_Curve
        from cad_operations import subshapes,TopAbs_EDGE
        imported=new.handle(dict(type='import',hash=curve['geometryHash'],asset=assets[curve['geometryHash']]))
        nurbs=BRepAdaptor_Curve(subshapes(new.cache[imported['handle']]['shape'],TopAbs_EDGE)[0]).BSpline()
        self.assertEqual(nurbs.Degree(),3)
        self.assertEqual([nurbs.Weight(i) for i in range(1,5)],[1,2,2,1])
        self.assertEqual([nurbs.Knot(i) for i in range(1,3)],[0,1])

    def reply(self, op, parameters, inputs=None):
        return self.r.handle(dict(type='evaluate', request=dict(protocolVersion=1,
            operation=dict(id=op, version=1), parameters=parameters,
            inputs=inputs or {}, tolerances=TOLERANCES)))

    def test_multiple_difference_targets_keep_every_remainder_and_source_role(self):
        a, b, tool = self.box(0), self.box(20), self.box(5)
        refs = [dict(**self.ref(a), sourceKey='body-a'), dict(**self.ref(b), sourceKey='body-b')]
        def cut(arguments):
            return self.run_op('solid.difference', dict(keepTools=True),
                dict(arguments=arguments, tools=[self.ref(tool)]))
        first, reordered = cut(refs), cut(list(reversed(refs)))
        self.assertAlmostEqual(sum(o['summary']['volumeMm3'] for o in first), 1500)
        self.assertEqual({o['slotKey']: o['geometryHash'] for o in first},
                         {o['slotKey']: o['geometryHash'] for o in reordered})
        self.assertAlmostEqual(cut([refs[0]])[0]['summary']['volumeMm3'], 500)
        unchanged = self.run_op('solid.difference', {},
            dict(arguments=[self.ref(b)], tools=[self.ref(tool)]))[0]
        self.assertAlmostEqual(unchanged['summary']['volumeMm3'], 1000)
        self.run_op('solid.difference', {}, dict(arguments=[self.ref(a)], tools=[self.ref(a)]), expect='empty')
        self.assertAlmostEqual(tool['summary']['volumeMm3'], 1000)

    def test_split_slots_use_exact_assets_and_survive_new_runtime(self):
        target = self.box()
        plane = dict(origin=[5, 0, 0], xAxis=[0, 1, 0], yAxis=[0, 0, 1])
        cutter = self.run_op('surface.plane', dict(plane=plane, anchorMode='corner',
            anchor=[5, -5, -5], widthMm=20, heightMm=20))[0]
        def split(target, cutter):
            return self.run_op('solid.split', {}, dict(
                targets=[dict(**self.ref(target), sourceKey='original-body')], cutters=[self.ref(cutter)]))
        first, repeated = split(target, cutter), split(target, cutter)
        self.assertEqual(len(first), 2)
        for o in first: self.assertAlmostEqual(o['summary']['volumeMm3'], 500)
        expected = {o['slotKey']: o['geometryHash'] for o in first}
        self.assertEqual(expected, {o['slotKey']: o['geometryHash'] for o in repeated})
        assets = self.r.handle(dict(type='export', handles=[target['handle'], cutter['handle']]))['assets']
        self.r = Runtime()
        target, cutter = [self.r.handle(dict(type='import', hash=s['geometryHash'], asset=assets[s['geometryHash']]))
                          for s in [target, cutter]]
        self.assertEqual(expected, {o['slotKey']: o['geometryHash'] for o in split(target, cutter)})

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
        nonplanar = self.run_op('curve.polyline', dict(points=[[0,0,0],[10,0,0],[10,10,5]], closed=False))[0]
        reply = self.reply('curve.offset', dict(plane=XY, distanceMm=1, joinStyle='miter'),
                           dict(curve=[self.ref(nonplanar)]))
        self.assertEqual(reply['diagnostics'][0]['code'], 'CAD_INPUT_TYPE')
        reply = self.reply('curve.offset', dict(plane=XY, distanceMm=1, joinStyle='miter', ignored=True),
                           dict(curve=[self.ref(rect)]))
        self.assertEqual(reply['diagnostics'][0]['code'], 'CAD_SCHEMA_UNSUPPORTED')

    def test_open_offset_respects_plane_normal_and_preserves_an_open_result(self):
        line = self.run_op('curve.line',dict(start=[0,0,0],end=[10,0,0]))[0]
        for yaxis, distance, expected_y in [([0,1,0],1,-1),([0,1,0],-1,1),([0,-1,0],1,1)]:
            pl=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=yaxis)
            o=self.run_op('curve.offset',dict(plane=pl,distanceMm=distance,joinStyle='miter'),dict(curve=[self.ref(line)]))[0]
            self.assertAlmostEqual(o['summary']['lengthMm'],10)
            self.assertFalse(o['summary']['closure']['curveClosed'])
            self.assertAlmostEqual(o['summary']['bbox']['min'][1],expected_y)
