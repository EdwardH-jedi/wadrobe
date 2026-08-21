# `backend/` — EXPERIMENT BOUNDARY

Two surfaces live here and they have very different standing. Read this before
assuming either is part of the product.

## `/api/proxy-3d` — CONNECTED EXPERIMENT

Reachable from the web app, but only when the build sets
`VITE_ENABLE_EXPERIMENTAL_3D` **and** this service is running locally. It turns
a transparent PNG into a proxy-3D GLB: a textured, lightly-extruded silhouette.

It is a proxy. Not virtual try-on, not garment reconstruction, not fitting.

## `/api/jobs` — ISOLATED EXPERIMENT

**No frontend consumes this.** No button reaches it, no code path calls it, and
the product does not depend on it in any way.

It exists as a research surface: five injectable pipeline stages, a procedural
mannequin builder assembled from primitives, and a bounding-box outfit fitter.
Body estimation and texture projection are deterministic stubs that record
honestly what they did not do.

It is **not production-ready and is not on the product path**. It is bounded
rather than productionised — upload byte caps, a ceiling on jobs in flight, and
a TTL sweep of generated artifacts — so that a reachable endpoint cannot be used
to exhaust the host. There is no queue, no scheduler and no durable job state:
job lifecycle is in memory and does not survive a restart.

Do not present it as a feature. See
[`docs/PROJECT_STATUS.md`](../docs/PROJECT_STATUS.md).
