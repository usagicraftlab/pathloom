import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("P4-04 performance evidence records reproducible Linux samples and bounded GC", async () => {
  const evidence = JSON.parse(
    await readFile(new URL("../docs/cad-performance-baseline.json", import.meta.url)),
  );
  assert.equal(evidence.schemaVersion, 1);
  assert.match(evidence.environment.measurementScope, /not Mac acceptance/);
  assert.equal(evidence.environment.exposeGc, true);
  assert.equal(evidence.display.length, 3);
  assert.equal(evidence.storeGc.length, 3);
  assert.equal(evidence.native.models.length, 3);
  assert.equal(evidence.native.startup.samplesMs.length, 3);
  for (const model of evidence.display) {
    assert.equal(model.samples.length, model.repeats);
    assert.ok(model.medianDisplayMs > 0);
    for (const sample of model.samples) {
      assert.ok(sample.resourcesBeforeGc.geometries > 0);
      assert.ok(sample.resourcesBeforeGc.materials > 0);
      assert.equal(sample.resourcesAfterGc.geometries, 0);
      assert.equal(sample.resourcesAfterGc.materials, 0);
    }
  }
  for (const model of evidence.storeGc) {
    assert.equal(model.handlesAfterGc, model.entityCount);
    assert.equal(
      model.handlesReleased,
      model.handlesBeforeGc - model.handlesAfterGc,
    );
  }
  for (const model of evidence.native.models) {
    assert.equal(model.samples.length, model.repeats);
    assert.ok(model.median.recomputeMs > 0);
    assert.ok(model.median.transferBytes > 0);
    assert.equal(model.median.handlesBeforeGc, model.entityCount);
    assert.equal(model.median.handlesAfterGc, 0);
  }
});
