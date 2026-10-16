import {generateCad} from './cad-kernel.js';
self.onmessage=event=>{
  try{self.postMessage({ok:true,result:generateCad(event.data)})}
  catch(error){self.postMessage({ok:false,error:error.message})}
};
