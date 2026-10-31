import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

function rectangleCommand(id = "user.rectangle.center", displayName = "Custom Center Rectangle") {
  return {
    format: "pathloom-command",
    schemaVersion: 1,
    id,
    version: 1,
    displayName,
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
}

// Real OCCT daemon behind browser IPC. Only the OS-specific Tauri transport is substituted.
let daemon,
  queue = [],
  serial = 0;
test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
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
          if (name === "cad_command_library") {
            if (args.content === undefined && window.__failCommandLoad)
              throw new Error("test command storage unavailable");
            if (args.content !== undefined && window.__failCommandSave)
              throw new Error("test command storage denied");
            const result = await window.__cadStorage({ key: "commands", ...args });
            if (args.content === undefined && location.search.includes("defer-command-load"))
              await window.__commandLoadGate();
            return result;
          }
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
test.afterEach(() => {
  daemon?.kill();
  queue = [];
});

test("AUD-003: D04 exact rerun, changed/count split, v2 reopen and explicit reference/binding repair", async ({
  page,
}) => {
  await expect
    .poll(() => page.evaluate(() => !!window.Pathloom.viewState().position))
    .toBe(true);
  const setup = await page.evaluate(async () => {
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const store = window.PathloomModel.store;
    async function add(command, parameters) {
      const session = createCommandSession(commandById(command));
      Object.assign(session.parameters, parameters);
      if (!(await store.add(session)))
        throw new Error(JSON.stringify(session.diagnostics));
      return store.document.features.at(-1);
    }
    const box = await add("B01", { widthMm: 10, depthMm: 10, heightMm: 10 });
    const points = (x) => [
      [x, -10, -10],
      [x, 20, -10],
      [x, 20, 20],
      [x, -10, 20],
    ];
    const cutter = await add("S02", { points: points(5) });
    const second = await add("S02", { points: points(5) });
    return {
      box: box.outputSlots[0].entityId,
      cutter: cutter.outputSlots[0].entityId,
      cutterFeature: cutter.id,
      second: second.outputSlots[0].entityId,
    };
  });
  await page.getByRole("button", { name: "Split Body", exact: true }).click();
  await page
    .getByRole("listbox", { name: "CAD input targets", exact: true })
    .selectOption({
      value: JSON.stringify({ entityId: setup.box, role: "targets" }),
    });
  await page
    .getByRole("listbox", { name: "CAD input cutters", exact: true })
    .selectOption({
      value: JSON.stringify({ entityId: setup.cutter, role: "cutters" }),
    });
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  await expect(page.locator("#modelStatus")).toContainText(
    "形状を確定しました",
  );
  const initial = await page.evaluate(async () => {
    const store = window.PathloomModel.store;
    const split = store.document.features.at(-1);
    const slots = structuredClone(split.outputSlots);
    const { bindBody } = await import("/cad/generation-adapter.js");
    const binding = bindBody(
      store.document,
      store.getEntity(slots[1].entityId),
    );
    const { commandById } = await import("/cad/commands/registry.js");
    const { createCommandSession } = await import("/cad/commands/session.js");
    const section = createCommandSession(commandById("E14"));
    section.inputs.objects = [{ entityId: slots[1].entityId }];
    section.parameters.plane.origin = [0, 0, 5];
    if (!(await store.add(section)))
      throw new Error(JSON.stringify(section.diagnostics));
    const dependent = store.document.features.at(-1);
    const { markDirty } = await import("/cad/history.js");
    split.lastValid.resultHash = "force-kernel-rerun";
    markDirty(store.document, [split.id]);
    await store.recompute();
    return {
      slots,
      after: split.outputSlots,
      split: split.id,
      dependent: dependent.id,
      dependentStatus: dependent.status,
      binding: structuredClone(binding),
      volumes: split.outputSlots.map(
        (slot) => store.getEntity(slot.entityId).displayCache.volumeMm3,
      ),
    };
  });
  expect(initial.after).toEqual(initial.slots);
  expect(initial.volumes).toHaveLength(2);
  for (const volume of initial.volumes) expect(volume).toBeCloseTo(500, 6);
  expect(initial.dependentStatus).toBe("valid");
  expect(initial.binding.status).toBe("ready");
  await page.evaluate(async ({ cutterFeature }) => {
    const store = window.PathloomModel.store;
    await store.edit(cutterFeature, {
      points: [
        [7, -10, -10],
        [7, 20, -10],
        [7, 20, 20],
        [7, -10, 20],
      ],
    });
  }, setup);
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "blocked",
  );
  expect(
    await page.evaluate(() => {
      const b = window.PathloomModel.store.document.outputBindings[0];
      return {
        status: b.status,
        entity: b.resolvedEntityId,
        candidates: b.candidateBodyIds.length,
      };
    }),
  ).toEqual({ status: "split", entity: null, candidates: 2 });
  await expect(page.locator("#cadStatus")).toContainText("layers");
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saved?.version)).toBe(2);
  expect(
    await page.evaluate(() => window.__saved.cadDocument.draftSessions),
  ).toEqual([]);
  // Autosave can prompt after reload. Make it deterministic, then explicitly
  // discard recovery before opening the saved project; recovery races are #10.
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
  await expect
    .poll(() =>
      page.evaluate(() => window.PathloomModel.store.document.features.length),
    )
    .toBe(5);
  expect(
    await page.evaluate(
      () => window.PathloomModel.store.document.outputBindings[0].status,
    ),
  ).toBe("split");
  const three = await page.evaluate(
    async ({ setup, initial }) => {
      const store = window.PathloomModel.store;
      const split = store.getFeature(initial.split);
      const before = structuredClone(split.outputSlots);
      await store.repair(split.id, "cutters", [
        { entityId: setup.cutter },
        { entityId: setup.second },
      ]);
      return {
        slots: split.outputSlots,
        common: split.outputSlots.filter((s) =>
          before.some((b) => b.entityId === s.entityId),
        ).length,
        inconsistent: split.outputSlots.filter((s) =>
          before.some(
            (b) =>
              (b.entityId === s.entityId || b.bodyId === s.bodyId) &&
              b.key !== s.key,
          ),
        ),
        dependentStatus: store.getFeature(initial.dependent).status,
      };
    },
    { setup, initial },
  );
  expect(three.slots).toHaveLength(3);
  // Reading B-rep assets can change OCCT serialization of a later boolean.
  // Such results may remain blocked; exact identity is the only safe reuse.
  expect(three.common).toBeLessThanOrEqual(1);
  expect(three.inconsistent).toEqual([]);
  expect(three.dependentStatus).toBe("blocked");
  await page.locator(".model-history-entry").last().click();
  await page
    .getByRole("listbox", { name: "CAD input objects", exact: true })
    .selectOption({
      value: JSON.stringify({
        entityId: three.slots[0].entityId,
        role: "objects",
      }),
    });
  await expect(page.locator(".model-history-entry").last()).toContainText(
    "valid",
  );
  // Restore the saved selection through the same workspace restore path used by Open.
  await page.evaluate(async (entityId) => {
    const workspace = window.PathloomModel;
    const doc = await workspace.snapshot();
    doc.uiState.selection = [{ entityId }];
    workspace.restorePrepared(await workspace.prepareRestore(doc));
  }, three.slots[0].entityId);
  await page.locator('#modelOutliner .model-outline-select[aria-selected="true"]').click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: `「${initial.binding.name}」の生成参照をこの形状へ変更`,
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(() => {
      const binding = window.PathloomModel.store.document.outputBindings[0];
      return {
        id: binding.id,
        status: binding.status,
        entity: binding.resolvedEntityId,
      };
    }),
  ).toEqual({
    id: initial.binding.id,
    status: "ready",
    entity: three.slots[0].entityId,
  });
  const library = await page.evaluate(async (entityId) => {
    const store = window.PathloomModel.store;
    const { packageShapes } = await import("/cad/shape-library.js");
    const entry = packageShapes(store.document, [entityId]);
    const originalHash = store.getEntity(entityId).geometry.assetHash;
    const ids = [];
    for (let i = 0; i < 2; i++) ids.push(...(await store.insertLibrary(entry)));
    return {
      ids,
      retained: ids.every((id) => !!store.getEntity(id)),
      exact: ids.every(
        (id) => store.getEntity(id)?.geometry.assetHash === originalHash,
      ),
      bindingStatus: store.document.outputBindings[0].status,
    };
  }, three.slots[0].entityId);
  expect(new Set(library.ids).size).toBe(2);
  expect(library.retained).toBe(true);
  expect(library.exact).toBe(true);
  expect(library.bindingStatus).toBe("ready");
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
  await page.keyboard.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.PathloomModel.store.document.entities[0]?.bbox.max[0],
      ),
    )
    .toBe(40);
  await page.keyboard.press("Control+Shift+z");
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
  await page.locator('#modelOutliner .model-outline-select[aria-selected="true"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "生成で使用", exact: true }).click();
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
  // Preserve the baseline OCCT tangent contour through the explicit v2 choice.
  await page.locator('[data-parameter="chainPolicy"]').selectOption("tangent");
  await page.locator('[data-parameter="chainPolicy"]').dispatchEvent("input");
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
  await page.locator('#modelOutliner .model-outline-select[aria-selected="true"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "形状 Library に登録 / Library を開く", exact: true }).click();
  await page.getByLabel("保存名", { exact: true }).fill("CAD shape");
  await page
    .getByRole("button", { name: "選択形状を保存", exact: true })
    .click();
  await page.getByLabel("挿入位置 XYZ mm", { exact: true }).fill("10,0,0");
  await page
    .getByRole("button", { name: "挿入 · CAD shape", exact: true })
    .click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  const placed = await page.evaluate(() => {
    const store = window.PathloomModel.store,
      feature = store.document.features.at(-1),
      entity = store.getEntity(feature.outputSlots[0].entityId),
      ids = [
        ...store.document.features.map((item) => item.id),
        ...store.document.entities.map((item) => item.id),
        ...store.document.bodies.map((item) => item.id),
      ];
    return {
      operation: feature.operation.id,
      parameters: feature.parameters,
      bbox: entity.bbox,
      allIdsUnique: new Set(ids).size === ids.length,
    };
  });
  expect(placed.operation).toBe("shape.transform");
  expect(placed.parameters).toEqual({ mode: "move", translation: [10, 0, 0] });
  expect(placed.bbox.min[0]).toBeCloseTo(-20, 6);
  expect(placed.bbox.max[0]).toBeCloseTo(40, 6);
  expect(placed.allIdsUnique).toBe(true);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          JSON.parse(await window.__cadStorage({ key: "recovery" }))?.features
            .length,
      ),
    )
    .toBe(3);
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.locator("#modeModel").click();
  await page.getByRole("button", { name: "CADを回復", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  expect(
    await page.evaluate(() =>
      window.PathloomModel.store.document.entities.every(
        (e) => e.displayCache?.valid,
      ),
    ),
  ).toBe(true);
  await expect(page.locator(".model-right")).toBeHidden();
  await expect(page.locator("#modelHistory")).toBeInViewport();
});

test("Issue15 Rotate Scale Mirror commit exact B-rep history through the workspace", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(1);
  await page.locator(".model-history-entry").last().click();

  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page
    .getByLabel("軸（原点・方向）", { exact: true })
    .fill(JSON.stringify({ origin: [0, 0, 0], direction: [0, 0, 1] }));
  await page.getByLabel("角度 rad", { exact: true }).fill("90deg");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(2);
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
  await page.locator(".model-history-entry").last().click();

  await page.getByRole("button", { name: "Scale", exact: true }).click();
  await page.getByLabel("中心 XYZ", { exact: true }).fill("[0,0,0]");
  await page.getByLabel("倍率", { exact: true }).fill("2");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(3);
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
  await page.locator(".model-history-entry").last().click();

  await page.getByRole("button", { name: "Mirror", exact: true }).click();
  await page
    .getByLabel("作業平面", { exact: true })
    .last()
    .fill(JSON.stringify({
      origin: [0, 0, 0],
      xAxis: [1, 0, 0],
      yAxis: [0, 1, 0],
    }));
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(4);
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
  const result = await page.evaluate(() => {
    const store = window.PathloomModel.store,
      feature = store.document.features.at(-1),
      entity = store.getEntity(feature.outputSlots[0].entityId);
    return {
      operations: store.document.features.map((item) => item.parameters.mode),
      bbox: entity.bbox,
      volume: entity.displayCache.volumeMm3,
      asset: entity.geometry.assetHash,
      sourceAsset: store.document.entities.at(-2).geometry.assetHash,
    };
  });
  expect(result.operations.slice(1)).toEqual(["rotate", "scale", "mirror"]);
  expect(result.volume).toBeCloseTo(192000, 5);
  expect(result.bbox.max[2]).toBeCloseTo(0, 6);
  expect(result.bbox.min[2]).toBeCloseTo(-40, 6);
  expect(result.asset).not.toBe(result.sourceAsset);
});

test("A04/R06: work-order command definition creates real geometry and persists without AI", async ({
  page,
}) => {
  const definition = rectangleCommand();
  // JSON registration was removed by the UI review. Existing shared command
  // files and project-contained definitions remain supported.
  await page.evaluate((definition) => window.__cadStorage({
    key: "commands", content: JSON.stringify([definition]),
  }), definition);
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.locator("#modeModel").click();
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
    await expect(page.locator(".model-history-entry").last()).toContainText("valid");
    await expect(page.locator(".model-right")).toBeHidden();
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
  // v2 also permits independent groups. This fixture explicitly requires a
  // single chain so that its original gap/tolerance acceptance stays intact.
  const groups=page.getByRole('checkbox',{name:'離れた連結グループも全て保持',exact:true});
  await expect(groups).toBeChecked();await groups.uncheck();await groups.dispatchEvent('input');
  await page.locator("#modelPreview").evaluate((button) => button.click());
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


test("#11: delayed shared commands load through the registry without a JSON registration UI", async ({ page }) => {
  const definition = rectangleCommand("user.rectangle.deferred", "Deferred Rectangle");
  await page.evaluate((definition) => window.__cadStorage({
    key: "commands", content: JSON.stringify([definition]),
  }), definition);
  let release;
  await page.exposeBinding("__commandLoadGate", () => new Promise(resolve => { release = resolve; }));
  await page.goto("/?defer-command-load");
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.locator("#modeModel").click();
  await expect.poll(() => typeof release).toBe("function");
  try {
    await expect(page.locator("#modelCommandDefinition")).toHaveCount(0);
    await expect(page.getByRole("button", { name: definition.displayName, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.PathloomModel.store.document.commandDefinitions.map(d => d.id))).not.toContain(definition.id);
    release();
    await expect.poll(() => page.evaluate(async () => JSON.parse(await window.__cadStorage({ key: "commands" })).map(d => d.id))).toContain(definition.id);
    await expect(page.getByRole("button", { name: definition.displayName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: definition.displayName, exact: true }).click();
    await page.getByRole("textbox", { name: "CAD point center", exact: true }).fill("10,20,0");
    await page.getByRole("textbox", { name: "CAD point center", exact: true }).dispatchEvent("change");
    await page.getByRole("textbox", { name: "CAD point corner", exact: true }).fill("40,40,0");
    await page.getByRole("textbox", { name: "CAD point corner", exact: true }).dispatchEvent("change");
    await page.getByRole("button", { name: "確定", exact: true }).click();
    await expect(page.locator(".model-history-entry")).toContainText("valid");
    expect(await page.evaluate(() => window.PathloomModel.store.document.commandDefinitions.map(d => d.id))).toContain(definition.id);
  } finally { release?.(); }
});

test("#11: project command definitions reopen when the shared command file is unavailable", async ({ page }) => {
  const definition = rectangleCommand("user.rectangle.storage-failure", "Unsaved Shared Rectangle");
  await page.evaluate(async (definition) => {
    const { registerCommand } = await import("/cad/commands/registry.js");
    await window.PathloomModel.begin(registerCommand(definition));
  }, definition);
  await page.getByRole("textbox", { name: "CAD point center", exact: true }).fill("10,20,0");
  await page.getByRole("textbox", { name: "CAD point center", exact: true }).dispatchEvent("change");
  await page.getByRole("textbox", { name: "CAD point corner", exact: true }).fill("40,40,0");
  await page.getByRole("textbox", { name: "CAD point corner", exact: true }).dispatchEvent("change");
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saved?.cadDocument?.commandDefinitions?.map(d => d.id) || [])).toContain(definition.id);
  await page.evaluate(() => window.__cadStorage({ key: "recovery", discard: true }));
  await page.addInitScript(() => { window.__failCommandLoad = true; });
  await page.reload();
  await page.waitForFunction(() => window.PathloomModel && window.PathloomCad);
  await page.locator("#modeModel").click();
  await expect(page.locator("#modelStatus")).toContainText("追加コマンドを読み込めません");
  await page.locator("#projectOpen").evaluate((button) => button.click());
  await expect(page.locator(".model-history-entry")).toContainText("valid");
  expect(await page.evaluate(() => window.PathloomModel.store.document.entities[0].bbox)).toEqual({ min: [-20,0,0], max: [40,40,0] });
  expect(await page.evaluate(() => window.PathloomModel.store.document.commandDefinitions.map(d => d.id))).toContain(definition.id);
  expect(await page.evaluate(async () => JSON.parse(await window.__cadStorage({ key: "commands" })).map(d => d.id))).not.toContain(definition.id);
});
