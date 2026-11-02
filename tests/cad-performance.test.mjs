import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.module.js";
import { createViewAdapter } from "../cad/view-adapter.js";

function installDocument() {
  const previous = globalThis.document;
  globalThis.document = {
    body: { dataset: { workspaceMode: "model" } },
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            font: "",
            textAlign: "",
            fillStyle: "",
            fillText() {},
          };
        },
      };
    },
    getElementById() {
      return null;
    },
  };
  return () => {
    globalThis.document = previous;
  };
}

function summary(seed = 0) {
  return {
    volumeMm3: 1,
    preview: {
      meshes: [
        {
          positions: [seed, 0, 0, seed + 1, 0, 0, seed, 1, 0],
          indices: [0, 1, 2],
          triangleFaces: [0],
          faceTopologyIds: ["face"],
        },
      ],
      curves: [
        { points: [[seed, 0, 0], [seed + 1, 0, 0]], topologyId: "edge" },
      ],
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

test("P4 display cache stays bounded and disposes replaced and hidden resources", () => {
  const restoreDocument = installDocument(),
    scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(),
    controls = { target: new THREE.Vector3(), update() {} },
    canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    preview = () => ({ THREE, scene, camera, controls, canvas, dirty() {} }),
    adapter = createViewAdapter(preview);
  try {
    adapter.update(model(25));
    const initial = adapter.displayState();
    assert.equal(initial.entityIds.length, 25);
    assert.equal(initial.resources.geometries, 75);
    assert.equal(initial.resources.materials, 75);

    for (let revision = 1; revision <= 20; revision++)
      adapter.update(model(25, revision));
    const replaced = adapter.displayState();
    assert.equal(replaced.resources.geometries, initial.resources.geometries);
    assert.equal(replaced.resources.materials, initial.resources.materials);
    assert.equal(replaced.collectedResources.geometries, 25 * 3 * 20);
    assert.equal(replaced.collectedResources.materials, 25 * 3 * 20);

    adapter.update(model(0));
    const empty = adapter.displayState();
    assert.equal(empty.entityIds.length, 0);
    assert.equal(empty.resources.geometries, 0);
    assert.equal(empty.resources.materials, 0);
    assert.equal(empty.collectedResources.geometries, 25 * 3 * 21);
    assert.equal(empty.collectedResources.materials, 25 * 3 * 21);
  } finally {
    adapter.dispose();
    restoreDocument();
  }
});

test("027 move outline, running translucency, grid fading and orbit target recover without changing geometry", () => {
  const restoreDocument = installDocument(), scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-40,40,30,-30);
  camera.position.set(50,50,50);
  const controls = {target:new THREE.Vector3(),update(){}},
    canvas = {getBoundingClientRect:()=>({width:800,height:600,left:0,top:0})},
    adapter = createViewAdapter(()=>({THREE,scene,camera,controls,canvas,dirty(){}}));
  try {
    const doc = model(1), original = structuredClone(doc.entities[0]);
    adapter.update(doc);
    const nearOpacity = adapter.displayState().gridMinorOpacity;
    assert.ok(nearOpacity > 0);
    camera.zoom = 0.05;
    adapter.updateGrid(1);
    assert.equal(adapter.displayState().gridMinorOpacity,0);
    camera.zoom = 1;
    adapter.updateGrid(0.5);
    assert.equal(adapter.displayState().gridStepMm,0.5);
    const offset = camera.position.clone().sub(controls.target);
    adapter.setOrbitTarget([15,-20,5]);
    assert.deepEqual(adapter.displayState().orbitTarget,[15,-20,5]);
    assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-12);
    adapter.setMoveGhost(doc.entities[0]);
    assert.equal(adapter.displayState().moveGhostVisible,true);
    const outline = scene.children.find((child)=>child.name==="CAD move origin outline");
    assert.ok(outline.children.length>0);
    assert.ok(outline.children.every((child)=>!child.isMesh));
    adapter.setMoveGhost(null);
    assert.equal(adapter.displayState().moveGhostVisible,false);
    doc.features[0].status="running";
    adapter.update(doc);
    assert.deepEqual(adapter.displayState().ghostEntityIds,["entity-0"]);
    doc.features[0].status="valid";
    adapter.update(doc);
    assert.deepEqual(adapter.displayState().ghostEntityIds,[]);
    assert.deepEqual(doc.entities[0],original);
    camera.zoom = 1e-8;
    adapter.updateGrid(1);
    const grid = scene.children.find((child)=>child.name==="CAD z=0 millimetre grid");
    assert.ok(grid.children.every((child)=>!child.geometry.attributes.position || child.geometry.attributes.position.count<5000));
  } finally { adapter.dispose(); restoreDocument(); }
});
