// Transport mocks are only for race injection; geometry evidence lives in native/browser fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { CadStore } from "../cad/store.js";
import { commandById } from "../cad/commands/registry.js";
import { createCadDocument } from "../cad/document.js";
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
      return { runtimeEpoch: this.runtimeEpoch, ocpVersion: "job-test" };
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

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function committedLine() {
  const native = fakeNative(),
    store = new CadStore(native);
  const added = store.add(createCommandSession(commandById("C02")));
  await waiting(native);
  complete(native.pending.shift(), "initial");
  await added;
  return { native, store, feature: store.document.features[0] };
}
function delayExport(native) {
  const entered = deferred(),
    released = deferred(),
    original = native.exportAssets;
  native.exportAssets = async (handles) => {
    const assets = await original(handles);
    if (handles.includes("obsolete")) {
      entered.resolve();
      await released.promise;
    }
    return assets;
  };
  return { entered: entered.promise, release: released.resolve };
}
test("AUD-001 edits during asset export discard old geometry and drain the latest edit", async () => {
  const { native, store, feature } = await committedLine(),
    gate = delayExport(native);
  const first = store.edit(feature.id, {
    ...feature.parameters,
    end: [70, 0, 0],
  });
  await waiting(native);
  complete(native.pending.shift(), "obsolete");
  await gate.entered;
  const latest = store.edit(feature.id, {
    ...feature.parameters,
    end: [80, 0, 0],
  });
  gate.release();
  await waiting(native);
  assert.equal(native.pending[0].request.parameters.end[0], 80);
  assert.ok(native.released.includes("obsolete"));
  assert.equal(store.document.assets.obsolete, undefined);
  complete(native.pending.shift(), "latest");
  await latest;
  await first;
  assert.equal(feature.status, "valid");
  assert.equal(feature.resultHash, feature.requestedHash);
  assert.equal(store.document.entities[0].geometry.assetHash, "latest");
});
for (const action of ["undo", "delete", "restore"]) {
  test(`AUD-001 ${action} during export cannot apply the previous document result`, async () => {
    const { native, store, feature } = await committedLine(),
      gate = delayExport(native);
    const editing = store.edit(feature.id, {
      ...feature.parameters,
      end: [70, 0, 0],
    });
    await waiting(native);
    complete(native.pending.shift(), "obsolete");
    await gate.entered;
    if (action === "undo") store.transactions.undo();
    else if (action === "delete") store.remove(feature.id);
    else store.commitRestore(await store.prepareRestore(createCadDocument()));
    gate.release();
    await editing;
    assert.ok(native.released.includes("obsolete"));
    assert.equal(store.document.assets.obsolete, undefined);
    if (action === "undo") {
      assert.equal(store.document.features[0].parameters.end[0], 20);
      assert.equal(store.document.entities[0].geometry.assetHash, "initial");
    } else assert.equal(store.document.entities.length, 0);
  });
}
test("AUD-001 an upstream edit during dependent export cannot publish the previous input geometry", async () => {
  const { native, store, feature: upstream } = await committedLine();
  const session = createCommandSession(commandById("transform.move"));
  session.inputs.object = [{ entityId: upstream.outputSlots[0].entityId }];
  const adding = store.add(session);
  await waiting(native);
  complete(native.pending.shift(), "derived-initial");
  assert.equal(await adding, true);
  const dependent = store.document.features.at(-1),
    gate = delayExport(native);
  const first = store.edit(dependent.id, { translation: [2, 0, 0] });
  await waiting(native);
  complete(native.pending.shift(), "obsolete");
  await gate.entered;
  const latest = store.edit(upstream.id, {
    ...upstream.parameters,
    end: [80, 0, 0],
  });
  gate.release();
  await waiting(native);
  assert.equal(native.pending[0].request.featureId, upstream.id);
  complete(native.pending.shift(), "upstream80");
  await waiting(native);
  assert.equal(
    native.pending[0].request.inputs.object[0].geometryHash,
    "upstream80",
  );
  complete(native.pending.shift(), "derived-latest");
  await Promise.all([first, latest]);
  assert.equal(dependent.status, "valid");
  assert.ok(native.released.includes("obsolete"));
  assert.equal(store.document.assets.obsolete, undefined);
  assert.equal(
    store.getEntity(dependent.outputSlots[0].entityId).geometry.assetHash,
    "derived-latest",
  );
});

test("AUD-001 document replacement before add initialization cannot insert into the new document", async () => {
  const native = fakeNative(),
    store = new CadStore(native);
  const next = await store.prepareRestore(createCadDocument());
  const adding = store.add(createCommandSession(commandById("C02")));
  store.commitRestore(next);
  assert.equal(await adding, false);
  assert.equal(store.document.features.length, 0);
  assert.equal(native.pending.length, 0);
});
test("AUD-001 asset import records the requested hash while the source entity changes", async () => {
  const { native, store, feature } = await committedLine(),
    gate = deferred();
  const entity = store.getEntity(feature.outputSlots[0].entityId);
  store.handles.clear();
  native.importAsset = async (hash) => {
    await gate.promise;
    return output(hash);
  };
  const resolving = store.resolve({ object: [{ entityId: entity.id }] });
  await tick();
  entity.geometry.assetHash = "changed-during-import";
  gate.resolve();
  const resolved = await resolving;
  assert.deepEqual(resolved.inputHashes, ["initial"]);
  assert.equal(resolved.prepared.object[0].geometryHash, "initial");
  assert.equal(store.handles.has("changed-during-import"), false);
  assert.equal(store.handles.get("initial").value.geometryHash, "initial");
});
test("AUD-001 a failed add cannot roll back unrelated edits made while evaluating", async () => {
  const native = fakeNative(),
    store = new CadStore(native);
  const adding = store.add(createCommandSession(commandById("C02")));
  await waiting(native);
  store.document.uiState.leftWidth = 320;
  store.document.documentRevision++;
  const job = native.pending.shift();
  job.resolve({
    ...job.request,
    status: "failed",
    outputs: [],
    diagnostics: [],
  });
  assert.equal(await adding, false);
  assert.equal(store.document.features.length, 0);
  assert.equal(store.document.uiState.leftWidth, 320);
  assert.equal(store.document.draftSessions.length, 1);
});
test("AUD-001 runtime epoch changes during export cannot publish the previous runtime result", async () => {
  const { native, store, feature } = await committedLine(),
    gate = delayExport(native);
  const editing = store.edit(feature.id, {
    ...feature.parameters,
    end: [70, 0, 0],
  });
  await waiting(native);
  complete(native.pending.shift(), "obsolete");
  await gate.entered;
  native.runtimeEpoch++;
  gate.release();
  await editing;
  assert.ok(native.released.includes("obsolete"));
  assert.equal(store.document.assets.obsolete, undefined);
  assert.equal(store.document.entities[0].geometry.assetHash, "initial");
  assert.notEqual(feature.status, "valid");
});

for (const phase of ["evaluate", "export"]) {
  test(`AUD-001 an old ${phase} failure cannot overwrite a dependent dirtied by an upstream edit`, async () => {
    const { native, store, feature: upstream } = await committedLine();
    const session = createCommandSession(commandById("transform.move"));
    session.inputs.object = [{ entityId: upstream.outputSlots[0].entityId }];
    const adding = store.add(session);
    await waiting(native);
    complete(native.pending.shift(), "derived-initial");
    await adding;
    const dependent = store.document.features.at(-1),
      entered = deferred(),
      gate = deferred();
    const original = native.exportAssets;
    if (phase === "export")
      native.exportAssets = async (handles) => {
        if (handles.includes("obsolete")) {
          entered.resolve();
          await gate.promise;
          throw new Error("old export failed");
        }
        return original(handles);
      };
    const first = store.edit(dependent.id, { translation: [2, 0, 0] });
    await waiting(native);
    const old = native.pending.shift();
    if (phase === "export") {
      complete(old, "obsolete");
      await entered.promise;
    }
    const latest = store.edit(upstream.id, {
      ...upstream.parameters,
      end: [80, 0, 0],
    });
    if (phase === "export") gate.resolve();
    else old.reject(new Error("old evaluation failed"));
    await waiting(native);
    complete(native.pending.shift(), "upstream80");
    await waiting(native);
    assert.equal(
      native.pending[0].request.inputs.object[0].geometryHash,
      "upstream80",
    );
    complete(native.pending.shift(), "derived-latest");
    await Promise.all([first, latest]);
    assert.equal(dependent.status, "valid");
    assert.equal(store.document.assets.obsolete, undefined);
    assert.equal(
      store.getEntity(dependent.outputSlots[0].entityId).geometry.assetHash,
      "derived-latest",
    );
  });
}
