"""Pathloom exact CAD operations; independently implemented against OCP public API."""
import math
from OCP.gp import gp_Pnt, gp_Vec, gp_Dir, gp_Ax1, gp_Ax2, gp_Trsf
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, BRepBuilderAPI_MakeFace, BRepBuilderAPI_Transform, BRepBuilderAPI_Copy
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeSphere, BRepPrimAPI_MakeCylinder, BRepPrimAPI_MakeCone, BRepPrimAPI_MakeTorus, BRepPrimAPI_MakePrism, BRepPrimAPI_MakeRevol
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_SOLID, TopAbs_SHELL, TopAbs_VERTEX, TopAbs_WIRE
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS

class CadError(ValueError):
    def __init__(self, code, message, actions=('editParameters',), details=None):
        super().__init__(message); self.code=code; self.actions=actions; self.details=details or {}

def finite(v):
    if isinstance(v,bool) or not isinstance(v,(float,int)) or not math.isfinite(v):raise CadError('CAD_INPUT_DEGENERATE','有限の数値を指定してください。')
    return float(v)
def vec(v):
    if not isinstance(v,list) or len(v)!=3:raise CadError('CAD_INPUT_TYPE','XYZの3成分が必要です。')
    return [finite(x) for x in v]
def positive(v):
    v=finite(v)
    if v<=0:raise CadError('CAD_INPUT_DEGENERATE','長さ・半径は正数で指定してください。')
    return v
def point(v):return gp_Pnt(*vec(v))
def direction(v):
    a=vec(v)
    if sum(x*x for x in a)<1e-24:raise CadError('CAD_INPUT_DEGENERATE','方向を零ベクトルにできません。')
    return gp_Dir(*a)
def plane(p):
    if not isinstance(p,dict) or not all(k in p for k in ('origin','xAxis','yAxis')):raise CadError('CAD_INPUT_TYPE','平面には原点・X軸・Y軸が必要です。')
    o=vec(p['origin']);x=vec(p['xAxis']);y=vec(p['yAxis'])
    if abs(sum(v*v for v in x)-1)>1e-6 or abs(sum(v*v for v in y)-1)>1e-6 or abs(sum(a*b for a,b in zip(x,y)))>1e-6:raise CadError('CAD_INPUT_DEGENERATE','作業平面の軸は直交する単位ベクトルが必要です。')
    return o,x,y
XY=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=[0,1,0])
def at(p,u,v):
    o,x,y=plane(p);return [o[i]+u*x[i]+v*y[i] for i in range(3)]
def axis2(p,center=None):
    o,x,y=plane(p);z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]]
    return gp_Ax2(point(center or o),direction(z),direction(x))
def subshapes(s,kind):
    cast={TopAbs_EDGE:TopoDS.Edge_s,TopAbs_FACE:TopoDS.Face_s,TopAbs_WIRE:TopoDS.Wire_s,TopAbs_SOLID:TopoDS.Solid_s,TopAbs_VERTEX:TopoDS.Vertex_s,TopAbs_SHELL:TopoDS.Shell_s}[kind]
    e=TopExp_Explorer(s,kind);out=[]
    while e.More():
        q=cast(e.Current())
        if not any(q.IsSame(a) for a in out):out.append(q)
        e.Next()
    return out

def wire(s):
    if s.ShapeType()==TopAbs_WIRE:return TopoDS.Wire_s(s)
    m=BRepBuilderAPI_MakeWire()
    for e in subshapes(s,TopAbs_EDGE):m.Add(e)
    if not m.IsDone():raise CadError('CAD_JOIN_GAP','曲線を連続するwireにできません。',('showBoundaries','editTolerance','editGeometry'))
    return m.Wire()
def poly(points,closed=False):
    a=[vec(x) for x in points]
    if len(a)<2:raise CadError('CAD_INPUT_MISSING','2点以上を指定してください。')
    if closed and a[-1]!=a[0]:a=a+[a[0]]
    m=BRepBuilderAPI_MakeWire()
    for start,end in zip(a,a[1:]):
        if math.dist(start,end)<1e-12:raise CadError('CAD_INPUT_DEGENERATE','同じ位置の連続点があります。',('editInput','showProblem'))
        m.Add(BRepBuilderAPI_MakeEdge(point(start),point(end)).Edge())
    return m.Wire()
def compound(shapes):
    from OCP.BRep import BRep_Builder
    from OCP.TopoDS import TopoDS_Compound
    c=TopoDS_Compound();b=BRep_Builder();b.MakeCompound(c)
    for s in shapes:b.Add(c,s)
    return c

def input_one(inputs,key):
    a=inputs.get(key,[])
    if len(a)!=1:raise CadError('CAD_INPUT_MISSING',f'{key}: 形状を1つ選択してください。',('selectInput',))
    return BRepBuilderAPI_Copy(a[0]).Shape()

def evaluate(op,p,inputs,tol,selectors=None):
    """Return immutable output shapes; display tessellations are never operands."""
    selectors=selectors or {};semantic={};mapping=[]
    from . import regions_solids
    if op in regions_solids.OPERATIONS or op=='solid.box' and p.get('mode','dimensions')!='dimensions':
        return regions_solids.evaluate(op,p,inputs,tol,selectors)
    from . import curve_editing
    if op in curve_editing.OPERATIONS:
        return curve_editing.evaluate(op,p,inputs,tol,selectors)
    boolean_fields={'closed','periodic','cap','bothSides','rounding','solidify','tangentChain','reverse','preserveBoundary'}
    for key in boolean_fields & p.keys():
        if not isinstance(p[key],bool):raise CadError('CAD_INPUT_TYPE',f'{key} はtrue/falseで指定してください。')
    if 'anchorMode' in p and p['anchorMode'] not in ('center','corner'):raise CadError('CAD_INPUT_TYPE','基準モードはcenterまたはcornerです。')
    if op=='curve.offset':
        if set(p)-{'plane','distanceMm','joinStyle'}:raise CadError('CAD_SCHEMA_UNSUPPORTED','未対応の設定: '+', '.join(sorted(set(p)-{'plane','distanceMm','joinStyle'})))
        if {'distanceMm','joinStyle'}-set(p):raise CadError('CAD_INPUT_MISSING','必要な設定: '+', '.join(sorted({'distanceMm','joinStyle'}-set(p))))

    if op=='point.create':
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeVertex
        result=BRepBuilderAPI_MakeVertex(point(p['point'])).Vertex()
    elif op=='curve.line':
        start,end=point(p['start']),point(p['end'])
        if start.Distance(end)<1e-12:raise CadError('CAD_INPUT_DEGENERATE','零長のLineは有効なedgeにできません。点または下書きとして保持してください。',('editInput','showProblem'))
        result=BRepBuilderAPI_MakeEdge(start,end).Edge()
    elif op=='curve.polyline':result=poly(p['points'],p['closed'])
    elif op in ('curve.rectangle','surface.plane','solid.box'):
        pl=p['plane'];o,x,y=plane(pl);w=positive(p['widthMm']);h=positive(p.get('heightMm',p.get('depthMm')));anchor=vec(p.get('anchor',o));center=p.get('anchorMode','corner')=='center';u=-w/2 if center else 0;v=-h/2 if center else 0
        pl={**pl,'origin':anchor};corners=[at(pl,u,v),at(pl,u+w,v),at(pl,u+w,v+h),at(pl,u,v+h)]
        result=poly(corners,True)
        if p.get('rounding',False):
            from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet2d
            from OCP.BRepTools import BRepTools
            radius=positive(p['cornerRadiusMm'])
            if radius*2>=min(w,h):raise CadError('CAD_INPUT_DEGENERATE','角丸半径は幅・高さの半分未満です。自動縮小はしません。')
            face=BRepBuilderAPI_MakeFace(wire(result)).Face();fillet=BRepFilletAPI_MakeFillet2d(face)
            for vertex in subshapes(face,TopAbs_VERTEX):fillet.AddFillet(vertex,radius)
            fillet.Build()
            if not fillet.IsDone():raise CadError('CAD_FILLET_FAILED','角丸長方形を構成できません。',('editRadius',))
            result=BRepTools.OuterWire_s(TopoDS.Face_s(fillet.Shape()))
        else:semantic['edges']=['edge/vMin','edge/uMax','edge/vMax','edge/uMin']
        if op=='surface.plane':result=BRepBuilderAPI_MakeFace(wire(result)).Face()
        elif op=='solid.box':
            # depth is local Y, height is local Z.
            d=positive(p['depthMm']);pl={**pl,'origin':anchor};result=poly([at(pl,u,(-d/2 if center else 0)),at(pl,u+w,(-d/2 if center else 0)),at(pl,u+w,(d/2 if center else d)),at(pl,u,(d/2 if center else d))],True)
            result=BRepPrimAPI_MakePrism(BRepBuilderAPI_MakeFace(wire(result)).Face(),gp_Vec(axis2(pl).Direction())*positive(p['heightMm'])).Shape()
    elif op=='curve.polygon':
        pl=p['plane'];n=p['sides']
        if p['radiusMode'] not in ('inscribed','circumscribed'):raise CadError('CAD_INPUT_TYPE','Polygon radiusModeはinscribed/circumscribedです。')
        if not isinstance(n,int) or n<3 or n>100000:raise CadError('CAD_RESOURCE_LIMIT','辺数は3以上の整数です。過大な要求は分割してください。')
        r=positive(p['radiusMm']);r=r/math.cos(math.pi/n) if p['radiusMode']=='circumscribed' else r;pl={**pl,'origin':vec(p['center'])};a=finite(p['angleRad']);result=poly([at(pl,r*math.cos(a+i*2*math.pi/n),r*math.sin(a+i*2*math.pi/n)) for i in range(n)],True)
    elif op in ('curve.circle','curve.arc','curve.ellipse'):
        from OCP.Geom import Geom_Circle,Geom_Ellipse
        ax=axis2(p['plane'],p['center'])
        if op=='curve.ellipse':
            ru,rv=positive(p['radiusUMm']),positive(p['radiusVMm']);a=finite(p.get('angleRad',0));tr=gp_Trsf();tr.SetRotation(gp_Ax1(ax.Location(),ax.Direction()),a);ax.Transform(tr)
            if rv>ru:raise CadError('CAD_INPUT_DEGENERATE','楕円のU半径はV半径以上にしてください。軸の自動交換はしません。')
            c=Geom_Ellipse(ax,ru,rv)
        else:c=Geom_Circle(ax,positive(p['radiusMm']))
        if op=='curve.arc':
            a=finite(p['startAngleRad']);s=finite(p['sweepAngleRad'])
            if abs(s)<1e-12 or abs(s)>2*math.pi+1e-10:raise CadError('CAD_INPUT_DEGENERATE','円弧の角度は0以外で1周以内です。')
            result=BRepBuilderAPI_MakeEdge(c,min(a,a+s),max(a,a+s)).Edge()
            if s<0:result.Reverse()
        else:result=BRepBuilderAPI_MakeEdge(c).Edge()
    elif op in ('curve.nurbs','curve.interpolate'):
        from OCP.TColgp import TColgp_Array1OfPnt,TColgp_HArray1OfPnt
        if op=='curve.interpolate':
            from OCP.GeomAPI import GeomAPI_Interpolate
            a=p['points'];arr=TColgp_HArray1OfPnt(1,len(a))
            for i,v in enumerate(a):arr.SetValue(i+1,point(v))
            if p.get('degree',3)!=3 or p.get('startTangent') or p.get('endTangent'):raise CadError('CAD_SCHEMA_UNSUPPORTED','現在の補間は3次・端部接線未指定です。')
            b=GeomAPI_Interpolate(arr,p['closed'],tol['kernelLinearMm']);b.Perform()
            if not b.IsDone():raise CadError('CAD_KERNEL_FAILED','通過点から補間曲線を構成できません。')
            c=b.Curve()
        else:
            from OCP.TColStd import TColStd_Array1OfReal,TColStd_Array1OfInteger
            from OCP.Geom import Geom_BSplineCurve
            a=p['poles']
            if isinstance(p['degree'],bool) or not isinstance(p['degree'],int) or not 1<=p['degree']<=25:raise CadError('CAD_INPUT_TYPE','NURBS次数は1〜25の整数です。')
            if len(p['weights'])!=len(a) or len(p['knots'])!=len(p['multiplicities']):raise CadError('CAD_INPUT_TYPE','NURBS配列の長さが整合しません。')
            if any(isinstance(v,bool) or not isinstance(v,int) or v<=0 for v in p['multiplicities']):raise CadError('CAD_INPUT_TYPE','knot multiplicityは正の整数です。')
            arr=TColgp_Array1OfPnt(1,len(a));ks=TColStd_Array1OfReal(1,len(p['knots']));ms=TColStd_Array1OfInteger(1,len(p['multiplicities']));ws=TColStd_Array1OfReal(1,len(a))
            for i,v in enumerate(a):arr.SetValue(i+1,point(v));ws.SetValue(i+1,positive(p['weights'][i]))
            for i,v in enumerate(p['knots']):ks.SetValue(i+1,finite(v));ms.SetValue(i+1,p['multiplicities'][i])
            c=Geom_BSplineCurve(arr,ws,ks,ms,p['degree'],p['periodic'])
        result=BRepBuilderAPI_MakeEdge(c).Edge()
    elif op=='curve.join':
        from OCP.ShapeAnalysis import ShapeAnalysis_FreeBounds
        from OCP.TopTools import TopTools_HSequenceOfShape
        from OCP.ShapeFix import ShapeFix_ShapeTolerance
        items=inputs.get('objects',[])
        if 'allowMultipleGroups' in p and not isinstance(p['allowMultipleGroups'],bool):raise CadError('CAD_INPUT_TYPE','allowMultipleGroupsはtrue/falseです。')
        if len(items)<2:raise CadError('CAD_INPUT_MISSING','2曲線以上を選択してください。')
        edges=TopTools_HSequenceOfShape();ends=[]
        for item in items:
            copied=BRepBuilderAPI_Copy(item).Shape()
            for e in subshapes(copied,TopAbs_EDGE):
                edges.Append(e)
                from OCP.BRep import BRep_Tool
                from OCP.TopExp import TopExp
                ends.extend([BRep_Tool.Pnt_s(TopExp.FirstVertex_s(e)),BRep_Tool.Pnt_s(TopExp.LastVertex_s(e))])
        tolerance=tol['joinLinearMm']
        for i,p0 in enumerate(ends):
            if sum(p0.Distance(p1)<=tolerance for j,p1 in enumerate(ends) if i!=j)>1:
                # A simple wire has at most two incident edges, counting both endpoints.
                if sum(p0.Distance(p1)<=tolerance for j,p1 in enumerate(ends) if i!=j)>1:raise CadError('CAD_JOIN_BRANCH','接続候補が分岐しています。曲線群を分けて指定してください。',('chooseJoinPath','splitSelection'))
        wires=TopTools_HSequenceOfShape();ShapeAnalysis_FreeBounds.ConnectEdgesToWires_s(edges,tolerance,False,wires)
        if p.get('allowMultipleGroups') is True:
            return [(f'group/{i}',wires.Value(i),{}) for i in range(1,wires.Length()+1)]
        if wires.Length()!=1:raise CadError('CAD_JOIN_GAP','端点がJoin許容差内で1本につながりません。',('showBoundaries','editTolerance','editGeometry'))
        result=wires.Value(1)
    elif op=='curve.split':
        from OCP.BRepAdaptor import BRepAdaptor_Curve
        from OCP.BRep import BRep_Tool
        from OCP.TopLoc import TopLoc_Location
        source=input_one(inputs,'object');edges=subshapes(source,TopAbs_EDGE)
        if len(edges)!=1:raise CadError('CAD_INPUT_TYPE','parameter分割は単一edgeが対象です。複合曲線は先にExplodeしてください。')
        edge=edges[0];ad=BRepAdaptor_Curve(edge);a,b=ad.FirstParameter(),ad.LastParameter();cuts=sorted(set(finite(v) for v in p['splitParameters']))
        if not cuts or any(v<=a or v>=b for v in cuts):raise CadError('CAD_INPUT_DEGENERATE',f'分割parameterは開区間({a}, {b})内に指定してください。')
        curve=BRep_Tool.Curve_s(edge,0.,0.)
        return [(f'interval/{start:.17g}/{end:.17g}',BRepBuilderAPI_MakeEdge(curve,start,end).Edge(),{}) for start,end in zip([a]+cuts,cuts+[b])]
    elif op=='curve.offset':
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeOffset
        from OCP.GeomAbs import GeomAbs_Arc,GeomAbs_Intersection
        from OCP.gp import gp_Pln, gp_Ax3
        from OCP.Bnd import Bnd_Box
        from OCP.BRepBndLib import BRepBndLib
        source=input_one(inputs,'curve');distance=finite(p['distanceMm']);pl=p.get('plane',XY)
        ax=axis2(pl);tr=gp_Trsf();tr.SetTransformation(gp_Ax3(ax))
        local=BRepBuilderAPI_Transform(source,tr,True).Shape();bb=Bnd_Box();BRepBndLib.AddOptimal_s(local,bb,False,False)
        if bb.IsVoid():raise CadError('CAD_INPUT_DEGENERATE','評価できる曲線がありません。')
        xmin,ymin,zmin,xmax,ymax,zmax=bb.Get()
        if max(abs(zmin),abs(zmax))>tol['kernelLinearMm']:raise CadError('CAD_INPUT_TYPE','曲線は指定した作業平面上にある必要があります。平面を選び直してください。',('editParameters','selectCompatibleInput'))
        if p['joinStyle'] not in ('round','miter'):raise CadError('CAD_SCHEMA_UNSUPPORTED','対応する角処理はround／miterです。')
        if distance==0:return [('unchanged',source,{'warning':'距離0のため正本を変更していません。'})]
        # Full-circle inward collapse is analytically decidable. Do not turn
        # arbitrary OCCT failures for other curves into successful empty shapes.
        source_edges=subshapes(source,TopAbs_EDGE)
        if len(source_edges)==1 and source_edges[0].Closed():
            from OCP.BRepAdaptor import BRepAdaptor_Curve
            from OCP.GeomAbs import GeomAbs_Circle
            ad=BRepAdaptor_Curve(source_edges[0])
            if ad.GetType()==GeomAbs_Circle and ad.Circle().Radius()+distance<=0:
                return [('collapsed',compound([]),{'warning':'内側距離が円の半径以上のため、Offset結果は空です。','warningCode':'CAD_EMPTY_RESULT'})]
        source_wire=wire(source)
        support=BRepBuilderAPI_MakeFace(gp_Pln(ax.Location(),ax.Direction()),source_wire,True).Face()
        builder=BRepOffsetAPI_MakeOffset(support,GeomAbs_Arc if p['joinStyle']=='round' else GeomAbs_Intersection,not source_wire.Closed())
        builder.Perform(distance)
        if not builder.IsDone():raise CadError('CAD_KERNEL_FAILED','指定距離で曲線offsetが成立しません。')
        result=builder.Shape()
    elif op=='surface.corners':
        pts=[point(v) for v in p['points']]
        if len(pts)==3:result=BRepBuilderAPI_MakeFace(poly(p['points'],True)).Face()
        elif len(pts)==4:
            from OCP.TColgp import TColgp_Array2OfPnt
            from OCP.Geom import Geom_BezierSurface
            arr=TColgp_Array2OfPnt(1,2,1,2)
            for i,j,k in [(1,1,0),(2,1,1),(2,2,2),(1,2,3)]:arr.SetValue(i,j,pts[k])
            result=BRepBuilderAPI_MakeFace(Geom_BezierSurface(arr),tol['kernelLinearMm']).Face()
        else:raise CadError('CAD_INPUT_MISSING','3点または4点を順番に指定してください。')
    elif op=='surface.edges':
        from OCP.GeomFill import GeomFill_BSplineCurves,GeomFill_CoonsStyle
        from OCP.GeomConvert import GeomConvert
        from OCP.BRep import BRep_Tool
        curves=inputs.get('curves',[])
        if len(curves)==2:
            from OCP.BRepFill import BRepFill
            result=BRepFill.Face_s(TopoDS.Edge_s(subshapes(curves[0],TopAbs_EDGE)[0]),TopoDS.Edge_s(subshapes(curves[1],TopAbs_EDGE)[0]))
        else:
            bs=[]
            for curve in curves:
                edges=subshapes(curve,TopAbs_EDGE)
                if len(edges)!=1:raise CadError('CAD_INPUT_TYPE','Coons境界は単一edgeを順番に指定してください。')
                bs.append(GeomConvert.CurveToBSplineCurve_s(BRep_Tool.Curve_s(edges[0],0.,0.)))
            if len(bs) not in (3,4):raise CadError('CAD_INPUT_MISSING','2〜4本の境界が必要です。')
            surface=GeomFill_BSplineCurves(*bs,GeomFill_CoonsStyle).Surface();result=BRepBuilderAPI_MakeFace(surface,tol['kernelLinearMm']).Face()
    elif op=='surface.offset':
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeOffsetShape
        if p['solidify'] or p['bothSides']:raise CadError('CAD_SCHEMA_UNSUPPORTED','現在の面offsetは片側・厚み付けなしです。')
        s=input_one(inputs,'surface');distance=finite(p['distanceMm']);mode=p.get('directionMode','normal')
        if mode not in ('normal','reverse'):raise CadError('CAD_INPUT_TYPE','法線方向はnormal/reverseです。')
        if mode=='reverse':distance=-distance
        if distance==0:result=s
        else:
            b=BRepOffsetAPI_MakeOffsetShape();b.PerformByJoin(s,distance,tol['kernelLinearMm']);result=b.Shape()
    elif op=='surface.untrim':
        from OCP.BRep import BRep_Tool
        s=input_one(inputs,'surface');faces=subshapes(s,TopAbs_FACE)
        if len(faces)!=1:raise CadError('CAD_INPUT_TYPE','基底面を復元するfaceを1つ指定してください。')
        u0,u1,v0,v1=[finite(v) for v in p['domain']]
        if u0>=u1 or v0>=v1:raise CadError('CAD_INPUT_DEGENERATE','基底面の有限parameter範囲を指定してください。')
        result=BRepBuilderAPI_MakeFace(BRep_Tool.Surface_s(faces[0]),u0,u1,v0,v1,tol['kernelLinearMm']).Face()
    elif op in ('solid.split','surface.split'):
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Splitter
        from OCP.TopTools import TopTools_ListOfShape
        sources=inputs.get('targets',[]);cutters=TopTools_ListOfShape()
        for shape in inputs.get('cutters',[]):cutters.Append(BRepBuilderAPI_Copy(shape).Shape())
        if not sources or cutters.IsEmpty():raise CadError('CAD_INPUT_MISSING','対象と切断形状を指定してください。')
        outputs=[]
        # Evaluate each target independently: a result must retain its source,
        # including when coincident targets have identical geometry.
        for source_index,shape in enumerate(sources):
            targets=TopTools_ListOfShape();targets.Append(BRepBuilderAPI_Copy(shape).Shape())
            b=BRepAlgoAPI_Splitter();b.SetArguments(targets);b.SetTools(cutters);b.Build()
            if not b.IsDone():raise CadError('CAD_KERNEL_FAILED','形状を分割できません。')
            parts=subshapes(b.Shape(),TopAbs_SOLID if op=='solid.split' else TopAbs_FACE)
            outputs.extend(('partition',part,dict(sourceIndex=source_index)) for part in parts)
        return outputs
    elif op=='shape.section':
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
        from OCP.gp import gp_Pln
        objects=inputs.get('objects',[]);pl=p['plane'];ax=axis2(pl);cut=gp_Pln(ax.Location(),ax.Direction());results=[]
        for obj in objects:
            builder=BRepAlgoAPI_Section(obj,cut,False);builder.Build()
            if not builder.IsDone():raise CadError('CAD_KERNEL_FAILED','断面計算が成立しません。')
            results.append(builder.Shape())
        result=compound(results)
    elif op=='shape.extrude':
        original=inputs.get('profile',[]);
        if len(original)!=1:raise CadError('CAD_INPUT_MISSING','profileを1つ指定してください。')
        copier=BRepBuilderAPI_Copy(original[0]);s=copier.Shape();dist=finite(p['distanceMm']);d=direction(p['direction']);v=gp_Vec(d)*dist
        if abs(dist)<1e-12:raise CadError('CAD_INPUT_DEGENERATE','押し出し距離は0以外で指定してください。')
        if p['cap'] and s.ShapeType()!=TopAbs_FACE:
            w=wire(s)
            if not w.Closed():raise CadError('CAD_PROFILE_OPEN','Capには閉じた平面輪郭が必要です。',('showEndpoints','chooseOpenResult'))
            s=BRepBuilderAPI_MakeFace(w).Face()
        elif not p['cap'] and s.ShapeType()==TopAbs_FACE:s=compound(subshapes(s,TopAbs_WIRE))
        if p['bothSides']:
            t=gp_Trsf();t.SetTranslation(v*-.5);s=BRepBuilderAPI_Transform(s,t,True).Shape()
        builder=BRepPrimAPI_MakePrism(s,v);result=builder.Shape()
        # Kernel Generated links are captured; semantic labels are assigned by the caller.
        semantic['builder']=builder;semantic['sourceCopier']=copier
    elif op=='shape.revolve':
        s=input_one(inputs,'profile');axis=p['axis'];ax=gp_Ax1(point(axis['origin']),direction(axis['direction']));a=finite(p['startAngleRad']);sweep=finite(p['sweepAngleRad'])
        if p['cap'] and s.ShapeType()!=TopAbs_FACE:s=BRepBuilderAPI_MakeFace(wire(s)).Face()
        if a:t=gp_Trsf();t.SetRotation(ax,a);s=BRepBuilderAPI_Transform(s,t,True).Shape()
        result=BRepPrimAPI_MakeRevol(s,ax,sweep,True).Shape()
    elif op in ('solid.sphere','shape.cylinder','shape.cone','solid.torus'):
        if op=='solid.sphere':result=BRepPrimAPI_MakeSphere(point(p['center']),positive(p['radiusMm'])).Shape()
        else:
            ax=p['axis'];ax=gp_Ax2(point(ax['origin']),direction(ax['direction']))
            if op=='shape.cylinder':builder=BRepPrimAPI_MakeCylinder(ax,positive(p['radiusMm']),positive(p['heightMm']))
            elif op=='shape.cone':
                r1,r2=finite(p['bottomRadiusMm']),finite(p['topRadiusMm'])
                if min(r1,r2)<0 or max(r1,r2)==0 or r1==r2:raise CadError('CAD_INPUT_DEGENERATE','円錐の半径は0以上で少なくとも一方が正、上下で異なる必要があります。')
                builder=BRepPrimAPI_MakeCone(ax,r1,r2,positive(p['heightMm']))
            else:
                major,minor=positive(p['majorRadiusMm']),positive(p['minorRadiusMm'])
                if minor>=major:raise CadError('CAD_INPUT_DEGENERATE','自己交差しないTorusは管半径を主半径未満に指定してください。')
                builder=BRepPrimAPI_MakeTorus(ax,major,minor)
            result=builder.Shape()
            if op!='solid.torus' and not p['cap']:result=builder.Face()
    elif op=='solid.difference':
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
        if set(p)-{'keepTools'} or set(inputs)-{'arguments','tools'} or selectors:
            raise CadError('CAD_SCHEMA_UNSUPPORTED','Differenceは対象arguments／工具toolsの立体入力とkeepToolsだけに対応しています。')
        if not isinstance(p.get('keepTools',False),bool):raise CadError('CAD_INPUT_TYPE','keepTools はtrue/falseで指定してください。')
        args=inputs.get('arguments',[]);tools=inputs.get('tools',[])
        if not args or not tools:raise CadError('CAD_INPUT_MISSING','対象と工具を指定してください。',('selectInput',))
        for shape in args+tools:
            solids=subshapes(shape,TopAbs_SOLID)
            if len(solids)!=1 or len(subshapes(shape,TopAbs_FACE))!=len(subshapes(solids[0],TopAbs_FACE)):
                raise CadError('CAD_INPUT_TYPE','Differenceの対象と工具には立体を指定してください。',('selectCompatibleInput',))
        outputs=[]
        for index,arg in enumerate(args):
            result=BRepBuilderAPI_Copy(arg).Shape()
            for tool in tools:
                builder=BRepAlgoAPI_Cut(result,BRepBuilderAPI_Copy(tool).Shape());builder.Build()
                if not builder.IsDone():raise CadError('CAD_KERNEL_FAILED','差分演算が成立しませんでした。')
                result=builder.Shape()
            # One ordered output per target, including empty/compound remainders.
            outputs.append(('result' if len(args)==1 else f'argument/{index}',result,{}))
        return outputs
    elif op in ('solid.union','solid.intersection'):
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Fuse,BRepAlgoAPI_Cut,BRepAlgoAPI_Common
        args=inputs.get('arguments',[]);tools=inputs.get('tools',[])
        if not args or (op!='solid.union' and not tools):raise CadError('CAD_INPUT_MISSING','対象と工具を指定してください。',('selectInput',))
        for shape in args+tools:
            solids=subshapes(shape,TopAbs_SOLID)
            if not solids or len(subshapes(shape,TopAbs_FACE))!=sum(len(subshapes(s,TopAbs_FACE)) for s in solids):raise CadError('CAD_INPUT_TYPE','Booleanには立体または立体群を指定してください。')
        result=BRepBuilderAPI_Copy(args[0]).Shape();rest=args[1:]+tools
        cls={'solid.union':BRepAlgoAPI_Fuse,'solid.difference':BRepAlgoAPI_Cut,'solid.intersection':BRepAlgoAPI_Common}[op]
        for b in rest:
            builder=cls(result,BRepBuilderAPI_Copy(b).Shape());builder.Build()
            if not builder.IsDone():raise CadError('CAD_KERNEL_FAILED','Boolean演算が成立しませんでした。')
            common=builder.Shape()
            if op=='solid.intersection' and not subshapes(common,TopAbs_VERTEX):common=regions_solids.contact_common(result,b)
            result=common
    elif op in ('surface.planarRegion','surface.join','surface.explode','curve.explode','surface.reverse','curve.reverse','surface.extract','curve.extractBoundary'):
        if op=='surface.planarRegion':result=BRepBuilderAPI_MakeFace(wire(input_one(inputs,'boundaries'))).Face()
        elif op=='surface.join':
            from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
            b=BRepBuilderAPI_Sewing(tol['joinLinearMm'])
            for s in inputs.get('objects',[]):b.Add(BRepBuilderAPI_Copy(s).Shape())
            b.Perform();result=b.SewedShape()
        elif op.endswith('reverse'):
            result=input_one(inputs,'object')
            if op=='curve.reverse' and not subshapes(result,TopAbs_EDGE):raise CadError('CAD_INPUT_TYPE','曲線を選択してください。')
            result.Reverse()
        else:
            s=input_one(inputs,'object');k=TopAbs_EDGE if op.startswith('curve.') else TopAbs_FACE
            shapes=subshapes(s,k)
            if not shapes:raise CadError('CAD_INPUT_TYPE','分解できるedge/faceがありません。')
            if op.endswith('extract'):
                chosen=selectors.get('faces',[])
                if not chosen:raise CadError('CAD_INPUT_MISSING','取り出す面を選んでください。',('selectInput',))
                shapes=chosen
            return [(f'part/{i}',BRepBuilderAPI_Copy(s).Shape(),{}) for i,s in enumerate(shapes)]
    elif op=='surface.loft':
        from OCP.BRepOffsetAPI import BRepOffsetAPI_ThruSections
        sections=inputs.get('sections',[])
        if len(sections)<2:raise CadError('CAD_INPUT_MISSING','Loftには2つ以上の断面が必要です。',('selectInput',))
        if p['closed']:raise CadError('CAD_SCHEMA_UNSUPPORTED','閉じるLoftは未実装です。')
        if p['style'] not in ('smooth','ruled'):raise CadError('CAD_INPUT_TYPE','Loft方式はsmooth/ruledです。')
        b=BRepOffsetAPI_ThruSections(p['cap'],p['style']=='ruled',tol['fitLinearMm'])
        reversed_sections=p.get('sectionReversed') or [False]*len(sections)
        if len(reversed_sections)!=len(sections) or any(not isinstance(v,bool) for v in reversed_sections):raise CadError('CAD_INPUT_TYPE','Loftの向きは断面数と同じtrue/false配列です。')
        for i,s in enumerate(sections):
            w=wire(BRepBuilderAPI_Copy(s).Shape())
            if reversed_sections[i]:w.Reverse()
            b.AddWire(w)
        b.Build()
        if not b.IsDone():raise CadError('CAD_KERNEL_FAILED','断面間にLoftを構成できません。')
        result=b.Shape()
    elif op=='surface.sweep1' or op=='shape.pipe':
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakePipeShell
        rail=input_one(inputs,'rail');b=BRepOffsetAPI_MakePipeShell(wire(rail));mode=p['frameMode']
        if mode not in ('corrected-frame','frenet'):raise CadError('CAD_SCHEMA_UNSUPPORTED','未実装の掃引フレームです。')
        b.SetMode(mode=='frenet');sections=inputs.get('sections',[])
        if not sections and op=='surface.sweep1':raise CadError('CAD_INPUT_MISSING','掃引する断面を選択してください。')
        if op=='shape.pipe':raise CadError('CAD_SCHEMA_UNSUPPORTED','Pipeの自動断面作成は未実装です。')
        for s in sections:b.Add(wire(BRepBuilderAPI_Copy(s).Shape()),False,False)
        b.Build()
        if p['cap'] and not b.MakeSolid():raise CadError('CAD_PROFILE_OPEN','掃引の蓋を構成できません。')
        result=b.Shape()
    elif op in ('solid.fillet','solid.chamfer'):
        from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet,BRepFilletAPI_MakeChamfer
        s=input_one(inputs,'body');edges=selectors.get('edges',[])
        if p.get('chainPolicy','selected') not in ('selected','tangent'):raise CadError('CAD_INPUT_TYPE','連鎖指定はselected/tangentです。')
        if not edges:raise CadError('CAD_INPUT_MISSING','edgeを選択してください。',('reselectReference',))
        b=(BRepFilletAPI_MakeFillet if op.endswith('fillet') else BRepFilletAPI_MakeChamfer)(s)
        # Selectors refer to the original shape; copy builder maps topology to the copy.
        copier=BRepBuilderAPI_Copy(inputs['body'][0]);s=copier.Shape();b=(BRepFilletAPI_MakeFillet if op.endswith('fillet') else BRepFilletAPI_MakeChamfer)(s)
        side_faces=selectors.get('distance1Faces',[])
        d1=positive(p['distance1Mm']) if op.endswith('chamfer') else None
        d2=positive(p.get('distance2Mm') if p.get('distance2Mm') is not None else d1) if d1 else None
        if d1!=d2 and len(side_faces)!=len(edges):raise CadError('CAD_REFERENCE_AMBIGUOUS','各edgeの距離1側の隣接faceを同じ順序で指定してください。')
        for i,edge in enumerate(edges):
            if not any(edge.IsSame(e) for e in subshapes(inputs['body'][0],TopAbs_EDGE)):raise CadError('CAD_INPUT_TYPE','edgeが対象ボディに属していません。')
            copied=TopoDS.Edge_s(copier.ModifiedShape(edge))
            if op.endswith('fillet'):b.Add(positive(p['radiusMm']),copied)
            elif d1==d2:b.Add(d1,copied)
            else:
                face=side_faces[i]
                if not any(face.IsSame(f) for f in subshapes(inputs['body'][0],TopAbs_FACE)) or not any(edge.IsSame(e) for e in subshapes(face,TopAbs_EDGE)):raise CadError('CAD_INPUT_TYPE','距離1側のfaceは選択edgeに隣接する必要があります。')
                b.Add(d1,d2,copied,TopoDS.Face_s(copier.ModifiedShape(face)))
        if op.endswith('fillet') and p.get('chainPolicy')=='selected':
            for i in range(1,b.NbContours()+1):
                if any(not any(b.Edge(i,j).IsSame(copier.ModifiedShape(e)) for e in edges) for j in range(1,b.NbEdges(i)+1)):
                    raise CadError('CAD_REFERENCE_AMBIGUOUS','接線連鎖が必要です。連鎖を明示許可するか対象edgeを全て選択してください。',('editParameters','reselectReference'))
        b.Build()
        if not b.IsDone():raise CadError('CAD_FILLET_FAILED','指定された対象と値では接続面を構成できません。',('editRadius','reselectReference'))
        result=b.Shape();semantic['builder']=b
    elif op=='solid.shell':
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeThickSolid
        from OCP.TopTools import TopTools_ListOfShape
        original=inputs.get('body',[None])[0]
        if original is None:raise CadError('CAD_INPUT_MISSING','ボディを指定してください。')
        if any(not any(f.IsSame(a) for a in subshapes(original,TopAbs_FACE)) for f in selectors.get('removedFaces',[])):raise CadError('CAD_INPUT_TYPE','除去面が対象ボディに属していません。')
        copier=BRepBuilderAPI_Copy(original);s=copier.Shape();lst=TopTools_ListOfShape()
        for f in selectors.get('removedFaces',[]):lst.Append(copier.ModifiedShape(f))
        if lst.IsEmpty():raise CadError('CAD_INPUT_MISSING','開口面を明示的に選択してください。')
        mode=p['directionMode']
        if mode not in ('inward','outward'):raise CadError('CAD_INPUT_TYPE','Shellの方向はinward/outwardです。')
        if any(not any(f.IsSame(a) for a in subshapes(original,TopAbs_FACE)) for f in selectors.get('removedFaces',[])):raise CadError('CAD_INPUT_TYPE','除去面が対象ボディに属していません。')
        t=positive(p['thicknessMm'])*(1 if mode=='outward' else -1);b=BRepOffsetAPI_MakeThickSolid()
        details=dict(thicknessMm=p['thicknessMm'],directionMode=mode,removedFaceCount=lst.Size())
        try:
            b.MakeThickSolidByJoin(s,lst,t,tol['kernelLinearMm'])
            if not b.IsDone():raise CadError('CAD_SHELL_FAILED','指定厚さ/除去面でShellが成立しません。厚さか開口面を変更してください。',details=details)
            result=b.Shape()
            from OCP.BRepCheck import BRepCheck_Analyzer
            if not BRepCheck_Analyzer(result).IsValid():raise CadError('CAD_SHELL_FAILED','Shell結果が不正です。元の形状を保持します。',details=details)
            from OCP.BRepGProp import BRepGProp
            from OCP.GProp import GProp_GProps
            before=GProp_GProps();after=GProp_GProps();BRepGProp.VolumeProperties_s(original,before,1e-10);BRepGProp.VolumeProperties_s(result,after,1e-10)
            if after.Mass()<=0 or mode=='inward' and after.Mass()>=before.Mass():raise CadError('CAD_SHELL_FAILED','指定厚さで内側の空洞を構成できません。元形状のままの結果は採用しません。',details=details)
        except CadError:raise
        except Exception as error:raise CadError('CAD_SHELL_FAILED','Shellの構成に失敗しました。元の形状を保持します。',details={**details,'kernelMessage':str(error)})
    elif op=='shape.transform':
        s=input_one(inputs,'object');t=gp_Trsf();mode=p['mode']
        if mode=='move':t.SetTranslation(gp_Vec(*vec(p['translation'])))
        elif mode=='rotate':t.SetRotation(gp_Ax1(point(p['axis']['origin']),direction(p['axis']['direction'])),finite(p['angleRad']))
        elif mode=='scale':t.SetScale(point(p['center']),positive(p['factor']))
        elif mode=='mirror':t.SetMirror(axis2(p['plane']))
        else:raise CadError('CAD_SCHEMA_UNSUPPORTED','未実装の変換です。')
        result=BRepBuilderAPI_Transform(s,t,True).Shape()
    else:raise CadError('CAD_SCHEMA_UNSUPPORTED',f'演算 {op} は未実装です。',('editParameters',))
    return [('result',result,semantic)]

OPERATIONS={'curve.join','curve.split','curve.offset','surface.corners','surface.edges','surface.offset','surface.untrim','solid.split','surface.split','shape.section','point.create','curve.line','curve.polyline','curve.rectangle','curve.polygon','curve.circle','curve.arc','curve.ellipse','curve.nurbs','curve.interpolate','shape.extrude','shape.revolve','solid.box','solid.sphere','shape.cylinder','shape.cone','solid.torus','solid.union','solid.difference','solid.intersection','surface.plane','surface.planarRegion','surface.join','surface.explode','curve.explode','surface.reverse','curve.reverse','surface.extract','curve.extractBoundary','surface.loft','surface.sweep1','solid.fillet','solid.chamfer','solid.shell','shape.transform'}
OPERATIONS.update({'curve.trim','curve.extend','curve.fillet','curve.chamfer','curve.blend','curve.rebuild','curve.seam','curve.editPoles'})

from .regions_solids import OPERATIONS as REGION_SOLID_OPERATIONS
OPERATIONS |= REGION_SOLID_OPERATIONS
