#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import * as THREE from "../vendor/three/three.module.js";
import { createViewAdapter } from "../cad/view-adapter.js";
import { CadStore } from "../cad/store.js";

const bundledPython = ".pathloom-runtime/python/bin/python",
  python =
    process.env.PATHLOOM_PYTHON ||
    (existsSync(bundledPython)
      ? bundledPython
      : process.env.CODEX_PRIMARY_RUNTIME_PYTHON || "python3");
const native = spawnSync(python, ["-B", "scripts/cad-performance.py"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  maxBuffer: 20_000_000,
});
if (native.status !== 0)
  throw new Error(
    `Native performance fixture failed: ${native.error?.message || native.stderr || `exit ${native.status}`}`,
  );

const previousDocument = globalThis.document;
globalThis.document = {
  body: { dataset: { workspaceMode: "model" } },
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ fillText() {} }),
  }),
  getElementById: () => null,
};

function summary(seed) {
  return {
    volumeMm3: 1,
    preview: {
      meshes: [{
        positions: [seed, 0, 0, seed + 1, 0, 0, seed, 1, 0],
        indices: [0, 1, 2],
        triangleFaces: [0],
        faceTopologyIds: ["face"],
      }],
      curves: [{ points: [[seed, 0, 0], [seed + 1, 0, 0]], topologyId: "edge" }],
      points: [{ point: [seed, 0, 0], topologyId: "vertex" }],
    },
  };
}

function model(count, revision = 0) {
  const features = [], entities = [], bodies = [];
  for (let index = 0; index < count; index++) {
    const featureId = `feature-${index}`,
      entityId = `entity-${index}`,
      bodyId = `body-${index}`;
    features.push({
      id: featureId,
      status: "valid",
      resultPolicy: "add",
      outputSlots: [{ entityId, bodyId }],
    });
    entities.push({
      id: entityId,
      bodyId,
      producer: { featureId },
      geometry: { assetHash: `asset-${index}-${revision}` },
      resultHash: `result-${index}-${revision}`,
      visibility: "visible",
      locked: false,
      displayCache: summary(index),
    });
    bodies.push({ id: bodyId, tipEntityId: entityId, status: "ready" });
  }
  return { features, entities, bodies };
}

function displayMeasurement(name, count, repeats = 5) {
  const samples = [];
  for (let sample = 0; sample < repeats; sample++) {
    globalThis.gc?.();
    const heapBeforeMiB = process.memoryUsage().heapUsed / 1024 / 1024,
      scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(),
      controls = { target: new THREE.Vector3(), update() {} },
      canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
      adapter = createViewAdapter(() => ({ THREE, scene, camera, controls, canvas, dirty() {} })),
      started = performance.now();
    adapter.update(model(count));
    const displayMs = performance.now() - started;
    for (let revision = 1; revision <= 20; revision++)
      adapter.update(model(count, revision));
    const beforeGc = adapter.displayState();
    adapter.update(model(0));
    const afterGc = adapter.displayState();
    adapter.dispose();
    globalThis.gc?.();
    samples.push({
      displayMs: Number(displayMs.toFixed(3)),
      heapBeforeMiB: Number(heapBeforeMiB.toFixed(3)),
      heapAfterGcMiB: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(3)),
      resourcesBeforeGc: beforeGc.resources,
      resourcesAfterGc: afterGc.resources,
      collectedResources: afterGc.collectedResources,
    });
  }
  const values = samples.map((sample) => sample.displayMs).sort((a, b) => a - b);
  return {
    name,
    entityCount: count,
    repeats,
    replacementCycles: 20,
    medianDisplayMs: values[Math.floor(values.length / 2)],
    samples,
  };
}

function storeGcMeasurement(name, count, generations = 21) {
  const released = [],
    native = {
      release(handles) {
        released.push(...handles);
      },
      cancelAll() {},
    },
    store = new CadStore(native);
  store.document.entities = Array.from({ length: count }, (_, index) => ({
    id: `entity-${index}`,
    geometry: { assetHash: `asset-${index}-${generations - 1}` },
  }));
  for (let generation = 0; generation < generations; generation++)
    for (let index = 0; index < count; index++) {
      const hash = `asset-${index}-${generation}`;
      store.handles.set(hash, {
        value: { handle: `handle-${index}-${generation}` },
        epoch: 1,
      });
    }
  const handlesBeforeGc = store.handles.size,
    result = store.collectHandles();
  return {
    name,
    entityCount: count,
    generations,
    handlesBeforeGc,
    handlesAfterGc: store.handles.size,
    handlesReleased: released.length,
    result,
  };
}

try {
  const result = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      exposeGc: typeof globalThis.gc === "function",
      measurementScope: "synthetic Linux regression baseline; not Mac acceptance",
    },
    display: [
      displayMeasurement("small", 1),
      displayMeasurement("medium", 25),
      displayMeasurement("large", 100),
    ],
    storeGc: [
      storeGcMeasurement("small", 1),
      storeGcMeasurement("medium", 25),
      storeGcMeasurement("large", 100),
    ],
    native: JSON.parse(native.stdout),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  globalThis.document = previousDocument;
}
