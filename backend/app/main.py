"""The Archive — EXPERIMENTAL local backend (Track B). Not part of the web app.

Two independent API surfaces live here:

* ``/api/proxy-3d`` — PNG -> proxy-3D GLB, generated synchronously. The web
  app's Proxy 3D Lab is the only consumer, and only when the build opts in via
  ``VITE_ENABLE_EXPERIMENTAL_3D``.
* ``/api/jobs`` — an async avatar-build surface. **No frontend consumes it.**

Why the proxy-3D route is synchronous (no job queue): the whole pipeline is
deterministic CPU work on a downscaled image and completes well under a
second, so a queue would only add states and race conditions. The API still
speaks in job terms — POST returns a persisted record with a ``job_id`` and the
GET endpoints read from disk — so a future async implementation can keep the
exact same surface.

Nothing here is real virtual try-on, body reconstruction, or accurate fitting.
"""

from __future__ import annotations

import time
import uuid

from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Literal

from app import jobs, storage
from app.pipeline.interfaces import AvatarInputs
from app.proxy3d import pipeline

app = FastAPI(
    title="The Archive — experimental backend",
    description=(
        "EXPERIMENTAL, local-only. Two surfaces: /api/proxy-3d generates an "
        "honest proxy 3D preview (a textured, lightly extruded silhouette "
        "card) from a PNG, synchronously; /api/jobs is an async avatar-build "
        "surface that no frontend consumes. Neither is real virtual try-on, "
        "body reconstruction, or accurate fitting."
    ),
    version="0.1.0",
)


class InputInfo(BaseModel):
    width: int
    height: int
    has_alpha: bool


class MeshStats(BaseModel):
    vertices: int
    faces: int


class BackAlignment(BaseModel):
    """Applied (post-clamp) manual back alignment (B3.8)."""

    scale: float
    offset_x: float
    offset_y: float
    manual: bool


class Proxy3dRecord(BaseModel):
    job_id: str
    status: Literal["done"]
    method: Literal[
        "extruded-alpha-contour",
        "extruded-alpha-contour-dual",
        "textured-plane",
    ]
    alpha_mask_used: bool
    input: InputInfo
    mesh: MeshStats
    result_url: str
    limitations: str
    created_at: float
    # B3.7 dual-sided fields. Defaults keep records persisted by earlier
    # versions loadable.
    sides: Literal["single", "dual"] = "single"
    back_input: InputInfo | None = None
    back_alpha_mask_used: bool | None = None
    # B3.8: manual back alignment actually applied (None on single-sided).
    back_alignment: BackAlignment | None = None


@app.exception_handler(pipeline.Proxy3dError)
async def proxy3d_error_handler(_request, exc: pipeline.Proxy3dError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.post("/api/proxy-3d", response_model=Proxy3dRecord, status_code=201)
async def create_proxy_3d(
    file: UploadFile = File(...),
    back_file: UploadFile | None = File(default=None),
    back_scale: float = Form(default=1.0),
    back_offset_x: float = Form(default=0.0),
    back_offset_y: float = Form(default=0.0),
) -> Proxy3dRecord:
    data = await file.read()
    back_data = await back_file.read() if back_file is not None else None
    result = pipeline.generate(
        data,
        back_data,
        back_scale=back_scale,
        back_offset_x=back_offset_x,
        back_offset_y=back_offset_y,
    )

    job_id = uuid.uuid4().hex
    back_input = None
    if result.back_width is not None and result.back_height is not None:
        back_input = InputInfo(
            width=result.back_width,
            height=result.back_height,
            has_alpha=bool(result.back_has_alpha),
        )
    record = Proxy3dRecord(
        job_id=job_id,
        status="done",
        method=result.method,  # type: ignore[arg-type]
        alpha_mask_used=result.alpha_mask_used,
        input=InputInfo(
            width=result.input_width,
            height=result.input_height,
            has_alpha=result.input_has_alpha,
        ),
        mesh=MeshStats(vertices=result.vertex_count, faces=result.face_count),
        result_url=f"/api/proxy-3d/{job_id}/result.glb",
        limitations=result.limitations,
        created_at=time.time(),
        sides=result.sides,  # type: ignore[arg-type]
        back_input=back_input,
        back_alpha_mask_used=result.back_alpha_mask_used,
        back_alignment=(
            BackAlignment(
                scale=result.back_align_scale,
                offset_x=result.back_align_offset_x,
                offset_y=result.back_align_offset_y,
                manual=bool(result.back_align_manual),
            )
            if result.back_align_scale is not None
            and result.back_align_offset_x is not None
            and result.back_align_offset_y is not None
            else None
        ),
    )
    storage.save_job(job_id, result.glb_bytes, record.model_dump())
    return record


@app.get("/api/proxy-3d/{job_id}", response_model=Proxy3dRecord)
async def get_proxy_3d(job_id: str) -> Proxy3dRecord:
    record = storage.load_record(job_id)
    if record is None:
        raise pipeline.Proxy3dError(404, "Unknown proxy-3D job id.")
    return Proxy3dRecord(**record)


@app.get("/api/proxy-3d/{job_id}/result.glb")
async def get_proxy_3d_result(job_id: str) -> FileResponse:
    path = storage.glb_path(job_id)
    if path is None:
        raise pipeline.Proxy3dError(404, "Unknown proxy-3D job id.")
    return FileResponse(path, media_type="model/gltf-binary", filename="result.glb")


# --- Avatar jobs API (Track B) -----------------------------------------------
# Additive async job surface for the (heavier) avatar build. Mirrors the
# proxy-3D error/handler pattern.
#
# EXPERIMENTAL, and no frontend consumes it: the web app talks only to
# /api/proxy-3d. The default pipeline assembles a procedural trimesh mannequin
# and bbox-fits an outfit GLB onto it — an honest PROXY, not a real avatar, a
# body scan, or an accurate fit. Body estimation and texture projection are
# still deterministic stubs. Every stage records what actually ran in the job's
# `notes`, so a result never overstates itself.


class JobError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail


@app.exception_handler(JobError)
async def job_error_handler(_request, exc: JobError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


class JobRecord(BaseModel):
    id: str
    state: Literal["queued", "processing", "done", "failed"]
    error: str | None = None


@app.post("/api/jobs", response_model=JobRecord, status_code=202)
async def create_job(
    background_tasks: BackgroundTasks,
    body_file: UploadFile = File(...),
    face_file: UploadFile | None = File(default=None),
    outfit_file: UploadFile | None = File(default=None),
) -> JobRecord:
    inputs = AvatarInputs(
        body_image=await body_file.read(),
        face_image=await face_file.read() if face_file is not None else None,
        outfit_glb=await outfit_file.read() if outfit_file is not None else None,
    )
    job = jobs.store.create()
    background_tasks.add_task(jobs.store.process, job.id, inputs)
    return JobRecord(id=job.id, state=job.state.value)


@app.get("/api/jobs/{job_id}", response_model=JobRecord)
async def get_job(job_id: str) -> JobRecord:
    job = jobs.store.get(job_id)
    if job is None:
        raise JobError(404, "Unknown job id.")
    return JobRecord(id=job.id, state=job.state.value, error=job.error)


@app.get("/api/jobs/{job_id}/result.glb")
async def get_job_result(job_id: str) -> FileResponse:
    job = jobs.store.get(job_id)
    if job is None:
        raise JobError(404, "Unknown job id.")
    if job.state.value == "failed":
        raise JobError(409, f"Job failed: {job.error}")
    path = jobs.glb_path(job_id)
    if path is None:
        raise JobError(409, "Job result is not ready yet.")
    return FileResponse(path, media_type="model/gltf-binary", filename="result.glb")
