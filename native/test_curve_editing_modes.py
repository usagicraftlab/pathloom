"""Real OCCT acceptance for E01-E11, with invalid/ambiguous cases retained."""
import math,unittest
from cad_runtime import Runtime,TOLERANCES
from OCP.BRepAdaptor import BRepAdaptor_Curve
from cad_operations import subshapes,TopAbs_EDGE
XY=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=[0,1,0])

class EditingModesTests(unittest.TestCase):
    def setUp(self):self.r=Runtime()
    def run_op(self,op,p,inputs=None,intent='commit'):
        return self.r.handle(dict(type='evaluate',request=dict(protocolVersion=1,operation=dict(id=op,version=1),parameters=p,inputs=inputs or {},tolerances=TOLERANCES,intent=intent)))
    def ok(self,op,p,inputs=None,intent='commit'):
        result=self.run_op(op,p,inputs,intent);self.assertIn(result['status'],('ok','warning','empty'),str(result['diagnostics']))
        self.assertTrue(all(o['summary']['valid'] for o in result['outputs']));return result
    def out(self,op,p,inputs=None):return self.ok(op,p,inputs)['outputs'][0]
    def ref(self,o,selector=None):return dict(handle=o['handle'],geometryHash=o['geometryHash'],selector=selector)
    def line(self,a,b):return self.out('curve.line',dict(start=a,end=b))
    def circle(self,center=[0,0,0],r=10):return self.out('curve.circle',dict(plane=XY,center=center,radiusMm=r))
    def nurbs(self):return self.out('curve.nurbs',dict(poles=[[0,0,0],[10,10,0],[20,10,0],[30,0,0]],degree=3,knots=[0,1],multiplicities=[4,4],weights=[1,1,1,1],periodic=False))
    def failed(self,op,p,inputs,code=None):
        r=self.run_op(op,p,inputs);self.assertEqual(r['status'],'failed');self.assertEqual(r['outputs'],[])
        if code:self.assertEqual(r['diagnostics'][0]['code'],code,str(r['diagnostics']))
        return r
    def test_E01_join_groups_and_branch(self):
        a,b,c=[self.line(*pair) for pair in [([0,0,0],[10,0,0]),([10,0,0],[20,0,0]),([30,0,0],[40,0,0])]]
        inp=dict(objects=[self.ref(x) for x in [a,b,c]])
        r=self.ok('curve.join',dict(allowMultipleGroups=True),inp);self.assertEqual(len(r['outputs']),2);self.assertAlmostEqual(sum(o['summary']['lengthMm'] for o in r['outputs']),30)
        d=self.line([10,0,0],[10,10,0]);self.failed('curve.join',dict(allowMultipleGroups=True),dict(objects=[self.ref(x) for x in [a,b,d]]),'CAD_JOIN_BRANCH')
    def test_E02_explode_preserves_all_exact_edges(self):
        a=self.out('curve.polyline',dict(points=[[0,0,0],[10,0,0],[10,10,0],[20,10,0]],closed=False))
        r=self.ok('curve.explode',{},dict(object=[self.ref(a)]));self.assertEqual(len(r['outputs']),3);self.assertAlmostEqual(sum(o['summary']['lengthMm'] for o in r['outputs']),30)
        pt=self.out('point.create',dict(point=[0,0,0]));self.failed('curve.explode',{},dict(object=[self.ref(pt)]),'CAD_INPUT_TYPE')
    def test_E03_trim_click_retains_both_intervals(self):
        a=self.line([0,0,0],[10,0,0]);cuts=[self.line([x,-5,0],[x,5,0]) for x in [3,7]]
        inp=dict(object=[self.ref(a)],cutters=[self.ref(c) for c in cuts])
        p=dict(splitParameters=[],removePoint=[5,0,0],removeParameter=5)
        r=self.ok('curve.trim',p,inp);self.assertEqual(len(r['outputs']),2);self.assertEqual(sorted(round(o['summary']['lengthMm'],6) for o in r['outputs']),[3,3])
        self.failed('curve.trim',{**p,'removePoint':[3,0,0]},inp,'CAD_REFERENCE_AMBIGUOUS')
    def test_E04_split_explicit_edge_and_all_intervals(self):
        a=self.out('curve.rectangle',dict(plane=XY,anchorMode='corner',anchor=[0,0,0],widthMm=10,heightMm=6,rounding=False,cornerRadiusMm=1))
        edge=next(t for t in a['summary']['topology'] if t['kind']=='edge');definition=next(c for c in a['summary']['curveParameters'] if c['topologyId']==edge['topologyId']);middle=(definition['first']+definition['last'])/2
        inp=dict(object=[self.ref(a)],edge=[self.ref(a,dict(kind='edge',topologyId=edge['topologyId'],orientation='forward'))])
        r=self.ok('curve.split',dict(splitParameters=[middle]),inp);self.assertEqual(len(r['outputs']),5);self.assertAlmostEqual(sum(o['summary']['lengthMm'] for o in r['outputs']),32)
        self.failed('curve.split',dict(splitParameters=[middle]),dict(object=[self.ref(a)]),'CAD_REFERENCE_AMBIGUOUS')
        other=self.line([0,0,0],[10,0,0]);foreign=next(t for t in other['summary']['topology'] if t['kind']=='edge')
        self.failed('curve.split',dict(splitParameters=[middle]),dict(object=[self.ref(a)],edge=[self.ref(other,dict(kind='edge',topologyId=foreign['topologyId'],orientation='forward'))]),'CAD_INPUT_TYPE')
    def test_E05_reach_target_and_explicit_candidate(self):
        a=self.line([0,0,0],[10,0,0]);target=self.circle([20,0,0],3)
        p=dict(end='end',method='continuation',distanceMm=20,targetParameter=None);inp=dict(object=[self.ref(a)],target=[self.ref(target)])
        r=self.failed('curve.extend',p,inp,'CAD_REFERENCE_AMBIGUOUS');self.assertEqual(len(r['diagnostics'][0]['details']['parameters']),2)
        chosen=min(r['diagnostics'][0]['details']['parameters']);out=self.ok('curve.extend',{**p,'targetParameter':chosen},inp)['outputs'][0];self.assertAlmostEqual(out['summary']['lengthMm'],17,places=5)
    def test_E06_offset_zero_and_nonplanar_rejection(self):
        a=self.circle();inp=dict(curve=[self.ref(a)]);p=dict(plane=XY,distanceMm=0,joinStyle='round')
        r=self.ok('curve.offset',p,inp);self.assertAlmostEqual(r['outputs'][0]['summary']['lengthMm'],20*math.pi);self.assertEqual(r['status'],'warning')
        for distance in [-10,-11]:
            r=self.ok('curve.offset',{**p,'distanceMm':distance},inp)
            self.assertEqual(r['status'],'empty');self.assertTrue(r['outputs'][0]['summary']['empty']);self.assertEqual(r['diagnostics'][0]['code'],'CAD_EMPTY_RESULT')
        wrong=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=[0,0,1]);self.failed('curve.offset',{**p,'plane':wrong,'distanceMm':1},inp,'CAD_INPUT_TYPE')
    def corner(self):return dict(first=[self.ref(self.line([-10,0,0],[0,0,0]))],second=[self.ref(self.line([0,0,0],[0,10,0]))])
    def test_E07_fillet_all_three_outputs(self):
        inp=self.corner();p=dict(plane=XY,radiusMm=2,connectionPoint=[0,0,0],solutionIndex=1,trim=True,keepInputs=False)
        r=self.ok('curve.fillet',p,inp);self.assertEqual(len(r['outputs']),3);self.assertAlmostEqual(sum(o['summary']['lengthMm'] for o in r['outputs']),16+math.pi,places=5)
        self.failed('curve.fillet',{**p,'radiusMm':-1},inp,'CAD_INPUT_DEGENERATE')
    def test_E07_chamfer_explicit_retained_sides(self):
        inp=self.corner();p=dict(plane=XY,firstDistanceMm=2,secondDistanceMm=3,connectionPoint=[0,0,0],firstSide='start',secondSide='end',trim=True,keepInputs=False)
        r=self.ok('curve.chamfer',p,inp);self.assertEqual(len(r['outputs']),3);self.assertAlmostEqual(sum(o['summary']['lengthMm'] for o in r['outputs']),15+math.sqrt(13),places=5)
        self.failed('curve.chamfer',{**p,'firstDistanceMm':20},inp,'CAD_INPUT_DEGENERATE')
    def test_E08_blend_G1_G2_endpoint_derivatives(self):
        a=self.line([0,0,0],[10,0,0]);b=self.line([20,10,0],[30,10,0]);inp=dict(first=[self.ref(a)],second=[self.ref(b)])
        from cad_operations.curve_editing import derivatives,unit
        from OCP.BRep import BRep_Tool
        for continuity in ['G1','G2']:
            p=dict(firstEnd='end',secondEnd='start',continuity=continuity,handleLengthMm=10);out=self.ok('curve.blend',p,inp)['outputs'][0]
            edge=subshapes(self.r.cache[out['handle']]['shape'],TopAbs_EDGE)[0];c=BRep_Tool.Curve_s(edge,0.,0.)
            for u,expected in [(c.FirstParameter(),[10,0,0]),(c.LastParameter(),[20,10,0])]:
                q,d,dd=derivatives(c,u);self.assertLess(math.dist(q,expected),1e-7);self.assertGreater(unit(d)[0],1-1e-9)
                if continuity=='G2':self.assertLess(math.sqrt(sum(v*v for v in dd)),1e-6)
        self.failed('curve.blend',{**p,'continuity':'G9'},inp,'CAD_INPUT_TYPE')
        a=self.out('curve.arc',dict(plane=XY,center=[0,0,0],radiusMm=10,startAngleRad=0,sweepAngleRad=math.pi/2))
        b=self.out('curve.arc',dict(plane=XY,center=[20,0,0],radiusMm=10,startAngleRad=0,sweepAngleRad=math.pi/2))
        out=self.ok('curve.blend',{**p,'continuity':'G2'},dict(first=[self.ref(a)],second=[self.ref(b)]))['outputs'][0]
        c=BRep_Tool.Curve_s(subshapes(self.r.cache[out['handle']]['shape'],TopAbs_EDGE)[0],0.,0.)
        for u in [c.FirstParameter(),c.LastParameter()]:
            _,d,dd=derivatives(c,u);cross=[d[1]*dd[2]-d[2]*dd[1],d[2]*dd[0]-d[0]*dd[2],d[0]*dd[1]-d[1]*dd[0]]
            curvature=math.sqrt(sum(v*v for v in cross))/sum(v*v for v in d)**1.5
            self.assertAlmostEqual(curvature,.1,places=8)
    def test_E09_rebuild_degree_count_measured_deviation_confirmation(self):
        a=self.nurbs();inp=dict(object=[self.ref(a)]);p=dict(degree=3,controlPointCount=6,acceptApproximation=False)
        r=self.ok('curve.rebuild',p,inp,intent='preview');accuracy=r['outputs'][0]['summary']['accuracy'];self.assertEqual(accuracy['controlPointCount'],6);self.assertLess(accuracy['maxDeviationMm'],1e-6)
        self.failed('curve.rebuild',p,inp,'CAD_APPROXIMATION_REQUIRES_CONFIRMATION')
        out=self.ok('curve.rebuild',{**p,'acceptApproximation':True},inp)['outputs'][0];params=out['summary']['curveParameters'][0];self.assertEqual((params['degree'],params['poleCount']),(3,6))
        self.failed('curve.rebuild',{**p,'degree':6,'acceptApproximation':True},inp,'CAD_INPUT_DEGENERATE')
    def test_E10_reverse_and_seam_applicability(self):
        a=self.circle();r=self.ok('curve.seam',dict(seamParameter=math.pi/2,seamPoint=None),dict(object=[self.ref(a)]));out=r['outputs'][0]
        self.assertAlmostEqual(out['summary']['lengthMm'],a['summary']['lengthMm']);self.assertTrue(any(math.dist(v['point'],[0,10,0])<1e-6 for v in out['summary']['preview']['points']))
        reversed=self.ok('curve.reverse',{},dict(object=[self.ref(out)]))['outputs'][0];self.assertAlmostEqual(reversed['summary']['lengthMm'],out['summary']['lengthMm'])
        line=self.line([0,0,0],[10,0,0]);self.failed('curve.seam',dict(seamParameter=0,seamPoint=None),dict(object=[self.ref(line)]),'CAD_INPUT_TYPE')
        closed=self.out('curve.nurbs',dict(poles=[[0,0,0],[10,0,0],[0,10,0],[0,0,0]],degree=3,knots=[0,1],multiplicities=[4,4],weights=[1,1,1,1],periodic=False))
        shifted=self.ok('curve.seam',dict(seamParameter=.5,seamPoint=None),dict(object=[self.ref(closed)]))['outputs'][0]
        self.assertEqual(len(shifted['summary']['curveParameters']),2)
        self.assertAlmostEqual(shifted['summary']['lengthMm'],closed['summary']['lengthMm'],places=4)
    def test_E11_move_insert_remove_poles_and_invalid_index(self):
        a=self.nurbs();inp=dict(object=[self.ref(a)]);base=dict(mode='move',poleIndex=2,position=[10,20,0],knot=.5,knotIndex=2,multiplicity=1,toleranceMm=.01)
        moved=self.ok('curve.editPoles',base,inp)['outputs'][0];self.assertGreater(moved['summary']['bbox']['max'][1],a['summary']['bbox']['max'][1])
        inserted=self.ok('curve.editPoles',{**base,'mode':'insertKnot'},inp)['outputs'][0];self.assertEqual(inserted['summary']['curveParameters'][0]['poleCount'],5)
        # BRepGProp's default quadrature changes with knot partitioning. Verify
        # the exact curves and a tighter independent adaptive length instead.
        from OCP.BRep import BRep_Tool
        from OCP.GeomAdaptor import GeomAdaptor_Curve
        from OCP.GCPnts import GCPnts_AbscissaPoint
        curves=[BRep_Tool.Curve_s(subshapes(self.r.cache[o['handle']]['shape'],TopAbs_EDGE)[0],0.,0.) for o in [a,inserted]]
        for i in range(257):self.assertLess(curves[0].Value(i/256).Distance(curves[1].Value(i/256)),1e-10)
        lengths=[GCPnts_AbscissaPoint.Length_s(GeomAdaptor_Curve(c),c.FirstParameter(),c.LastParameter(),1e-10) for c in curves]
        self.assertLess(abs(lengths[0]-lengths[1]),1e-10)
        removed=self.ok('curve.editPoles',{**base,'mode':'removeKnot','multiplicity':0},dict(object=[self.ref(inserted)]))['outputs'][0];self.assertEqual(removed['summary']['curveParameters'][0]['poleCount'],4)
        self.failed('curve.editPoles',{**base,'poleIndex':0},inp,'CAD_INPUT_DEGENERATE')
