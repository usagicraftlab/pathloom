import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
// Real OCCT daemon behind browser IPC. Only the OS-specific Tauri transport is substituted.
const test = base.extend({
  page: async ({ page }, use) => {
    let closeRuntime = async () => {};
    try {
      page.on("dialog", (dialog) => dialog.accept());
      const daemon = spawn(
        process.env.PATHLOOM_BREP_PYTHON ||
          resolve(".pathloom-runtime/python/bin/python"),
        ["-u", "native/cad_runtime.py"],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      const pending = new Map(), slices = new Map();
      let serial = 0, closed = false;
      const rejectPending = (error) => {
        for (const task of pending.values()) task.reject(error);
        pending.clear();
      };
      const exited = new Promise((resolve) => daemon.once("close", resolve));
      daemon.on("error", rejectPending);
      daemon.stdin.on("error", rejectPending);
      daemon.once("close", () => {
        closed = true;
        rejectPending(new Error("CAD fixture runtime closed"));
      });
      daemon.stderr.on("data", () => {});
      const lines = createInterface({ input: daemon.stdout });
      lines.on("line", (line) => {
        const reply = JSON.parse(line), task = pending.get(reply.id);
        if (!task) return;
        pending.delete(reply.id);
        reply.ok
          ? task.resolve(reply.result)
          : task.reject(new Error(reply.error.message));
      });
      closeRuntime = async () => {
        closed = true;
        rejectPending(new Error("CAD fixture ended"));
        lines.close();
        const active = [...slices.values()];
        for (const task of active) task.child.kill();
        daemon.kill();
        await Promise.all([exited, ...active.map((task) => task.exited)]);
      };
      const storage = new Map();
      await page.exposeBinding("__cadStorage", (_, args) => {
        if (args.discard) storage.delete(args.key);
        else if (args.content !== undefined) storage.set(args.key, args.content);
        return (
          storage.get(args.key) ??
          (["library", "commands"].includes(args.key) ? "[]" : null)
        );
      });
      await page.exposeBinding("__cadKernel", async (_, message) => {
        if (closed) throw new Error("CAD fixture ended");
        return new Promise((resolve, reject) => {
          const id = String(++serial);
          pending.set(id, { resolve, reject });
          daemon.stdin.write(
            JSON.stringify({ ...message, id }) + "\n",
            (error) => {
              if (!error) return;
              pending.delete(id);
              reject(error);
            },
          );
        });
      });
      await page.exposeBinding("__cadSlice", async (_, args) => {
        if (args.cancel) {
          slices.get(args.requestId)?.child.kill();
          return;
        }
        if (closed) throw new Error("CAD fixture ended");
        return new Promise((resolveResult, reject) => {
          const child = spawn(process.env.PATHLOOM_BREP_PYTHON || resolve(".pathloom-runtime/python/bin/python"), ["native/occt_brep_bridge.py"]);
          const task = { child, exited: new Promise((resolve) => child.once("close", resolve)) };
          slices.set(args.requestId, task);
          let stdout = "", stderr = "";
          child.stdout.on("data", (data) => { stdout += data; });
          child.stderr.on("data", (data) => { stderr += data; });
          child.on("error", reject);
          child.stdin.on("error", reject);
          child.once("close", (code) => {
            if (slices.get(args.requestId) === task) slices.delete(args.requestId);
            try {
              const result = JSON.parse(stdout);
              if (code !== 0 || !result.success) throw new Error(result.error || stderr);
              resolveResult(result.shape);
            } catch (error) { reject(error); }
          });
          child.stdin.end(JSON.stringify({ action: "slice", ...args }));
        });
      });
      await page.addInitScript(() => {
        const listeners = new Map();
        window.__saved = null;
        window.__saveCount = 0;
        window.__cadWorkers = [];
        const OriginalWorker = window.Worker;
        window.Worker = class extends OriginalWorker {
          constructor(url, options) {
            super(url, options);
            if (!String(url).includes("cad-worker.js")) return;
            this.audit = { completed: 0, terminated: false };
            window.__cadWorkers.push(this.audit);
            this.addEventListener("message", (event) => {
              if (event.data.nativeSlice && !event.data.request.preview) window.__lastNativeOwner = this.audit;
              if (Object.hasOwn(event.data, "ok")) this.audit.completed++;
            });
          }
          terminate() {
            if (this.audit) this.audit.terminated = true;
            return super.terminate();
          }
        };
        window.__TAURI__ = {
          event: {
            listen: async (name, cb) => {
              listeners.set(name, cb);
              return () => listeners.delete(name);
            },
          },
          core: {
            invoke: async (name, args = {}) => {
              if (name === "cad_runtime_start" || name === "cad_runtime_restart") {
                const hello = await window.__cadKernel({ type: "hello" });
                return { ...hello, runtimeEpoch: 1 };
              }
              if (name === "cad_evaluate") {
                const result = await window.__cadKernel({
                  type: "evaluate",
                  request: args.request,
                });
                setTimeout(
                  () => listeners.get("cad-job-result")?.({ payload: result }),
                  0,
                );
                return { accepted: true, requestId: args.request.requestId };
              }
              if (name === "cad_import_asset")
                return window.__cadKernel({
                  type: "import",
                  hash: args.hash,
                  asset: args.asset,
                });
              if (name === "cad_export_assets")
                return window.__cadKernel({
                  type: "export",
                  handles: args.handles,
                });
              if (name === "cad_release_handles")
                return window.__cadKernel({
                  type: "release",
                  handles: args.handles,
                });
              if (name === "cad_cancel") return;
              if (name === "cancel_cad_request") return window.__cadSlice({ ...args, cancel: true });
              if (name === "slice_step_brep") {
                const result = await window.__cadSlice(args);
                if (window.__holdNextSlice) {
                  window.__holdNextSlice = false;
                  const held = { owner: window.__lastNativeOwner, completedBefore: window.__lastNativeOwner.completed, returned: false };
                  await new Promise((resolve) => { held.release = resolve; window.__heldSlice = held; });
                  held.returned = true;
                }
                return result;
              }
              if (name === "cad_library") return "[]";
              if (name === "cad_command_library")
                return window.__cadStorage({ key: "commands", ...args });
              if (name === "cad_shape_library")
                return window.__cadStorage({ key: "library", ...args });
              if (name === "cad_recovery")
                return window.__cadStorage({ key: "recovery", ...args });
              if (name === "runtime_info")
                return {
                  platform: "macos",
                  name: "Pathloom",
                  grasshopperEndpoint: "ws://127.0.0.1:8765",
                };
              if (name === "grasshopper_bridge_status") return {};
              if (name === "grasshopper_brep_snapshots") return [];
              if (name === "printer_connection_get")
                return { settings: {}, hasCredentials: false };
              if (name === "save_pathloom_project") {
                window.__saved = JSON.parse(args.content);
                window.__saveCount++;
                await window.__cadStorage({
                  key: "project",
                  content: args.content,
                });
                return "/tmp/cad.pathloom";
              }
              if (name === "open_pathloom_project")
                return {
                  path: "/tmp/cad.pathloom",
                  content: await window.__cadStorage({ key: "project" }),
                };
              throw new Error("Unexpected IPC " + name);
            },
          },
        };
      });
      await page.goto("/");
      await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
      await expect(page.locator("#cadStatus")).toContainText("layers");
      await page.locator("#modeModel").click();
      await expect(page.locator("#modelStatus")).toContainText("正確な形状");
      await use(page);
    } finally {
      await closeRuntime();
    }
  },
});

export { test, expect };
