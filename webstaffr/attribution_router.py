"""FastAPI router serving the per-tenant attribution/ROI dashboard reads
(webstaffr/attribution.py). Mounted into the main app via
create_app().include_router(attribution_router) in webstaffr/app.py, same
pattern as intake_router/site_router.

Deliberately read-only from the outside: call events are written by
in-process callers (retell_router.py's webhook handlers, workers/angel/
router.py's /book handler) that already hold an open, tenant-resolved
connection -- not via a public ingestion endpoint. This keeps the public
surface here to exactly what the Lovable dashboard needs to read, rather
than adding a new unauthenticated write endpoint alongside /book and
/webhooks/ghl -- both of those needed shared-secret auth added after the
fact (see api_auth.py), a lesson worth designing around here instead of
repeating.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from .attribution import CallEventRepository, TrackingNumberRepository
from .db import DB_ERRORS, get_connection
from .intake import IntakeRepository, get_intake_sections
from .tenant import InvalidTenantError, Tenant

logger = logging.getLogger("webstaffr.attribution_router")

attribution_router = APIRouter()


def _get_connection(request: Request):
    try:
        return get_connection(request.app.state.db_path)
    except DB_ERRORS as exc:
        # See site_router.py's identical comment: log the exception type
        # only, never str(exc) (may contain the connection string).
        logger.error("attribution_db_connection_failed error_type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Attribution data temporarily unavailable") from exc


def _validate_tenant(tenant_id: str) -> None:
    try:
        Tenant(tenant_id=tenant_id)
    except InvalidTenantError as exc:
        # Same non-leaking 404 shape as site_router.get_site_data: a caller
        # shouldn't be able to distinguish "malformed id" from "valid id,
        # no data yet" for a public-facing endpoint.
        raise HTTPException(status_code=404, detail="No tracking data for this tenant") from exc


@attribution_router.get("/tenants/{tenant_id}/tracking-number")
def get_tracking_number(tenant_id: str, request: Request) -> dict:
    _validate_tenant(tenant_id)
    conn = _get_connection(request)
    try:
        record = TrackingNumberRepository(conn).get_for_tenant(tenant_id)
    finally:
        conn.close()

    if record is None:
        raise HTTPException(status_code=404, detail="No tracking number for this tenant")

    return {"tenant_id": record.tenant_id, "tracking_number": record.tracking_number}


@attribution_router.get("/tenants/{tenant_id}/metrics")
def get_metrics(tenant_id: str, request: Request) -> dict:
    _validate_tenant(tenant_id)
    conn = _get_connection(request)
    try:
        return CallEventRepository(conn).metrics_for_tenant(tenant_id)
    finally:
        conn.close()


@attribution_router.get("/tenants/{tenant_id}/calls")
def list_calls(tenant_id: str, request: Request, limit: int = 50) -> dict:
    _validate_tenant(tenant_id)
    capped_limit = max(1, min(limit, 200))
    conn = _get_connection(request)
    try:
        events = CallEventRepository(conn).list_for_tenant(tenant_id, limit=capped_limit)
    finally:
        conn.close()

    return {
        "tenant_id": tenant_id,
        "calls": [
            {
                "event_id": e.event_id,
                "event_type": e.event_type,
                "call_id": e.call_id,
                "duration_seconds": e.duration_seconds,
                "outcome": e.outcome,
                "created_at": e.created_at,
            }
            for e in events
        ],
    }


@attribution_router.get("/tenants/{tenant_id}/dashboard")
def get_tenant_dashboard(tenant_id: str, request: Request) -> dict:
    """Comprehensive dashboard data for a tenant.
    
    Combines intake completion metrics with attribution/call metrics
    for a unified dashboard view. This is the primary endpoint for
    the owner dashboard UI.
    """
    _validate_tenant(tenant_id)
    conn = _get_connection(request)
    try:
        # Get intake completion data
        intake_repo = IntakeRepository(conn)
        dashboard_summary = intake_repo.get_dashboard_summary(tenant_id)
        
        # Get call attribution metrics
        call_repo = CallEventRepository(conn)
        call_metrics = call_repo.metrics_for_tenant(tenant_id)
        
        # Get recent calls
        recent_calls = call_repo.list_for_tenant(tenant_id, limit=10)
        
        # Get tracking number
        tracking_repo = TrackingNumberRepository(conn)
        tracking_record = tracking_repo.get_for_tenant(tenant_id)
        
    finally:
        conn.close()
    
    if dashboard_summary is None:
        raise HTTPException(status_code=404, detail="No intake data found for this tenant")
    
    return {
        "tenant_id": tenant_id,
        "business_info": {
            "biz_name": dashboard_summary["biz_name"],
            "industry": dashboard_summary["industry"],
            "plan": dashboard_summary["plan"],
        },
        "intake_completion": {
            "overall_percentage": dashboard_summary["overall_completion"],
            "sections": dashboard_summary["section_completion"],
            "has_required_data": dashboard_summary["has_required_data"],
        },
        "performance_metrics": {
            "calls_received": call_metrics["calls_received"],
            "calls_completed": call_metrics["calls_completed"],
            "appointments_booked": call_metrics["appointments_booked"],
            "estimated_value_usd": call_metrics["estimated_value_usd"],
        },
        "tracking": {
            "tracking_number": tracking_record.tracking_number if tracking_record else None,
        },
        "recent_activity": [
            {
                "event_id": e.event_id,
                "event_type": e.event_type,
                "call_id": e.call_id,
                "outcome": e.outcome,
                "created_at": e.created_at,
            }
            for e in recent_calls
        ],
    }


@attribution_router.get("/intake/sections")
def get_intake_section_definitions() -> dict:
    """Return the intake form section definitions for dashboard UI rendering.
    
    This allows the frontend to dynamically render the intake form structure
    and display progress per section without hardcoding the structure.
    """
    return {"sections": get_intake_sections()}
