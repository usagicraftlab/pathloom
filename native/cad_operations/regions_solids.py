"""Exact planar regions, basic solids and bounded closure operations."""
import math
from . import (CadError,point,vec,finite,positive,plane,axis2,wire,poly,compound,
               input_one,subshapes,BRepBuilderAPI_Copy,BRepBuilderAPI_MakeFace,
               BRepBuilderAPI_MakeEdge,BRepBuilderAPI_MakeWire,BRepPrimAPI_MakePrism,
               TopAbs_EDGE,TopAbs_FACE,TopAbs_SOLID,TopAbs_SHELL,TopAbs_VERTEX,TopoDS)
from OCP.gp import gp_Pnt,gp_Vec,gp_Ax2,gp_Dir,gp_Circ,gp_GTrsf,gp_Mat,gp_XYZ
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
from OCP.BRepCheck import BRepCheck_Analyzer

OPERATIONS={'surface.planarRegion','solid.ellipsoid','shape.pipe','shape.cap','solid.assemble'}
def contact_common(a,b):
    """Preserve exact face/edge/point contact omitted by solid-volume Common."""
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Common,BRepAlgoAPI_Cut,BRepAlgoAPI_Section
    groups={TopAbs_FACE:[],TopAbs_EDGE:[],TopAbs_VERTEX:[]}
    for kind in groups:
        for source in subshapes(a,kind):
            c=BRepAlgoAPI_Common(source,b);c.Build()
            if not c.IsDone():raise CadError('CAD_KERNEL_FAILED','接触部分の共通形状を検査できません。')
            groups[kind].extend(subshapes(c.Shape(),kind))
    section=BRepAlgoAPI_Section(a,b,False);section.Build()
    if not section.IsDone():raise CadError('CAD_KERNEL_FAILED','接触境界を検査できません。')
    for kind in (TopAbs_EDGE,TopAbs_VERTEX):groups[kind].extend(subshapes(section.Shape(),kind))
    kept=[]
    for kind in (TopAbs_FACE,TopAbs_EDGE,TopAbs_VERTEX):
        for candidate in groups[kind]:
            if not kept:kept.append(candidate);continue
            # Set subtraction removes covered boundaries, not source-reference
            # matching by bbox/proximity. Preserve every uncovered component.
            cut=BRepAlgoAPI_Cut(candidate,compound(kept));cut.Build()
            if not cut.IsDone():raise CadError('CAD_KERNEL_FAILED','接触部分を重複なく保持できません。')
            kept.extend(subshapes(cut.Shape(),kind))
    return compound(kept)
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def unit(v):
    n=math.sqrt(dot(v,v))
    if n<1e-12:raise CadError('CAD_INPUT_DEGENERATE','作図方向を一意に定義できません。')
    return [x/n for x in v]
def same_plane(a,b,tol):return a.Axis().Direction().IsParallel(b.Axis().Direction(),tol['angularRad']) and a.Distance(b.Location())<=tol['kernelLinearMm']

def loop_face(w):
    if not w.Closed():raise CadError('CAD_PROFILE_OPEN','閉じた輪郭を指定してください。端点を勝手に補完しません。',('showEndpoints','reselectReference'))
    builder=BRepBuilderAPI_MakeFace(w,True)
    if not builder.IsDone():raise CadError('CAD_REGION_NONPLANAR','輪郭は平面である必要があります。',('reselectReference',))
    f=builder.Face()
    if not BRepCheck_Analyzer(f).IsValid():raise CadError('CAD_REGION_INVALID','自己交差などの不正な閉輪郭です。',('reselectReference',))
    return f

def regions(shapes,tol):
    from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
    from OCP.BRepClass import BRepClass_FaceClassifier
    from OCP.BRepTools import BRepTools
    from OCP.TopAbs import TopAbs_IN
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps
    if not shapes:raise CadError('CAD_INPUT_MISSING','閉じた輪郭群を選択してください。')
    loops=[wire(BRepBuilderAPI_Copy(s).Shape()) for s in shapes]
    faces=[loop_face(w) for w in loops];pl=BRepAdaptor_Surface(faces[0]).Plane()
    for f in faces:
        if not same_plane(pl,BRepAdaptor_Surface(f).Plane(),tol):raise CadError('CAD_REGION_NONPLANAR','全輪郭を同じ平面上に指定してください。')
    # Normalize each outer wire against a common plane before reversing holes.
    faces=[BRepBuilderAPI_MakeFace(pl,w,True).Face() for w in loops]
    loops=[BRepTools.OuterWire_s(f) for f in faces]
    for i,a in enumerate(loops):
        for b in loops[i+1:]:
            section=BRepAlgoAPI_Section(a,b,False);section.Build()
            if not section.IsDone():raise CadError('CAD_KERNEL_FAILED','輪郭の交差を検査できません。')
            if subshapes(section.Shape(),TopAbs_VERTEX) or subshapes(section.Shape(),TopAbs_EDGE):
                raise CadError('CAD_REGION_AMBIGUOUS','輪郭同士が接触・交差・重複しています。領域を選び直してください。')
    areas=[]
    for f in faces:
        props=GProp_GProps();BRepGProp.SurfaceProperties_s(f,props);areas.append(abs(props.Mass()))
    inside=[]
    for i,w in enumerate(loops):
        q=BRep_Tool.Pnt_s(subshapes(w,TopAbs_VERTEX)[0])
        inside.append([j for j,f in enumerate(faces) if j!=i and BRepClass_FaceClassifier(f,q,tol['kernelLinearMm']).State()==TopAbs_IN])
    parents=[min(v,key=lambda j:areas[j]) if v else None for v in inside]
    out=[]
    for i,w in enumerate(loops):
        if len(inside[i])%2:continue
        builder=BRepBuilderAPI_MakeFace(pl,w,True)
        for j,hole in enumerate(loops):
            if parents[j]==i:builder.Add(TopoDS.Wire_s(hole.Reversed()))
        f=builder.Face()
        if not BRepCheck_Analyzer(f).IsValid():raise CadError('CAD_REGION_INVALID','穴を含む平面領域を構成できません。')
        out.append((f'region/{i}',f,{}))
    return out

def box(p):
    pts=p.get('points',[]);mode=p['mode'];height=positive(p['heightMm'])
    if mode=='twoCorners':
        if len(pts)!=2:raise CadError('CAD_INPUT_MISSING','底面の2コーナーを指定してください。')
        a,b=map(vec,pts);_,x,y=plane(p['plane']);n=cross(x,y);delta=[b[i]-a[i] for i in range(3)]
        if abs(dot(delta,n))>1e-6:raise CadError('CAD_INPUT_TYPE','2コーナーは指定平面に平行な底面上に指定してください。')
        u,v=dot(delta,x),dot(delta,y)
        if min(abs(u),abs(v))<1e-12:raise CadError('CAD_INPUT_DEGENERATE','底面の幅と奥行は0以外です。')
        a=[a[i]+min(u,0)*x[i]+min(v,0)*y[i] for i in range(3)];width,depth=abs(u),abs(v)
    elif mode=='threePoints':
        if len(pts)!=3:raise CadError('CAD_INPUT_MISSING','底面の基準点・幅方向点・奥行側の点を指定してください。')
        a,b,c=map(vec,pts);ab=[b[i]-a[i] for i in range(3)];ac=[c[i]-a[i] for i in range(3)]
        width=math.sqrt(dot(ab,ab));x=unit(ab);n=unit(cross(ab,ac));y=cross(n,x);depth=positive(dot(ac,y))
    else:raise CadError('CAD_INPUT_TYPE','Box modeはdimensions/twoCorners/threePointsです。')
    pts=[a,[a[i]+width*x[i] for i in range(3)],[a[i]+width*x[i]+depth*y[i] for i in range(3)],[a[i]+depth*y[i] for i in range(3)]]
    face=BRepBuilderAPI_MakeFace(poly(pts,True)).Face()
    return [('box',BRepPrimAPI_MakePrism(face,gp_Vec(*[height*v for v in n])).Shape(),{})]

def assemble(shapes,tol,cap):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing,BRepBuilderAPI_MakeSolid
    from OCP.ShapeAnalysis import ShapeAnalysis_FreeBounds
    from OCP.BRepLib import BRepLib
    if not shapes or any(not subshapes(s,TopAbs_FACE) for s in shapes):raise CadError('CAD_INPUT_TYPE','面・Shell・Solidの群を選択してください。')
    def sew(items):
        builder=BRepBuilderAPI_Sewing(tol['joinLinearMm'])
        for s in items:builder.Add(BRepBuilderAPI_Copy(s).Shape())
        builder.Perform();return builder.SewedShape()
    joined=sew(shapes)
    if cap:
        bounds=ShapeAnalysis_FreeBounds(joined,False,True,False)
        if subshapes(bounds.GetOpenWires(),TopAbs_EDGE):raise CadError('CAD_CAP_OPEN','開放境界を閉じた輪郭にできません。元の形状は保持します。')
        groups=[]
        from . import TopAbs_WIRE
        for w in subshapes(bounds.GetClosedWires(),TopAbs_WIRE):
            try:f=loop_face(w)
            except CadError as e:raise CadError('CAD_CAP_NONPLANAR','非平面または不正な開口は自動で塞ぎません。',details={'cause':str(e)})
            pl=BRepAdaptor_Surface(f).Plane()
            group=next((g for g in groups if same_plane(g[0],pl,tol)),None)
            if group is None:group=[pl,[]];groups.append(group)
            group[1].append(w)
        caps=[f for _,ws in groups for _,f,_ in regions(ws,tol)]
        if caps:joined=sew([joined]+caps)
    shells=subshapes(joined,TopAbs_SHELL);out=[];covered=[]
    for i,shell in enumerate(shells):
        covered.extend(subshapes(shell,TopAbs_FACE))
        if BRep_Tool.IsClosed_s(shell):
            solid=BRepBuilderAPI_MakeSolid(shell).Solid()
            if not BRepLib.OrientClosedSolid_s(solid) or not BRepCheck_Analyzer(solid).IsValid():raise CadError('CAD_CAP_FAILED','閉Shellから有効なSolidを構成できません。')
            out.append((f'solid/{i}',solid,{}))
        else:out.append((f'open/{i}',shell,{'warning':'閉じていないShellとして保持しました。','warningCode':'CAD_OPEN_RESULT'}))
    for i,f in enumerate(subshapes(joined,TopAbs_FACE)):
        if not any(f.IsSame(c) for c in covered):out.append((f'face/{i}',f,{'warning':'開いた面として保持しました。','warningCode':'CAD_OPEN_RESULT'}))
    if not out:raise CadError('CAD_CAP_FAILED','保持できる面/立体がありません。')
    return out

def evaluate(op,p,inputs,tol,selectors):
    if op=='surface.planarRegion':return regions(inputs.get('boundaries',[]),tol)
    if op=='solid.box':return box(p)
    if op=='solid.ellipsoid':
        from OCP.BRepPrimAPI import BRepPrimAPI_MakeSphere
        from OCP.BRepBuilderAPI import BRepBuilderAPI_GTransform
        radii=vec(p['radiiMm']);radii=[positive(v) for v in radii];_,x,y=plane(p['plane']);z=cross(x,y)
        tr=gp_GTrsf();tr.SetVectorialPart(gp_Mat(*[v for row in zip([v*radii[0] for v in x],[v*radii[1] for v in y],[v*radii[2] for v in z]) for v in row]));tr.SetTranslationPart(gp_XYZ(*vec(p['center'])))
        return [('ellipsoid',BRepBuilderAPI_GTransform(BRepPrimAPI_MakeSphere(1.).Shape(),tr,True).Shape(),{})]
    if op in ('shape.cap','solid.assemble'):return assemble(inputs.get('objects',[]),tol,op=='shape.cap')
    if op=='shape.pipe':
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakePipeShell
        from OCP.BRepTools import BRepTools_WireExplorer
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Transformed,BRepBuilderAPI_RightCorner,BRepBuilderAPI_RoundCorner
        from OCP.TopAbs import TopAbs_REVERSED
        rail=wire(input_one(inputs,'rail'));ex=BRepTools_WireExplorer(rail)
        if not ex.More():raise CadError('CAD_INPUT_TYPE','Pipeには連続railが必要です。')
        edge=ex.Current();ad=BRepAdaptor_Curve(edge);q=gp_Pnt();v=gp_Vec();rev=edge.Orientation()==TopAbs_REVERSED;ad.D1(ad.LastParameter() if rev else ad.FirstParameter(),q,v)
        if rev:v.Reverse()
        profile=BRepBuilderAPI_MakeWire(BRepBuilderAPI_MakeEdge(gp_Circ(gp_Ax2(q,gp_Dir(v)),positive(p['radiusMm']))).Edge()).Wire()
        transition={'transformed':BRepBuilderAPI_Transformed,'rightCorner':BRepBuilderAPI_RightCorner,'roundCorner':BRepBuilderAPI_RoundCorner}
        if p['transitionMode'] not in transition or p['frameMode'] not in ('corrected-frame','frenet'):raise CadError('CAD_INPUT_TYPE','Pipeのframe/角部方式を明示してください。')
        if not isinstance(p['cap'],bool):raise CadError('CAD_INPUT_TYPE','capはtrue/falseです。')
        b=BRepOffsetAPI_MakePipeShell(rail);b.SetMode(p['frameMode']=='frenet');b.SetTransitionMode(transition[p['transitionMode']]);b.Add(profile,False,True);b.Build()
        if not b.IsDone():raise CadError('CAD_PIPE_FAILED','指定rail/半径/角部方式でPipeを構成できません。')
        if p['cap'] and not b.MakeSolid():raise CadError('CAD_PIPE_FAILED','Pipeの蓋を構成できません。')
        return [('pipe',b.Shape(),{})]
    raise CadError('CAD_SCHEMA_UNSUPPORTED','未対応の立体演算です。')
