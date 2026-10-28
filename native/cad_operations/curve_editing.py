"""Exact-curve editing. Parameters refer to OCCT curves, never preview vertices."""
import math
from . import (CadError, finite, positive, point, vec, input_one, subshapes,
               BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire, TopAbs_EDGE)
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.Geom import Geom_TrimmedCurve, Geom_BSplineCurve, Geom_BezierCurve
from OCP.GeomConvert import GeomConvert
from OCP.GeomAPI import GeomAPI_ProjectPointOnCurve
from OCP.gp import gp_Pnt, gp_Vec

OPERATIONS = {'curve.trim','curve.split','curve.extend','curve.fillet','curve.chamfer',
              'curve.blend','curve.rebuild','curve.seam','curve.editPoles'}

def single(inputs, selectors, key='object'):
    selected = selectors.get('edge', []) if key == 'object' else []
    if len(selected) > 1:
        raise CadError('CAD_REFERENCE_AMBIGUOUS','対象edgeを1つ選択してください。')
    if selected:
        parents=inputs.get(key,[])
        if len(parents)!=1:raise CadError('CAD_INPUT_MISSING','対象曲線を1つ選択してください。')
        # Check original topology identity before input_one's immutable copy.
        if not any(selected[0].IsSame(e) for e in subshapes(parents[0],TopAbs_EDGE)):
            raise CadError('CAD_INPUT_TYPE','選択したedgeは対象曲線に属していません。対象とedgeを選び直してください。',('reselectReference',))
    shape = selected[0] if selected else input_one(inputs,key)
    edges = subshapes(shape,TopAbs_EDGE)
    if not edges:raise CadError('CAD_INPUT_TYPE','曲線edgeを選択してください。')
    if len(edges)!=1:
        raise CadError('CAD_REFERENCE_AMBIGUOUS','複合曲線の対象edgeを明示選択するかExplodeしてください。',('reselectReference',),{'edgeCount':len(edges)})
    edge=edges[0];ad=BRepAdaptor_Curve(edge)
    return edge,BRep_Tool.Curve_s(edge,0.,0.).Copy(),ad.FirstParameter(),ad.LastParameter()

def projection(c,a,b,p,tolerance):
    q=GeomAPI_ProjectPointOnCurve(point(p),c,a,b)
    candidates=sorted(set(q.Parameter(i) for i in range(1,q.NbPoints()+1) if q.Distance(i)<=tolerance))
    if len(candidates)!=1:
        raise CadError('CAD_REFERENCE_AMBIGUOUS' if candidates else 'CAD_INPUT_MISSING',
                       '曲線上の位置を一意に指定してください。',('editInput',),{'parameters':candidates})
    return candidates[0]

def cuts_for(c,a,b,p,inputs,tolerance):
    cuts=[finite(v) for v in p.get('splitParameters',[])]
    cutters=inputs.get('cutters',[])
    if cutters:
        from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
        from OCP.TopAbs import TopAbs_VERTEX
        source=BRepBuilderAPI_MakeEdge(c,a,b).Edge()
        for cutter in cutters:
            section=BRepAlgoAPI_Section(source,cutter,False);section.Build()
            if not section.IsDone():raise CadError('CAD_KERNEL_FAILED','曲線交点を計算できません。')
            if subshapes(section.Shape(),TopAbs_EDGE):raise CadError('CAD_REFERENCE_AMBIGUOUS','切断曲線が区間で重なっています。交点を一意に指定できません。')
            for vertex in subshapes(section.Shape(),TopAbs_VERTEX):
                pt=BRep_Tool.Pnt_s(vertex)
                cuts.append(projection(c,a,b,[pt.X(),pt.Y(),pt.Z()],tolerance))
    cuts.sort();unique=[]
    for v in cuts:
        if not a<v<b:raise CadError('CAD_INPUT_DEGENERATE',f'分割parameterは開区間({a}, {b})内です。')
        if not unique or abs(v-unique[-1])>1e-12:unique.append(v)
    if not unique:raise CadError('CAD_INPUT_MISSING','交点がありません。切断要素または正本parameterを指定してください。')
    return unique

def piece(c,a,b,tag='interval',accuracy=None):
    return (f'{tag}/{a:.17g}/{b:.17g}',BRepBuilderAPI_MakeEdge(c,a,b).Edge(),{'accuracy':accuracy} if accuracy else {})

def bspline(c,a,b):
    return GeomConvert.CurveToBSplineCurve_s(Geom_TrimmedCurve(c,a,b))

def derivatives(c,u):
    pt=gp_Pnt();d=gp_Vec();dd=gp_Vec();c.D2(u,pt,d,dd)
    return [pt.X(),pt.Y(),pt.Z()],[d.X(),d.Y(),d.Z()],[dd.X(),dd.Y(),dd.Z()]

def unit(v):
    norm=math.sqrt(sum(x*x for x in v))
    if norm<1e-12:raise CadError('CAD_INPUT_DEGENERATE','端部の接線を一意に定義できません。')
    return [x/norm for x in v]

def make_bezier(poles):
    from OCP.TColgp import TColgp_Array1OfPnt
    array=TColgp_Array1OfPnt(1,len(poles))
    for i,p in enumerate(poles):array.SetValue(i+1,point(p))
    return Geom_BezierCurve(array)

def evaluate(op,p,inputs,tol,selectors):
    outputs=_evaluate(op,p,inputs,tol,selectors)
    if selectors.get('edge') and op in ('curve.trim','curve.split','curve.extend','curve.editPoles'):
        from . import BRepBuilderAPI_Copy
        selected=selectors['edge'][0]
        for i,e in enumerate(subshapes(inputs['object'][0],TopAbs_EDGE)):
            if not e.IsSame(selected):outputs.append((f'retained/{i}',BRepBuilderAPI_Copy(e).Shape(),{}))
    return outputs

def _evaluate(op,p,inputs,tol,selectors):
    tolerance=tol['kernelLinearMm']
    if op in ('curve.fillet','curve.chamfer','curve.extend','curve.rebuild'):
        from .curve_advanced import evaluate_advanced
        return evaluate_advanced(op,p,inputs,tol,selectors)
    edge,c,a,b=single(inputs,selectors,'first' if op=='curve.blend' else 'object')
    if op in ('curve.trim','curve.split'):
        cuts=cuts_for(c,a,b,p,inputs,tolerance);bounds=[a]+cuts+[b]
        intervals=list(zip(bounds,bounds[1:]))
        if op=='curve.trim':
            u=projection(c,a,b,p['removePoint'],p.get('pickToleranceMm',tol['joinLinearMm'])) if p.get('removePoint') is not None else finite(p['removeParameter'])
            matches=[i for i,(lo,hi) in enumerate(intervals) if lo<u<hi]
            if len(matches)!=1:raise CadError('CAD_REFERENCE_AMBIGUOUS','削除区間の内部を指定してください。交点上は区間を特定できません。')
            intervals=[interval for i,interval in enumerate(intervals) if i!=matches[0]]
        return [piece(c,lo,hi) for lo,hi in intervals]
    if op=='curve.seam':
        if not edge.Closed():
            raise CadError('CAD_INPUT_TYPE','Seamは閉曲線が対象です。開曲線は端点を選択してください。')
        u=projection(c,a,b,p['seamPoint'],tol['joinLinearMm']) if p.get('seamPoint') is not None else finite(p['seamParameter'])
        if not a<=u<=b:raise CadError('CAD_INPUT_DEGENERATE','継ぎ目parameterが範囲外です。')
        if c.IsPeriodic():return [piece(c,u,u+c.Period(),'seam')]
        # A closed clamped spline need not be periodic. Rotate its two exact
        # trimmed intervals instead of fitting or forcing periodic continuity.
        if u==a or u==b:return [piece(c,a,b,'seam')]
        builder=BRepBuilderAPI_MakeWire()
        builder.Add(piece(c,u,b)[1]);builder.Add(piece(c,a,u)[1])
        if not builder.IsDone():raise CadError('CAD_KERNEL_FAILED','閉曲線の継ぎ目を構成できません。')
        return [('seam',builder.Wire(),{})]
    if op=='curve.editPoles':
        curve=bspline(c,a,b);mode=p.get('mode','move');sem={}
        if mode=='insertKnot':
            u=finite(p['knot']);mult=p.get('multiplicity',1)
            if not a<u<b or not isinstance(mult,int) or isinstance(mult,bool) or not 1<=mult<=curve.Degree():
                raise CadError('CAD_INPUT_DEGENERATE','挿入knotと多重度を曲線の内部/次数以下で指定してください。')
            curve.InsertKnot(u,mult,tolerance,True)
        elif mode=='move':
            index=p['poleIndex']
            if isinstance(index,bool) or not isinstance(index,int) or not 1<=index<=curve.NbPoles():raise CadError('CAD_INPUT_DEGENERATE',f'制御点番号は1〜{curve.NbPoles()}です。')
            curve.SetPole(index,point(p['position']))
        elif mode=='removeKnot':
            index=p['knotIndex'];mult=p.get('multiplicity',0)
            if isinstance(index,bool) or not isinstance(index,int) or not 1<index<curve.NbKnots() or not isinstance(mult,int) or isinstance(mult,bool) or mult<0:
                raise CadError('CAD_INPUT_DEGENERATE','内部knotの番号と残す多重度を指定してください。')
            if not curve.RemoveKnot(index,mult,positive(p.get('toleranceMm',tol['fitLinearMm']))):raise CadError('CAD_INPUT_DEGENERATE','指定許容差ではknotを削除できません。元の正本を保持します。')
            measured=max(c.Value(a+(b-a)*i/256).Distance(curve.Value(a+(b-a)*i/256)) for i in range(257))
            sem={'accuracy':{'method':'sampled-corresponding-parameter','sampleCount':257,'maxDeviationMm':measured,'toleranceMm':p.get('toleranceMm',tol['fitLinearMm'])},
                 'warning':f'許容差付きknot削除です。計測最大偏差 {measured:.9g} mm（257点、Hausdorff上限の保証ではありません）。'}
        else:raise CadError('CAD_SCHEMA_UNSUPPORTED','move/insertKnot/removeKnotを明示してください。')
        return [('edited',BRepBuilderAPI_MakeEdge(curve).Edge(),sem)]
    if op=='curve.blend':
        _,c2,a2,b2=single(inputs,selectors,'second')
        end1=p.get('firstEnd','end');end2=p.get('secondEnd','start');continuity=p.get('continuity','G1')
        if end1 not in ('start','end') or end2 not in ('start','end') or continuity not in ('G1','G2'):
            raise CadError('CAD_INPUT_TYPE','対象端点start/endと連続性G1/G2を指定してください。')
        q0,d0,dd0=derivatives(c,a if end1=='start' else b);q1,d1,dd1=derivatives(c2,a2 if end2=='start' else b2)
        if math.dist(q0,q1)<=tolerance:raise CadError('CAD_INPUT_DEGENERATE','異なる位置の端点を指定してください。')
        scale=positive(p.get('handleLengthMm',math.dist(q0,q1)));degree=5 if continuity=='G2' else 3
        v0=[v*scale*(-1 if end1=='start' else 1) for v in unit(d0)]
        v1=[v*scale*(1 if end2=='start' else -1) for v in unit(d1)]
        first=[q0[i]+v0[i]/degree for i in range(3)];last=[q1[i]-v1[i]/degree for i in range(3)]
        poles=[q0,first,last,q1]
        if continuity=='G2':
            def curvature(d,dd):
                n=sum(v*v for v in d);dot=sum(x*y for x,y in zip(d,dd))/n
                return [(dd[i]-dot*d[i])*scale*scale/n for i in range(3)]
            k0=curvature(d0,dd0);k1=curvature(d1,dd1)
            poles=[q0,first,[k0[i]/20+2*first[i]-q0[i] for i in range(3)],
                   [k1[i]/20+2*last[i]-q1[i] for i in range(3)],last,q1]
        result=make_bezier(poles)
        return [('blend',BRepBuilderAPI_MakeEdge(result).Edge(),{})]
    raise CadError('CAD_SCHEMA_UNSUPPORTED','未対応の曲線編集です。')
