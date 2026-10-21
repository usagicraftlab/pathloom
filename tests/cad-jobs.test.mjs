// Transport mocks are only for race injection; geometry evidence lives in native/browser fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { CadStore } from "../cad/store.js";
import { commandById } from "../cad/commands/registry.js";
import {
  createCommandSession,
  dispatchSession,
} from "../cad/commands/session.js";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fakeNative() {
  const pending = [],
    released = [],
    assets = {};
  let counter = 0;
  return {
    pending,
    released,
    runtimeEpoch: 1,
    workspaceEpoch: 1,
    async start() {
      return { runtimeEpoch: 1, ocpVersion: "job-test" };
    },
    evaluate(request) {
      return new Promise((resolve, reject) =>
        pending.push({ request, resolve, reject }),
      );
    },
    async exportAssets(handles) {
      return Object.fromEntries(
        handles.map((h) => [
          h,
          {
            format: "occt-brep",
            encoding: "utf-8",
            byteLength: 1,
            data: "x",
            sourceKernelVersion: "job-test",
          },
        ]),
      );
    },
    async importAsset(hash) {
      return output(hash);
    },
    release(handles) {
      released.push(...handles);
    },
    cancelAll() {
      for (const job of pending.splice(0))
        job.reject(new Error("CAD_CANCELLED"));
      this.workspaceEpoch++;
    },
  };
}
function output(handle) {
  return {
    slotKey: "result",
    handle,
    geometryHash: handle,
    kind: "curve",
    summary: {
      kind: "curve",
      bbox: { min: [0, 0, 0], max: [10, 0, 0] },
      closure: { curveClosed: false, enclosesVolume: false },
      exactness: "analytic",
      accuracy: null,
      topology: [],
      preview: { curves: [], meshes: [], points: [] },
    },
  };
}
function complete(job, handle) {
  job.resolve({
    ...job.request,
    status: "ok",
    outputs: [output(handle)],
    diagnostics: [],
  });
}
async function waiting(native, count = 1) {
  for (let i = 0; i < 30 && native.pending.length < count; i++) await tick();
  assert.equal(native.pending.length, count);
}
test("R01 latest preview wins and superseded handles are released", async () => {
  const native = fakeNative(),
    store = new CadStore(native),
    s = createCommandSession(commandById("C02"));
  const a = store.preview(s);
  await waiting(native);
  dispatchSession(s, { type: "setting.change", key: "end", value: [30, 0, 0] });
  const b = store.preview(s);
  await waiting(native, 2);
  complete(native.pending[1], "new");
  assert.equal((await b).outputs[0].handle, "new");
  complete(native.pending[0], "old");
  assert.equal(await a, null);
  assert.ok(native.released.includes("old"));
});
test("R02 unrelated document revision does not discard a correct feature result", async () => {
  const native = fakeNative(),
    store = new CadStore(native);
  const session = createCommandSession(commandById("C02"));
  const add = store.add(session);
  await waiting(native);
  store.document.uiState.leftWidth = 300;
  store.document.documentRevision++;
  complete(native.pending.shift(), "asset");
  assert.equal(await add, true);
  assert.equal(store.document.features[0].status, "valid");
  assert.equal(store.document.uiState.leftWidth, 300);
});
test("R03 Undo invalidates running job, restores original state and increases revision", async () => {
  const native = fakeNative(),
    store = new CadStore(native),
    session = createCommandSession(commandById("C02"));
  const add = store.add(session);
  await waiting(native);
  complete(native.pending.shift(), "initial");
  await add;
  const feature = store.document.features[0],
    edit = store.edit(feature.id, { start: [0, 0, 0], end: [50, 0, 0] });
  await waiting(native);
  const revision = store.document.documentRevision;
  assert.equal(store.transactions.undo(), true);
  await edit;
  await tick();
  assert.ok(store.document.documentRevision > revision);
  assert.deepEqual(store.document.features[0].parameters.end, [20, 0, 0]);
  assert.equal(store.document.entities[0].geometry.assetHash, "initial");
});
test("R05 corrupt asset preparation cannot replace the current document", async () => {
  const native = fakeNative(),
    store = new CadStore(native),
    original = store.document;
  const candidate = structuredClone(original);
  candidate.assets.bad = {
    format: "occt-brep",
    encoding: "utf-8",
    byteLength: 1,
    data: "corrupt",
  };
  await assert.rejects(store.prepareRestore(candidate), /CAD_ASSET_MISSING/);
  assert.equal(store.document, original);
  assert.equal(store.document.documentRevision, 0);
});
test("old failed request does not overwrite a newer dirty feature edit", async () => {
  const native = fakeNative(),
    store = new CadStore(native),
    session = createCommandSession(commandById("C02"));
  const added = store.add(session);
  await waiting(native);
  complete(native.pending.shift(), "initial");
  await added;
  const id = store.document.features[0].id;
  const a = store.edit(id, { start: [0, 0, 0], end: [30, 0, 0] });
  await waiting(native);
  const b = store.edit(id, { start: [0, 0, 0], end: [40, 0, 0] });
  native.pending.shift().reject(new Error("old request failed"));
  await waiting(native);
  complete(native.pending.shift(), "latest");
  await Promise.all([a, b]);
  assert.equal(store.document.features[0].status, "valid");
  assert.equal(store.document.entities[0].geometry.assetHash, "latest");
  assert.deepEqual(store.document.features[0].parameters.end, [40, 0, 0]);
});
test("explicit cancel retains lastValid and does not automatically restart the job", async () => {
  const native = fakeNative(),
    store = new CadStore(native),
    session = createCommandSession(commandById("C02"));
  const added = store.add(session);
  await waiting(native);
  complete(native.pending.shift(), "initial");
  await added;
  const id = store.document.features[0].id,
    edit = store.edit(id, { start: [0, 0, 0], end: [60, 0, 0] });
  await waiting(native);
  store.cancelJobs();
  await edit;
  assert.equal(store.document.features[0].status, "cancelled");
  assert.equal(store.document.entities[0].geometry.assetHash, "initial");
  assert.ok(store.document.features[0].lastValid);
  assert.equal(native.pending.length, 0);
});
