"""Guardrails for the public NetBuild.Pro landing page."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

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

    def test_landing_page_renders_canonical_brand(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("NetBuild.Pro", resp.text)
        self.assertNotIn("WebStaff", resp.text)

    def test_landing_uses_only_launch_plan(self):
        resp = self.client.get("/")
        self.assertIn("Office Staff", resp.text)
        self.assertIn("$497", resp.text)
        for retired in ("Essentials", "Business Manager", "White-Glove"):
            self.assertNotIn(retired, resp.text)

    def test_primary_conversion_uses_full_intake(self):
        resp = self.client.get("/")
        self.assertGreaterEqual(resp.text.count('href: "/start"'), 1)
        self.assertNotIn("<form", resp.text)
        self.assertIn('window.location.href = "/start"', resp.text)
        self.assertNotIn("setSent(true)", resp.text)

        intake = self.client.get("/start")
        self.assertEqual(intake.status_code, 200)
        self.assertIn('id="intake-form"', intake.text)
        self.assertIn("Create My Customer Site", intake.text)
        self.assertIn("fetch('/intake'", intake.text)

    def test_landing_has_no_unrendered_template_tokens(self):
        resp = self.client.get("/")
        self.assertNotIn("__CONTACT_", resp.text)
        self.assertNotIn("__ICON_", resp.text)

    def test_landing_avoids_unverified_performance_proof(self):
        resp = self.client.get("/")
        self.assertIn("Outcome framing only", resp.text)
        self.assertNotIn("of missed callers never call back", resp.text)
        self.assertNotIn("of business calls go unanswered", resp.text)

    def test_landing_removes_unsupported_industries(self):
        resp = self.client.get("/")
        for industry in ("Salon", "Dental", "Real Estate", "Legal"):
            self.assertNotIn(industry, resp.text)

    def test_landing_links_only_repository_hosted_demos(self):
        resp = self.client.get("/")
        expected = (
            "hvac.html",
            "plumbing.html",
            "roof.html",
            "landscape.html",
            "pest.html",
            "garage.html",
            "arbor.html",
            "waterrestore.html",
            "maid.html",
        )
        for filename in expected:
            self.assertIn(f'file: "/demo-sites/{filename}"', resp.text)
            demo = self.client.get(f"/demo-sites/{filename}")
            self.assertEqual(demo.status_code, 200)
        self.assertNotIn("ctonew.app", resp.text)
        self.assertNotIn('href="/demos/', resp.text)

    def test_angel_embed_is_functional_and_origin_scoped(self):
        resp = self.client.get("/")
        self.assertIn("/static/angel-widget.js", resp.text)
        self.assertIn('setAttribute("data-tenant-id", "netbuild")', resp.text)
        self.assertIn("window.location.origin", resp.text)

    def test_static_accessibility_contract(self):
        resp = self.client.get("/")
        html = resp.text
        self.assertEqual(html.count("<h1"), 1)
        self.assertIn('"aria-label": "Main navigation"', html)
        self.assertIn('class="skip-link"', html)
        self.assertIn(":focus-visible", html)
        self.assertIn("@media (prefers-reduced-motion: reduce)", html)
        self.assertIn('"aria-expanded": open', html)
        self.assertIn('"aria-controls": "mobile-menu"', html)

    def test_live_and_static_landing_artifacts_are_identical(self):
        root = Path(__file__).resolve().parents[1]
        self.assertEqual(
            (root / "webstaffr/templates/netbuild_pro.html").read_bytes(),
            (root / "site/index.html").read_bytes(),
        )

    def test_landing_has_no_dead_placeholder_links_or_investor_modal(self):
        resp = self.client.get("/")
        self.assertNotIn('href="#"', resp.text)
        self.assertNotIn("investorModal", resp.text)

    def test_intake_exposes_tradesman_mvp_choices(self):
        resp = self.client.get("/start")
        for expected in (
            "Plumber", "Electrician", "HVAC", "Pest Control",
            "Office Staff", "Text my cell", "Route to GHL",
            "Founder only", "Team",
        ):
            self.assertIn(expected, resp.text)

    def test_intake_uses_canonical_brand_and_plan_names(self):
        resp = self.client.get("/start")
        self.assertIn("NetBuild.Pro", resp.text)
        self.assertNotIn("WebStaffr", resp.text)
        self.assertIn('value="office_staff" checked', resp.text)
        for retired in ("essentials", "pro", "growth"):
            self.assertNotIn(f'value="{retired}"', resp.text)

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
