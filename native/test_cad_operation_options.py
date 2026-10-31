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
    def test_issue19_baseline_commands_have_normal_and_typed_failure_fixtures(self):
        """Give every baseline creation ledger command explicit normal/failure evidence."""
        normal_cases=[
            ('C01','point.create',dict(point=[3,-4,5]),{}),
            ('C02','curve.line',dict(start=[0,0,0],end=[10,2,0]),{}),
            ('C03','curve.polyline',dict(points=[[0,0,0],[10,0,0],[10,5,0]],closed=False),{}),
            ('C04','curve.rectangle',dict(plane=XY,anchorMode='center',anchor=[0,0,0],widthMm=10,heightMm=5,rounding=False,cornerRadiusMm=1),{}),
            ('C05','curve.polygon',dict(plane=XY,center=[0,0,0],sides=6,radiusMm=4,radiusMode='inscribed',angleRad=.1),{}),
            ('C06','curve.circle',dict(plane=XY,center=[0,0,0],radiusMm=4),{}),
            ('C07','curve.arc',dict(plane=XY,center=[0,0,0],radiusMm=5,startAngleRad=.2,sweepAngleRad=math.pi),{}),
            ('C08','curve.ellipse',dict(plane=XY,center=[0,0,0],radiusUMm=8,radiusVMm=3,angleRad=.25),{}),
            ('C09','curve.nurbs',dict(poles=[[0,0,0],[10,0,5],[20,10,5],[30,10,0]],degree=3,knots=[0,1],multiplicities=[4,4],weights=[1,1,1,1],periodic=False),{}),
            ('C10','curve.interpolate',dict(points=[[0,0,0],[10,0,5],[20,10,0]],closed=False,degree=3,startTangent=None,endTangent=None),{}),
            ('S01','surface.plane',dict(plane=XY,anchorMode='corner',anchor=[0,0,0],widthMm=10,heightMm=5),{}),
            ('S02','surface.corners',dict(points=[[0,0,0],[10,0,0],[10,10,2],[0,10,0]]),{}),
        ]
        for command,operation,parameters,inputs in normal_cases:
            with self.subTest(command=command,kind='normal'):
                output=self.run_op(operation,parameters,inputs)[0]
                self.assertTrue(output['summary']['valid'])
                self.assertTrue(output['geometryHash'])
        profile=self.rectangle()
        extruded=self.run_op('shape.extrude',dict(direction=[0,0,1],distanceMm=7,bothSides=False,cap=True),dict(profile=[self.ref(profile)]))[0]
        self.assertAlmostEqual(extruded['summary']['volumeMm3'],60*40*7)

        failure_cases=[
            ('C01','point.create',dict(point=[0,0]),{},'CAD_INPUT_TYPE'),
            ('C02','curve.line',dict(start=[0,0,0],end=[0,0,0]),{},'CAD_INPUT_DEGENERATE'),
            ('C03','curve.polyline',dict(points=[[0,0,0],[0,0,0]],closed=False),{},'CAD_INPUT_DEGENERATE'),
            ('C04','curve.rectangle',dict(plane=XY,anchorMode='center',anchor=[0,0,0],widthMm=0,heightMm=5,rounding=False,cornerRadiusMm=1),{},'CAD_INPUT_DEGENERATE'),
            ('C05','curve.polygon',dict(plane=XY,center=[0,0,0],sides=2,radiusMm=4,radiusMode='inscribed',angleRad=0),{},'CAD_RESOURCE_LIMIT'),
            ('C06','curve.circle',dict(plane=XY,center=[0,0,0],radiusMm=-1),{},'CAD_INPUT_DEGENERATE'),
            ('C07','curve.arc',dict(plane=XY,center=[0,0,0],radiusMm=5,startAngleRad=0,sweepAngleRad=0),{},'CAD_INPUT_DEGENERATE'),
            ('C08','curve.ellipse',dict(plane=XY,center=[0,0,0],radiusUMm=2,radiusVMm=3,angleRad=0),{},'CAD_INPUT_DEGENERATE'),
            ('C09','curve.nurbs',dict(poles=[[0,0,0],[10,0,0]],degree=1,knots=[0,1],multiplicities=[2,2],weights=[1],periodic=False),{},'CAD_INPUT_TYPE'),
            ('C10','curve.interpolate',dict(points=[[0,0,0],[10,0,0],[20,5,0]],closed=False,degree=2,startTangent=None,endTangent=None),{},'CAD_SCHEMA_UNSUPPORTED'),
            ('S01','surface.plane',dict(plane=XY,anchorMode='corner',anchor=[0,0,0],widthMm=0,heightMm=5),{},'CAD_INPUT_DEGENERATE'),
            ('S02','surface.corners',dict(points=[[0,0,0],[10,0,0]]),{},'CAD_INPUT_MISSING'),
            ('S05','shape.extrude',dict(direction=[0,0,1],distanceMm=0,bothSides=False,cap=True),dict(profile=[self.ref(profile)]),'CAD_INPUT_DEGENERATE'),
        ]
        from cad_runtime import TOLERANCES
        for command,operation,parameters,inputs,code in failure_cases:
            with self.subTest(command=command,kind='failure'):
                self.counter+=1
                request=dict(protocolVersion=1,requestId=str(self.counter),documentId='fixture',documentRevision=0,workspaceEpoch=1,runtimeEpoch=1,sessionId=None,featureId=str(self.counter),featureRevision=1,requestedHash='fixture',previewSequence=0,intent='commit',operation=dict(id=operation,version=1),parameters=parameters,inputs=inputs,tolerances=TOLERANCES)
                before=len(self.r.cache)
                result=self.r.handle(dict(type='evaluate',request=request))
                self.assertEqual(result['status'],'failed',result.get('diagnostics'))
                self.assertEqual(result['outputs'],[])
                self.assertEqual(result['diagnostics'][0]['code'],code)
                self.assertEqual(len(self.r.cache),before)
