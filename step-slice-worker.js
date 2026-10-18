import {sliceMeshesToPaths} from './step-geometry.js';
self.onmessage=event=>{try{const paths=sliceMeshesToPaths(event.data.meshes,event.data.layerHeight);self.postMessage({ok:true,paths})}catch(error){self.postMessage({ok:false,error:error.message||String(error)})}};
