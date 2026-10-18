// Native CAD capabilities stay in the application, never inside custom code.
// A single native section at a time. Workers leaving the graph lose their
// subscriptions; unstarted tasks with no subscribers are discarded.
export function createNativeSliceQueue(run){
  const tasks=new Map(),cache=new Map();let running=false,points=0;
  const cost=result=>(result.paths||[]).reduce((n,path)=>n+path.points.length,0);
  function pump(){if(running)return;const task=[...tasks.values()].find(t=>!t.started&&t.waiters.size);if(!task)return;running=true;task.started=true;
    Promise.resolve().then(()=>run(task.request)).then(result=>{cache.set(task.key,result);points+=cost(result);while(cache.size>8||points>500000&&cache.size>1){const key=cache.keys().next().value;points-=cost(cache.get(key));cache.delete(key)}for(const waiter of task.waiters.values())waiter.resolve(result)}).catch(error=>{for(const waiter of task.waiters.values())waiter.reject(error)}).finally(()=>{tasks.delete(task.key);running=false;pump()});
  }
  return {request(owner,request){
    if(cache.has(request.key)){const result=cache.get(request.key);cache.delete(request.key);cache.set(request.key,result);return Promise.resolve(result)}
    if(request.preview)return Promise.reject(new Error('Preview awaiting exact section'));
    return new Promise((resolve,reject)=>{let task=tasks.get(request.key);if(!task){task={key:request.key,request,waiters:new Map(),started:false};tasks.set(request.key,task)}task.waiters.set(owner,{resolve,reject});queueMicrotask(pump)})
  },cancel(owner){for(const[key,task]of tasks){const waiter=task.waiters.get(owner);if(waiter){task.waiters.delete(owner);waiter.reject(new Error('Worker cancelled'))}if(!task.started&&!task.waiters.size)tasks.delete(key)}},stats:()=>({active:running?1:0,queued:[...tasks.values()].filter(t=>!t.started).length,cached:cache.size})};
}
const nativeSlices=createNativeSliceQueue(request=>{if(!window.__TAURI__?.core?.invoke)throw new Error('Exact B-rep slicing requires Pathloom Desktop');return window.__TAURI__.core.invoke('slice_step_brep',{brep:request.brep,layerHeight:request.layerHeight,tolerance:request.tolerance})});
export function createCadWorker(){
  const job=new Worker('./cad-worker.js',{type:'module'}),owner=Symbol('worker'),terminate=job.terminate.bind(job);let alive=true;
  const post=job.postMessage.bind(job),geometry=new Map();
  job.postMessage=(message,...rest)=>{
    if(message.nativeSliceResult){post(message,...rest);return}
    const graph=message.kind==='cad-preview'?message.definition:message;
    if(!Array.isArray(graph.inputs)){post(message,...rest);return}
    const ids=new Set();const inputs=graph.inputs.map(input=>{if(input.type!=='surface')return input;ids.add(input.id);const previous=geometry.get(input.id);geometry.set(input.id,{meshes:input.meshes,brep:input.brep,faces:input.faces,kernel:input.kernel});if(!previous||previous.meshes!==input.meshes||previous.brep!==input.brep||previous.faces!==input.faces||previous.kernel!==input.kernel)return input;const copy={...input,_workerGeometryRef:input.id};for(const key of ['meshes','brep','faces','kernel'])delete copy[key];return copy});
    for(const id of geometry.keys())if(!ids.has(id))geometry.delete(id);
    const compact={...graph,inputs};post(message.kind==='cad-preview'?{...message,definition:compact}:compact,...rest);
  };
  job.terminate=()=>{if(!alive)return;alive=false;nativeSlices.cancel(owner);terminate()};
  job.addEventListener('message',async event=>{if(!event.data.nativeSlice)return;event.stopImmediatePropagation();const request=event.data.request;try{
    const result=await nativeSlices.request(owner,request);if(alive)job.postMessage({nativeSliceResult:true,key:request.key,paths:result.paths});
  }catch(error){if(alive)job.postMessage({nativeSliceResult:true,key:request.key,error:error.message||String(error)})}});
  return job;
}
export function validateCodeDefinition(definition){return new Promise((resolve,reject)=>{
  const job=createCadWorker(),timer=setTimeout(()=>{job.terminate();reject(new Error('Component validation exceeded 30 seconds'))},30000);
  const finish=()=>{clearTimeout(timer);job.terminate()};
  job.onerror=event=>{finish();reject(new Error(event.message||'Component worker failed'))};
  job.onmessage=event=>{finish();event.data.ok?resolve(event.data.result):reject(new Error(event.data.error))};job.postMessage(definition);
})}
