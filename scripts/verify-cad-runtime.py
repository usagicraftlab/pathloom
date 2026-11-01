from importlib import metadata
import json
import sys

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.TopoDS import TopoDS_Shape
from OCP import __version__ as ocp_version
import vtk


EXPECTED = {
    "python": (3, 12),
    "cadquery-ocp": "7.8.1.1.post1",
    "OCP": "7.8.1.1",
    "vtk": "9.3.1",
}


def main():
    actual = {
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "cadquery-ocp": metadata.version("cadquery-ocp"),
        "OCP": ocp_version,
        "vtk": vtk.vtkVersion.GetVTKVersion(),
    }
    if sys.version_info[:2] != EXPECTED["python"]:
        raise SystemExit(f"Python version mismatch: {actual['python']} != 3.12")
    for name in ("cadquery-ocp", "OCP", "vtk"):
        if actual[name] != EXPECTED[name]:
            raise SystemExit(f"{name} version mismatch: {actual[name]} != {EXPECTED[name]}")
    shape: TopoDS_Shape = BRepPrimAPI_MakeBox(1.0, 2.0, 3.0).Shape()
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, props)
    if shape.IsNull() or not BRepCheck_Analyzer(shape).IsValid() or abs(props.Mass() - 6.0) > 1e-9:
        raise SystemExit("OCP B-rep startup probe failed")
    print(json.dumps({"status": "ok", "versions": actual, "probe": "closed-box"}, sort_keys=True))


if __name__ == "__main__":
    main()
