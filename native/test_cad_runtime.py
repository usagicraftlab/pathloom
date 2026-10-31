"""Numerical acceptance evidence against the real OCP kernel (no geometry mocks)."""
import unittest, math, json, subprocess, sys
from cad_runtime import Runtime,TOLERANCES
XY=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=[0,1,0])
class CadRuntimeTests(unittest.TestCase):
    def setUp(self):self.r=Runtime();self.counter=0
    def run_op(self,op,p,inputs=None,expect='ok'):
        self.counter+=1;q=dict(protocolVersion=1,requestId=str(self.counter),documentId='fixture',documentRevision=0,workspaceEpoch=1,runtimeEpoch=1,sessionId=None,featureId=str(self.counter),featureRevision=1,requestedHash='fixture',previewSequence=0,intent='commit',operation=dict(id=op,version=1),parameters=p,inputs=inputs or {},tolerances=TOLERANCES)
        a=self.r.handle(dict(type='evaluate',request=q));self.assertEqual(a['status'],expect,str(a.get('diagnostics')));return a['outputs']
    def ref(self,o,sel=None):return dict(handle=o['handle'],geometryHash=o['geometryHash'],selector=sel)
    def rectangle(self,w=60,center=[0,0,0]):return self.run_op('curve.rectangle',dict(plane=XY,anchorMode='center',anchor=center,widthMm=w,heightMm=40,rounding=False,cornerRadiusMm=1))[0]
    def extrude(self,o,cap=True,d=25):return self.run_op('shape.extrude',dict(direction=[0,0,1],distanceMm=d,bothSides=False,cap=cap),dict(profile=[self.ref(o)]))[0]
    def test_T01_rectangle_center(self):
        a=self.rectangle(center=[10,20,0]);self.assertEqual(a['summary']['bbox'],dict(min=[-20.,0.,0.],max=[40.,40.,0.]))
        b=self.rectangle(80,[10,20,0]);self.assertEqual(b['summary']['bbox']['min'][0],-30);self.assertEqual(b['summary']['bbox']['max'][0],50)
    def test_T08_open_extrude(self):
        a=self.run_op('curve.polyline',dict(points=[[0,0,0],[20,0,0],[20,10,0]],closed=False))[0];b=self.extrude(a,False,10)
        self.assertEqual(b['kind'],'shell');self.assertAlmostEqual(b['summary']['areaMm2'],300);self.assertFalse(b['summary']['closure']['enclosesVolume'])
    def test_T09_open_loft(self):
        a=self.run_op('curve.line',dict(start=[0,0,0],end=[20,0,0]))[0];b=self.run_op('curve.line',dict(start=[0,0,10],end=[20,0,10]))[0]
        c=self.run_op('surface.loft',dict(cap=False,closed=False,style='smooth',sectionReversed=[]),dict(sections=[self.ref(a),self.ref(b)]))[0]
        self.assertAlmostEqual(c['summary']['areaMm2'],200);self.assertFalse(c['summary']['closure']['enclosesVolume'])
    def test_T10_extrude_and_T11_semantic_fillet(self):
        for w in (60,80):
            b=self.extrude(self.rectangle(w));self.assertAlmostEqual(b['summary']['volumeMm3'],w*40*25)
            edges=[t for t in b['summary']['topology'] if t['kind']=='edge' and t['semanticPath']==['side','corner','11']];self.assertEqual(len(edges),1)
            c=self.run_op('solid.fillet',dict(radiusMm=2,tangentChain=False),dict(body=[self.ref(b)],edges=[self.ref(b,dict(kind='edge',topologyId=edges[0]['topologyId'],orientation='forward'))]))[0]
            self.assertLess(c['summary']['volumeMm3'],b['summary']['volumeMm3']);self.assertTrue(c['summary']['valid'])
    def box(self,x=0):return self.run_op('solid.box',dict(plane=XY,anchorMode='corner',anchor=[x,0,0],widthMm=10,depthMm=10,heightMm=10))[0]
    def test_T19_boolean_and_T20_empty(self):
        a,b=self.box(),self.box(5)
        for op,v in [('solid.union',1500),('solid.difference',500),('solid.intersection',500)]:
            o=self.run_op(op,{},dict(arguments=[self.ref(a)],tools=[self.ref(b)]))[0];self.assertAlmostEqual(o['summary']['volumeMm3'],v);self.assertEqual(o['kind'],'solid')
        b=self.box(20);o=self.run_op('solid.intersection',{},dict(arguments=[self.ref(a)],tools=[self.ref(b)]),expect='empty')[0];self.assertTrue(o['summary']['empty'])
        o=self.run_op('solid.difference',{},dict(arguments=[self.ref(a)],tools=[self.ref(b)]))[0];self.assertAlmostEqual(o['summary']['volumeMm3'],1000)
    def test_T13_open_surface_join(self):
        p=dict(plane=XY,anchorMode='corner',anchor=[0,0,0],widthMm=10,heightMm=10)
        a=self.run_op('surface.plane',p)[0];b=self.run_op('surface.plane',{**p,'anchor':[10,0,0]})[0]
        c=self.run_op('surface.join',{},dict(objects=[self.ref(a),self.ref(b)]))[0];self.assertAlmostEqual(c['summary']['areaMm2'],200);self.assertFalse(c['summary']['closure']['enclosesVolume'])
    def test_T24_negative_nonplanar_and_T25_assets(self):
        a=self.run_op('curve.polyline',dict(points=[[0,0,-10],[10,2,5],[20,10,-3]],closed=False))[0];b=self.extrude(self.rectangle())
        assets=self.r.handle(dict(type='export',handles=[a['handle'],b['handle']]))['assets'];new=Runtime()
        for hash,asset in assets.items():
            c=new.handle(dict(type='import',hash=hash,asset=asset));self.assertEqual(c['geometryHash'],hash);old=a if hash==a['geometryHash'] else b
            self.assertEqual(c['kind'],old['kind']);[self.assertAlmostEqual(x,y,places=6) for key in ('min','max') for x,y in zip(c['summary']['bbox'][key],old['summary']['bbox'][key])];self.assertAlmostEqual(c['summary']['volumeMm3'],old['summary']['volumeMm3']);self.assertAlmostEqual(c['summary']['lengthMm'],old['summary']['lengthMm'])
        corrupted=dict(next(iter(assets.values())));corrupted['data']+='x'
        with self.assertRaisesRegex(ValueError,'hash'):new.handle(dict(type='import',hash=hash,asset=corrupted))
    def test_T06_T07_join_and_explode(self):
        a=self.run_op('curve.line',dict(start=[0,0,0],end=[10,0,0]))[0];b=self.run_op('curve.line',dict(start=[10,0,0],end=[20,5,0]))[0]
        joined=self.run_op('curve.join',{},dict(objects=[self.ref(a),self.ref(b)]))[0];self.assertFalse(joined['summary']['closure']['curveClosed']);self.assertAlmostEqual(joined['summary']['lengthMm'],10+math.sqrt(125))
        parts=self.run_op('curve.explode',{},dict(object=[self.ref(joined)]));self.assertEqual(len(parts),2)
        b=self.run_op('curve.line',dict(start=[10.08,0,0],end=[20,5,0]))[0]
        self.run_op('curve.join',{},dict(objects=[self.ref(a),self.ref(b)]),expect='failed')
        from cad_runtime import TOLERANCES
        old=TOLERANCES['joinLinearMm'];TOLERANCES['joinLinearMm']=.1
        try:self.run_op('curve.join',{},dict(objects=[self.ref(a),self.ref(b)]))
        finally:TOLERANCES['joinLinearMm']=old
    def test_exact_split_offset_and_corner_surfaces(self):
        a=self.run_op('curve.line',dict(start=[0,0,0],end=[10,0,0]))[0]
        parts=self.run_op('curve.split',dict(splitParameters=[5]),dict(object=[self.ref(a)]));self.assertEqual(len(parts),2);self.assertAlmostEqual(sum(p['summary']['lengthMm'] for p in parts),10)
        self.run_op('curve.split',dict(splitParameters=[20]),dict(object=[self.ref(a)]),expect='failed')
        rect=self.rectangle();o=self.run_op('curve.offset',dict(distanceMm=1,plane=XY,joinStyle='miter'),dict(curve=[self.ref(rect)]))[0];self.assertTrue(o['summary']['valid'])
        face=self.run_op('surface.corners',dict(points=[[0,0,0],[10,0,0],[10,10,3],[0,10,0]]))[0];self.assertEqual(face['kind'],'surface');self.assertGreater(face['summary']['areaMm2'],100)
        triangle=self.run_op('surface.corners',dict(points=[[0,0,0],[10,0,0],[0,10,0]]))[0];self.assertAlmostEqual(triangle['summary']['areaMm2'],50)
        offset=self.run_op('surface.offset',dict(distanceMm=1,bothSides=False,solidify=False),dict(surface=[self.ref(triangle)]))[0];self.assertAlmostEqual(offset['summary']['bbox']['min'][2],1)
    def test_T14_sweep_and_T21_shell(self):
        circle=self.run_op('curve.circle',dict(plane=XY,center=[0,0,0],radiusMm=2))[0];rail=self.run_op('curve.line',dict(start=[0,0,0],end=[0,0,30]))[0]
        o=self.run_op('surface.sweep1',dict(frameMode='corrected-frame',cap=True),dict(rail=[self.ref(rail)],sections=[self.ref(circle)]))[0];self.assertAlmostEqual(o['summary']['volumeMm3'],120*math.pi,places=5)
        b=self.run_op('solid.box',dict(plane=XY,anchorMode='corner',anchor=[0,0,0],widthMm=20,depthMm=20,heightMm=20))[0];faces=[t for t in b['summary']['topology'] if t['kind']=='face' and abs(t['fingerprint']['centroid'][2]-20)<1e-6];self.assertEqual(len(faces),1)
        o=self.run_op('solid.shell',dict(thicknessMm=1,directionMode='inward'),dict(body=[self.ref(b)],removedFaces=[self.ref(b,dict(kind='face',topologyId=faces[0]['topologyId'],orientation='forward'))]))[0];self.assertAlmostEqual(o['summary']['volumeMm3'],8000-18*18*19,places=5)
    def test_startup_probe_executes_real_operations_without_leaking_handles(self):
        result=self.r.handle(dict(type='probe'));self.assertEqual(len([p for p in result['probes'] if p['status']=='verified']),5);self.assertTrue(any(p['operation']=='surface.sweep2' and p['status']=='verified' for p in result['probes']));self.assertTrue(any(p['operation']=='surface.network' and p['status']=='verified' for p in result['probes']));self.assertFalse(self.r.cache)
    def test_jsonl_persists_handles(self):
        p=subprocess.Popen([sys.executable,'native/cad_runtime.py'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            for i in range(2):
                p.stdin.write(json.dumps(dict(id=str(i),type='hello'))+'\n');p.stdin.flush();reply=json.loads(p.stdout.readline());self.assertTrue(reply['ok'])
                if i==0:runtime=reply['result']['runtimeId']
                else:self.assertEqual(runtime,reply['result']['runtimeId'])
        finally:p.terminate();p.communicate(timeout=5)
if __name__=='__main__':unittest.main()
