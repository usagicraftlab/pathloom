"""Issue13: numerical real-OCCT acceptance, no mesh substitutes."""
import unittest,math
import test_curve_editing_modes as fixtures
XY=fixtures.XY
from cad_operations import subshapes,TopAbs_EDGE,TopAbs_FACE,TopAbs_SOLID
class RegionSolidTests(unittest.TestCase):
    setUp=fixtures.EditingModesTests.setUp
    run_op=fixtures.EditingModesTests.run_op
    ok=fixtures.EditingModesTests.ok
    out=fixtures.EditingModesTests.out
    ref=fixtures.EditingModesTests.ref
    line=fixtures.EditingModesTests.line
    circle=fixtures.EditingModesTests.circle
    failed=fixtures.EditingModesTests.failed
    def rect(self,x=0,y=0,w=10,h=10,z=0):return self.out('curve.rectangle',dict(plane=XY,anchorMode='corner',anchor=[x,y,z],widthMm=w,heightMm=h,rounding=False,cornerRadiusMm=1))
    def box(self,x=0):return self.out('solid.box',dict(plane=XY,anchorMode='corner',anchor=[x,0,0],widthMm=10,depthMm=10,heightMm=10))
    def region(self,objects):return self.ok('surface.planarRegion',{},dict(boundaries=[self.ref(o) for o in objects]))
    def test_S03_holes_multiple_regions_nested_island(self):
        objects=[self.rect(),self.rect(2,2,6,6),self.rect(4,4,2,2),self.rect(20)]
        r=self.region(objects);self.assertEqual(len(r['outputs']),3);self.assertEqual(sorted(round(o['summary']['areaMm2'],5) for o in r['outputs']),[4,64,100])
        self.assertTrue(all(not o['summary']['closure']['enclosesVolume'] for o in r['outputs']))
    def test_S03_open_crossing_nonplanar_rejected(self):
        line=self.line([0,0,0],[10,0,0]);self.failed('surface.planarRegion',{},dict(boundaries=[self.ref(line)]),'CAD_PROFILE_OPEN')
        self.failed('surface.planarRegion',{},dict(boundaries=[self.ref(self.rect()),self.ref(self.rect(5))]),'CAD_REGION_AMBIGUOUS')
        self.failed('surface.planarRegion',{},dict(boundaries=[self.ref(self.rect()),self.ref(self.rect(z=1))]),'CAD_REGION_NONPLANAR')
    def test_B01_two_corners_three_points(self):
        p=dict(mode='twoCorners',plane=XY,points=[[10,4,0],[0,0,0]],heightMm=3)
        o=self.out('solid.box',p);self.assertAlmostEqual(o['summary']['volumeMm3'],120)
        o=self.out('solid.box',{**p,'mode':'threePoints','points':[[0,0,0],[0,4,0],[0,0,3]],'heightMm':2});self.assertAlmostEqual(o['summary']['volumeMm3'],24);self.assertEqual(o['summary']['bbox']['max'],[2,4,3])
        self.failed('solid.box',{**p,'points':[[0,0,0],[1,0,0]]},{},'CAD_INPUT_DEGENERATE')
    def test_B02_exact_ellipsoid(self):
        o=self.out('solid.ellipsoid',dict(plane=XY,center=[1,2,3],radiiMm=[2,3,4]));self.assertAlmostEqual(o['summary']['volumeMm3'],32*math.pi,places=3)
        for got,want in zip(o['summary']['bbox']['max'],[3,5,7]):self.assertAlmostEqual(got,want,places=6)
        self.failed('solid.ellipsoid',dict(plane=XY,center=[0,0,0],radiiMm=[2,0,4]),{},'CAD_INPUT_DEGENERATE')
    def test_B03_B04_B05_open_closed_primitives(self):
        ax=dict(origin=[0,0,0],direction=[0,0,1])
        for cap in [False,True]:
            c=self.out('shape.cylinder',dict(axis=ax,radiusMm=2,heightMm=10,cap=cap));self.assertEqual(c['summary']['closure']['enclosesVolume'],cap);self.assertAlmostEqual(c['summary']['volumeMm3'],40*math.pi if cap else 0,places=5)
            c=self.out('shape.cone',dict(axis=ax,bottomRadiusMm=0,topRadiusMm=2,heightMm=10,cap=cap));self.assertEqual(c['summary']['closure']['enclosesVolume'],cap)
        self.failed('shape.cone',dict(axis=ax,bottomRadiusMm=2,topRadiusMm=-1,heightMm=10,cap=True),{},'CAD_INPUT_DEGENERATE')
        t=self.out('solid.torus',dict(axis=ax,majorRadiusMm=10,minorRadiusMm=2));self.assertAlmostEqual(t['summary']['volumeMm3'],80*math.pi**2,places=4)
        self.failed('solid.torus',dict(axis=ax,majorRadiusMm=2,minorRadiusMm=3),{},'CAD_INPUT_DEGENERATE')
    def test_B06_pipe_open_closed_and_corner(self):
        rail=self.line([0,0,0],[0,0,10]);p=dict(radiusMm=2,frameMode='corrected-frame',transitionMode='roundCorner',cap=False)
        inp=dict(rail=[self.ref(rail)]);o=self.out('shape.pipe',p,inp);self.assertFalse(o['summary']['closure']['enclosesVolume']);self.assertAlmostEqual(o['summary']['areaMm2'],40*math.pi,places=4)
        o=self.out('shape.pipe',{**p,'cap':True},inp);self.assertAlmostEqual(o['summary']['volumeMm3'],40*math.pi,places=4)
        for mode in ['corrected-frame','frenet']:
            o=self.out('shape.pipe',{**p,'cap':True,'frameMode':mode,'transitionMode':'transformed'},inp);self.assertAlmostEqual(o['summary']['volumeMm3'],40*math.pi,places=4)
        rail=self.out('curve.polyline',dict(points=[[0,0,0],[0,0,10],[10,0,10]],closed=False))
        for transition in ['rightCorner','roundCorner']:
            o=self.out('shape.pipe',{**p,'transitionMode':transition,'cap':True},dict(rail=[self.ref(rail)]));self.assertTrue(o['summary']['closure']['enclosesVolume'])
        self.failed('shape.pipe',{**p,'radiusMm':0},inp,'CAD_INPUT_DEGENERATE')
    def test_B07_face_extrude_retains_hole_and_open_result(self):
        face=self.region([self.rect(),self.rect(2,2,6,6)])['outputs'][0];inp=dict(profile=[self.ref(face)]);p=dict(direction=[0,0,1],distanceMm=5,bothSides=False,cap=True)
        o=self.out('shape.extrude',p,inp);self.assertAlmostEqual(o['summary']['volumeMm3'],320,places=5)
        o=self.out('shape.extrude',{**p,'cap':False},inp);self.assertFalse(o['summary']['closure']['enclosesVolume']);self.assertAlmostEqual(o['summary']['areaMm2'],320,places=5)
        capped=self.out('shape.cap',{},dict(objects=[self.ref(o)]));self.assertAlmostEqual(capped['summary']['volumeMm3'],320,places=5)
        o=self.out('shape.extrude',{**p,'distanceMm':-5,'bothSides':True},inp);self.assertAlmostEqual(o['summary']['bbox']['min'][2],-2.5);self.assertAlmostEqual(o['summary']['bbox']['max'][2],2.5)
    def test_B08_cap_pipe_and_independent_solids(self):
        ax=dict(origin=[0,0,0],direction=[0,0,1]);a=self.out('shape.cylinder',dict(axis=ax,radiusMm=2,heightMm=10,cap=False));b=self.out('shape.cylinder',dict(axis={**ax,'origin':[20,0,0]},radiusMm=2,heightMm=10,cap=False))
        r=self.ok('shape.cap',{},dict(objects=[self.ref(a),self.ref(b)]));self.assertEqual(len(r['outputs']),2)
        for o in r['outputs']:self.assertAlmostEqual(o['summary']['volumeMm3'],40*math.pi,places=4)
    def test_B08_assemble_faces_and_preserve_open_surface(self):
        b=self.box();faces=self.ok('surface.explode',{},dict(object=[self.ref(b)]))['outputs']
        r=self.ok('solid.assemble',{},dict(objects=[self.ref(f) for f in faces]));self.assertEqual(len(r['outputs']),1);self.assertAlmostEqual(r['outputs'][0]['summary']['volumeMm3'],1000)
        r=self.ok('solid.assemble',{},dict(objects=[self.ref(f) for f in faces[:-1]]));self.assertEqual(r['status'],'warning');self.assertFalse(r['outputs'][0]['summary']['closure']['enclosesVolume'])
        bent=self.out('surface.corners',dict(points=[[0,0,0],[10,0,0],[10,10,1],[0,10,0]]));self.failed('shape.cap',{},dict(objects=[self.ref(bent)]),'CAD_CAP_NONPLANAR')
    def test_D01_D03_multiple_noncontact_empty_contact(self):
        a,b,c=self.box(),self.box(5),self.box(7)
        r=self.out('solid.intersection',{},dict(arguments=[self.ref(a),self.ref(b)],tools=[self.ref(c)]));self.assertAlmostEqual(r['summary']['volumeMm3'],300,places=5)
        disjoint=self.box(20);r=self.out('solid.union',{},dict(arguments=[self.ref(a),self.ref(disjoint)]));self.assertAlmostEqual(r['summary']['volumeMm3'],2000);self.assertEqual(len(subshapes(self.r.cache[r['handle']]['shape'],TopAbs_SOLID)),2)
        r=self.ok('solid.intersection',{},dict(arguments=[self.ref(a)],tools=[self.ref(disjoint)]));self.assertEqual(r['status'],'empty')
        for pos,kind,area,length in [([10,0,0],'surface',100,40),([10,10,0],'curve',0,10),([10,10,10],'point',0,0)]:
            touching=self.out('solid.box',dict(plane=XY,anchorMode='corner',anchor=pos,widthMm=10,depthMm=10,heightMm=10))
            r=self.out('solid.intersection',{},dict(arguments=[self.ref(a)],tools=[self.ref(touching)]));self.assertEqual(r['kind'],kind);self.assertFalse(r['summary']['closure']['enclosesVolume']);self.assertAlmostEqual(r['summary']['areaMm2'],area);self.assertAlmostEqual(r['summary']['lengthMm'],length)
    def selected(self,b,kind,index=0):
        t=[t for t in b['summary']['topology'] if t['kind']==kind][index];return self.ref(b,dict(kind=kind,topologyId=t['topologyId'],orientation='forward'))
    def test_D05_explicit_tangent_chain_and_legacy_preserved(self):
        r=self.out('curve.rectangle',dict(plane=XY,anchorMode='center',anchor=[0,0,0],widthMm=60,heightMm=40,rounding=True,cornerRadiusMm=3))
        b=self.out('shape.extrude',dict(direction=[0,0,1],distanceMm=25,bothSides=False,cap=True),dict(profile=[self.ref(r)]))
        edge=next(t for t in b['summary']['topology'] if t['kind']=='edge' and abs(t['fingerprint']['bbox']['min'][1]+20)<1e-5 and abs(t['fingerprint']['bbox']['max'][1]+20)<1e-5 and abs(t['fingerprint']['bbox']['max'][2])<1e-5 and t['fingerprint']['bbox']['max'][0]-t['fingerprint']['bbox']['min'][0]>40)
        inp=dict(body=[self.ref(b)],edges=[self.ref(b,dict(kind='edge',topologyId=edge['topologyId'],orientation='forward'))])
        self.failed('solid.fillet',dict(radiusMm=2,chainPolicy='selected'),inp,'CAD_REFERENCE_AMBIGUOUS')
        tangent=self.out('solid.fillet',dict(radiusMm=2,chainPolicy='tangent'),inp)
        legacy=self.out('solid.fillet',dict(radiusMm=2,tangentChain=False),inp)
        self.assertAlmostEqual(tangent['summary']['volumeMm3'],legacy['summary']['volumeMm3'],places=7)
    def test_D06_two_distances_and_adjacent_face(self):
        b=self.box();edge=self.selected(b,'edge');native=self.r.cache[b['handle']];e=native['slots'][edge['selector']['topologyId']]
        face=next(t for t in b['summary']['topology'] if t['kind']=='face' and any(e.IsSame(x) for x in subshapes(native['slots'][t['topologyId']],TopAbs_EDGE)))
        f=self.ref(b,dict(kind='face',topologyId=face['topologyId'],orientation='forward'));p=dict(distance1Mm=1,distance2Mm=2)
        self.failed('solid.chamfer',p,dict(body=[self.ref(b)],edges=[edge]),'CAD_REFERENCE_AMBIGUOUS')
        o=self.out('solid.chamfer',p,dict(body=[self.ref(b)],edges=[edge],distance1Faces=[f]));self.assertAlmostEqual(o['summary']['volumeMm3'],990,places=5)
    def test_D07_shell_failure_details_and_direction(self):
        b=self.box();face=self.selected(b,'face');inp=dict(body=[self.ref(b)],removedFaces=[face]);p=dict(thicknessMm=1,directionMode='inward')
        self.assertTrue(self.out('solid.shell',p,inp)['summary']['closure']['enclosesVolume'])
        r=self.failed('solid.shell',{**p,'thicknessMm':100},inp,'CAD_SHELL_FAILED');self.assertEqual(r['diagnostics'][0]['details']['thicknessMm'],100)
        self.assertTrue(self.out('solid.shell',{**p,'directionMode':'outward'},inp)['summary']['closure']['enclosesVolume'])
    def test_issue19_all_region_solid_commands_have_typed_failure(self):
        ax=dict(origin=[0,0,0],direction=[0,0,1])
        cases=[
            ('surface.planarRegion',{},{}),
            ('solid.box',dict(mode='dimensions',plane=XY,anchorMode='corner',anchor=[0,0,0],widthMm=0,depthMm=10,heightMm=10,points=[]),{}),
            ('solid.ellipsoid',dict(plane=XY,center=[0,0,0],radiiMm=[1,0,1]),{}),
            ('shape.cylinder',dict(axis=ax,radiusMm=0,heightMm=10,cap=True),{}),
            ('shape.cone',dict(axis=ax,bottomRadiusMm=2,topRadiusMm=2,heightMm=10,cap=True),{}),
            ('solid.torus',dict(axis=ax,majorRadiusMm=2,minorRadiusMm=3),{}),
            ('shape.pipe',dict(radiusMm=2,frameMode='corrected-frame',transitionMode='roundCorner',cap=False),{}),
            ('shape.extrude',dict(direction=[0,0,1],distanceMm=10,bothSides=False,cap=True),{}),
            ('shape.cap',{},{}),
            ('solid.union',{},{}),
            ('solid.intersection',{},{}),
            ('solid.fillet',dict(radiusMm=2,chainPolicy='selected'),{}),
            ('solid.chamfer',dict(distance1Mm=1,distance2Mm=None),{}),
            ('solid.shell',dict(thicknessMm=1,directionMode='inward'),{}),
        ]
        for operation,parameters,inputs in cases:
            with self.subTest(operation=operation):self.failed(operation,parameters,inputs)
