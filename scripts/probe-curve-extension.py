import sys,json,math,OCP
from OCP.Geom import Geom_BSplineCurve,Geom_TrimmedCurve
from OCP.GeomConvert import GeomConvert
from OCP.GeomLib import GeomLib
from OCP.TColgp import TColgp_Array1OfPnt
from OCP.TColStd import TColStd_Array1OfReal,TColStd_Array1OfInteger
from OCP.gp import gp_Pnt
p=TColgp_Array1OfPnt(1,4)
for i,v in enumerate([[0,0,0],[10,10,0],[20,10,0],[30,0,0]]):p.SetValue(i+1,gp_Pnt(*v))
k=TColStd_Array1OfReal(1,2);k.SetValue(1,0);k.SetValue(2,1)
m=TColStd_Array1OfInteger(1,2);m.SetValue(1,4);m.SetValue(2,4)
base=Geom_BSplineCurve(p,k,m,3,False)
def state(c):
 q=c.EndPoint();return dict(degree=c.Degree(),poles=c.NbPoles(),first=c.FirstParameter(),last=c.LastParameter(),end=[q.X(),q.Y(),q.Z()])
target=gp_Pnt(30+5/math.sqrt(2),-5/math.sqrt(2),0);report=[]
for label,c in [('original',base.Copy()),('trimmed-converted',GeomConvert.CurveToBSplineCurve_s(Geom_TrimmedCurve(base,0,1)))]:
 before=state(c);result=GeomLib.ExtendCurveToPoint_s(c,target,1,True)
 report.append(dict(case=label,before=before,after=state(c),returned=repr(result),expectedTarget=[target.X(),target.Y(),target.Z()],errorMm=c.EndPoint().Distance(target)))
print(json.dumps(dict(ocp=OCP.__version__,python=sys.version,results=report),ensure_ascii=False,indent=2))
