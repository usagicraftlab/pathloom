"""STEP -> OpenUSD BRep inspection bridge for Pathloom Desktop.

Requires CPython 3.12 with `cadquery-ocp` and NVIDIA `usd-brep`, plus the
`occt_to_usd` utility built from NVIDIA-Omniverse/usd-brep. Prints one JSON
object to stdout so Tauri can call it without an always-running server.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import tempfile
from pathlib import Path


MAX_STEP_BYTES = 100 * 1024 * 1024
MAX_FACE_COUNT = 200_000
MAX_TRIANGLES = 2_000_000
MAX_POINTS = 500_000


def fail(message: str) -> None:
    raise RuntimeError(message)


def load_step_as_occt_brep(step_path: Path, brep_path: Path) -> None:
    try:
        from OCP.IFSelect import IFSelect_ReturnStatus
        from OCP.STEPControl import STEPControl_Reader
        from OCP.BRepTools import BRepTools
    except ImportError as error:
        fail(f"Open CASCADE STEP reader is unavailable: {error}")

    reader = STEPControl_Reader()
    if reader.ReadFile(str(step_path)) != IFSelect_ReturnStatus.IFSelect_RetDone:
        fail("Open CASCADE could not read this STEP file")
    transferred = reader.TransferRoots()
    if transferred <= 0:
        fail("STEP file contains no transferable CAD shapes")
    shape = reader.OneShape()
    if shape.IsNull():
        fail("STEP file contains no CAD geometry")
    if not BRepTools.Write_s(shape, str(brep_path)):
        fail("Open CASCADE could not stage the STEP shape for USD BRep")


def inspect_usd_brep(usd_path: Path) -> dict:
    try:
        import usd_brep as sm
    except ImportError as error:
        fail(f"NVIDIA usd-brep is unavailable: {error}")

    breps = sm.usd.import_breps(str(usd_path), heal=False)
    if not breps:
        fail("USD file contains no B-rep shapes")

    results = []
    total_faces = 0
    total_triangles = 0
    for brep_index, brep in enumerate(breps):
        faces = brep.faces()
        total_faces += len(faces)
        if total_faces > MAX_FACE_COUNT:
            fail("STEP model exceeds the 200,000 face limit")

        face_info = []
        for index, face in enumerate(faces):
            surface = face.surface()
            face_info.append({
                "index": index,
                "area": float(face.area()),
                "bounds": [[float(value) for value in corner]
                           for corner in face.bounding_box()],
                "planar": bool(surface.is_planar()),
            })

        poly = sm.tessellate(
            brep,
            chord_height_tolerance=0.05,
            surface_angle_tolerance_deg=12.0,
        )
        arrays = poly.to_mesh_arrays()
        points = arrays["points"]
        normals = arrays["normals"]
        if len(points) > MAX_POINTS:
            fail("STEP model exceeds the 500,000 vertex display limit")
        face_stream = arrays["faces"]
        triangles = []
        triangle_faces = []
        face_bounds = [face.bounding_box() for face in faces]
        offset = 0
        while offset < len(face_stream):
            count = int(face_stream[offset])
            vertices = face_stream[offset + 1:offset + 1 + count]
            if count < 3:
                fail("USD BRep tessellation returned a degenerate polygon")
            center = tuple(sum(points[int(vertex)][axis] for vertex in vertices) / count
                           for axis in range(3))
            candidates = [index for index, (minimum, maximum) in enumerate(face_bounds)
                          if all(minimum[axis] - 1e-4 <= center[axis] <= maximum[axis] + 1e-4
                                 for axis in range(3))]
            if not candidates:
                candidates = range(len(faces))
            face_index = min(candidates, key=lambda index: faces[index].closest_point(center)[1])
            for corner in range(1, count - 1):
                triangles.append((int(vertices[0]), int(vertices[corner]), int(vertices[corner + 1])))
                triangle_faces.append(face_index)
            offset += count + 1

        total_triangles += len(triangles)
        if total_triangles > MAX_TRIANGLES:
            fail("STEP model exceeds the 2,000,000 triangle display limit")

        results.append({
            "name": f"Brep {brep_index + 1}",
            "faces": face_info,
            "mesh": {
                "positions": [float(value) for point in points for value in point],
                "normals": [float(value) for normal in normals for value in normal],
                "indices": [index for triangle in triangles for index in triangle],
                "triangleFaces": triangle_faces,
            },
        })

    return {"success": True, "kernel": "NVIDIA usd-brep", "breps": results}


def inspect_step(step_path: Path, persistent_usd_path: Path | None = None) -> dict:
    if step_path.suffix.lower() not in {".step", ".stp"}:
        fail("Choose a .step or .stp file")
    if not step_path.is_file():
        fail("STEP file does not exist")
    if step_path.stat().st_size > MAX_STEP_BYTES:
        fail("STEP file exceeds the 100 MB import limit")

    converter = os.environ.get("PATHLOOM_OCCT_TO_USD")
    if not converter or not Path(converter).is_file():
        fail("The native occt_to_usd converter is not configured")

    with tempfile.TemporaryDirectory(prefix="pathloom-step-brep-") as directory:
        temp = Path(directory)
        brep_path = temp / "source.brep"
        usd_path = persistent_usd_path or temp / "source.usda"
        usd_path.parent.mkdir(parents=True, exist_ok=True)
        load_step_as_occt_brep(step_path, brep_path)
        completed = subprocess.run(
            [converter, str(brep_path), str(usd_path)],
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if completed.returncode != 0 or not usd_path.is_file():
            detail = (completed.stderr or completed.stdout).strip()
            fail(f"NVIDIA USD BRep import failed{': ' + detail if detail else ''}")
        result = inspect_usd_brep(usd_path)
        result["name"] = step_path.name
        return result


def move_usd_faces(usd_path: Path, brep_index: int, face_indices: list[int], dx: float, dy: float) -> dict:
    try:
        import usd_brep as sm
    except ImportError as error:
        fail(f"NVIDIA usd-brep is unavailable: {error}")
    if not usd_path.is_file():
        fail("The editable CAD asset is missing; reimport the STEP file")
    if not face_indices or len(face_indices) > 200_000 or len(set(face_indices)) != len(face_indices):
        fail("Select one or more distinct CAD faces")
    if any(not isinstance(index, int) or index < 0 for index in face_indices):
        fail("Invalid CAD face selection")
    if not all(math.isfinite(value) and abs(value) <= 1000 for value in (dx, dy)):
        fail("Face movement must be finite and within ±1000 mm")
    distance = (dx * dx + dy * dy) ** 0.5
    if distance < 1e-8:
        fail("Enter a non-zero X or Y movement")

    breps = sm.usd.import_breps(str(usd_path), heal=False)
    if not 0 <= brep_index < len(breps):
        fail("The selected CAD body is missing")
    target = breps[brep_index]
    faces = target.faces()
    if any(index >= len(faces) for index in face_indices):
        fail("The selected CAD face no longer exists")
    temporary = usd_path.with_name(f".{usd_path.stem}.edit-{os.getpid()}.usda")
    try:
        direction = (dx / distance, dy / distance, 0.0)
        operations = []
        for index in face_indices:
            face = faces[index]
            if not face.surface().is_planar():
                fail(f"CAD face {index + 1} is curved; only planar face movement is supported")
            loops = face.boundary_loops()
            if len(loops) != 1:
                fail(f"CAD face {index + 1} has inner loops; those are not supported by face movement yet")
            domain = face.uv_domain()
            uv = ((domain[0][0] + domain[1][0]) / 2, (domain[0][1] + domain[1][1]) / 2)
            normal = face.outward_normal_at_uv(*uv)
            normal_motion = direction[0] * normal[0] + direction[1] * normal[1]
            if abs(normal_motion) < 1e-6:
                fail(f"CAD face {index + 1} cannot move tangentially in XY; include movement across its normal")
            curves = [edge.curve() for edge, _reversed in loops[0]]
            tool = sm.linear_sweep(curves, direction, distance, cap_ends=True)
            operations.append((tool, normal_motion > 0))

        edited = target
        for tool, additive in operations:
            edited = sm.boolean_union(edited, tool) if additive else sm.boolean_difference(edited, tool)
        breps[brep_index] = edited
        if not edited.is_manifold_solid():
            fail("CAD edit did not produce a closed manifold solid")
        sm.usd.export_breps(breps, str(temporary))
        result = inspect_usd_brep(temporary)
        if len(json.dumps(result, separators=(",", ":"), allow_nan=False).encode("utf-8")) > 256 * 1024 * 1024:
            fail("Native B-rep response exceeds 256 MB")
        os.replace(temporary, usd_path)
        return result
    except Exception as error:
        temporary.unlink(missing_ok=True)
        fail(f"CAD face move failed; original shape was kept: {error}")


def main(argv: list[str]) -> int:
    try:
        if len(argv) == 3 and argv[1] == "inspect-usd":
            result = inspect_usd_brep(Path(argv[2]).expanduser().resolve())
        elif len(argv) in (2, 3):
            output_path = Path(argv[2]).expanduser().resolve() if len(argv) == 3 else None
            result = inspect_step(Path(argv[1]).expanduser().resolve(), output_path)
        elif len(argv) == 7 and argv[1] == "move-usd":
            result = move_usd_faces(
                Path(argv[2]).expanduser().resolve(), int(argv[3]),
                [int(value) for value in argv[4].split(",") if value],
                float(argv[5]), float(argv[6]),
            )
        else:
            fail("Usage: step_brep_bridge.py <file.step> [asset.usda] | inspect-usd <file.usda> | move-usd <asset.usda> <brepIndex> <faceIndices> <dx> <dy>")
        print(json.dumps(result, separators=(",", ":"), allow_nan=False))
        return 0
    except Exception as error:
        print(json.dumps({"success": False, "error": str(error)}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
