"""AvatarWardrobe backend — Track B2 feasibility spike: PNG -> proxy-3D GLB.

Why synchronous generation (no job queue): the whole pipeline is
deterministic CPU work on a downscaled image and completes well under a
second, so a queue would only add states and race conditions to a spike.
The API still speaks in job terms — POST returns a persisted record with a
``job_id`` and the GET endpoints read from disk — so a future async
implementation can keep the exact same surface.
"""

from __future__ import annotations

import time
import uuid

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Literal

from app import storage
from app.proxy3d import pipeline

app = FastAPI(
    title="AvatarWardrobe backend — proxy-3D spike",
    description=(
        "Track B2 feasibility spike. Generates an honest proxy 3D preview "
        "(textured, lightly extruded silhouette card) from a PNG. Not real "
        "virtual try-on."
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


class Proxy3dRecord(BaseModel):
    job_id: str
    status: Literal["done"]
    method: Literal["extruded-alpha-contour", "textured-plane"]
    alpha_mask_used: bool
    input: InputInfo
    mesh: MeshStats
    result_url: str
    limitations: str
    created_at: float


@app.exception_handler(pipeline.Proxy3dError)
async def proxy3d_error_handler(_request, exc: pipeline.Proxy3dError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.post("/api/proxy-3d", response_model=Proxy3dRecord, status_code=201)
async def create_proxy_3d(file: UploadFile = File(...)) -> Proxy3dRecord:
    data = await file.read()
    result = pipeline.generate(data)

    job_id = uuid.uuid4().hex
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
