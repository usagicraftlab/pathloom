import { clone, id, sha256 } from "./document.js";

const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const finitePoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const unit = (p) => finitePoint(p) && Math.hypot(...p) > 1e-12
  ? p.map((v) => v / Math.hypot(...p)) : null;

export function inspectionPlane(origin, normal) {
  const n = unit(normal);
  if (!finitePoint(origin) || !n) throw new Error("Invalid inspection plane");
  const r = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const xAxis = unit(r.map((v, i) => v - dot(r, n) * n[i]));
  const yAxis = [n[1] * xAxis[2] - n[2] * xAxis[1],
    n[2] * xAxis[0] - n[0] * xAxis[2], n[0] * xAxis[1] - n[1] * xAxis[0]];
  return { origin: [...origin], xAxis, yAxis };
}

// Measurement only: neither a target reference nor an operation mode is added.
export function extrudeFaceDistance({ direction, bothSides, profilePoint, face,
  angularRad = 1e-5, linearMm = 1e-6 }) {
  const d = unit(direction), n = unit(face?.normal);
  if (!d || !n || !face.planar || !finitePoint(profilePoint) || !finitePoint(face.origin)) return null;
  const parallel = dot(d, n);
  if (Math.abs(parallel) < Math.cos(angularRad)) return null;
  const distance = dot(face.origin.map((v, i) => v - profilePoint[i]), n) / parallel;
  if (!Number.isFinite(distance) || Math.abs(distance) <= linearMm) return null;
  return distance * (bothSides ? 2 : 1);
}

// Analysis owns no document feature, draft, assets or transaction. At most one
// kernel request runs at a time; a drag coalesces pending work to its latest plane.
export class SectionInspection {
  constructor(store, changed = () => {}) {
    this.store = store;
    this.changed = changed;
    this.sequence = 0;
    this.running = false;
    this.pending = false;
    this.state = null;
  }
  start(entityIds, plane, extent) {
    this.stop();
    this.document = this.store.document;
    this.revision = this.document.documentRevision;
    this.state = { id: id(), entityIds: [...new Set(entityIds)], plane: clone(plane),
      extent, status: "pending", outputs: [] };
    this.setPlane(plane);
  }
  setPlane(plane) {
    if (!this.state) return;
    this.state.plane = clone(plane);
    this.state.outputs = [];
    this.state.status = "pending";
    this.sequence++;
    this.pending = true;
    this.changed(this.state);
    this.flush();
  }
  stop() {
    this.sequence++;
    this.pending = false;
    this.state = null;
    this.changed(null);
  }
  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending && this.state) {
        this.pending = false;
        const state = this.state, sequence = this.sequence, doc = this.document;
        const current = () => this.state === state && this.sequence === sequence &&
          this.store.document === doc && doc.documentRevision === this.revision;
        const plane = clone(state.plane);
        let result;
        try {
          const refs = { objects: state.entityIds.map((entityId) => ({ entityId, role: "objects" })) };
          const { prepared, inputHashes } = await this.store.resolve(refs);
          if (!current()) continue;
          const operation = { id: "shape.section", version: 1 }, parameters = { plane };
          const requestedHash = await sha256({ operation, parameters, inputHashes, tolerances: doc.tolerances });
          if (!current()) continue;
          const runtimeEpoch = this.store.native.runtimeEpoch;
          result = await this.store.native.evaluate({ documentId: doc.id,
            documentRevision: doc.documentRevision, sessionId: state.id, featureId: state.id,
            featureRevision: 0, previewSequence: sequence, requestedHash,
            intent: "preview", operation, parameters, inputs: prepared, tolerances: doc.tolerances });
          if (!current() || runtimeEpoch !== this.store.native.runtimeEpoch ||
              inputHashes.some((hash, i) => this.store.getEntity(state.entityIds[i])?.geometry.assetHash !== hash)) continue;
          state.status = result.status === "failed" ? "failed" : "ready";
          state.outputs = result.outputs || [];
          state.diagnostics = result.diagnostics || [];
          this.changed(state);
        } catch (error) {
          if (current()) {
            state.status = "failed";
            state.outputs = [];
            state.diagnostics = [{ message: error.message }];
            this.changed(state);
          }
        } finally {
          // The view keeps only summaries. Every temporary B-rep is released,
          // including stale, failed and closed-while-running replies.
          if (result?.outputs?.length) await this.store.native.release(result.outputs.map((o) => o.handle));
        }
      }
    } finally {
      this.running = false;
    }
  }
}
