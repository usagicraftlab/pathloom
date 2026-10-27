import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
// Real OCCT daemon behind browser IPC. Only the OS-specific Tauri transport is substituted.
// Fixtures run for every test, even when another spec already imported this module.
const test = base.extend({
  page: async ({ page }, use) => {
    let queue = [], serial = 0, closed = false, replies;
    page.on("dialog", (dialog) => dialog.accept());
    const daemon = spawn(
      process.env.PATHLOOM_BREP_PYTHON ||
        resolve(".pathloom-runtime/python/bin/python"),
      ["-u", "native/cad_runtime.py"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const exited = new Promise((resolveExit) => daemon.once("close", resolveExit));
    const rejectPending = (error) => {
      for (const task of queue.splice(0)) task.reject(error);
    };
    daemon.on("error", rejectPending);
    daemon.stdin.on("error", rejectPending);
    try {
      daemon.stderr.on("data", () => {});
      replies = createInterface({ input: daemon.stdout });
      replies.on("line", (line) => {
        if (closed) return;
        const reply = JSON.parse(line),
          task = queue.shift();
        if (!task) return;
        reply.ok
          ? task.resolve(reply.result)
          : task.reject(new Error(reply.error.message));
      });
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
          queue.push({ resolve, reject });
          daemon.stdin.write(
            JSON.stringify({ ...message, id: String(++serial) }) + "\n",
          );
        });
      });
      await page.addInitScript(() => {
        const listeners = new Map();
        window.__saved = null;
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
      closed = true;
      rejectPending(new Error("CAD fixture ended"));
      replies?.close();
      daemon.kill();
      await exited;
    }
  },
});

export { test, expect };
