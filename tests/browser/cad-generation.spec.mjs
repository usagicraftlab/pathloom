import { test, expect } from "./fixtures/cad.mjs";

async function commit(page, count) {
  await page.getByRole("button", { name: "確定", exact: true }).click();
  await expect(page.locator(".model-history-entry")).toHaveCount(count);
  await expect(page.locator(".model-history-entry").last()).toContainText("valid");
}

async function save(page) {
  const before = await page.evaluate(() => window.__saveCount);
  await page.evaluate(() => document.querySelector("#projectSave").click());
  await expect.poll(() => page.evaluate(() => window.__saveCount)).toBeGreaterThan(before);
}

async function state(page) {
  await save(page);
  return page.evaluate(async () => {
    const project = window.__saved;
    return {
      active: window.PathloomCad.snapshot().sourceId,
      sources: await Promise.all(project.sources.map(async (source) => {
        const graph = source.generator || project.sources.find((s) => s.id === source.generatorRef)?.generator;
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(source.paths)));
        let min = Infinity, max = -Infinity;
        for (const path of source.paths) for (const point of path.points) {
          min = Math.min(min, point[0]); max = Math.max(max, point[0]);
        }
        return {
          id: source.id, group: source.generatorGroup, error: source.generationError || null,
          width: max - min,
          paths: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join(""),
          inputs: graph?.inputs.map((input) => input.id),
          bindings: graph?.inputs.filter((input) => input.cadBinding).map((input) => input.cadBinding),
        };
      })),
    };
  });
}

async function drawing(page, multiple = false) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await commit(page, 1);
  await page.locator(".model-history-entry").first().click();
  await page.getByRole("button", { name: "Extrude", exact: true }).click();
  await page.getByRole("checkbox", { name: "蓋を作る", exact: true }).check();
  await commit(page, 2);
  expect(await page.evaluate(() => window.PathloomModel.store.document.entities.at(-1).displayCache.volumeMm3)).toBeCloseTo(60000, 4);
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "Fillet Edges", exact: true }).click();
  const edge = (await page.getByLabel("CAD input edges", { exact: true }).locator("option").allTextContents()).find((label) => label.includes("side/corner/11"));
  expect(edge).toBeTruthy();
  await page.getByLabel("CAD input edges", { exact: true }).selectOption({ label: edge });
  await commit(page, 3);
  await page.locator(".model-history-entry").last().click();
  await page.getByRole("button", { name: "結果のプロパティ・生成接続", exact: true }).click();
  await page.getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true }).click();
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  await save(page);
  // A normal v2 project fixture seeds only the generation wiring. All CAD
  // operations, exact sections, generation and G-code still run in the app.
  const ids = await page.evaluate(async (multiple) => {
    const store = window.PathloomModel.store;
    const binding = store.document.outputBindings[0];
    const entity = store.getEntity(binding.resolvedEntityId);
    if (entity.producer.featureId !== store.document.features[2].id) throw new Error("Binding must use the Fillet result");
    const { generationInput } = await import("/cad/generation-adapter.js");
    const input = generationInput(binding, entity, store.document.assets[entity.geometry.assetHash]);
    const project = window.__saved, source = project.sources.find((source) => source.generator);
    source.generator = {
      version: 2, id: "pipeline", name: "Bound shape", inputs: [input],
      steps: [
        { id: "slice", operation: "slice-step", version: 1, source: `input:${input.id}`, params: { layerHeight: .6, tolerance: .02 } },
        { id: "paths", operation: "build-toolpath", version: 1, source: "slice", params: { seam: 0, reverse: false, nearest: false } },
      ], output: "paths",
      ...(multiple ? { printOutputs: [{ id: "copy", name: "Bound copy", source: "paths" }] } : {}),
    };
    source.generatorGroup = "cad-issue9-bound";
    source.generatorOutputId = "main";
    source.liveSource = "cad-issue9-bound";
    project.sources = [source];
    project.instances = project.instances.filter(([, instance]) => instance.source === source.id);
    project.cad = { ...project.cad, sourceId: source.id, selectedInputId: input.id, previewStepId: null, mode: "model" };
    const { validateProject } = await import("/pathloom-project.js");
    validateProject(project);
    await window.__cadStorage({ key: "project", content: JSON.stringify(project) });
    window.__oldGenerationDocument = store.document;
    return {
      source: source.id, binding: binding.id, input: input.id,
      rectangle: store.document.features[0].id, extrude: store.document.features[1].id,
      fillet: store.document.features[2].id,
      edges: structuredClone(store.document.features[2].inputs.edges), hash: binding.resolvedResultHash,
    };
  }, multiple);
  await page.evaluate(() => document.querySelector("#projectOpen").click());
  await expect.poll(() => page.evaluate(() => window.PathloomModel.store.document !== window.__oldGenerationDocument)).toBe(true);
  await expect(page.locator("#cadName")).toHaveValue("Bound shape");
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  return ids;
}

async function width(page, value) {
  await page.locator(".model-history-entry").first().click();
  await page.getByRole("textbox", { name: "幅 mm", exact: true }).fill(String(value));
  await page.getByRole("button", { name: "設定変更を確定", exact: true }).click();
  await expect(page.locator(".model-history-entry").nth(2)).toContainText("valid");
}

async function gcode(page) {
  return page.evaluate(() => {
    try { return { code: window.Pathloom.generateGcode() }; }
    catch (error) { return { error: error.message }; }
  });
}

function gcodeWidth(code) {
  const points = code.split("\n").map((line) => /^G1 X(-?[\d.]+) Y(-?[\d.]+) Z(-?[\d.]+) E/.exec(line)).filter(Boolean);
  expect(points.length).toBeGreaterThan(0);
  return Math.max(...points.map((p) => Number(p[1]))) - Math.min(...points.map((p) => Number(p[1])));
}

test("P1-06: Rectangle→Extrude→Fillet→exact paths→G-code follows 60 to 80 without reselecting the edge", async ({ page }) => {
  const ids = await drawing(page);
  const before = await state(page);
  expect(before.sources[0].width).toBeCloseTo(60, 4);
  expect(gcodeWidth((await gcode(page)).code)).toBeCloseTo(60, 2);
  await width(page, 80);
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  const model = await page.evaluate(({ extrude, fillet, binding }) => {
    const store = window.PathloomModel.store, feature = store.getFeature(fillet);
    return {
      volume: store.getEntity(store.getFeature(extrude).outputSlots[0].entityId).displayCache.volumeMm3,
      edges: feature.inputs.edges, status: feature.status,
      hash: store.document.outputBindings.find((b) => b.id === binding).resolvedResultHash,
      filletHash: feature.resultHash,
    };
  }, ids);
  expect(model.volume).toBeCloseTo(80000, 4);
  expect(model.status).toBe("valid");
  expect(model.edges).toEqual(ids.edges);
  expect(model.hash).not.toBe(ids.hash);
  expect(model.hash).toBe(model.filletHash);
  const after = await state(page);
  expect(after.sources[0].id).toBe(ids.source);
  expect(after.sources[0].width).toBeCloseTo(80, 4);
  expect(after.sources[0].bindings[0].resultHash).toBe(model.hash);
  expect(after.sources[0].error).toBeNull();
  expect(gcodeWidth((await gcode(page)).code)).toBeCloseTo(80, 2);
});

test("P1-06: a late section cannot revive a lost edge; lastValid blocks G-code and explicit reselect repairs it", async ({ page }) => {
  const ids = await drawing(page);
  await page.evaluate(() => { window.__holdNextSlice = true; });
  await width(page, 70);
  await page.waitForFunction(() => window.__heldSlice);
  await page.getByRole("checkbox", { name: "角丸", exact: true }).check();
  await page.getByRole("textbox", { name: "角丸半径 mm", exact: true }).fill("3");
  await page.getByRole("button", { name: "設定変更を確定", exact: true }).click();
  await expect(page.locator(".model-history-entry").nth(2)).toContainText("failed");
  const failure = await page.evaluate(({ fillet, binding }) => {
    const store = window.PathloomModel.store, feature = store.getFeature(fillet);
    const bound = store.document.outputBindings.find((b) => b.id === binding);
    return { status: feature.status, lastValid: feature.lastValid?.resultHash, codes: feature.diagnostics.map((d) => d.code), binding: structuredClone(bound), bodies: structuredClone(store.document.bodies), features: store.document.features.map((f) => ({ id: f.id, name: f.name, status: f.status, slots: f.outputSlots })), resolvedProducer: store.getEntity(bound.resolvedEntityId)?.producer };
  }, ids);
  await test.info().attach("missing-reference-state", { body: JSON.stringify(failure, null, 2), contentType: "application/json" });
  expect(failure.lastValid).toBeTruthy();
  expect(failure.codes).toContain("CAD_REFERENCE_MISSING");
  expect(failure.binding.status).toBe("pending");
  await page.evaluate(() => window.__heldSlice.release());
  await page.waitForFunction(() => {
    const held = window.__heldSlice;
    return held.returned && (held.owner.terminated || held.owner.completed > held.completedBefore);
  });
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#cadStatus")).toContainText("前回の形状");
  expect((await gcode(page)).error).toContain("CAD input");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await commit(page, 4);
  await expect(page.locator(".model-history-entry").nth(2)).toContainText("failed");
  await page.locator(".model-history-entry").nth(2).click();
  const replacement = await page.evaluate(({ extrude }) => {
    const store = window.PathloomModel.store;
    const entity = store.getEntity(store.getFeature(extrude).outputSlots[0].entityId);
    const edge = entity.displayCache.topology.find((t) => t.kind === "edge" && Math.abs(t.fingerprint.bbox.max[2] - t.fingerprint.bbox.min[2]) < 1e-5 && t.fingerprint.lengthMm > 30);
    return [...document.querySelectorAll('[aria-label="CAD input edges"] option')].find((option) => { const ref = JSON.parse(option.value); return ref.entityId === entity.id && ref.topologyId === edge.topologyId; }).value;
  }, ids);
  await page.getByLabel("CAD input edges", { exact: true }).selectOption(replacement);
  await expect(page.locator(".model-history-entry").nth(2)).toContainText("valid");
  await expect(page.locator(".model-history-entry").nth(3)).toContainText("valid");
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  expect((await gcode(page)).code).toContain("End of Pathloom output");
  const repaired = await state(page);
  expect(repaired.sources[0].error).toBeNull();
  expect(repaired.sources[0].bindings[0].status).toBe("ready");
  expect(repaired.sources[0].bindings[0].resultHash).not.toBe(failure.lastValid);
});

test("P1-06: inactive shared outputs stay stale until selected, without changing an independent graph", async ({ page }) => {
  const ids = await drawing(page, true);
  await page.locator("#modeGenerate").click();
  // Initialize another graph through its existing handler; the legacy toolbar
  // stays hidden. Graph selection and the dimension/repair actions use the UI.
  await page.locator("#cadNew").evaluate((button) => button.click());
  await expect(page.locator("#cadName")).toHaveValue("Stacked section");
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  const before = await state(page), independent = before.sources.find((s) => s.id === before.active);
  expect(before.sources.filter((s) => s.group === "cad-issue9-bound")).toHaveLength(2);
  await page.locator("#modeModel").click();
  await width(page, 80);
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  const changed = await state(page), active = changed.sources.find((s) => s.id === independent.id);
  await test.info().attach("inactive-graphs", { body: JSON.stringify({ before, changed }, null, 2), contentType: "application/json" });
  expect.soft(active.inputs).toEqual(independent.inputs);
  expect.soft(active.paths).toBe(independent.paths);
  expect.soft(active.error).toBeNull();
  const inactive = changed.sources.filter((s) => s.group === "cad-issue9-bound");
  expect.soft(inactive.every((s) => s.error?.includes("CAD input"))).toBe(true);
  for (const source of inactive) expect(source.width).toBeCloseTo(60, 4);
  expect((await gcode(page)).error).toContain("CAD input");
  await page.locator("#modeOutput").click();
  await page.locator(`.object-card[data-source="${ids.source}"] .object-header`).click();
  await expect(page.locator("#cadName")).toHaveValue("Bound shape");
  await expect.poll(async () => (await gcode(page)).error || "ready").toBe("ready");
  const repaired = await state(page);
  for (const source of repaired.sources.filter((s) => s.group === "cad-issue9-bound")) {
    expect(source.width).toBeCloseTo(80, 4); expect(source.error).toBeNull();
  }
  expect(repaired.sources.find((s) => s.id === independent.id).paths).toBe(independent.paths);
  await page.locator(`.object-card[data-source="${independent.id}"] .object-header`).click();
  await page.locator("#modeModel").click();
  await page.locator(".model-history-entry").nth(2).click();
  await page.getByRole("button", { name: "結果のプロパティ・生成接続", exact: true }).click();
  await page.getByRole("button", { name: "生成で使用（現在のbody結果）", exact: true }).click();
  await expect(page.locator("#cadStatus")).toHaveAttribute("data-state", "ready");
  const explicit = (await state(page)).sources.find((s) => s.id === independent.id);
  expect(explicit.inputs).toContain(ids.input);
  expect(explicit.paths).toBe(independent.paths);
});
