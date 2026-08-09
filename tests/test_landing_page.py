"""Smoke tests for the public landing page (GET /, webstaffr/landing_router.py).

This page had no test coverage before this file -- added alongside the
2026-07-29 visual restyle so a future edit can't silently reintroduce a
debunked statistic or break the page. Not a full content/accessibility
suite, just the guardrails this session's change depends on.
"""

from __future__ import annotations

import os
import tempfile
import unittest

from fastapi.testclient import TestClient

from webstaffr.app import create_app
from webstaffr.db import get_connection


class LandingPageTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        app = create_app(db_path=self.db_path)
        self._client_ctx = TestClient(app)
        self.client = self._client_ctx.__enter__()

    def tearDown(self):
        self._client_ctx.__exit__(None, None, None)
        os.remove(self.db_path)

    def test_landing_page_renders(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("NetBuild.Pro", resp.text)

    def test_landing_uses_canonical_plan_names(self):
        resp = self.client.get("/")
        self.assertIn("Office Staff", resp.text)
        for retired in ("Essentials", "Business Manager", "White-Glove"):
            self.assertNotIn(retired, resp.text)

    def test_landing_collects_contact_phone_and_email(self):
        resp = self.client.get("/")
        self.assertIn("Email and phone are required.", resp.text)
        self.assertIn('name: "email"', resp.text)
        self.assertIn('name: "phone"', resp.text)

    def test_no_unrendered_template_tokens(self):
        """Every __TOKEN__ placeholder in _LANDING_PAGE_HTML must be
        substituted -- a leftover token means a substitution was added to
        the HTML but not to _render_landing_page()'s .replace() chain."""
        resp = self.client.get("/")
        self.assertNotIn("__CONTACT_", resp.text)
        self.assertNotIn("__ICON_", resp.text)

    def test_response_rate_stat_is_labeled_as_an_industry_benchmark(self):
        """The '78% of homeowners hire whoever responds first' claim was
        already found, flagged, and removed elsewhere in this repo
        (sales-crm.html, the real website copy -- see TASKS.md 2026-07-27)
        after failing independent verification twice. It had drifted back
        in here; this pins it removed."""
        resp = self.client.get("/")
        self.assertNotIn("78%", resp.text)
        self.assertIn("85%", resp.text)
        self.assertIn("Industry benchmarks commonly cited", resp.text)
        self.assertIn("not NetBuild.Pro performance claims", resp.text)

    def test_landing_and_full_intake_are_available(self):
        landing = self.client.get("/")
        self.assertIn("function LeadForm()", landing.text)
        self.assertIn("How do we reach you?", landing.text)

        intake = self.client.get("/start")
        self.assertEqual(intake.status_code, 200)
        self.assertIn('id="intake-form"', intake.text)
        self.assertIn("Create My Customer Site", intake.text)
        self.assertIn("fetch('/intake'", intake.text)

    def test_intake_exposes_tradesman_mvp_choices(self):
        resp = self.client.get("/start")
        for expected in (
            "Plumber", "Electrician", "HVAC", "Pest Control",
            "Office Staff", "Text my cell", "Route to GHL",
            "Founder only", "Team",
        ):
            self.assertIn(expected, resp.text)

    def test_landing_does_not_link_to_unprovisioned_demo_tenants(self):
        resp = self.client.get("/")
        self.assertNotIn('href="/demos/', resp.text)

    def test_landing_describes_integration_fit_without_overpromising(self):
        resp = self.client.get("/")
        self.assertIn("Can you work with my existing calendar and CRM?", resp.text)
        self.assertIn("In most cases, yes.", resp.text)
        self.assertIn("agree on the exact workflow during onboarding", resp.text)

    def test_intake_uses_canonical_brand_and_plan_names(self):
        resp = self.client.get("/start")
        self.assertIn("NetBuild.Pro", resp.text)
        self.assertNotIn("WebStaffr", resp.text)
        self.assertIn('value="office_staff" checked', resp.text)
        self.assertNotIn('value="essentials"', resp.text)
        self.assertNotIn('value="pro"', resp.text)
        self.assertNotIn('value="growth"', resp.text)

    def test_investor_summary_avoids_unverified_performance_claims(self):
        resp = self.client.get("/investors/pitch")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertNotIn("unit_economics", payload)
        self.assertNotIn("27%", payload["problem"])
        self.assertNotIn("answers every call", payload["solution"].lower())
        self.assertEqual(payload["pricing"], {"office_staff_monthly": 497})

    def test_demo_redirect_unknown_trade(self):
        resp = self.client.get("/demos/not-a-real-trade")
        self.assertEqual(resp.status_code, 404)
        self.assertEqual(resp.json()["detail"], "Demo not found")

    def test_demo_redirect_requires_an_existing_demo_tenant(self):
        missing = self.client.get("/demos/plumbing", follow_redirects=False)
        self.assertEqual(missing.status_code, 404)

        conn = get_connection(self.db_path)
        try:
            conn.execute("INSERT INTO tenants (tenant_id) VALUES (?)", ("demo-plumbing",))
            conn.commit()
        finally:
            conn.close()

        provisioned = self.client.get("/demos/plumbing", follow_redirects=False)
        self.assertEqual(provisioned.status_code, 302)
        self.assertEqual(provisioned.headers["location"], "/sites/demo-plumbing/web")


if __name__ == "__main__":
    unittest.main()
