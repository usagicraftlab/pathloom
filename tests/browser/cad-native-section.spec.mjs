import { test, expect } from "./fixtures/cad.mjs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

async function commit(page, count) {
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(count);
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
}

async function save(page) {
  await page.evaluate(() => {
    window.__sectionPriorSave = window.__saved;
    document.querySelector("#projectSave").click();
  });
  await expect.poll(() => page.evaluate(() => window.__saved !== window.__sectionPriorSave)).toBe(true);
}

test("#34: the same rounded Rectangle bottom edge reaches exact sections and G-code", async ({ page }) => {
  // Only the OS transport is substituted. Every section is produced by the
  // shipped OCCT bridge; generation, output validation and G-code run in-app.
  const slices = new Map();
  await page.exposeBinding("__sectionSlice", async (_, args) => {
    if (args.cancel) { slices.get(args.requestId)?.child.kill(); return; }
    return new Promise((resolveResult, reject) => {
      const child = spawn(process.env.PATHLOOM_BREP_PYTHON || resolve(".pathloom-runtime/python/bin/python"), ["native/occt_brep_bridge.py"]);
      const task = { child, exited: new Promise((resolveExit) => child.once("close", resolveExit)) };
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
  await page.evaluate(() => {
    const invoke = window.__TAURI__.core.invoke;
    window.__TAURI__.core.invoke = (name, args = {}) => {
      if (name === "slice_step_brep") return window.__sectionSlice(args);
      if (name === "cancel_cad_request") return window.__sectionSlice({ ...args, cancel: true });
      return invoke(name, args);
    };
  });

  try {
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.getByRole("textbox", { name: "幅 mm", exact: true }).fill("70");
    await page.getByRole("checkbox", { name: "角丸", exact: true }).check();
    await page.getByRole("textbox", { name: "角丸半径 mm", exact: true }).fill("3");
    await commit(page, 1);
    await page.locator(".model-history-entry").last().click();
    await page.getByRole("button", { name: "Extrude", exact: true }).click();
    await page.getByRole("checkbox", { name: "蓋を作る", exact: true }).check();
    await commit(page, 2);
    await page.locator(".model-history-entry").last().click();
    await page.getByRole("button", { name: "Fillet Edges", exact: true }).click();
    const selected = await page.evaluate(() => {
      const store = window.PathloomModel.store, feature = store.document.features[1];
      const entity = store.getEntity(feature.outputSlots[0].entityId);
      const edge = entity.displayCache.topology.find((t) => t.kind === "edge"
        && Math.abs(t.fingerprint.bbox.max[2] - t.fingerprint.bbox.min[2]) < 1e-5
        && t.fingerprint.lengthMm > 30);
      const option = [...document.querySelectorAll('[aria-label="CAD input edges"] option')].find((option) => {
        const ref = JSON.parse(option.value);
        return ref.entityId === entity.id && ref.topologyId === edge.topologyId;
      });
      return { value: option.value, fingerprint: edge.fingerprint };
    });
    expect(selected.fingerprint.lengthMm).toBe(64);
    expect(selected.fingerprint.bbox).toEqual({ min: [-32, -20, 0], max: [32, -20, 0] });
    await page.getByLabel("CAD input edges", { exact: true }).selectOption(selected.value);
    await commit(page, 3);
    await page.locator(".model-history-entry").last().click();
    await page.getByRole("button", { name: "結果のプロパティ・生成接続", exact: true }).click();
    await page.getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true }).click();
    await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
    await save(page);
    // A normal v2 project seeds only graph wiring, without replacing any
    // geometry, native response, generated path or output validator.
    const assetHash = await page.evaluate(async () => {
      const store = window.PathloomModel.store, binding = store.document.outputBindings[0];
      const entity = store.getEntity(binding.resolvedEntityId);
      const { generationInput } = await import("/cad/generation-adapter.js");
      const input = generationInput(binding, entity, store.document.assets[entity.geometry.assetHash]);
      const project = window.__saved, source = project.sources.find((s) => s.generator);
      source.generator = {
        version: 2, id: "pipeline", name: "Native section regression", inputs: [input],
        steps: [
          { id: "slice", operation: "slice-step", version: 1, source: `input:${input.id}`, params: { layerHeight: .6, tolerance: .02 } },
          { id: "paths", operation: "build-toolpath", version: 1, source: "slice", params: { seam: 0, reverse: false, nearest: false } },
        ], output: "paths",
      };
      project.sources = [source];
      project.instances = project.instances.filter(([, instance]) => instance.source === source.id);
      project.cad = { ...project.cad, sourceId: source.id, selectedInputId: input.id, previewStepId: null, mode: "model" };
      const { validateProject } = await import("/pathloom-project.js");
      validateProject(project);
      await window.__cadStorage({ key: "project", content: JSON.stringify(project) });
      return entity.geometry.assetHash;
    });
    expect(assetHash).toBe("3a68ff555efce4f349936b1a378c10d0129f600834cea730c659249c31a98ea5");
    await page.evaluate(() => document.querySelector("#projectOpen").click());
    await expect(page.locator("#cadName")).toHaveValue("Native section regression");
    await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
    const code = await page.evaluate(() => window.Pathloom.generateGcode());
    expect(code).toContain("End of Pathloom output");
    const printedLayers = [...new Set([...code.matchAll(/^G1 X[-\d.]+ Y[-\d.]+ Z(-?[\d.]+) E/gm)].map((match) => Number(match[1])))];
    expect(printedLayers).toEqual(Array.from({ length: 42 }, (_, i) => Number(((i + 1) * .6).toFixed(3))));
    await save(page);
    const paths = await page.evaluate(() => window.__saved.sources[0].paths);
    expect(paths).toHaveLength(42);
    expect(paths.every((path) => JSON.stringify(path.points[0]) === JSON.stringify(path.points.at(-1)))).toBe(true);
    await test.info().attach("native-section-result", { body: JSON.stringify({ assetHash, edge: selected.fingerprint, paths: paths.length, gcode: true }), contentType: "application/json" });
  } finally {
    const active = [...slices.values()];
    for (const task of active) task.child.kill();
    await Promise.all(active.map((task) => task.exited));
  }
});
