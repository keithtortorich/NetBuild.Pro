"""FastAPI router for client intake -- the first stage of the intake -> 
generated customer site -> Angel widget MVP flow (CLAUDE.md / PROJECT.md).

Mounted into the main app via create_app().include_router(intake_router)
in webstaffr/workers/angel/router.py, keeping that file's own router
Angel-specific per its existing docstring.
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .attribution import TrackingNumberRepository
from .db import DB_ERRORS, get_connection
from .intake import (
    IntakeRepository,
    IntakeSubmission,
    IntakeValidationError,
    generate_tenant_id,
    validate_intake_payload,
)
from .site_data import build_public_site_data
from .site_magic import SiteMagicNotConfiguredError, SiteMagicRepository
from .site_magic_engine import generate_site_for_submission, resolve_site_workdir
from .trade_presets import SUPPORTED_INDUSTRIES, get_preset
from .rate_limit import (
    RateLimitExceeded,
    check_dimensions,
    direct_client_ip,
)

logger = logging.getLogger("webstaffr.intake_router")

intake_router = APIRouter()


class IntakeRequest(BaseModel):
    # Section 1: Business Basics
    biz_name: str
    phone: str
    email: str
    industry: str
    service_area: str
    years_in_biz: Optional[int] = None
    emergency_service: Optional[str] = None

    # Section 2: Current Web Presence
    has_site: Optional[str] = None
    site_url: Optional[str] = None
    site_platform: Optional[str] = None
    site_issues: Optional[str] = None
    has_gbp: Optional[str] = None
    gbp_url: Optional[str] = None
    google_review_link: Optional[str] = None

    # Section 3: Brand
    has_logo: Optional[str] = None
    brand_colors: Optional[str] = None
    brand_words: Optional[str] = None
    inspo_sites: Optional[str] = None

    # Section 4: Positioning
    tagline: str
    differentiator: str
    competitors: Optional[str] = None
    tone: Optional[str] = None

    # Section 5: Services
    services: list[str]
    pricing_shown: Optional[str] = None
    promos: Optional[str] = None
    license_number: str

    # Section 6: Proof & Credibility
    rating_value: Optional[float] = None
    review_count: Optional[int] = None
    certifications: Optional[str] = None
    has_before_after: Optional[str] = None
    testimonials: Optional[str] = None

    # Section 7: Social & Tools
    facebook_url: Optional[str] = None
    instagram_url: Optional[str] = None
    fsm_system: Optional[str] = None
    booking_system: Optional[str] = None

    # Section 8: Workforce Plan
    plan: str
    lead_routing: str
    timeline: Optional[str] = None
    approver: str

    # Section 9: Content & SEO
    assets_status: Optional[str] = None
    keywords: Optional[str] = None
    extra_pages: Optional[str] = None
    notes: Optional[str] = None


class IntakeResponse(BaseModel):
    submission_id: int
    tenant_id: str
    biz_name: str
    industry: str
    plan: str


def _get_connection(request: Request):
    """Reads the db_path the app was created with (create_app stores it on
    app.state) rather than importing a module-level default -- keeps this
    router testable against whatever database a given app instance uses.
    Backend (SQLite vs Postgres) is chosen by db.get_connection() based on
    DATABASE_URL -- this router doesn't need to know which one it got.
    Raises HTTPException(503) on a DB-layer failure instead of letting a
    raw psycopg2/sqlite3 exception propagate to the client.
    """
    try:
        return get_connection(request.app.state.db_path)
    except DB_ERRORS as exc:
        # See site_router.py's identical comment: log the exception type
        # only, never str(exc) (may contain the connection string).
        logger.error("intake_db_connection_failed error_type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Intake temporarily unavailable -- please try again shortly") from exc


@intake_router.post("/intake", response_model=IntakeResponse)
def submit_intake(req: IntakeRequest, request: Request) -> IntakeResponse:
    data = req.model_dump()

    try:
        validate_intake_payload(data)
    except IntakeValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    conn = _get_connection(request)
    try:
        try:
            check_dimensions(
                conn,
                "intake",
                [("ip", direct_client_ip(request))],
            )
        except RateLimitExceeded as exc:
            conn.commit()
            raise HTTPException(
                status_code=429,
                detail="Too many setup requests. Please try again shortly.",
            ) from exc

        tenant_id = generate_tenant_id(req.biz_name)
        submission = IntakeSubmission.from_payload(tenant_id, data)
        repo = IntakeRepository(conn)
        repo.save(submission)

        # Create customer user and tenant membership for the new tenant
        user_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO customer_users (user_id, status) VALUES (?, ?)",
            (user_id, 'active')
        )
        conn.execute(
            """
            INSERT INTO tenant_memberships (tenant_id, user_id, role, status)
            VALUES (?, ?, ?, ?)
            """,
            (tenant_id, user_id, 'owner', 'active')
        )

        # Every tenant gets a tracking number the moment they have a real
        # site to point it at -- get_or_create() is idempotent, so a
        # resubmission for the same tenant_id (there isn't one today, but
        # nothing here assumes there never will be) can't create a second
        # one. See attribution.py's module docstring for why this isn't a
        # real phone number yet.
        TrackingNumberRepository(conn).get_or_create(tenant_id)
        conn.commit()
    finally:
        conn.close()

    _generate_site_if_enabled(submission, request.app.state.db_path)
    _enqueue_site_magic_job_if_configured(submission, request)

    return IntakeResponse(
        submission_id=submission.submission_id,
        tenant_id=tenant_id,
        biz_name=submission.biz_name,
        industry=submission.industry,
        plan=submission.plan,
    )


def _generate_site_if_enabled(submission: IntakeSubmission, db_path: str) -> None:
    """Best-effort site generation after a successful intake.

    Site generation must never fail the intake response: a prospect should
    not receive a 500 because template rendering hiccuped. Failures are
    logged with the real exception type and swallowed here; success is
    silent.
    """
    try:
        generate_site_for_submission(submission, resolve_site_workdir(db_path))
    except Exception as exc:
        logger.error(
            "site_generation_failed tenant_id=%s error_type=%s",
            submission.tenant_id,
            type(exc).__name__,
        )


def _enqueue_site_magic_job_if_configured(submission: IntakeSubmission, request: Request) -> None:
    """Best-effort Site Magic job creation after a successful intake commit.

    Runs in its own connection/transaction, strictly after the intake
    transaction above has already committed -- a Site Magic failure must
    never roll back or fail the intake response, same posture as
    _generate_site_if_enabled.

    source_payload carries verified_facts alongside intake_id: the same
    build_public_site_data() projection GET /sites/{tenant_id} uses, so
    the worker's SiteSource.verifiedFacts is the already-vetted
    internal-fields-stripped view (see site_data.py's module docstring for
    the never-leak list -- lead_routing, approver, competitors,
    license_number, etc.), not a raw dump of intake_submissions. The
    worker needs the facts inline: nothing resolves an intake_id back to
    a submission from the Node side, and duplicating that lookup there
    would be a second, drifting source of truth for what's public-safe.
    """
    conn = _get_connection(request)
    try:
        job = SiteMagicRepository(conn).create_job(
            tenant_id=submission.tenant_id,
            source_type="intake",
            source_payload={
                "intake_id": str(submission.submission_id),
                "verified_facts": build_public_site_data(submission),
            },
        )
        request.app.state.site_magic_queue.enqueue(job_id=job.job_id, tenant_id=submission.tenant_id)
        conn.commit()
    except SiteMagicNotConfiguredError:
        conn.rollback()
        logger.info("site_magic_enqueue_skipped tenant_id=%s reason=not_configured", submission.tenant_id)
    except DB_ERRORS as exc:
        conn.rollback()
        logger.error(
            "site_magic_enqueue_failed tenant_id=%s error_type=%s",
            submission.tenant_id, type(exc).__name__,
        )
    finally:
        conn.close()


@intake_router.get("/intake/presets")
def list_presets() -> dict:
    """All supported industries, for populating the intake form's industry
    selector without hardcoding the list on the Lovable/frontend side.
    """
    return {"industries": SUPPORTED_INDUSTRIES}


@intake_router.get("/intake/presets/{industry}")
def industry_preset(industry: str) -> dict:
    """Per-trade hint text and FSM software options for one industry.
    Always resolves (falls back to 'Other') -- see trade_presets.get_preset.
    """
    return get_preset(industry)