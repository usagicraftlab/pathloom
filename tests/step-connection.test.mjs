import test from "node:test";
import assert from "node:assert/strict";
import { CadStore } from "../cad/store.js";
import { validateCadDocument } from "../cad/document.js";

const data = "CASCADE Topology V3, (c) Open Cascade\nLocations 0\nCurve2ds 0\nCurves 0\nPolygon3D 0\nPolygonOnTriangulations 0\nSurfaces 0\nTriangulations 0\nTShapes 0\n";
const shape = () => ({
  id: "legacy-step-1",
  name: "legacy-box.step",
  visible: true,
  kernel: "Open CASCADE",
  placementMatrix: [1, 0, 0, 25, 0, 1, 0, -10, 0, 0, 1, 5, 0, 0, 0, 1],
  brep: { format: "occt-brep", version: 1, data, original: data + "original", history: [] },
  faces: [{ index: 0, area: 600, planar: true, bounds: [[0, 0, 0], [10, 20, 30]] }],
  meshes: [{ name: "legacy-box.step", positions: [0,0,0,10,0,0,0,20,0], normals: [], indices: [0,1,2], color: [.7,.7,.7], triangleFaces: [0] }],
});
function native() {
  let hash;
  return {
    runtimeEpoch: 1,
    async start() { return { runtimeEpoch: 1, ocpVersion: "test", occtVersion: null }; },
    async importAsset(value, asset) {
      hash = value;
      assert.equal(asset.provenance.units, "mm");
      return { handle: "h", geometryHash: value, kind: "solid", summary: {
        kind: "solid", bbox: { min: [0,0,0], max: [10,20,30] },
        closure: { curveClosed: null, surfaceUClosed: null, surfaceVClosed: null, shellClosed: true, enclosesVolume: true },
        exactness: "analytic", accuracy: null, topology: [], preview: { meshes: [], curves: [], points: [] },
      }};
    },
    async exportStep(handle) { assert.equal(handle, "h"); return { step: "ISO-10303-21;\nEND-ISO-10303-21;", byteLength: 34, sourceGeometryHash: hash, units: "mm" }; },
    release() {},
    cancelAll() {},
  };
}

test("legacy editable STEP becomes one exact CAD history source with placement and provenance", async () => {
  const store = new CadStore(native());
  const entityId = await store.importLegacyStep(shape());
  const feature = store.document.features[0], entity = store.getEntity(entityId);
  assert.equal(feature.operation.id, "import.step");
  assert.equal(feature.parameters.units, "mm");
  assert.deepEqual(feature.parameters.placementMatrix, shape().placementMatrix);
  assert.equal(feature.parameters.source.importedShapeId, "legacy-step-1");
  assert.equal(store.document.assets[entity.geometry.assetHash].provenance.originalHash, feature.parameters.originalAssetHash);
  assert.equal(store.document.bodies[0].tipEntityId, entityId);
  assert.doesNotThrow(() => validateCadDocument(store.document));
  await assert.rejects(store.importLegacyStep(shape()), /すでにCAD履歴/);
  const exported = await store.exportStep(entityId);
  assert.match(exported.step, /^ISO-10303-21;/);
});

test("display-only STEP is not fabricated into CAD history", async () => {
  const store = new CadStore(native()), displayOnly = shape();
  delete displayOnly.brep;
  await assert.rejects(store.importLegacyStep(displayOnly), /editable B-rep|Invalid editable/);
  assert.equal(store.document.features.length, 0);
});
