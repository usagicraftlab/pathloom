#!/usr/bin/env python3
"""Repeatable Linux measurements for Issue #23; values are not Mac evidence."""
from __future__ import annotations

import gc
import json
import os
import platform
import statistics
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "native"))
from cad_runtime import Runtime, TOLERANCES  # noqa: E402

XY = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[0, 1, 0])


def rss_mib() -> float:
    with open("/proc/self/status", encoding="utf-8") as status:
        line = next(line for line in status if line.startswith("VmRSS:"))
    return round(int(line.split()[1]) / 1024, 3)


def request(index: int, anchor: list[float]) -> dict:
    return dict(
        protocolVersion=1,
        requestId=str(index),
        documentId="performance-fixture",
        documentRevision=index,
        workspaceEpoch=1,
        runtimeEpoch=1,
        sessionId=None,
        featureId=str(index),
        featureRevision=1,
        requestedHash=f"performance-{index}",
        previewSequence=0,
        intent="recompute",
        operation=dict(id="solid.box", version=1),
        parameters=dict(
            plane=XY,
            anchorMode="corner",
            anchor=anchor,
            widthMm=10,
            depthMm=10,
            heightMm=10,
        ),
        inputs={},
        tolerances=TOLERANCES,
    )


def median(values: list[float]) -> float:
    return round(statistics.median(values), 3)


def startup_measurements(repeats: int = 3) -> list[float]:
    code = (
        "import sys;sys.path.insert(0,'native');"
        "from cad_runtime import Runtime;"
        "r=Runtime();r.handle({'type':'hello'})"
    )
    values = []
    for _ in range(repeats):
        start = time.perf_counter()
        subprocess.run(
            [sys.executable, "-B", "-c", code],
            cwd=os.path.join(os.path.dirname(__file__), ".."),
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        values.append((time.perf_counter() - start) * 1000)
    return [round(value, 3) for value in values]


def model_measurement(name: str, count: int, repeats: int = 3) -> dict:
    samples = []
    for _ in range(repeats):
        runtime = Runtime()
        before = rss_mib()
        outputs = []
        started = time.perf_counter()
        for index in range(count):
            result = runtime.handle(
                dict(type="evaluate", request=request(index, [index * 12, 0, 0]))
            )
            if result["status"] != "ok":
                raise RuntimeError(result)
            outputs.extend(result["outputs"])
        recompute_ms = (time.perf_counter() - started) * 1000
        after_recompute = rss_mib()
        handles_before_gc = len(runtime.cache)

        started = time.perf_counter()
        assets = runtime.handle(
            dict(type="export", handles=[output["handle"] for output in outputs])
        )["assets"]
        transfer_ms = (time.perf_counter() - started) * 1000
        transfer_bytes = sum(asset["byteLength"] for asset in assets.values())

        runtime.handle(
            dict(type="release", handles=[output["handle"] for output in outputs])
        )
        gc.collect()
        samples.append(
            dict(
                recomputeMs=round(recompute_ms, 3),
                transferMs=round(transfer_ms, 3),
                transferBytes=transfer_bytes,
                rssBeforeMiB=before,
                rssAfterRecomputeMiB=after_recompute,
                rssAfterGcMiB=rss_mib(),
                handlesBeforeGc=handles_before_gc,
                handlesAfterGc=len(runtime.cache),
            )
        )
    return dict(
        name=name,
        primitive="solid.box",
        entityCount=count,
        repeats=repeats,
        samples=samples,
        median=dict(
            recomputeMs=median([sample["recomputeMs"] for sample in samples]),
            transferMs=median([sample["transferMs"] for sample in samples]),
            transferBytes=int(statistics.median([sample["transferBytes"] for sample in samples])),
            rssBeforeMiB=median([sample["rssBeforeMiB"] for sample in samples]),
            rssAfterRecomputeMiB=median([sample["rssAfterRecomputeMiB"] for sample in samples]),
            rssAfterGcMiB=median([sample["rssAfterGcMiB"] for sample in samples]),
            handlesBeforeGc=int(statistics.median([sample["handlesBeforeGc"] for sample in samples])),
            handlesAfterGc=int(statistics.median([sample["handlesAfterGc"] for sample in samples])),
        ),
    )


hello = Runtime().handle(dict(type="hello"))
startup = startup_measurements()
print(
    json.dumps(
        dict(
            environment=dict(
                platform=platform.platform(),
                machine=platform.machine(),
                python=sys.version.split()[0],
                ocpVersion=hello.get("ocpVersion"),
                measurementScope="synthetic Linux regression baseline; not Mac acceptance",
            ),
            startup=dict(samplesMs=startup, medianMs=median(startup)),
            models=[
                model_measurement("small", 1),
                model_measurement("medium", 20),
                model_measurement("large", 60),
            ],
        ),
        ensure_ascii=False,
        separators=(",", ":"),
    )
)
