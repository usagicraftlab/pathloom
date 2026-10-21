import math
import unittest
import test_cad_runtime as fixtures
XY=fixtures.XY
class CadOperationOptions(unittest.TestCase):
    setUp=fixtures.CadRuntimeTests.setUp
    run_op=fixtures.CadRuntimeTests.run_op
    ref=fixtures.CadRuntimeTests.ref
    rectangle=fixtures.CadRuntimeTests.rectangle
    extrude=fixtures.CadRuntimeTests.extrude
    box=fixtures.CadRuntimeTests.box
    def test_creation_and_reverse_options(self):
        cases=[('point.create',dict(point=[3,-4,-10])),('curve.circle',dict(plane=XY,center=[1,2,3],radiusMm=4)),('curve.arc',dict(plane=XY,center=[0,0,0],radiusMm=5,startAngleRad=0,sweepAngleRad=-math.pi)),('curve.ellipse',dict(plane=XY,center=[0,0,-4],radiusUMm=10,radiusVMm=5,angleRad=.2)),('curve.polygon',dict(plane=XY,center=[0,0,0],sides=5,radiusMm=10,radiusMode='circumscribed',angleRad=0)),('solid.sphere',dict(center=[0,0,-10],radiusMm=5)),('shape.cylinder',dict(axis=dict(origin=[0,0,0],direction=[0,0,1]),radiusMm=3,heightMm=10,cap=True)),('shape.cylinder',dict(axis=dict(origin=[0,0,0],direction=[0,0,1]),radiusMm=3,heightMm=10,cap=False)),('shape.cone',dict(axis=dict(origin=[0,0,0],direction=[0,0,1]),bottomRadiusMm=5,topRadiusMm=2,heightMm=10,cap=True)),('shape.cone',dict(axis=dict(origin=[0,0,0],direction=[0,0,1]),bottomRadiusMm=5,topRadiusMm=0,heightMm=10,cap=False)),('solid.torus',dict(axis=dict(origin=[0,0,0],direction=[0,0,1]),majorRadiusMm=10,minorRadiusMm=2)),('curve.nurbs',dict(poles=[[0,0,0],[10,0,5],[20,10,5],[30,10,0]],degree=3,knots=[0,1],multiplicities=[4,4],weights=[1,1,1,1],periodic=False)),('curve.interpolate',dict(points=[[0,0,0],[10,0,5],[20,10,0]],closed=False,degree=3,startTangent=None,endTangent=None))]
        for op,p in cases:
            with self.subTest(op=op,p=p):
                a=self.run_op(op,p)[0];self.assertTrue(a['summary']['valid']);assets=self.r.handle(dict(type='export',handles=[a['handle']]))['assets'];self.assertIn(a['geometryHash'],assets)
        a=self.rectangle();b=self.run_op('curve.reverse',{},dict(object=[self.ref(a)]))[0];self.assertAlmostEqual(a['summary']['lengthMm'],b['summary']['lengthMm'])
    def test_rounded_rectangle_loses_sharp_semantics(self):
        p=dict(plane=XY,anchorMode='center',anchor=[0,0,0],widthMm=60,heightMm=40,rounding=True,cornerRadiusMm=3);a=self.run_op('curve.rectangle',p)[0];self.assertAlmostEqual(a['summary']['lengthMm'],200-24+6*math.pi);b=self.extrude(a);self.assertFalse(any(t['semanticPath']==['side','corner','11'] for t in b['summary']['topology']));self.run_op('curve.rectangle',{**p,'cornerRadiusMm':30},expect='failed')
    def test_revolve_section_untrim_and_ruled_edges(self):
        line=self.run_op('curve.line',dict(start=[5,0,0],end=[5,0,10]))[0];o=self.run_op('shape.revolve',dict(axis=dict(origin=[0,0,0],direction=[0,0,1]),startAngleRad=0,sweepAngleRad=2*math.pi,cap=False),dict(profile=[self.ref(line)]))[0];self.assertAlmostEqual(o['summary']['areaMm2'],100*math.pi,places=5)
        box=self.box();pl={**XY,'origin':[0,0,5]};section=self.run_op('shape.section',dict(plane=pl),dict(objects=[self.ref(box)]))[0];self.assertAlmostEqual(section['summary']['lengthMm'],40)
        a=self.run_op('curve.line',dict(start=[0,0,0],end=[20,0,0]))[0];b=self.run_op('curve.line',dict(start=[0,0,10],end=[20,0,10]))[0];face=self.run_op('surface.edges',{},dict(curves=[self.ref(a),self.ref(b)]))[0];self.assertAlmostEqual(face['summary']['areaMm2'],200)
        plface=self.run_op('surface.plane',dict(plane=XY,anchor=[0,0,0],anchorMode='corner',widthMm=10,heightMm=10))[0];untrim=self.run_op('surface.untrim',dict(domain=[-20,20,-20,20]),dict(surface=[self.ref(plface)]))[0];self.assertAlmostEqual(untrim['summary']['areaMm2'],1600)
    def test_invalid_geometry_does_not_publish(self):
        before=len(self.r.cache);self.run_op('curve.line',dict(start=[0,0,0],end=[0,0,0]),expect='failed');self.assertEqual(before,len(self.r.cache));self.run_op('curve.circle',dict(plane=XY,center=[0,0,0],radiusMm=-1),expect='failed');self.run_op('unregistered.operation',{},expect='failed');self.assertEqual(before,len(self.r.cache))
