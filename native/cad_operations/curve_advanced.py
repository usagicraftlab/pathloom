"""Bounded exact continuation/corners and explicitly measured B-spline fitting."""
import math
from . import (CadError,finite,positive,point,axis2,input_one,subshapes,wire,
               BRepBuilderAPI_MakeEdge,BRepBuilderAPI_MakeWire,TopAbs_EDGE)
from .curve_editing import single,derivatives,unit,piece,bspline
from OCP.gp import gp_Pnt,gp_Vec,gp_Pln,gp_Ax3,gp_Trsf
from OCP.Geom import Geom_BSplineCurve
from OCP.BRepAdaptor import BRepAdaptor_Curve

def planar(edge,plane,tolerance):
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.BRepBndLib import BRepBndLib
    from OCP.Bnd import Bnd_Box
    tr=gp_Trsf();tr.SetTransformation(gp_Ax3(axis2(plane)))
    local=BRepBuilderAPI_Transform(edge,tr,True).Shape();box=Bnd_Box();BRepBndLib.AddOptimal_s(local,box,False,False)
    if box.IsVoid():raise CadError('CAD_INPUT_DEGENERATE','曲線が空です。')
    values=box.Get()
    if max(abs(values[2]),abs(values[5]))>tolerance:raise CadError('CAD_INPUT_TYPE','2曲線は指定した平面上にある必要があります。')

def basis(i,d,t,knots,count):
    if t==1:return 1. if i==count-1 else 0.
    if d==0:return 1. if knots[i]<=t<knots[i+1] else 0.
    lo=knots[i+d]-knots[i];hi=knots[i+d+1]-knots[i+1]
    return ((t-knots[i])/lo*basis(i,d-1,t,knots,count) if lo else 0)+( (knots[i+d+1]-t)/hi*basis(i+1,d-1,t,knots,count) if hi else 0)

def solve(matrix,rhs):
    n=len(rhs);a=[list(row)+[rhs[i]] for i,row in enumerate(matrix)]
    for i in range(n):
        pivot=max(range(i,n),key=lambda k:abs(a[k][i]))
        if abs(a[pivot][i])<1e-13:raise CadError('CAD_INPUT_DEGENERATE','固定次数/制御点数でfitが特異です。設定を変更してください。')
        a[i],a[pivot]=a[pivot],a[i];scale=a[i][i];a[i]=[v/scale for v in a[i]]
        for j in range(n):
            if j!=i:
                scale=a[j][i];a[j]=[x-scale*y for x,y in zip(a[j],a[i])]
    return [row[-1] for row in a]

def rebuild(c,a,b,p):
    from OCP.TColgp import TColgp_Array1OfPnt
    from OCP.TColStd import TColStd_Array1OfReal,TColStd_Array1OfInteger
    degree=p['degree'];count=p['controlPointCount']
    if any(isinstance(v,bool) or not isinstance(v,int) for v in (degree,count)) or not 1<=degree<=10 or not degree<count<=32:
        raise CadError('CAD_INPUT_DEGENERATE','次数1〜10、制御点数は次数より大きく32以下の整数を指定してください。')
    knots=[0.]*(degree+1)+[i/(count-degree) for i in range(1,count-degree)]+[1.]*(degree+1)
    sample_count=count*8;rows=[];points=[]
    for k in range(sample_count+1):
        t=k/sample_count;rows.append([basis(i,degree,t,knots,count) for i in range(count)])
        q=c.Value(a+(b-a)*t);points.append([q.X(),q.Y(),q.Z()])
    matrix=[[sum(row[i]*row[j] for row in rows) for j in range(count)] for i in range(count)]
    coords=[solve(matrix,[sum(row[i]*q[axis] for row,q in zip(rows,points)) for i in range(count)]) for axis in range(3)]
    poles=TColgp_Array1OfPnt(1,count)
    for i in range(count):poles.SetValue(i+1,point([coords[axis][i] for axis in range(3)]))
    distinct=sorted(set(knots));ks=TColStd_Array1OfReal(1,len(distinct));ms=TColStd_Array1OfInteger(1,len(distinct))
    for i,k in enumerate(distinct):ks.SetValue(i+1,k);ms.SetValue(i+1,knots.count(k))
    fitted=Geom_BSplineCurve(poles,ks,ms,degree,False)
    # This is a stated measurement on a denser independent grid, not a certified Hausdorff bound.
    measured=max(c.Value(a+(b-a)*i/(sample_count*2)).Distance(fitted.Value(i/(sample_count*2))) for i in range(sample_count*2+1))
    return [('rebuild',BRepBuilderAPI_MakeEdge(fitted).Edge(),{'accuracy':{'method':'sampled-corresponding-parameter','sampleCount':sample_count*2+1,'maxDeviationMm':measured,'degree':degree,'controlPointCount':count},'warning':f'近似曲線です。計測最大偏差 {measured:.9g} mm（{sample_count*2+1}点、Hausdorff上限の保証ではありません）。'})]

def evaluate_advanced(op,p,inputs,tol,selectors):
    if op in ('curve.fillet','curve.chamfer'):
        from OCP.ChFi2d import ChFi2d_FilletAPI,ChFi2d_ChamferAPI
        from OCP.TopoDS import TopoDS_Edge
        e1,_,_,_=single(inputs,selectors,'first');e2,_,_,_=single(inputs,selectors,'second')
        plane=p['plane'];planar(e1,plane,tol['kernelLinearMm']);planar(e2,plane,tol['kernelLinearMm'])
        if not isinstance(p['trim'],bool) or not isinstance(p['keepInputs'],bool):raise CadError('CAD_INPUT_TYPE','trim/keepInputsはtrue/falseです。')
        modified1=TopoDS_Edge();modified2=TopoDS_Edge()
        if op=='curve.fillet':
            ax=axis2(plane);builder=ChFi2d_FilletAPI(e1,e2,gp_Pln(ax.Location(),ax.Direction()))
            if not builder.Perform(positive(p['radiusMm'])):raise CadError('CAD_INPUT_DEGENERATE','指定半径で2曲線Filletが成立しません。')
            pick=point(p['connectionPoint']);count=builder.NbResults(pick);index=p.get('solutionIndex')
            if index is None:
                if count!=1:raise CadError('CAD_REFERENCE_AMBIGUOUS','接続側の候補番号を明示してください。',('editParameters',),{'solutionCount':count})
                index=1
            if isinstance(index,bool) or not isinstance(index,int) or not 1<=index<=count:raise CadError('CAD_INPUT_DEGENERATE','接続候補番号が範囲外です。')
            corner=builder.Result(pick,modified1,modified2,index)
        else:
            builder=ChFi2d_ChamferAPI(e1,e2)
            if not builder.Perform():raise CadError('CAD_INPUT_TYPE','Chamferには接続する2本の直線edgeが必要です。')
            corner=builder.Result(modified1,modified2,positive(p['firstDistanceMm']),positive(p['secondDistanceMm']))
        if corner.IsNull():raise CadError('CAD_INPUT_DEGENERATE','接続曲線が得られません。')
        outputs=[('connection',corner,{})]
        if p['trim']:
            if modified1.IsNull() or modified2.IsNull():raise CadError('CAD_KERNEL_FAILED','元曲線の保持区間を得られません。')
            outputs=[('first-retained',modified1,{}),('connection',corner,{}),('second-retained',modified2,{})]
        return outputs
    edge,c,a,b=single(inputs,selectors)
    if op=='curve.rebuild':return rebuild(c,a,b,p)
    if op=='curve.extend':
        end=p['end'];mode=p['method'];distance=positive(p['distanceMm'])
        if end not in ('start','end') or mode not in ('continuation','tangent'):raise CadError('CAD_INPUT_TYPE','対象端点start/end、continuation/tangentを明示してください。')
        u=a if end=='start' else b;origin,tangent,_=derivatives(c,u);sign=-1 if end=='start' else 1
        if mode=='tangent':
            target=[origin[i]+sign*distance*unit(tangent)[i] for i in range(3)]
            segment=BRepBuilderAPI_MakeEdge(point(target if sign<0 else origin),point(origin if sign<0 else target)).Edge()
            builder=BRepBuilderAPI_MakeWire()
            for item in ([segment,edge] if sign<0 else [edge,segment]):builder.Add(item)
            if not builder.IsDone():raise CadError('CAD_KERNEL_FAILED','接線延長wireが成立しません。')
            return [('extended',builder.Wire(),{})]
        from OCP.GeomAbs import GeomAbs_Line,GeomAbs_Circle,GeomAbs_Ellipse
        from OCP.GCPnts import GCPnts_AbscissaPoint
        ad=BRepAdaptor_Curve(edge)
        if ad.GetType() in (GeomAbs_Line,GeomAbs_Circle,GeomAbs_Ellipse):
            result=GCPnts_AbscissaPoint(tol['kernelLinearMm'],ad,sign*distance,u)
            if not result.IsDone():raise CadError('CAD_INPUT_DEGENERATE','指定距離の延長parameterが得られません。')
            v=result.Parameter()
            return [piece(c,v if sign<0 else a,b if sign<0 else v,'extended')]
        from OCP.GeomLib import GeomLib
        extended=bspline(c,a,b);target=[origin[i]+sign*distance*unit(tangent)[i] for i in range(3)]
        GeomLib.ExtendCurveToPoint_s(extended,point(target),1,sign>0)
        endpoint=extended.StartPoint() if sign<0 else extended.EndPoint()
        if endpoint.Distance(point(target))>tol['kernelLinearMm']:
            raise CadError('CAD_KERNEL_FAILED','NURBS延長の正本端点を検証できません。接線延長へ黙って置換しません。')
        return [('extended',BRepBuilderAPI_MakeEdge(extended).Edge(),{})]
    raise CadError('CAD_SCHEMA_UNSUPPORTED','未対応の曲線編集です。')
