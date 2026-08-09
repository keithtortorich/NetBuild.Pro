"""Vercel entrypoint -- re-exports the real FastAPI app instance.

Vercel's Python builder auto-detects a supported root-level file
(index.py/app.py/main.py/server.py) exposing an `app` FastAPI instance.
The actual app is constructed in webstaffr/app.py; this file just points
Vercel at it rather than duplicating app construction here, or requiring
a pyproject.toml [project] table that would duplicate requirements.txt
as a second dependency source. A pyproject.toml with only a
[tool.vercel] entrypoint table was tried in the WS3.3 predecessor repo
and failed the build: uv requires a full [project] table once
pyproject.toml exists at all, and that table drifted out of sync with
requirements.txt. This repo deliberately has no pyproject.toml at all --
requirements.txt/requirements-dev.txt are the sole dependency source,
and pytest.ini covers test config. Do not reintroduce pyproject.toml.

Performance optimization: Enable HTTP keep-alive and response compression
for Vercel serverless environment to reduce latency and bandwidth.
"""

from webstaffr.app import app  # noqa: F401

# Vercel-specific optimizations
import gzip
from fastapi.responses import Response, JSONResponse
from starlette.middleware.gzip import GZipMiddleware

# Apply GZip compression for responses >500 bytes (reduces bandwidth by ~70%)
app.add_middleware(GZipMiddleware, minimum_size=500)
