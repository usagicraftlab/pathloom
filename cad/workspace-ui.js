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
  references,
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
  points:"底面の作図点 XYZ（順序付き）",chainPolicy:"edge連鎖の選択",radiiMm:"3軸半径 XYZ mm",transitionMode:"Pipe角部の方式",frameMode:"掃引フレーム",distance1Mm:"距離1 mm（指定face側）",distance2Mm:"距離2 mm（nullは等距離）",
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
  factor: "倍率",
  anchorMode: "基準モード",
  keepTools: "工具を保持する",
  allowMultipleGroups:"離れた連結グループも全て保持",
  splitParameters:"切断parameter（正本の値）",removePoint:"削除区間内のXYZ",removeParameter:"削除区間内のparameter",
  method:"延長方式",targetParameter:"到達交点のparameter（複数候補時）",
  connectionPoint:"交点・接続側を示すXYZ",solutionIndex:"接続候補番号",trim:"元曲線をトリム",keepInputs:"元曲線を残す",
  firstDistanceMm:"第1曲線の距離 mm",secondDistanceMm:"第2曲線の距離 mm",firstSide:"第1曲線の保持側",secondSide:"第2曲線の保持側",
  firstEnd:"第1曲線の端点",secondEnd:"第2曲線の端点",continuity:"接続の連続性",handleLengthMm:"接線制御長 mm",
  controlPointCount:"制御点数",acceptApproximation:"計測偏差を確認し近似として確定",seamParameter:"継ぎ目parameter",seamPoint:"継ぎ目のXYZ",
  poleIndex:"制御点番号（1始まり）",position:"移動先XYZ",knot:"挿入するknot",knotIndex:"削除するknot番号",multiplicity:"knot多重度",toleranceMm:"削除許容差 mm",
};
const commandGroupDefinitions = [
  { id: "curve-create", label: "カーブをつくる" },
  { id: "solid-create", label: "立体をつくる" },
  { id: "solid-edit", label: "立体を加工する" },
  { id: "surface-create", label: "サーフェスをつくる" },
  { id: "surface-edit", label: "サーフェスを加工する" },
  { id: "transform", label: "移動・回転・ミラーなど" },
];
const surfaceCreationOperations = new Set([
  "surface.plane",
  "surface.planarRegion",
  "surface.sweep1",
  "surface.loft",
]);
const solidEditingOperations = new Set([
  "solid.union",
  "solid.difference",
  "solid.intersection",
  "solid.fillet",
  "solid.chamfer",
  "solid.shell",
  "solid.split",
]);
const commandIconMarkup = {
  point: '<circle cx="12" cy="12" r="2.5"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/>',
  line: '<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  polyline: '<path d="m4 18 5-11 6 9 5-10"/><circle cx="4" cy="18" r="1.5"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="16" r="1.5"/>',
  rectangle: '<rect x="5" y="6" width="14" height="12" rx=".5"/>',
  polygon: '<path d="m12 3 8 6-3 10H7L4 9z"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  arc: '<path d="M5 18a9 9 0 0 1 14-11"/><path d="m16 5 3 2-1 3"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
  spline: '<path d="M4 18c4-13 12 13 16-12"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="6" r="1.5"/>',
  prism: '<path d="m5 8 7-4 7 4v9l-7 4-7-4zM5 8l7 4 7-4m-7 4v9"/>',
  revolve: '<path d="M6 17a8 8 0 1 1 12 0"/><path d="M12 3v18m-2-2 2 2 2-2"/>',
  sweep: '<path d="M4 18c4-11 12-11 16-1"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/>',
  loft: '<path d="M5 7c4-3 10-3 14 0M5 17c4 3 10 3 14 0M5 7v10m14-10v10M5 7c4 3 10 3 14 0M5 17c4-3 10-3 14 0"/>',
  join: '<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>',
  explode: '<path d="M4 8 9 5v6zm11-3 5 3-5 3zM4 16l5-3v6zm11-3 5 3-5 3z"/>',
  reverse: '<path d="M5 8h13l-3-3m4 11H6l3 3"/>',
  plane: '<path d="m3 8 12-4 6 3-12 4zM9 11v9l12-4V7m-12 13-6-3V8"/>',
  sphere: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c4 4 4 12 0 16m0-16c-4 4-4 12 0 16"/>',
  cylinder: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M5 18c0 4 14 4 14 0"/>',
  cone: '<path d="m12 4-8 15c0 3 16 3 16 0zM4 19c0 3 16 3 16 0"/>',
  torus: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="2.5"/>',
  boolean: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  shell: '<path d="M5 7 12 4l7 3v10l-7 3-7-3zM5 7l7 3 7-3m-7 3v4m0 6v-4"/>',
  move: '<path d="M12 3v18m-3-3 3 3 3-3M9 6l3-3 3 3M3 12h18m-3-3 3 3-3 3M6 9l-3 3 3 3"/>',
  rotate: '<path d="M5 9a7 7 0 1 1 1 7M5 4v5h5"/>',
  scale: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5m11-5v5h-5M8 16l8-8"/>',
  mirror: '<path d="M12 3v18M9 7 5 12l4 5zm6 0 4 5-4 5z"/>',
  offset: '<rect x="7" y="7" width="12" height="12"/><path d="M4 17V4h13"/>',
  region: '<path d="M4 6h16v12H4zM9 10h6v4H9z"/>',
  ellipsoid: '<ellipse cx="12" cy="12" rx="8.5" ry="5"/><path d="M12 4c4 4 4 12 0 16m0-16c-4 4-4 12 0 16"/>',
  cap: '<path d="M4 9c0-4 16-4 16 0v7c0 4-16 4-16 0zM4 9c0 4 16 4 16 0"/><path d="M8 9h8"/>',
  assemble: '<path d="m4 13 5 5 11-12M4 6l4 4m5 7 3 3"/>',
  fillet: '<path d="M5 19V6h6a8 8 0 0 1 8 8v5z"/>',
  chamfer: '<path d="M5 19V6h9l5 5v8z"/>',
  section: '<path d="m4 8 8-4 8 4v9l-8 4-8-4zM3 14h18"/>',
  trim: '<path d="M4 5 20 19M4 19 20 5M7 8l-3-3m13 14 3 3"/>',
  extend: '<path d="M4 12h15m-4-4 4 4-4 4M4 6v12"/>',
  blend: '<path d="M4 17c4 0 4-10 8-10s4 10 8 10"/>',
  rebuild: '<path d="M4 17 9 7l6 8 5-9"/><circle cx="4" cy="17" r="1.5"/><circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="20" cy="6" r="1.5"/>',
  seam: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16m-3-2 3 2 3-2"/>',
  poles: '<path d="m4 17 5-10 6 8 5-9"/><circle cx="4" cy="17" r="2"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="15" r="2"/><circle cx="20" cy="6" r="2"/>',
  surface: '<path d="M4 7c4-3 12-3 16 0v10c-4 3-12 3-16 0zM4 7c4 3 12 3 16 0M4 17c4-3 12-3 16 0M12 9v6"/>',
  surfaceOffset: '<path d="M5 7c4-3 10-3 14 0v7c-4 3-10 3-14 0zM8 11c4-3 10-3 14 0v7c-4 3-10 3-14 0"/>',
};
const operationIconFamilies = {
  "point.create": "point", "curve.line": "line", "curve.polyline": "polyline",
  "curve.rectangle": "rectangle", "curve.polygon": "polygon", "curve.circle": "circle",
  "curve.arc": "arc", "curve.ellipse": "ellipse", "curve.nurbs": "spline",
  "curve.interpolate": "spline", "curve.explode": "explode", "curve.reverse": "reverse",
  "curve.extractBoundary": "surface", "curve.offset": "offset", "curve.join": "join",
  "curve.split": "section", "curve.trim": "trim", "curve.extend": "extend",
  "curve.fillet": "fillet", "curve.chamfer": "chamfer", "curve.blend": "blend",
  "curve.rebuild": "rebuild", "curve.seam": "seam", "curve.editPoles": "poles",
  "surface.plane": "plane", "surface.planarRegion": "region", "surface.sweep1": "sweep",
  "surface.loft": "loft", "surface.join": "join", "surface.explode": "explode",
  "surface.reverse": "reverse", "surface.corners": "surface", "surface.edges": "surface",
  "surface.untrim": "surface", "surface.offset": "surfaceOffset", "surface.split": "section",
  "shape.extrude": "prism", "shape.revolve": "revolve", "shape.cylinder": "cylinder",
  "shape.cone": "cone", "shape.pipe": "sweep", "shape.cap": "cap",
  "solid.box": "prism", "solid.sphere": "sphere", "solid.torus": "torus",
  "solid.ellipsoid": "ellipsoid", "solid.union": "boolean", "solid.difference": "boolean",
  "solid.intersection": "boolean", "solid.assemble": "assemble", "solid.fillet": "fillet",
  "solid.chamfer": "chamfer", "solid.shell": "shell", "solid.split": "section",
  "shape.section": "section",
};
function commandGroup(command) {
  const operationId = command.baseOperation.id;
  if (operationId === "shape.transform")
    return "transform";
  if (operationId === "shape.extrude" && command.displayName === "Extrude Surface")
    return "surface-create";
  if (solidEditingOperations.has(operationId) || operationId === "shape.cap")
    return operationId === "shape.cap" ? "surface-edit" : "solid-edit";
  if (surfaceCreationOperations.has(operationId))
    return "surface-create";
  if (operationId.startsWith("surface."))
    return "surface-edit";
  if (operationId.startsWith("solid.") || ["shape.extrude", "shape.revolve", "shape.cylinder", "shape.cone", "shape.pipe"].includes(operationId))
    return "solid-create";
  return "curve-create";
}
function createCommandIcon(command) {
  const operationId = command.baseOperation.id;
  const family = operationId === "shape.transform"
    ? command.defaults.mode || "move"
    : operationIconFamilies[operationId] || "polyline";
  const markup = commandIconMarkup[family] || commandIconMarkup.polyline;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.innerHTML = markup;
  return icon;
}
export function initModelWorkspace(api) {
  let library = [],
    globalCommands = [],
    recoveryChecked = false,
    lastAutosave = 0,
    autosaveTimer = null,
    autosaveRevision = -1,
    draftVersion = 0,
    savedDraftVersion = -1;
  let lastCommand = null, curvePointPicking = false, planePicking = false,
    referencePlanePicking = false, planeBeforeFace = "XY", pickFilterBeforePlane = "object";
  const openCommandGroups = new Set(commandGroupDefinitions.map((group) => group.id));
  let session = null,
    selectedFeature = null,
    propertiesOpen = false,
    featureEditActive = false,
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
  const commandBar = document.createElement("section");
  commandBar.className = "model-command-bar";
  commandBar.setAttribute("role", "toolbar");
  commandBar.setAttribute("aria-label", "CADコマンド");
  const commandSearch = panel.querySelector("#modelCommandSearch").closest("label");
  const commandList = panel.querySelector("#modelCommands");
  const commandSession = panel.querySelector("#modelSession");
  const leftPanel = panel.querySelector(".model-left");
  const leftHeader = leftPanel.querySelector("header");
  const undoButton = leftHeader.querySelector("#modelUndo");
  const redoButton = leftHeader.querySelector("#modelRedo");
  const workplaneControls = panel.querySelector(".model-workplane");
  const planeSelect = workplaneControls.querySelector("#modelPlane");
  const planeControls = document.createElement("div");
  planeControls.className = "model-plane-controls";
  const planeLabel = planeSelect.closest("label");
  planeLabel.replaceWith(planeControls);
  planeControls.append(planeLabel);
  const facePlaneOption = document.createElement("option");
  facePlaneOption.value = "face";
  facePlaneOption.textContent = "選択面";
  planeSelect.append(facePlaneOption);
  const planeFromFaceButton = document.createElement("button");
  planeFromFaceButton.type = "button";
  planeFromFaceButton.id = "modelPlaneFromFace";
  planeFromFaceButton.textContent = "既存面を選ぶ";
  planeFromFaceButton.addEventListener("click", () => {
    if (!planePicking)
      pickFilterBeforePlane = workplaneControls.querySelector("#modelPickFilter").value;
    if (planeSelect.value !== "face") planeBeforeFace = planeSelect.value;
    planePicking = true;
    workplaneControls.querySelector("#modelPickFilter").value = "face";
    setStatus("作業平面にする平面上の face をクリックしてください。");
  });
  planeControls.append(planeFromFaceButton);
  planeLabel.hidden = true;
  workplaneControls.querySelector("#modelCoordinate").closest("label").hidden = true;
  const actionControls = panel.querySelector(".model-actions");
  const modelStatus = panel.querySelector("#modelStatus");
  const diagnosticsPanel = panel.querySelector("#modelDiagnostics");
  diagnosticsPanel.querySelector("summary")?.remove();
  const libraryDetails = [...leftPanel.querySelectorAll("details")].find(
    (details) => details.querySelector(":scope > summary")?.textContent === "形状Library",
  );
  const helpDetails = [...leftPanel.querySelectorAll("details")].find(
    (details) => details.querySelector(":scope > summary")?.textContent.startsWith("About"),
  );
  const commandDefinitionDetails = [...leftPanel.querySelectorAll("details")].find(
    (details) => details.querySelector(":scope > summary")?.textContent === "コマンドを追加",
  );
  const recentOperationsDetails = [...leftPanel.querySelectorAll("details")].find(
    (details) => details.querySelector(":scope > summary")?.textContent === "最近の操作",
  );
  commandSearch.hidden = true;
  undoButton.hidden = true;
  redoButton.hidden = true;
  libraryDetails.open = true;
  const libraryDialog = document.createElement("dialog");
  libraryDialog.className = "model-library-dialog";
  document.body.append(libraryDialog);
  const libraryClose = document.createElement("button");
  libraryClose.type = "button";
  libraryClose.textContent = "閉じる";
  libraryClose.addEventListener("click", () => {
    libraryDialog.close();
  });
  libraryDetails.append(libraryClose);
  const helpDialog = document.createElement("dialog");
  helpDialog.className = "model-help-dialog";
  helpDialog.setAttribute("aria-labelledby", "modelHelpTitle");
  helpDialog.innerHTML = `<header><strong id="modelHelpTitle"></strong><button type="button" aria-label="閉じる">×</button></header><div></div>`;
  helpDialog.querySelector("header button").addEventListener("click", () => helpDialog.close());
  document.body.append(helpDialog);
  const showHelp = (about) => {
    const heading = helpDialog.querySelector("#modelHelpTitle");
    const content = helpDialog.querySelector("div");
    content.replaceChildren();
    heading.textContent = about ? "About Pathloom" : "CAD操作説明";
    if (about) {
      const description = document.createElement("p");
      description.textContent = "Pathloom の CAD ワークスペースは、OCP / OCCT による正確な形状編集を行います。";
      const notice = document.createElement("a");
      notice.href = "./THIRD_PARTY_NOTICES.md";
      notice.target = "_blank";
      notice.rel = "noopener";
      notice.textContent = "第三者ソフトウェアの表示";
      content.append(description, notice);
    } else {
      const steps = document.createElement("ol");
      for (const text of [
        "上部の分類を開き、コマンドアイコンを選びます。",
        "画面上の参照平面や形状をクリックし、右側の操作パネルで寸法を指定します。",
        "右下の確定またはキャンセルで操作を終えます。",
        "下部の履歴をクリックすると右側で設定を編集できます。",
        "左の形状を右クリックすると、Library登録・生成接続・削除を選べます。",
      ]) {
        const item = document.createElement("li");
        item.textContent = text;
        steps.append(item);
      }
      content.append(steps);
    }
    helpDialog.showModal();
  };
  document.addEventListener("pathloom:cad-help", () => showHelp(false));
  document.addEventListener("pathloom:about", () => showHelp(true));
  helpDetails?.remove();
  commandDefinitionDetails?.remove();
  recentOperationsDetails?.remove();
  leftPanel.replaceChildren(leftHeader);
  leftHeader.replaceChildren(document.createElement("strong"));
  leftHeader.firstElementChild.textContent = "アウトライナー";
  const outliner = document.createElement("div");
  outliner.id = "modelOutliner";
  outliner.setAttribute("role", "tree");
  leftPanel.append(outliner);
  const inspector = panel.querySelector(".model-inspector");
  inspector.prepend(commandSearch, workplaneControls);
  inspector.append(commandSession, modelStatus, diagnosticsPanel);
  libraryDialog.append(libraryDetails);
  actionControls.querySelector("#modelPreview").hidden = true;
  panel.querySelector("#modelRetry").hidden = true;
  // Keep keyboard-command targets connected for compatibility, but do not
  // expose Undo/Redo as command-bar controls in the reviewed layout.
  undoButton.hidden = true;
  redoButton.hidden = true;
  commandBar.append(undoButton, redoButton, commandList);
  panel.prepend(commandBar);
  const timeline = document.createElement("section");
  timeline.className = "model-timeline";
  timeline.setAttribute("aria-label", "作成履歴");
  timeline.append(panel.querySelector(".model-history"));
  panel.append(timeline);
  const libraryPlacementLabel = document.createElement("label"),
    libraryPlacementInput = document.createElement("input");
  libraryPlacementLabel.textContent = "挿入位置 XYZ mm";
  libraryPlacementInput.id = "modelShapePlacement";
  libraryPlacementInput.value = "0,0,0";
  libraryPlacementLabel.append(libraryPlacementInput);
  libraryDetails.querySelector("#modelShapeEntries").before(libraryPlacementLabel);
  const exportStepButton = document.createElement("button");
  exportStepButton.id = "modelExportStep";
  exportStepButton.textContent = "STEP⇩";
  exportStepButton.setAttribute("aria-label", "Export selected CAD as STEP");
  exportStepButton.title = "Export STEP";
  exportStepButton.hidden = true;
  inspector.append(actionControls, exportStepButton);
  document.body.append(panel);
  view = createViewAdapter(api.preview);
  function setStatus(text) {
    status = text;
    $("modelStatus").textContent = text;
  }
  function useEntityForGeneration(entity) {
    try {
      const feature = store.getFeature(entity.producer.featureId);
      if (!["valid", "warning"].includes(feature?.status))
        throw new Error("未解決の古い形状は生成に渡せません");
      const binding = bindBody(store.document, entity);
      store.resolveBindings();
      updateBindings(binding.id);
      setStatus("生成入力へ接続しました。ノード配線は変更していません。");
    } catch (error) {
      report(error);
    }
  }
  function selectOutlinerEntity(entity, { showProperties = false } = {}) {
    selection = [{ entityId: entity.id }];
    selectedFeature = null;
    propertiesOpen = showProperties;
    featureEditActive = false;
    store.document.uiState.selection = clone(selection);
    if (showProperties) properties();
    render();
  }
  function closeObjectMenu() {
    objectMenu.hidden = true;
  }
  const objectMenu = document.createElement("div");
  objectMenu.className = "model-object-menu";
  objectMenu.setAttribute("role", "menu");
  objectMenu.hidden = true;
  document.body.append(objectMenu);
  const historyMenu = document.createElement("div");
  historyMenu.className = "model-object-menu";
  historyMenu.setAttribute("role", "menu");
  historyMenu.hidden = true;
  document.body.append(historyMenu);
  function closeHistoryMenu() {
    historyMenu.hidden = true;
  }
  function showHistoryMenu(feature, event) {
    closeObjectMenu();
    historyMenu.replaceChildren();
    historyMenu.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - 220))}px`;
    historyMenu.style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - 160))}px`;
    const action = (label, run) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.onclick = () => {
        closeHistoryMenu();
        Promise.resolve(run()).catch(report);
      };
      historyMenu.append(button);
    };
    action(feature.status === "suppressed" ? "操作の抑制を解除" : "操作を抑制", () =>
      store.suppress(feature.id, feature.status !== "suppressed"));
    action("履歴を削除", () => {
      const outputIds = new Set(feature.outputSlots.map((slot) => slot.entityId));
      const dependents = store.document.features.filter(
        (candidate) => candidate !== feature && references(candidate.inputs).some(
          (reference) => outputIds.has(reference.entityId),
        ),
      );
      if (dependents.length && !window.confirm(
        `この履歴を削除すると、${dependents.length}件の後続操作が未解決になります。削除しますか？`,
      )) return;
      store.remove(feature.id);
      selectedFeature = null;
      propertiesOpen = false;
      featureEditActive = false;
      render();
    });
    historyMenu.hidden = false;
    historyMenu.querySelector("button")?.focus();
  }
  function showObjectMenu(entity, event) {
    event.preventDefault();
    selectOutlinerEntity(entity);
    objectMenu.replaceChildren();
    objectMenu.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - 220))}px`;
    objectMenu.style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - 220))}px`;
    const addAction = (label, action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", () => {
        closeObjectMenu();
        action();
      });
      objectMenu.append(button);
    };
    addAction("形状 Library に登録 / Library を開く", () => {
      selectOutlinerEntity(entity);
      $("modelShapeName").value = entity.name || "CAD shape";
      libraryDetails.hidden = false;
      libraryDetails.open = true;
      libraryDialog.showModal();
    });
    addAction("生成で使用", () => useEntityForGeneration(entity));
    for (const binding of store.document.outputBindings.filter(
      (binding) => ["split", "missing"].includes(binding.status),
    )) {
      addAction(`「${binding.name}」の生成参照をこの形状へ変更`, () => {
        try {
          store.rebindOutput(binding.id, entity.id);
          setStatus("生成参照を修復しました。既存のノード配線を維持します。");
        } catch (error) {
          report(error);
        }
      });
    }
    addAction("削除", () => {
      const feature = store.getFeature(entity.producer.featureId);
      if (!feature) return;
      const outputIds = new Set(feature.outputSlots.map((slot) => slot.entityId));
      const dependents = store.document.features.filter(
        (candidate) => candidate !== feature && references(candidate.inputs).some(
          (reference) => outputIds.has(reference.entityId),
        ),
      );
      const hasBinding = store.document.outputBindings.some(
        (binding) => binding.resolvedEntityId === entity.id || binding.source.bodyId === entity.bodyId,
      );
      if ((dependents.length || hasBinding) && !window.confirm(
        `この履歴を削除すると、${dependents.length ? `${dependents.length}件の後続操作が未解決になり` : ""}${hasBinding ? "生成参照も未解決になり" : ""}ます。削除しますか？`,
      )) return;
      store.remove(feature.id);
      selection = [];
      selectedFeature = null;
      store.document.uiState.selection = [];
      render();
    });
    objectMenu.hidden = false;
    objectMenu.querySelector("button")?.focus();
  }
  function renderOutliner() {
    outliner.replaceChildren();
    const entitiesById = new Map(store.document.entities.map((entity) => [entity.id, entity]));
    for (const body of store.document.bodies) {
      const entity = entitiesById.get(body.tipEntityId);
      if (!entity) continue;
      const group = document.createElement("details");
      group.className = "model-outline-body";
      group.open = true;
      group.setAttribute("role", "treeitem");
      const heading = document.createElement("summary");
      heading.textContent = `${entity.kind === "solid" ? "立体" : entity.kind === "curve" ? "カーブ" : "サーフェス"} · ${entity.name || "無題"}`;
      group.append(heading);
      const row = document.createElement("div");
      row.className = "model-outline-row";
      row.setAttribute("role", "group");
      const select = document.createElement("button");
      select.type = "button";
      select.className = "model-outline-select";
      select.setAttribute("role", "treeitem");
      const selected = selection.some((reference) => reference.entityId === entity.id);
      select.setAttribute("aria-selected", String(selected));
      row.classList.toggle("is-selected", selected);
      select.textContent = entity.name || entity.kind;
      select.title = `${entity.kind} · ${entity.closure.enclosesVolume ? "閉体積" : "開いた形状"}`;
      select.addEventListener("click", () => selectOutlinerEntity(entity));
      select.addEventListener("contextmenu", (event) => showObjectMenu(entity, event));
      const visibility = document.createElement("button");
      visibility.type = "button";
      visibility.className = "model-outline-toggle";
      visibility.textContent = entity.visibility === "hidden" ? "◌" : "◉";
      visibility.setAttribute("aria-label", entity.visibility === "hidden" ? "表示する" : "非表示にする");
      visibility.title = visibility.getAttribute("aria-label");
      visibility.addEventListener("click", () => {
        entity.visibility = entity.visibility === "hidden" ? "visible" : "hidden";
        store.document.documentRevision++;
        render();
      });
      const lock = document.createElement("button");
      lock.type = "button";
      lock.className = "model-outline-toggle";
      lock.textContent = entity.locked ? "▣" : "▢";
      lock.setAttribute("aria-label", entity.locked ? "ロック解除" : "ロック");
      lock.title = lock.getAttribute("aria-label");
      lock.addEventListener("click", () => {
        entity.locked = !entity.locked;
        store.document.documentRevision++;
        render();
      });
      row.append(select, visibility, lock);
      group.append(row);
      outliner.append(group);
    }
  }
  document.addEventListener("pointerdown", (event) => {
    if (!objectMenu.contains(event.target)) closeObjectMenu();
    if (!historyMenu.contains(event.target)) closeHistoryMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeObjectMenu();
      closeHistoryMenu();
    }
  });
  function active() {
    return document.body.dataset.workspaceMode === "model";
  }
  function report(error) {
    setStatus(error.message || String(error));
  }
  exportStepButton.onclick = async () => {
    try {
      const entityId = selection.length === 1 && selection[0].entityId;
      const entity = entityId && store.getEntity(entityId);
      if (!entity) throw new Error("書出す現在のCAD bodyを1つ選択してください");
      const result = await store.exportStep(entity.id);
      const filename =
        (entity.name || "Pathloom-CAD").replace(/\.(step|stp)$/i, "") + ".step";
      const path = await native.saveStep(result.step, filename);
      setStatus(path ? `STEPを書き出しました：${path}` : "STEP書出しを取り消しました。");
    } catch (error) {
      report(error);
    }
  };
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
    curvePointPicking=false;
    referencePlanePicking=false;
    planeTooltip.hidden = true;
    propertiesOpen = false;
    featureEditActive = false;
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
    curvePointPicking=false;
    lastCommand = clone(command);
    if (session) {
      saveDraft();
      view.clearPreview();
    }
    selectedFeature = null;
    propertiesOpen = true;
    featureEditActive = false;
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
    referencePlanePicking = new Set([
      "point.create", "curve.line", "curve.polyline", "curve.rectangle",
      "curve.polygon", "curve.circle", "curve.arc", "curve.ellipse",
      "curve.nurbs", "curve.interpolate",
    ]).has(command.baseOperation.id);
    setStatus(referencePlanePicking
      ? "基準面または既存の平面をクリックしてください。"
      : "設定・入力を指定して確定してください。");
    if (command.baseOperation.id === "shape.transform" && selection.length > 1)
      setStatus(
        `${command.displayName}は形状1件が対象です。入力欄または重なり候補から対象を1件選んでください。`,
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
      (!featureEditActive || f?.operation.id === "asset.snapshot"
        ? null
        : f?.operation.id === "solid.difference"
          ? { keepTools: false, ...f.parameters }
          : f?.parameters);
    const editingOperation=session?.command.baseOperation.id||f?.operation.id;
    if(params&&editingOperation?.startsWith('curve.')){
      const refs=session?.inputs||f?.inputs||{};
      const entity=store.getEntity((refs.object||refs.first||refs.curve||[])[0]?.entityId);
      if(entity?.displayCache?.curveParameters){
        const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');
        summary.textContent='正本のparameter・制御点';
        text.style.whiteSpace='pre-wrap';
        text.textContent=JSON.stringify(entity.displayCache.curveParameters.map(({first,last,type,degree,poleCount,poles})=>({first,last,type,degree,poleCount,poles})),null,2);
        details.append(summary,text);host.append(details);
      }
      if(editingOperation==='curve.extend'){
        const text=document.createElement('p');text.textContent='startは始点、endは終点。NURBS/Bezierのcontinuationは接線延長です。到達対象がある場合、距離は交点を探す上限です。';host.append(text);
      }
      if(editingOperation==='curve.editPoles'){
        const text=document.createElement('p');text.textContent='moveは指定制御点を移動。insertKnotは形状を変えずに制御点を追加。removeKnotは許容差内でknotと対応する制御点を減らします。番号は1始まりです。';host.append(text);
      }
      if(session&&['curve.trim','curve.seam','curve.fillet','curve.chamfer'].includes(editingOperation)){
        const button=document.createElement('button');button.textContent='区間・接続側を画面で指定';
        button.onclick=()=>{curvePointPicking=true;setStatus('作業平面上の区間内部・継ぎ目・接続側をクリックしてください。正本へ投影して検査します。');};host.append(button);
      }
    }
    if(params){
      const help={
        'solid.box':'幅・奥行・高さ、底面2点、底面3点を選択できます。2点は指定平面に平行、3点は基準点→幅方向→奥行側の順です。高さは底面法線方向です。',
        'surface.planarRegion':'同じ平面の閉輪郭を複数選択できます。内側の輪郭は穴、その内側は島として保持します。開輪郭や交差輪郭は自動補完しません。',
        'shape.cap':'開口のうち平面の閉輪郭だけを塞ぎます。非平面の穴を勝手に平面で塞ぎません。閉じた結果と開いた結果を区別して保持します。',
        'solid.assemble':'面を接続許容差内でつなぎ、閉じたShellは立体、閉じなければ開いた形状として保持します。独立した閉体積は全て出力します。',
        'solid.chamfer':'2距離の場合は、各edgeの距離1側の隣接faceをedgeと同じ順序で指定してください。距離2のnullは等距離です。',
        'solid.fillet':'選択edgeのみ、または接線でつながる連鎖を明示します。カーネルが連鎖を必要とする場合は、許可せずに勝手に対象を増やしません。'
      }[editingOperation];
      if(help){const p=document.createElement('p');p.textContent=help;host.append(p);}
    }
    if (f && !session && !featureEditActive) {
      const summary = document.createElement("p");
      summary.textContent = `${f.name} · ${f.status} · ${f.operation.id}`;
      host.append(summary);
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "形状を変更";
      edit.addEventListener("click", () => {
        featureEditActive = true;
        propertiesOpen = true;
        properties();
      });
      host.append(edit);
      return;
    }
    if (!params) {
      if (!propertiesOpen) {
        const hint = document.createElement("p");
        hint.textContent = "形状を右クリックしてプロパティを表示";
        host.append(hint);
        return;
      }
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
          : editingOperation === "shape.transform"
            ? "対象は形状1件です。複数形状の一括変換は未対応です。正本B-repへ適用します。"
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
      const parameterLabel=key==='end'&&editingOperation==='curve.extend'?'延長する端点':key==='mode'&&editingOperation==='solid.box'?'Boxの作図モード':labels[key]||key;
      label.textContent = parameterLabel;
      const solidEnums=({chainPolicy:['selected','tangent'],transitionMode:['transformed','rightCorner','roundCorner'],frameMode:['corrected-frame','frenet'],directionMode:['inward','outward'],...(editingOperation==='solid.box'?{mode:['dimensions','twoCorners','threePoints'],anchorMode:['center','corner']}:{})})[key];
      const enumValues=solidEnums || (editingOperation?.startsWith('curve.')&&typeof value==='string'?({end:['start','end'],method:['continuation','tangent'],firstEnd:['start','end'],secondEnd:['start','end'],continuity:['G1','G2'],firstSide:['start','end'],secondSide:['start','end'],...(editingOperation==='curve.editPoles'?{mode:['move','insertKnot','removeKnot']}:{})})[key]:null);
      const input = enumValues?document.createElement('select'):
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? document.createElement("textarea")
          : document.createElement("input");
      if(enumValues)for(const value of enumValues){const option=document.createElement('option');option.value=value;option.textContent=solidEnums?({selected:'選択edgeのみ',tangent:'接線でつながる連鎖',dimensions:'幅・奥行・高さ',twoCorners:'底面2点',threePoints:'底面3点',rightCorner:'角を交差で接続',roundCorner:'角を丸く接続',transformed:'フレーム変換','corrected-frame':'補正フレーム',frenet:'Frenet',inward:'内側',outward:'外側'}[value]||value):value;input.append(option);}
      input.dataset.parameter = key;
      input.setAttribute("aria-label", parameterLabel);
      const operation = session?.command.baseOperation.id || f?.operation.id;
      if (
        key === "tangentChain" ||
        (operation === "surface.loft" && key === "closed") ||
        (operation === "surface.offset" &&
          ["bothSides", "solidify"].includes(key))
      ) {
        input.disabled = true;
        input.title = key==='tangentChain'?'旧版の保存挙動を保持しています。新規Filletでは連鎖を明示選択できます。':
          'このオプションは未実装です。現在の対応範囲はコマンド台帳を参照してください。';
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
          if (key === "plane") {
            snapPoint = null;
            referencePlanePicking = false;
            view.showReferencePlanes?.(false);
          }
          if (session) {
            dispatchSession(session, { type: "setting.change", key, value: v });
            saveDraft();
            queuePreview();
          }
          input.setCustomValidity("");
          if(editingOperation==='solid.box'&&key==='mode')updateBoxFields();
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
    function updateBoxFields(){
      if(editingOperation!=='solid.box')return;
      const mode=(session?.parameters||draft).mode||'dimensions';
      for(const field of settingsForm.querySelectorAll('[data-parameter]')){
        const key=field.dataset.parameter;
        field.parentElement.hidden=(mode==='dimensions'&&key==='points')||(mode!=='dimensions'&&['anchor','anchorMode','widthMm','depthMm'].includes(key))||(mode==='threePoints'&&key==='plane');
      }
    }
    updateBoxFields();
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
      apply.textContent = "確定";
      apply.setAttribute("aria-label", "設定変更を確定");
      apply.onclick = () => {
        if (settingsForm.reportValidity())
          store
            .edit(f.id, draft, { toleranceOverrides: draftTolerance })
            .catch(report);
      };
      host.append(apply);
      const close = document.createElement("button");
      close.textContent = "キャンセル";
      close.onclick = () => {
        selectedFeature = null;
        propertiesOpen = false;
        featureEditActive = false;
        render();
      };
      host.append(close);
    }
  }
  function updateBindings(connectBindingId = null) {
    for (const b of store.document.outputBindings) {
      const stamp = `${b.status}:${b.resolvedResultHash}:${b.resolvedEntityId}`;
      if (bindingStamps.get(b.id) === stamp && b.id !== connectBindingId) continue;
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
          connect: b.id === connectBindingId,
        });
      } else
        window.PathloomCad?.upsertCadBinding?.({
          bindingId: b.id,
          status: b.status,
          connect: b.id === connectBindingId,
        });
      bindingStamps.set(b.id, stamp);
    }
  }
  function render({ keepProperties = false, keepHistory = false } = {}) {
    if (!panel.isConnected) return;
    $("modelStatus").textContent = status;
    renderOutliner();
    workplaneControls.hidden = !session;
    const operationId = session?.command.baseOperation.id;
    const planeOperation = new Set([
      "point.create", "curve.line", "curve.polyline", "curve.rectangle",
      "curve.polygon", "curve.circle", "curve.arc", "curve.ellipse",
      "curve.nurbs", "curve.interpolate",
    ]);
    view.showReferencePlanes?.(referencePlanePicking, planeSelect.value);
    if (!referencePlanePicking)
      document.querySelector(".model-plane-tooltip")?.setAttribute("hidden", "");
    planeControls.hidden = !planePicking && !(
      session && (session.parameters.plane || planeOperation.has(operationId))
    );
    const q = "";
    const list = $("modelCommands");
    list.replaceChildren();
    const commands = findCommands(q);
    for (const group of commandGroupDefinitions) {
      const members = commands.filter((command) => commandGroup(command) === group.id);
      if (!members.length) continue;
      const section = document.createElement("details");
      section.className = "model-command-group";
      section.open = openCommandGroups.has(group.id) || !!q;
      section.addEventListener("toggle", () => {
        if (section.open) openCommandGroups.add(group.id);
        else openCommandGroups.delete(group.id);
      });
      const heading = document.createElement("summary");
      heading.textContent = group.label;
      const buttons = document.createElement("div");
      buttons.className = "model-command-group-buttons";
      for (const command of members) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "model-command-button";
        button.setAttribute("aria-label", command.displayName);
        button.title = `${command.displayName} · ${command.description}`;
        button.append(createCommandIcon(command));
        button.onclick = () => begin(command).catch(report);
        buttons.append(button);
      }
      section.append(heading, buttons);
      list.append(section);
    }
    $("modelSession").textContent = session
      ? `${session.command.displayName} · ${session.state} · ${sessionReady(session) ? "入力済み" : "入力を選択してください"}`
      : "";
    inspector.hidden = !session && !featureEditActive;
    inspector.closest(".model-right").hidden = inspector.hidden;
    inspector.querySelector("header strong").textContent =
      session?.command.displayName || store.getFeature(selectedFeature)?.name || "操作";
    actionControls.hidden = !session;
    panel.classList.toggle("has-inspector", !inspector.hidden);
    $("modelCommit").disabled = !session || session.state === "committing";
    $("modelPreview").disabled = !session || session.state === "committing";
    if (!keepProperties && !document.activeElement?.closest("#modelProperties"))
      properties();
    if (!keepHistory) {
      const history = $("modelHistory");
      history.replaceChildren();
      for (const f of store.document.features) {
      const b = document.createElement("button");
      b.className = "model-history-entry";
      b.dataset.featureId = f.id;
      b.setAttribute("aria-pressed", String(selectedFeature === f.id));
      const historyLabel = `${f.name} · ${f.status}${!["valid", "warning", "empty"].includes(f.status) && f.lastValid ? " · 更新前を表示" : ""}`;
      b.setAttribute("aria-label", historyLabel);
      b.title = `${historyLabel} · ${f.operation.id}`;
      b.append(createCommandIcon({
        baseOperation: f.operation,
        defaults: f.parameters,
      }));
      const accessibleLabel = document.createElement("span");
      accessibleLabel.className = "model-icon-label";
      accessibleLabel.textContent = historyLabel;
      b.append(accessibleLabel);
      const activate = (edit = false) => {
        invalidFields.clear();
        saveDraft();
        session = null;
        view.clearPreview();
        selectedFeature = f.id;
        propertiesOpen = true;
        featureEditActive = edit;
        selection = f.outputSlots.map((s) => ({ entityId: s.entityId }));
        render({ keepHistory: true });
      };
      b.onclick = () => activate(true);
      b.ondblclick = () => {
        activate(true);
        requestAnimationFrame(() => {
          const input = $("modelProperties").querySelector(
            "[data-parameter], select, input, textarea, button",
          );
          input?.focus();
          input?.scrollIntoView({ block: "nearest" });
        });
      };
      b.oncontextmenu = (event) => {
        event.preventDefault();
        showHistoryMenu(f, event);
      };
      history.append(b);
      }
    } else {
      for (const button of $("modelHistory").querySelectorAll(".model-history-entry"))
        button.setAttribute("aria-pressed", String(button.dataset.featureId === selectedFeature));
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
      if(d.details&&Object.keys(d.details).length)p.textContent+=' · '+JSON.stringify(d.details);
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
      const note=result.diagnostics?.filter(d=>d.severity==='warning').map(d=>d.message).join(' ');
      if(note)setStatus("プレビュー · まだ確定していません · "+note);
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
        session = null;
        referencePlanePicking = false;
        propertiesOpen = false;
        featureEditActive = false;
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
            const translation = parseCoordinate($("modelShapePlacement").value);
            selection = (
              await store.insertLibrary(entry, { translation })
            ).map((entityId) => ({ entityId }));
            selectedFeature = null;
            render();
            setStatus(
              `独立したIDでLibrary形状を正本配置しました（${translation.join(", ")} mm）。`,
            );
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
  const recoveryNotice = document.createElement("p");
  recoveryNotice.id = "modelRecoveryStatus";
  recoveryNotice.setAttribute("role", "status");
  const recoveryReview = document.createElement("button");
  recoveryReview.textContent = "保留中の回復データを確認";
  recoveryReview.hidden = true;
  const recoveryMessage = document.createElement("section");
  recoveryMessage.className = "model-recovery-message";
  recoveryMessage.hidden = true;
  recoveryMessage.append(recoveryNotice, recoveryReview);
  panel.append(recoveryMessage);
  recoveryReview.onclick = () => recoveryDialog.showModal();
  let recoveryData = null, recoveryPending = false;
  let recoveryReadable = false, autosaveDocument = null, autosaveBusy = false;
  function recoveryNoticeUpdate() {
    recoveryReview.hidden = !recoveryPending;
    recoveryNotice.textContent = recoveryPending
      ? "前回の回復候補を保持しています。回復または明示破棄するまで、現在の文書の自動回復保存は上書きせず保留します。必要な作業はプロジェクトとして保存してください。"
      : recoveryReadable ? "" : "回復候補を確認できるまで、自動回復保存を保留しています。";
    recoveryMessage.hidden = !recoveryNotice.textContent;
  }
  recoveryDialog.onclick = async (event) => {
    const choice = event.target.dataset.recovery;
    if (!choice) return;
    try {
      if (choice === "restore") {
        if (!recoveryData) throw new Error("回復候補を読み取れません。現在の文書と候補は保持しています。");
        const prepared = await prepareRestore(recoveryData);
        store.commitRestore(prepared);
        recoveryData = null;
        recoveryPending = false;
        restoreUi();
        setStatus(
          "CAD作業を回復しました。ユーザーのprojectファイルは変更していません。",
        );
      }
      if (choice === "discard") {
        await native.invoke("cad_recovery", { discard: true });
        recoveryData = null;
        recoveryPending = false;
        recoveryReadable = true;
      }
      recoveryDialog.close();
      recoveryNoticeUpdate();
      queueAutosave();
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
        recoveryPending = true;
        recoveryData = JSON.parse(raw);
        recoveryDialog.showModal();
      }
      recoveryReadable = true;
    } catch (error) {
      setStatus("CAD回復データを確認できません: " + error.message);
      if (recoveryPending && !recoveryDialog.open) recoveryDialog.showModal();
    }
    recoveryNoticeUpdate();
    queueAutosave();
  }
  function queueAutosave() {
    clearTimeout(autosaveTimer);
    if (
      !ready ||
      !recoveryReadable || recoveryPending || autosaveBusy ||
      (store.document === autosaveDocument && store.document.documentRevision === autosaveRevision &&
        draftVersion === savedDraftVersion) ||
      (!store.document.features.length && !store.document.draftSessions.length)
    )
      return;
    const wait = Math.max(1000, 10000 - (Date.now() - lastAutosave));
    autosaveTimer = setTimeout(async () => {
      if (recoveryPending || !recoveryReadable) return;
      autosaveBusy = true;
      let wrote = false;
      try {
        const document = store.document, draftSnapshot = draftVersion,
          doc = await store.snapshot();
        if (document !== store.document || recoveryPending) return;
        await native.invoke("cad_recovery", { content: JSON.stringify(doc) });
        lastAutosave = Date.now();
        autosaveDocument = document;
        autosaveRevision = doc.documentRevision;
        savedDraftVersion = draftSnapshot;
        wrote = true;
      } catch (error) {
        setStatus("CAD自動回復保存に失敗しました: " + error.message);
      } finally {
        autosaveBusy = false;
        if (wrote) queueAutosave();
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
  function applyReferenceWorkplane(name) {
    if (!new Set(["XY", "XZ", "YZ"]).has(name)) return;
    planeSelect.value = name;
    referencePlanePicking = false;
    snapPoint = null;
    invalidFields.delete("plane");
    planeBeforeFace = name;
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
      saveDraft();
      properties();
      queuePreview();
    }
    setStatus(`${name}基準面を作業平面に設定しました。`);
    render({ keepProperties: true });
  }
  $("modelPlane").onchange = () => {
    if ($("modelPlane").value === "face") {
      if (!planePicking) pickFilterBeforePlane = $("modelPickFilter").value;
      planePicking = true;
      setStatus("作業平面にする平面上の face をクリックしてください。");
      return;
    }
    const name = $("modelPlane").value;
    applyReferenceWorkplane(name);
  };
  function applyFaceWorkplane(hit) {
    const entity = store.getEntity(hit.entityId);
    if (!entity) throw new Error("作業平面にする形状が見つかりません");
    const faces = entity.displayCache?.topology?.filter((item) => item.kind === "face") || [];
    const faceIndex = faces.findIndex((face) => face.topologyId === hit.topologyId);
    const face = entity.displayCache?.faces?.[faceIndex];
    if (!face?.planar || !Array.isArray(face.normal))
      throw new Error("作業平面には平面の face を選択してください");
    const normal = face.normal;
    const reference = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const projection = reference.reduce((sum, value, index) => sum + value * normal[index], 0);
    const xAxis = reference.map((value, index) => value - projection * normal[index]);
    const xLength = Math.hypot(...xAxis);
    for (let index = 0; index < 3; index++) xAxis[index] /= xLength;
    const yAxis = [
      normal[1] * xAxis[2] - normal[2] * xAxis[1],
      normal[2] * xAxis[0] - normal[0] * xAxis[2],
      normal[0] * xAxis[1] - normal[1] * xAxis[0],
    ];
    const plane = { origin: hit.point, xAxis, yAxis };
    validateDrawingPlane(plane);
    store.document.uiState.workPlane = plane;
    planeSelect.value = "face";
    snapPoint = null;
    if (session?.parameters.plane) {
      dispatchSession(session, { type: "setting.change", key: "plane", value: plane });
      saveDraft();
      properties();
      queuePreview();
    }
    planePicking = false;
    $("modelPickFilter").value = pickFilterBeforePlane;
    setStatus("選択面を作業平面に設定しました。");
  }
  function acceptPoint(p) {
    if (!session) return;
    if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
      throw new Error("有限のXYZを指定してください");
    const op = session.command.baseOperation.id;
    const params = session.parameters;
    if (["curve.trim","curve.seam","curve.fillet","curve.chamfer"].includes(op)) {
      curvePointPicking=false;
      params[op==='curve.trim'?'removePoint':op==='curve.seam'?'seamPoint':'connectionPoint']=p;
      lastPoint=p;session.previewSequence++;saveDraft();properties();queuePreview();return;
    }
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
    } else {
      selectedFeature = null;
      propertiesOpen = false;
      featureEditActive = false;
    }
    render();
  }
  let down = null,
    snapPoint = null;
  $("modelSnap").onchange = () => {
    snapPoint = null;
  };
  const canvas = api.preview().canvas;
  const planeTooltip = document.createElement("div");
  planeTooltip.className = "model-plane-tooltip";
  planeTooltip.textContent = "平面を選択";
  planeTooltip.hidden = true;
  document.body.append(planeTooltip);
  canvas.addEventListener("pointerleave", () => {
    planeTooltip.hidden = true;
    view.hoverReferencePlane?.(null);
  });
  function snapCandidate(event) {
    if (!$("modelSnap").checked) return null;
    const { THREE, camera } = api.preview();
    if (!camera) return null;
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
    return found;
  }
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!active() || !session || event.buttons) return;
      const hoveredPlane = referencePlanePicking && view.hit(event, "workplane")[0];
      planeTooltip.hidden = !hoveredPlane;
      if (hoveredPlane) {
        planeTooltip.style.left = Math.min(event.clientX + 14, innerWidth - 110) + "px";
        planeTooltip.style.top = Math.min(event.clientY + 14, innerHeight - 34) + "px";
      }
      view.hoverReferencePlane?.(hoveredPlane?.referencePlane);
      const found = snapCandidate(event);
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
      planeTooltip.hidden = true;
      event.stopImmediatePropagation();
      if (
        down &&
        Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 3
      )
        return;
      if (planePicking) {
        const hit = view.hit(event, "face")[0];
        if (!hit) {
          setStatus("作業平面にする face が見つかりません。平面をクリックしてください。");
          return;
        }
        try {
          applyFaceWorkplane(hit);
        } catch (error) {
          report(error);
        }
        return;
      }
      if (referencePlanePicking) {
        const faceHit = view.hit(event, "face")[0];
        if (faceHit) {
          try {
            applyFaceWorkplane(faceHit);
            referencePlanePicking = false;
            view.showReferencePlanes?.(false);
            if (session && !session.command.inputs.some((slot) =>
              ["entity", "subshape"].includes(slot.kind)))
              acceptPoint(snapCandidate(event)?.point || faceHit.point);
            render({ keepProperties: true });
          } catch (error) {
            report(error);
          }
          return;
        }
        const planeHit = view.hit(event, "workplane")[0];
        if (!planeHit) {
          setStatus("基準面または既存の平面をクリックしてください。");
          return;
        }
        applyReferenceWorkplane(planeHit.referencePlane);
        if (session && !session.command.inputs.some((slot) =>
          ["entity", "subshape"].includes(slot.kind)))
          acceptPoint(snapCandidate(event)?.point || snapPoint || planeHit.point);
        return;
      }
      if (
        session && curvePointPicking
      ) {
        try{const p=view.pointAt(event,inputPlane(true));if(p)acceptPoint(p);}catch(error){rejectDrawingPoint(error);}
        return;
      }
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
          propertiesOpen = false;
          featureEditActive = false;
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
        (event.target.closest("input,textarea,select,[contenteditable=true]") &&
          !(planePicking && event.key === "Escape"))
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
        if (planePicking) {
          planePicking = false;
          planeSelect.value = planeBeforeFace;
          $("modelPickFilter").value = pickFilterBeforePlane;
          setStatus("作業平面の選択を取り消しました。");
        } else cancel();
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
  async function prepareRestore(doc) {
    if (!doc) return null;
    for (const d of doc.commandDefinitions) {
      const normalized = validateCommandDefinition(d);
      const known = commandById(d.id, d.version);
      if (known && canonical(known) !== canonical(normalized))
        throw new Error("CAD_SCHEMA_UNSUPPORTED: 同一コマンド版の内容が一致しません。元の文書を保持します。");
    }
    return store.prepareRestore(doc);
  }
  render();
  return {
    store,
    refreshView: () => view.update(store.document, selection),
    async snapshot() {
      saveDraft();
      return store.snapshot();
    },
    prepareRestore,
    restorePrepared(doc) {
      clearTimeout(autosaveTimer);
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
    async importLegacyStep(shape) {
      await startRuntime();
      const entityId = await store.importLegacyStep(shape);
      selection = [{ entityId }];
      selectedFeature = store.getEntity(entityId)?.producer.featureId || null;
      render();
      view.update(store.document, selection);
      return entityId;
    },
    render,
  };
}
