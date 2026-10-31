"""Phase 3 curve and surface creation operations for Issue #16."""

import math

from OCP.BRep import BRep_Tool
from OCP.BRepAlgoAPI import BRepAlgoAPI_Section
from OCP.BRepBuilderAPI import (
    BRepBuilderAPI_Copy,
    BRepBuilderAPI_MakeEdge,
    BRepBuilderAPI_MakeFace,
)
from OCP.GeomAPI import GeomAPI_Interpolate, GeomAPI_PointsToBSplineSurface
from OCP.GeomAbs import GeomAbs_C2
from OCP.TColgp import TColgp_Array2OfPnt, TColgp_HArray1OfPnt
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Ax2, gp_Dir, gp_Pln, gp_Pnt, gp_Vec

from . import (
    CadError,
    axis2,
    compound,
    direction,
    finite,
    input_one,
    plane,
    point,
    positive,
    subshapes,
    vec,
    wire,
)


OPERATIONS = {
    "curve.helix",
    "curve.spiral",
    "curve.project",
    "curve.pull",
    "shape.intersect",
    "shape.contour",
    "surface.sweep2",
    "surface.network",
    "surface.patch",
}


def _basis(axis):
    origin = vec(axis["origin"])
    z = direction(axis["direction"])
    reference = vec(axis.get("referenceDirection", [1, 0, 0]))
    projected = gp_Vec(*reference)
    projected = projected - gp_Vec(z) * projected.Dot(gp_Vec(z))
    if projected.SquareMagnitude() < 1e-20:
        fallback = gp_Vec(0, 1, 0) if abs(z.Y()) < 0.9 else gp_Vec(0, 0, 1)
        projected = fallback - gp_Vec(z) * fallback.Dot(gp_Vec(z))
    x = gp_Dir(projected)
    yv = gp_Vec(z).Crossed(gp_Vec(x))
    y = gp_Dir(yv)
    return origin, [x.X(), x.Y(), x.Z()], [y.X(), y.Y(), y.Z()], [z.X(), z.Y(), z.Z()]


def _interpolated(points, tol):
    if len(points) < 2:
        raise CadError("CAD_INPUT_MISSING", "曲線には2点以上が必要です。")
    values = TColgp_HArray1OfPnt(1, len(points))
    for index, value in enumerate(points, 1):
        values.SetValue(index, point(value))
    builder = GeomAPI_Interpolate(values, False, tol)
    builder.Perform()
    if not builder.IsDone():
        raise CadError("CAD_KERNEL_FAILED", "指定条件から近似曲線を構成できません。")
    return BRepBuilderAPI_MakeEdge(builder.Curve()).Edge()


def _curve_samples(shape, count):
    from OCP.BRepAdaptor import BRepAdaptor_Curve

    edges = subshapes(shape, TopAbs_EDGE)
    if len(edges) != 1:
        raise CadError("CAD_INPUT_TYPE", "曲線網の各入力は単一edgeにしてください。")
    adapter = BRepAdaptor_Curve(edges[0])
    first, last = adapter.FirstParameter(), adapter.LastParameter()
    return [
        adapter.Value(first + (last - first) * index / (count - 1))
        for index in range(count)
    ]


def _fitted_surface(points, tolerance, smoothness=1.0):
    rows = len(points)
    columns = len(points[0]) if rows else 0
    if rows < 2 or columns < 2 or any(len(row) != columns for row in points):
        raise CadError("CAD_INPUT_MISSING", "面近似には2×2以上の点格子が必要です。")
    values = TColgp_Array2OfPnt(1, rows, 1, columns)
    for row in range(rows):
        for column in range(columns):
            values.SetValue(row + 1, column + 1, points[row][column])
    degree = min(5, max(1, min(rows, columns) - 1))
    builder = GeomAPI_PointsToBSplineSurface(
        values,
        max(1, degree),
        max(1, degree),
        GeomAbs_C2,
        tolerance,
    )
    if not builder.IsDone():
        raise CadError("CAD_KERNEL_FAILED", "入力点から近似面を構成できません。")
    face = BRepBuilderAPI_MakeFace(builder.Surface(), tolerance).Face()
    return face


def _max_surface_deviation(face, points):
    from OCP.GeomAPI import GeomAPI_ProjectPointOnSurf

    surface = BRep_Tool.Surface_s(face)
    maximum = 0.0
    for row in points:
        for source in row:
            projection = GeomAPI_ProjectPointOnSurf(source, surface)
            if projection.NbPoints() < 1:
                raise CadError("CAD_KERNEL_FAILED", "近似面の入力点偏差を計測できません。")
            maximum = max(maximum, projection.LowerDistance())
    return maximum


def _max_point_deviation(face, points):
    """Measure source-point distance from the fitted face with the real kernel."""
    return _max_surface_deviation(face, [points])


def _section_outputs(first, second, prefix):
    builder = BRepAlgoAPI_Section(first, second, False)
    builder.Approximation(True)
    builder.Build()
    if not builder.IsDone():
        raise CadError("CAD_KERNEL_FAILED", "交差曲線を計算できません。")
    edges = subshapes(builder.Shape(), TopAbs_EDGE)
    return [
        (f"{prefix}/{index}", BRepBuilderAPI_Copy(edge).Shape(), {})
        for index, edge in enumerate(edges)
    ]


def evaluate(op, p, inputs, tol, selectors):
    fit = positive(p.get("fitToleranceMm", tol["fitLinearMm"]))
    if op == "curve.helix":
        radius = positive(p["radiusMm"])
        pitch = finite(p["pitchMm"])
        turns = positive(p["turns"])
        if abs(pitch) < 1e-12:
            raise CadError("CAD_INPUT_DEGENERATE", "Helixのpitchは0以外です。")
        clockwise = p.get("clockwise", False)
        if not isinstance(clockwise, bool):
            raise CadError("CAD_INPUT_TYPE", "clockwiseはtrue/falseです。")
        origin, x, y, z = _basis(p["axis"])
        sign = -1 if clockwise else 1
        segments = max(32, min(4096, math.ceil(turns * 64)))
        points = []
        for index in range(segments + 1):
            t = index / segments
            angle = sign * turns * math.tau * t
            height = pitch * turns * t
            points.append([
                origin[k] + radius * (math.cos(angle) * x[k] + math.sin(angle) * y[k]) + height * z[k]
                for k in range(3)
            ])
        sag = radius * (1 - math.cos(abs(turns * math.tau) / segments / 2))
        return [("result", _interpolated(points, fit), {"accuracy": {"fitToleranceMm": fit, "estimatedMaxDeviationMm": sag}})]

    if op == "curve.spiral":
        pl = p["plane"]
        origin, x, y = plane({**pl, "origin": vec(p.get("center", pl["origin"]))})
        start, end = positive(p["startRadiusMm"]), positive(p["endRadiusMm"])
        turns = positive(p["turns"])
        clockwise = p.get("clockwise", False)
        if not isinstance(clockwise, bool):
            raise CadError("CAD_INPUT_TYPE", "clockwiseはtrue/falseです。")
        sign = -1 if clockwise else 1
        segments = max(32, min(4096, math.ceil(turns * 64)))
        points = []
        for index in range(segments + 1):
            t = index / segments
            angle = sign * turns * math.tau * t
            radius = start + (end - start) * t
            points.append([
                origin[k] + radius * (math.cos(angle) * x[k] + math.sin(angle) * y[k])
                for k in range(3)
            ])
        sag = max(start, end) * (1 - math.cos(abs(turns * math.tau) / segments / 2))
        return [("result", _interpolated(points, fit), {"accuracy": {"fitToleranceMm": fit, "estimatedMaxDeviationMm": sag}})]

    if op == "curve.project":
        from OCP.BRepProj import BRepProj_Projection

        source = input_one(inputs, "curve")
        targets = inputs.get("targets", [])
        if not targets:
            raise CadError("CAD_INPUT_MISSING", "投影先の面を選択してください。")
        projection_direction = direction(p["direction"])
        outputs = []
        for target_index, target in enumerate(targets):
            projection = BRepProj_Projection(wire(source), target, projection_direction)
            candidate = 0
            while projection.More():
                shape = projection.Current()
                for edge in subshapes(shape, TopAbs_EDGE):
                    outputs.append((f"target/{target_index}/candidate/{candidate}", BRepBuilderAPI_Copy(edge).Shape(), {"sourceIndex": target_index}))
                    candidate += 1
                projection.Next()
        if not outputs:
            raise CadError("CAD_PROJECTION_MISSED", "指定方向では投影先に届きません。", ("editParameters", "reselectReference"))
        return outputs

    if op == "curve.pull":
        from OCP.BRepAlgo import BRepAlgo_NormalProjection

        source = input_one(inputs, "curve")
        targets = inputs.get("targets", [])
        if not targets:
            raise CadError("CAD_INPUT_MISSING", "Pull先の面を選択してください。")
        outputs = []
        for target_index, target in enumerate(targets):
            projection = BRepAlgo_NormalProjection(target)
            projection.SetMaxDistance(positive(p.get("maxDistanceMm", 1e6)))
            projection.Compute3d(True)
            projection.Add(wire(source))
            projection.Build()
            if not projection.IsDone():
                continue
            for candidate, edge in enumerate(subshapes(projection.Projection(), TopAbs_EDGE)):
                outputs.append((f"target/{target_index}/candidate/{candidate}", BRepBuilderAPI_Copy(edge).Shape(), {"sourceIndex": target_index}))
        if not outputs:
            raise CadError("CAD_PROJECTION_MISSED", "指定距離内で面へPullできません。", ("editParameters", "reselectReference"))
        return outputs

    if op == "shape.intersect":
        first, second = inputs.get("first", []), inputs.get("second", [])
        if not first or not second:
            raise CadError("CAD_INPUT_MISSING", "交差させる2組の形状を指定してください。")
        outputs = []
        for first_index, a in enumerate(first):
            for second_index, b in enumerate(second):
                outputs.extend(_section_outputs(a, b, f"pair/{first_index}/{second_index}"))
        if not outputs:
            raise CadError("CAD_EMPTY_RESULT", "選択形状の交差曲線はありません。", ("reselectReference",))
        return outputs

    if op == "shape.contour":
        objects = inputs.get("objects", [])
        if not objects:
            raise CadError("CAD_INPUT_MISSING", "断面対象を選択してください。")
        origin = vec(p["origin"])
        normal = direction(p["normal"])
        spacing = positive(p["spacingMm"])
        start, end = finite(p["startOffsetMm"]), finite(p["endOffsetMm"])
        if start > end:
            raise CadError("CAD_INPUT_DEGENERATE", "Contourの開始位置は終了位置以下です。")
        count = int(math.floor((end - start) / spacing + 1e-10)) + 1
        if count > 10000:
            raise CadError("CAD_RESOURCE_LIMIT", "Contour平面数が10000を超えています。")
        outputs = []
        for plane_index in range(count):
            offset = start + plane_index * spacing
            location = gp_Pnt(*(origin[k] + offset * [normal.X(), normal.Y(), normal.Z()][k] for k in range(3)))
            cutting_plane = gp_Pln(location, normal)
            for object_index, obj in enumerate(objects):
                outputs.extend(_section_outputs(obj, cutting_plane, f"plane/{plane_index}/object/{object_index}"))
        if not outputs:
            raise CadError("CAD_EMPTY_RESULT", "指定範囲にContour曲線はありません。", ("editParameters",))
        return outputs

    if op == "surface.sweep2":
        rails = inputs.get("rails", [])
        sections = inputs.get("sections", [])
        if len(rails) != 2 or not sections:
            raise CadError("CAD_INPUT_MISSING", "Sweep2には2本のrailと1つ以上の断面が必要です。")
        reversed_sections = p.get("sectionReversed") or [False] * len(sections)
        if len(reversed_sections) != len(sections) or any(not isinstance(v, bool) for v in reversed_sections):
            raise CadError("CAD_INPUT_TYPE", "断面向きは断面数と同じtrue/false配列です。")
        if p.get("cap", False):
            raise CadError("CAD_PROFILE_OPEN", "Sweep2は開いた面を生成します。solid化は後続のCapを使用してください。")
        # OCP's auxiliary-spine pipe can terminate the native process for valid
        # but incompatible rail/profile combinations.  Build the two-rail
        # transfinite surface explicitly instead: both rails remain boundary
        # constraints and the ordered profile supplies the cross-section bow.
        rows = p.get("sampleCount", 33)
        if isinstance(rows, bool) or not isinstance(rows, int) or not 4 <= rows <= 128:
            raise CadError("CAD_INPUT_TYPE", "sampleCountは4〜128の整数です。")
        columns = p.get("sectionSampleCount", 17)
        if isinstance(columns, bool) or not isinstance(columns, int) or not 4 <= columns <= 128:
            raise CadError("CAD_INPUT_TYPE", "sectionSampleCountは4〜128の整数です。")
        left, right = _curve_samples(rails[0], rows), _curve_samples(rails[1], rows)
        stations = p.get("sectionStations")
        if stations is None:
            stations = [index / max(1, len(sections) - 1) for index in range(len(sections))]
        if len(stations) != len(sections):
            raise CadError("CAD_INPUT_TYPE", "sectionStationsは断面数と同じ配列です。")
        stations = [finite(value) for value in stations]
        if any(value < 0 or value > 1 for value in stations) or any(a >= b for a, b in zip(stations, stations[1:])):
            raise CadError("CAD_INPUT_DEGENERATE", "sectionStationsは0〜1の狭義昇順です。")
        profiles = []
        for index, section in enumerate(sections):
            profile = _curve_samples(section, columns)
            if reversed_sections[index]:
                profile.reverse()
            profiles.append(profile)
        grid = []
        for row in range(rows):
            t = row / (rows - 1)
            if t <= stations[0]:
                before = after = 0
                mix = 0
            elif t >= stations[-1]:
                before = after = len(stations) - 1
                mix = 0
            else:
                after = next(index for index, station in enumerate(stations) if station >= t)
                before = after - 1
                mix = (t - stations[before]) / (stations[after] - stations[before])
            line = []
            for column in range(columns):
                u = column / (columns - 1)
                deviations = []
                for profile in (profiles[before], profiles[after]):
                    deviations.append([
                        getattr(profile[column], axis)()
                        - ((1 - u) * getattr(profile[0], axis)() + u * getattr(profile[-1], axis)())
                        for axis in ("X", "Y", "Z")
                    ])
                deviation = [
                    (1 - mix) * deviations[0][index] + mix * deviations[1][index]
                    for index in range(3)
                ]
                line.append(gp_Pnt(*[
                    (1 - u) * getattr(left[row], axis)()
                    + u * getattr(right[row], axis)()
                    + deviation[index]
                    for index, axis in enumerate(("X", "Y", "Z"))
                ]))
            grid.append(line)
        tolerance = positive(p.get("fitToleranceMm", tol["fitLinearMm"]))
        face = _fitted_surface(grid, tolerance)
        maximum = _max_surface_deviation(face, grid)
        rail_deviation = _max_point_deviation(face, left + right)
        section_deviation = _max_point_deviation(
            face, [source for profile in profiles for source in profile]
        )
        return [("result", face, {
            "accuracy": {
                "exactness": "approximate",
                "method": "sampled-two-rail-transfinite-bspline-fit",
                "fitToleranceMm": tolerance,
                "maxDeviationMm": maximum,
                "maxRailDeviationMm": rail_deviation,
                "maxSectionDeviationMm": section_deviation,
                "railSampleCount": rows,
                "sectionSampleCount": columns,
                "sectionCount": len(sections),
                "sectionStations": stations,
            }
        })]

    if op == "surface.network":
        u_curves, v_curves = inputs.get("uCurves", []), inputs.get("vCurves", [])
        if len(u_curves) < 2 or len(v_curves) < 2:
            raise CadError("CAD_INPUT_MISSING", "NetworkSrfにはU/V各2本以上の曲線が必要です。")
        from OCP.GeomAPI import GeomAPI_ExtremaCurveCurve
        from OCP.BRepAdaptor import BRepAdaptor_Curve

        grid, max_gap = [], 0.0
        for u_shape in u_curves:
            u_edge = subshapes(u_shape, TopAbs_EDGE)
            if len(u_edge) != 1:
                raise CadError("CAD_INPUT_TYPE", "NetworkSrfの各入力は単一edgeです。")
            row = []
            for v_shape in v_curves:
                v_edge = subshapes(v_shape, TopAbs_EDGE)
                if len(v_edge) != 1:
                    raise CadError("CAD_INPUT_TYPE", "NetworkSrfの各入力は単一edgeです。")
                extrema = GeomAPI_ExtremaCurveCurve(
                    BRep_Tool.Curve_s(u_edge[0], 0.0, 0.0),
                    BRep_Tool.Curve_s(v_edge[0], 0.0, 0.0),
                )
                if extrema.NbExtrema() < 1:
                    raise CadError("CAD_NETWORK_INCOMPLETE", "U/V曲線の交点対応を計算できません。")
                first, second = gp_Pnt(), gp_Pnt()
                extrema.NearestPoints(first, second)
                gap = first.Distance(second)
                max_gap = max(max_gap, gap)
                if gap > positive(p.get("intersectionToleranceMm", tol["joinLinearMm"])):
                    raise CadError("CAD_NETWORK_INCOMPLETE", "許容差内で交差しない曲線組があります。", ("editTolerance", "reselectReference"), {"gapMm": gap})
                row.append(gp_Pnt((first.X() + second.X()) / 2, (first.Y() + second.Y()) / 2, (first.Z() + second.Z()) / 2))
            grid.append(row)
        conditions = p.get("boundaryConditions", {"uStart": "position", "uEnd": "position", "vStart": "position", "vEnd": "position"})
        if not isinstance(conditions, dict) or any(value not in ("position", "free") for value in conditions.values()):
            raise CadError("CAD_INPUT_TYPE", "NetworkSrfの境界条件はposition/freeです。")
        intersection_tolerance = positive(p.get("intersectionToleranceMm", tol["joinLinearMm"]))
        tolerance = positive(p.get("fitToleranceMm", tol["fitLinearMm"]))
        face = _fitted_surface(grid, tolerance)
        maximum = _max_surface_deviation(face, grid)
        return [("result", face, {"accuracy": {
            "exactness": "approximate",
            "method": "intersection-grid-bspline-fit",
            "fitToleranceMm": tolerance,
            "intersectionToleranceMm": intersection_tolerance,
            "maxIntersectionGapMm": max_gap,
            "maxDeviationMm": maximum,
            "boundaryConditions": conditions,
        }})]

    if op == "surface.patch":
        boundaries = inputs.get("boundaries", [])
        points = p.get("points")
        count_u, count_v = p.get("sampleCountU", p.get("sampleCount", 9)), p.get("sampleCountV", p.get("sampleCount", 9))
        if any(isinstance(count, bool) or not isinstance(count, int) or not 4 <= count <= 128 for count in (count_u, count_v)):
            raise CadError("CAD_INPUT_TYPE", "sampleCountU/Vは4〜128の整数です。")
        grid = []
        if points is not None:
            if not isinstance(points, list) or len(points) < 2 or any(not isinstance(row, list) or len(row) < 2 for row in points):
                raise CadError("CAD_INPUT_TYPE", "Patchのpointsは2×2以上のXYZ格子です。")
            width = len(points[0])
            if any(len(row) != width for row in points):
                raise CadError("CAD_INPUT_TYPE", "Patchのpoints格子幅を揃えてください。")
            grid = [[point(value) for value in row] for row in points]
        elif len(boundaries) not in (2, 4):
            raise CadError("CAD_INPUT_MISSING", "Patchには2/4本の境界曲線または点格子を指定してください。")
        else:
            samples = [
                _curve_samples(shape, count_v if len(boundaries) == 2 else count_u if index in (0, 2) else count_v)
                for index, shape in enumerate(boundaries)
            ]
        if not grid and len(samples) == 2:
            for row in range(count_v):
                a, b = samples[0][row], samples[1][row]
                grid.append([gp_Pnt(a.X() + (b.X() - a.X()) * column / (count_u - 1), a.Y() + (b.Y() - a.Y()) * column / (count_u - 1), a.Z() + (b.Z() - a.Z()) * column / (count_u - 1)) for column in range(count_u)])
        elif not grid:
            # Coons transfinite interpolation from ordered bottom/right/top/left boundaries.
            bottom, right, top, left = samples
            for row in range(count_v):
                v = row / (count_v - 1)
                line = []
                for column in range(count_u):
                    u = column / (count_u - 1)
                    b0, b1, l0, l1 = bottom[column], top[column], left[row], right[row]
                    c00, c10, c11, c01 = bottom[0], bottom[-1], top[-1], top[0]
                    xyz = []
                    for axis in ("X", "Y", "Z"):
                        value = (1 - v) * getattr(b0, axis)() + v * getattr(b1, axis)() + (1 - u) * getattr(l0, axis)() + u * getattr(l1, axis)()
                        value -= (1 - u) * (1 - v) * getattr(c00, axis)() + u * (1 - v) * getattr(c10, axis)() + u * v * getattr(c11, axis)() + (1 - u) * v * getattr(c01, axis)()
                        xyz.append(value)
                    line.append(gp_Pnt(*xyz))
                grid.append(line)
        tolerance = positive(p.get("fitToleranceMm", tol["fitLinearMm"]))
        smoothness, weight = positive(p.get("smoothness", 1)), positive(p.get("weight", 1))
        effective_tolerance = tolerance / max(1, smoothness * weight)
        face = _fitted_surface(grid, effective_tolerance, smoothness)
        maximum = _max_surface_deviation(face, grid)
        return [("result", face, {"accuracy": {
            "exactness": "approximate",
            "method": "sampled-boundary-or-point-grid-bspline-fit",
            "fitToleranceMm": tolerance,
            "effectiveFitToleranceMm": effective_tolerance,
            "maxDeviationMm": maximum,
            "sampleCountU": count_u,
            "sampleCountV": count_v,
            "smoothness": smoothness,
            "weight": weight,
        }})]

    raise CadError("CAD_SCHEMA_UNSUPPORTED", f"演算 {op} は未実装です。")
