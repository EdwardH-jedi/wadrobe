> **Historical document — not current implementation status.**
> Kept for the reasoning it records. It was accurate when written and has not
> been maintained since. For what the repository actually contains today, see
> [`docs/PROJECT_STATUS.md`](../PROJECT_STATUS.md).

---

# Track B — Phase B4a: Async Jobs API + Pipeline Interfaces (배선)

목표: 무거운 아바타 빌드를 위한 **async job lifecycle**(`/api/jobs`)과 **5개 pipeline interface +
dummy 구현**을 깐다. B4a는 "사진 넣으면 job이 큐→처리→완료로 돌아 GLB가 나온다"는 **흐름**을
끝까지 잇는 게 목표 — 아바타 mesh 품질(진짜 마네킹)은 **B4b**에서 채운다. B4a의 `IAvatarBuilder`는
placeholder(단순 박스 GLB)면 충분하다.

## 하드 규칙 (AVATAR_TRACK.md §2, §7)
- **백엔드 전용·additive.** `src/`·`docs/`·Track A 테스트는 한 줄도 안 건드린다. 기존 `/api/proxy-3d`
  라우트와 `storage.py`(proxy_3d 전용)도 수정 금지 — 새 파일 + `main.py`에 라우트만 추가.
- **honest proxy.** 결과 GLB는 placeholder임을 메타에 정직히 표기. "real avatar / body scan / accurate
  fit" 류 금지. 진짜 reconstruction·ML 없음(no SMPL/mediapipe/torch).
- **deps ceiling:** `trimesh`, `pygltflib`, `numpy`만 추가(전부 무료·로컬). `requirements.txt`에 명시.
- Track A 테스트 + 기존 `pytest backend`(proxy-3d)가 B4a 후에도 전부 green이어야 한다.

## 기존 패턴 (그대로 따를 것)
- `job_id = uuid.uuid4().hex` (32-hex). storage 검증 정규식과 동일.
- `storage.py` 스타일: `data_root()`가 env override(`AVATARWARDROBE_*_DATA`)를 call-time에 읽음.
  B4a는 이를 **미러**해서 jobs 전용 경로를 둔다(proxy-3d storage는 안 건드림).
- `config.py` 스타일: 모듈 속성을 call-time에 읽음(tests monkeypatch).
- 에러: `Proxy3dError(status_code, detail)` + `@app.exception_handler` 패턴을 미러한 `JobError`.

---

## 파일 맵

| 동작 | 경로 |
|---|---|
| 새 | `backend/app/pipeline/__init__.py` |
| 새 | `backend/app/pipeline/interfaces.py` — 5 Protocol + dataclasses |
| 새 | `backend/app/pipeline/dummy.py` — dummy impls (placeholder GLB) |
| 새 | `backend/app/pipeline/runner.py` — 5단계를 순서대로 실행 |
| 새 | `backend/app/jobs.py` — in-memory job store + lifecycle + 디스크 결과 저장 |
| 수정 | `backend/app/main.py` — `/api/jobs` 라우트 3개 추가 (proxy-3d 유지) |
| 새 | `backend/tests/test_jobs.py` |
| 수정 | `backend/requirements.txt` (또는 pyproject) — trimesh/pygltflib/numpy |

---

## 1. `pipeline/interfaces.py` — 계약 (B4a의 핵심 산출물)

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol

@dataclass(frozen=True)
class AvatarInputs:
    """Raw user inputs for one avatar job."""
    body_image: bytes
    face_image: bytes | None = None
    outfit_glb: bytes | None = None   # consumed in B5 (IOutfitFitter)

@dataclass(frozen=True)
class BodyProportions:
    """Canned proportions in normalized units. B4b may scale height from the
    body image's aspect ratio; B4a returns deterministic defaults."""
    height: float = 1.8
    shoulder_width: float = 0.45
    hip_width: float = 0.38

@dataclass
class AvatarMesh:
    """Wraps a trimesh.Scene as it flows through the pipeline."""
    scene: object                      # trimesh.Scene
    notes: list[str] = field(default_factory=list)  # honest provenance trail

class IBodyEstimator(Protocol):
    def estimate(self, inputs: AvatarInputs) -> BodyProportions: ...

class IAvatarBuilder(Protocol):
    def build(self, proportions: BodyProportions) -> AvatarMesh: ...

class ITextureProjector(Protocol):
    def project(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh: ...

class IOutfitFitter(Protocol):
    def fit(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh: ...

class IExporter(Protocol):
    def export(self, mesh: AvatarMesh) -> bytes: ...   # returns GLB bytes
```

---

## 2. `pipeline/dummy.py` — 정직한 더미

```python
from __future__ import annotations
import trimesh
from app.pipeline.interfaces import (
    AvatarInputs, AvatarMesh, BodyProportions,
)

class DummyBodyEstimator:
    def estimate(self, inputs: AvatarInputs) -> BodyProportions:
        return BodyProportions()  # canned; B4b may scale from image aspect

class DummyAvatarBuilder:
    """B4a placeholder: a single box at body scale. B4b replaces this with a
    procedural trimesh mannequin. The mesh is intentionally NOT a real body."""
    def build(self, proportions: BodyProportions) -> AvatarMesh:
        box = trimesh.creation.box(
            extents=(proportions.shoulder_width, proportions.height, proportions.hip_width)
        )
        scene = trimesh.Scene(box)
        return AvatarMesh(scene=scene, notes=["placeholder-box (B4a)"])

class DummyTextureProjector:
    def project(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.face_image is not None:
            mesh.notes.append("face-texture: not applied (B4a pass-through)")
        return mesh

class DummyOutfitFitter:
    def fit(self, mesh: AvatarMesh, inputs: AvatarInputs) -> AvatarMesh:
        if inputs.outfit_glb is not None:
            mesh.notes.append("outfit-fit: deferred to B5")
        return mesh  # B5 implements real bbox merge

class DummyExporter:
    def export(self, mesh: AvatarMesh) -> bytes:
        glb = mesh.scene.export(file_type="glb")
        return glb if isinstance(glb, bytes) else bytes(glb)
```

---

## 3. `pipeline/runner.py` — 5단계 실행

```python
from __future__ import annotations
from dataclasses import dataclass
from app.pipeline.interfaces import (
    AvatarInputs, IAvatarBuilder, IBodyEstimator, IExporter,
    IOutfitFitter, ITextureProjector,
)

@dataclass
class AvatarPipeline:
    estimator: IBodyEstimator
    builder: IAvatarBuilder
    projector: ITextureProjector
    fitter: IOutfitFitter
    exporter: IExporter

    def run(self, inputs: AvatarInputs) -> tuple[bytes, list[str]]:
        proportions = self.estimator.estimate(inputs)
        mesh = self.builder.build(proportions)
        mesh = self.projector.project(mesh, inputs)
        mesh = self.fitter.fit(mesh, inputs)
        return self.exporter.export(mesh), mesh.notes

def default_pipeline() -> AvatarPipeline:
    from app.pipeline.dummy import (
        DummyAvatarBuilder, DummyBodyEstimator, DummyExporter,
        DummyOutfitFitter, DummyTextureProjector,
    )
    return AvatarPipeline(
        estimator=DummyBodyEstimator(),
        builder=DummyAvatarBuilder(),
        projector=DummyTextureProjector(),
        fitter=DummyOutfitFitter(),
        exporter=DummyExporter(),
    )
```

> interface 주입식이라 B4b는 `DummyAvatarBuilder`만 진짜 마네킹 빌더로 바꿔 끼우면 된다.

---

## 4. `jobs.py` — in-memory store + lifecycle + 디스크 결과

상태(queued/processing)는 메모리, 결과 GLB는 디스크(`storage.py` 패턴 미러, 별도 루트).

```python
from __future__ import annotations
import json, os, re, threading, uuid
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path

from app.pipeline.interfaces import AvatarInputs
from app.pipeline.runner import AvatarPipeline, default_pipeline

class JobState(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"

@dataclass
class Job:
    id: str
    state: JobState
    error: str | None = None
    notes: list[str] | None = None

_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "data" / "jobs"

def jobs_root() -> Path:
    override = os.environ.get("AVATARWARDROBE_JOBS_DATA")
    return Path(override) if override else _DEFAULT_ROOT

def is_valid_job_id(job_id: str) -> bool:
    return bool(_JOB_ID_RE.match(job_id))

def glb_path(job_id: str) -> Path | None:
    if not is_valid_job_id(job_id):
        return None
    p = jobs_root() / job_id / "result.glb"
    return p if p.is_file() else None

class JobStore:
    """Thread-safe in-memory job state. Result GLB persists to disk."""
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(id=uuid.uuid4().hex, state=JobState.QUEUED)
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def _update(self, job_id: str, **fields) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for k, v in fields.items():
                setattr(job, k, v)

    def process(self, job_id: str, inputs: AvatarInputs,
                pipeline: AvatarPipeline | None = None) -> None:
        """Run one job to completion. Called via BackgroundTasks."""
        pipeline = pipeline or default_pipeline()
        self._update(job_id, state=JobState.PROCESSING)
        try:
            glb, notes = pipeline.run(inputs)
            job_dir = jobs_root() / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            (job_dir / "result.glb").write_bytes(glb)
            (job_dir / "metadata.json").write_text(
                json.dumps({"id": job_id, "notes": notes}, indent=2),
                encoding="utf-8",
            )
            self._update(job_id, state=JobState.DONE, notes=notes)
        except Exception as exc:  # honest failure, never crash the worker
            self._update(job_id, state=JobState.FAILED, error=str(exc))

# Module singleton (mirrors proxy-3d's module-level storage usage).
store = JobStore()
```

---

## 5. `main.py` — 라우트 3개 추가 (기존 proxy-3d 유지)

```python
from fastapi import BackgroundTasks
from app import jobs
from app.pipeline.interfaces import AvatarInputs

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
        face_image=await face_file.read() if face_file else None,
        outfit_glb=await outfit_file.read() if outfit_file else None,
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
```

> `status_code=202`(Accepted): 동기 즉시 완료가 아니라 큐잉됐다는 정직한 신호.
> 단, FastAPI `BackgroundTasks`는 **응답 후** 실행되므로 테스트에선 POST 직후 한 번 폴링하면
> 이미 done이다(작업이 가벼워서). 무거운 작업으로 바뀌어도 API 표면은 동일.

---

## 6. `tests/test_jobs.py`

`conftest.py`가 proxy-3d data를 temp로 돌리는 패턴을 미러해서 `AVATARWARDROBE_JOBS_DATA`도 temp로.

커버할 케이스:
1. `POST /api/jobs` (body_file만) → 202, `id`가 32-hex, state가 queued|processing|done.
2. 폴링 `GET /api/jobs/{id}` → 최종 done.
3. `GET /api/jobs/{id}/result.glb` → 200 + 바이트가 GLB 매직(`b"glTF"`)로 시작.
4. 알 수 없는 id → 404. 아직 안 끝난 result → 409. (failed job result → 409 + error.)
5. dummy 단위: `DummyBodyEstimator().estimate(...)` 기본값, `DummyAvatarBuilder().build(...)`가
   non-empty scene, `DummyExporter().export(...)`가 `b"glTF"` 시작.
6. runner 단위: `default_pipeline().run(inputs)` → (GLB bytes, notes) — notes에 placeholder 흔적.
7. (실패 경로) builder가 던지도록 주입한 파이프라인으로 `store.process` → state failed + error 채워짐.

TestClient(`from fastapi.testclient import TestClient`)로 1–4, 직접 호출로 5–7.

---

## 7. requirements

`backend/requirements.txt`에 추가(없으면 생성, 기존 fastapi/uvicorn/pydantic/numpy 유지):
```
trimesh
pygltflib
```
(numpy는 proxy-3d가 이미 쓰므로 보통 존재. trimesh가 GLB export에 pygltflib를 씀.)

---

## 8. 검증

```bash
cd backend && pytest                 # 기존 22 + B4a 신규, 전부 green
cd .. && npm test && npm run typecheck && npm run build   # Track A 무영향 확인
```

proxy-3d 라우트/테스트는 손대지 않았으므로 그대로 통과해야 한다. B4a는 순수 additive.

---

## Claude Code 프롬프트

```
Track B Phase B4a를 구현한다. 첨부 track-b4a-jobs-api.md를 따르되 현재 backend 코드의 실제
시그니처에 맞춰 통합해라. 범위는 백엔드 전용·additive다:
- 새 파일: app/pipeline/{__init__,interfaces,dummy,runner}.py, app/jobs.py, tests/test_jobs.py.
- 수정: app/main.py에 JobError+handler와 /api/jobs 라우트 3개(POST 202 / GET 상태 / GET result.glb)만 추가.
  기존 /api/proxy-3d 라우트와 app/storage.py(proxy_3d 전용)는 절대 수정하지 마라.
- requirements에 trimesh, pygltflib 추가.
규칙:
- 5개 interface(IBodyEstimator/IAvatarBuilder/ITextureProjector/IOutfitFitter/IExporter)는 Protocol로
  정의하고 dummy로 구현. IAvatarBuilder는 B4a에선 placeholder 박스 GLB면 된다(진짜 마네킹은 B4b).
- job 상태는 in-memory(JobState queued→processing→done|failed, 실패 시 honest error), 결과 GLB는
  storage.py 패턴을 미러한 jobs_root()(AVATARWARDROBE_JOBS_DATA env override)에 디스크 저장.
- job_id는 uuid4().hex(32-hex). 결과 GLB는 b"glTF"로 시작해야 한다.
- 결과/메타는 placeholder임을 정직히 표기. real avatar/body-scan/accurate-fit 류 문구 금지.
끝나면 `cd backend && pytest` + `npm test && npm run typecheck && npm run build` 전부 green 확인하고
diff만 보여줘. 커밋하지 마.
```

## 다음 — B4b
B4a가 green으로 들어오면 `DummyAvatarBuilder`를 trimesh primitives로 만든 **procedural mannequin**
(키 큰 faceless 패션 마네킹)으로 교체한다. interface가 고정돼 있어 그 클래스 하나만 바꾸면 됨.
그 뒤 B5(IOutfitFitter로 옷 GLB 합성) + 프론트 Avatar Lab 뷰 연동.
