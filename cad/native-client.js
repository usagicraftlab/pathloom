import { id } from "./document.js";
export class NativeCadClient {
  constructor({ invoke, listen } = {}) {
    this.invoke =
      invoke ||
      ((name, args) => {
        if (!globalThis.__TAURI__?.core?.invoke)
          throw new Error(
            "CAD作図にはPathloom Desktopが必要です。npm run cad:setupでランタイムを準備してください。",
          );
        return globalThis.__TAURI__.core.invoke(name, args);
      });
    this.listen =
      listen || ((name, cb) => globalThis.__TAURI__.event.listen(name, cb));
    this.jobs = new Map();
    this.runtimeEpoch = 0;
    this.workspaceEpoch = 1;
    this.ready = null;
  }
  async start() {
    if (!this.ready)
      this.ready = (async () => {
        if (!this.unlisten)
          this.unlisten = await this.listen("cad-job-result", (event) => {
            const result = event.payload || event;
            const job = this.jobs.get(result.requestId);
            if (!job) return;
            this.jobs.delete(result.requestId);
            clearTimeout(job.timeout);
            if (
              result.diagnostics?.some((d) =>
                [
                  "CAD_RUNTIME_CRASHED",
                  "CAD_RUNTIME_MISSING",
                  "CAD_RESOURCE_LIMIT",
                ].includes(d.code),
              )
            )
              this.ready = null;
            job.resolve(result);
          });
        const hello = await this.invoke("cad_runtime_start");
        this.runtimeEpoch = hello.runtimeEpoch;
        return hello;
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }
  async evaluate(request) {
    await this.start();
    request = {
      ...request,
      protocolVersion: 1,
      requestId: id(),
      workspaceEpoch: this.workspaceEpoch,
      runtimeEpoch: this.runtimeEpoch,
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cancel(request.requestId);
        reject(
          new Error(
            "CAD_RESOURCE_LIMIT: CAD処理が時間内に応答しませんでした。",
          ),
        );
      }, 65000);
      this.jobs.set(request.requestId, { resolve, reject, timeout, request });
      Promise.resolve(this.invoke("cad_evaluate", { request })).catch(
        (error) => {
          clearTimeout(timeout);
          this.jobs.delete(request.requestId);
          reject(error);
        },
      );
    });
  }
  async importAsset(hash, asset) {
    await this.start();
    return this.invoke("cad_import_asset", { hash, asset });
  }
  async exportAssets(handles) {
    await this.start();
    return (await this.invoke("cad_export_assets", { handles })).assets;
  }
  async exportStep(handle) {
    await this.start();
    return this.invoke("cad_export_step", { handle });
  }
  async saveStep(content, filename) {
    return this.invoke("save_cad_step", { content, filename });
  }
  release(handles) {
    if (handles.length)
      return this.invoke("cad_release_handles", { handles }).catch(() => {});
  }
  cancel(requestId) {
    const job = this.jobs.get(requestId);
    if (job) {
      clearTimeout(job.timeout);
      this.jobs.delete(requestId);
      job.reject(new Error("CAD_CANCELLED"));
    }
    this.ready = null;
    return this.invoke("cad_cancel", { requestId }).catch(() => {});
  }
  cancelAll() {
    for (const id of [...this.jobs.keys()]) this.cancel(id);
    this.workspaceEpoch++;
  }
  async restart() {
    this.cancelAll();
    await this.invoke("cad_runtime_restart");
    this.ready = null;
    return this.start();
  }
}
