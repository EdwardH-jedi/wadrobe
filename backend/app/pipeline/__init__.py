"""Avatar build pipeline (Track B — experimental).

Five injectable stages (estimate -> build -> project -> fit -> export) behind
Protocols. ``default_pipeline()`` (see ``runner.py``) currently composes a
procedural trimesh mannequin builder and a bounding-box outfit fitter with
deterministic stubs for body estimation and texture projection; the stubs in
``dummy.py`` remain available as cheap test doubles.

This is NOT real body reconstruction, accurate fitting, or virtual try-on. Each
stage appends an honest note so a job's provenance says exactly what ran.
"""
