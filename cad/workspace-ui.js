import { packageShapes } from "./shape-library.js";
import { constrainedRectangle } from "./sketch/model.js";
import { SketchSolverClient } from "./sketch/worker-client.js";
import { bindBody, generationInput } from "./generation-adapter.js";
import { CadStore } from "./store.js";
import { NativeCadClient } from "./native-client.js";
import { createViewAdapter } from "./view-adapter.js";
import {
  createCadDocument,
  clone,
  deriveVisibleEntities,
  id,
  canonical,
} from "./document.js";
import {
  findCommands,
  commandById,
  registerCommand,
  validateCommandDefinition,
} from "./commands/registry.js";
import {
  createCommandSession,
  dispatchSession,
  sessionReady,
  rectanglePointKeys,
  setRectangleMode,
} from "./commands/session.js";
import {
  parseScalar,
  parseCoordinate,
  validateDrawingPlane,
  inDrawingPlane,
} from "./commands/input.js";
import { makeSubshapeRef } from "./references.js";
const $ = (id) => document.getElementById(id);
const labels = {
  anchor: "基準点 XYZ",
  point: "点 XYZ",
  start: "始点 XYZ",
  end: "終点 XYZ",
  center: "中心 XYZ",
  widthMm: "幅 mm",
  heightMm: "高さ mm",
  depthMm: "奥行 mm",
  radiusMm: "半径 mm",
  distanceMm: "距離 mm（両側は合計）",
  direction: "方向 XYZ",
  cap: "蓋を作る",
  bothSides: "両側",
  rounding: "角丸",
  cornerRadiusMm: "角丸半径 mm",
  thicknessMm: "厚み mm",
  frameMode: "フレーム",
  style: "Loft方式",
  closed: "閉じる",
  plane: "作業平面",
  translation: "移動 XYZ",
  axis: "軸（原点・方向）",
  angleRad: "角度 rad",
  anchorMode: "基準モード",
  keepTools: "工具を保持する",
};
export function initModelWorkspace(api) {
  let library = [],
    globalCommands = [],
    recoveryChecked = false,
    lastAutosave = 0,
    autosaveTimer = null,
    autosaveRevision = -1,
    draftVersion = 0,
    savedDraftVersion = -1;
  let lastCommand = null;
  let session = null,
    selectedFeature = null,
    status = "CADを開くと正確な形状ランタイムを起動します。",
    pointStep = 0,
    lastPoint = null,
    activeInputKey = null,
    commitBusy = false,
    previewTimer = null,
    previewBusy = false,
    previewAgain = false,
    previewHandles = [],
    ready = false,
    runtimeStart = null,
    selection = [],
    view;
  const solver = new SketchSolverClient();
  const bindingStamps = new Map();
  const native = new NativeCadClient(),
    store = new CadStore(native, { changed: () => render() });
  const panel = document.createElement("section");
  panel.id = "modelPanel";
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", "modeModel");
  panel.innerHTML = `<aside class="model-left"><header><strong>CAD · 形状作成</strong><button id="modelUndo" aria-label="CAD Undo" title="Undo">↶</button><button id="modelRedo" aria-label="CAD Redo" title="Redo">↷</button></header><label>コマンド検索<input id="modelCommandSearch" placeholder="長方形 / Line / Extrude" autocomplete="off"></label><div id="modelCommands" class="model-command-list"></div><div id="modelSession" role="status"></div><div class="model-workplane"><label>作業平面<select id="modelPlane"><option>XY</option><option>XZ</option><option>YZ</option></select></label><label>選択<select id="modelPickFilter"><option value="object">形状</option><option value="face">面</option><option value="edge">edge</option><option value="vertex">頂点</option></select></label><label><input id="modelSnap" type="checkbox" checked>端点・中心スナップ</label><button id="modelFit">選択にFit</button><label>座標入力<input id="modelCoordinate" placeholder="x,y,z または @dx,dy,dz"></label></div><div class="model-actions"><button id="modelPreview">プレビュー</button><button id="modelCommit" class="primary">確定</button><button id="modelCancel">キャンセル</button></div><p id="modelStatus" role="status"></p><details id="modelDiagnostics"><summary>診断・解決</summary><div></div></details><details><summary>最近の操作</summary><ol id="modelLog"></ol></details><details><summary>コマンドを追加</summary><label>登録済み演算を使うJSON定義<textarea id="modelCommandDefinition" rows="8"></textarea></label><button id="modelRegister">定義を検証して追加</button></details><details><summary>形状Library</summary><label>保存名<input id="modelShapeName" value="CAD shape"></label><label><input id="modelShapeHistory" type="checkbox" checked>依存履歴を含める</label><button id="modelSaveShape">選択形状を保存</button><div id="modelShapeEntries"></div></details><details><summary>About · 依存・権利表示</summary><p>Pathloom独自のCAD操作。正確な演算にはOCP / OCCTを使用します。</p><a href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">第三者ソフトウェアの表示と原文の場所</a><p>配布物の全依存監査・OCCT例外本文の照合は未完です。</p></details><small>左クリック：作図／選択 · Shift：追加選択<br>右ドラッグ：回転 · 中ドラッグ：移動<br>Enter：確定 · Esc：中断</small></aside><aside class="model-right"><section class="model-inspector"><header><strong>設定・プロパティ</strong></header><div id="modelProperties"></div></section><section class="model-history"><header><strong>作成履歴</strong><button id="modelRetry">再計算</button></header><div id="modelHistory"></div></section></aside>`;
  document.body.append(panel);
  view = createViewAdapter(api.preview);
  const log = [];
  function setStatus(text) {
    status = text;
    $("modelStatus").textContent = text;
  }
  function active() {
    return document.body.dataset.workspaceMode === "model";
  }
  function report(error) {
    setStatus(error.message || String(error));
  }
  // Transient editing state only; project/recovery restoration is a separate contract.
  const invalidFields = new Map();
  function restoreEditing(input, key) {
    const pending = invalidFields.get(key);
    if (pending) {
      input.value = pending.value;
      input.setCustomValidity(pending.message);
    }
  }
  function invalidInput(input, key, error) {
    input.setCustomValidity(error.message);
    invalidFields.set(key, { value: input.value, message: error.message });
    invalidateDrawingPreview();
  }
  function invalidateDrawingPreview() {
    if (session) {
      session.previewSequence++;
      session.result = null;
    }
    clearTimeout(previewTimer);
    previewAgain = false;
    view.clearPreview();
  }
  function rejectDrawingPoint(error) {
    invalidateDrawingPreview();
    if (session) session.state = "repairing";
    report(error);
  }
  function inputPlane(forClick = false) {
    const plane = clone(
      session?.parameters.plane || store.document.uiState.workPlane,
    );
    validateDrawingPlane(plane);
    if (forClick && session && pointStep % 2 === 1) {
      const operation = session.command.baseOperation.id;
      if (operation === "curve.circle")
        plane.origin = clone(session.parameters.center);
      if (
        operation === "curve.rectangle" &&
        session.drawingMode !== "threePoints"
      )
        plane.origin = clone(
          session.drawingMode === "twoCorners"
            ? session.inputValues.rectangleA
            : session.parameters.anchor,
        );
    }
    return plane;
  }
  async function startRuntime() {
    // Readiness includes the initial libraries: registration must not race an
    // older library snapshot or a second initialization's status update.
    if (runtimeStart) return runtimeStart;
    if (ready) return;
    runtimeStart = (async () => {
      try {
        const hello = await native.start();
        ready = true;
        store.document.kernel.version = hello.occtVersion ?? null;
        store.document.kernel.bindingVersion = hello.ocpVersion;
        setStatus(`OCCT（OCP ${hello.ocpVersion}） · 正確な形状で作図できます`);
        await loadCommands();
        await loadLibrary();
        await checkRecovery();
      } catch (error) {
        report(error);
      }
    })();
    try {
      return await runtimeStart;
    } finally {
      runtimeStart = null;
    }
  }

  function saveDraft() {
    if (session && !["committed", "cancelled"].includes(session.state)) {
      const draft = clone(session);
      draft.result = null;
      store.document.draftSessions = [
        ...store.document.draftSessions.filter((d) => d.id !== session.id),
        draft,
      ];
      draftVersion++;
      queueAutosave();
    }
  }
  function cancel() {
    invalidFields.clear();
    clearTimeout(previewTimer);
    if (session) {
      session.previewSequence++;
      session.state = "cancelled";
      store.document.draftSessions = store.document.draftSessions.filter(
        (d) => d.id !== session.id,
      );
    }
    store.cancelJobs();
    session = null;
    view.clearPreview();
    previewHandles = [];
    setStatus("未確定操作を破棄しました。確定済み形状は保持しています。");
    render();
  }
  async function begin(command) {
    lastCommand = clone(command);
    if (session) {
      saveDraft();
      view.clearPreview();
    }
    selectedFeature = null;
    pointStep = 0;
    lastPoint = null;
    activeInputKey = null;
    invalidFields.clear();
    snapPoint = null;
    session = createCommandSession(command, {
      selection: selection
        .filter((r) => {
          const e = store.getEntity(r.entityId);
          return e && !e.locked && e.visibility !== "hidden";
        })
        .map((r) => ({
          ...r,
          entityKind: store.getEntity(r.entityId)?.kind,
        })),
    });
    store.document.commandDefinitions.some(
      (d) => d.id === command.id && d.version === command.version,
    ) || store.document.commandDefinitions.push(clone(command));
    if (command.defaults.plane)
      session.parameters.plane = clone(store.document.uiState.workPlane);
    setStatus("設定・入力を指定し、プレビューまたは確定してください。");
    if (command.id === "transform.move" && selection.length > 1)
      setStatus(
        "Moveは形状1件が対象です。入力欄または画面から対象を1件選んでください。",
      );
    render();
    await startRuntime();
  }
  function properties() {
    const host = $("modelProperties");
    host.replaceChildren();
    const f = selectedFeature && store.getFeature(selectedFeature);
    const params =
      session?.parameters ||
      (f?.operation.id === "asset.snapshot"
        ? null
        : f?.operation.id === "solid.difference"
          ? { keepTools: false, ...f.parameters }
          : f?.parameters);
    if (!params) {
      const e = store.getEntity(selection[0]?.entityId);
      if (e) {
        const name = document.createElement("input");
        name.value = e.name || "形状";
        name.setAttribute("aria-label", "形状名");
        name.addEventListener("change", () => {
          e.name = name.value;
          store.document.documentRevision++;
          render();
        });
        host.append(name);
        const text = document.createElement("p");
        text.textContent = `${e.kind} · ${e.closure.enclosesVolume ? "閉体積" : "開いた形状を含む"}\n${e.displayCache?.volumeMm3?.toFixed(3) || 0} mm³`;
        host.append(text);
        const use = document.createElement("button");
        use.textContent = "生成で使用（現在のbody結果）";
        use.onclick = () => {
          try {
            const f = store.getFeature(e.producer.featureId);
            if (!["valid", "warning"].includes(f?.status))
              throw new Error("未解決の古い形状は生成に渡せません");
            const binding = bindBody(store.document, e);
            store.resolveBindings();
            updateBindings();
            setStatus("生成入力へ接続しました。ノード配線は変更していません。");
          } catch (error) {
            report(error);
          }
        };
        if (e.kind === "curve" || e.displayCache?.preview?.meshes?.length) {
          host.append(use);
          for (const binding of store.document.outputBindings.filter(
            (binding) => ["split", "missing"].includes(binding.status),
          )) {
            const repair = document.createElement("button");
            repair.textContent = `「${binding.name}」の生成参照をこの形状へ変更`;
            repair.onclick = () => {
              try {
                store.rebindOutput(binding.id, e.id);
                setStatus(
                  "生成参照を修復しました。既存のノード配線を維持します。",
                );
              } catch (error) {
                report(error);
              }
            };
            host.append(repair);
          }
        } else {
          const note = document.createElement("p");
          note.textContent =
            "この形状はCAD内で保存・編集できます。生成入力へのadapterは未対応です。";
          host.append(note);
        }
        for (const [label, key] of [
          ["非表示", "visibility"],
          ["ロック", "locked"],
        ]) {
          const b = document.createElement("button");
          b.textContent = label;
          b.onclick = () => {
            e[key] =
              key === "visibility"
                ? e.visibility === "hidden"
                  ? "visible"
                  : "hidden"
                : !e.locked;
            render();
          };
          host.append(b);
        }
      }
      return;
    }
    if (f && f.operation.id === "curve.rectangle" && !f.sketchId) {
      const constrained = document.createElement("button");
      constrained.textContent = "拘束付きスケッチとして編集";
      constrained.onclick = async () => {
        try {
          const params = f.parameters,
            pl = clone(params.plane);
          pl.origin = clone(params.anchor);
          const center =
              params.anchorMode === "center"
                ? [0, 0]
                : [params.widthMm / 2, params.heightMm / 2],
            sketch = constrainedRectangle({
              widthMm: params.widthMm,
              heightMm: params.heightMm,
              center,
              plane: pl,
            }),
            result = await solver.solve(sketch);
          if (result.status !== "solved")
            throw new Error("初期拘束を解けませんでした");
          sketch.solveReport = {
            status: result.status,
            degreesOfFreedom: result.degreesOfFreedom,
          };
          await store.attachSketch(f.id, sketch);
          properties();
        } catch (error) {
          report(error);
        }
      };
      host.append(constrained);
    }
    if (f?.sketchId) {
      const sketch = store.document.sketches.find((s) => s.id === f.sketchId),
        caption = document.createElement("p");
      caption.textContent = `平面スケッチ · 自由度 ${sketch.solveReport?.degreesOfFreedom ?? "未計算"} · ${sketch.solveReport?.status || ""}`;
      host.append(caption);
      const base = sketch.draft || sketch;
      for (const constraint of base.constraints) {
        const row = document.createElement("label");
        row.textContent = constraint.label || constraint.kind;
        const input = document.createElement("input");
        input.type =
          typeof constraint.value === "number" ? "number" : "checkbox";
        if (input.type === "number") {
          input.value = constraint.value;
          input.setAttribute(
            "aria-label",
            `スケッチ ${constraint.label || constraint.kind}`,
          );
        } else {
          input.checked = !constraint.suppressed;
          input.setAttribute("aria-label", `拘束 ${constraint.kind}`);
        }
        input.onchange = async () => {
          try {
            const next = clone(base),
              c = next.constraints.find((c) => c.id === constraint.id);
            if (input.type === "number") c.value = parseScalar(input.value);
            else c.suppressed = !input.checked;
            const result = await solver.solve(next);
            store.updateSketch(f.id, result);
            if (result.status === "no-convergence")
              setStatus(
                "拘束が未収束です。前回の形状と変更中の指定を別々に保持しました。",
              );
            properties();
          } catch (error) {
            report(error);
          }
        };
        row.append(input);
        host.append(row);
      }
      const advanced = document.createElement("details"),
        summary = document.createElement("summary");
      summary.textContent = "拘束を追加・修正（構造化定義）";
      advanced.append(summary);
      const editor = document.createElement("textarea");
      editor.value = JSON.stringify(base.constraints, null, 2);
      editor.setAttribute("aria-label", "スケッチ拘束定義");
      editor.rows = 8;
      const apply = document.createElement("button");
      apply.textContent = "拘束を検証して解く";
      apply.onclick = async () => {
        try {
          const next = clone(base);
          next.constraints = JSON.parse(editor.value);
          const result = await solver.solve(next);
          store.updateSketch(f.id, result);
          properties();
        } catch (error) {
          report(error);
        }
      };
      advanced.append(editor, apply);
      host.append(advanced);
      if (sketch.draft) {
        const discard = document.createElement("button");
        discard.textContent = "未収束の拘束変更を取り消す";
        discard.onclick = () => {
          delete sketch.draft;
          properties();
        };
        host.append(discard);
      }
    }
    if (f) {
      const shapeButton = document.createElement("button");
      shapeButton.textContent = "結果のプロパティ・生成接続";
      shapeButton.onclick = () => {
        selectedFeature = null;
        selection = f.outputSlots.map((s) => ({ entityId: s.entityId }));
        properties();
      };
      host.append(shapeButton);
      const caption = document.createElement("p");
      caption.textContent = `${f.name} · ${f.status}`;
      host.append(caption);
    }
    const settingsForm = document.createElement("form");
    settingsForm.id = "modelSettingsForm";
    settingsForm.onsubmit = (event) => event.preventDefault();
    const draft = clone(params),
      draftTolerance = clone(f?.toleranceOverrides || {});
    if (session?.command.id === "C04") {
      const label = document.createElement("label"),
        select = document.createElement("select");
      label.textContent = "作図モード";
      select.setAttribute("aria-label", "長方形の作図モード");
      for (const [value, text] of [
        ["center", "中心＋幅・高さ"],
        ["twoCorners", "2コーナー"],
        ["threePoints", "3点"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      select.value = session.drawingMode || "center";
      select.onchange = () => {
        try {
          setRectangleMode(session, select.value);
          pointStep = 0;
          lastPoint = null;
          snapPoint = null;
          invalidFields.clear();
          saveDraft();
          properties();
          queuePreview();
        } catch (error) {
          report(error);
          select.value = session.drawingMode || "center";
        }
      };
      label.append(select);
      settingsForm.append(label);
      if (session.drawingMode && session.drawingMode !== "center")
        for (const [i, key] of rectanglePointKeys(session).entries()) {
          const label = document.createElement("label"),
            input = document.createElement("input");
          label.textContent = `作図点 ${i + 1} XYZ`;
          input.setAttribute("aria-label", label.textContent);
          input.value = JSON.stringify(session.inputValues[key]);
          restoreEditing(input, key);
          input.oninput = () => {
            try {
              const p = input.value.trim().startsWith("[")
                ? JSON.parse(input.value)
                : parseCoordinate(input.value, {
                    previous:
                      session.inputValues[rectanglePointKeys(session)[i - 1]] ||
                      null,
                    plane: inputPlane(),
                  });
              if (
                !Array.isArray(p) ||
                p.length !== 3 ||
                !p.every(Number.isFinite)
              )
                throw new Error("有限のXYZを指定してください");
              session.inputValues[key] = p;
              lastPoint = p;
              session.previewSequence++;
              session.result = null;
              invalidFields.delete(key);
              input.setCustomValidity("");
              saveDraft();
              queuePreview();
            } catch (error) {
              invalidInput(input, key, error);
            }
          };
          label.append(input);
          settingsForm.append(label);
        }
    }
    const note = document.createElement("p");
    const commandId = session?.command.id || f?.command.id;
    note.textContent =
      commandId === "C02"
        ? "始点・終点で作図します。方向＋長さモードは未対応です。"
        : commandId === "C06"
          ? "中心＋半径で作図します。直径・2端点・3点モードは未対応です。"
          : commandId === "transform.move"
            ? "対象は形状1件です。複数形状の一括Moveは未対応です。"
            : "";
    if (note.textContent) settingsForm.append(note);
    for (const [key, value] of Object.entries(f?.sketchId ? {} : params)) {
      if (
        session?.command.id === "C04" &&
        session.drawingMode &&
        session.drawingMode !== "center" &&
        (["anchor", "anchorMode", "widthMm", "heightMm"].includes(key) ||
          (session.drawingMode === "threePoints" && key === "plane"))
      )
        continue;
      if (key === "translation" && Array.isArray(value)) {
        for (const [i, axis] of ["X", "Y", "Z"].entries()) {
          const label = document.createElement("label"),
            input = document.createElement("input");
          label.textContent = `移動 ${axis} mm`;
          input.setAttribute("aria-label", label.textContent);
          input.value = value[i];
          const rawKey = `translation.${i}`;
          restoreEditing(input, rawKey);
          input.oninput = () => {
            try {
              const vector = [
                ...(session?.parameters.translation || draft.translation),
              ];
              vector[i] = parseScalar(input.value);
              draft.translation = vector;
              invalidFields.delete(rawKey);
              input.setCustomValidity("");
              if (session) {
                dispatchSession(session, {
                  type: "setting.change",
                  key,
                  value: vector,
                });
                saveDraft();
                queuePreview();
              }
            } catch (error) {
              invalidInput(input, rawKey, error);
            }
          };
          label.append(input);
          settingsForm.append(label);
        }
        continue;
      }
      const label = document.createElement("label");
      label.textContent = labels[key] || key;
      const input =
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? document.createElement("textarea")
          : document.createElement("input");
      input.dataset.parameter = key;
      input.setAttribute("aria-label", labels[key] || key);
      const operation = session?.command.baseOperation.id || f?.operation.id;
      if (
        key === "tangentChain" ||
        (operation === "surface.loft" && key === "closed") ||
        (operation === "surface.offset" &&
          ["bothSides", "solidify"].includes(key))
      ) {
        input.disabled = true;
        input.title =
          "このオプションは未実装です。現在の対応範囲はコマンド台帳を参照してください。";
      }
      if (typeof value === "boolean") {
        input.type = "checkbox";
        input.checked = value;
      } else
        input.value =
          typeof value === "object"
            ? JSON.stringify(value)
            : value === null
              ? "null"
              : String(value);
      restoreEditing(input, key);
      input.addEventListener("input", () => {
        try {
          const v =
            typeof value === "boolean"
              ? input.checked
              : typeof value === "number"
                ? key.toLowerCase().includes("anglerad")
                  ? parseScalar(
                      /(?:deg|rad)\s*$/i.test(input.value)
                        ? input.value
                        : input.value + "rad",
                      "angle",
                    )
                  : parseScalar(input.value)
                : typeof value === "object"
                  ? JSON.parse(input.value)
                  : input.value;
          draft[key] = v;
          invalidFields.delete(key);
          if (
            ["start", "end", "center", "anchor"].includes(key) &&
            Array.isArray(v) &&
            v.length === 3 &&
            v.every(Number.isFinite)
          ) {
            lastPoint = v;
            pointStep = key === "end" ? 2 : 1;
          }
          if (key === "plane") snapPoint = null;
          if (session) {
            dispatchSession(session, { type: "setting.change", key, value: v });
            saveDraft();
            queuePreview();
          }
          input.setCustomValidity("");
        } catch (error) {
          invalidInput(input, key, error);
          if (session) {
            session.rawDraft[key] = input.value;
            saveDraft();
          }
        }
      });
      label.append(input);
      settingsForm.append(label);
    }
    host.append(settingsForm);
    if (
      (session?.command.baseOperation.id || f?.operation.id)?.endsWith(".join")
    ) {
      const label = document.createElement("label");
      label.textContent = "Join許容差 mm";
      const input = document.createElement("input");
      input.setAttribute("aria-label", "Join許容差 mm");
      input.dataset.tolerance = "joinLinearMm";
      input.value =
        session?.toleranceOverrides?.joinLinearMm ??
        f?.toleranceOverrides?.joinLinearMm ??
        store.document.tolerances.joinLinearMm;
      input.oninput = () => {
        try {
          const v = parseScalar(input.value);
          if (v <= 0) throw new Error("正の許容差を指定してください");
          input.setCustomValidity("");
          if (session) {
            session.toleranceOverrides ??= {};
            session.toleranceOverrides.joinLinearMm = v;
            session.previewSequence++;
            saveDraft();
            queuePreview();
          } else draftTolerance.joinLinearMm = v;
        } catch (error) {
          input.setCustomValidity(error.message);
        }
      };
      label.append(input);
      settingsForm.append(label);
    }
    if (session)
      for (const slot of session.command.inputs.filter(
        (s) => s.kind === "point",
      )) {
        const label = document.createElement("label");
        label.textContent = slot.prompt || slot.key;
        const input = document.createElement("input");
        input.value = session.inputValues?.[slot.key]
          ? JSON.stringify(session.inputValues[slot.key])
          : "";
        input.setAttribute("aria-label", `CAD point ${slot.key}`);
        input.onchange = () => {
          try {
            const p = input.value.trim().startsWith("[")
              ? JSON.parse(input.value)
              : parseCoordinate(input.value, {
                  plane: store.document.uiState.workPlane,
                });
            if (
              !Array.isArray(p) ||
              p.length !== 3 ||
              !p.every(Number.isFinite)
            )
              throw new Error("XYZを指定してください");
            session.inputValues[slot.key] = p;
            session.previewSequence++;
            saveDraft();
            queuePreview();
            render({ keepProperties: true });
          } catch (error) {
            report(error);
          }
        };
        label.append(input);
        host.append(label);
      }
    const specs =
      session?.command.inputs ||
      commandById(f?.command.id, f?.command.version)?.inputs ||
      [];
    for (const slot of specs.filter((s) =>
      ["entity", "subshape"].includes(s.kind),
    )) {
      const label = document.createElement("label");
      const roleLabel =
        (session?.command.baseOperation.id || f?.operation.id) ===
        "solid.difference"
          ? slot.prompt
          : slot.key;
      label.textContent = `${roleLabel} · ${slot.kind === "subshape" ? "面/edge" : "形状"}（順序を保持）`;
      const select = document.createElement("select");
      select.multiple = slot.maxCount !== 1;
      select.size =
        slot.maxCount === 1
          ? 1
          : Math.min(5, Math.max(2, store.document.entities.length));
      select.setAttribute("aria-label", `CAD input ${slot.key}`);
      select.onfocus = () => {
        activeInputKey = slot.key;
      };
      if (slot.maxCount === 1) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "対象を選択";
        select.append(o);
      }
      const refs = session?.inputs[slot.key] || f?.inputs[slot.key] || [];
      const candidates = (
        selectedFeature
          ? store.document.entities
          : deriveVisibleEntities(store.document)
      ).filter((e) => !e.locked);
      for (const e of candidates) {
        if (slot.kind === "subshape") {
          const allowed = (session?.inputs.body || f?.inputs.body || []).map(
            (r) => r.entityId,
          );
          if (allowed.length && !allowed.includes(e.id)) continue;
          for (const t of e.displayCache?.topology || [])
            if (slot.allowedEntityKinds.includes(t.kind)) {
              const o = document.createElement("option");
              o.value = JSON.stringify(makeSubshapeRef(e, t));
              o.textContent = `${e.name || e.kind} · ${t.semanticPath?.join("/") || t.topologyId.split(":").slice(-2).join("/") + " · " + t.fingerprint.centroid.map((n) => n.toFixed(2)).join(",")}`;
              o.selected = refs.some(
                (r) => r.entityId === e.id && r.topologyId === t.topologyId,
              );
              select.append(o);
            }
        } else if (slot.allowedEntityKinds.includes(e.kind)) {
          const o = document.createElement("option");
          o.value = JSON.stringify({ entityId: e.id, role: slot.key });
          o.textContent = e.name || e.kind;
          o.selected = refs.some((r) => r.entityId === e.id);
          select.append(o);
        }
      }
      select.onchange = () => {
        const refs = [...select.selectedOptions]
          .filter((o) => o.value)
          .map((o) => JSON.parse(o.value));
        if (session) {
          dispatchSession(session, { type: "input.set", key: slot.key, refs });
          saveDraft();
          queuePreview();
        } else store.repair(f.id, slot.key, refs).catch(report);
      };
      label.append(select);
      host.append(label);
    }
    if (f) {
      const apply = document.createElement("button");
      apply.textContent = "設定変更を確定";
      apply.onclick = () => {
        if (settingsForm.reportValidity())
          store
            .edit(f.id, draft, { toleranceOverrides: draftTolerance })
            .catch(report);
      };
      host.append(apply);
      const hide = document.createElement("button");
      hide.textContent =
        f.status === "suppressed" ? "抑制を解除" : "操作を抑制";
      hide.onclick = () =>
        store.suppress(f.id, f.status !== "suppressed").catch(report);
      host.append(hide);
      const remove = document.createElement("button");
      remove.textContent = "削除（後段を未解決で残す）";
      remove.onclick = () => {
        store.remove(f.id);
        selectedFeature = null;
        render();
      };
      host.append(remove);
    }
  }
  function updateBindings() {
    for (const b of store.document.outputBindings) {
      const stamp = `${b.status}:${b.resolvedResultHash}:${b.resolvedEntityId}`;
      if (bindingStamps.get(b.id) === stamp) continue;
      const entity = store.getEntity(b.resolvedEntityId);
      if (b.status === "ready" && entity) {
        const input = generationInput(
          b,
          entity,
          store.document.assets[entity.geometry.assetHash],
        );
        window.PathloomCad?.upsertCadBinding?.({
          bindingId: b.id,
          status: b.status,
          input,
        });
      } else
        window.PathloomCad?.upsertCadBinding?.({
          bindingId: b.id,
          status: b.status,
        });
      bindingStamps.set(b.id, stamp);
    }
  }
  function render({ keepProperties = false } = {}) {
    if (!panel.isConnected) return;
    $("modelStatus").textContent = status;
    const q = $("modelCommandSearch").value;
    const list = $("modelCommands");
    list.replaceChildren();
    for (const command of findCommands(q)) {
      const b = document.createElement("button");
      b.textContent = command.displayName;
      b.title = command.description;
      b.onclick = () => begin(command).catch(report);
      list.append(b);
    }
    $("modelSession").textContent = session
      ? `${session.command.displayName} · ${session.state} · ${sessionReady(session) ? "入力済み" : "入力を選択してください"}`
      : "待機中";
    $("modelCommit").disabled = !session || session.state === "committing";
    $("modelPreview").disabled = !session || session.state === "committing";
    if (!keepProperties && !document.activeElement?.closest("#modelProperties"))
      properties();
    const history = $("modelHistory");
    history.replaceChildren();
    for (const f of store.document.features) {
      const b = document.createElement("button");
      b.className = "model-history-entry";
      b.dataset.featureId = f.id;
      b.setAttribute("aria-pressed", String(selectedFeature === f.id));
      b.textContent = `${f.name} · ${f.status}${!["valid", "warning", "empty"].includes(f.status) && f.lastValid ? " · 更新前を表示" : ""}`;
      b.onclick = () => {
        invalidFields.clear();
        saveDraft();
        session = null;
        view.clearPreview();
        selectedFeature = f.id;
        selection = f.outputSlots.map((s) => ({ entityId: s.entityId }));
        properties();
        render();
      };
      history.append(b);
    }
    const diagnostics = [
      ...(session?.diagnostics || []),
      ...store.document.features
        .filter((f) => f.id === selectedFeature)
        .flatMap((f) => f.diagnostics),
    ];
    const detail = $("modelDiagnostics").querySelector("div");
    detail.replaceChildren();
    for (const d of diagnostics) {
      const p = document.createElement("p");
      p.textContent = `${d.code}: ${d.message}`;
      detail.append(p);
      for (const action of d.actions || []) {
        const b = document.createElement("button");
        b.textContent = action.label || action.id;
        b.onclick = () => {
          if (action.id === "restartRuntime")
            native
              .restart()
              .then(() => {
                store.handles.clear();
                setStatus("再起動しました。再計算を実行できます。");
              })
              .catch(report);
          else if (action.id === "retry") store.recompute().catch(report);
          else {
            selectedFeature = d.featureId || selectedFeature;
            properties();
            $("modelProperties").scrollIntoView({ block: "nearest" });
            if (action.id === "editTolerance")
              $("modelProperties")
                .querySelector("[data-tolerance=joinLinearMm]")
                ?.focus();
            if (action.id === "editRadius")
              $("modelProperties")
                .querySelector("[data-parameter=radiusMm]")
                ?.focus();
          }
        };
        detail.append(b);
      }
    }
    $("modelDiagnostics").open = diagnostics.length > 0;
    $("modelUndo").disabled = !store.transactions.canUndo;
    $("modelRedo").disabled = !store.transactions.canRedo;
    view.update(store.document, selection);
    store.resolveBindings();
    queueAutosave();
    try {
      updateBindings();
    } catch (error) {
      setStatus(error.message);
    }
    document.dispatchEvent(
      new CustomEvent("pathloom:cad-document-changed", {
        detail: { revision: store.document.documentRevision },
      }),
    );
  }
  async function preview() {
    if (
      !session ||
      invalidFields.size ||
      !$("modelSettingsForm")?.checkValidity()
    )
      return;
    if (previewBusy) {
      previewAgain = true;
      return;
    }
    previewBusy = true;
    const target = session;
    try {
      const result = await store.preview(target);
      if (!result || target !== session) return;
      if (result && target === session) {
        native.release(previewHandles);
        previewHandles = (result.outputs || []).map((o) => o.handle);
        view.setPreview(result);
      }
      setStatus(
        result?.status === "failed"
          ? "演算が成立しません。診断から設定を修正してください。"
          : "プレビュー · まだ確定していません",
      );
    } catch (error) {
      report(error);
    } finally {
      previewBusy = false;
      render();
      if (previewAgain) {
        previewAgain = false;
        queuePreview();
      }
    }
  }
  function queuePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      if (session && sessionReady(session) && !invalidFields.size) preview();
    }, 180);
  }
  async function commit() {
    if (!session || commitBusy) return;
    clearTimeout(previewTimer);
    if (!$("modelSettingsForm")?.reportValidity()) return;
    if (invalidFields.size) return;
    const target = session;
    commitBusy = true;
    try {
      if (previewBusy) {
        setStatus("プレビューの完了を待って確定しています…");
        previewAgain = false;
        while (previewBusy && session === target)
          await new Promise((resolve) => setTimeout(resolve, 16));
        clearTimeout(previewTimer);
      }
      if (session !== target) return;
      const ok = await store.add(target);
      if (ok) {
        log.unshift(target.command.displayName);
        $("modelLog").replaceChildren(
          ...log.slice(0, 10).map((text) => {
            const li = document.createElement("li");
            li.textContent = text;
            return li;
          }),
        );
        session = null;
        invalidFields.clear();
        view.clearPreview();
        native.release(previewHandles);
        previewHandles = [];
        setStatus("形状を確定しました。履歴から寸法を変更できます。");
      } else
        setStatus(
          "確定できません。元の形状を保持し、失敗した設定を下書きとして残しました。",
        );
    } catch (error) {
      target.state = "repairing";
      report(error);
    } finally {
      commitBusy = false;
      render();
    }
  }
  async function loadCommands() {
    try {
      globalCommands = JSON.parse(await native.invoke("cad_command_library"));
      for (const raw of globalCommands) {
        const d = validateCommandDefinition(raw),
          existing = commandById(d.id, d.version);
        if (existing) {
          if (canonical(existing) !== canonical(d))
            throw new Error("同じコマンド版の定義が競合しています: " + d.id);
        } else registerCommand(d);
      }
      render();
    } catch (error) {
      setStatus("追加コマンドを読み込めません: " + error.message);
    }
  }
  async function loadLibrary() {
    try {
      library = JSON.parse(await native.invoke("cad_shape_library"));
      const host = $("modelShapeEntries");
      host.replaceChildren();
      for (const entry of library) {
        const b = document.createElement("button");
        b.textContent = `挿入 · ${entry.name}`;
        b.onclick = async () => {
          try {
            selection = (await store.insertLibrary(entry)).map((entityId) => ({
              entityId,
            }));
            selectedFeature = null;
            render();
            setStatus("独立したIDでLibrary形状を挿入しました。");
          } catch (error) {
            report(error);
          }
        };
        host.append(b);
      }
    } catch (error) {
      setStatus("形状Libraryを読み込めません: " + error.message);
    }
  }
  $("modelSaveShape").onclick = async () => {
    try {
      const doc = await store.snapshot(),
        entityIds = [...new Set(selection.map((r) => r.entityId))],
        entry = packageShapes(doc, entityIds, {
          name: $("modelShapeName").value || "CAD shape",
          withHistory: $("modelShapeHistory").checked,
        });
      library.push(entry);
      await native.invoke("cad_shape_library", {
        content: JSON.stringify(library),
      });
      await loadLibrary();
      setStatus("正確な形状をLibraryへ保存しました。");
    } catch (error) {
      report(error);
    }
  };
  const recoveryDialog = document.createElement("dialog");
  recoveryDialog.className = "model-switch-dialog";
  recoveryDialog.innerHTML =
    '<p>前回のCAD作業の回復データがあります。現在のCAD文書を置き換えて復元しますか？</p><button data-recovery="restore">CADを回復</button><button data-recovery="discard">回復データを破棄</button><button data-recovery="later">今はしない</button>';
  document.body.append(recoveryDialog);
  let recoveryData = null;
  recoveryDialog.onclick = async (event) => {
    const choice = event.target.dataset.recovery;
    if (!choice) return;
    try {
      if (choice === "restore") {
        await store.restore(recoveryData);
        restoreUi();
        setStatus(
          "CAD作業を回復しました。ユーザーのprojectファイルは変更していません。",
        );
      }
      if (choice === "discard")
        await native.invoke("cad_recovery", { discard: true });
      recoveryDialog.close();
    } catch (error) {
      report(error);
    }
  };
  async function checkRecovery() {
    if (recoveryChecked) return;
    recoveryChecked = true;
    try {
      const raw = await native.invoke("cad_recovery");
      if (raw) {
        recoveryData = JSON.parse(raw);
        recoveryDialog.showModal();
      }
    } catch (error) {
      setStatus("CAD回復データを確認できません: " + error.message);
    }
  }
  function queueAutosave() {
    if (
      !ready ||
      (store.document.documentRevision === autosaveRevision &&
        draftVersion === savedDraftVersion) ||
      (!store.document.features.length && !store.document.draftSessions.length)
    )
      return;
    clearTimeout(autosaveTimer);
    const wait = Math.max(1000, 10000 - (Date.now() - lastAutosave));
    autosaveTimer = setTimeout(async () => {
      try {
        const draftSnapshot = draftVersion,
          doc = await store.snapshot();
        await native.invoke("cad_recovery", { content: JSON.stringify(doc) });
        lastAutosave = Date.now();
        autosaveRevision = doc.documentRevision;
        savedDraftVersion = draftSnapshot;
      } catch (error) {
        setStatus("CAD自動回復保存に失敗しました: " + error.message);
      }
    }, wait);
  }
  $("modelFit").onclick = () =>
    view.fit(
      selection.length
        ? selection.map((r) => store.getEntity(r.entityId)).filter(Boolean)
        : deriveVisibleEntities(store.document),
    );
  $("modelCommandSearch").onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const results = findCommands(event.target.value);
      if (results.length === 1) begin(results[0]);
      else setStatus("候補を絞るか、一覧からコマンドを選んでください。");
    }
  };
  $("modelCommandSearch").oninput = () => render({ keepProperties: true });
  $("modelPreview").onclick = preview;
  $("modelCommit").onclick = commit;
  $("modelCancel").onclick = cancel;
  $("modelUndo").onclick = () => {
    session = null;
    view.clearPreview();
    store.transactions.undo();
    render();
  };
  $("modelRedo").onclick = () => {
    store.transactions.redo();
    render();
  };
  $("modelRetry").onclick = () => {
    for (const f of store.document.features)
      if (["failed", "blocked", "cancelled"].includes(f.status))
        f.status = "dirty";
    store.recompute().catch(report);
  };
  $("modelRegister").onclick = async () => {
    try {
      const d = JSON.parse($("modelCommandDefinition").value);
      await startRuntime();
      const normalized = registerCommand(d);
      store.document.commandDefinitions.push(clone(normalized));
      store.document.documentRevision++;
      globalCommands.push(clone(normalized));
      native
        .invoke("cad_command_library", {
          content: JSON.stringify(globalCommands),
        })
        .then(() =>
          setStatus(
            "コマンド定義を登録・保存しました。この版はprojectにも保存します。",
          ),
        )
        .catch((error) =>
          setStatus(
            "project用の定義は登録済みですが、共有コマンド保存に失敗しました: " +
              error.message,
          ),
        );
      render();
    } catch (error) {
      report(error);
    }
  };
  $("modelPlane").onchange = () => {
    snapPoint = null;
    invalidFields.delete("plane");
    const name = $("modelPlane").value;
    store.document.uiState.workPlane = {
      origin: [0, 0, 0],
      xAxis: name === "YZ" ? [0, 1, 0] : [1, 0, 0],
      yAxis: name === "XY" ? [0, 1, 0] : [0, 0, 1],
    };
    if (session?.parameters.plane) {
      dispatchSession(session, {
        type: "setting.change",
        key: "plane",
        value: store.document.uiState.workPlane,
      });
      properties();
      queuePreview();
    }
  };
  function acceptPoint(p) {
    if (!session) return;
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
      throw new Error("有限のXYZを指定してください");
    const op = session.command.baseOperation.id;
    const params = session.parameters;
    const slots = session.command.inputs.filter((s) => s.kind === "point");
    if (slots.length) {
      const slot = slots[pointStep++ % slots.length];
      session.inputValues[slot.key] = p;
      lastPoint = p;
      session.previewSequence++;
      saveDraft();
      properties();
      queuePreview();
      return;
    }
    if (op === "point.create") params.point = p;
    else if (op === "curve.line") {
      const key = pointStep++ % 2 === 0 ? "start" : "end";
      params[key] = p;
      invalidFields.delete(key);
    } else if (op === "curve.polyline") {
      if (pointStep++ === 0) params.points = [p];
      else params.points.push(p);
      invalidFields.delete("points");
    } else if (op === "curve.rectangle") {
      if (session.drawingMode && session.drawingMode !== "center") {
        const keys = rectanglePointKeys(session);
        if (
          session.drawingMode === "twoCorners" &&
          pointStep % 2 === 1 &&
          !inDrawingPlane(p, params.plane, session.inputValues.rectangleA)
        )
          throw new Error("2コーナーは同じ作業平面上に指定してください");
        const key = keys[pointStep++ % keys.length];
        session.inputValues[key] = p;
        invalidFields.delete(key);
      } else if (pointStep % 2 === 0) {
        params.anchor = p;
        invalidFields.delete("anchor");
        pointStep++;
      } else {
        if (!inDrawingPlane(p, params.plane, params.anchor))
          throw new Error("長方形の第2点を中心と同じ平面上に指定してください");
        const diff = p.map((v, i) => v - params.anchor[i]),
          pl = params.plane;
        params.widthMm =
          2 * Math.abs(diff.reduce((s, v, i) => s + v * pl.xAxis[i], 0));
        params.heightMm =
          2 * Math.abs(diff.reduce((s, v, i) => s + v * pl.yAxis[i], 0));
        invalidFields.delete("widthMm");
        invalidFields.delete("heightMm");
        pointStep++;
      }
    } else if (op === "curve.circle") {
      if (pointStep % 2 === 0) {
        params.center = p;
        invalidFields.delete("center");
        pointStep++;
      } else {
        if (!inDrawingPlane(p, params.plane, params.center))
          throw new Error("半径点を中心と同じ平面上に指定してください");
        const delta = p.map((v, i) => v - params.center[i]);
        const radius = Math.hypot(...delta);
        if (radius <= 1e-12) throw new Error("半径点を中心から離してください");
        params.radiusMm = radius;
        invalidFields.delete("radiusMm");
        pointStep++;
      }
    } else if ("center" in params) params.center = p;
    else if ("anchor" in params) params.anchor = p;
    else return;
    lastPoint = p;
    session.previewSequence++;
    saveDraft();
    properties();
    queuePreview();
  }
  $("modelCoordinate").onkeydown = (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    try {
      acceptPoint(
        parseCoordinate(event.target.value, {
          previous: lastPoint,
          plane: inputPlane(),
        }),
      );
      event.target.value = "";
    } catch (error) {
      rejectDrawingPoint(error);
    }
  };
  const pickDialog = document.createElement("dialog");
  pickDialog.className = "model-switch-dialog";
  document.body.append(pickDialog);
  function choosePick(hits, shiftKey) {
    pickDialog.replaceChildren();
    const caption = document.createElement("p");
    caption.textContent = "重なっている対象を選択してください";
    pickDialog.append(caption);
    for (const hit of hits) {
      const e = store.getEntity(hit.entityId),
        button = document.createElement("button");
      button.textContent = `${e?.name || "形状"} · ${hit.kind || e?.kind || ""}${typeof hit.topologyId === "string" ? " · " + hit.topologyId.split(":").slice(-2).join("/") : ""}`;
      button.onclick = () => {
        pickDialog.close();
        selectHit(hit, { shiftKey });
      };
      pickDialog.append(button);
    }
    const cancel = document.createElement("button");
    cancel.textContent = "選択をやめる";
    cancel.onclick = () => pickDialog.close();
    pickDialog.append(cancel);
    pickDialog.showModal();
  }
  function selectHit(hit, event) {
    const e = store.getEntity(hit.entityId);
    if (e?.locked) return;
    if (hit.kind) {
      const t =
        typeof hit.topologyId === "object"
          ? e.displayCache.topology.filter((t) => t.kind === "face")[
              hit.topologyId.faceIndex
            ]
          : e.displayCache.topology.find(
              (t) => t.topologyId === hit.topologyId,
            );
      if (!t) return;
      Object.assign(hit, makeSubshapeRef(e, t));
    }
    if (!event.shiftKey) selection = [];
    const index = selection.findIndex(
      (r) => r.entityId === hit.entityId && r.topologyId === hit.topologyId,
    );
    if (index >= 0) selection.splice(index, 1);
    else selection.push(hit);
    store.document.uiState.selection = clone(selection);
    if (session) {
      const eligible = session.command.inputs.filter(
        (s) =>
          ["entity", "subshape"].includes(s.kind) &&
          (s.kind === "subshape"
            ? s.allowedEntityKinds.includes(hit.kind)
            : !hit.kind && s.allowedEntityKinds.includes(e.kind)),
      );
      const slot =
        eligible.find((s) => s.key === activeInputKey) || eligible[0];
      if (slot) {
        const refs = selection
          .filter((r) =>
            slot.kind === "subshape" ? r.kind === hit.kind : !r.kind,
          )
          .map((r) =>
            r.kind
              ? makeSubshapeRef(
                  store.getEntity(r.entityId),
                  store
                    .getEntity(r.entityId)
                    .displayCache.topology.find(
                      (t) => t.topologyId === r.topologyId,
                    ),
                )
              : { entityId: r.entityId, role: slot.key },
          );
        dispatchSession(session, {
          type: "input.set",
          key: slot.key,
          refs: slot.maxCount === 1 ? refs.slice(-1) : refs,
        });
        queuePreview();
      }
    } else selectedFeature = null;
    render();
  }
  let down = null,
    snapPoint = null;
  $("modelSnap").onchange = () => {
    snapPoint = null;
  };
  const canvas = api.preview().canvas;
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!active() || !session || event.buttons) return;
      if (!$("modelSnap").checked) {
        snapPoint = null;
        return;
      }
      const { THREE, camera } = api.preview();
      if (!camera) return;
      const r = canvas.getBoundingClientRect();
      let nearest = 8,
        found = null;
      for (const e of deriveVisibleEntities(store.document)) {
        if (e.locked) continue;
        const candidates = (e.displayCache?.preview?.points || []).map((p) => ({
          point: p.point,
          label: "端点",
        }));
        const feature = store.getFeature(e.producer.featureId);
        if (!["valid", "warning"].includes(feature?.status)) continue;
        if (feature?.parameters.center)
          candidates.push({ point: feature.parameters.center, label: "中心" });
        if (feature?.operation.id === "curve.rectangle") {
          const params = feature.parameters;
          candidates.push({
            point: params.anchor.map(
              (n, i) =>
                n +
                (params.anchorMode === "center"
                  ? 0
                  : (params.widthMm * params.plane.xAxis[i] +
                      params.heightMm * params.plane.yAxis[i]) /
                    2),
            ),
            label: "中心",
          });
        }
        for (const candidate of candidates) {
          if (
            session &&
            pointStep % 2 === 1 &&
            (session.command.baseOperation.id === "curve.circle" ||
              (session.command.baseOperation.id === "curve.rectangle" &&
                session.drawingMode !== "threePoints"))
          ) {
            try {
              if (!inDrawingPlane(candidate.point, inputPlane(true))) continue;
            } catch {
              continue;
            }
          }
          const p = new THREE.Vector3(...candidate.point).project(camera);
          const distance = Math.hypot(
            ((p.x + 1) * r.width) / 2 + r.left - event.clientX,
            ((1 - p.y) * r.height) / 2 + r.top - event.clientY,
          );
          if (distance < nearest) {
            nearest = distance;
            found = candidate;
          }
        }
      }
      snapPoint = found?.point || null;
      if (found)
        setStatus(
          `${found.label}にスナップ · ${found.point.map((n) => n.toFixed(3)).join(", ")} mm`,
        );
    },
    true,
  );
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (active() && event.button === 0) {
        down = [event.clientX, event.clientY];
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  canvas.addEventListener(
    "click",
    (event) => {
      if (!active() || event.button !== 0) return;
      event.stopImmediatePropagation();
      if (
        down &&
        Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 3
      )
        return;
      if (
        session &&
        !session.command.inputs.some((s) =>
          ["entity", "subshape"].includes(s.kind),
        )
      ) {
        try {
          const p = snapPoint || view.pointAt(event, inputPlane(true));
          if (p) acceptPoint(p);
        } catch (error) {
          rejectDrawingPoint(error);
        }
        return;
      }
      const filter = $("modelPickFilter").value,
        hits = view.hit(event, filter);
      if (hits.length > 1) {
        choosePick(hits, event.shiftKey);
      } else if (hits.length) {
        selectHit(hits[0], event);
      } else {
        if (!session) {
          selection = [];
          selectedFeature = null;
          store.document.uiState.selection = [];
          render();
          return;
        }
        try {
          const p = view.pointAt(event, inputPlane(true));
          if (p) acceptPoint(p);
        } catch (error) {
          rejectDrawingPoint(error);
        }
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        !active() ||
        event.isComposing ||
        event.keyCode === 229 ||
        (event.key === "Enter" && event.target.closest("button")) ||
        event.target.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.shiftKey ? store.transactions.redo() : store.transactions.undo();
        render();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (session) commit();
        else if (lastCommand) begin(lastCommand);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          session?.command.baseOperation.id === "curve.polyline" &&
          event.key === "Backspace"
        ) {
          session.parameters.points.pop();
          pointStep = Math.max(0, pointStep - 1);
          lastPoint = session.parameters.points.at(-1) || null;
          session.previewSequence++;
          saveDraft();
          properties();
          queuePreview();
        } else {
          if (selectedFeature) store.remove(selectedFeature);
          selectedFeature = null;
          render();
        }
      }
    },
    true,
  );
  const switchDialog = document.createElement("dialog");
  switchDialog.className = "model-switch-dialog";
  switchDialog.innerHTML =
    '<p>未確定のCAD操作があります。</p><button data-choice="commit">確定して移動</button><button data-choice="discard">破棄して移動</button><button data-choice="stay">移動をやめる</button>';
  document.body.append(switchDialog);
  let pendingStage = null;
  switchDialog.addEventListener("click", async (event) => {
    const choice = event.target.dataset.choice;
    if (!choice) return;
    if (choice === "commit") {
      await commit();
      if (session) return;
    } else if (choice === "discard") cancel();
    switchDialog.close();
    if (choice !== "stay")
      document.dispatchEvent(
        new CustomEvent("pathloom:stage-approved", {
          detail: { mode: pendingStage },
        }),
      );
  });
  document.addEventListener("pathloom:stage-will-change", (event) => {
    if (active() && event.detail.mode !== "model" && session) {
      event.preventDefault();
      pendingStage = event.detail.mode;
      switchDialog.showModal();
    }
  });
  new MutationObserver(() => {
    store.document.uiState.activeStage = document.body.dataset.workspaceMode;
    if (active()) startRuntime();
    view.update(store.document, selection);
  }).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-workspace-mode"],
  });
  const panelResize = new ResizeObserver(() => {
    const left = panel.querySelector(".model-left"),
      right = panel.querySelector(".model-right");
    if (!active() || !left.offsetWidth || !right.offsetWidth) return;
    store.document.uiState.leftWidth = left.offsetWidth;
    store.document.uiState.rightWidth = right.offsetWidth;
    document.body.style.setProperty(
      "--cad-right-space",
      right.offsetWidth + "px",
    );
    store.document.uiState.inspectorRatio =
      panel.querySelector(".model-inspector").offsetHeight / right.clientHeight;
  });
  panelResize.observe(panel.querySelector(".model-left"));
  panelResize.observe(panel.querySelector(".model-right"));
  panelResize.observe(panel.querySelector(".model-inspector"));
  function restoreUi() {
    panel.style.setProperty(
      "--model-left-width",
      store.document.uiState.leftWidth + "px",
    );
    panel.style.setProperty(
      "--model-right-width",
      store.document.uiState.rightWidth + "px",
    );
    panel.querySelector(".model-inspector").style.height =
      store.document.uiState.inspectorRatio * 100 + "%";
    selection = clone(store.document.uiState.selection || []);
    for (const d of store.document.commandDefinitions)
      try {
        registerCommand(d);
      } catch {}
    render();
    if (store.document.draftSessions.length) {
      session = clone(store.document.draftSessions.at(-1));
      session.state = "repairing";
      setStatus("保存されていた未確定操作を復元しました。");
      properties();
      render();
    }
  }
  render();
  return {
    store,
    refreshView: () => view.update(store.document, selection),
    async snapshot() {
      saveDraft();
      return store.snapshot();
    },
    async prepareRestore(doc) {
      if (!doc) return null;
      for (const d of doc.commandDefinitions) {
        const normalized = validateCommandDefinition(d);
        const known = commandById(d.id, d.version);
        if (known && canonical(known) !== canonical(normalized))
          throw new Error(
            "CAD_SCHEMA_UNSUPPORTED: 同一コマンド版の内容が一致しません。元の文書を保持します。",
          );
      }
      return store.prepareRestore(doc);
    },
    restorePrepared(doc) {
      session = null;
      selectedFeature = null;
      view.clearPreview();
      if (doc) store.commitRestore(doc);
      else {
        store.native.cancelAll();
        store.document = createCadDocument();
        store.handles.clear();
        store.transactions.clear();
      }
      bindingStamps.clear();
      queueMicrotask(restoreUi);
    },
    begin,
    render,
  };
}
