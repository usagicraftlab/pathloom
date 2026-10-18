importScripts('./occt-import-js.js');
onmessage = async function (event) {
  const occt = await occtimportjs({locateFile: path => new URL(path, self.location.href).href});
  const result = occt.ReadStepFile(new Uint8Array(event.data.buffer), {linearUnit:'millimeter', linearDeflectionType:'bounding_box_ratio', linearDeflection:0.001, angularDeflection:0.5});
  postMessage(result);
};
