import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
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
test.afterEach(() => {
  daemon?.kill();
  queue = [];
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
