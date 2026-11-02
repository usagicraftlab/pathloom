import { deriveVisibleEntities } from "./document.js";
import { stageEntities } from "./ui-interactions.js";
import { triangleIntersectsRectangle } from "../cad-face-selection.js";
export function createViewAdapter(preview, { pick = () => {} } = {}) {
  let group = null,
    previewGroup = null;
  let referencePlaneGroup = null;
  let originGroup = null;
  let cadGridGroup = null;
  let moveGhost = null;
  let gridState = { step: 1, minorOpacity: 0.1, key: null };
  let selectedReferencePlane = "XY";
  let stageFeatureId = null;
  let hoverSelection = null;
  let lastDocument = null;
  let lastSelection = [];
  let lastOptions = {};
  let previewSourceIds = [];
  let previewHasDelta = false;
  const shown = new Map();
  const collectedResources = {
    objects: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
  };
  function ensure() {
    const { THREE, scene } = preview();
    if (!scene) return false;
    if (!group) {
      group = new THREE.Group();
      group.name = "CAD exact display";
      scene.add(group);
      previewGroup = new THREE.Group();
      scene.add(previewGroup);
      referencePlaneGroup = new THREE.Group();
      referencePlaneGroup.name = "CAD reference planes";
      referencePlaneGroup.visible = false;
      scene.add(referencePlaneGroup);
      originGroup = new THREE.Group();
      originGroup.name = "CAD origin and XYZ axes";
      for (const [axis, color, label] of [
        [[1,0,0], 0xc4544b, "X"], [[0,1,0], 0x39985a, "Y"], [[0,0,1], 0x416cc1, "Z"],
      ]) {
        // CAD-local axes stay distinct from the screen-space direction widget.
        // Keep them deliberately small and thin so they do not read as geometry.
        originGroup.add(new THREE.ArrowHelper(new THREE.Vector3(...axis), new THREE.Vector3(), 18, color, 2.5, 1.2));
        const canvas = document.createElement("canvas");
        canvas.width = 64; canvas.height = 64;
        const context = canvas.getContext("2d");
        context.font = "bold 40px sans-serif";
        context.textAlign = "center";
        context.fillStyle = `#${color.toString(16).padStart(6,"0")}`;
        context.fillText(label, 32, 45);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        sprite.position.set(...axis.map((value) => value * 22));
        sprite.scale.set(4, 4, 1);
        originGroup.add(sprite);
      }
      originGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({color:0x40515c})));
      scene.add(originGroup);
      cadGridGroup = new THREE.Group();
      cadGridGroup.name = "CAD z=0 millimetre grid";
      scene.add(cadGridGroup);
    }
    return true;
  }
  function pixelScaleMm() {
    const { camera, canvas, controls } = preview();
    const height = canvas?.getBoundingClientRect().height || 1;
    if (!camera || !controls) return 1;
    return camera.isOrthographicCamera
      ? (camera.top - camera.bottom) / camera.zoom / height
      : 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.distanceTo(controls.target) / height;
  }
  function updateGrid(step = 1) {
    if (!ensure()) return;
    const { THREE, canvas, controls } = preview();
    const mm = pixelScaleMm();
    // Thin distant major lines independently of the actual snap interval.
    // Fixed 1 mm snapping must remain cheap even at the widest camera zoom.
    const major = step * 10 * Math.max(1, 10 ** Math.ceil(Math.log10(Math.max(1, mm * 5 / (step * 10)))));
    const span = mm * Math.max(canvas?.getBoundingClientRect().width || 800, canvas?.getBoundingClientRect().height || 600);
    const half = major * Math.max(10, Math.ceil(span / major));
    const center = [controls?.target.x || 0, controls?.target.y || 0].map((value) => Math.round(value / major) * major);
    const showMinor = step / Math.max(mm, 1e-12) >= 1.2;
    const opacity = Math.max(0, Math.min(0.15, (step / Math.max(mm, 1e-12) - 1.2) * 0.035));
    const key = [step, half, ...center, showMinor].join(":");
    if (key !== gridState.key) {
      for (const child of [...cadGridGroup.children]) dispose(child);
      for (const [spacing, color, alpha, minor] of [[step, 0x87979e, opacity, true], [major, 0x62757f, 0.30, false]]) {
        if (minor && !showMinor) continue;
        const positions = [];
        // Grid lines are aligned to world coordinates; fading never changes snap.
        for (let value = -half; value <= half + spacing * 0.01; value += spacing) {
          if (minor && Math.abs(value / major - Math.round(value / major)) < 1e-7) continue;
          positions.push(center[0] - half, center[1] + value, 0, center[0] + half, center[1] + value, 0,
            center[0] + value, center[1] - half, 0, center[0] + value, center[1] + half, 0);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false }));
        line.userData.minorGrid = minor;
        cadGridGroup.add(line);
      }
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2),
        new THREE.MeshBasicMaterial({ color: 0xb8c7cb, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
      plane.position.set(center[0], center[1], -0.002);
      cadGridGroup.add(plane);
    }
    for (const line of cadGridGroup.children) if (line.userData.minorGrid) line.material.opacity = opacity;
    gridState = { step, minorOpacity: opacity, key };
  }
  function dispose(object) {
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    let objects = 0;
    object.traverse((node) => {
      objects++;
      if (node.geometry) geometries.add(node.geometry);
      const values = Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [];
      for (const material of values) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    collectedResources.objects += objects;
    collectedResources.geometries += geometries.size;
    collectedResources.materials += materials.size;
    collectedResources.textures += textures.size;
    object.parent?.remove(object);
  }
  function resourceStats() {
    const objects = new Set(),
      geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    for (const root of [group, previewGroup].filter(Boolean))
      root.traverse((node) => {
        objects.add(node);
        if (node.geometry) geometries.add(node.geometry);
        const values = Array.isArray(node.material)
          ? node.material
          : node.material
            ? [node.material]
            : [];
        for (const material of values) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value?.isTexture) textures.add(value);
        }
      });
    return {
      objects: objects.size,
      geometries: geometries.size,
      materials: materials.size,
      textures: textures.size,
    };
  }
  function draw(
    summary,
    entityId,
    resultHash,
    ghost = false,
    temporary = false,
    displayColor = null,
  ) {
    const { THREE } = preview(),
      g = new THREE.Group();
    g.userData = { entityId, resultHash, ghost, volumeMm3: summary.volumeMm3 || 0 };
    const color = displayColor ?? (temporary ? 0x2ca66f : ghost ? 0x8a959d : 0x7693a8);
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
          color: displayColor ?? (temporary ? 0x2ca66f : 0x344e61),
          transparent: ghost || temporary,
          opacity: ghost ? 0.3 : temporary ? 0.6 : 1,
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
    showReferencePlanes(visible, selected = "XY") {
      if (!ensure()) return;
      referencePlaneGroup.visible = visible;
      selectedReferencePlane = selected;
      if (!visible) {
        preview().dirty();
        return;
      }
      if (!referencePlaneGroup.children.length) {
        const { THREE } = preview();
        for (const name of ["XY", "XZ", "YZ"]) {
          const geometry = new THREE.PlaneGeometry(80, 80);
          const material = new THREE.MeshBasicMaterial({
            color: name === "XY" ? 0x4aa878 : name === "XZ" ? 0x4f84c4 : 0xc68d46,
            transparent: true,
            opacity: 0.13,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geometry, material);
          if (name === "XZ") mesh.rotation.x = Math.PI / 2;
          if (name === "YZ") mesh.rotation.y = Math.PI / 2;
          mesh.userData.referencePlane = name;
          mesh.renderOrder = -1;
          mesh.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: material.color, transparent: true, opacity: 0.6 }),
          ));
          referencePlaneGroup.add(mesh);
        }
      }
      for (const mesh of referencePlaneGroup.children) {
        mesh.material.opacity = mesh.userData.referencePlane === selected ? 0.24 : 0.13;
      }
      preview().dirty();
    },
    hoverReferencePlane(name) {
      if (!referencePlaneGroup?.visible) return;
      for (const mesh of referencePlaneGroup.children) {
        mesh.material.opacity = mesh.userData.referencePlane === name
          ? 0.48 : mesh.userData.referencePlane === selectedReferencePlane ? 0.24 : 0.13;
        mesh.children[0].material.opacity = mesh.userData.referencePlane === name ? 1 : 0.6;
      }
      preview().dirty();
    },
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
    update(doc, selection = [], options = {}) {
      if (!ensure()) return;
      updateGrid(options.snapStep || 1);
      const { THREE } = preview();
      lastDocument = doc;
      lastSelection = selection;
      lastOptions = options;
      group.visible = document.body.dataset.workspaceMode === "model";
      previewGroup.visible = group.visible;
      originGroup.visible = group.visible;
      cadGridGroup.visible = group.visible;
      if (moveGhost) moveGhost.visible = group.visible;
      const visible = stageEntities(doc, stageFeatureId);
      const visibleStage = stageFeatureId == null;
      for (const feature of doc.features.filter((item) => item.status === "suppressed")) {
        const featureIndex = doc.features.indexOf(feature);
        const end = stageFeatureId == null ? Infinity : doc.features.findIndex((item) => item.id === stageFeatureId);
        if (featureIndex > end) continue;
        for (const slot of feature.outputSlots) {
          const entity = doc.entities.find((item) => item.id === slot.entityId);
          if (entity && entity.visibility !== "hidden" && !visible.some((item) => item.id === entity.id)) visible.push(entity);
        }
      }
      for (const r of visibleStage ? selection : []) {
        const e = doc.entities.find((e) => e.id === r.entityId);
        if (e && e.visibility !== "hidden" && !visible.some((v) => v.id === e.id)) visible.push(e);
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
          displayColor = options.colors?.[e.bodyId] || options.colors?.[e.id] || null,
          key = e.geometry.assetHash + ":" + ghost + ":" + displayColor;
        let g = shown.get(e.id);
        if (!g || g.userData.key !== key) {
          if (g) dispose(g);
          g = draw(
            e.displayCache || {},
            e.id,
            e.resultHash,
            ghost,
            false,
            displayColor ? Number.parseInt(displayColor.replace("#", ""), 16) : null,
          );
          g.userData.key = key;
          group.add(g);
          shown.set(e.id, g);
        }
        g.visible = true;
        const entitySelection = [
          ...selection,
          ...(hoverSelection ? [hoverSelection] : []),
        ].filter((item) => item.entityId === e.id);
        const wholeEntitySelected = entitySelection.some((item) => !item.kind);
        g.traverse((n) => {
          if (n.userData.selectionOverlay) return;
          if (n.material?.color && !ghost)
            n.material.color.set(
              previewSourceIds.includes(e.id)
                ? previewHasDelta ? 0x84949b : 0xd45c4b
                : wholeEntitySelected
                ? 0x2186b1
                : n.isMesh
                  ? displayColor ? Number.parseInt(displayColor.replace("#", ""), 16) : 0x7693a8
                  : displayColor ? Number.parseInt(displayColor.replace("#", ""), 16) : 0x344e61,
            );
          if (n.material && !ghost) {
            n.material.transparent = true;
            n.material.opacity = previewSourceIds.includes(e.id) ? 0.25 : n.isMesh ? 0.75 : 1;
          }
        });
        for (const overlay of g.children.filter((child) => child.userData.selectionOverlay))
          dispose(overlay);
        if (!ghost && !wholeEntitySelected) {
          for (const selected of entitySelection) {
            if (selected.kind === "face") {
              for (const mesh of g.children.filter((child) => child.isMesh)) {
                const faces = mesh.userData.faceTopologyIds;
                const triangles = mesh.userData.triangleFaces;
                if (!faces || !triangles) continue;
                const faceIndex = faces.indexOf(selected.topologyId);
                if (faceIndex < 0) continue;
                const indices = [];
                for (let triangle = 0; triangle < triangles.length; triangle++)
                  if (triangles[triangle] === faceIndex)
                    indices.push(...mesh.geometry.index.array.slice(triangle * 3, triangle * 3 + 3));
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute(
                  "position",
                  new THREE.BufferAttribute(
                    new Float32Array(mesh.geometry.getAttribute("position").array),
                    3,
                  ),
                );
                geometry.setIndex(indices);
                geometry.computeVertexNormals();
                const highlight = new THREE.Mesh(
                  geometry,
                  new THREE.MeshBasicMaterial({
                    color: selected.hover ? 0xf0a22e : 0xe16a42,
                    transparent: true,
                    opacity: 0.62,
                    side: THREE.DoubleSide,
                    depthTest: true,
                    depthWrite: false,
                    polygonOffset: true,
                    polygonOffsetFactor: -1,
                  }),
                );
                highlight.userData.selectionOverlay = true;
                highlight.renderOrder = 4;
                g.add(highlight);
              }
            } else if (selected.kind === "edge") {
              const edge = g.children.find(
                (child) => child.userData.kind === "edge" && child.userData.topologyId === selected.topologyId,
              );
              if (!edge) continue;
              const highlight = new THREE.Line(
                edge.geometry.clone(),
                new THREE.LineBasicMaterial({ color: selected.hover ? 0xf0a22e : 0xe16a42, depthTest: true }),
              );
              highlight.userData.selectionOverlay = true;
              highlight.renderOrder = 5;
              g.add(highlight);
            } else if (selected.kind === "vertex") {
              const vertex = g.children.find(
                (child) => child.userData.kind === "vertex" && child.userData.topologyId === selected.topologyId,
              );
              if (!vertex) continue;
              const highlight = new THREE.Points(
                vertex.geometry.clone(),
                new THREE.PointsMaterial({ color: selected.hover ? 0xf0a22e : 0xe16a42, size: 9, sizeAttenuation: false }),
              );
              highlight.userData.selectionOverlay = true;
              highlight.renderOrder = 6;
              g.add(highlight);
            }
          }
        }
        g.userData.selectable =
          !e.locked && e.visibility !== "hidden" && !ghost;
      }
      preview().dirty();
    },
    setPreview(result, { sourceEntityIds = [], removedOutputs = null } = {}) {
      if (!ensure()) return;
      previewSourceIds = [...sourceEntityIds];
      previewHasDelta = removedOutputs !== null;
      for (const c of [...previewGroup.children]) dispose(c);
      for (const o of result?.outputs || [])
        previewGroup.add(draw(o.summary, "$preview", null, false, true, 0x2ca66f));
      for (const o of removedOutputs || [])
        previewGroup.add(draw(o.summary, "$removed", null, false, true, 0xd45c4b));
      if (lastDocument) this.update(lastDocument, lastSelection, lastOptions);
      preview().dirty();
    },
    clearPreview() {
      if (previewGroup) for (const c of [...previewGroup.children]) dispose(c);
      previewSourceIds = [];
      previewHasDelta = false;
      if (lastDocument) this.update(lastDocument, lastSelection, lastOptions);
      preview().dirty();
    },
    pixelScaleMm,
    updateGrid,
    setOrbitTarget(point) {
      const { THREE, camera, controls } = preview();
      if (!camera || !controls || !point?.every(Number.isFinite)) return;
      const target = new THREE.Vector3(...point), delta = target.clone().sub(controls.target);
      if (delta.lengthSq() < 1e-16) return;
      camera.position.add(delta);
      controls.target.copy(target);
      camera.updateMatrixWorld(true);
      controls.update();
      preview().dirty();
    },
    setMoveGhost(entity) {
      if (moveGhost) { dispose(moveGhost); moveGhost = null; }
      if (entity && ensure()) {
        const summary = { ...entity.displayCache, preview: { curves: entity.displayCache?.preview?.curves || [], meshes: [], points: [] } };
        moveGhost = draw(summary, "$move-origin", entity.resultHash, true);
        moveGhost.name = "CAD move origin outline";
        preview().scene.add(moveGhost);
      }
      preview().dirty();
    },
    setStage(featureId) {
      stageFeatureId = featureId;
      if (lastDocument) this.update(lastDocument, lastSelection, lastOptions);
    },
    clearStage() {
      stageFeatureId = null;
      if (lastDocument) this.update(lastDocument, lastSelection, lastOptions);
    },
    hover(reference) {
      hoverSelection = reference ? { ...reference, hover: true } : null;
      if (lastDocument) this.update(lastDocument, lastSelection, lastOptions);
    },
    displayState() {
      return {
        stageFeatureId,
        gridStepMm: gridState.step,
        gridMinorOpacity: gridState.minorOpacity,
        moveGhostVisible: !!moveGhost?.visible,
        orbitTarget: preview().controls?.target.toArray(),
        entityIds: [...shown].filter(([, object]) => object.visible).map(([entityId]) => entityId),
        originVisible: !!originGroup?.visible,
        ghostEntityIds: [...shown].filter(([, object]) => object.visible && object.userData.ghost).map(([entityId]) => entityId),
        addedPreviewCount: previewGroup?.children.filter((object) => object.userData.entityId === "$preview").length || 0,
        removedPreviewCount: previewGroup?.children.filter((object) => object.userData.entityId === "$removed").length || 0,
        addedVolumeMm3: previewGroup?.children.filter((object) => object.userData.entityId === "$preview").reduce((sum, object) => sum + object.userData.volumeMm3, 0) || 0,
        removedVolumeMm3: previewGroup?.children.filter((object) => object.userData.entityId === "$removed").reduce((sum, object) => sum + object.userData.volumeMm3, 0) || 0,
        resources: resourceStats(),
        collectedResources: { ...collectedResources },
      };
    },
    project(point) {
      const { THREE, camera } = preview(),
        canvas = preview().canvas || document.getElementById("threeCanvas");
      if (!camera || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      camera.updateMatrixWorld(true);
      const projected = new THREE.Vector3(...point).project(camera);
      return {
        x: r.left + ((projected.x + 1) * r.width) / 2,
        y: r.top + ((1 - projected.y) * r.height) / 2,
        visible: projected.z >= -1 && projected.z <= 1,
      };
    },
    pointVisible(point) {
      const { THREE, camera } = preview();
      if (!camera || !group) return false;
      camera.updateMatrixWorld(true);
      const target = new THREE.Vector3(...point);
      const projected = target.clone().project(camera);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
      const front = ray.intersectObjects([...shown.values()].filter((object) => object.visible && !object.userData.ghost), true)
        .find((hit) => hit.object.isMesh && hit.object.parent.userData.selectable !== false);
      return !front || front.distance >= ray.ray.origin.distanceTo(target) - 1e-4;
    },
    entitiesInRect(doc, rect, touching = false) {
      const result = [];
      const inside = (point) => point?.visible && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
      const segmentTouches = (a, b) => {
        if (!a?.visible || !b?.visible) return false;
        let first = 0, last = 1;
        for (const [axis, low, high] of [["x", rect.left, rect.right], ["y", rect.top, rect.bottom]]) {
          const delta = b[axis] - a[axis];
          if (Math.abs(delta) < 1e-12) { if (a[axis] < low || a[axis] > high) return false; }
          else {
            const start = (low - a[axis]) / delta, end = (high - a[axis]) / delta;
            first = Math.max(first, Math.min(start, end)); last = Math.min(last, Math.max(start, end));
          }
        }
        return first <= last;
      };
      for (const entity of deriveVisibleEntities(doc)) {
        if (entity.locked) continue;
        const display = entity.displayCache?.preview || {};
        const curves = (display.curves || []).map((curve) => curve.points.map((point) => this.project(point)));
        const meshes = (display.meshes || []).map((mesh) => ({
          indices: mesh.indices,
          points: Array.from({length: mesh.positions.length / 3}, (_, index) => this.project(mesh.positions.slice(index * 3, index * 3 + 3))),
        }));
        const points = [...curves.flat(), ...meshes.flatMap((mesh) => mesh.points), ...(display.points || []).map((point) => this.project(point.point))];
        if (!points.length) continue;
        const selected = touching
          ? points.some(inside) || curves.some((curve) => curve.slice(1).some((point, index) => segmentTouches(curve[index], point))) ||
            meshes.some((mesh) => Array.from({length: mesh.indices.length / 3}, (_, index) => mesh.indices.slice(index * 3, index * 3 + 3).map((vertex) => mesh.points[vertex]))
              .some((triangle) => triangle.every((point) => point?.visible) && triangleIntersectsRectangle(triangle, rect)))
          : points.every(inside);
        if (selected) result.push(entity.id);
      }
      return result;
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
      const roots = filter === "workplane"
        ? referencePlaneGroup?.children || []
        : group.children;
      const hits = ray
        .intersectObjects(roots, true)
        .filter(
          (h) =>
            filter === "workplane" || (
              !h.object.parent.userData.ghost &&
              h.object.parent.userData.selectable !== false
            ),
        );
      const result = [];
      const nearestFace = hits.find((hit) => hit.object.isMesh && hit.object.userData.entityId)?.distance ?? Infinity;
      for (const hit of hits) {
        if (!hit.object.parent.visible) continue;
        if (["edge", "vertex"].includes(filter) && hit.distance > nearestFace + perPixel * 4) continue;
        const data = hit.object.userData;
        if (filter === "workplane" && data.referencePlane) {
          result.push({
            key: `workplane:${data.referencePlane}`,
            referencePlane: data.referencePlane,
            point: hit.point.toArray(),
          });
          break;
        }
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
          const faceIndex = data.triangleFaces?.[hit.faceIndex];
          topologyId = data.faceTopologyIds?.[faceIndex] || { faceIndex };
        }
        const key = data.entityId + ":" + JSON.stringify(topologyId);
        if (!result.some((r) => r.key === key))
          result.push({ key, entityId: data.entityId, kind, topologyId, point: hit.point.toArray() });
        if (filter === "face" && result.length) break;
      }
      return result;
    },
    dispose() {
      if (group) dispose(group);
      if (previewGroup) dispose(previewGroup);
      if (referencePlaneGroup) dispose(referencePlaneGroup);
      if (originGroup) dispose(originGroup);
      if (cadGridGroup) dispose(cadGridGroup);
      if (moveGhost) dispose(moveGhost);
      shown.clear();
    },
  };
}
