import test from "node:test";
import assert from "node:assert/strict";
import { NativeCadClient } from "../cad/native-client.js";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function transport() {
  let epoch = 1,
    callback,
    starts = 0,
    listens = 0;
  const requests = [];
  const client = new NativeCadClient({
    async listen(name, listener) {
      listens++;
      callback = listener;
      return () => {};
    },
    async invoke(name, args) {
      if (name === "cad_runtime_start") {
        starts++;
        return { runtimeEpoch: epoch };
      }
      if (name === "cad_evaluate") {
        requests.push(args.request);
        return { accepted: true };
      }
      if (name === "cad_cancel") return;
      if (name === "cad_runtime_restart") {
        epoch++;
        return { runtimeEpoch: epoch };
      }
      if (name === "cad_import_asset") {
        epoch++;
        return { handle: "restored", runtimeEpoch: epoch };
      }
      throw new Error(name);
    },
  });
  return {
    client,
    requests,
    emit: (value) => callback({ payload: value }),
    get starts() {
      return starts;
    },
    get listens() {
      return listens;
    },
  };
}
test("CAD transport registers one listener; cancel rejects jobs and late results cannot revive them", async () => {
  const t = transport();
  await Promise.all([t.client.start(), t.client.start()]);
  assert.equal(t.starts, 1);
  assert.equal(t.listens, 1);
  const job = t.client.evaluate({ documentId: "old", featureRevision: 1 });
  const rejected = assert.rejects(job, /CAD_CANCELLED/);
  while (!t.requests.length) await tick();
  const old = t.requests[0];
  t.client.cancelAll();
  await rejected;
  t.emit({ ...old, status: "ok", outputs: [] });
  assert.equal(t.client.jobs.size, 0);
  await t.client.restart();
  assert.equal(t.client.runtimeEpoch, 2);
  assert.equal(t.listens, 1);
});
test("asset import after a daemon restart refreshes the client epoch before the next evaluation", async () => {
  const t = transport();
  await t.client.start();
  await t.client.importAsset("hash", {});
  assert.equal(t.client.runtimeEpoch, 2);
  assert.equal(t.starts, 2);
  const job = t.client.evaluate({ documentId: "current" });
  while (!t.requests.length) await tick();
  assert.equal(t.requests[0].runtimeEpoch, 2);
  t.emit({ ...t.requests[0], status: "ok", outputs: [] });
  assert.equal((await job).status, "ok");
});
