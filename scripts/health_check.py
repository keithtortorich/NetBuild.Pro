#!/usr/bin/env python3
"""Self-healing health check for the live WebStaffr product surface.

Run any time to verify the app boots, migrates cleanly, and the paths a
real customer/tenant actually exercises (intake, site data, chat,
booking, rate limiting, CORS scoping) behave correctly end to end. Exits
non-zero on any failure so it can be wired into CI without modification.

Rewritten for WebStaffr 4.0: the prior version of this script smoke-
tested the standalone workflow engine (webstaffr/workflow.py, execution.py,
executor.py, repository.py), which this repo does not carry forward --
nothing in the live product ever called it. These checks smoke-test what
the deployed app actually does instead.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    checks = []

    def check(name, fn):
        try:
            fn()
            checks.append((name, True, ""))
        except Exception as exc:  # noqa: BLE001
            checks.append((name, False, f"{type(exc).__name__}: {exc}"))

    def check_imports():
        from webstaffr.app import app, create_app  # noqa: F401
        from webstaffr.db import connect, migrate, get_connection  # noqa: F401
        from webstaffr.tenant import Tenant  # noqa: F401
        from webstaffr.workers.angel.angel import Angel, load_prompt_template  # noqa: F401
        from webstaffr.workers.angel.voice import NullVoiceBackend  # noqa: F401
        from webstaffr.workers.angel.ghl import NullGHLClient  # noqa: F401
        from webstaffr.workers.angel.router import create_angel_router  # noqa: F401
        from webstaffr.integrations.servicetitan.client import ServiceTitanClient  # noqa: F401
        from webstaffr.integrations.social_media.client import SocialMediaClient  # noqa: F401
        from webstaffr.integrations.workflow_graph.client import WorkflowGraphClient  # noqa: F401
        from webstaffr.integrations.design_critique.client import (  # noqa: F401
            NullDesignCritiqueClient,
            OpenRouterDesignCritiqueClient,
        )

    def check_migrations_create_expected_tables():
        """A fresh SQLite DB migrated from empty must end up with exactly
        the 4.0 application's tables -- and critically, NOT the dropped
        workflow engine's workflow_definitions/execution_records, which
        would silently indicate a stale/uncleaned migrations directory."""
        import tempfile
        from webstaffr.db import connect, migrate

        fd, db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        os.remove(db_path)  # connect() creates it fresh
        try:
            with connect(db_path) as conn:
                migrate(conn)
                tables = {
                    row[0]
                    for row in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    ).fetchall()
                }
            expected = {
                "tenants", "appointments", "intake_submissions",
                "rate_limit_counters", "tracking_numbers", "call_events",
                "social_media_mounts", "social_media_intents", "execution_nodes",
                "website_leads",
            }
            missing = expected - tables
            assert not missing, f"missing expected tables: {missing}"
            dropped_engine_tables = {"workflow_definitions", "execution_records"}
            leaked = dropped_engine_tables & tables
            assert not leaked, f"dropped-engine tables present in fresh schema: {leaked}"
        finally:
            if os.path.exists(db_path):
                os.remove(db_path)

    def check_app_boots_and_chat_responds():
        """create_app() with no real credentials configured must still
        boot and serve a full /chat turn via the Null-object backends --
        this is the shape every unconfigured-tenant deployment starts in."""
        import tempfile
        from fastapi.testclient import TestClient
        from webstaffr.app import create_app
        from webstaffr.workers.angel.api_auth import NullSharedSecretVerifier
        from webstaffr.workers.angel.voice import NullVoiceBackend
        from webstaffr.workers.angel.ghl import NullGHLClient

        fd, db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            app = create_app(
                db_path=db_path,
                voice_backend=NullVoiceBackend(),
                ghl_client=NullGHLClient(),
                book_api_verifier=NullSharedSecretVerifier(),
                ghl_webhook_verifier=NullSharedSecretVerifier(),
            )
            with TestClient(app) as client:
                health_resp = client.get("/health")
                assert health_resp.status_code == 200, f"unexpected /health status: {health_resp.status_code}"

                chat_resp = client.post("/chat", json={"tenant_id": "healthcheck", "message": "hi"})
                assert chat_resp.status_code == 200, f"unexpected /chat status: {chat_resp.status_code}"
                assert "reply" in chat_resp.json()

                book_resp = client.post(
                    "/book",
                    json={
                        "tenant_id": "healthcheck",
                        "contact_name": "Jane",
                        "starts_at": "2026-08-01T15:00:00Z",
                        "sync_to_ghl": False,
                    },
                )
                assert book_resp.status_code == 200, f"unexpected /book status: {book_resp.status_code}"
                assert book_resp.json()["appointment_id"] is not None

                webhook_resp = client.post(
                    "/webhooks/ghl",
                    json={"tenant_id": "healthcheck", "event_type": "website_lead", "contact_name": "Jane"},
                )
                assert webhook_resp.status_code == 200, f"unexpected /webhooks/ghl status: {webhook_resp.status_code}"
        finally:
            os.remove(db_path)

    def check_intake_round_trip_and_tenant_scoping():
        """A submitted intake form must round-trip through the DB, and
        must not be readable under a different tenant_id -- the same
        tenant-isolation invariant every table in this schema depends on."""
        from webstaffr.db import connect, migrate
        from webstaffr.intake import IntakeSubmission, IntakeRepository

        with connect(":memory:") as conn:
            migrate(conn)
            submission = IntakeSubmission(
                tenant_id="healthcheck",
                biz_name="Healthcheck Plumbing",
                phone="555-0100",
                email="owner@healthcheckplumbing.example",
                industry="plumbing",
                service_area="Metro area",
                tagline="We fix it right the first time.",
                differentiator="24/7 emergency response.",
                services=["drain cleaning", "water heater repair"],
                license_number="LIC-12345",
                plan="office_staff",
                lead_routing="owner@healthcheckplumbing.example",
                approver="Owner",
            )
            repo = IntakeRepository(conn)
            submission_id = repo.save(submission)

            loaded = repo.load("healthcheck", submission_id)
            assert loaded is not None, "intake submission failed to round-trip"
            assert loaded.biz_name == "Healthcheck Plumbing"

            cross_tenant = repo.load("someone_else", submission_id)
            assert cross_tenant is None, "intake load leaked across tenant_id"

    def check_site_data_never_leaks_internal_fields():
        """GET /sites/{tenant_id}'s public projection must never include
        internal-only fields, no matter what's in the underlying intake
        row -- this list mirrors CLAUDE.md's never-leak list."""
        from webstaffr.intake import IntakeSubmission
        from webstaffr.site_data import build_public_site_data

        submission = IntakeSubmission(
            tenant_id="healthcheck",
            biz_name="Healthcheck Plumbing",
            phone="555-0100",
            email="owner@healthcheckplumbing.example",
            industry="plumbing",
            service_area="Metro area",
            tagline="We fix it right the first time.",
            differentiator="24/7 emergency response.",
            services=["drain cleaning"],
            license_number="LIC-12345",
            plan="office_staff",
            lead_routing="owner@healthcheckplumbing.example",
            approver="Owner",
            competitors="Acme Plumbing, Best Plumbing",
        )
        public_data = build_public_site_data(submission)
        never_leak = {"lead_routing", "approver", "competitors", "license_number"}
        leaked = never_leak & public_data.keys()
        assert not leaked, f"internal-only fields leaked into public site data: {leaked}"

    def check_rendered_site_smoke_test():
        """The in-repo customer site renderer (webstaffr/site_render_router.py,
        see docs/SITE_RENDERER_PLAN.md) is a separate code path from the
        JSON /sites/{tenant_id} endpoint checked above -- a real HTTP round
        trip through it, plus the same never-leak assertion applied to
        rendered HTML instead of a JSON dict, catches template-layer
        regressions the JSON-only check above can't see."""
        import tempfile
        from fastapi.testclient import TestClient
        from webstaffr.app import create_app

        fd, db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            app = create_app(db_path=db_path)
            with TestClient(app) as client:
                submit = client.post(
                    "/intake",
                    json={
                        "biz_name": "Healthcheck Plumbing",
                        "phone": "555-0100",
                        "email": "owner@healthcheckplumbing.example",
                        "industry": "Plumber",
                        "service_area": "Metro area",
                        "tagline": "We fix it right the first time.",
                        "differentiator": "24/7 emergency response.",
                        "services": ["Drain Cleaning"],
                        "license_number": "LIC-12345",
                        "plan": "office_staff",
                        "lead_routing": "owner@healthcheckplumbing.example",
                        "approver": "Owner",
                        "competitors": "Acme Plumbing",
                    },
                )
                assert submit.status_code == 200, f"intake failed: {submit.text}"
                tenant_id = submit.json()["tenant_id"]

                home = client.get(f"/sites/{tenant_id}/web")
                assert home.status_code == 200, f"rendered home page failed: {home.status_code}"
                assert "Healthcheck Plumbing" in home.text
                for leaked_value in ("LIC-12345", "Acme Plumbing"):
                    assert leaked_value not in home.text, (
                        f"internal-only value {leaked_value!r} leaked into rendered HTML"
                    )
                assert "aggregateRating" not in home.text, (
                    "aggregateRating schema present with no real rating/review data on file"
                )

                svc = client.get(f"/sites/{tenant_id}/web/services/drain-cleaning")
                assert svc.status_code == 200, f"rendered service page failed: {svc.status_code}"

                css = client.get("/static/site.css")
                assert css.status_code == 200, "rendered-site stylesheet failed to serve"
                widget = client.get("/static/angel-widget.js")
                assert widget.status_code == 200, "angel-widget.js failed to serve"
        finally:
            os.remove(db_path)

    def check_cors_scoped_correctly():
        """/chat (browser-facing, embedded widget) must carry CORS
        headers; /book (server-to-server only) must not -- CORS scoping
        by path, not an app-wide wildcard."""
        import tempfile
        from fastapi.testclient import TestClient
        from webstaffr.app import create_app
        from webstaffr.workers.angel.voice import NullVoiceBackend
        from webstaffr.workers.angel.ghl import NullGHLClient

        fd, db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            app = create_app(db_path=db_path, voice_backend=NullVoiceBackend(), ghl_client=NullGHLClient())
            with TestClient(app) as client:
                chat_resp = client.post(
                    "/chat",
                    json={"tenant_id": "healthcheck", "message": "hi"},
                    headers={"origin": "https://example-customer-site.com"},
                )
                assert "access-control-allow-origin" in chat_resp.headers, "/chat missing CORS headers"

                book_resp = client.post(
                    "/book",
                    json={
                        "tenant_id": "healthcheck",
                        "contact_name": "Jane",
                        "starts_at": "2026-08-01T15:00:00Z",
                        "sync_to_ghl": False,
                    },
                    headers={"origin": "https://example-customer-site.com"},
                )
                assert "access-control-allow-origin" not in book_resp.headers, "/book unexpectedly has CORS headers"
        finally:
            os.remove(db_path)

    def check_rendered_site_a11y():
        """Mechanical accessibility checks (webstaffr/site_a11y_check.py)
        against the real rendered output of every page type -- contrast on
        the shared stylesheet (once), plus alt text / form labels / heading
        order on each of home, about, contact, and one service page. Same
        real-HTTP-round-trip pattern as check_rendered_site_smoke_test
        above; this is the deterministic half of design QA (see
        docs/DECISIONS.md), the judgment half stays a human-invoked skill,
        not an automatic check."""
        import tempfile
        from fastapi.testclient import TestClient
        from webstaffr.app import create_app
        from webstaffr.site_a11y_check import check_css_contrast, check_focus_visible, check_page

        fd, db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            app = create_app(db_path=db_path)
            with TestClient(app) as client:
                submit = client.post(
                    "/intake",
                    json={
                        "biz_name": "Healthcheck Plumbing",
                        "phone": "555-0100",
                        "email": "owner@healthcheckplumbing.example",
                        "industry": "Plumber",
                        "service_area": "Metro area",
                        "tagline": "We fix it right the first time.",
                        "differentiator": "24/7 emergency response.",
                        "services": ["Drain Cleaning"],
                        "license_number": "LIC-12345",
                        "plan": "office_staff",
                        "lead_routing": "owner@healthcheckplumbing.example",
                        "approver": "Owner",
                        "competitors": "Acme Plumbing",
                    },
                )
                assert submit.status_code == 200, f"intake failed: {submit.text}"
                tenant_id = submit.json()["tenant_id"]

                css = client.get("/static/site.css")
                assert css.status_code == 200

                all_issues = []
                all_issues += check_css_contrast(css.text).issues
                all_issues += check_focus_visible(css.text).issues

                pages = {
                    "home": f"/sites/{tenant_id}/web",
                    "about": f"/sites/{tenant_id}/web/about",
                    "contact": f"/sites/{tenant_id}/web/contact",
                    "service": f"/sites/{tenant_id}/web/services/drain-cleaning",
                }
                for label, path in pages.items():
                    resp = client.get(path)
                    assert resp.status_code == 200, f"{label} page failed to render: {resp.status_code}"
                    all_issues += check_page(resp.text, page_label=label).issues

                assert not all_issues, "a11y issues found: " + "; ".join(
                    f"[{i.check}] {i.detail}" for i in all_issues
                )
        finally:
            os.remove(db_path)

    def check_rate_limit_trips():
        """An unauthenticated caller must eventually be rejected -- this
        is what closes the unbounded-billed-xAI-usage gap on /chat."""
        from webstaffr.db import connect, migrate
        from webstaffr.rate_limit import check_and_increment, RateLimitExceeded, DEFAULT_MAX_REQUESTS_PER_WINDOW

        with connect(":memory:") as conn:
            migrate(conn)
            tripped = False
            for _ in range(DEFAULT_MAX_REQUESTS_PER_WINDOW + 1):
                try:
                    check_and_increment(conn, "healthcheck", "chat")
                except RateLimitExceeded:
                    tripped = True
                    break
            assert tripped, "rate limit never tripped within DEFAULT_MAX_REQUESTS_PER_WINDOW + 1 requests"

    def check_angel_prompt_loads():
        from webstaffr.workers.angel.angel import load_prompt_template

        prompt = load_prompt_template()
        assert prompt and prompt.strip(), "angel_prompt.md loaded empty"

    check("imports", check_imports)
    check("migrations_create_expected_tables", check_migrations_create_expected_tables)
    check("app_boots_and_chat_responds", check_app_boots_and_chat_responds)
    check("intake_round_trip_and_tenant_scoping", check_intake_round_trip_and_tenant_scoping)
    check("site_data_never_leaks_internal_fields", check_site_data_never_leaks_internal_fields)
    check("rendered_site_smoke_test", check_rendered_site_smoke_test)
    check("rendered_site_a11y", check_rendered_site_a11y)
    check("cors_scoped_correctly", check_cors_scoped_correctly)
    check("rate_limit_trips", check_rate_limit_trips)
    check("angel_prompt_loads", check_angel_prompt_loads)

    print("NetBuild.Pro health check")
    print("=" * 40)
    all_ok = True
    for name, ok, error in checks:
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}" + (f" -- {error}" if error else ""))
        all_ok = all_ok and ok

    print("=" * 40)
    print("Result: " + ("HEALTHY" if all_ok else "UNHEALTHY"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
