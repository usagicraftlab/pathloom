import { deriveVisibleEntities } from "./document.js";
export function createViewAdapter(preview, { pick = () => {} } = {}) {
  let group = null,
    previewGroup = null;
  const shown = new Map();
  function ensure() {
    const { THREE, scene } = preview();
    if (!scene) return false;
    if (!group) {
      group = new THREE.Group();
      group.name = "CAD exact display";
      scene.add(group);
      previewGroup = new THREE.Group();
      scene.add(previewGroup);
    }
    return true;
  }
  function dispose(object) {
    object.traverse((node) => {
      node.geometry?.dispose();
      node.material?.dispose();
    });
    object.parent?.remove(object);
  }
  function draw(
    summary,
    entityId,
    resultHash,
    ghost = false,
    temporary = false,
  ) {
    const { THREE } = preview(),
      g = new THREE.Group();
    g.userData = { entityId, resultHash, ghost };
    const color = temporary ? 0x4388ac : ghost ? 0x8a959d : 0x7693a8;
    for (const m of summary.preview?.meshes || []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(m.positions, 3),
      );
      geometry.setIndex(m.indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: ghost || temporary,
          opacity: ghost ? 0.3 : temporary ? 0.5 : 0.75,
          roughness: 0.7,
        }),
      );
      mesh.userData = {
        entityId,
        resultHash,
        triangleFaces: m.triangleFaces,
        faceTopologyIds: m.faceTopologyIds,
      };
      g.add(mesh);
    }
    for (const curve of summary.preview?.curves || []) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        curve.points.map((p) => new THREE.Vector3(...p)),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: temporary ? 0x226c9e : 0x344e61,
          transparent: ghost,
          opacity: ghost ? 0.3 : 1,
        }),
      );
      line.userData = {
        entityId,
        resultHash,
        topologyId: curve.topologyId,
        kind: "edge",
      };
      g.add(line);
    }
    for (const p of summary.preview?.points || []) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...p.point),
        ]),
        point = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            color: 0x206d97,
            size: 5,
            sizeAttenuation: false,
          }),
        );
      point.userData = {
        entityId,
        resultHash,
        topologyId: p.topologyId,
        kind: "vertex",
      };
      g.add(point);
    }
    return g;
  }
  return {
    fit(entities) {
      const { THREE, camera, controls } = preview();
      if (!camera || !entities.length) return;
      const box = new THREE.Box3();
      for (const e of entities)
        box.union(
          new THREE.Box3(
            new THREE.Vector3(...e.bbox.min),
            new THREE.Vector3(...e.bbox.max),
          ),
        );
      const center = box.getCenter(new THREE.Vector3()),
        size = box.getSize(new THREE.Vector3()),
        extent = Math.max(size.x, size.y, size.z, 1),
        direction = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      if (camera.isOrthographicCamera) {
        const aspect =
            (camera.right - camera.left) / (camera.top - camera.bottom),
          half = extent * 0.9;
        camera.top = half;
        camera.bottom = -half;
        camera.left = -half * aspect;
        camera.right = half * aspect;
        camera.zoom = 1;
      } else {
        const distance =
          (extent / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.7;
        camera.position.copy(center).addScaledVector(direction, distance);
        controls.minDistance = Math.min(controls.minDistance, extent * 0.01);
        controls.maxDistance = Math.max(controls.maxDistance, distance * 4);
        camera.far = Math.max(camera.far, distance * 8);
      }
      camera.updateProjectionMatrix();
      controls.update();
      preview().dirty();
    },
    update(doc, selection = []) {
      if (!ensure()) return;
      group.visible = document.body.dataset.workspaceMode === "model";
      previewGroup.visible = group.visible;
      const visible = deriveVisibleEntities(doc);
      for (const r of selection) {
        const e = doc.entities.find((e) => e.id === r.entityId);
        if (e && !visible.some((v) => v.id === e.id)) visible.push(e);
      }
      const keys = new Set(visible.map((e) => e.id));
      for (const [id, g] of shown)
        if (!keys.has(id)) {
          dispose(g);
          shown.delete(id);
        }
      for (const e of visible) {
        const producer = doc.features.find(
            (f) => f.id === e.producer.featureId,
          ),
          ghost = !["valid", "warning", "empty"].includes(producer?.status),
          key = e.geometry.assetHash + ":" + ghost;
        let g = shown.get(e.id);
        if (!g || g.userData.key !== key) {
          if (g) dispose(g);
          g = draw(e.displayCache || {}, e.id, e.resultHash, ghost);
          g.userData.key = key;
          group.add(g);
          shown.set(e.id, g);
        }
        g.traverse((n) => {
          if (n.material?.color && !ghost)
            n.material.color.set(
              selection.some((s) => s.entityId === e.id)
                ? 0x2186b1
                : n.isMesh
                  ? 0x7693a8
                  : 0x344e61,
            );
        });
      }
      preview().dirty();
    },
    setPreview(result) {
      if (!ensure()) return;
      for (const c of [...previewGroup.children]) dispose(c);
      for (const o of result?.outputs || [])
        previewGroup.add(draw(o.summary, "$preview", null, false, true));
      preview().dirty();
    },
    clearPreview() {
      if (previewGroup) for (const c of [...previewGroup.children]) dispose(c);
      preview().dirty();
    },
    pointAt(event, plane) {
      const { THREE, camera, canvas } = preview();
      if (!camera) return null;
      const r = canvas.getBoundingClientRect(),
        mouse = new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, camera);
      const x = new THREE.Vector3(...plane.xAxis),
        y = new THREE.Vector3(...plane.yAxis),
        normal = x.cross(y),
        p = new THREE.Plane().setFromNormalAndCoplanarPoint(
          normal,
          new THREE.Vector3(...plane.origin),
        ),
        point = new THREE.Vector3();
      return ray.ray.intersectPlane(p, point) ? point.toArray() : null;
    },
    hit(event, filter = "object") {
      if (!group) return [];
      const { THREE, camera, canvas } = preview(),
        r = canvas.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      const perPixel = camera.isOrthographicCamera
        ? (camera.top - camera.bottom) / camera.zoom / r.height
        : (2 *
            Math.tan((camera.fov * Math.PI) / 360) *
            camera.position.distanceTo(preview().controls.target)) /
          r.height;
      ray.params.Line.threshold = perPixel * 8;
      ray.params.Points.threshold = perPixel * 8;
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hits = ray
        .intersectObjects(group.children, true)
        .filter((h) => !h.object.parent.userData.ghost);
      const result = [];
      for (const hit of hits) {
        const data = hit.object.userData;
        if (!data.entityId) continue;
        let kind = null,
          topologyId = null;
        if (filter === "edge") {
          if (data.kind !== "edge") continue;
          kind = "edge";
          topologyId = data.topologyId;
        } else if (filter === "vertex") {
          if (data.kind !== "vertex") continue;
          kind = "vertex";
          topologyId = data.topologyId;
        } else if (filter === "face") {
          if (!hit.object.isMesh) continue;
          kind = "face";
          const g = hit.object.parent;
          const entity = g.userData.entityId;
          const faceIndex = data.triangleFaces?.[hit.faceIndex];
          topologyId = data.faceTopologyIds?.[faceIndex] || { faceIndex };
        }
        const key = data.entityId + ":" + JSON.stringify(topologyId);
        if (!result.some((r) => r.key === key))
          result.push({ key, entityId: data.entityId, kind, topologyId });
      }
      return result;
    },
    dispose() {
      if (group) dispose(group);
      if (previewGroup) dispose(previewGroup);
      shown.clear();
    },
  };
}
