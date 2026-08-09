"""Tests for site_magic_engine."""

from __future__ import annotations

from pathlib import Path

import pytest

from webstaffr.intake import IntakeSubmission
from webstaffr.site_magic_engine import SiteGenerationResult, generate_site_for_submission


def _minimal_submission(tmp_path: Path) -> IntakeSubmission:
    return IntakeSubmission(
        tenant_id="test_tenant",
        biz_name="Test Biz",
        phone="555-0000",
        email="test@example.com",
        industry="Other",
        service_area="Nowhere",
        tagline="Tagline",
        differentiator="Differentiator",
        services=["Service A"],
        license_number="LIC-1",
        plan="office_staff",
        lead_routing="office",
        approver="owner",
    )


def test_generate_site_writes_pages(tmp_path: Path):
    submission = _minimal_submission(tmp_path)
    result = generate_site_for_submission(submission, tmp_path)

    assert isinstance(result, SiteGenerationResult)
    assert result.tenant_id == "test_tenant"
    assert result.pages == ["about", "contact", "home", "services"]

    assert result.output_dir is not None
    web_dir = result.output_dir
    assert web_dir.exists()
    for page in result.pages:
        assert (web_dir / f"{page}.html").exists()
    assert (web_dir / "tokens.css").exists()


def test_generate_site_includes_reviews_when_present(tmp_path: Path):
    submission = _minimal_submission(tmp_path)
    submission.rating_value = 4.8
    submission.review_count = 120
    submission.testimonials = "Great work!"
    submission.emergency_service = "Yes"
    submission.pricing_shown = "Yes"
    submission.certifications = "Certified"

    result = generate_site_for_submission(submission, tmp_path)
    assert result.has_reviews is True
    assert "reviews" in result.pages
    assert result.trust_signal_count == 4
    reviews_html = (result.output_dir / "reviews.html").read_text(encoding="utf-8")
    assert "Great work!" in reviews_html
    assert "4.8" in reviews_html


def test_generate_site_omits_reviews_when_absent(tmp_path: Path):
    submission = _minimal_submission(tmp_path)
    result = generate_site_for_submission(submission, tmp_path)
    assert result.has_reviews is False
    assert "reviews" not in result.pages


def test_generated_home_contains_tenant_fields(tmp_path: Path):
    submission = _minimal_submission(tmp_path)
    result = generate_site_for_submission(submission, tmp_path)
    html = (result.output_dir / "home.html").read_text(encoding="utf-8")

    assert "Test Biz" in html
    assert "555-0000" in html
    assert "test@example.com" in html
    assert "Site by NetBuild.Pro" in html
    assert 'data-tenant-id="test_tenant"' in html


def test_generated_pages_do_not_invent_customer_promises(tmp_path: Path):
    submission = _minimal_submission(tmp_path)
    submission.years_in_biz = 8
    submission.certifications = "EPA 608"
    submission.emergency_service = "no"
    submission.pricing_shown = "no"

    result = generate_site_for_submission(submission, tmp_path)
    rendered = "\n".join(
        (result.output_dir / f"{page}.html").read_text(encoding="utf-8")
        for page in result.pages
    ).lower()

    for unsupported in (
        "24/7 emergency service",
        "free estimate",
        "within 1 hour",
        "within 1 business hour",
        "licensed & certified",
        "upfront price",
        "great work!",
    ):
        assert unsupported not in rendered

    assert "epa 608" in rendered


def test_generated_home_normalizes_positive_flags_without_claiming_free_estimates(
    tmp_path: Path,
):
    submission = _minimal_submission(tmp_path)
    submission.emergency_service = "yes"
    submission.pricing_shown = "yes"

    result = generate_site_for_submission(submission, tmp_path)
    html = (result.output_dir / "home.html").read_text(encoding="utf-8")

    assert "24/7 Emergency Service" in html
    assert "Pricing" in html
    assert "Information Available" in html
    assert "Free Estimate" not in html


def test_generated_artifacts_escape_attribute_and_json_ld_breakout_payloads(
    tmp_path: Path,
):
    submission = _minimal_submission(tmp_path)
    submission.biz_name = '\"><script>alert(1)</script>'
    submission.phone = '\" onmouseover=\"alert(2)'
    submission.tagline = "</script><script>alert(3)</script>"
    submission.services = ['Leak Repair<script>alert(4)</script>']

    result = generate_site_for_submission(submission, tmp_path)
    html = (result.output_dir / "home.html").read_text(encoding="utf-8")

    assert '<script>alert(1)</script>' not in html
    assert 'onmouseover="alert(2)' not in html
    assert "</script><script>alert(3)</script>" not in html
    assert "Leak Repair<script>alert(4)</script>" not in html
    assert "\\u003c/script\\u003e\\u003cscript\\u003ealert(3)" in html
    assert "&quot; onmouseover=&quot;alert(2)" in html
