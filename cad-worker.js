// Install the message handler before async dependencies finish loading.
const kernel=import('./cad-kernel.js');
self.onmessage=async event=>{
  try{const {generateCad}=await kernel;self.postMessage({ok:true,result:generateCad(event.data)})}
  catch(error){self.postMessage({ok:false,error:error.message})}
};
