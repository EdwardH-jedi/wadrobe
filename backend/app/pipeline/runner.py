"""Pipeline runner (Track B — experimental).

Runs the five injected stages in order and returns the exported GLB plus the
honest notes trail. Stages are constructor-injected, so an implementation can be
swapped without changing this file.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.pipeline.interfaces import (
    AvatarInputs,
    IAvatarBuilder,
    IBodyEstimator,
    IExporter,
    IOutfitFitter,
    ITextureProjector,
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
    # Real (for a proxy): the procedural mannequin builder and the bbox outfit
    # fitter. Body estimation and texture projection are still deterministic
    # stubs. DummyAvatarBuilder / DummyOutfitFitter stay available as cheap test
    # doubles.
    from app.pipeline.dummy import (
        DummyBodyEstimator,
        DummyExporter,
        DummyTextureProjector,
    )
    from app.pipeline.fitter import BboxOutfitFitter
    from app.pipeline.mannequin import ProceduralMannequinBuilder

    return AvatarPipeline(
        estimator=DummyBodyEstimator(),
        builder=ProceduralMannequinBuilder(),
        projector=DummyTextureProjector(),
        fitter=BboxOutfitFitter(),
        exporter=DummyExporter(),
    )
