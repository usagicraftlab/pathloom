"""Exact/declared-approximate general surface editing operations for Issue #17."""
import math

from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse, BRepAlgoAPI_Splitter
from OCP.BRepBuilderAPI import (
    BRepBuilderAPI_Copy,
    BRepBuilderAPI_MakeFace,
    BRepBuilderAPI_MakeVertex,
    BRepBuilderAPI_Transform,
)
from OCP.BRepOffsetAPI import (
    BRepOffsetAPI_MakeFilling,
    BRepOffsetAPI_MakeOffsetShape,
    BRepOffsetAPI_MakeThickSolid,
)
from OCP.BRepPrimAPI import BRepPrimAPI_MakePrism
from OCP.BRepTools import BRepTools
from OCP.GeomAbs import GeomAbs_C0, GeomAbs_C1, GeomAbs_G1, GeomAbs_G2
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_WIRE
from OCP.TopTools import TopTools_ListOfShape
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Trsf, gp_Vec

from . import CadError, compound, finite, input_one, point, positive, subshapes, vec


OPERATIONS = {
    "surface.trim", "surface.extend", "surface.fillet", "surface.chamfer",
    "surface.blend", "surface.match", "surface.rebuild", "surface.editPoles",
    "shape.boundaries", "shape.moveFace", "shape.splitFace",
}


def _face(shape, label="surface"):
    faces = subshapes(shape, TopAbs_FACE)
    if len(faces) != 1:
        raise CadError("CAD_INPUT_TYPE", f"{label}: faceを1つ指定してください。", ("selectCompatibleInput",))
    return faces[0]


def _selected(selectors, key, kind, message):
    values = selectors.get(key, [])
    if len(values) != 1:
        raise CadError("CAD_INPUT_MISSING", message, ("reselectReference",))
    value = values[0]
    if value.ShapeType() != kind:
        raise CadError("CAD_INPUT_TYPE", message, ("selectCompatibleInput",))
    return value


def _split_faces(target, cutters):
    if not cutters:
        raise CadError("CAD_INPUT_MISSING", "切断形状を指定してください。", ("selectInput",))
    arguments = TopTools_ListOfShape(); arguments.Append(BRepBuilderAPI_Copy(target).Shape())
    tools = TopTools_ListOfShape()
    for cutter in cutters:
        tools.Append(BRepBuilderAPI_Copy(cutter).Shape())
    builder = BRepAlgoAPI_Splitter(); builder.SetArguments(arguments); builder.SetTools(tools); builder.Build()
    if not builder.IsDone():
        raise CadError("CAD_KERNEL_FAILED", "面を分割できません。", ("reselectReference", "editParameters"))
    faces = subshapes(builder.Shape(), TopAbs_FACE)
    if not faces:
        raise CadError("CAD_EMPTY_RESULT", "切断後に保持できる面がありません。", ("reselectReference",))
    return faces


def _closest_face(faces, xyz):
    from OCP.BRepExtrema import BRepExtrema_DistShapeShape
    probe = BRepBuilderAPI_MakeVertex(point(xyz)).Vertex()
    scored = []
    for face in faces:
        distance = BRepExtrema_DistShapeShape(probe, face); distance.Perform()
        if distance.IsDone(): scored.append((distance.Value(), face))
    if not scored:
        raise CadError("CAD_REFERENCE_MISSING", "保持点に対応する区画を特定できません。", ("reselectReference",))
    scored.sort(key=lambda item: item[0])
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) <= 1e-7:
        raise CadError("CAD_REFERENCE_AMBIGUOUS", "保持点が複数区画の境界上です。点を選び直してください。", ("reselectReference",))
    return scored[0][1]


def _fill(first_face, first_edge, second_face, second_edge, continuity, tol, fit_tolerance):
    order = {"G0": GeomAbs_C0, "G1": GeomAbs_G1, "G2": GeomAbs_G2}.get(continuity)
    if order is None:
        raise CadError("CAD_INPUT_TYPE", "連続性はG0/G1/G2です。")
    filling = BRepOffsetAPI_MakeFilling(Tol3d=tol["fitLinearMm"])
    try:
        filling.Add(first_edge, first_face, order, True)
        filling.Add(second_edge, second_face, order, True)
        # Close the patch with two explicit G0 side constraints. Choose the
        # endpoint pairing with the smaller total distance to avoid a twist.
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
        from OCP.TopExp import TopExp
        endpoints = lambda edge: (BRep_Tool.Pnt_s(TopExp.FirstVertex_s(edge)), BRep_Tool.Pnt_s(TopExp.LastVertex_s(edge)))
        a0, a1 = endpoints(first_edge); b0, b1 = endpoints(second_edge)
        if a0.Distance(b0) + a1.Distance(b1) <= a0.Distance(b1) + a1.Distance(b0): pairs = ((a0, b0), (a1, b1))
        else: pairs = ((a0, b1), (a1, b0))
        for start, end in pairs:
            if start.Distance(end) <= tol["kernelLinearMm"]:
                raise CadError("CAD_INPUT_DEGENERATE", "接続境界の端点が重なり、4辺patchを構成できません。")
            filling.Add(BRepBuilderAPI_MakeEdge(start, end).Edge(), GeomAbs_C0, True)
        filling.Build()
    except Exception as error:
        raise CadError("CAD_KERNEL_FAILED", "選択境界と連続性から接続面を構成できません。", details={"kernelMessage": str(error)})
    if not filling.IsDone():
        raise CadError("CAD_KERNEL_FAILED", "選択境界と連続性から接続面を構成できません。")
    result = filling.Shape()
    from OCP.BRepCheck import BRepCheck_Analyzer
    if result.IsNull() or not BRepCheck_Analyzer(result).IsValid():
        # Two opposite boundaries do not close a filling wire. OCCT's ruled
        # constructor is the exact G0 connector for that explicit input.
        from OCP.BRepFill import BRepFill
        result = BRepFill.Face_s(first_edge, second_edge)
        if result.IsNull() or not BRepCheck_Analyzer(result).IsValid():
            raise CadError("CAD_KERNEL_FAILED", "選択境界から有効な接続面を構成できません。")
        achieved = "G0"
    else:
        achieved = continuity
    accuracy = {
        "exactness": "approximate",
        "classification": "adaptive-occt-fitting",
        "fitToleranceMm": fit_tolerance,
        "continuity": continuity,
        "achievedContinuity": achieved,
        "g0ErrorMm": filling.G0Error(),
    }
    accuracy["maxBoundaryDeviationMm"] = accuracy["g0ErrorMm"]
    if continuity in ("G1", "G2"): accuracy["g1Error"] = filling.G1Error()
    if continuity == "G2": accuracy["g2Error"] = filling.G2Error()
    if continuity in ("G1", "G2") and accuracy["g1Error"] > 1e-3:
        raise CadError("CAD_CONTINUITY_NOT_MET", "要求した接線連続性を満たせません。接続側または境界を選び直してください。", ("reselectReference", "editParameters"), accuracy)
    if continuity == "G2" and accuracy["g2Error"] > 1e-3:
        raise CadError("CAD_CONTINUITY_NOT_MET", "要求した曲率連続性を満たせません。接続側または境界を選び直してください。", ("reselectReference", "editParameters"), accuracy)
    return result, accuracy


def _surface_and_bounds(face):
    surface = BRep_Tool.Surface_s(face)
    u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
    if not all(math.isfinite(value) for value in (u0, u1, v0, v1)):
        raise CadError("CAD_INPUT_DEGENERATE", "有限な面parameter範囲が必要です。")
    return surface, [u0, u1, v0, v1]


def evaluate(op, p, inputs, tol, selectors):
    if op in ("surface.trim", "shape.splitFace"):
        target = input_one(inputs, "surface") if inputs.get("surface") else _selected(selectors, "face", TopAbs_FACE, "分割するfaceを選択してください。")
        parts = _split_faces(target, inputs.get("cutters", []))
        if op == "surface.trim" or p.get("mode") == "trim":
            keep = p.get("keepPoint")
            if keep is None:
                raise CadError("CAD_INPUT_MISSING", "Trimには保持区画上のkeepPointが必要です。", ("editParameters",))
            return [("retained", _closest_face(parts, vec(keep)), {"selection": "keepPoint"})]
        return [("partition", face, {}) for face in parts]

    if op == "surface.extend":
        face = _face(input_one(inputs, "surface")); surface, bounds = _surface_and_bounds(face)
        side = p.get("side"); delta = positive(p.get("parameterDelta"))
        indices = {"uStart": 0, "uEnd": 1, "vStart": 2, "vEnd": 3}
        if side not in indices: raise CadError("CAD_INPUT_TYPE", "延長側はuStart/uEnd/vStart/vEndです。")
        index = indices[side]; bounds[index] += -delta if side.endswith("Start") else delta
        if bounds[0] >= bounds[1] or bounds[2] >= bounds[3]: raise CadError("CAD_INPUT_DEGENERATE", "延長後のparameter範囲が不正です。")
        result = BRepBuilderAPI_MakeFace(surface, *bounds, tol["kernelLinearMm"])
        if not result.IsDone(): raise CadError("CAD_KERNEL_FAILED", "基底面を指定parameterだけ延長できません。")
        return [("result", result.Face(), {"accuracy": {"classification": "exact-parameter", "side": side, "parameterDelta": delta}})]

    if op in ("surface.fillet", "surface.chamfer", "surface.blend", "surface.match"):
        first = _face(input_one(inputs, "first"), "first")
        second = _face(input_one(inputs, "second"), "second")
        first_edge = _selected(selectors, "firstEdge", TopAbs_EDGE, "firstEdgeを選択してください。")
        second_edge = _selected(selectors, "secondEdge", TopAbs_EDGE, "secondEdgeを選択してください。")
        if op == "surface.fillet":
            profile_size = positive(p.get("radiusMm")); continuity = "G1"
        elif op == "surface.chamfer":
            profile_size = positive(p.get("distanceMm")); continuity = "G0"
        else: profile_size = None; continuity = p.get("continuity", "G1")
        fit_tolerance = positive(p.get("fitToleranceMm", tol["fitLinearMm"]))
        result, accuracy = _fill(first, first_edge, second, second_edge, continuity, tol, fit_tolerance)
        accuracy["construction"] = "selected-boundary-connector"
        if profile_size is not None:
            accuracy["profileSizeMm"] = profile_size
            accuracy["trimAtSelectedBoundaries"] = bool(p.get("trim", False))
        if op in ("surface.fillet", "surface.chamfer") and p.get("join", False):
            from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
            sewing = BRepBuilderAPI_Sewing(tol["joinLinearMm"])
            for shape in (first, result, second): sewing.Add(BRepBuilderAPI_Copy(shape).Shape())
            sewing.Perform(); joined = sewing.SewedShape()
            if joined.IsNull():
                raise CadError("CAD_KERNEL_FAILED", "選択面とconnectorをjoinできません。",
                               ("reselectReference", "editParameters"))
            accuracy["joined"] = True
            return [("joined", joined, {"accuracy": accuracy})]
        if op == "surface.match": accuracy["referenceUnchanged"] = True
        return [("connector" if op != "surface.match" else "matched", result, {"accuracy": accuracy})]

    if op in ("surface.rebuild", "surface.editPoles"):
        from OCP.Geom import Geom_BSplineSurface
        from OCP.GeomAPI import GeomAPI_PointsToBSplineSurface
        from OCP.TColgp import TColgp_Array2OfPnt
        face = _face(input_one(inputs, "surface")); surface, bounds = _surface_and_bounds(face)
        copied = surface.Copy()
        fit_tolerance = positive(p.get("fitToleranceMm", tol["fitLinearMm"]))
        approximation = None
        sample_count = None
        source_bounds = list(bounds)
        if op == "surface.editPoles" and isinstance(copied, Geom_BSplineSurface):
            bspline = copied
        else:
            max_degree_u = int(p.get("uDegree", 3)); max_degree_v = int(p.get("vDegree", 3))
            max_segments = int(p.get("maxSegments", 16))
            if not 1 <= max_degree_u <= 25 or not 1 <= max_degree_v <= 25 or not 1 <= max_segments <= 256:
                raise CadError("CAD_INPUT_DEGENERATE", "次数は1〜25、segment上限は1〜256です。")
            # Sample only the finite face domain; approximating an underlying
            # infinite plane/cylinder directly produces an unusable domain.
            sample_count = max(4, min(17, max_segments + 1))
            points = TColgp_Array2OfPnt(1, sample_count, 1, sample_count)
            for ui in range(sample_count):
                u = bounds[0] + (bounds[1] - bounds[0]) * ui / (sample_count - 1)
                for vi in range(sample_count):
                    v = bounds[2] + (bounds[3] - bounds[2]) * vi / (sample_count - 1)
                    points.SetValue(ui + 1, vi + 1, copied.Value(u, v))
            approximation = GeomAPI_PointsToBSplineSurface(points, min(max_degree_u, max_degree_v), max(max_degree_u, max_degree_v), GeomAbs_C1, fit_tolerance)
            if not approximation.IsDone(): raise CadError("CAD_KERNEL_FAILED", "有限面をB-splineへ近似できません。")
            bspline = approximation.Surface()
        if op == "surface.editPoles":
            u = p.get("uIndex"); v = p.get("vIndex")
            if not isinstance(u, int) or not isinstance(v, int) or not 1 <= u <= bspline.NbUPoles() or not 1 <= v <= bspline.NbVPoles():
                raise CadError("CAD_INPUT_DEGENERATE", "U/V pole indexが範囲外です。")
            bspline.SetPole(u, v, point(p.get("position")))
        # Approximation may choose a normalized parameterization, so use the
        # resulting B-spline's own finite domain rather than the source domain.
        result_bounds = list(bspline.Bounds())
        made = BRepBuilderAPI_MakeFace(bspline, *result_bounds, tol["kernelLinearMm"])
        if not made.IsDone(): raise CadError("CAD_KERNEL_FAILED", "編集後のB-spline面を構成できません。")
        measured = 0.0
        if approximation is not None and op == "surface.rebuild":
            for ui in range(sample_count):
                source_u = source_bounds[0] + (source_bounds[1] - source_bounds[0]) * ui / (sample_count - 1)
                target_u = result_bounds[0] + (result_bounds[1] - result_bounds[0]) * ui / (sample_count - 1)
                for vi in range(sample_count):
                    source_v = source_bounds[2] + (source_bounds[3] - source_bounds[2]) * vi / (sample_count - 1)
                    target_v = result_bounds[2] + (result_bounds[3] - result_bounds[2]) * vi / (sample_count - 1)
                    measured = max(measured, surface.Value(source_u, source_v).Distance(bspline.Value(target_u, target_v)))
        accuracy = {
            "exactness": "exact" if approximation is None else "approximate",
            "classification": "exact-bspline-edit" if approximation is None else "sampled-corresponding-parameter",
            "fitToleranceMm": fit_tolerance,
            "sampleCountU": sample_count if sample_count is not None else 0,
            "sampleCountV": sample_count if sample_count is not None else 0,
            "uDegree": bspline.UDegree(),
            "vDegree": bspline.VDegree(),
            "uPoles": bspline.NbUPoles(),
            "vPoles": bspline.NbVPoles(),
            "maxDeviationMm": measured,
        }
        return [("result", made.Face(), {"accuracy": accuracy})]

    if op == "shape.boundaries":
        shape = input_one(inputs, "object"); faces = subshapes(shape, TopAbs_FACE); edges = subshapes(shape, TopAbs_EDGE)
        mode = p.get("mode", "open")
        if mode not in ("all", "open", "shared"): raise CadError("CAD_INPUT_TYPE", "境界表示はall/open/sharedです。")
        selected = []
        for edge in edges:
            count = sum(any(edge.IsSame(candidate) for candidate in subshapes(face, TopAbs_EDGE)) for face in faces)
            if mode == "all" or mode == "open" and count == 1 or mode == "shared" and count > 1: selected.append(edge)
        if not selected: raise CadError("CAD_EMPTY_RESULT", "指定分類に該当する境界がありません。", ("editParameters",))
        return [(f"{mode}/{index}", BRepBuilderAPI_Copy(edge).Shape(), {"boundaryClass": mode}) for index, edge in enumerate(selected)]

    if op == "shape.moveFace":
        face = _selected(selectors, "face", TopAbs_FACE, "移動するfaceを選択してください。")
        translation = vec(p.get("translation")); vector = gp_Vec(*translation)
        if vector.SquareMagnitude() <= 1e-24: raise CadError("CAD_INPUT_DEGENERATE", "移動量は零以外です。")
        mode = p.get("mode", "detach")
        if mode == "detach":
            transform = gp_Trsf(); transform.SetTranslation(vector)
            return [("detached", BRepBuilderAPI_Transform(BRepBuilderAPI_Copy(face).Shape(), transform, True).Shape(), {"mode": mode})]
        if mode != "pushPull": raise CadError("CAD_INPUT_TYPE", "MoveFace modeはdetach/pushPullです。")
        body = input_one(inputs, "body"); operation = p.get("operation", "add")
        prism = BRepPrimAPI_MakePrism(BRepBuilderAPI_Copy(face).Shape(), vector).Shape()
        builder = BRepAlgoAPI_Fuse(body, prism) if operation == "add" else BRepAlgoAPI_Cut(body, prism) if operation == "cut" else None
        if builder is None: raise CadError("CAD_INPUT_TYPE", "pushPull operationはadd/cutです。")
        builder.Build()
        if not builder.IsDone(): raise CadError("CAD_KERNEL_FAILED", "選択faceのpush/pullで形状を再構成できません。")
        return [("result", builder.Shape(), {"mode": mode, "operation": operation})]

    raise CadError("CAD_SCHEMA_UNSUPPORTED", f"演算 {op} は未実装です。")
