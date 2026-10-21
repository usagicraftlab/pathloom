export class SketchSolverClient {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.sequence = 0;
  }
  solve(sketch, options = {}) {
    if (!this.worker) {
      this.worker = new Worker(new URL("./solver-worker.js", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = ({ data }) => {
        const task = this.pending.get(data.id);
        if (!task) return;
        clearTimeout(task.timeout);
        this.pending.delete(data.id);
        data.ok
          ? task.resolve(data.result)
          : task.reject(new Error(data.error));
      };
      this.worker.onerror = (event) => {
        for (const p of this.pending.values()) {
          clearTimeout(p.timeout);
          p.reject(new Error(event.message));
        }
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("SKETCH_NO_CONVERGENCE: solver timed out"));
      }, 2000);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage({ id, sketch, options });
    });
  }
  close() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error("SKETCH_CANCELLED"));
    }
    this.pending.clear();
  }
}
