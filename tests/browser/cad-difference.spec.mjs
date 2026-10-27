import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
// Real OCCT daemon behind browser IPC. Only the OS-specific Tauri transport is substituted.
let closeRuntime = async () => {};
test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  // Exposed bindings can still receive requests while the previous page tears
  // down. Keep both the child and its requests local to this test, never FIFO
  // match a new child's reply to an old page's unfinished request.
  const daemon = spawn(
    process.env.PATHLOOM_BREP_PYTHON ||
      resolve(".pathloom-runtime/python/bin/python"),
    ["-u", "native/cad_runtime.py"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const pending = new Map();
  let serial = 0,
    closed = false;
  const failPending = (error) => {
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
  const exited = new Promise((resolve) => {
    daemon.once("close", () => {
      closed = true;
      failPending(new Error("Browser CAD fixture stopped"));
      resolve();
    });
  });
  daemon.on("error", failPending);
  daemon.stdin.on("error", failPending);
  daemon.stderr.on("data", () => {});
  const replies = createInterface({ input: daemon.stdout });
  closeRuntime = async () => {
    if (!closed) {
      closed = true;
      failPending(new Error("Browser CAD fixture stopped"));
      replies.close();
      daemon.kill();
    }
    await exited;
  };
  replies.on("line", (line) => {
    if (closed) return;
    let reply;
    try {
      reply = JSON.parse(line);
    } catch (error) {
      failPending(error);
      return;
    }
    const task = pending.get(reply.id);
    if (!task) return;
    pending.delete(reply.id);
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
    if (closed) throw new Error("Browser CAD fixture stopped");
    return new Promise((resolve, reject) => {
      const id = String(++serial);
      pending.set(id, { resolve, reject });
      daemon.stdin.write(
        JSON.stringify({ ...message, id }) + "\n",
        (error) => {
          if (!error) return;
          pending.get(id)?.reject(error);
          pending.delete(id);
        },
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
});
test.afterEach(async () => {
  await closeRuntime();
});
async function boxes(page, positions = [0, 20, 5]) {
  for (const x of positions) {
    const count = await page.locator(".model-history-entry").count();
    await page.getByRole("button", { name: "Box", exact: true }).click();
    await page
      .getByRole("textbox", { name: "基準点 XYZ", exact: true })
      .fill(JSON.stringify([x, 0, 0]));
    await page.locator('[data-parameter="anchorMode"]').fill("corner");
    for (const key of ["widthMm", "depthMm", "heightMm"])
      await page.locator(`[data-parameter="${key}"]`).fill("10");
    await page.getByRole("button", { name: "確定", exact: true }).click();
    await expect(page.locator(".model-history-entry")).toHaveCount(count + 1);
    await expect(page.locator(".model-history-entry").last()).toContainText(
      "valid",
    );
  }
  return page.evaluate(() =>
    window.PathloomModel.store.document.features.map(
      (f) => f.outputSlots[0].entityId,
    ),
  );
}
async function selectRole(page, role, ids) {
  const values = await page
    .getByRole("listbox", { name: `CAD input ${role}`, exact: true })
    .locator("option")
    .evaluateAll(
      (options, ids) =>
        options
          .filter((o) => ids.includes(JSON.parse(o.value).entityId))
          .map((o) => o.value),
      ids,
    );
  expect(values).toHaveLength(ids.length);
  await page
    .getByRole("listbox", { name: `CAD input ${role}`, exact: true })
    .selectOption(values);
}
async function beginDifference(page, targets, tools, keep = false) {
  const count = await page.locator(".model-history-entry").count();
  await page.getByRole("button", { name: "Difference", exact: true }).click();
  await selectRole(page, "arguments", targets);
  await selectRole(page, "tools", tools);
  await page
    .getByRole("checkbox", { name: "工具を保持する", exact: true })
    .setChecked(keep);
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(count + 1);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    /valid|empty/,
  );
}
async function cutState(page) {
  return page.evaluate(async () => {
    const store = window.PathloomModel.store;
    const { deriveVisibleEntities } = await import("/cad/document.js");
    const f = store.document.features.at(-1);
    return {
      status: f.status,
      keepTools: f.parameters.keepTools,
      slots: f.outputSlots.map((s) => ({
        ...s,
        volume: store.getEntity(s.entityId).displayCache.volumeMm3,
        empty: store.getEntity(s.entityId).displayCache.empty,
      })),
      visible: deriveVisibleEntities(store.document).map((e) => e.id),
    };
  });
}
test("#5 AUD-002: UI preserves both targets, tool retention, Undo/Redo and v2 save/reopen", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const [a, b, tool] = await boxes(page);
  await beginDifference(page, [a, b], [tool], true);
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  const initial = await cutState(page);
  expect(initial.slots.map((s) => Math.round(s.volume))).toEqual([500, 1000]);
  expect(initial.visible).toContain(tool);
  expect(initial.visible).not.toContain(a);
  expect(initial.visible).not.toContain(b);
  expect(initial.slots.map((s) => s.key)).toEqual([
    `argument/${a}`,
    `argument/${b}`,
  ]);
  await page.locator("#modelUndo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  expect((await cutState(page)).visible.sort()).toEqual([a, b, tool].sort());
  await page.locator("#modelRedo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  expect((await cutState(page)).slots).toEqual(initial.slots);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saved?.version)).toBe(2);
  // Recovery is a separate, legitimate prompt. Seed it explicitly rather than
  // racing the autosave timer, and dismiss it before opening the saved file.
  await page.evaluate(() =>
    window.__cadStorage({
      key: "recovery",
      content: JSON.stringify(window.__saved.cadDocument),
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.evaluate(() => document.querySelector("#modeModel").click());
  await page
    .getByRole("button", { name: "回復データを破棄", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  expect((await cutState(page)).slots).toEqual(initial.slots);
  expect((await cutState(page)).visible).toContain(tool);
  await page.locator(".model-history-entry").last().click();
  await page
    .getByRole("checkbox", { name: "工具を保持する", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect
    .poll(async () => (await cutState(page)).visible.includes(tool))
    .toBe(false);
  await page.locator(".model-history-entry").last().click();
  await page
    .getByRole("checkbox", { name: "工具を保持する", exact: true })
    .check();
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect
    .poll(async () => (await cutState(page)).visible.includes(tool))
    .toBe(true);
  expect((await cutState(page)).slots).toEqual(initial.slots);
  expect(errors).toEqual([]);
});
test("#5 T19/T20: default tool consumption and single, noncontact and empty results", async ({
  page,
}) => {
  const [a, b, tool] = await boxes(page);
  await beginDifference(page, [a], [tool]);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  const single = await cutState(page);
  expect(Math.round(single.slots[0].volume)).toBe(500);
  expect(single.visible).not.toContain(tool);
  await page.locator("#modelUndo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await beginDifference(page, [b], [tool]);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  expect(Math.round((await cutState(page)).slots[0].volume)).toBe(1000);
  await page.locator("#modelUndo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await beginDifference(page, [a], [a]);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "empty",
  );
  const empty = await cutState(page);
  expect(empty.slots).toHaveLength(1);
  expect(empty.slots[0].empty).toBe(true);
  expect(empty.slots[0].volume).toBe(0);
  await page.locator("#modelUndo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await beginDifference(page, [a, b], [a]);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  const mixed = await cutState(page);
  expect(mixed.slots.map((s) => Math.round(s.volume))).toEqual([0, 1000]);
  expect(mixed.slots[0].empty).toBe(true);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.features.at(-1).status),
    )
    .toBe("valid");
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await expect
    .poll(async () => (await cutState(page)).slots)
    .toEqual(mixed.slots);
});
test("#5: reordering targets preserves entity identity and repairing tools restores the old tool", async ({
  page,
}) => {
  const [a, b, tool, replacement] = await boxes(page, [0, 20, 5, 25]);
  await beginDifference(page, [a, b], [tool]);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  const initial = await cutState(page);
  await page.evaluate(async () => {
    const store = window.PathloomModel.store,
      f = store.document.features.at(-1);
    await store.repair(f.id, "arguments", [...f.inputs.arguments].reverse());
  });
  const reordered = await cutState(page);
  expect(
    Object.fromEntries(reordered.slots.map((s) => [s.key, s.entityId])),
  ).toEqual(Object.fromEntries(initial.slots.map((s) => [s.key, s.entityId])));
  await page.locator(".model-history-entry").last().click();
  await selectRole(page, "tools", [replacement]);
  await expect
    .poll(async () => (await cutState(page)).visible.includes(tool))
    .toBe(true);
  expect((await cutState(page)).visible).not.toContain(replacement);
  expect(
    (await cutState(page)).slots
      .map((s) => Math.round(s.volume))
      .sort((a, b) => a - b),
  ).toEqual([500, 1000]);
});
