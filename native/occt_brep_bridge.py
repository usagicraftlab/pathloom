"""Portable exact Open CASCADE B-rep import / planar face push-pull.

One JSON request on stdin and one JSON response on stdout. Meshes are disposable
previews; serialized B-rep is the editable source of truth, embedded in projects.
"""
import contextlib
import io
import json
import math
import os
import sys
import tempfile
from pathlib import Path

MAX_BYTES = 100 * 1024 * 1024


def read_brep(data, root):
    from OCP.BRep import BRep_Builder
    from OCP.BRepTools import BRepTools
    from OCP.TopoDS import TopoDS_Shape
    if not isinstance(data, str) or len(data.encode()) > MAX_BYTES:
        raise ValueError('Invalid or excessive B-rep data')
    path = root / 'source.brep'
    path.write_text(data)
    shape = TopoDS_Shape()
    if not BRepTools.Read_s(shape, str(path), BRep_Builder()) or shape.IsNull():
        raise ValueError('Unable to restore the editable B-rep')
    return shape


def faces_of(shape):
    from OCP.TopAbs import TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    faces = []
    while explorer.More():
        faces.append((getattr(TopoDS,'Face_s',None) or TopoDS.Face)(explorer.Current()))
        if len(faces) > 200000:
            raise ValueError('CAD model exceeds the face limit')
        explorer.Next()
    return faces


def plane_of_face(face):
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.BRep import BRep_Tool
    from OCP.GeomLib import GeomLib_IsPlanarSurface
    surface=BRepAdaptor_Surface(face)
    if surface.GetType()==GeomAbs_Plane:return surface.Plane()
    planar=GeomLib_IsPlanarSurface(BRep_Tool.Surface_s(face),1e-7)
    return planar.Plan() if planar.IsPlanar() else None


def inspect_shape(shape, root, name, history=None, original=None):
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBndLib import BRepBndLib
    from OCP.BRepGProp import BRepGProp
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.BRepTools import BRepTools
    from OCP.Bnd import Bnd_Box
    from OCP.GProp import GProp_GProps
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.TopAbs import TopAbs_REVERSED
    from OCP.TopLoc import TopLoc_Location
    # Never persist triangulation as the source geometry.
    BRepTools.Clean_s(shape)
    path = root / 'result.brep'
    if not BRepTools.Write_s(shape, str(path)):
        raise ValueError('Could not serialize B-rep')
    data = path.read_text()
    if len(data.encode()) > MAX_BYTES:
        raise ValueError('B-rep exceeds the 100 MB limit')
    mesher = BRepMesh_IncrementalMesh(shape, .05, False, .2, False)
    if not mesher.IsDone():
        raise ValueError('Could not tessellate CAD preview')
    positions, indices, triangle_faces, descriptors = [], [], [], []
    for index, face in enumerate(faces_of(shape)):
        surface = BRepAdaptor_Surface(face)
        plane=plane_of_face(face)
        planar = plane is not None
        props = GProp_GProps()
        BRepGProp.SurfaceProperties_s(face, props)
        bounds = Bnd_Box()
        BRepBndLib.Add_s(face, bounds)
        xyz = bounds.Get()
        descriptor = dict(index=index, area=props.Mass(), bounds=[list(xyz[:3]), list(xyz[3:])], planar=planar)
        if planar:
            normal = plane.Axis().Direction()
            sign = -1 if face.Orientation() == TopAbs_REVERSED else 1
            descriptor['normal'] = [sign * normal.X(), sign * normal.Y(), sign * normal.Z()]
        descriptors.append(descriptor)
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, location)
        if tri is None:
            raise ValueError('A CAD face has no display triangulation')
        base = len(positions) // 3
        for i in range(1, tri.NbNodes() + 1):
            point = tri.Node(i).Transformed(location.Transformation())
            positions.extend([point.X(), point.Y(), point.Z()])
        for i in range(1, tri.NbTriangles() + 1):
            a, b, c = tri.Triangle(i).Get()
            if face.Orientation() == TopAbs_REVERSED:
                b, c = c, b
            indices.extend([base + a - 1, base + b - 1, base + c - 1])
            triangle_faces.append(index)
        if len(positions) > 3000000 or len(indices) > 6000000:
            raise ValueError('CAD preview exceeds display limits')
    return dict(name=name, visible=True, kernel='Open CASCADE',
                brep=dict(format='occt-brep', version=1, data=data, original=original or data, history=history or []),
                faces=descriptors, meshes=[dict(name=name, positions=positions, indices=indices,
                                               normals=[], color=[.72,.76,.81], triangleFaces=triangle_faces)])


def stretch_connected_open(shape,faces,selected,offset):
    """Exact affine stretch of connected curved neighbors; selected plane translates,
    the far boundary remains fixed. No tessellated geometry replaces CAD surfaces.
    """
    from OCP.TopAbs import TopAbs_VERTEX
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopoDS import TopoDS,TopoDS_Compound
    from OCP.BRep import BRep_Tool,BRep_Builder
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBuilderAPI import BRepBuilderAPI_GTransform,BRepBuilderAPI_Sewing
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.gp import gp_GTrsf
    vertices=TopTools_IndexedMapOfShape();members=[];owners={}
    for index,face in enumerate(faces):
        exp=TopExp_Explorer(face,TopAbs_VERTEX);ids=set()
        while exp.More():
            key=vertices.Add(exp.Current());ids.add(key);owners.setdefault(key,set()).add(index);exp.Next()
        members.append(ids)
    pending=set(selected);output=[];processed=set()
    while pending:
        seed=pending.pop();component={seed};queue=[seed]
        while queue:
            index=queue.pop()
            for vertex in members[index]:
                for neighbor in owners[vertex]-component:component.add(neighbor);queue.append(neighbor)
        chosen=component&set(selected);pending-=component;processed|=component
        first=plane_of_face(faces[next(iter(chosen))])
        if first is None:raise ValueError('Connected movement of a curved selected face is not supported yet; original geometry was kept')
        plane=first;normal=plane.Axis().Direction();n=[normal.X(),normal.Y(),normal.Z()];origin=plane.Location();d=sum(a*b for a,b in zip(n,[origin.X(),origin.Y(),origin.Z()]))
        for index in chosen:
            surface=plane_of_face(faces[index])
            if surface is None:raise ValueError('Select coplanar faces for connected curved-surface deformation')
            for vertex in members[index]:
                point=BRep_Tool.Pnt_s(TopoDS.Vertex_s(vertices.FindKey(vertex)))
                if abs(sum(a*b for a,b in zip(n,[point.X(),point.Y(),point.Z()]))-d)>1e-6:raise ValueError('Select coplanar faces for connected curved-surface deformation')
        values=[]
        for vertex in set().union(*(members[index] for index in component)):
            point=BRep_Tool.Pnt_s(TopoDS.Vertex_s(vertices.FindKey(vertex)));values.append(sum(a*b for a,b in zip(n,[point.X(),point.Y(),point.Z()])))
        anchor=max(values,key=lambda value:abs(value-d));extent=d-anchor
        if abs(extent)<1e-7:raise ValueError('Cannot deform this connected surface without breaking its boundaries; original geometry was kept')
        if 1+sum(a*b for a,b in zip(n,offset))/extent<=1e-6:raise ValueError('Connected deformation would collapse or invert the shape')
        transform=gp_GTrsf()
        for row in range(3):
            for col in range(3):transform.SetValue(row+1,col+1,(1 if row==col else 0)+offset[row]*n[col]/extent)
            transform.SetValue(row+1,4,-offset[row]*anchor/extent)
        compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
        for index in component:builder.Add(compound,faces[index])
        output.append(BRepBuilderAPI_GTransform(compound,transform,True).Shape())
    output.extend(face for index,face in enumerate(faces) if index not in processed)
    compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
    for part in output:builder.Add(compound,part)
    sew=BRepBuilderAPI_Sewing(1e-7);sew.Add(compound);sew.Perform();return sew.SewedShape()


def move_connected_open_faces(shape,faces,selected,offset):
    from OCP.TopAbs import TopAbs_VERTEX,TopAbs_EDGE,TopAbs_WIRE,TopAbs_REVERSED
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopoDS import TopoDS,TopoDS_Compound
    from OCP.BRep import BRep_Tool,BRep_Builder
    from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform,BRepBuilderAPI_MakePolygon,BRepBuilderAPI_MakeFace,BRepBuilderAPI_Sewing
    from OCP.BRepTools import BRepTools,BRepTools_WireExplorer
    from OCP.GeomAbs import GeomAbs_Plane,GeomAbs_Line
    from OCP.gp import gp_Trsf,gp_Vec,gp_Pnt
    moved=TopTools_IndexedMapOfShape()
    for index in selected:
        exp=TopExp_Explorer(faces[index],TopAbs_VERTEX)
        while exp.More():moved.Add(exp.Current());exp.Next()
    transform=gp_Trsf();transform.SetTranslation(gp_Vec(*offset));rebuilt=[]
    for index,face in enumerate(faces):
        exp=TopExp_Explorer(face,TopAbs_VERTEX);touches=False
        while exp.More():
            if moved.Contains(exp.Current()):touches=True
            exp.Next()
        if index in selected:rebuilt.append(BRepBuilderAPI_Transform(face,transform,True).Shape());continue
        if not touches:rebuilt.append(face);continue
        if BRepAdaptor_Surface(face).GetType()!=GeomAbs_Plane:
            return stretch_connected_open(shape,faces,selected,offset)
        edges=TopExp_Explorer(face,TopAbs_EDGE)
        while edges.More():
            if BRepAdaptor_Curve(TopoDS.Edge_s(edges.Current())).GetType()!=GeomAbs_Line:
                return stretch_connected_open(shape,faces,selected,offset)
            edges.Next()
        wires=TopExp_Explorer(face,TopAbs_WIRE);count=0
        while wires.More():count+=1;wires.Next()
        if count!=1:raise ValueError('Connected deformation of faces with inner loops is not supported yet')
        walker=BRepTools_WireExplorer(BRepTools.OuterWire_s(face),face);polygon=BRepBuilderAPI_MakePolygon()
        while walker.More():
            vertex=walker.CurrentVertex();point=BRep_Tool.Pnt_s(vertex)
            if moved.Contains(vertex):point=gp_Pnt(point.X()+offset[0],point.Y()+offset[1],point.Z()+offset[2])
            polygon.Add(point);walker.Next()
        polygon.Close()
        if not polygon.IsDone():raise ValueError('Connected deformation collapsed a neighboring boundary')
        maker=BRepBuilderAPI_MakeFace(polygon.Wire(),True)
        if not maker.IsDone():raise ValueError('Connected deformation would make a neighboring face non-planar; original geometry was kept')
        result=maker.Face();old=BRepAdaptor_Surface(face).Plane().Axis().Direction();new=BRepAdaptor_Surface(result).Plane().Axis().Direction()
        sign=-1 if face.Orientation()==TopAbs_REVERSED else 1
        if sign*old.Dot(new)<0:result.Reverse()
        rebuilt.append(result)
    compound=TopoDS_Compound();builder=BRep_Builder();builder.MakeCompound(compound)
    for face in rebuilt:builder.Add(compound,face)
    sew=BRepBuilderAPI_Sewing(1e-7);sew.Add(compound);sew.Perform()
    return sew.SewedShape()


def slice_brep(shape, height, tolerance):
    from OCP.BRep import BRep_Tool
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box
    from OCP.gp import gp_Pln, gp_Pnt, gp_Dir
    from OCP.TopExp import TopExp, TopExp_Explorer
    from OCP.TopAbs import TopAbs_EDGE, TopAbs_REVERSED
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import TopTools_HSequenceOfShape
    from OCP.ShapeAnalysis import ShapeAnalysis_FreeBounds
    from OCP.BRepTools import BRepTools_WireExplorer
    from OCP.BRepAdaptor import BRepAdaptor_Curve
    from OCP.GCPnts import GCPnts_QuasiUniformDeflection
    from OCP.GeomAbs import GeomAbs_Line
    if not isinstance(height,(int,float)) or not math.isfinite(height) or not .05<=height<=10:raise ValueError('Invalid slice layer height')
    if not isinstance(tolerance,(int,float)) or not math.isfinite(tolerance) or not .001<=tolerance<=.2:raise ValueError('Invalid slice tolerance')
    bounds=Bnd_Box();BRepBndLib.AddOptimal_s(shape,bounds,False,False)
    _,_,low,_,_,high=bounds.Get()
    if high-low<height*.5:raise ValueError('STEP model is too thin to slice at this layer height')
    count=math.floor((high-low-height/2)/height)+1
    if count>2000:raise ValueError('Slicing would create more than 2,000 layers')
    def section_wires(z):
        try:
            section=BRepAlgoAPI_Section(shape,gp_Pln(gp_Pnt(0,0,z),gp_Dir(0,0,1)),False)
            section.Approximation(True);section.Build()
            if not section.IsDone():return None
            edges=TopTools_HSequenceOfShape();explorer=TopExp_Explorer(section.Shape(),TopAbs_EDGE)
            while explorer.More():edges.Append(explorer.Current());explorer.Next()
            wires=TopTools_HSequenceOfShape();ShapeAnalysis_FreeBounds.ConnectEdgesToWires_s(edges,1e-6,False,wires)
            return wires
        except RuntimeError:return None
    paths=[];total=0
    for layer in range(count):
        # Sample at the layer center; print at the layer top.
        sample_z=low+(layer+.5)*height
        z=round(low+(layer+1)*height,9)
        wires=section_wires(sample_z)
        if wires is None:raise ValueError('Open CASCADE section failed')
        for i in range(1,wires.Length()+1):
            wire=TopoDS.Wire_s(wires.Value(i));walk=BRepTools_WireExplorer(wire);points=[]
            while walk.More():
                edge=walk.Current();curve=BRepAdaptor_Curve(edge)
                if curve.GetType()==GeomAbs_Line:
                    samples=[curve.Value(curve.FirstParameter()),curve.Value(curve.LastParameter())]
                else:
                    sample=GCPnts_QuasiUniformDeflection(curve,tolerance)
                    if not sample.IsDone():raise ValueError('Unable to discretize section curve')
                    samples=[sample.Value(j) for j in range(1,sample.NbPoints()+1)]
                if edge.Orientation()==TopAbs_REVERSED:samples.reverse()
                # Section curve ranges can extend beyond their shared vertices
                # within OCCT tolerance. Joining those evaluated endpoints adds
                # tiny backwards segments. Use the wire's oriented vertices as
                # the endpoints, keeping every interior curve sample unchanged.
                samples[0]=BRep_Tool.Pnt_s(TopExp.FirstVertex_s(edge,True))
                samples[-1]=BRep_Tool.Pnt_s(TopExp.LastVertex_s(edge,True))
                for point in samples:
                    p=[point.X(),point.Y(),z]
                    if not points or math.dist(points[-1],p)>1e-7:points.append(p)
                walk.Next()
            if len(points)<2:continue
            if math.dist(points[0],points[-1])<1e-6:points[-1]=points[0][:]
            # Merge collinear CAD edges without flattening curved sections.
            clean=[]
            for p in points:
                while len(clean)>1:
                    a,b=clean[-2:];u=[b[k]-a[k] for k in range(2)];v=[p[k]-b[k] for k in range(2)]
                    if abs(u[0]*v[1]-u[1]*v[0])>1e-9*max(1,math.hypot(*u)+math.hypot(*v)) or sum(u[k]*v[k] for k in range(2))<0:break
                    clean.pop()
                clean.append(p)
            total+=len(clean)
            if total>300000:raise ValueError('Too many section points; increase layer height or tolerance')
            paths.append(dict(points=clean,tool=0,order=len(paths)))
    if not paths:raise ValueError('No B-rep sections were found')
    return dict(paths=paths)


def process(request):
    from OCP.BRepCheck import BRepCheck_Analyzer
    with tempfile.TemporaryDirectory(prefix='pathloom-brep-') as directory:
        root = Path(directory)
        if request.get('action') == 'import':
            from OCP.IFSelect import IFSelect_RetDone
            from OCP.STEPControl import STEPControl_Reader
            if 'step' in request:
                text=request['step']
                if not isinstance(text,str) or len(text.encode())>16*1024*1024 or not text.lstrip().startswith('ISO-10303-21;') or not text.rstrip().endswith('END-ISO-10303-21;'):raise ValueError('Invalid live STEP content')
                path=root/'live.step';path.write_text(text)
            else:path = Path(request['path'])
            if path.suffix.lower() not in ('.step', '.stp') or not path.is_file() or path.stat().st_size > MAX_BYTES:
                raise ValueError('Choose a STEP file smaller than 100 MB')
            reader = STEPControl_Reader()
            if reader.ReadFile(str(path)) != IFSelect_RetDone or reader.TransferRoots() <= 0:
                raise ValueError('Open CASCADE could not read this STEP file')
            shape = reader.OneShape()
            if shape.IsNull() or not faces_of(shape):
                raise ValueError('STEP contains no CAD faces')
            if not BRepCheck_Analyzer(shape).IsValid():
                raise ValueError('STEP contains invalid CAD geometry; repair the model before importing')
            from OCP.TopExp import TopExp_Explorer
            from OCP.TopAbs import TopAbs_SOLID
            if not TopExp_Explorer(shape,TopAbs_SOLID).More() and len(faces_of(shape))>1:
                from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
                sewing=BRepBuilderAPI_Sewing(1e-7);sewing.Add(shape);sewing.Perform()
                if not sewing.SewedShape().IsNull():shape=sewing.SewedShape()

            from OCP.BRepBndLib import BRepBndLib
            from OCP.Bnd import Bnd_Box
            from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
            from OCP.gp import gp_Trsf, gp_Vec
            bounds=Bnd_Box();BRepBndLib.AddOptimal_s(shape,bounds,False,False)
            xmin,ymin,zmin,xmax,ymax,zmax=bounds.Get()
            placement=gp_Trsf();placement.SetTranslation(gp_Vec(-(xmin+xmax)/2,-(ymin+ymax)/2,-zmin))
            if request.get('center',True):shape=BRepBuilderAPI_Transform(shape,placement,True).Shape()
            return inspect_shape(shape, root, request.get('name',path.name))
        if request.get('action') not in ('move','translate','slice'):
            raise ValueError('Unsupported CAD action')
        brep = request['brep']
        if brep.get('format') != 'occt-brep' or brep.get('version') != 1:
            raise ValueError('Unsupported B-rep format')
        shape = read_brep(brep['data'], root)
        if request.get('action')=='slice':return slice_brep(shape,request.get('layerHeight'),request.get('tolerance',.02))
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
        from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
        from OCP.GeomAbs import GeomAbs_Plane
        from OCP.TopAbs import TopAbs_REVERSED, TopAbs_SOLID
        from OCP.TopExp import TopExp_Explorer
        from OCP.gp import gp_Vec
        selected = request.get('faceIndices', [])
        offset = request.get('offset', [])
        if len(offset) != 3 or any(type(v) not in (float,int) or not math.isfinite(v) or abs(v)>1000 for v in offset) or math.hypot(*offset)<1e-8:
            raise ValueError('Enter a non-zero XYZ movement within ±1000 mm')
        faces = faces_of(shape)
        solid=TopExp_Explorer(shape,TopAbs_SOLID).More()
        if request['action']=='translate' or not solid:
            from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
            from OCP.BRepTools import BRepTools_ReShape
            from OCP.gp import gp_Trsf
            transform=gp_Trsf();transform.SetTranslation(gp_Vec(*offset))
            if request['action']=='translate':
                shape=BRepBuilderAPI_Transform(shape,transform,True).Shape()
            else:
                if not selected or len(set(selected))!=len(selected) or any(type(i) is not int or i<0 or i>=len(faces) for i in selected):
                    raise ValueError('Select valid CAD faces')
                shape=move_connected_open_faces(shape,faces,selected,offset)
            if shape.IsNull() or not BRepCheck_Analyzer(shape).IsValid():
                raise ValueError('CAD transformation produced invalid geometry; original was kept')
            history=list(brep.get('history',[]))
            if len(history)>=256:raise ValueError('CAD edit history limit reached')
            history.append(dict(operation='translate' if request['action']=='translate' else 'move-faces',faceIndices=[] if request['action']=='translate' else selected,offset=offset))
            return inspect_shape(shape,root,request.get('name','STEP Input'),history,brep.get('original',brep['data']))
        if not selected or len(selected)>200000 or len(set(selected))!=len(selected) or any(type(i) is not int or i<0 or i>=len(faces) for i in selected):
            raise ValueError('Select valid CAD faces')
        operations = []
        for index in selected:
            face = faces[index]
            surface = BRepAdaptor_Surface(face)
            if surface.GetType() != GeomAbs_Plane:
                raise ValueError('Face movement currently supports planar faces only')
            normal = surface.Plane().Axis().Direction()
            sign = -1 if face.Orientation() == TopAbs_REVERSED else 1
            n = [sign*normal.X(), sign*normal.Y(), sign*normal.Z()]
            distance = sum(v*w for v,w in zip(offset,n))
            # A face offset/push-pull, not an unconstrained detached-face translation.
            if abs(distance)<1e-8 or math.sqrt(sum((v-distance*w)**2 for v,w in zip(offset,n)))>1e-6:
                raise ValueError('Move a planar face along its normal; tangential movement is not supported')
            tool = BRepPrimAPI_MakePrism(face,gp_Vec(*offset)).Shape()
            operations.append((tool,distance>0))
        for tool,additive in operations:
            operation = (BRepAlgoAPI_Fuse if additive else BRepAlgoAPI_Cut)(shape,tool)
            operation.Build()
            if not operation.IsDone():
                raise ValueError('CAD face operation failed; original geometry is unchanged')
            shape = operation.Shape()
        from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
        unify=ShapeUpgrade_UnifySameDomain(shape,True,True,True)
        unify.Build()
        shape=unify.Shape()
        if shape.IsNull() or not BRepCheck_Analyzer(shape).IsValid() or not TopExp_Explorer(shape,TopAbs_SOLID).More():
            raise ValueError('Face move did not produce a valid solid; original geometry is unchanged')
        history = list(brep.get('history',[]))
        if len(history)>=256:
            raise ValueError('CAD edit history limit reached')
        history.append(dict(operation='move-faces',faceIndices=selected,offset=offset))
        return inspect_shape(shape,root,request.get('name','STEP Input'),history,brep.get('original',brep['data']))


def main():
    try:
        raw = sys.stdin.read(220*1024*1024+1)
        if len(raw)>220*1024*1024:
            raise ValueError('CAD request exceeds supported limits')
        # Some OCCT functions emit diagnostic messages; JSON owns stdout.
        saved_stdout = os.dup(1)
        try:
            os.dup2(2,1)
            result=process(json.loads(raw))
        finally:
            os.dup2(saved_stdout,1)
            os.close(saved_stdout)
        print(json.dumps(dict(success=True,shape=result),separators=(',',':'),allow_nan=False))
    except Exception as error:
        message = 'Editable CAD runtime is missing cadquery-ocp. Run npm run cad:setup or set PATHLOOM_BREP_PYTHON.' if isinstance(error, ImportError) else str(error)
        print(json.dumps(dict(success=False,error=message),separators=(',',':')))
        return 1
    return 0

if __name__=='__main__':
    raise SystemExit(main())
