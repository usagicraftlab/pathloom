Warning: truncated output (original token count: 46977)
Total output lines: 4059

import { packageShapes } from "./shape-library.js";
import { readLibraryContainer, writeLibraryContainer } from "../recovery-migration.js";
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
  allCommandDefinitions,
  findCommands,
  commandById,
  registerCommand,
  validateCommandDefinition,
} from "./commands/registry.js";
import {
  commandDefinitionToDsl,
  commandCatalogToDsl,
  inspectCommandDsl,
  resolveCommandConflict,
  commandVersionOptions,
  pinCommandDefinition,
} from "./commands/dsl.js";
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
import { boundsOverlap, centerOf, snapCandidates, thumbnailPath } from "./ui-interactions.js";
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
  axisFactors: "軸倍率 XYZ",
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
  const defaultUiPreferences = {
    pinnedCommands: [],
    commandOrder: [],
    colors: {},
    showThumbnails: true,
    folders: {},
  };
  let uiPreferences = clone(defaultUiPreferences);
  try {
    uiPreferences = {
      ...defaultUiPreferences,
      ...JSON.parse(localStorage.getItem("pathloom.cad-ui.v1") || "{}"),
    };
  } catch {}
  const saveUiPreferences = () => {
    try {
      localStorage.setItem("pathloom.cad-ui.v1", JSON.stringify(uiPreferences));
    } catch {}
  };
  let commandEditMode = false,
    panelsTemporarilyHidden = false,
    measureMode = false,
    measurePoints = [],
    mirrorPlanePicking = false,
    frozenHistoryStage = null,
    hoveredSubshape = null,
    closePolylineAsFace = false;
  let activeDrag = null, pivotPicking = false, pendingPivot = null;
  let session = null,
    selectedFeature = null,
    propertiesOpen = false,
    featureEditActive = false,
    status = "CADを開くと正確な形状ランタイムを起動します。",
    pointStep = 0,
    lastPoint = null,
    activeInputKey = null,
    commitBusy = false,
    pendingHistoryActions = [],
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
  const commandBarTools = document.createElement("div");
  commandBarTools.className = "model-command-bar-tools";
  const makeToolButton = (label, title = label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    return button;
  };
  const commandEditButton = makeToolButton("配置編集", "ピン留めとアイコン順を編集");
  commandEditButton.id = "modelCommandEdit";
  const commandDslButton = makeToolButton("DSL", "コマンドDSL・版管理・AI編集");
  commandDslButton.id = "modelCommandDsl";
  const measureButton = makeToolButton("↔", "2点の距離を測定");
  measureButton.id = "modelMeasure";
  measureButton.setAttribute("aria-label", "2点の距離を測定");
  const arrayButton = makeToolButton("⠿", "配列コピー");
  arrayButton.id = "modelArrayCopy";
  arrayButton.setAttribute("aria-label", "配列コピー");
  const thumbnailToggle = makeToolButton("▧", "アウトライナーのサムネイル表示");
  thumbnailToggle.id = "modelThumbnailToggle";
  thumbnailToggle.setAttribute("aria-label", "サムネイル表示切替");
  commandBarTools.append(commandEditButton, commandDslButton, measureButton, arrayButton, thumbnailToggle);
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
      const shortcuts = document.createElement("dl");
      shortcuts.className = "model-shortcut-list";
      for (const [keys, meaning] of [
        ["Esc", "ドラッグを開始前へ戻してコマンド終了"], ["Tab", "パネルを一時的に隠す／戻す"],
        ["H", "選択形状を隠す"], ["Shift+H", "隠れた形状をすべて戻す"], ["I", "選択形状だけを表示"],
        ["Cmd/Ctrl+Z", "Undo"], ["Cmd/Ctrl+Shift+Z", "Redo"], ["Enter", "作図を確定／右入力欄では次の欄"],
        ["Ctrl/Cmd+ドラッグ", "コピーして移動"], ["Alt+ドラッグ", "精密移動"], ["Shift+回転ドラッグ", "角度スナップ解除"],
      ]) {
        const key = document.createElement("dt"), description = document.createElement("dd");
        key.textContent = keys; description.textContent = meaning; shortcuts.append(key, description);
      }
      content.append(shortcuts);
    }
    helpDialog.showModal();
  };
  document.addEventListener("pathloom:cad-help", () => showHelp(false));
  document.addEventListener("pathloom:about", () => showHelp(true));
  const commandDslDialog = document.createElement("dialog");
  commandDslDialog.className = "model-command-dsl-dialog";
  commandDslDialog.setAttribute("aria-labelledby", "modelCommandDslTitle");
  commandDslDialog.innerHTML = `<header><strong id="modelCommandDslTitle">コマンドDSL・版管理</strong><button type="button" data-command-dsl-close aria-label="閉じる">×</button></header>
    <label>コマンド<select data-command-dsl-select></select></label>
    <div class="model-command-dsl-version" hidden><span></span><select aria-label="切替先のコマンド版"></select><button type="button">版を切り替える</button></div>
    <label>DSL<textarea data-command-dsl-source rows="18" spellcheck="false" aria-label="コマンドDSL"></textarea></label>
    <p data-command-dsl-status role="status" aria-live="polite"></p>
    <section data-command-dsl-conflict hidden><strong>名前の衝突を解決</strong><p></p><label>新しいcommand ID<input data-command-new-id></label><label>新しい表示名<input data-command-new-name></label><button type="button" data-command-rename>新名として登録</button><label>代わりのalias<input data-command-new-alias></label><button type="button" data-command-alias>別名を置換</button><button type="button" data-command-cancel>採用中止</button></section>
    <details><summary>AIで新しい版を提案</summary><label>変更内容<textarea data-command-ai-request rows="3" maxlength="6000" placeholder="例：表示名と既定幅を変更。演算の意味は維持する"></textarea></label><button type="button" data-command-ai>既存AI接続で提案</button><small>ローカルCodex認証を使い、任意JavaScriptは許可しません。提案は適用前にDSLとして確認できます。</small></details>
    <footer><button type="button" data-command-catalog>正規65件を表示</button><button type="button" data-command-apply class="primary">検証して文書へ固定</button><button type="button" data-command-dsl-close>閉じる</button></footer>`;
  document.body.append(commandDslDialog);
  const commandDslSelect = commandDslDialog.querySelector("[data-command-dsl-select]");
  const commandDslSource = commandDslDialog.querySelector("[data-command-dsl-source]");
  const commandDslStatus = commandDslDialog.querySelector("[data-command-dsl-status]");
  const commandDslConflict = commandDslDialog.querySelector("[data-command-dsl-conflict]");
  const commandVersionPanel = commandDslDialog.querySelector(".model-command-dsl-version");
  let pendingCommandConflict = null;
  let commandAiTicket = null;
  function commandDslMessage(message, error = false) {
    commandDslStatus.textContent = message;
    commandDslStatus.dataset.error = String(error);
  }
  function fillCommandDslSelect(selectedKey = commandDslSelect.value) {
    commandDslSelect.replaceChildren();
    for (const command of findCommands().sort((a, b) => a.id.localeCompare(b.id))) {
      const option = document.createElement("option");
      option.value = `${command.id}@${command.version}`;
      option.textContent = `${command.id}@${command.version} · ${command.displayName}`;
      commandDslSelect.append(option);
    }
    if ([...commandDslSelect.options].some((option) => option.value === selectedKey))
      commandDslSelect.value = selectedKey;
  }
  function selectedDslCommand() {
    const [id, version] = commandDslSelect.value.split("@");
    return commandById(id, Number(version));
  }
  function refreshCommandVersionPanel() {
    const feature = selectedFeature && store.getFeature(selectedFeature);
    const target = commandVersionPanel.querySelector("select");
    target.replaceChildren();
    if (!feature) {
      commandVersionPanel.hidden = true;
      return;
    }
    const versions = commandVersionOptions(feature.command.id);
    commandVersionPanel.hidden = versions.length < 2;
    commandVersionPanel.querySelector("span").textContent = `${feature.name}: 現在 ${feature.command.id}@${feature.command.version}`;
    for (const definition of versions) {
      const option = document.createElement("option");
      option.value = String(definition.version);
      option.textContent = `v${definition.version}${definition.version === feature.command.version ? "（現在）" : ""}`;
      option.disabled = definition.version === feature.command.version;
      target.append(option);
    }
    target.value = String(
      versions.find((definition) => definition.version !== feature.command.version)?.version || feature.command.version,
    );
  }
  function openCommandDsl() {
    fillCommandDslSelect();
    const command = selectedDslCommand();
    if (command) commandDslSource.value = commandDefinitionToDsl(command);
    commandDslConflict.hidden = true;
    pendingCommandConflict = null;
    refreshCommandVersionPanel();
    commandDslMessage("DSLは現在の単一command registryから生成されています。");
    commandDslDialog.showModal();
  }
  commandDslButton.addEventListener("click", openCommandDsl);
  for (const button of commandDslDialog.querySelectorAll("[data-command-dsl-close]"))
    button.addEventListener("click", () => commandDslDialog.close());
  commandDslSelect.addEventListener("change", () => {
    const command = selectedDslCommand();
    if (command) commandDslSource.value = commandDefinitionToDsl(command);
    commandDslConflict.hidden = true;
    pendingCommandConflict = null;
    commandDslMessage("版を含む定義を編集できます。既存版は上書きできません。");
  });
  commandDslDialog.querySelector("[data-command-catalog]").addEventListener("click", () => {
    commandDslSource.value = commandCatalogToDsl();
    commandDslConflict.hidden = true;
    pendingCommandConflict = null;
    commandDslMessage("正規65 IDをregistryからDSLへ変換しました。");
  });
  function showCommandConflict(definition, conflicts) {
    pendingCommandConflict = definition;
    commandDslConflict.hidden = false;
    commandDslConflict.querySelector("p").textContent = conflicts
      .map((conflict) => `${conflict.token} ↔ ${conflict.existingId}@${conflict.existingVersion}`)
      .join("、");
    commandDslConflict.querySelector("[data-command-new-id]").value = `${definition.id}.custom`;
    commandDslConflict.querySelector("[data-command-new-name]").value = `${definition.displayName} Custom`;
    commandDslConflict.querySelector("[data-command-new-alias]").value = `${definition.aliases[0] || definition.displayName}Custom`;
    commandDslMessage("標準・既存commandは上書きしません。新名、別名の置換、採用中止から選んでください。", true);
  }
  commandDslDialog.querySelector("[data-command-apply]").addEventListener("click", () => {
    try {
      const { definitions, conflicts } = inspectCommandDsl(commandDslSource.value);
      if (conflicts.length) return showCommandConflict(definitions[0], conflicts);
      const registered = allCommandDefinitions();
      for (const definition of definitions) {
        const existing = commandById(definition.id, definition.version);
        if (existing && canonical(existing) !== canonical(definition))
          throw new Error(`${definition.id}@${definition.version}は固定済みです。変更は新しいversionにしてください。`);
        const pinned = store.document.commandDefinitions.find(
          (candidate) => candidate.id === definition.id && candidate.version === definition.version,
        );
        if (pinned && canonical(pinned) !== canonical(definition))
          throw new Error(`${definition.id}@${definition.version}は文書に固定済みです。変更は新しいversionにしてください。`);
        if (!registered.some((candidate) => candidate.baseOperation.id === definition.baseOperation.id))
          throw new Error(`${definition.baseOperation.id}は未登録のnative operationです。`);
      }
      let added = 0, unchanged = 0;
      for (const definition of definitions) {
        const existing = commandById(definition.id, definition.version);
        if (existing) {
          unchanged++;
          continue;
        }
        registerCommand(definition);
        pinCommandDefinition(store.document, definition);
        added++;
      }
      if (added) {
        store.document.documentRevision++;
        queueAutosave();
        render({ keepProperties: true, keepHistory: true });
      }
      fillCommandDslSelect();
      commandDslConflict.hidden = true;
      pendingCommandConflict = null;
      commandDslMessage(`${added}件を検証・登録して文書に版固定しました。変更なし${unchanged}件。`);
    } catch (error) {
      commandDslMessage(error.message || String(error), true);
    }
  });
  commandDslDialog.querySelector("[data-command-rename]").addEventListener("click", () => {
    try {
      const resolved = resolveCommandConflict(pendingCommandConflict, {
        action: "rename",
        id: commandDslConflict.querySelector("[data-command-new-id]").value,
        displayName: commandDslConflict.querySelector("[data-command-new-name]").value,
      });
      commandDslSource.value = commandDefinitionToDsl(resolved);
      commandDslConflict.hidden = true;
      pendingCommandConflict = null;
      commandDslMessage("新名をDSLへ反映しました。内容を確認して適用してください。");
    } catch (error) { commandDslMessage(error.message || String(error), true); }
  });
  commandDslDialog.querySelector("[data-command-alias]").addEventListener("click", () => {
    try {
      const resolved = resolveCommandConflict(pendingCommandConflict, {
        action: "replace-alias",
        alias: commandDslConflict.querySelector("[data-command-new-alias]").value,
      });
      commandDslSource.value = commandDefinitionToDsl(resolved);
      commandDslConflict.hidden = true;
      pendingCommandConflict = null;
      commandDslMessage("衝突aliasを置換しました。内容を確認して適用してください。");
    } catch (error) { commandDslMessage(error.message || String(error), true); }
  });
  commandDslDialog.querySelector("[data-command-cancel]").addEventListener("click", () => {
    pendingCommandConflict = null;
    commandDslConflict.hidden = true;
    commandDslMessage("commandの採用を中止しました。文書とregistryは変更していません。");
  });
  commandVersionPanel.querySelector("button").addEventListener("click", async () => {
    const feature = selectedFeature && store.getFeature(selectedFeature);
    if (!feature) return commandDslMessage("履歴を選択してください。", true);
    try {
      const change = await store.changeCommandVersion(
        feature.id,
        Number(commandVersionPanel.querySelector("select").value),
      );
      commandDslMessage(
        change.changed
          ? `${feature.command.id}をv${change.previousVersion}からv${change.targetVersion}へ${change.direction === "upgrade" ? "upgrade" : "rollback"}しました。Undoで戻せます。`
          : "選択した版は現在の版です。",
      );
      queueAutosave();
      refreshCommandVersionPanel();
      render();
    } catch (error) { commandDslMessage(error.message || String(error), true); }
  });
  commandDslDialog.querySelector("[data-command-ai]").addEventListener("click", () => {
    try {
      const definitions = inspectCommandDsl(commandDslSource.value).definitions;
      if (definitions.length !== 1) throw new Error("AI編集はcommand 1件ずつ行います。");
      const request = commandDslDialog.querySelector("[data-command-ai-request]").value.trim();
      if (!request) throw new Error("変更内容を入力してください。");
      commandAiTicket = crypto.randomUUID();
      document.dispatchEvent(new CustomEvent("pathloom:ai-command-submit", { detail: {
        ticket: commandAiTicket,
        request,
        definition: definitions[0],
        dsl: commandDslSource.value,
      }}));
      commandDslMessage("既存のローカルAI接続で新しい版を提案しています…");
    } catch (error) { commandDslMessage(error.message || String(error), true); }
  });
  document.addEventListener("pathloom:ai-command-state", (event) => {
    if (event.detail.ticket !== commandAiTicket) return;
    if (event.detail.phase === "error") commandDslMessage(event.detail.error, true);
    else if (event.detail.phase === "done") commandDslMessage("AI提案を検証しました。DSLを確認して適用してください。");
    else commandDslMessage(event.detail.phase === "connecting" ? "ローカルAI接続を確認しています…" : "AIが新しいcommand版を提案しています…");
  });
  document.addEventListener("pathloom:ai-command-result", (event) => {
    if (event.detail.ticket !== commandAiTicket) return;
    commandDslSource.value = event.detail.dsl;
    if (event.detail.conflicts?.length) showCommandConflict(event.detail.definition, event.detail.conflicts);
  });
  helpDetails?.remove();
  commandDefinitionDetails?.remove();
  recentOperationsDetails?.remove();
  leftPanel.replaceChildren(leftHeader);
  leftHeader.replaceChildren(document.createElement("strong"));
  leftHeader.firstElementChild.textContent = "アウトライナー";
  const folderButton = makeToolButton("▱+", "選択形状をグループ化");
  folderButton.setAttribute("aria-label", "選択形状をグループ化");
  folderButton.onclick = () => {
    const bodyIds = [...new Set(selection.map((reference) => store.getEntity(reference.entityId)?.bodyId).filter(Boolean))];
    if (!bodyIds.length) return setStatus("グループにまとめる形状を選択してください。");
    const folders = uiPreferences.folders[store.document.id] ||= [];
    for (const folder of folders) folder.bodyIds = folder.bodyIds.filter((bodyId) => !bodyIds.includes(bodyId));
    folders.push({ id: id(), name: `グループ ${folders.length + 1}`, bodyIds });
    saveUiPreferences();
    renderOutliner();
  };
  leftHeader.append(folderButton);
  const outliner = document.createElement("div");
  outliner.id = "modelOutliner";
  outliner.setAttribute("role", "tree");
  const generationDrop = document.createElement("div");
  generationDrop.className = "model-generation-drop";
  generationDrop.textContent = "生成パネルへ形状をドロップ";
  generationDrop.setAttribute("role", "region");
  generationDrop.setAttribute("aria-label", "生成で使用");
  leftPanel.append(outliner, generationDrop);
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
  commandBar.append(undoButton, redoButton, commandBarTools, commandList);
  panel.prepend(commandBar);
  const timeline = document.createElement("section");
  timeline.className = "model-timeline";
  timeline.setAttribute("aria-label", "作成履歴");
  timeline.append(panel.querySelector(".model-history"));
  panel.append(timeline);
  const historyScrubber = document.createElement("input");
  historyScrubber.type = "range";
  historyScrubber.className = "model-history-scrubber";
  historyScrubber.min = "-1";
  historyScrubber.value = "-1";
  historyScrubber.setAttribute("aria-label", "履歴表示位置");
  historyScrubber.title = "ドラッグで履歴を表示。クリック位置で表示だけを固定します。";
  historyScrubber.addEventListener("input", () => {
    const index = Number(historyScrubber.value);
    index < 0 ? view.clearStage() : view.setStage(store.document.features[index]?.id || null);
  });
  historyScrubber.addEventListener("change", () => {
    const index = Number(historyScrubber.value);
    frozenHistoryStage = index < 0 ? null : store.document.features[index]?.id || null;
    frozenHistoryStage ? view.setStage(frozenHistoryStage) : view.clearStage();
  });
  historyScrubber.addEventListener("dblclick", () => {
    historyScrubber.value = "-1";
    frozenHistoryStage = null;
    view.clearStage();
  });
  panel.querySelector(".model-history header").append(historyScrubber);
  const viewportOverlay = document.createElement("div");
  viewportOverlay.className = "model-viewport-overlay";
  const cursorReadout = document.createElement("output");
  cursorReadout.className = "model-cursor-readout";
  cursorReadout.hidden = true;
  const snapGuide = document.createElement("div");
  snapGuide.className = "model-snap-guide";
  snapGuide.hidden = true;
  const measurementLine = document.createElement("div");
  measurementLine.className = "model-measure-line";
  measurementLine.hidden = true;
  const measurementLabel = document.createElement("output");
  measurementLabel.className = "model-measure-label";
  measurementLabel.setAttribute("aria-label", "測定距離");
  measurementLabel.hidden = true;
  const dimensions = document.createElement("output");
  dimensions.className = "model-selection-dimensions";
  dimensions.hidden = true;
  const projectedDimensions = document.createElement("div");
  projectedDimensions.className = "model-projected-dimensions";
  projectedDimensions.hidden = true;
  for (const key of ["widthMm", "depthMm", "heightMm"]) {
    const label = document.createElement("span");
    label.dataset.dimension = key;
    projectedDimensions.append(label);
  }
  const inlineDimensionInput = document.createElement("input");
  inlineDimensionInput.className = "model-inline-dimension";
  inlineDimensionInput.setAttribute("aria-label", "3D寸法を編集");
  inlineDimensionInput.hidden = true;
  const distanceHandle = document.createElement("div");
  distanceHandle.className = "model-distance-handle";
  distanceHandle.hidden = true;
  const distanceArrow = makeToolButton("↥", "距離・量をドラッグ");
  distanceArrow.setAttribute("aria-label", "距離・量をドラッグ");
  const symmetricArrow = makeToolButton("↕", "対称押し出しをドラッグ");
  symmetricArrow.setAttribute("aria-label", "対称押し出しをドラッグ");
  distanceHandle.append(distanceArrow, symmetricArrow);
  const gizmo = document.createElement("div");
  gizmo.className = "model-transform-gizmo";
  gizmo.hidden = true;
  gizmo.setAttribute("aria-label", "移動・回転ギズモ");
  for (const axis of ["X", "Y", "Z"]) {
    const move = makeToolButton(`${axis}→`, `${axis}軸へ移動`);
    move.dataset.gizmo = "move";
    move.dataset.axis = axis;
    const rotate = makeToolButton(`↻${axis}`, `${axis}軸で回転`);
    rotate.dataset.gizmo = "rotate";
    rotate.dataset.axis = axis;
    const scale = makeToolButton(`□${axis}`, `${axis}軸だけ伸縮`);
    scale.dataset.gizmo = "scale";
    scale.dataset.axis = axis;
    rotate.className = "model-rotation-ring";
    gizmo.append(move, rotate, scale);
  }
  const uniformScale = makeToolButton("⤢", "均等スケールをドラッグ");
  uniformScale.dataset.gizmo = "scale";
  uniformScale.dataset.axis = "all";
  uniformScale.setAttribute("aria-label", "均等スケールをドラッグ");
  const pivotButton = makeToolButton("◎", "変換の中心をクリックで指定");
  pivotButton.setAttribute("aria-label", "変換の中心をクリックで指定");
  pivotButton.onclick = () => {
    pivotPicking = true;
    setStatus("回転・スケールの中心点をクリックしてください。");
  };
  gizmo.append(uniformScale, pivotButton);
  const boxSelection = document.createElement("div");
  boxSelection.className = "model-box-selection";
  boxSelection.hidden = true;
  viewportOverlay.append(cursorReadout, snapGuide, measurementLine, measurementLabel, dimensions, projectedDimensions, inlineDimensionInput, distanceHandle, gizmo, boxSelection);
  document.body.append(viewportOverlay);
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
  commandEditButton.addEventListener("click", () => {
    commandEditMode = !commandEditMode;
    setStatus(commandEditMode
      ? "コマンド配置編集：右クリックでピン留め、ドラッグで並べ替えます。"
      : "コマンド配置編集を終了しました。");
    render({ keepProperties: true, keepHistory: true });
  });
  thumbnailToggle.addEventListener("click", () => {
    uiPreferences.showThumbnails = !uiPreferences.showThumbnails;
    saveUiPreferences();
    render({ keepProperties: true, keepHistory: true });
  });
  measureButton.addEventListener("click", () => {
    measureMode = !measureMode;
    measurePoints = [];
    measurementLabel.hidden = true;
    measurementLine.hidden = true;
    setStatus(measureMode ? "距離を測る2点をクリックしてください。" : "距離測定を終了しました。");
    render({ keepProperties: true, keepHistory: true });
  });
  function editDisplayedDimension(event) {
    const entity = store.getEntity(selection[0]?.entityId);
    const feature = store.getFeature(selectedFeature || entity?.producer.featureId);
    const key = event.target.closest("[data-dimension]")?.dataset.dimension || "widthMm";
    const parameter = Object.hasOwn(feature?.parameters || {}, key) ? key :
      ["distanceMm", "radiusMm", "widthMm", "heightMm", "factor"].find((name) => typeof feature?.parameters[name] === "number");
    if (!feature || !parameter) return;
    const rect = event.target.getBoundingClientRect();
    inlineDimensionInput.value = feature.parameters[parameter];
    inlineDimensionInput.style.left = `${rect.left}px`;
    inlineDimensionInput.style.top = `${rect.top}px`;
    inlineDimensionInput.hidden = false;
    inlineDimensionInput.onkeydown = async (keyEvent) => {
      if (keyEvent.key === "Escape") inlineDimensionInput.hidden = true;
      if (keyEvent.key !== "Enter") return;
      keyEvent.preventDefault();
      try {
        const parameters = clone(feature.parameters);
        parameters[parameter] = parseScalar(inlineDimensionInput.value);
        await store.edit(feature.id, parameters);
        inlineDimensionInput.hidden = true;
        render();
      } catch (error) { report(error); }
    };
    inlineDimensionInput.focus();
    inlineDimensionInput.select();
  }
  dimensions.addEventListener("dblclick", editDisplayedDimension);
  projectedDimensions.addEventListener("dblclick", editDisplayedDimension);
  const arrayDialog = document.createElement("dialog");
  arrayDialog.className = "model-switch-dialog model-array-dialog";
  arrayDialog.innerHTML = `<form method="dialog"><h3>配列コピー</h3><label>個数<input name="count" type="number" min="2" max="100" value="3"></label><label>間隔 XYZ mm<input name="spacing" value="20,0,0"></label><button value="cancel">キャンセル</button><button value="apply" class="primary">作成</button></form>`;
  document.body.append(arrayDialog);
  let arrayPreviewTimer = null, arrayPreviewSequence = 0, arrayPreviewPromise = Promise.resolve();
  async function previewArrayCopies() {
    clearTimeout(arrayPreviewTimer);
    const sequence = ++arrayPreviewSequence;
    const original = selection.length === 1 && store.getEntity(selection[0].entityId);
    if (!original || !arrayDialog.open) return;
    const document = store.document, outputs = [];
    try {
      await startRuntime();
      const count = Number(arrayDialog.querySelector('[name="count"]').value);
      const spacing = parseCoordinate(arrayDialog.querySelector('[name="spacing"]').value);
      if (!Number.isSafeInteger(count) || count < 2 || count > 100) return;
      native.release(previewHandles);
      previewHandles = [];
      for (let index = 1; index < count; index++) {
        const command = clone(commandById("transform.move"));
        command.resultPolicy = "independent";
        const copySession = createCommandSession(command, {
          selection: [{ entityId: original.id, entityKind: original.kind }],
        });
        copySession.parameters.translation = spacing.map((value) => value * index);
        const result = await store.preview(copySession);
        if (!result || !["ok", "warning"].includes(result.status))
          throw new Error(result?.diagnostics?.[0]?.message || "配列のプレビューを作成できません。");
        outputs.push(...result.outputs);
        if (sequence !== arrayPreviewSequence || !arrayDialog.open || document !== store.document) {
          native.release(outputs.map((output) => output.handle));
          return;
        }
      }
      previewHandles = outputs.map((output) => output.handle);
      view.setPreview({ outputs }, { sourceEntityIds: [original.id] });
      setStatus(`${count}個の等間隔配列をプレビューしています。`);
    } catch (error) {
      native.release(outputs.map((output) => output.handle));
      if (sequence === arrayPreviewSequence && arrayDialog.open) report(error);
    }
  }
  for (const input of arrayDialog.querySelectorAll("input"))
    input.addEventListener("input", () => {
      clearTimeout(arrayPreviewTimer);
      arrayPreviewSequence++;
      arrayPreviewTimer = setTimeout(() => { arrayPreviewPromise = previewArrayCopies(); }, 180);
    });
  arrayButton.addEventListener("click", () => {
    const entity = selection.length === 1 && store.getEntity(selection[0].entityId);
    if (!entity) return setStatus("配列コピーする形状を1つ選択してください。");
    arrayDialog.returnValue = "cancel";
    arrayDialog.show();
    setStatus("形状をドラッグして配列の間隔を決め、個数を調整してください。");
    render({ keepProperties: true, keepHistory: true });
    arrayPreviewPromise = previewArrayCopies();
  });
  arrayDialog.addEventListener("close", async () => {
    clearTimeout(arrayPreviewTimer);
    arrayPreviewSequence++;
    await arrayPreviewPromise;
    view.clearPreview();
    native.release(previewHandles);
    previewHandles = [];
    if (arrayDialog.returnValue !== "apply") {
      render({ keepProperties: true, keepHistory: true });
      return;
    }
    try {
      await startRuntime();
      const original = selection.length === 1 && store.getEntity(selection[0].entityId);
      if (!original) throw new Error("配列コピーする形状を1つ選択してください");
      const count = Number(arrayDialog.querySelector('[name="count"]').value);
      const spacing = parseCoordinate(arrayDialog.querySelector('[name="spacing"]').value);
      if (!Number.isSafeInteger(count) || count < 2 || count > 100)
        throw new Error("個数は2〜100の整数です");
      let added = 0;
      for (let index = 1; index < count; index++) {
        const command = clone(commandById("transform.move"));
        command.resultPolicy = "independent";
        const copySession = createCommandSession(command, {
          selection: [{ entityId: original.id, entityKind: original.kind }],
        });
        copySession.parameters.translation = spacing.map((value) => value * index);
        if (await store.add(copySession)) added++;
        else {
          if (added > 1) store.transactions.squashLast(added, "配列コピー");
          if (added) store.transactions.undo();
          throw new Error("配列コピーを確定できませんでした。元形状を保持しました。");
        }
      }
      if (added > 1) store.transactions.squashLast(added, "配列コピー");
      setStatus(`${added + 1}個の等間隔配列を作成しました。`);
      render();
    } catch (error) {
      report(error);
    }
  });
  gizmo.addEventListener("pointerdown", async (event) => {
    const handle = event.target.closest("button[data-gizmo]");
    if (!handle || session) return;
    const entity = selection.length === 1 && store.getEntity(selection[0].entityId);
    if (!entity) return;
    event.preventDefault();
    const kind = handle.dataset.gizmo;
    const axisName = handle.dataset.axis;
    const axisIndex = { X: 0, Y: 1, Z: 2 }[axisName];
    const startX = event.clientX;
    const command = clone(commandById(`transform.${kind}`, kind === "scale" ? 2 : 1));
    if (event.ctrlKey || event.metaKey) command.resultPolicy = "independent";
    await begin(command);
    if (!session) return;
    handle.disabled = false;
    const target = session;
    const pivot = pendingPivot?.entityId === entity.id ? pendingPivot.point : centerOf(entity);
    if (kind === "scale") {
      target.parameters.factor = 1;
      target.parameters.center = [...pivot];
    }
    const move = (moveEvent) => {
      if (session !== target) return;
      const delta = moveEvent.clientX - startX;
      if (kind === "move") {
        let amount = moveEvent.altKey ? Math.round(delta) / 10 : Math.round(delta);
        const center = entity.bbox.min.map(
          (minimum, index) => (minimum + entity.bbox.max[index]) / 2,
        );
        const aligned = snapCandidates(store.document, { includeIntersections: false })
          .filter((candidate) => candidate.entityId !== entity.id)
          .map((candidate) => ({
            ...candidate,
            offset: candidate.point[axisIndex] - center[axisIndex],
          }))
          .sort((a, b) => Math.abs(a.offset - amount) - Math.abs(b.offset - amount))
          .find((candidate) => Math.abs(candidate.offset - amount) <= 5);
        if (aligned && !moveEvent.altKey) {
          amount = aligned.offset;
          const point = view.project(aligned.point);
          if (point) {
            snapGuide.hidden = false;
            snapGuide.style.left = `${point.x}px`;
            snapGuide.style.top = `${point.y}px`;
          }
        } else snapGuide.hidden = true;
        const translation = [0, 0, 0];
        translation[axisIndex] = amount;
        dispatchSession(session, { type: "setting.change", key: "translation", value: translation });
        cursorReadout.textContent = `${axisName} ${amount.toFixed(moveEvent.altKey ? 1 : 0)} mm · ${moveEvent.altKey ? "精密" : "1mm snap"}`;
      } else if (kind === "rotate") {
        const degrees = moveEvent.shiftKey ? delta : Math.round(delta / 15) * 15;
        const direction = [0, 0, 0];
        direction[axisIndex] = 1;
        dispatchSession(session, { type: "setting.change", key: "axis", value: { origin: [...pivot], direction } });
        dispatchSession(session, { type: "setting.change", key: "angleRad", value: degrees * Math.PI / 180 });
        cursorReadout.textContent = `${axisName} ${degrees.toFixed(1)}° · ${moveEvent.shiftKey ? "自由" : "15° snap"}`;
      } else {
        const factor = Math.max(0.01, 1 + delta * (moveEvent.altKey ? 0.001 : 0.01));
        if (axisName === "all") target.parameters.factor = factor;
        else {
          const factors = [1, 1, 1];
          factors[axisIndex] = factor;
          target.parameters.axisFactors = factors;
        }
        target.previewSequence++;
        cursorReadout.textContent = `${axisName === "all" ? "均等" : axisName} × ${factor.toFixed(3)}`;
      }
      cursorReadout.hidden = false;
      cursorReadout.style.left = `${moveEvent.clientX}px`;
      cursorReadout.style.top = `${moveEvent.clientY}px`;
      saveDraft();
      queuePreview();
    };
    trackDrag(handle, event, move, async () => {
      if (session === target) await commit();
    }, () => { if (session === target) cancel(); });
  });
  function trackDrag(handle, event, onMove, onEnd, onCancel) {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const cleanup = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", abort);
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      activeDrag = null;
      cursorReadout.hidden = true;
      snapGuide.hidden = true;
    };
    const finish = () => { cleanup(); Promise.resolve(onEnd?.()).catch(report); };
    const abort = () => { cleanup(); onCancel?.(); };
    activeDrag = { abort };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", abort);
  }
  function sessionAmountKey(target) {
    // Point-first drawing must leave the canvas free for its next point.
    if (["point.create", "curve.line", "curve.polyline", "curve.rectangle",
      "curve.polygon", "curve.circle", "curve.arc", "curve.ellipse",
      "curve.nurbs", "curve.interpolate"].includes(target?.command.baseOperation.id)) return null;
    return ["distanceMm", "radiusMm", "distance1Mm", "thicknessMm", "heightMm"].find(
      (key) => typeof target?.parameters?.[key] === "number",
    );
  }
  function dragSessionAmount(handle, event, symmetric = false) {
    const target = session, key = sessionAmountKey(target);
    if (!target || !key) return;
    const initial = target.parameters[key], initialX = event.clientX;
    const parameters = clone(target.parameters);
    if (symmetric && target.command.baseOperation.id === "shape.extrude") target.parameters.bothSides = true;
    trackDrag(handle, event, (moveEvent) => {
      if (session !== target) return;
      const raw = initial + (moveEvent.clientX - initialX) * (moveEvent.altKey ? 0.1 : 1);
      const value = moveEvent.altKey || !$("modelSnap").checked ? raw : Math.round(raw);
      dispatchSession(target, { type: "setting.change", key, value });
      cursorReadout.hidden = false;
      cursorReadout.style.left = `${moveEvent.clientX}px`;
      cursorReadout.style.top = `${moveEvent.clientY}px`;
      cursorReadout.textContent = `${value.toFixed(moveEvent.altKey ? 1 : 0)} mm${target.parameters.bothSides ? " · 両側" : ""}`;
      const field = $("modelProperties").querySelector(`[data-parameter="${key}"]`);
      if (field) field.value = String(value);
      saveDraft();
      queuePreview();
    }, () => { if (session === target) return commit(); }, () => {
      target.parameters = parameters;
      if (session === target) cancel();
    });
  }
  distanceArrow.addEventListener("pointerdown", (event) => dragSessionAmount(distanceArrow, event));
  symmetricArrow.addEventListener("pointerdown", (event) => dragSessionAmount(symmetricArrow, event, true));
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
  const…16977 tokens truncated…"].entries()) {
        const item = document.createElement("span");
        item.dataset.dimension = ["widthMm", "depthMm", "heightMm"][index];
        item.textContent = `${index ? " × " : ""}${label} ${size[index].toFixed(2)}`;
        dimensions.append(item);
      }
      dimensions.append(" mm");
      dimensions.hidden = false;
      const center = selectedEntity.bbox.min.map((value, index) => (value + selectedEntity.bbox.max[index]) / 2);
      const screen = view.project(center);
      if (!activeDrag) gizmo.hidden = !screen?.visible || !!selection[0]?.kind || arrayDialog.open || (!!session && session.command.baseOperation.id !== "shape.transform") || featureEditActive;
      if (!activeDrag) for (const handle of gizmo.querySelectorAll("[data-gizmo]")) handle.disabled = !!session;
    } else {
      dimensions.hidden = true;
      gizmo.hidden = true;
    }
    if (!activeDrag) {
      const amountKey = sessionAmountKey(session);
      distanceHandle.hidden = !amountKey || !sessionReady(session);
      if (!distanceHandle.hidden) {
        const source = Object.values(session.inputs).flat().map((reference) => store.getEntity(reference.entityId)).find(Boolean);
        const point = source ? centerOf(source) : session.parameters.center || session.parameters.anchor || [0,0,0];
        const screen = view.project(point);
        distanceHandle.hidden = !screen?.visible;
        symmetricArrow.hidden = session.command.baseOperation.id !== "shape.extrude";
        distanceArrow.title = `${labels[amountKey] || amountKey}をドラッグ`;
      }
    }
    positionViewportControls();
    thumbnailToggle.setAttribute("aria-pressed", String(uiPreferences.showThumbnails));
    commandEditButton.setAttribute("aria-pressed", String(commandEditMode));
    commandBar.classList.toggle("is-editing", commandEditMode);
    measureButton.setAttribute("aria-pressed", String(measureMode));
    document.body.classList.toggle("model-panels-hidden", panelsTemporarilyHidden);
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
        const sourceEntityIds = [...new Set(Object.values(target.inputs || {})
            .flat()
            .map((reference) => reference.entityId)
            .filter(Boolean))];
        const sequence = target.previewSequence, document = store.document;
        const scratch = [];
        const raw = async (operation, parameters, inputs) => {
          const output = await native.evaluate({
            documentId: document.id, documentRevision: document.documentRevision,
            featureId: target.id, featureRevision: 0, sessionId: target.id,
            previewSequence: sequence, requestedHash: id(), intent: "preview",
            operation: { id: operation, version: 1 }, parameters, inputs,
            tolerances: document.tolerances,
          });
          scratch.push(...output.outputs.map((item) => item.handle));
          if (output.status === "failed") throw new Error(output.diagnostics[0]?.message || "変更プレビューを計算できません。");
          return output.outputs;
        };
        const ref = (output) => ({ handle: output.handle, geometryHash: output.geometryHash, selector: null });
        let displayed = result.outputs, removed = null, sources = sourceEntityIds.map((entityId) => store.getEntity(entityId)).filter((entity) => entity?.kind === "solid");
        try {
          if (target.command.baseOperation.id === "shape.extrude" && displayed.length === 1 && displayed[0].kind === "solid") {
            const extrusion = displayed[0], overlaps = [];
            for (const entity of deriveVisibleEntities(document).filter((entity) => entity.kind === "solid" && !entity.locked && boundsOverlap(entity.bbox, extrusion.summary.bbox))) {
              const source = await store.handle(entity);
              const common = await raw("solid.intersection", {}, { arguments: [ref(source)], tools: [ref(extrusion)] });
              if (common.some((output) => !output.summary.empty)) overlaps.push({ entity, source });
            }
            if (overlaps.length === 1) {
              const operation = target.parameters.distanceMm < 0 ? "solid.difference" : "solid.union";
              displayed = await raw(operation, operation === "solid.difference" ? {keepTools:false} : {},
                operation === "solid.difference"
                  ? { arguments: [ref(overlaps[0].source)], tools: [ref(extrusion)] }
                  : { arguments: [ref(overlaps[0].source), ref(extrusion)] });
              sources = [overlaps[0].entity];
              sourceEntityIds.push(overlaps[0].entity.id);
            }
          }
          if (sources.length && displayed.length && displayed.every((output) => output.kind === "solid")) {
            const before = [];
            for (const entity of sources) before.push(ref(await store.handle(entity)));
            const after = displayed.map(ref);
            const added = await raw("solid.difference", {keepTools:false}, { arguments: after, tools: before });
            removed = target.command.resultPolicy === "independent" ? [] :
              await raw("solid.difference", {keepTools:false}, { arguments: before, tools: after });
            displayed = added;
          }
          if (target !== session || document !== store.document || sequence !== target.previewSequence) {
            native.release([...previewHandles, ...scratch]); previewHandles = []; return;
          }
          previewHandles.push(...scratch);
        } catch (error) {
          native.release(scratch);
          if (target !== session) return;
          target.diagnostics = [...target.diagnostics, {code:"CAD_PREVIEW_UNAVAILABLE", severity:"warning", message:`変更範囲の表示を更新できません。設定と元形状を保持しています。${error.message}`, actions:[]}];
          displayed = result.outputs; removed = null;
        }
        view.setPreview({ outputs: displayed }, {
          sourceEntityIds,
          removedOutputs: removed,
        });
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
  function performHistoryAction(action, { clearSession = false, renderAfter = true } = {}) {
    if (clearSession) {
      session = null;
      view.clearPreview();
    }
    store.transactions[action]();
    if (renderAfter) render();
  }
  function requestHistoryAction(action, options = {}) {
    if (commitBusy) {
      pendingHistoryActions.push({ action, clearSession: !!options.clearSession });
      setStatus("形状の確定後にUndo/Redoを実行します。");
      render();
      return;
    }
    performHistoryAction(action, options);
  }
  function flushPendingHistoryActions() {
    const actions = pendingHistoryActions.splice(0);
    for (const pending of actions)
      performHistoryAction(pending.action, { ...pending, renderAfter: false });
    if (actions.length)
      setStatus("形状の確定後に保留していたUndo/Redoを実行しました。");
    render();
  }
  async function commit() {
    if (!session || commitBusy) return;
    clearTimeout(previewTimer);
    if (!$("modelSettingsForm")?.reportValidity()) return;
    if (invalidFields.size) return;
    const target = session;
    target.sketchSupport =
      store.document.uiState.workPlaneSupport &&
      canonical(target.parameters.plane) === canonical(store.document.uiState.workPlane)
        ? clone(store.document.uiState.workPlaneSupport)
        : null;
    const operationId = target.command.baseOperation.id;
    const previousSolidIds = new Set(
      deriveVisibleEntities(store.document)
        .filter((entity) => entity.kind === "solid" && !entity.locked)
        .map((entity) => entity.id),
    );
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
        const committedFeature = store.document.features.at(-1);
        const committedEntity = committedFeature?.outputSlots
          .map((slot) => store.getEntity(slot.entityId))
          .find(Boolean);
        let composed = false,
          multipleExtrudeTargets = false,
          compositionFailed = false;
        if (operationId === "curve.polyline" && closePolylineAsFace && committedEntity) {
          const regionCommand = clone(commandById("S03"));
          const regionSession = createCommandSession(regionCommand, {
            selection: [{ entityId: committedEntity.id, entityKind: committedEntity.kind }],
          });
          if (await store.add(regionSession)) {
            store.transactions.squashLast(2, "ポリラインを閉じた面にする");
            composed = true;
          } else compositionFailed = true;
          closePolylineAsFace = false;
        }
        if (operationId === "shape.extrude" && committedEntity?.kind === "solid") {
          const overlaps = [];
          for (const entity of store.document.entities.filter((candidate) => previousSolidIds.has(candidate.id))) {
            if (!boundsOverlap(entity.bbox, committedEntity.bbox, store.document.tolerances.kernelLinearMm)) continue;
            const intersection = createCommandSession(commandById("D03"), {
              selection: [
                { entityId: entity.id, entityKind: entity.kind },
                { entityId: committedEntity.id, entityKind: committedEntity.kind },
              ],
            });
            intersection.inputs = {
              arguments: [{entityId: entity.id, role:"arguments"}],
              tools: [{entityId: committedEntity.id, role:"tools"}],
            };
            const common = await store.preview(intersection);
            if (!common || common.status === "failed") {
              compositionFailed = true;
              break;
            }
            if (common.outputs.some((output) => !output.summary.empty)) overlaps.push(entity);
            native.release(common.outputs.map((output) => output.handle));
          }
          if (!compositionFailed && overlaps.length === 1) {
            const cutting = Number(target.parameters.distanceMm) < 0;
            const booleanCommand = clone(commandById(cutting ? "D02" : "D01"));
            const booleanSession = createCommandSession(booleanCommand, {
              selection: [
                { entityId: overlaps[0].id, entityKind: overlaps[0].kind },
                { entityId: committedEntity.id, entityKind: committedEntity.kind },
              ],
            });
            if (cutting) booleanSession.inputs = {
              arguments: [{entityId: overlaps[0].id, role:"arguments"}],
              tools: [{entityId: committedEntity.id, role:"tools"}],
            };
            if (await store.add(booleanSession)) {
              store.transactions.squashLast(2, cutting ? "押し出し切取" : "押し出し追加");
              composed = true;
            } else compositionFailed = true;
          } else if (overlaps.length > 1) {
            multipleExtrudeTargets = true;
            setStatus(
              "複数bodyと交差するため自動追加/切取は行わず、通常のExtrudeとして確定しました。",
            );
          }
        }
        session = null;
        referencePlanePicking = false;
        propertiesOpen = false;
        featureEditActive = false;
        invalidFields.clear();
        view.clearPreview();
        native.release(previewHandles);
        previewHandles = [];
        if (compositionFailed)
          setStatus("後続演算を確定できませんでした。作成済みの元操作と失敗した下書きを保持しています。");
        else if (!composed && !multipleExtrudeTargets)
          setStatus("形状を確定しました。履歴から寸法を変更できます。");
        else if (composed)
          setStatus("既存コマンドを1つのUndo単位として合成し、形状を確定しました。");
      } else
        setStatus(
          "確定できません。元の形状を保持し、失敗した設定を下書きとして残しました。",
        );
    } catch (error) {
      target.state = "repairing";
      report(error);
    } finally {
      commitBusy = false;
      flushPendingHistoryActions();
    }
  }
  async function loadCommands() {
    try {
      const read = readLibraryContainer(
        JSON.parse(await native.invoke("cad_command_library")),
        "command",
      );
      globalCommands = read.entries;
      if (read.migrated)
        await native.invoke("cad_command_library", {
          content: JSON.stringify(writeLibraryContainer(globalCommands, "command")),
        });
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
      const read = readLibraryContainer(
        JSON.parse(await native.invoke("cad_shape_library")),
        "shape",
      );
      library = read.entries;
      if (read.migrated)
        await native.invoke("cad_shape_library", {
          content: JSON.stringify(writeLibraryContainer(library, "shape")),
        });
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
        content: JSON.stringify(writeLibraryContainer(library, "shape")),
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
        document.dispatchEvent(new CustomEvent("pathloom:cad-recovery-state", { detail: { pending: false } }));
        restoreUi();
        setStatus(
          "CAD作業を回復しました。ユーザーのprojectファイルは変更していません。",
        );
      }
      if (choice === "discard") {
        await native.invoke("cad_recovery", { discard: true });
        recoveryData = null;
        recoveryPending = false;
        document.dispatchEvent(new CustomEvent("pathloom:cad-recovery-state", { detail: { pending: false } }));
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
      document.dispatchEvent(new CustomEvent("pathloom:cad-recovery-state", { detail: { pending: recoveryPending } }));
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
  $("modelUndo").onclick = () => requestHistoryAction("undo", { clearSession: true });
  $("modelRedo").onclick = () => requestHistoryAction("redo");
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
    store.document.uiState.workPlaneSupport = null;
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
    store.document.uiState.workPlaneSupport = {
      entityId: hit.entityId,
      topologyId: hit.topologyId,
      centroid: clone(
        faces[faceIndex]?.fingerprint?.centroid || hit.point,
      ),
    };
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
      else if (
        params.points.length >= 3 &&
        Math.hypot(...p.map((value, index) => value - params.points[0][index])) <= 1
      ) {
        params.closed = true;
        closePolylineAsFace = true;
        lastPoint = clone(params.points[0]);
        setStatus("始点へ閉じるスナップ · 確定時に閉じた面を作成します。");
      } else params.points.push(p);
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
    if (!e || e.locked || e.visibility === "hidden") return;
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
  function visibilityShortcut(key, showAll) {
    const before = clone(store.document);
    const selected = new Set(selection.map((reference) => store.getEntity(reference.entityId)?.bodyId));
    if (!showAll && !selected.size) return;
    for (const entity of store.document.entities) {
      if (showAll) entity.visibility = "visible";
      else if (key === "h" && selected.has(entity.bodyId)) entity.visibility = "hidden";
      else if (key === "i") entity.visibility = selected.has(entity.bodyId) ? "visible" : "hidden";
    }
    store.document.documentRevision++;
    store.transactions.record(before, store.document, showAll ? "すべて表示" : key === "i" ? "選択形状をisolate" : "選択形状を隠す");
    render();
  }
  let down = null,
    boxDragged = false,
    snapPoint = null;
  $("modelSnap").onchange = () => {
    snapPoint = null;
  };
  const canvas = api.preview().canvas;
  api.preview().controls?.addEventListener("change", positionViewportControls);
  document.addEventListener("pathloom:camera-changed", positionViewportControls);
  const planeTooltip = document.createElement("div");
  planeTooltip.className = "model-plane-tooltip";
  planeTooltip.textContent = "平面を選択";
  planeTooltip.hidden = true;
  document.body.append(planeTooltip);
  canvas.addEventListener("pointerleave", () => {
    planeTooltip.hidden = true;
    cursorReadout.hidden = true;
    snapGuide.hidden = true;
    hoveredSubshape = null;
    view.hover(null);
    view.hoverReferencePlane?.(null);
  });
  let cachedSnaps = null;
  function snapCandidate(event) {
    if (!$("modelSnap").checked) return null;
    const { THREE, camera } = api.preview();
    if (!camera) return null;
    let nearest = 8,
      found = null;
    if (cachedSnaps?.document !== store.document || cachedSnaps?.revision !== store.document.documentRevision)
      cachedSnaps = { document: store.document, revision: store.document.documentRevision, points: snapCandidates(store.document) };
    const candidates = [...cachedSnaps.points];
    if (session?.command.baseOperation.id === "curve.polyline" && session.parameters.points.length >= 3)
      candidates.unshift({ point: session.parameters.points[0], label: "閉じる" });
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
        const p = view.project(candidate.point);
        if (!p?.visible) continue;
        const distance = Math.hypot(
          p.x - event.clientX,
          p.y - event.clientY,
        );
        if (distance < nearest && view.pointVisible(candidate.point)) {
          nearest = distance;
          found = candidate;
        }
    }
    return found;
  }
  function drawingPoint(event) {
    const featureSnap = snapCandidate(event)?.point || snapPoint;
    if (featureSnap) return [...featureSnap];
    const point = view.pointAt(event, inputPlane(true));
    return point && !event.altKey && $("modelSnap").checked ? point.map((value) => Math.round(value)) : point;
  }
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!active()) return;
      if (activeDrag) return;
      if (down && event.buttons === 1 && !session) {
        const distance = Math.hypot(event.clientX - down[0], event.clientY - down[1]);
        if (distance > 3) {
          boxDragged = true;
          boxSelection.hidden = false;
          boxSelection.style.left = `${Math.min(down[0], event.clientX)}px`;
          boxSelection.style.top = `${Math.min(down[1], event.clientY)}px`;
          boxSelection.style.width = `${Math.abs(event.clientX - down[0])}px`;
          boxSelection.style.height = `${Math.abs(event.clientY - down[1])}px`;
        }
        return;
      }
      if (event.buttons) return;
      if (!session) {
        const hit = view.hit(event, "edge")[0] || view.hit(event, "face")[0] || view.hit(event, "object")[0] || null;
        hoveredSubshape = hit;
        view.hover(hit);
      }
      let cursorPoint = null;
      try {
        cursorPoint = view.pointAt(event, inputPlane(true));
      } catch {}
      if (cursorPoint) {
        const point = event.altKey || !$("modelSnap").checked ? cursorPoint : cursorPoint.map((value) => Math.round(value));
        cursorReadout.hidden = false;
        cursorReadout.style.left = `${event.clientX}px`;
        cursorReadout.style.top = `${event.clientY}px`;
        cursorReadout.textContent = `${point.map((value) => value.toFixed(event.altKey ? 1 : 0)).join(", ")} mm · ${event.altKey ? "精密" : "1mm snap"}`;
      }
      if (!session) return;
      const hoveredPlane = referencePlanePicking && view.hit(event, "workplane")[0];
      planeTooltip.hidden = !hoveredPlane;
      if (hoveredPlane) {
        planeTooltip.style.left = Math.min(event.clientX + 14, innerWidth - 110) + "px";
        planeTooltip.style.top = Math.min(event.clientY + 14, innerHeight - 34) + "px";
      }
      view.hoverReferencePlane?.(hoveredPlane?.referencePlane);
      const found = snapCandidate(event);
      snapPoint = found?.point || null;
      snapGuide.hidden = !found;
      if (found) {
        snapGuide.style.left = `${event.clientX}px`;
        snapGuide.style.top = `${event.clientY}px`;
        setStatus(
          `${found.label}にスナップ · ${found.point.map((n) => n.toFixed(3)).join(", ")} mm`,
        );
      }
    },
    true,
  );
  canvas.addEventListener(
    "pointerdown",
    async (event) => {
      if (active() && event.button === 0) {
        down = [event.clientX, event.clientY];
        boxDragged = false;
        event.stopImmediatePropagation();
        if (session || pivotPicking || measureMode) return;
        if (arrayDialog.open) {
          const entity = selection.length === 1 && store.getEntity(selection[0].entityId);
          const hit = view.hit(event, "object")[0];
          if (!entity || hit?.entityId !== entity.id) return;
          const plane = { ...clone(store.document.uiState.workPlane), origin: centerOf(entity) };
          const start = view.pointAt(event, plane);
          if (!start) return;
          trackDrag(canvas, event, (moveEvent) => {
            const point = view.pointAt(moveEvent, plane);
            if (!point) return;
            const translation = point.map((value, axis) => value - start[axis]);
            const spacing = moveEvent.altKey || !$("modelSnap").checked ? translation : translation.map(Math.round);
            const field = arrayDialog.querySelector('[name="spacing"]');
            field.value = spacing.join(",");
            field.dispatchEvent(new Event("input", {bubbles:true}));
          }, () => { arrayPreviewPromise = previewArrayCopies(); }, () => arrayDialog.close("cancel"));
          return;
        }
        const edge = view.hit(event, "edge")[0];
        if (edge && store.getEntity(edge.entityId)?.kind === "solid" && selection.some((reference) => reference.entityId === edge.entityId && reference.topologyId === edge.topologyId)) {
          const entity = store.getEntity(edge.entityId);
          const topology = entity.displayCache.topology.find((item) => item.topologyId === edge.topologyId);
          selection = [{ entityId: entity.id }, makeSubshapeRef(entity, topology)];
          let target = null, pending = null, latest = event, dragged = false, cancelled = false, initial = 0, key = null;
          const apply = () => {
            if (!target || session !== target) return;
            const raw = initial + (latest.clientX - event.clientX) * (latest.altKey ? 0.1 : 1);
            const value = latest.altKey || !$("modelSnap").checked ? raw : Math.round(raw);
            dispatchSession(target, {type:"setting.change",key,value});
            const field = $("modelProperties").querySelector(`[data-parameter="${key}"]`);
            if (field) field.value = String(value);
            cursorReadout.hidden = false;
            cursorReadout.style.left = `${latest.clientX}px`;
            cursorReadout.style.top = `${latest.clientY}px`;
            cursorReadout.textContent = `${value.toFixed(latest.altKey ? 1 : 0)} mm`;
            saveDraft(); queuePreview();
          };
          trackDrag(canvas, event, (moveEvent) => {
            latest = moveEvent;
            if (!dragged && Math.hypot(latest.clientX-event.clientX,latest.clientY-event.clientY) <= 3) return;
            if (!pending) {
              dragged = true;
              pending = begin(commandById(event.shiftKey ? "D06" : "D05", 2)).then(() => {
                if (cancelled) { cancel(); return; }
                target = session; key = sessionAmountKey(target); initial = target.parameters[key]; properties(); apply();
              });
            } else apply();
          }, async () => {
            if (!dragged) return;
            await pending;
            if (session === target) { apply(); await commit(); }
          }, () => {
            cancelled = true;
            if (target && session === target) cancel();
          });
        } else if (event.ctrlKey || event.metaKey) {
          const hit = view.hit(event, "object")[0];
          const entity = hit && store.getEntity(hit.entityId);
          if (!entity || entity.locked) return;
          selection = [{ entityId: entity.id }];
          const plane = clone(store.document.uiState.workPlane);
          plane.origin = centerOf(entity);
          const start = view.pointAt(event, plane);
          if (!start) return;
          const command = clone(commandById("transform.move"));
          command.resultPolicy = "independent";
          await begin(command);
          const target = session;
          trackDrag(canvas, event, (moveEvent) => {
            const point = view.pointAt(moveEvent, plane);
            if (!point || target !== session) return;
            const translation = point.map((value, axis) => value - start[axis]);
            dispatchSession(target, { type: "setting.change", key: "translation", value:
              $("modelSnap").checked && !moveEvent.altKey ? translation.map(Math.round) : translation });
            saveDraft(); queuePreview();
          }, () => { if (session === target) return commit(); }, () => { if (session === target) cancel(); });
        }
      }
    },
    true,
  );
  canvas.addEventListener(
    "pointerup",
    (event) => {
      if (!active() || arrayDialog.open || event.button !== 0 || !down || !boxDragged || session) return;
      const rect = {
        left: Math.min(down[0], event.clientX),
        right: Math.max(down[0], event.clientX),
        top: Math.min(down[1], event.clientY),
        bottom: Math.max(down[1], event.clientY),
      };
      const touching = event.clientX < down[0];
      selection = view.entitiesInRect(store.document, rect, touching).map((entityId) => ({ entityId }));
      store.document.uiState.selection = clone(selection);
      boxSelection.hidden = true;
      setStatus(
        `${touching ? "接触" : "包含"}矩形で${selection.length}件を選択しました。`,
      );
      render({ keepProperties: true, keepHistory: true });
      event.stopImmediatePropagation();
    },
    true,
  );
  canvas.addEventListener(
    "dblclick",
    (event) => {
      if (!active() || arrayDialog.open || session || event.button !== 0) return;
      const hit = view.hit(event, "object")[0];
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectHit({ entityId: hit.entityId }, event);
      setStatus("形状全体を選択しました。");
    },
    true,
  );
  canvas.addEventListener(
    "contextmenu",
    (event) => {
      if (!active() || arrayDialog.open || session) return;
        const hit = view.hit(event, "edge")[0] || view.hit(event, "face")[0];
      if (hit) showSubshapeMenu(hit, event);
    },
    true,
  );
  canvas.addEventListener(
    "click",
    (event) => {
      if (!active() || event.button !== 0) return;
      planeTooltip.hidden = true;
      event.stopImmediatePropagation();
      if (arrayDialog.open) return;
      if (
        down &&
        Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 3
      )
        return;
      if (pivotPicking) {
        const entity = store.getEntity(selection[0]?.entityId);
        const hit = view.hit(event, "vertex")[0] || view.hit(event, "face")[0];
        const point = snapCandidate(event)?.point || hit?.point || view.pointAt(event, inputPlane(true));
        if (entity && point) {
          pendingPivot = { entityId: entity.id, point: [...point] };
          if (session?.parameters.mode === "rotate")
            dispatchSession(session, { type:"setting.change", key:"axis", value:{...session.parameters.axis, origin:[...point]} });
          if (session?.parameters.mode === "scale")
            dispatchSession(session, { type:"setting.change", key:"center", value:[...point] });
          if (session) { saveDraft(); properties(); queuePreview(); }
          pivotPicking = false;
          setStatus(`変換の中心 ${point.map((value) => value.toFixed(3)).join(", ")} mm`);
        }
        return;
      }
      if (measureMode) {
        try {
          const point = drawingPoint(event);
          if (!point) return;
          measurePoints.push(point);
          if (measurePoints.length === 1) {
            setStatus("2点目をクリックしてください。");
          } else {
            const distance = Math.hypot(...measurePoints[1].map((value, index) => value - measurePoints[0][index]));
            setStatus(`測定距離 ${distance.toFixed(3)} mm`);
            measurementLabel.textContent = `${distance.toFixed(3)} mm`;
            measurementLabel.hidden = false;
            const a = view.project(measurePoints[0]), b = view.project(measurePoints[1]);
            if (a && b) {
              measurementLabel.style.left = `${(a.x + b.x) / 2}px`;
              measurementLabel.style.top = `${(a.y + b.y) / 2 - 24}px`;
              Object.assign(measurementLine.style, {
                left: `${a.x}px`, top: `${a.y}px`, width: `${Math.hypot(b.x-a.x,b.y-a.y)}px`,
                transform: `rotate(${Math.atan2(b.y-a.y,b.x-a.x)}rad)`,
              });
              measurementLine.hidden = false;
            }
            measurePoints = [];
          }
        } catch (error) {
          report(error);
        }
        return;
      }
      if (mirrorPlanePicking && session) {
        const hit = view.hit(event, "face")[0];
        try {
          if (hit) applyFaceWorkplane(hit);
          else {
            const planeHit = view.hit(event, "workplane")[0];
            if (!planeHit)
              return setStatus("ミラー基準にするfaceまたは基準面をクリックしてください。");
            applyReferenceWorkplane(planeHit.referencePlane);
          }
          dispatchSession(session, { type: "setting.change", key: "plane", value: clone(store.document.uiState.workPlane) });
          mirrorPlanePicking = false;
          referencePlanePicking = false;
          view.showReferencePlanes?.(false);
          saveDraft();
          properties();
          queuePreview();
          setStatus("選択面をミラー基準にしました。反転プレビューを確認してください。");
        } catch (error) {
          report(error);
        }
        return;
      }
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
              acceptPoint(drawingPoint(event) || faceHit.point);
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
          acceptPoint(drawingPoint(event) || planeHit.point);
        return;
      }
      if (
        session && curvePointPicking
      ) {
        try{const p=drawingPoint(event);if(p)acceptPoint(p);}catch(error){rejectDrawingPoint(error);}
        return;
      }
      if (
        session &&
        !session.command.inputs.some((s) =>
          ["entity", "subshape"].includes(s.kind),
        )
      ) {
        try {
          const p = drawingPoint(event);
          if (p) acceptPoint(p);
        } catch (error) {
          rejectDrawingPoint(error);
        }
        return;
      }
      const filter = $("modelPickFilter").value,
        adaptiveHit = !session && (view.hit(event, "edge")[0] || view.hit(event, "face")[0]),
        hits = adaptiveHit ? [adaptiveHit] : view.hit(event, filter);
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
          const p = drawingPoint(event);
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
      const eventTarget = event.target instanceof Element ? event.target : document.body;
      if (active() && event.key === "Escape" && arrayDialog.open) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (activeDrag) activeDrag.abort();
        else arrayDialog.close("cancel");
        return;
      }
      if (active() && event.key === "Escape" && activeDrag) {
        event.preventDefault(); event.stopImmediatePropagation(); activeDrag.abort(); return;
      }
      if (active() && event.key === "Enter" && eventTarget.closest("#modelProperties") &&
          eventTarget.matches("input,textarea,select") && !event.isComposing) {
        event.preventDefault(); event.stopImmediatePropagation();
        const fields = [...$("modelProperties").querySelectorAll("input,textarea,select")].filter(
          (field) => !field.disabled && field.getClientRects().length,
        );
        const next = fields[fields.indexOf(eventTarget) + 1] || $("modelCommit");
        next.focus(); return;
      }
      if (
        !active() ||
        event.isComposing ||
        event.keyCode === 229 ||
        (event.key === "Enter" && eventTarget.closest("button")) ||
        (eventTarget.closest("input,textarea,select,[contenteditable=true]") &&
          !(event.key === "Escape" && (planePicking || session)))
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestHistoryAction(event.shiftKey ? "redo" : "undo");
      } else if (!event.ctrlKey && !event.metaKey && ["h", "i"].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopImmediatePropagation();
        visibilityShortcut(event.key.toLowerCase(), event.shiftKey && event.key.toLowerCase() === "h");
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        panelsTemporarilyHidden = !panelsTemporarilyHidden;
        render({ keepProperties: true, keepHistory: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (planePicking) {
          planePicking = false;
          planeSelect.value = planeBeforeFace;
          $("modelPickFilter").value = pickFilterBeforePlane;
        }
        pivotPicking = false;
        down = null;
        boxSelection.hidden = true;
        if (session) cancel();
        else {
          measureMode = false;
          measurementLabel.hidden = true;
          measurementLine.hidden = true;
          mirrorPlanePicking = false;
          selectedFeature = null;
          propertiesOpen = false;
          featureEditActive = false;
          view.hover(null);
          setStatus("操作を終了しました。");
          render({ keepProperties: true, keepHistory: true });
        }
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
    updateView();
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
    refreshView: () => updateView(),
    projectPoint: (point) => view.project(point),
    displayState: () => view.displayState(),
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
      updateView();
      return entityId;
    },
    render,
  };
}
