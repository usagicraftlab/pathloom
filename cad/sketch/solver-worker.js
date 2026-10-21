import { solveSketch } from "./solver.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      ok: true,
      result: solveSketch(data.sketch, data.options),
    });
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: error.message });
  }
};
