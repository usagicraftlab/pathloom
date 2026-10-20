import copy
import tempfile
import unittest
from pathlib import Path
from occt_brep_bridge import process, read_brep
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeCone
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepCheck import BRepCheck_Analyzer


class EditableBrepTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        writer=STEPControl_Writer()
        writer.Transfer(BRepPrimAPI_MakeBox(10,20,30).Shape(),STEPControl_AsIs)
        writer.Write(str(self.root/'box.step'))
        self.shape=process(dict(action='import',path=str(self.root/'box.step')))

    def test_exact_box_sections_have_only_corners(self):
        result=process(dict(action='slice',brep=self.shape['brep'],layerHeight=1,tolerance=.02))
        self.assertEqual(len(result['paths']),30)
        for path in result['paths']:
            self.assertEqual(len(path['points']),5)
            self.assertEqual(path['points'][0],path['points'][-1])
            self.assertTrue(all(p[2]==path['points'][0][2] for p in path['points']))

    def test_slice_samples_center_and_prints_at_layer_top(self):
        from occt_brep_bridge import inspect_shape
        cone=inspect_shape(BRepPrimAPI_MakeCone(10,5,3).Shape(),self.root,'tapered')
        result=process(dict(action='slice',brep=cone['brep'],layerHeight=.6,tolerance=.002))
        self.assertEqual(len(result['paths']),5)
        for layer,path in enumerate(result['paths']):
            self.assertTrue(all(abs(p[2]-(layer+1)*.6)<1e-8 for p in path['points']))
            radius=10-(layer+.5)
            self.assertTrue(all(abs((p[0]**2+p[1]**2)**.5-radius)<.002 for p in path['points']))

    def test_point_bottom_is_avoided_by_center_sampling(self):
        from occt_brep_bridge import inspect_shape
        cone=inspect_shape(BRepPrimAPI_MakeCone(0,5,3).Shape(),self.root,'pointed')
        path=process(dict(action='slice',brep=cone['brep'],layerHeight=.6,tolerance=.001))['paths'][0]
        self.assertTrue(all(abs(p[2]-.6)<1e-8 for p in path['points']))
        self.assertTrue(all(abs((p[0]**2+p[1]**2)**.5-5*.3/3)<1e-5 for p in path['points']))

    def test_exact_cylinder_sections_follow_radius(self):
        from occt_brep_bridge import inspect_shape
        cylinder=inspect_shape(BRepPrimAPI_MakeCylinder(10,2).Shape(),self.root,'cylinder')
        result=process(dict(action='slice',brep=cylinder['brep'],layerHeight=1,tolerance=.02))
        self.assertEqual(len(result['paths']),2)
        for path in result['paths']:
            self.assertEqual(path['points'][0],path['points'][-1])
            self.assertGreater(len(path['points']),10)
            for x,y,z in path['points']:self.assertAlmostEqual(x*x+y*y,100,places=5)

    def tearDown(self):self.temp.cleanup()

    def volume(self, result):
        shape=read_brep(result['brep']['data'],self.root)
        self.assertTrue(BRepCheck_Analyzer(shape).IsValid())
        props=GProp_GProps();BRepGProp.VolumeProperties_s(shape,props)
        return props.Mass()

    def face(self, normal):
        return next(f['index'] for f in self.shape['faces'] if f.get('normal')==normal)

    def move(self, normal, offset):
        return process(dict(action='move',brep=self.shape['brep'],faceIndices=[self.face(normal)],offset=offset,name='box.step'))

    def test_import_retains_exact_shape_and_triangle_face_identity(self):
        self.assertEqual(len(self.shape['faces']),6)
        self.assertAlmostEqual(self.volume(self.shape),6000)
        self.assertIn('CASCADE Topology',self.shape['brep']['data'])
        mesh=self.shape['meshes'][0]
        self.assertEqual(len(mesh['triangleFaces']),len(mesh['indices'])//3)
        self.assertEqual(set(mesh['triangleFaces']),set(range(6)))

    def test_outward_move_changes_solid_volume_and_keeps_original(self):
        result=self.move([1.,0.,0.],[2,0,0])
        self.assertAlmostEqual(self.volume(result),7200,places=4)
        self.assertEqual(result['brep']['original'],self.shape['brep']['data'])
        self.assertEqual(len(result['brep']['history']),1)

    def test_inward_and_z_face_moves_are_exact(self):
        self.assertAlmostEqual(self.volume(self.move([1.,0.,0.],[-2,0,0])),4800,places=4)
        self.assertAlmostEqual(self.volume(self.move([0.,0.,1.],[0,0,5])),7000,places=4)

    def test_portable_json_reload_and_second_edit(self):
        import json
        first=self.move([1.,0.,0.],[2,0,0]);saved=json.loads(json.dumps(first))
        face=next(f['index'] for f in saved['faces'] if f.get('normal')==[0.,0.,1.])
        result=process(dict(action='move',brep=saved['brep'],faceIndices=[face],offset=[0,0,5],name='saved'))
        self.assertAlmostEqual(self.volume(result),8400,places=4)
        self.assertEqual(len(result['brep']['history']),2)

    def test_failed_edits_leave_input_unchanged(self):
        before=copy.deepcopy(self.shape)
        for offset,faces in [([0,2,0],[self.face([1.,0.,0.])]),([0,0,0],[0]),([1,0,0],[999]),([-20,0,0],[self.face([1.,0.,0.])])]:
            with self.assertRaises(ValueError):process(dict(action='move',brep=self.shape['brep'],faceIndices=faces,offset=offset))
        self.assertEqual(before,self.shape)

    def test_curved_faces_are_preserved_but_not_moved(self):
        writer=STEPControl_Writer();writer.Transfer(BRepPrimAPI_MakeCylinder(10,20).Shape(),STEPControl_AsIs);writer.Write(str(self.root/'cylinder.step'))
        shape=process(dict(action='import',path=str(self.root/'cylinder.step')))
        face=next(f['index'] for f in shape['faces'] if not f['planar'])
        with self.assertRaisesRegex(ValueError,'planar'):process(dict(action='move',brep=shape['brep'],faceIndices=[face],offset=[1,0,0]))

class OpenBrepAndPlacementTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def imported(self,shape):
        writer=STEPControl_Writer();writer.Transfer(shape,STEPControl_AsIs);writer.Write(str(self.root/'surface.step'))
        return process(dict(action='import',path=str(self.root/'surface.step')))
    def test_off_origin_import_centers_xy_and_places_bottom_on_bed(self):
        from OCP.gp import gp_Pnt
        shape=self.imported(BRepPrimAPI_MakeBox(gp_Pnt(70,-50,-20),10,20,30).Shape())
        positions=shape['meshes'][0]['positions'];xs=positions[::3];ys=positions[1::3];zs=positions[2::3]
        self.assertAlmostEqual((min(xs)+max(xs))/2,0);self.assertAlmostEqual((min(ys)+max(ys))/2,0);self.assertAlmostEqual(min(zs),0)
        restored=read_brep(shape['brep']['data'],self.root);self.assertTrue(BRepCheck_Analyzer(restored).IsValid())
    def test_live_step_text_keeps_rhino_coordinates_and_editable_source(self):
        from OCP.gp import gp_Pnt
        self.imported(BRepPrimAPI_MakeBox(gp_Pnt(70,-50,8),10,20,30).Shape())
        text=(self.root/'surface.step').read_text()
        result=process(dict(action='import',step=text,name='Rhino live',center=False))
        positions=result['meshes'][0]['positions']
        self.assertAlmostEqual(min(positions[::3]),70);self.assertAlmostEqual(min(positions[1::3]),-50);self.assertAlmostEqual(min(positions[2::3]),8)
        self.assertIn('CASCADE Topology',result['brep']['data']);self.assertEqual(result['name'],'Rhino live')

    def test_open_planar_face_moves_in_arbitrary_xyz_and_remains_exact(self):
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
        from OCP.gp import gp_Pln,gp_Pnt,gp_Dir
        shape=self.imported(BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0,0,0),gp_Dir(0,0,1)),0,10,0,20).Face())
        moved=process(dict(action='move',brep=shape['brep'],faceIndices=[0],offset=[3,4,5]))
        for axis,delta in enumerate([3,4,5]):self.assertAlmostEqual(moved['faces'][0]['bounds'][0][axis]-shape['faces'][0]['bounds'][0][axis],delta,places=5)
        self.assertEqual(moved['brep']['original'],shape['brep']['original']);self.assertEqual(len(moved['faces']),1)
    def test_open_curved_face_moves_without_losing_curvature(self):
        import math
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
        from OCP.gp import gp_Cylinder,gp_Ax3,gp_Pnt,gp_Dir
        face=BRepBuilderAPI_MakeFace(gp_Cylinder(gp_Ax3(gp_Pnt(0,0,0),gp_Dir(0,0,1)),5),0,math.pi,0,20).Face()
        shape=self.imported(face);moved=process(dict(action='move',brep=shape['brep'],faceIndices=[0],offset=[2,0,3]))
        self.assertFalse(moved['faces'][0]['planar']);self.assertAlmostEqual(moved['faces'][0]['area'],shape['faces'][0]['area'])
    def test_moving_one_open_face_keeps_other_faces(self):
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeFace
        from OCP.BRep import BRep_Builder
        from OCP.TopoDS import TopoDS_Compound
        from OCP.gp import gp_Pln,gp_Pnt,gp_Dir
        builder=BRep_Builder();compound=TopoDS_Compound();builder.MakeCompound(compound)
        for z in (0,5):builder.Add(compound,BRepBuilderAPI_MakeFace(gp_Pln(gp_Pnt(0,0,z),gp_Dir(0,0,1)),0,10,0,20).Face())
        shape=self.imported(compound);moved=process(dict(action='move',brep=shape['brep'],faceIndices=[0],offset=[0,0,2]))
        self.assertEqual(len(moved['faces']),2)
        heights=sorted((f['bounds'][0][2]+f['bounds'][1][2])/2 for f in moved['faces'])
        self.assertAlmostEqual(heights[0],2,places=5);self.assertAlmostEqual(heights[1],5,places=5)

    def shared_edges(self,shape):
        from OCP.TopTools import TopTools_IndexedMapOfShape
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopAbs import TopAbs_EDGE
        from occt_brep_bridge import faces_of
        seen=TopTools_IndexedMapOfShape();counts={}
        for face in faces_of(shape):
            exp=TopExp_Explorer(face,TopAbs_EDGE);unique=set()
            while exp.More():unique.add(seen.Add(exp.Current()));exp.Next()
            for edge in unique:counts[edge]=counts.get(edge,0)+1
        return sum(count>1 for count in counts.values())

    def test_connected_planar_neighbors_follow_shared_edge_without_separation(self):
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakePolygon,BRepBuilderAPI_MakeFace,BRepBuilderAPI_Sewing
        from OCP.gp import gp_Pnt
        sew=BRepBuilderAPI_Sewing(1e-7)
        for points in [[(0,0,0),(10,0,0),(10,20,0),(0,20,0)],[(0,0,0),(0,20,0),(0,20,10),(0,0,10)]]:
            wire=BRepBuilderAPI_MakePolygon()
            for point in points:wire.Add(gp_Pnt(*point))
            wire.Close();sew.Add(BRepBuilderAPI_MakeFace(wire.Wire(),True).Face())
        sew.Perform();shape=self.imported(sew.SewedShape());source=read_brep(shape['brep']['data'],self.root)
        selected=next(f['index'] for f in shape['faces'] if abs(f.get('normal',[0,0,0])[2])>.9)
        moved=process(dict(action='move',brep=shape['brep'],faceIndices=[selected],offset=[3,0,2]))
        result=read_brep(moved['brep']['data'],self.root)
        self.assertEqual(len(moved['faces']),2);self.assertEqual(self.shared_edges(source),1);self.assertEqual(self.shared_edges(result),1);self.assertTrue(BRepCheck_Analyzer(result).IsValid())

    def test_connected_cylinder_wall_stretches_with_planar_cap_and_keeps_common_edge(self):
        from occt_brep_bridge import faces_of,plane_of_face
        from OCP.BRep import BRep_Builder
        from OCP.TopoDS import TopoDS_Compound
        cylinder=BRepPrimAPI_MakeCylinder(5,20).Shape();builder=BRep_Builder();compound=TopoDS_Compound();builder.MakeCompound(compound)
        for face in faces_of(cylinder):
            plane=plane_of_face(face)
            if plane is None or plane.Location().Z()>10:builder.Add(compound,face)
        shape=self.imported(compound);selected=next(f['index'] for f in shape['faces'] if f['planar'])
        moved=process(dict(action='move',brep=shape['brep'],faceIndices=[selected],offset=[0,0,3]))
        self.assertEqual(len(moved['faces']),2);self.assertGreater(self.shared_edges(read_brep(moved['brep']['data'],self.root)),0)
        self.assertAlmostEqual(max(moved['meshes'][0]['positions'][2::3]),23,places=5)
        self.assertTrue(any(f['planar'] for f in moved['faces']))

    def test_whole_solid_translation_preserves_volume_and_records_transform(self):
        shape=self.imported(BRepPrimAPI_MakeBox(10,20,30).Shape());moved=process(dict(action='translate',brep=shape['brep'],faceIndices=[],offset=[10,-3,4]))
        restored=read_brep(moved['brep']['data'],self.root);props=GProp_GProps();BRepGProp.VolumeProperties_s(restored,props)
        self.assertAlmostEqual(props.Mass(),6000);self.assertEqual(moved['brep']['history'][-1]['operation'],'translate')

if __name__=='__main__':unittest.main()
