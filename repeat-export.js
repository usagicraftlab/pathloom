// A session-only recipe, never cached output bytes or project/recovery data.
export class RepeatExport {
  constructor() {
    this.handlers = new Map();
    this.listeners = new Set();
    this.epoch = 0;
    this.busy = false;
    this.last = null;
  }
  register(kind, handler) { this.handlers.set(kind, handler); }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this);
    return () => this.listeners.delete(listener);
  }
  refresh() { for (const listener of this.listeners) listener(this); }
  clear() { this.epoch++; this.last = null; this.refresh(); }
  canRepeat() {
    try { return !!this.last && !this.busy && this.handlers.get(this.last.kind)?.valid(this.last.config) === true; }
    catch { return false; }
  }
  export(kind, config) { return this.perform({ kind, config: structuredClone(config) }, false); }
  repeat() {
    if (!this.last) return Promise.reject(new Error("通常の書き出しを先に実行してください"));
    return this.perform(structuredClone(this.last), true);
  }
  async perform(recipe, repeat) {
    if (this.busy) throw new Error("書き出しの完了を待ってください");
    const handler = this.handlers.get(recipe.kind), epoch = this.epoch;
    if (!handler || repeat && !handler.valid(recipe.config)) throw new Error("前回の書き出し対象を確認してください");
    const current = () => {
      if (epoch !== this.epoch) throw new Error("文書が切り替わったため書き出しを中止しました");
    };
    this.busy = true;
    this.refresh();
    try {
      const payload = await handler.prepare(recipe.config, current);
      current();
      const saved = await handler.write(payload, repeat ? recipe.destination : undefined);
      // A cancelled save preserves the last successful recipe. A completion from
      // a replaced document cannot revive it, even when the OS write had begun.
      if (saved != null && epoch === this.epoch) this.last = { ...recipe, destination: saved.destination ?? null };
      return saved;
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
}

export const repeatExport = new RepeatExport();
