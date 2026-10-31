import { clone, WORLD_XY } from "../document.js";
const definitions = new Map(),
  knownOperations = new Set();
export function validateCommandDefinition(raw) {
  const d = clone(raw);
  if (
    d?.format !== "pathloom-command" ||
    d.schemaVersion !== 1 ||
    !d.id ||
    !Number.isInteger(d.version) ||
    d.version < 1 ||
    !d.displayName ||
    !Array.isArray(d.aliases) ||
    d.aliases.some((a) => typeof a !== "string" || !a.trim()) ||
    !d.baseOperation?.id ||
    d.baseOperation.version !== 1 ||
    !ADAPTERS.has(d.adapter)
  )
    throw new Error("Unsupported CAD command definition");
  if (!Array.isArray(d.inputs) || !["copy", "replace"].includes(d.resultPolicy))
    throw new Error("Invalid CAD command data");
  for (const slot of d.inputs) {
    if (
      !slot.key ||
      !["entity", "subshape", "point", "plane"].includes(slot.kind)
    )
      throw new Error("Invalid CAD input slot");
    if (
      slot.kind === "point" &&
      (slot.minCount > 1 || (slot.maxCount != null && slot.maxCount !== 1))
    )
      throw new Error(
        "複数点slotの定義は未実装です。Polylineの作図を使ってください。",
      );
    if (["entity", "subshape"].includes(slot.kind)) {
      if (
        !Array.isArray(slot.allowedEntityKinds) ||
        !slot.allowedEntityKinds.length
      )
        throw new Error("Input slot requires allowedEntityKinds");
      slot.minCount ??= 1;
      slot.maxCount ??= null;
      if (
        !Number.isInteger(slot.minCount) ||
        slot.minCount < 0 ||
        (slot.maxCount !== null &&
          (!Number.isInteger(slot.maxCount) || slot.maxCount < slot.minCount))
      )
        throw new Error("Invalid input counts");
    }
  }
  d.mode ??= "default";
  if (!d.defaults) {
    const base = [...definitions.values()].find(
      (c) => c.baseOperation.id === d.baseOperation.id,
    );
    if (!base) throw new Error("Registered operation defaults are required");
    d.defaults = clone(base.defaults);
    for (const [key, value] of Object.entries(d.settings || {})) {
      if (!value || !Object.hasOwn(value, "default"))
        throw new Error("Command setting requires a default");
      d.defaults[
        key === "rounded"
          ? "rounding"
          : key === "radius"
            ? "cornerRadiusMm"
            : key
      ] = clone(value.default);
    }
  }
  return d;
}
const ADAPTERS = new Set([
  "direct.v1",
  "rectangle.center.v1",
  "rectangle.twoCorners.v1",
  "rectangle.threePoints.v1",
]);
export function registerCommand(raw, { builtin = false } = {}) {
  const d = validateCommandDefinition(raw);
  if (!builtin && !knownOperations.has(d.baseOperation.id))
    throw new Error("Unregistered native operation");
  const key = `${d.id}@${d.version}`;
  if (definitions.has(key))
    throw new Error("Command version already registered");
  const alias = d.aliases.find((alias) =>
    [...definitions.values()].some(
      (o) =>
        o.id !== d.id &&
        o.aliases.some((a) => a.toLowerCase() === alias.toLowerCase()),
    ),
  );
  if (alias) throw new Error("Alias collision: " + alias);
  definitions.set(key, clone(d));
  if (builtin) knownOperations.add(d.baseOperation.id);
  return d;
}
export function findCommands(query = "") {
  query = query.trim().toLowerCase();
  return [...definitions.values()]
    .filter(
      (d) =>
        ![...definitions.values()].some(
          (other) => other.id === d.id && other.version > d.version,
        ),
    )
    .filter((d) =>
      [d.displayName, d.id, ...d.aliases].some((v) =>
        v.toLowerCase().includes(query),
      ),
    )
    .map(clone);
}
export function resolveAlias(name) {
  const a = findCommands().filter((d) =>
    [d.id, d.displayName, ...d.aliases].some(
      (v) => v.toLowerCase() === name.toLowerCase(),
    ),
  );
  return a.length === 1 ? a[0] : null;
}
const input = (key, kinds, min = 1, max = 1) => ({
  key,
  kind: "entity",
  allowedEntityKinds: kinds,
  minCount: min,
  maxCount: max,
  ordered: true,
  allowPreselection: true,
  prompt: `${key}を選択`,
  default: null,
});
const xy = () => clone(WORLD_XY),
  common = {
    format: "pathloom-command",
    schemaVersion: 1,
    version: 1,
    category: "cad",
    mode: "default",
    adapter: "direct.v1",
    resultPolicy: "copy",
  };
function add(id, name, operation, defaults, inputs = [], extra = {}) {
  registerCommand(
    {
      ...common,
      id,
      displayName: name,
      aliases: [name],
      description: `${name}の正確な形状を作成・編集`,
      baseOperation: { id: operation, version: 1 },
      inputs,
      defaults,
      ...extra,
    },
    { builtin: true },
  );
}
add("C01", "Point", "point.create", { point: [0, 0, 0] });
add("C02", "Line", "curve.line", { start: [0, 0, 0], end: [20, 0, 0] });
add("C03", "Polyline", "curve.polyline", {
  points: [
    [0, 0, 0],
    [20, 0, 0],
    [20, 10, 0],
  ],
  closed: false,
});
add(
  "C04",
  "Rectangle",
  "curve.rectangle",
  {
    plane: xy(),
    anchorMode: "center",
    anchor: [0, 0, 0],
    widthMm: 60,
    heightMm: 40,
    rounding: false,
    cornerRadiusMm: 1,
  },
  [],
  {
    mode: "center",
    adapter: "rectangle.center.v1",
    aliases: ["Rectangle", "長方形", "CenterRectangle"],
  },
);
add("C05", "Polygon", "curve.polygon", {
  plane: xy(),
  center: [0, 0, 0],
  sides: 6,
  radiusMm: 20,
  radiusMode: "inscribed",
  angleRad: 0,
});
add("C06", "Circle", "curve.circle", {
  plane: xy(),
  center: [0, 0, 0],
  radiusMm: 10,
});
add("C07", "Arc", "curve.arc", {
  plane: xy(),
  center: [0, 0, 0],
  radiusMm: 10,
  startAngleRad: 0,
  sweepAngleRad: Math.PI,
});
add("C08", "Ellipse", "curve.ellipse", {
  plane: xy(),
  center: [0, 0, 0],
  radiusUMm: 20,
  radiusVMm: 10,
  angleRad: 0,
});
add("C09", "Control Curve", "curve.nurbs", {
  poles: [
    [0, 0, 0],
    [10, 10, 0],
    [20, 10, 0],
    [30, 0, 0],
  ],
  degree: 3,
  knots: [0, 1],
  multiplicities: [4, 4],
  weights: [1, 1, 1, 1],
  periodic: false,
});
add("C10", "Interpolate Curve", "curve.interpolate", {
  points: [
    [0, 0, 0],
    [10, 10, 0],
    [20, 0, 0],
  ],
  closed: false,
  degree: 3,
  startTangent: null,
  endTangent: null,
});
add("C11", "Helix", "curve.helix", {
  axis: {
    origin: [0, 0, 0],
    direction: [0, 0, 1],
    referenceDirection: [1, 0, 0],
  },
  radiusMm: 10,
  pitchMm: 5,
  turns: 3,
  clockwise: false,
  fitToleranceMm: 0.001,
});
add("C12", "Spiral", "curve.spiral", {
  plane: xy(),
  center: [0, 0, 0],
  startRadiusMm: 2,
  endRadiusMm: 20,
  turns: 3,
  clockwise: false,
  fitToleranceMm: 0.001,
});
add("E02", "Explode Curve", "curve.explode", {}, [input("object", ["curve"])], {
  resultPolicy: "replace",
});
add("E10", "Reverse Curve", "curve.reverse", {}, [input("object", ["curve"])], {
  resultPolicy: "replace",
});
add("E12", "Extract Edges", "curve.extractBoundary", { mode: "all" }, [
  input("object", ["surface", "shell", "solid"]),
]);
add(
  "E13",
  "Project Curve",
  "curve.project",
  { direction: [0, 0, -1] },
  [
    input("curve", ["curve"]),
    input("targets", ["surface", "shell", "solid"], 1, null),
  ],
);
add(
  "E13.pull",
  "Pull Curve",
  "curve.pull",
  { maxDistanceMm: 1000 },
  [
    input("curve", ["curve"]),
    input("targets", ["surface", "shell", "solid"], 1, null),
  ],
);
add(
  "E14.intersect",
  "Intersect Shapes",
  "shape.intersect",
  {},
  [
    input("first", ["curve", "surface", "shell", "solid"], 1, null),
    input("second", ["curve", "surface", "shell", "solid"], 1, null),
  ],
);
add(
  "E14.contour",
  "Contour",
  "shape.contour",
  {
    origin: [0, 0, 0],
    normal: [0, 0, 1],
    spacingMm: 5,
    startOffsetMm: 0,
    endOffsetMm: 20,
  },
  [input("objects", ["surface", "shell", "solid"], 1, null)],
);
add("S01", "Plane", "surface.plane", {
  plane: xy(),
  anchorMode: "center",
  anchor: [0, 0, 0],
  widthMm: 40,
  heightMm: 30,
});
add("S03", "Planar Region", "surface.planarRegion", {}, [
  input("boundaries", ["curve"]),
]);
add(
  "S05",
  "Extrude",
  "shape.extrude",
  { direction: [0, 0, 1], distanceMm: 25, bothSides: false, cap: false },
  [input("profile", ["curve", "surface"])],
  { resultPolicy: "replace", aliases: ["Extrude", "押し出し"] },
);
add(
  "S06",
  "Revolve",
  "shape.revolve",
  {
    axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
    startAngleRad: 0,
    sweepAngleRad: Math.PI * 2,
    cap: false,
  },
  [input("profile", ["curve", "surface"])],
  { resultPolicy: "replace" },
);
add(
  "S07",
  "Sweep One Rail",
  "surface.sweep1",
  {
    frameMode: "corrected-frame",
    fixedFrame: {
      origin: [0, 0, 0],
      direction: [0, 0, 1],
      referenceDirection: [1, 0, 0],
    },
    sectionReversed: [],
    sectionSeamParameters: [],
    cap: false,
  },
  [input("rail", ["curve"]), input("sections", ["curve"], 1, null)],
);
add(
  "S08",
  "Sweep Two Rails",
  "surface.sweep2",
  {
    cap: false,
    sectionReversed: [],
    sectionStations: null,
    sampleCount: 33,
    sectionSampleCount: 17,
    fitToleranceMm: 0.01,
  },
  [
    input("rails", ["curve"], 2, 2),
    input("sections", ["curve"], 1, null),
  ],
);
add(
  "S09",
  "Loft",
  "surface.loft",
  {
    cap: false,
    closed: false,
    style: "smooth",
    sectionReversed: [],
    sectionSeamParameters: [],
  },
  [input("sections", ["curve"], 2, null)],
);
add(
  "S10",
  "Network Surface",
  "surface.network",
  {
    intersectionToleranceMm: 0.01,
    fitToleranceMm: 0.01,
    boundaryConditions: {
      uStart: "position",
      uEnd: "position",
      vStart: "position",
      vEnd: "position",
    },
  },
  [
    input("uCurves", ["curve"], 2, null),
    input("vCurves", ["curve"], 2, null),
  ],
);
add(
  "S11",
  "Patch Surface",
  "surface.patch",
  {
    points: null,
    sampleCountU: 9,
    sampleCountV: 9,
    fitToleranceMm: 0.01,
    smoothness: 1,
    weight: 1,
  },
  [input("boundaries", ["curve"], 2, 4)],
);
add("S11.points", "Patch from Points", "surface.patch", {
  points: [
    [[0, 0, 0], [10, 0, 0], [20, 0, 0]],
    [[0, 10, 0], [10, 10, 3], [20, 10, 0]],
    [[0, 20, 0], [10, 20, 0], [20, 20, 0]],
  ],
  sampleCountU: 9,
  sampleCountV: 9,
  fitToleranceMm: 0.01,
  smoothness: 1,
  weight: 1,
});
add(
  "F01",
  "Join Surfaces",
  "surface.join",
  {},
  [input("objects", ["surface", "shell"], 2, null)],
  { resultPolicy: "replace" },
);
add(
  "F02",
  "Explode Faces",
  "surface.explode",
  {},
  [input("object", ["surface", "shell", "solid"])],
  { resultPolicy: "replace" },
);
add(
  "F11",
  "Reverse Normal",
  "surface.reverse",
  {},
  [input("object", ["surface", "shell", "solid"])],
  { resultPolicy: "replace" },
);
add("B01", "Box", "solid.box", {
  plane: xy(),
  anchorMode: "corner",
  anchor: [0, 0, 0],
  widthMm: 40,
  depthMm: 30,
  heightMm: 20,
});
add("B02", "Sphere", "solid.sphere", { center: [0, 0, 0], radiusMm: 10 });
add("B03", "Cylinder", "shape.cylinder", {
  axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
  radiusMm: 10,
  heightMm: 20,
  cap: true,
});
add("B04", "Cone", "shape.cone", {
  axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
  bottomRadiusMm: 10,
  topRadiusMm: 0,
  heightMm: 20,
  cap: true,
});
add("B05", "Torus", "solid.torus", {
  axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
  majorRadiusMm: 20,
  minorRadiusMm: 5,
});
for (const [id, name, op] of [
  ["D01", "Union", "solid.union"],
  ["D02", "Difference", "solid.difference"],
  ["D03", "Intersection", "solid.intersection"],
])
  add(
    id,
    name,
    op,
    op === "solid.difference" ? { keepTools: false } : {},
    op === "solid.union"
      ? [input("arguments", ["solid"], 2, null)]
      : [
          input("arguments", ["solid"], 1, null),
          input("tools", ["solid"], 1, null),
        ],
    {
      resultPolicy: "replace",
      ...(op === "solid.difference"
        ? {
            description: "各対象から全工具を差し引き、対象ごとの残形状を保持",
            inputs: [
              {
                ...input("arguments", ["solid"], 1, null),
                prompt: "対象（それぞれから工具を引く）",
              },
              {
                ...input("tools", ["solid"], 1, null),
                prompt: "工具（全対象に適用）",
              },
            ],
          }
        : {}),
    },
  );
add(
  "D05",
  "Fillet Edges",
  "solid.fillet",
  { radiusMm: 2, tangentChain: false },
  [
    input("body", ["solid"]),
    { ...input("edges", ["edge"], 1, null), kind: "subshape" },
  ],
  { resultPolicy: "replace" },
);
add(
  "D06",
  "Chamfer Edges",
  "solid.chamfer",
  { distance1Mm: 1 },
  [
    input("body", ["solid"]),
    { ...input("edges", ["edge"], 1, null), kind: "subshape" },
  ],
  { resultPolicy: "replace" },
);
add(
  "D07",
  "Shell",
  "solid.shell",
  { thicknessMm: 1, directionMode: "inward" },
  [
    input("body", ["solid"]),
    { ...input("removedFaces", ["face"], 1, null), kind: "subshape" },
  ],
  { resultPolicy: "replace" },
);
add(
  "transform.move",
  "Move",
  "shape.transform",
  { mode: "move", translation: [10, 0, 0] },
  [
    input("object", [
      "point",
      "curve",
      "surface",
      "shell",
      "solid",
      "compound",
    ]),
  ],
  { resultPolicy: "replace" },
);
for (const definition of [
  {
    id: "transform.rotate",
    name: "Rotate",
    aliases: ["Rotate", "回転"],
    defaults: {
      mode: "rotate",
      axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
      angleRad: Math.PI / 2,
    },
  },
  {
    id: "transform.scale",
    name: "Scale",
    aliases: ["Scale", "拡大縮小"],
    defaults: { mode: "scale", center: [0, 0, 0], factor: 2 },
  },
  {
    id: "transform.mirror",
    name: "Mirror",
    aliases: ["Mirror", "鏡像"],
    defaults: { mode: "mirror", plane: xy() },
  },
])
  add(
    definition.id,
    definition.name,
    "shape.transform",
    definition.defaults,
    [
      input("object", [
        "point",
        "curve",
        "surface",
        "shell",
        "solid",
        "compound",
      ]),
    ],
    { resultPolicy: "replace", aliases: definition.aliases },
  );
// v1's scalar factor remains readable; axis stretch is explicitly versioned.
add("transform.scale", "Scale", "shape.transform", {
  mode: "scale", center: [0, 0, 0], factor: 2, axisFactors: [1, 1, 1],
}, [input("object", ["point", "curve", "surface", "shell", "solid", "compound"])],
{version: 2, resultPolicy: "replace", aliases: ["Scale", "拡大縮小"]});
add(
  "E01",
  "Join Curves",
  "curve.join",
  {},
  [input("objects", ["curve"], 2, null)],
  { resultPolicy: "replace" },
);
add(
  "E04",
  "Split Curve",
  "curve.split",
  { splitParameters: [0.5] },
  [input("object", ["curve"])],
  { resultPolicy: "replace" },
);
add(
  "E06",
  "Offset Curve",
  "curve.offset",
  { plane: xy(), distanceMm: 1, joinStyle: "round" },
  [input("curve", ["curve"])],
);
// Phase2: retain every embedded v1 definition; new contracts have new versions.
add("S03","Planar Region","surface.planarRegion",{},[input("boundaries",["curve"],1,null)],{version:2});
add("B01","Box","solid.box",{mode:"dimensions",plane:xy(),anchorMode:"corner",anchor:[0,0,0],widthMm:40,depthMm:30,heightMm:20,points:[]},[],{version:2});
add("B02.ellipsoid","Ellipsoid","solid.ellipsoid",{plane:xy(),center:[0,0,0],radiiMm:[10,8,6]});
add("B06","Pipe","shape.pipe",{radiusMm:2,frameMode:"corrected-frame",transitionMode:"roundCorner",cap:false},[input("rail",["curve"])]);
add("B07","Extrude Surface","shape.extrude",{direction:[0,0,1],distanceMm:10,bothSides:false,cap:true},[input("profile",["surface"])],{resultPolicy:"replace"});
add("B08","Cap Openings","shape.cap",{},[input("objects",["surface","shell","solid","compound"],1,null)],{resultPolicy:"replace"});
add("B08.assemble","Assemble Solid","solid.assemble",{},[input("objects",["surface","shell","solid","compound"],1,null)],{resultPolicy:"replace"});
add("D05","Fillet Edges","solid.fillet",{radiusMm:2,chainPolicy:"selected"},[input("body",["solid"]),{...input("edges",["edge"],1,null),kind:"subshape"}],{version:2,resultPolicy:"replace"});
add("D06","Chamfer Edges","solid.chamfer",{distance1Mm:1,distance2Mm:null},[input("body",["solid"]),{...input("edges",["edge"],1,null),kind:"subshape"},{...input("distance1Faces",["face"],0,null),kind:"subshape",prompt:"各edgeの距離1側face（同じ順序）"}],{version:2,resultPolicy:"replace"});
add("E14", "Section", "shape.section", { plane: xy() }, [
  input("objects", ["surface", "shell", "solid", "compound"], 1, null),
]);
// Preserve v1 definitions already embedded in projects. UI exposes only the latest version.
add("E01", "Join Curves", "curve.join", {allowMultipleGroups:true},
  [input("objects",["curve"],2,null)],{version:2,resultPolicy:"replace"});
const curveEdge = () => ({...input("edge",["edge"],0,1),kind:"subshape",prompt:"対象edge（複合曲線では明示選択）"});
add("E12.selected", "Extract Selected Edges", "curve.extractBoundary", {mode:"selected"}, [
  input("object",["surface","shell","solid"]),
  {...input("edges",["edge"],1,null),kind:"subshape",prompt:"抽出するedgeを選択"},
]);
add("E12.outer", "Extract Outer Boundary", "curve.extractBoundary", {mode:"outer"}, [
  input("object",["surface","shell","solid"]),
]);
add("E12.open", "Extract Open Boundary", "curve.extractBoundary", {mode:"open"}, [
  input("object",["surface","shell","solid"]),
]);
add("E04", "Split Curve", "curve.split", {splitParameters:[]},
  [input("object",["curve"]),curveEdge(),input("cutters",["curve"],0,null)],{version:2,resultPolicy:"replace"});
add("E03", "Trim Curve", "curve.trim", {splitParameters:[],removePoint:null,removeParameter:0.5},
  [input("object",["curve"]),curveEdge(),input("cutters",["curve"],0,null)],{resultPolicy:"replace"});
add("E05", "Extend Curve", "curve.extend", {end:"end",method:"continuation",distanceMm:10,targetParameter:null},
  [input("object",["curve"]),curveEdge(),input("target",["curve"],0,1)],{resultPolicy:"replace"});
add("E07", "Fillet Curves", "curve.fillet", {plane:xy(),radiusMm:2,connectionPoint:[0,0,0],solutionIndex:null,trim:true,keepInputs:false},
  [input("first",["curve"]),input("second",["curve"])],{resultPolicy:"replace"});
add("E07.chamfer", "Chamfer Curves", "curve.chamfer", {plane:xy(),firstDistanceMm:2,secondDistanceMm:2,connectionPoint:[0,0,0],firstSide:"start",secondSide:"end",trim:true,keepInputs:false},
  [input("first",["curve"]),input("second",["curve"])],{resultPolicy:"replace"});
add("E08", "Blend Curves", "curve.blend", {firstEnd:"end",secondEnd:"start",continuity:"G1",handleLengthMm:10},
  [input("first",["curve"]),input("second",["curve"])]);
add("E09", "Rebuild Curve", "curve.rebuild", {degree:3,controlPointCount:6,acceptApproximation:false},
  [input("object",["curve"]),curveEdge()]);
add("E10.seam", "Set Curve Seam", "curve.seam", {seamParameter:0,seamPoint:null},
  [input("object",["curve"])],{resultPolicy:"replace"});
add("E11", "Edit Curve Poles", "curve.editPoles", {mode:"move",poleIndex:1,position:[0,0,0],knot:0.5,knotIndex:2,multiplicity:1,toleranceMm:0.01},
  [input("object",["curve"]),curveEdge()],{resultPolicy:"replace"});
add("S02", "Corner Surface", "surface.corners", {
  points: [
    [0, 0, 0],
    [20, 0, 0],
    [20, 20, 5],
    [0, 20, 0],
  ],
});
add("S04", "Edge Surface", "surface.edges", { boundaryReversed: [] }, [
  input("curves", ["curve"], 2, 4),
]);
add(
  "F04",
  "Untrim Surface",
  "surface.untrim",
  { domain: [-20, 20, -20, 20] },
  [input("surface", ["surface"])],
  { resultPolicy: "replace" },
);
add(
  "F06",
  "Offset Surface",
  "surface.offset",
  { distanceMm: 1, directionMode: "normal", bothSides: false, solidify: false },
  [input("surface", ["surface", "shell"])],
);
add(
  "F01",
  "Join Surfaces",
  "surface.join",
  {},
  [input("objects", ["surface", "shell"], 2, null)],
  { version: 2, resultPolicy: "replace" },
);
add(
  "F02",
  "Explode Faces",
  "surface.explode",
  { keepOriginal: false },
  [input("object", ["surface", "shell", "solid"])],
  { version: 2, resultPolicy: "replace" },
);
add(
  "F02.extract",
  "Extract Face",
  "surface.extract",
  { keepOriginal: true },
  [
    input("object", ["surface", "shell", "solid"]),
    { ...input("faces", ["face"], 1, null), kind: "subshape" },
  ],
);
add("F03", "Trim Surface", "surface.trim", { mode: "trim", keepPoint: [0, 0, 0] }, [
  input("surface", ["surface"]),
  input("cutters", ["curve", "surface", "shell", "solid"], 1, null),
], { resultPolicy: "replace" });
add("F03.split", "Split Surface", "surface.split", { mode: "split" }, [
  input("targets", ["surface"], 1, null),
  input("cutters", ["curve", "surface", "shell", "solid"], 1, null),
], { resultPolicy: "replace" });
add("F04", "Untrim Surface", "surface.untrim", { mode: "all", domain: [-20, 20, -20, 20] }, [
  input("surface", ["surface"]),
], { version: 2, resultPolicy: "replace" });
add("F04.boundary", "Untrim Selected Boundary", "surface.untrim", { mode: "selected", domain: [-20, 20, -20, 20] }, [
  input("surface", ["surface"]),
  { ...input("boundaries", ["edge"], 1, null), kind: "subshape" },
], { resultPolicy: "replace" });
add("F05", "Extend Surface", "surface.extend", { side: "uEnd", parameterDelta: 1 }, [
  input("surface", ["surface"]),
], { resultPolicy: "replace" });
add("F06", "Offset Surface", "surface.offset", { distanceMm: 1, directionMode: "normal", bothSides: false, solidify: false }, [
  input("surface", ["surface", "shell"]),
], { version: 2 });
const surfacePairInputs = () => [
  input("first", ["surface"]),
  { ...input("firstEdge", ["edge"]), kind: "subshape" },
  input("second", ["surface"]),
  { ...input("secondEdge", ["edge"]), kind: "subshape" },
];
add("F07", "Fillet Surfaces", "surface.fillet", { radiusMm: 1, trim: false, join: false }, surfacePairInputs());
add("F07.chamfer", "Chamfer Surfaces", "surface.chamfer", { distanceMm: 1, trim: false, join: false }, surfacePairInputs());
add("F08", "Blend Surface", "surface.blend", { continuity: "G1", fitToleranceMm: 0.01 }, surfacePairInputs());
add("F09", "Match Surface", "surface.match", { continuity: "G1", fitToleranceMm: 0.01 }, surfacePairInputs(), { resultPolicy: "replace" });
add("F10", "Rebuild Surface", "surface.rebuild", { uDegree: 3, vDegree: 3, maxSegments: 16, acceptApproximation: false }, [input("surface", ["surface"])], { resultPolicy: "replace" });
add("F10.poles", "Edit Surface Poles", "surface.editPoles", { uIndex: 1, vIndex: 1, position: [0, 0, 0] }, [input("surface", ["surface"])], { resultPolicy: "replace" });
add("F11", "Reverse Normal", "surface.reverse", {}, [input("object", ["surface", "shell", "solid"])], { version: 2, resultPolicy: "replace" });
add("F11.boundaries", "Show Surface Boundaries", "shape.boundaries", { mode: "open" }, [input("object", ["surface", "shell", "solid"])]);
add("D08", "Move Face", "shape.moveFace", { mode: "detach", operation: "add", translation: [0, 0, 1] }, [
  input("body", ["solid", "shell"]),
  { ...input("face", ["face"]), kind: "subshape" },
], { resultPolicy: "replace" });
add("D09", "Split Face", "shape.splitFace", { mode: "split" }, [
  { ...input("face", ["face"]), kind: "subshape" },
  input("cutters", ["curve", "surface", "shell", "solid"], 1, null),
], { resultPolicy: "replace" });
add("D09.extract", "Extract Face from Body", "surface.extract", { keepOriginal: true }, [
  input("object", ["surface", "shell", "solid"]),
  { ...input("faces", ["face"], 1, null), kind: "subshape" },
]);
add(
  "D04",
  "Split Body",
  "solid.split",
  {},
  [
    input("targets", ["solid"], 1, null),
    input("cutters", ["surface", "shell", "solid"], 1, null),
  ],
  { resultPolicy: "replace" },
);
export function commandById(id, version = 1) {
  const d = definitions.get(`${id}@${version}`);
  return d ? clone(d) : null;
}
export function adaptCommand(command, parameters, inputValues = {}) {
  const p = clone(parameters);
  if (
    command.adapter === "rectangle.center.v1" &&
    inputValues.center &&
    inputValues.corner
  ) {
    p.anchor = clone(inputValues.center);
    const delta = inputValues.corner.map((v, i) => v - p.anchor[i]);
    p.widthMm =
      2 * Math.abs(delta.reduce((n, v, i) => n + v * p.plane.xAxis[i], 0));
    p.heightMm =
      2 * Math.abs(delta.reduce((n, v, i) => n + v * p.plane.yAxis[i], 0));
  }
  if (command.adapter === "rectangle.center.v1") p.anchorMode = "center";
  else if (command.adapter === "rectangle.twoCorners.v1")
    p.anchorMode = "corner";
  else if (command.adapter === "rectangle.threePoints.v1") {
    const [a, b, c] = p.points;
    if (!a || !b || !c) throw new Error("3点を入力してください");
    let x = b.map((v, i) => v - a[i]);
    const width = Math.hypot(...x);
    if (!width) throw new Error("最初の辺が零長です");
    x = x.map((v) => v / width);
    const ac = c.map((v, i) => v - a[i]),
      dot = ac.reduce((v, n, i) => v + n * x[i], 0);
    let y = ac.map((v, i) => v - dot * x[i]);
    const height = Math.hypot(...y);
    if (!height) throw new Error("3点が一直線です");
    y = y.map((v) => v / height);
    Object.assign(p, {
      plane: { origin: a, xAxis: x, yAxis: y },
      anchor: a,
      anchorMode: "corner",
      widthMm: width,
      heightMm: height,
    });
    delete p.points;
  }
  const count = (key) => inputValues[key]?.length || 0;
  if (command.baseOperation.id === "surface.edges" && !p.boundaryReversed?.length)
    p.boundaryReversed = Array(count("curves")).fill(false);
  if (["surface.sweep1", "surface.sweep2", "surface.loft"].includes(command.baseOperation.id)) {
    const sections = count("sections");
    if (!p.sectionReversed?.length) p.sectionReversed = Array(sections).fill(false);
    if (Object.hasOwn(p, "sectionSeamParameters") && !p.sectionSeamParameters?.length)
      p.sectionSeamParameters = Array(sections).fill(null);
  }
  return p;
}
