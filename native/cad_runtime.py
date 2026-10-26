"""Bounded JSONL daemon. Only registered operations; no file paths/code from IPC."""
import contextlib, hashlib, io, json, math, os, sys, tempfile, time, uuid
from pathlib import Path
from cad_operations import *
from occt_brep_bridge import inspect_shape, read_brep, faces_of
from OCP.BRepTools import BRepTools
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve
MAX_LINE=256*1024*1024
TOLERANCES=dict(kernelLinearMm=1e-6,joinLinearMm=.01,fitLinearMm=.01,solverLinearMm=1e-6,angularRad=1e-5)
STAMP=['requestId','documentId','documentRevision','workspaceEpoch','runtimeEpoch','sessionId','featureId','featureRevision','requestedHash','previewSequence']

def sha(data):return hashlib.sha256(data.encode()).hexdigest()
def serialize(shape,root):
    BRepTools.Clean_s(shape);p=root/'asset.brep'
    if not BRepTools.Write_s(shape,str(p)):raise CadError('CAD_KERNEL_FAILED','正本を保存できません。')
    return p.read_text()
def bounds(s):
    b=Bnd_Box();BRepBndLib.AddOptimal_s(s,b,False,False)
    if b.IsVoid():return dict(min=[0,0,0],max=[0,0,0])
    v=b.Get();return dict(min=list(v[:3]),max=list(v[3:]))
def xyz(p):return [p.X(),p.Y(),p.Z()]
def metric(s,kind):
    p=GProp_GProps();getattr(BRepGProp,kind+'Properties_s')(s,p);return p.Mass()
def sample_edge(edge,tolerance=.02):
    from OCP.GCPnts import GCPnts_QuasiUniformDeflection
    c=BRepAdaptor_Curve(edge);a,b=c.FirstParameter(),c.LastParameter();samples=GCPnts_QuasiUniformDeflection(c,tolerance)
    if not samples.IsDone():raise CadError('CAD_KERNEL_FAILED','表示曲線を評価できません。')
    if samples.NbPoints()>200000:raise CadError('CAD_RESOURCE_LIMIT','曲線表示が過大です。精度を下げてください。')
    points=[xyz(samples.Value(i)) for i in range(1,samples.NbPoints()+1)]
    from OCP.TopAbs import TopAbs_REVERSED
    if edge.Orientation()==TopAbs_REVERSED:points.reverse()
    return points

class Runtime:
    def __init__(self):
        self.cache={};self.epoch=str(uuid.uuid4());self.probes=[]
    def hello(self):
        import OCP,platform
        return dict(protocolVersion=1,runtimeId=self.epoch,pythonVersion=platform.python_version(),ocpVersion=OCP.__version__,occtVersion=None,occtVersionSource='Not exposed by this OCP binding; do not infer from wrapper version',operations=sorted(OPERATIONS),verifiedOptions=self.probes,limitations=['Capability listing is not a completed fixture audit.'])
    def publish(self,s,root,sem=None,asset_data=None):
        sem=sem or {}
        if s.IsNull():raise CadError('CAD_KERNEL_FAILED','カーネルが空のshapeを返しました。')
        if not BRepCheck_Analyzer(s).IsValid():raise CadError('CAD_KERNEL_FAILED','結果の正確な形状検証に失敗しました。')
        data=asset_data if asset_data is not None else serialize(s,root);hash=sha(data);handle=str(uuid.uuid4());topology=[];slots={}
        for kind,enum in [('vertex',TopAbs_VERTEX),('edge',TopAbs_EDGE),('face',TopAbs_FACE)]:
            for i,sub in enumerate(subshapes(s,enum)):
                id=f'{hash}:{kind}:{i}';slots[id]=sub;bb=bounds(sub)
                semanticPath=None
                if kind=='edge' and i<len(sem.get('edges',[])):semanticPath=sem['edges'][i].split('/')
                if kind=='vertex' and i<len(sem.get('vertices',[])):semanticPath=sem['vertices'][i].split('/')
                for mapped,path in sem.get('generated',[]):
                    if sub.IsSame(mapped):semanticPath=path
                topology.append(dict(kind=kind,topologyId=id,semanticPath=semanticPath,fingerprint=dict(kind=kind,geometryKind=str(sub.ShapeType()),centroid=[(a+b)/2 for a,b in zip(bb['min'],bb['max'])],bbox=bb,lengthMm=metric(sub,'Linear') if kind=='edge' else None,areaMm2=metric(sub,'Surface') if kind=='face' else None,normal=None,tangent=None,adjacentTopologyIds=[])))
        solids=subshapes(s,TopAbs_SOLID);faces=subshapes(s,TopAbs_FACE);edges=subshapes(s,TopAbs_EDGE)
        kind='solid' if len(solids)==1 and len(faces)==len(subshapes(solids[0],TopAbs_FACE)) else 'compound' if solids else 'surface' if len(faces)==1 else 'shell' if faces else 'curve' if edges else 'point' if subshapes(s,TopAbs_VERTEX) else 'compound'
        empty=not solids and not faces and not edges and not subshapes(s,TopAbs_VERTEX)
        from OCP.BRepAdaptor import BRepAdaptor_Surface
        from OCP.GeomAbs import GeomAbs_BSplineCurve,GeomAbs_BezierCurve,GeomAbs_BSplineSurface,GeomAbs_BezierSurface
        nurbs=any(BRepAdaptor_Curve(e).GetType() in (GeomAbs_BSplineCurve,GeomAbs_BezierCurve) for e in edges) or any(BRepAdaptor_Surface(f).GetType() in (GeomAbs_BSplineSurface,GeomAbs_BezierSurface) for f in faces)
        preview=dict(meshes=[],curves=[],points=[])
        face_data=[]
        if faces:
            inspected=inspect_shape(s,root,'CAD');preview['meshes']=inspected['meshes'];face_data=inspected['faces']
            face_ids=[]
            for face in faces_of(s):face_ids.append(next(t['topologyId'] for t in topology if t['kind']=='face' and slots[t['topologyId']].IsSame(face)))
            for mesh in preview['meshes']:mesh['faceTopologyIds']=face_ids
        # Edges remain keyed to exact topology for selection.
        for entry in topology:
            if entry['kind']=='edge':preview['curves'].append(dict(topologyId=entry['topologyId'],points=sample_edge(slots[entry['topologyId']])))
            elif entry['kind']=='vertex':preview['points'].append(dict(topologyId=entry['topologyId'],point=xyz(BRep_Tool.Pnt_s(slots[entry['topologyId']]))))
        summary=dict(kind=kind,bbox=bounds(s),areaMm2=metric(s,'Surface') if faces else 0,volumeMm3=metric(s,'Volume') if solids else 0,lengthMm=metric(s,'Linear') if edges else 0,valid=True,empty=empty,exactness='nurbs' if nurbs else 'analytic',accuracy=None,closure=dict(curveClosed=s.Closed() if not faces else None,surfaceUClosed=None,surfaceVClosed=None,shellClosed=s.Closed() if faces else None,enclosesVolume=bool(solids)),topology=topology,faces=face_data,preview=preview)
        if len(self.cache)>=1024 or sum(len(e['data']) for e in self.cache.values())+len(data)>512*1024*1024:raise CadError('CAD_RESOURCE_LIMIT','CADランタイムの正本cache上限です。保存して再起動してください。',('saveWork','restartRuntime'))
        self.cache[handle]=dict(shape=s,hash=hash,data=data,summary=summary,slots=slots)
        return dict(handle=handle,geometryHash=hash,kind=kind,summary=summary)
    def probe(self):
        if self.probes:return dict(probes=self.probes)
        owned=set(self.cache);results=[]
        def run(op,p,inputs=None):
            req=dict(protocolVersion=1,operation=dict(id=op,version=1),parameters=p,inputs=inputs or {},tolerances=TOLERANCES)
            answer=self.handle(dict(type='evaluate',request=req))
            if answer['status']!='ok':raise ValueError(str(answer['diagnostics']))
            return answer['outputs'][0]
        def ref(o,selector=None):return dict(handle=o['handle'],geometryHash=o['geometryHash'],selector=selector)
        try:
            rect=run('curve.rectangle',dict(plane=XY,anchorMode='center',anchor=[0,0,0],widthMm=60,heightMm=40,rounding=False,cornerRadiusMm=1))
            extrude=run('shape.extrude',dict(direction=[0,0,1],distanceMm=25,bothSides=False,cap=True),dict(profile=[ref(rect)]))
            assert abs(extrude['summary']['volumeMm3']-60000)<1e-5
            results.append(dict(operation='curve.rectangle / shape.extrude',status='verified',fixture='60x40x25',volumeMm3=extrude['summary']['volumeMm3']))
            edge=next(t for t in extrude['summary']['topology'] if t['semanticPath']==['side','corner','11'])
            fillet=run('solid.fillet',dict(radiusMm=2,tangentChain=False),dict(body=[ref(extrude)],edges=[ref(extrude,dict(kind='edge',topologyId=edge['topologyId'],orientation='forward'))]))
            assert fillet['summary']['valid'] and fillet['summary']['volumeMm3']<60000
            results.append(dict(operation='solid.fillet / Generated reference',status='verified',fixture='vertical corner R2'))
            a=run('curve.line',dict(start=[0,0,0],end=[20,0,0]));b=run('curve.line',dict(start=[0,0,10],end=[20,0,10]))
            loft=run('surface.loft',dict(cap=False,closed=False,style='smooth',sectionReversed=[False,False]),dict(sections=[ref(a),ref(b)]))
            assert not loft['summary']['closure']['enclosesVolume'] and abs(loft['summary']['areaMm2']-200)<1e-6
            results.append(dict(operation='surface.loft open',status='verified',fixture='20x10',areaMm2=loft['summary']['areaMm2']))
        except Exception as e:results.append(dict(operation='startup probe',status='failed',details=str(e)))
        finally:
            for key in list(self.cache):
                if key not in owned:self.cache.pop(key,None)
        results.extend(dict(operation=op,status='not-implemented') for op in ['surface.sweep2','surface.network','surface.blend','surface.match'])
        self.probes=results;return dict(probes=results)
    def handle(self,msg):
        type=msg.get('type')
        if type=='hello':return self.hello()
        if type=='probe':return self.probe()
        if type=='release':
            for h in msg['handles']:self.cache.pop(h,None)
            return dict(released=True)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            if type=='import':
                asset=msg['asset'];data=asset['data']
                if asset['format']!='occt-brep' or asset['encoding']!='utf-8' or len(data.encode())!=asset['byteLength'] or sha(data)!=msg['hash']:raise CadError('CAD_ASSET_MISSING','正本資産のhashまたはbyte数が一致しません。',('relinkAsset','reimportSource'))
                return self.publish(read_brep(data,root),root,asset_data=data)
            if type=='export':return dict(assets={self.cache[h]['hash']:dict(format='occt-brep',encoding='utf-8',data=self.cache[h]['data'],byteLength=len(self.cache[h]['data'].encode()),sourceKernelVersion='ocp-'+self.hello()['ocpVersion']) for h in msg['handles']})
            if type!='evaluate':raise CadError('CAD_SCHEMA_UNSUPPORTED','未知のmessage typeです。')
            req=msg['request'];stamp={k:req.get(k) for k in STAMP};start=time.monotonic();owned=set(self.cache)
            try:
                if req['protocolVersion']!=1 or req['operation']['version']!=1:raise CadError('CAD_SCHEMA_UNSUPPORTED','未対応の演算・protocol版です。')
                op=req['operation']['id'];inputs={};selectors={};originals={}
                for key,refs in req['inputs'].items():
                    inputs[key]=[]
                    for ref in refs:
                        if ref['handle'] not in self.cache:raise CadError('CAD_ASSET_MISSING','ランタイムの形状参照がありません。',('restartRuntime',))
                        entry=self.cache[ref['handle']]
                        if entry['hash']!=ref['geometryHash']:raise CadError('CAD_REFERENCE_MISSING','入力正本が更新されています。',('reselectReference',))
                        if ref.get('selector'):
                            sel=ref['selector'];sub=entry['slots'].get(sel['topologyId'])
                            if sub is not None and not any(t['topologyId']==sel['topologyId'] and t['kind']==sel['kind'] for t in entry['summary']['topology']):raise CadError('CAD_INPUT_TYPE','選択したsubshapeの型が一致しません。',('selectCompatibleInput',))
                            if sub is None:raise CadError('CAD_REFERENCE_MISSING','対象のedgeまたはfaceが存在しません。',('reselectReference',))
                            selectors.setdefault(key,[]).append(sub)
                        else:inputs[key].append(entry['shape']);originals.setdefault(key,[]).append(entry)
                tol={**TOLERANCES,**req['tolerances']}
                if any(not isinstance(v,(int,float)) or not math.isfinite(v) or v<=0 for v in tol.values()):raise CadError('CAD_INPUT_DEGENERATE','許容差は有限の正数です。')
                output=evaluate(op,req['parameters'],inputs,tol,selectors);published=[]
                for slot,s,sem in output:
                    if op=='curve.rectangle' and not req['parameters'].get('rounding',False):sem['vertices']=['corner/00','corner/10','corner/11','corner/01']
                    if op=='shape.extrude' and originals.get('profile') and not req['parameters']['bothSides']:
                        src=originals['profile'][0];builder=sem['builder'];copier=sem['sourceCopier'];generated=[]
                        for entry in src['summary']['topology']:
                            if not entry['semanticPath']:continue
                            copied=copier.ModifiedShape(src['slots'][entry['topologyId']])
                            for new in builder.Generated(copied):generated.append((new,['side']+entry['semanticPath']))
                        sem['generated']=generated
                    pub=self.publish(s,root,sem)
                    if op in ('solid.split','surface.split') or op=='solid.difference' and len(req['inputs'].get('arguments',[]))>1:
                        role='arguments' if op=='solid.difference' else 'targets';index=sem['sourceIndex']
                        source=req['inputs'][role][index];source_key=source.get('sourceKey') or source['geometryHash']
                        pub['sourceKey']=source_key
                        slot=op+'/'+source_key
                        if op.endswith('.split'):slot+='/'+pub['geometryHash']
                        # Exact equality is a safe continuation; traversal order or
                        # geometric proximity never authorizes a changed partition.
                        if any(o['slotKey']==slot for o in published):raise CadError('CAD_REFERENCE_AMBIGUOUS','同じ由来の分割結果を一意に識別できません。対象を分けて実行してください。',('reselectReference',))
                    if op in ('curve.explode','curve.extractBoundary','surface.explode','surface.extract'):
                        slot=op+'/'+pub['geometryHash']
                        if any(o['slotKey']==slot for o in published):slot=op+'/'+str(uuid.uuid4())
                    pub['slotKey']=slot;published.append(pub)
                status='empty' if published and all(x['summary']['empty'] for x in published) else 'ok'
                return dict(**stamp,status=status,outputs=published,topologyHistory=[],diagnostics=[],metrics=dict(elapsedMs=(time.monotonic()-start)*1000,cacheHit=False))
            except Exception as e:
                for handle in set(self.cache)-owned:self.cache.pop(handle,None)
                code=e.code if isinstance(e,CadError) else 'CAD_KERNEL_FAILED';actions=e.actions if isinstance(e,CadError) else ('editParameters','showProblem','retry')
                diag=dict(code=code,severity='error',featureId=req.get('featureId'),entityIds=[],subshapeRefs=[],causeFeatureIds=[],message=str(e),actions=[dict(id=a,label=a,targetFeatureId=req.get('featureId'),targetInputKey=None,targetParameterKey='radiusMm' if a=='editRadius' else 'joinLinearMm' if a=='editTolerance' else None,focusEntityIds=[]) for a in actions],details=getattr(e,'details',{}))
                return dict(**stamp,status='failed',outputs=[],topologyHistory=[],diagnostics=[diag],metrics=dict(elapsedMs=(time.monotonic()-start)*1000,cacheHit=False))

def main():
    runtime=Runtime()
    while True:
        line=sys.stdin.buffer.readline(MAX_LINE+1)
        if not line:break
        if len(line)>MAX_LINE:break
        try:
            msg=json.loads(line)
            # OCCT can emit directly to fd 1; keep protocol stdout exclusively JSONL.
            saved=os.dup(1)
            try:
                os.dup2(2,1)
                with contextlib.redirect_stdout(sys.stderr):result=runtime.handle(msg)
            finally:os.dup2(saved,1);os.close(saved)
            reply=dict(id=msg.get('id'),ok=True,result=result)
        except Exception as e:reply=dict(id=msg.get('id') if 'msg' in locals() else None,ok=False,error=dict(code=getattr(e,'code','CAD_KERNEL_FAILED'),message=str(e)))
        print(json.dumps(reply,allow_nan=False),flush=True)
if __name__=='__main__':main()
