"""Issue #12: approved NURBS continuation is exact-source plus tangent extension."""
import unittest,math
from cad_runtime import Runtime,TOLERANCES

class CurveEditingTests(unittest.TestCase):
    def setUp(self):self.runtime=Runtime()
    def run_op(self,operation,parameters,inputs=None):
        request=dict(protocolVersion=1,operation=dict(id=operation,version=1),parameters=parameters,inputs=inputs or {},tolerances=TOLERANCES,intent='commit')
        return self.runtime.handle(dict(type='evaluate',request=request))
    def source(self,nurbs):
        parameters=dict(poles=[[0,0,0],[10,10,0],[20,10,0],[30,0,0]],degree=3,knots=[0,1],multiplicities=[4,4],weights=[1,1,1,1],periodic=False) if nurbs else dict(start=[0,0,0],end=[20,0,0])
        result=self.run_op('curve.nurbs' if nurbs else 'curve.line',parameters)
        self.assertEqual(result['status'],'ok',str(result['diagnostics']))
        return result['outputs'][0]
    def extension(self,nurbs,method):
        source=self.source(nurbs)
        result=self.run_op('curve.extend',dict(end='end',method=method,distanceMm=5),dict(object=[dict(handle=source['handle'],geometryHash=source['geometryHash'])]))
        self.assertEqual(result['status'],'ok',str(result['diagnostics']))
        self.assertEqual(len(result['outputs']),1)
        out=result['outputs'][0]
        self.assertTrue(out['summary']['valid'])
        self.assertAlmostEqual(out['summary']['lengthMm'],source['summary']['lengthMm']+5,places=5)
        return out
    def test_line_tangent(self):self.extension(False,'tangent')
    def test_line_continuation(self):self.extension(False,'continuation')
    def test_nurbs_tangent(self):self.extension(True,'tangent')
    def test_nurbs_continuation(self):
        out=self.extension(True,'continuation')
        expected=[30+5/math.sqrt(2),-5/math.sqrt(2),0]
        vertices=[entry['point'] for entry in out['summary']['preview']['points']]
        self.assertTrue(any(math.dist(p,expected)<1e-6 for p in vertices),vertices)
    def test_nurbs_continuation_start(self):
        source=self.source(True)
        result=self.run_op('curve.extend',dict(end='start',method='continuation',distanceMm=5),dict(object=[dict(handle=source['handle'],geometryHash=source['geometryHash'])]))
        self.assertEqual(result['status'],'ok',str(result['diagnostics']))
        expected=[-5/math.sqrt(2),-5/math.sqrt(2),0]
        self.assertTrue(any(math.dist(p['point'],expected)<1e-6 for p in result['outputs'][0]['summary']['preview']['points']))
