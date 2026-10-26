import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
function sliceWithPython(args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.env.PATHLOOM_BREP_PYTHON ||
        resolve(".pathloom-runtime/python/bin/python"),
      ["-B", "native/occt_brep_bridge.py"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const result = JSON.parse(stdout);
        if (result.success === false || code) throw new Error(result.error);
        resolveResult(result.shape);
      } catch (error) {
        reject(new Error(`${error.message}: ${stderr.slice(-500)}`));
      }
    });
    child.stdin.end(
      JSON.stringify({
        action: "slice",
        brep: args.brep,
        layerHeight: args.layerHeight,
        tolerance: args.tolerance,
      }),
    );
  });
}
// Real OCCT daemon behind browser IPC. Only the OS-specific Tauri transport is substituted.
let daemon,
  queue = [],
  serial = 0,
  runtimeEpoch = 0;
function launchDaemon() {
  runtimeEpoch++;
  daemon = spawn(
    process.env.PATHLOOM_BREP_PYTHON ||
      resolve(".pathloom-runtime/python/bin/python"),
    ["-u", "native/cad_runtime.py"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  daemon.stderr.on("data", () => {});
  createInterface({ input: daemon.stdout }).on("line", (line) => {
    const reply = JSON.parse(line),
      task = queue.shift();
    if (!task) return;
    reply.ok
      ? task.resolve(reply.result)
      : task.reject(new Error(reply.error.message));
  });
}
async function stopDaemon() {
  const child = daemon;
  daemon = null;
  if (!child) return;
  await new Promise((done) => {
    child.once("close", done);
    child.kill();
  });
  for (const task of queue.splice(0))
    task.reject(new Error("CAD daemon stopped"));
}
test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  launchDaemon();
  const storage = new Map();
  await page.exposeBinding("__cadStorage", (_, args) => {
    if (args.discard) storage.delete(args.key);
    else if (args.content !== undefined) storage.set(args.key, args.content);
    return (
      storage.get(args.key) ??
      (["library", "commands"].includes(args.key) ? "[]" : null)
    );
  });
  await page.exposeBinding("__restartCadDaemon", async () => {
    const previous = daemon.pid;
    await stopDaemon();
    launchDaemon();
    return { previous, current: daemon.pid };
  });
  await page.exposeBinding("__cadKernel", async (_, message) => {
    const result = await new Promise((resolve, reject) => {
      queue.push({ resolve, reject });
      daemon.stdin.write(
        JSON.stringify({ ...message, id: String(++serial) }) + "\n",
      );
    });
    return ["hello", "import"].includes(message.type)
      ? { ...result, runtimeEpoch }
      : result;
  });
  await page.exposeBinding("__cadSlice", (_, args) => sliceWithPython(args));
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
          if (name === "slice_step_brep") return window.__cadSlice(args);
          if (name === "cancel_cad_request") return;
          if (name === "cad_runtime_start" || name === "cad_runtime_restart") {
            if (name === "cad_runtime_restart")
              await window.__restartCadDaemon();
            return window.__cadKernel({ type: "hello" });
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
test.afterEach(stopDaemon);

async function commitModel(page, count) {
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(count);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
}

test("P1 incomplete v2 work survives a fresh Python process; v1 stays unchanged until Save", async ({
  page,
}) => {
  const expected = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const store = window.PathloomModel.store;
    async function add(id, params, inputs = {}) {
      const s = createCommandSession(commandById(id));
      Object.assign(s.parameters, params);
      s.inputs = inputs;
      if (!(await store.add(s))) throw new Error(JSON.stringify(s.diagnostics));
      return store.document.features.at(-1);
    }
    const line = await add("C03", {
      points: [
        [0, 0, -5],
        [10, 0, -2],
        [10, 10, 1],
      ],
      closed: false,
    });
    await add(
      "S05",
      { direction: [0, 0, 1], distanceMm: 10, cap: false },
      { profile: [{ entityId: line.outputSlots[0].entityId }] },
    );
    await add("C09", {
      poles: [
        [0, 0, -5],
        [10, 5, 0],
        [20, 5, 4],
        [30, 0, 0],
      ],
      weights: [1, 2, 2, 1],
    });
    const rect = await add("C04", {});
    await store.edit(rect.id, { widthMm: -1 });
    return store.document.entities.map((e) => ({
      id: e.id,
      hash: e.geometry.assetHash,
      closure: e.closure,
      bbox: e.bbox,
    }));
  });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("幅 mm", { exact: true }).fill("80c");
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__saved?.cadDocument.draftSessions.at(-1)?.rawDraft.widthMm,
      ),
    )
    .toBe("80c");
  const before = await page.evaluate(() => structuredClone(window.__saved));
  expect(before.cadDocument.features.at(-1).status).toBe("failed");
  expect(before.cadDocument.features.at(-1).lastValid).toBeTruthy();
  const pids = await page.evaluate(async () => {
    await window.__cadStorage({ key: "recovery", discard: true });
    return window.__restartCadDaemon();
  });
  expect(pids.current).not.toBe(pids.previous);
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await page.locator("#modeModel").click();
  await expect(page.getByLabel("幅 mm", { exact: true })).toHaveValue("80c");
  expect(
    await page
      .getByLabel("幅 mm", { exact: true })
      .evaluate((e) => e.checkValidity()),
  ).toBe(false);
  const restored = await page.evaluate(() =>
    window.PathloomModel.store.document.entities.map((e) => ({
      id: e.id,
      hash: e.geometry.assetHash,
      closure: e.closure,
      bbox: e.bbox,
    })),
  );
  expect(restored).toEqual(expected);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.features.at(-1).status,
    ),
  ).toBe("failed");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await page.getByLabel("幅 mm", { exact: true }).fill("80");
  await commitModel(page, 5);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.features.length),
    )
    .toBe(5);
  expect(
    await page.evaluate(() => window.__saved.cadDocument.draftSessions.length),
  ).toBe(0);
  const legacy = await page.evaluate(async () => {
    const p = structuredClone(window.__saved);
    p.version = 1;
    delete p.cadDocument;
    const content = JSON.stringify(p);
    await window.__cadStorage({ key: "project", content });
    document.querySelector("#projectOpen").click();
    return content;
  });
  await expect(page.locator(".model-history-entry")).toHaveCount(0);
  await expect(page.locator("#projectName")).toContainText("次回保存はv2");
  await expect(page.locator("#cadStatus")).toContainText("layers");
  expect(
    await page.evaluate(() => window.__cadStorage({ key: "project" })),
  ).toBe(legacy);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window
          .__cadStorage({ key: "project" })
          .then(JSON.parse)
          .then((p) => p.version),
      ),
    )
    .toBe(2);
});

test("P1 viewport preselection, postselection, endpoint and rectangle center snapping use exact points", async ({
  page,
}) => {
  async function line(start, end, count) {
    await page.getByRole("button", { name: "Line", exact: true }).click();
    await page
      .getByLabel("始点 XYZ", { exact: true })
      .fill(JSON.stringify(start));
    await page
      .getByLabel("終点 XYZ", { exact: true })
      .fill(JSON.stringify(end));
    await commitModel(page, count);
  }
  async function at(point) {
    return page.evaluate(async (point) => {
      const THREE = await import("/vendor/three/three.module.js"),
        state = window.Pathloom.viewState(),
        r = document.querySelector("#threeCanvas").getBoundingClientRect();
      const camera = new THREE.PerspectiveCamera(
        36,
        r.width / r.height,
        0.1,
        1200,
      );
      camera.position.fromArray(state.position);
      camera.up.set(0, 0, 1);
      camera.lookAt(new THREE.Vector3(...state.target));
      camera.updateMatrixWorld();
      const p = new THREE.Vector3(...point).project(camera);
      return {
        x: r.left + ((p.x + 1) * r.width) / 2,
        y: r.top + ((1 - p.y) * r.height) / 2,
      };
    }, point);
  }
  async function pick(point, shift = false) {
    const p = await at(point);
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.click(p.x, p.y);
    if (shift) await page.keyboard.up("Shift");
  }
  await line([-30, 0, 0], [0, 0, 0], 1);
  await line([0, 0, 0], [30, 0, 0], 2);
  await pick([-15, 0, 0]);
  await pick([15, 0, 0], true);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.uiState.selection.length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Join Curves", exact: true }).click();
  await commitModel(page, 3);
  await line([-30, 25, 0], [0, 25, 0], 4);
  await line([0, 25, 0], [30, 25, 0], 5);
  await page.getByRole("button", { name: "Join Curves", exact: true }).click();
  await pick([-15, 25, 0]);
  await pick([15, 25, 0], true);
  await commitModel(page, 6);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("基準点 XYZ", { exact: true }).fill("[0,-25,0]");
  await page.getByLabel("幅 mm", { exact: true }).fill("20");
  await page.getByLabel("高さ mm", { exact: true }).fill("10");
  await commitModel(page, 7);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  let p = await at([30, 25, 0]);
  await page.mouse.move(p.x + 2, p.y + 1);
  await expect(page.locator("#modelStatus")).toContainText("端点にスナップ");
  await page.mouse.click(p.x + 2, p.y + 1);
  p = await at([0, -25, 0]);
  await page.mouse.move(p.x + 2, p.y + 1);
  await expect(page.locator("#modelStatus")).toContainText("中心にスナップ");
  await page.mouse.click(p.x + 2, p.y + 1);
  await commitModel(page, 8);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.features.at(-1).parameters,
    ),
  ).toMatchObject({ start: [30, 25, 0], end: [0, -25, 0] });
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page.locator("#modelCoordinate").fill("0,0,0");
  await page.locator("#modelCoordinate").press("Enter");
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Escape");
  await expect(page.locator(".model-history-entry")).toHaveCount(8);
});

test("P1 Difference keeps both target bodies, toggles tools, and survives Undo and reopen", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const { deriveVisibleEntities } = await import("/cad/document.js");
    const store = window.PathloomModel.store;
    async function add(id, params, inputs = {}) {
      const s = createCommandSession(commandById(id));
      Object.assign(s.parameters, params);
      s.inputs = inputs;
      if (!(await store.add(s))) throw new Error(JSON.stringify(s.diagnostics));
      return store.document.features.at(-1);
    }
    const a = await add("B01", {
        anchorMode: "corner",
        anchor: [0, 0, 0],
        widthMm: 10,
        depthMm: 10,
        heightMm: 10,
      }),
      b = await add("B01", {
        anchorMode: "corner",
        anchor: [20, 0, 0],
        widthMm: 10,
        depthMm: 10,
        heightMm: 10,
      }),
      tool = await add("B01", {
        anchorMode: "corner",
        anchor: [5, 0, 0],
        widthMm: 10,
        depthMm: 10,
        heightMm: 10,
      });
    const entities = [a, b, tool].map((f) =>
        store.getEntity(f.outputSlots[0].entityId),
      ),
      ref = (e) => ({ entityId: e.id }),
      cut = await add(
        "D02",
        { keepTools: true },
        { arguments: entities.slice(0, 2).map(ref), tools: [ref(entities[2])] },
      );
    const bodyIds = cut.outputSlots.map((s) => s.bodyId).sort(),
      volumes = cut.outputSlots
        .map((s) => store.getEntity(s.entityId).displayCache.volumeMm3)
        .sort((a, b) => a - b);
    const visible = () =>
      deriveVisibleEntities(store.document).some(
        (e) => e.id === entities[2].id,
      );
    const initial = visible();
    await store.edit(cut.id, { keepTools: false });
    const hidden = !visible();
    await store.edit(cut.id, { keepTools: true });
    const restored = visible();
    store.transactions.undo();
    await store.recompute();
    const undone = !visible();
    store.transactions.redo();
    await store.recompute();
    const redone = visible();
    return {
      bodyIds,
      expectedBodyIds: entities
        .slice(0, 2)
        .map((e) => e.bodyId)
        .sort(),
      volumes,
      initial,
      hidden,
      restored,
      undone,
      redone,
    };
  });
  expect(result.bodyIds).toEqual(result.expectedBodyIds);
  expect(result.volumes[0]).toBeCloseTo(500, 5);
  expect(result.volumes[1]).toBeCloseTo(1000, 5);
  expect(result).toMatchObject({
    initial: true,
    hidden: true,
    restored: true,
    undone: true,
    redone: true,
  });
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.features.length),
    )
    .toBe(4);
  await page.evaluate(() => {
    window.__previousCad = window.PathloomModel.store.document;
    document.querySelector("#projectOpen").click();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document !== window.__previousCad,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.features
        .at(-1)
        .outputSlots.map((s) => s.bodyId)
        .sort(),
    ),
  ).toEqual(result.bodyIds);
});

test("P1 Split preserves exact result references through recompute, explicit binding repair and Library insertion", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const { bindBody } = await import("/cad/generation-adapter.js");
    const { packageShapes } = await import("/cad/shape-library.js");
    const store = window.PathloomModel.store;
    async function add(id, params, inputs = {}) {
      const s = createCommandSession(commandById(id));
      Object.assign(s.parameters, params);
      s.inputs = inputs;
      if (!(await store.add(s))) throw new Error(JSON.stringify(s.diagnostics));
      return store.document.features.at(-1);
    }
    const box = await add("B01", { widthMm: 10, depthMm: 10, heightMm: 10 }),
      boxId = box.outputSlots[0].entityId;
    const binding = bindBody(store.document, store.getEntity(boxId));
    const plane = await add("S01", {
      plane: { origin: [5, 0, 0], xAxis: [0, 1, 0], yAxis: [0, 0, 1] },
      anchorMode: "corner",
      anchor: [5, -5, -5],
      widthMm: 20,
      heightMm: 20,
    });
    const split = await add(
      "D04",
      {},
      {
        targets: [{ entityId: boxId }],
        cutters: [{ entityId: plane.outputSlots[0].entityId }],
      },
    );
    const splitStatus = binding.status,
      ids = split.outputSlots.map((s) => s.entityId).sort();
    const move = await add(
      "transform.move",
      { translation: [0, 0, 1] },
      { object: [{ entityId: ids[0] }] },
    );
    split.lastValid = null;
    await store.edit(split.id, {});
    const retained =
      JSON.stringify(ids) ===
      JSON.stringify(split.outputSlots.map((s) => s.entityId).sort());
    store.rebindOutput(binding.id, move.outputSlots[0].entityId);
    const entry = packageShapes(
      await store.snapshot(),
      [move.outputSlots[0].entityId],
      { withHistory: true },
    );
    const inserted = await store.insertLibrary(entry);
    const insertedFeature = store.getFeature(
      store.getEntity(inserted[0]).producer.featureId,
    );
    const statuses = store.document.features.map((f) => f.status);
    const volumes = split.outputSlots.map(
      (s) => store.getEntity(s.entityId).displayCache.volumeMm3,
    );
    await store.edit(plane.id, {
      ...plane.parameters,
      plane: { ...plane.parameters.plane, origin: [15, 0, 0] },
      anchor: [15, -5, -5],
    });
    const changed = {
      count: split.outputSlots.length,
      move: move.status,
      binding: binding.status,
      oldIdsRemoved: ids.every((id) => !store.getEntity(id)),
      independent: insertedFeature.status,
    };
    await store.restore(await store.snapshot());
    const reopened = store.getFeature(move.id).status;
    await store.repair(move.id, "object", [
      { entityId: store.getFeature(split.id).outputSlots[0].entityId },
    ]);
    return {
      splitStatus,
      retained,
      bindingStatus: store.document.outputBindings.find(
        (b) => b.id === binding.id,
      ).status,
      moveStatus: store.getFeature(move.id).status,
      insertedStatus: insertedFeature.status,
      statuses,
      volumes,
      changed,
      reopened,
    };
  });
  expect(result.splitStatus).toBe("split");
  expect(result.retained).toBe(true);
  expect(result.moveStatus).toBe("valid");
  expect(result.bindingStatus).toBe("ready");
  expect(result.insertedStatus).toBe("valid");
  expect(result.statuses.every((s) => s === "valid")).toBe(true);
  result.volumes.forEach((v) => expect(v).toBeCloseTo(500, 4));
  expect(result.changed).toMatchObject({
    count: 1,
    move: "blocked",
    binding: "pending",
    oldIdsRemoved: true,
    independent: "valid",
  });
  expect(result.reopened).toBe("blocked");
});

test("P1 basic rectangle modes save exact 2-corner and free 3-point geometry", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("twoCorners");
  await page.getByLabel("作図点 1 XYZ").fill("[40,30,0]");
  await page.getByLabel("作図点 2 XYZ").fill("[10,10,0]");
  await commitModel(page, 1);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].bbox,
    ),
  ).toEqual({ min: [10, 10, 0], max: [40, 30, 0] });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByLabel("長方形の作図モード").selectOption("threePoints");
  for (const [i, p] of [
    [0, 0, -10],
    [10, 0, -10],
    [4, 0, 10],
  ].entries())
    await page.getByLabel(`作図点 ${i + 1} XYZ`).fill(JSON.stringify(p));
  await commitModel(page, 2);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities.at(-1).bbox,
    ),
  ).toEqual({ min: [0, 0, -10], max: [10, 0, 10] });
  await page.locator("#modelUndo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await page.locator("#modelRedo").click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.features.length),
    )
    .toBe(2);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.features.map((f) => f.command.mode),
    ),
  ).toEqual(["twoCorners", "threePoints"]);
  await page.locator("#modeModel").click();
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities.at(-1).bbox.min[2],
    ),
  ).toBe(-10);
});

test("P1 coordinate Polyline, Circle radius, Move XYZ and text shortcuts preserve the intended shape", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Polyline", exact: true }).click();
  for (const text of ["0,0,-5", "@10,0,2", "@0,10,0"]) {
    await page.locator("#modelCoordinate").fill(text);
    await page.locator("#modelCoordinate").press("Enter");
  }
  await page.locator("#modelCoordinate").blur();
  await page.keyboard.press("Backspace");
  await page.locator("#modelCoordinate").fill("@0,8,0");
  await page.locator("#modelCoordinate").press("Enter");
  await commitModel(page, 1);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.features[0].parameters.points,
    ),
  ).toEqual([
    [0, 0, -5],
    [10, 0, -3],
    [10, 8, -3],
  ]);
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  for (const text of ["-10,5,2", "@4,0,0"]) {
    await page.locator("#modelCoordinate").fill(text);
    await page.locator("#modelCoordinate").press("Enter");
  }
  await commitModel(page, 2);
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByLabel("移動 X mm", { exact: true }).fill("1cm");
  await page.getByLabel("移動 Z mm", { exact: true }).fill("-2");
  await page.getByLabel("移動 Y mm", { exact: true }).focus();
  await page.keyboard.press("Delete");
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await page.getByLabel("移動 Y mm", { exact: true }).fill("0");
  await commitModel(page, 3);
  const bbox = await page.evaluate(
    () => window.PathloomModel.store.document.entities.at(-1).bbox,
  );
  expect(bbox.min[0]).toBeCloseTo(-4);
  expect(bbox.max[0]).toBeCloseTo(4);
  expect(bbox.min[2]).toBeCloseTo(0);
});

test("P1 exact history updates connected toolpaths and G-code; failures keep independent graphs and recover", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await commitModel(page, 1);
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByLabel("蓋を作る", { exact: true }).check();
  await commitModel(page, 2);
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "Fillet Edges", exact: true }).click();
  const edge = await page
    .locator('[aria-label="CAD input edges"] option')
    .evaluateAll(
      (options) =>
        options.find((o) => o.textContent.includes("side/corner/11")).value,
    );
  await page.getByLabel("CAD input edges", { exact: true }).selectOption(edge);
  await commitModel(page, 3);
  await page.locator(".model-history-entry").last().click();
  await page
    .getByRole("button", { name: "結果のプロパティ・生成接続", exact: true })
    .click();
  await page
    .getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true })
    .click();
  await expect(page.locator("#cadStatus")).toContainText("layers");
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.outputBindings.length),
    )
    .toBe(1);
  await page.evaluate(async () => {
    const { geometryDefinition, appendComponent } = await import(
      "/cad-pipeline.js"
    );
    const { DEFAULT_DEFINITION } = await import("/cad-kernel.js");
    const { generateCad } = await import("/cad-kernel.js");
    const { connectGeometry, OUTPUT_NODE } = await import("/cad-graph.js");
    const p = structuredClone(window.__saved),
      owner = p.sources.find((s) => s.generator);
    const input = owner.generator.inputs.find((i) => i.cadBinding);
    const independent = structuredClone(owner);
    independent.id = "P1Independent";
    independent.label = "Independent";
    independent.generatorGroup = "P1Independent";
    independent.liveSource = "P1Independent";
    delete independent.generatorRef;
    independent.generator = geometryDefinition(DEFAULT_DEFINITION);
    independent.generator.inputs.find((i) => i.id === "layerHeight").value = 1;
    independent.paths = generateCad(independent.generator).paths;
    let d = geometryDefinition(DEFAULT_DEFINITION);
    d.inputs.push(input);
    d = appendComponent(d, "slice-step");
    d.steps.at(-1).params.layerHeight = 1;
    d = connectGeometry(d, d.steps.at(-1).id, OUTPUT_NODE);
    owner.generator = d;
    p.settings.printHeight = 1;
    p.sources.push(independent);
    p.instances.push([
      "P1Independent-1",
      { ...p.instances[0][1], source: independent.id, order: 2, x: 75, y: 0 },
    ]);
    await window.__cadStorage({ key: "project", content: JSON.stringify(p) });
  });
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator("#cadStatus")).toContainText("25 layers", {
    timeout: 20000,
  });
  await page.locator("#modeModel").click();
  await page.locator(".model-history-entry").first().click();
  await page.getByLabel("幅 mm", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await expect(page.locator("#cadStatus")).toContainText("25 layers", {
    timeout: 20000,
  });
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__saved?.cadDocument.features[0].parameters.widthMm,
      ),
    )
    .toBe(80);
  const width = await page.evaluate(() => {
    const s = window.__saved.sources.find((s) =>
      s.generator?.inputs.some((i) => i.cadBinding),
    );
    const xs = s.paths.flatMap((p) => p.points.map((v) => v[0]));
    return Math.max(...xs) - Math.min(...xs);
  });
  expect(width).toBeCloseTo(80, 3);
  expect(await page.evaluate(() => window.Pathloom.generateGcode())).toContain(
    "End of Pathloom output",
  );
  await page.getByLabel("幅 mm", { exact: true }).fill("-1");
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect(page.locator(".model-history-entry").first()).toContainText(
    "failed",
  );
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "blocked",
  );
  expect(
    await page.evaluate(() => {
      try {
        window.Pathloom.generateGcode();
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.features[0].status),
    )
    .toBe("failed");
  expect(
    await page.evaluate(
      () =>
        window.__saved.sources.find((s) => s.id === "P1Independent")
          .generationError || null,
    ),
  ).toBeNull();
  await page.getByLabel("幅 mm", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await expect(page.locator("#cadStatus")).toContainText("25 layers", {
    timeout: 20000,
  });
  expect(await page.evaluate(() => window.Pathloom.generateGcode())).toContain(
    "End of Pathloom output",
  );
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument.features[0].status),
    )
    .toBe("valid");
  const id = await page.evaluate(() => window.PathloomModel.store.document.id);
  await page.evaluate(async () => {
    const p = structuredClone(window.__saved);
    Object.values(p.cadDocument.assets)[0].data += "corrupt";
    await window.__cadStorage({ key: "project", content: JSON.stringify(p) });
  });
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator("#toast")).toContainText("CAD_ASSET_MISSING");
  expect(
    await page.evaluate(() => window.PathloomModel.store.document.id),
  ).toBe(id);
});
test("A01/A03/T01: real center rectangle, dimension edit, Undo, portable save and reopen", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "基準点 XYZ", exact: true })
    .fill("[10,20,0]");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  await page.locator(".model-history-entry").click();
  await page.getByRole("textbox", { name: "幅 mm", exact: true }).fill("80");
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0]?.bbox.max[0],
      ),
    )
    .toBe(50);
  await page.locator("#modelUndo").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0]?.bbox.max[0],
      ),
    )
    .toBe(40);
  await page.locator("#modelRedo").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0]?.bbox.max[0],
      ),
    )
    .toBe(50);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saved?.version)).toBe(2);
  expect(
    await page.evaluate(() =>
      Object.values(window.__saved.cadDocument.assets).every((a) =>
        a.data.includes("CASCADE"),
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  for (const mode of [
    "modeGenerate",
    "modeParameters",
    "modeOutput",
    "modeModel",
  ])
    await page.locator("#" + mode).click();
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].bbox.max[0],
    ),
  ).toBe(50);
  expect(errors).toEqual([]);
});
test("A13/A14: free 3D curve below Z zero becomes an open exact surface", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await page
    .getByRole("textbox", { name: "始点 XYZ", exact: true })
    .fill("[0,0,-10]");
  await page
    .getByRole("textbox", { name: "終点 XYZ", exact: true })
    .fill("[20,5,-3]");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  await page.locator(".model-history-entry").click();
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  expect(
    await page.evaluate(
      () =>
        window.PathloomModel.store.document.entities.at(-1).closure
          .enclosesVolume,
    ),
  ).toBe(false);
});
test("A05/A07/A08/A24: sketch width drives exact solid and fillet; a lost edge requires repair", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await page.locator(".model-history-entry").first().click();
  await page
    .getByRole("button", { name: "拘束付きスケッチとして編集", exact: true })
    .click();
  await expect(page.locator("#modelProperties")).toContainText("自由度 0");
  await page
    .getByRole("spinbutton", { name: "スケッチ 幅", exact: true })
    .fill("80");
  await page
    .getByRole("spinbutton", { name: "スケッチ 幅", exact: true })
    .dispatchEvent("change");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0].bbox.max[0],
      ),
    )
    .toBeCloseTo(40, 5);
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByRole("checkbox", { name: "蓋を作る", exact: true }).check();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.PathloomModel.store.document.entities.at(-1).displayCache
            .volumeMm3,
      ),
    )
    .toBeCloseTo(80000, 4);
  await page.locator(".model-history-entry").last().click();
  await page
    .getByRole("button", { name: "結果のプロパティ・生成接続", exact: true })
    .click();
  await page
    .getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.outputBindings.length,
      ),
    )
    .toBe(1);
  await expect(page.locator("#modelStatus")).toContainText("接続しました");
  await page.screenshot({ path: "work/cad-implementation/cad-workspace.png" });
});
test("A07/T11/T12: semantic edge follows width change and disappears without silent substitution", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await page.locator(".model-history-entry").first().click();
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByRole("checkbox", { name: "蓋を作る", exact: true }).check();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "Fillet Edges", exact: true }).click();
  const options = await page
    .getByLabel("CAD input edges", { exact: true })
    .locator("option")
    .allTextContents();
  const label = options.find((t) => t.includes("side/corner/11"));
  expect(label).toBeTruthy();
  await page
    .getByLabel("CAD input edges", { exact: true })
    .selectOption({ label });
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await page.locator(".model-history-entry").first().click();
  await page.getByRole("textbox", { name: "幅 mm", exact: true }).fill("80");
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await page.getByRole("checkbox", { name: "角丸", exact: true }).check();
  await page
    .getByRole("textbox", { name: "角丸半径 mm", exact: true })
    .fill("3");
  await page
    .getByRole("button", { name: "設定変更を確定", exact: true })
    .click();
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "failed",
  );
  await page.locator(".model-history-entry").last().click();
  await expect(page.locator("#modelDiagnostics")).toContainText(
    "CAD_REFERENCE_MISSING",
  );
  await expect(page.locator("#modelDiagnostics")).toContainText("選び直す");
  expect(
    await page.evaluate(
      () =>
        window.PathloomModel.store.document.features.at(-1).lastValid !== null,
    ),
  ).toBe(true);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect
    .poll(() =>
      page.evaluate(() => window.__saved?.cadDocument?.features.at(-1).status),
    )
    .toBe("failed");
  const replacement = await page.evaluate(() => {
    const d = window.PathloomModel.store.document,
      e = d.entities.find((e) => e.producer.featureId === d.features[1].id),
      t = e.displayCache.topology.find(
        (t) =>
          t.kind === "edge" &&
          Math.abs(t.fingerprint.bbox.max[2] - t.fingerprint.bbox.min[2]) <
            1e-5 &&
          t.fingerprint.lengthMm > 30,
      );
    return [
      ...document.querySelectorAll('[aria-label="CAD input edges"] option'),
    ].find((o) => JSON.parse(o.value).topologyId === t.topologyId).value;
  });
  await page
    .getByLabel("CAD input edges", { exact: true })
    .selectOption(replacement);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
});

test("A19/A20/R08: history Library inserts independent shapes and recovery restores real assets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  await page.locator(".model-history-entry").click();
  await page.getByText("形状Library", { exact: true }).click();
  await page
    .getByRole("button", { name: "選択形状を保存", exact: true })
    .click();
  await page
    .getByRole("button", { name: "挿入 · CAD shape", exact: true })
    .click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  expect(
    await page.evaluate(
      () =>
        new Set(window.PathloomModel.store.document.entities.map((e) => e.id))
          .size,
    ),
  ).toBe(2);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          JSON.parse(await window.__cadStorage({ key: "recovery" }))?.features
            .length,
      ),
    )
    .toBe(2);
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.locator("#modeModel").click();
  await page.getByRole("button", { name: "CADを回復", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.entities.every(
        (e) => e.displayCache?.valid,
      ),
    ),
  ).toBe(true);
  await expect(page.locator("#modelCommit")).toBeInViewport();
  await expect(page.locator("#modelHistory")).toBeInViewport();
});

test("A04/R06: work-order command definition creates real geometry and persists without AI", async ({
  page,
}) => {
  const definition = {
    format: "pathloom-command",
    schemaVersion: 1,
    id: "user.rectangle.center",
    version: 1,
    displayName: "Custom Center Rectangle",
    aliases: ["独自矩形"],
    category: "curve.create",
    baseOperation: { id: "curve.rectangle", version: 1 },
    mode: "center",
    inputs: [
      { key: "plane", kind: "plane", default: "activeWorkPlane" },
      { key: "center", kind: "point", minCount: 1, maxCount: 1 },
      { key: "corner", kind: "point", minCount: 1, maxCount: 1 },
    ],
    settings: {
      rounded: { type: "boolean", default: false },
      radius: { type: "length", default: 1 },
    },
    adapter: "rectangle.center.v1",
    resultPolicy: "copy",
  };
  await page.getByText("コマンドを追加", { exact: true }).click();
  await page
    .locator("#modelCommandDefinition")
    .fill(JSON.stringify(definition));
  await page
    .getByRole("button", { name: "定義を検証して追加", exact: true })
    .click();
  await expect(page.locator("#modelStatus")).toContainText("登録・保存");
  await page
    .getByRole("button", { name: "Custom Center Rectangle", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "CAD point center", exact: true })
    .fill("10,20,0");
  await page
    .getByRole("textbox", { name: "CAD point center", exact: true })
    .dispatchEvent("change");
  await page
    .getByRole("textbox", { name: "CAD point corner", exact: true })
    .fill("40,40,0");
  await page
    .getByRole("textbox", { name: "CAD point corner", exact: true })
    .dispatchEvent("change");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].bbox,
    ),
  ).toEqual({ min: [-20, 0, 0], max: [40, 40, 0] });
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saved?.version)).toBe(2);
  await page.evaluate(() =>
    window.__cadStorage({ key: "commands", content: "[]" }),
  );
  await page.evaluate(() =>
    window.__cadStorage({ key: "recovery", discard: true }),
  );
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  await expect(
    page.getByRole("button", { name: "Custom Center Rectangle", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.entities[0].bbox.max[0],
    ),
  ).toBe(40);
});
test("A11/T07: Join gap remains until the user explicitly changes tolerance", async ({
  page,
}) => {
  for (const [start, end] of [
    [
      [0, 0, 0],
      [10, 0, 0],
    ],
    [
      [10.08, 0, 0],
      [20, 5, 0],
    ],
  ]) {
    await page.getByRole("button", { name: "Line", exact: true }).click();
    await page
      .getByRole("textbox", { name: "始点 XYZ", exact: true })
      .fill(JSON.stringify(start));
    await page
      .getByRole("textbox", { name: "終点 XYZ", exact: true })
      .fill(JSON.stringify(end));
    await page.getByRole("button", { name: "確定", exact: true }).click();
    await expect(page.locator("#modelSession")).toContainText("待機中");
  }
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await page.getByRole("button", { name: "Join Curves", exact: true }).click();
  const refs = await page
    .getByLabel("CAD input objects", { exact: true })
    .locator("option")
    .evaluateAll((options) => options.map((o) => o.value));
  await page
    .getByLabel("CAD input objects", { exact: true })
    .selectOption(refs);
  await page.getByRole("button", { name: "プレビュー", exact: true }).click();
  await expect(page.locator("#modelDiagnostics")).toContainText("CAD_JOIN_GAP");
  await expect(
    page.getByRole("textbox", { name: "Join許容差 mm", exact: true }),
  ).toHaveValue("0.01");
  await page
    .getByRole("textbox", { name: "Join許容差 mm", exact: true })
    .fill("0.1");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  expect(
    await page.evaluate(
      () =>
        window.PathloomModel.store.document.features.at(-1).toleranceOverrides
          .joinLinearMm,
    ),
  ).toBe(0.1);
  expect(
    await page.evaluate(
      () =>
        window.PathloomModel.store.document.entities.at(-1).closure.curveClosed,
    ),
  ).toBe(false);
});
