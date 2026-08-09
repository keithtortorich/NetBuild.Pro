"""NetBuild.Pro public landing page and investor resources.

Serves the landing page at GET /, demo site previews, and the full
business plan PDF for investors.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from .db import DB_ERRORS, get_connection

landing_router = APIRouter(tags=["public"])
logger = logging.getLogger("webstaffr.landing_router")
_INTAKE_PAGE = Path(__file__).parent / "templates" / "intake_start.html"
_NETBUILD_PAGE = Path(__file__).parent / "templates" / "netbuild_pro.html"
_NETBUILD_DEMOS = Path(__file__).parent / "templates" / "netbuild_demos"

# Single source of truth for the public contact details. These appear in the
# investor JSON, the investor modal, and the lead-capture form, and previously
# drifted apart across all three.
#
# Confirmed by the founder 2026-07-28: mail goes to his Gmail, not to a mailbox
# on either webstaff.com or webstaffr.com. The stale keith@webstaff.com address
# that used to be here never resolved the domain-spelling conflict between
# LINK_MANIFEST.md ("webstaffr.com") and POST_DEPLOY_VERIFICATION.md
# ("webstaff.com"); that conflict still needs settling for the site URLs, but it
# no longer affects where mail lands. See TASKS.md Pending.
_CONTACT_EMAIL = "keithtortorich@gmail.com"
_CONTACT_PHONE = "(888) 302-8368"
_CONTACT_PHONE_TEL = "+18883028368"

# Small inline SVG icon set for the landing page -- same rationale as the
# customer-site renderer's icon set (webstaffr/templates/site/_icons.html):
# replaces plain-text bullets/numbering with real iconography, no external
# icon-library dependency, no build step. Defined as plain Python string
# constants here (rather than Jinja macros) because this page is a single
# inline-HTML string, not a Jinja template -- same visual language, native
# to this file's own architecture.
_ICON_CHECK = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<polyline points="20 6 9 17 4 12"/></svg>'
)
_ICON_X = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
)
_ICON_PHONE = (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 '
    '19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 '
    '2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 '
    '2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
)
_ICON_ARROW = (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
)


@landing_router.get("/demo-sites/{file_name}", response_class=None)
async def netbuild_demo(file_name: str):
    """Serve an embedded NetBuild.Pro trade demo site (Desert Cooling, etc.).

    Explicit route (not a StaticFiles mount) to match the repo's
    dependency-minimal convention used for /static/site.css -- no aiofiles,
    no directory-traversal surface. Path is /demo-sites to avoid colliding
    with the /demos/{trade} provisioned-tenant redirect route.
    """
    from fastapi.responses import HTMLResponse

    candidate = (_NETBUILD_DEMOS / file_name).resolve()
    # Contain the path inside the demos directory.
    if not str(candidate).startswith(str(_NETBUILD_DEMOS.resolve())):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    if not candidate.is_file():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    return HTMLResponse(content=candidate.read_text())


@landing_router.get("/", response_class=None)
async def landing_page():
    """Serve the NetBuild.Pro public landing page (animated, Angel embedded)."""
    from fastapi.responses import HTMLResponse

    return HTMLResponse(content=_NETBUILD_PAGE.read_text())


@landing_router.get("/start", response_class=None)
async def intake_page():
    """Serve the one-page, tradesman-facing setup form."""
    from fastapi.responses import HTMLResponse

    return HTMLResponse(content=_INTAKE_PAGE.read_text())


def _render_landing_page() -> str:
    """Substitute contact details into the landing page template.

    Plain token replacement rather than an f-string: the template is mostly
    CSS and JavaScript, so every brace in it would have to be doubled to make
    f-string interpolation safe. Tokens keep the markup readable and keep the
    contact details defined in exactly one place.
    """
    return (
        _LANDING_PAGE_HTML
        .replace("__CONTACT_EMAIL__", _CONTACT_EMAIL)
        .replace("__CONTACT_PHONE_TEL__", _CONTACT_PHONE_TEL)
        .replace("__CONTACT_PHONE__", _CONTACT_PHONE)
        .replace("__ICON_CHECK__", _ICON_CHECK)
        .replace("__ICON_X__", _ICON_X)
        .replace("__ICON_PHONE__", _ICON_PHONE)
        .replace("__ICON_ARROW__", _ICON_ARROW)
    )


@landing_router.get("/investors/pitch")
@landing_router.get("/investors/pitch.pdf")
async def investor_pitch():
    """Serve the full business plan PDF (when available)."""
    from fastapi.responses import FileResponse, JSONResponse
    import os

    pdf_path = os.path.join(os.path.dirname(__file__), "investor_pitch.pdf")
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path, media_type="application/pdf", filename="NetBuildPro_Pitch.pdf")

    # Fallback: return investor summary from INVESTOR_EMAIL_FINAL.md
    return JSONResponse({
        "message": "NetBuild.Pro Investment Overview",
        "narrative": "You don't need more leads. You need to stop losing the ones you already have.",
        "problem": "Home-service contractors need a reliable way to capture incoming demand while they are working.",
        "solution": "NetBuild.Pro builds the customer site first, then activates call handling, CRM routing, and booking after each approved integration is verified.",
        "pricing": {"office_staff_monthly": 497},
        "ask": "$15K-50K SAFE",
        "contact": {
            "email": _CONTACT_EMAIL,
            "phone": _CONTACT_PHONE
        },
        "pdf": "Full PDF available at deployment. Email for early access."
    })


@landing_router.get("/demos/{trade}")
async def demo_redirect(trade: str, request: Request):
    """Redirect only to a demo tenant that is actually provisioned."""
    from fastapi.responses import RedirectResponse

    tenant_id = f"demo-{trade.lower()}"
    try:
        conn = get_connection(request.app.state.db_path)
        try:
            exists = conn.execute(
                "SELECT 1 FROM tenants WHERE tenant_id = ?",
                (tenant_id,),
            ).fetchone()
        finally:
            conn.close()
    except DB_ERRORS as exc:
        logger.error("demo_lookup_failed error_type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Demo lookup unavailable") from exc

    if not exists:
        raise HTTPException(status_code=404, detail="Demo not found")
    return RedirectResponse(url=f"/sites/{tenant_id}/web", status_code=302)


# Approved copy from WEBSTAFFR_AGENCY_SITE_COPY_HORMOZI_VOSS.md - replace with Hormozi-Voss methodology
# Hook: "You left money on the table this week"
# Subhead: "WebStaffr answers your phone so you don't lose jobs you already paid to generate"
# Math: $16,000/month narrative (Voss quantifiable pain formula)
# Structure: 3 steps, zero risk (Hormozi-Voss sales formula)
# Pricing: Office Staff $497 for the initial launch
# Colors: royal blue, navy, electric orange, light gray bg
_LANDING_PAGE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>NetBuild.Pro | Receptionist for Home Services</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
        header { background: linear-gradient(135deg, #4169E1 0%, #1f2937 100%); color: white; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; sticky: top; z-index: 100; }
        header h1 { font-size: 1.3rem; font-weight: 700; }
        header a { color: #FF6600; text-decoration: none; font-weight: 600; }
        .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }
        h2 { font-size: 2.2rem; margin-bottom: 20px; color: #1f2937; }
        h3 { font-size: 1.5rem; margin-bottom: 16px; color: #1f2937; }
        p { margin-bottom: 16px; color: #4b5563; font-size: 1.05rem; }
        .hook { background: #FF6600; color: white; padding: 40px; text-align: center; margin-bottom: 40px; border-radius: 8px; }
        .hook h2 { color: white; font-size: 2.8rem; margin: 0; }
        .subhead { font-size: 1.3rem; color: white; margin-top: 16px; }
        .math-box { background: white; border-left: 4px solid #FF6600; padding: 24px; margin-bottom: 40px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .math-box strong { color: #FF6600; }
        .pricing { background: white; padding: 40px; border-radius: 8px; margin-bottom: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 24px; }
        .pricing-card { background: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 6px; text-align: center; }
        .pricing-card.featured { background: #1f2937; color: white; border-color: #FF6600; }
        .pricing-card.featured h4 { color: #FF6600; }
        .price { font-size: 2rem; font-weight: 700; margin: 12px 0; }
        .faq { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .faq-item { margin-bottom: 24px; }
        .faq-question { font-weight: 600; color: #1f2937; margin-bottom: 8px; }
        .faq-answer { color: #4b5563; }
        .cta-section { background: linear-gradient(135deg, #4169E1 0%, #1f2937 100%); color: white; padding: 40px; border-radius: 8px; text-align: center; margin-bottom: 40px; }
        .cta-section h3 { color: white; }
        button { background: #FF6600; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 1rem; }
        button:hover { background: #e55c00; }
        .demo-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 24px; }
        .demo-link { background: white; border: 1px solid #e5e7eb; padding: 16px; border-radius: 6px; text-decoration: none; color: #1f2937; text-align: center; transition: all 0.2s; }
        .demo-link:hover { border-color: #FF6600; transform: translateY(-2px); }
        .no-ai { font-size: 0.9rem; color: #6b7280; font-style: italic; margin-top: 16px; }

        /* Motion: entrance reveals + micro-interactions (Emil Kowalski rules:
           scale from 0.95 not 0, purpose-driven timing, respects reduced-motion) */
        .reveal { opacity: 0; transform: translateY(16px) scale(0.98);
            transition: opacity 480ms cubic-bezier(0.23,1,0.32,1), transform 480ms cubic-bezier(0.23,1,0.32,1); }
        .reveal.is-visible { opacity: 1; transform: translateY(0) scale(1); }
        header { animation: fadeInDown 420ms cubic-bezier(0.23,1,0.32,1) both; }
        .hook h2 { animation: fadeInUp 560ms cubic-bezier(0.23,1,0.32,1) 80ms both; }
        .hook .subhead { animation: fadeInUp 560ms cubic-bezier(0.23,1,0.32,1) 180ms both; }
        @keyframes fadeInDown { from { opacity:0; transform:translateY(-12px);} to { opacity:1; transform:translateY(0);} }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(18px);} to { opacity:1; transform:translateY(0);} }
        .pricing-card { transition: transform 200ms cubic-bezier(0.23,1,0.32,1), box-shadow 200ms cubic-bezier(0.23,1,0.32,1); }
        .pricing-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
        button, .start-link { transition: transform 140ms cubic-bezier(0.23,1,0.32,1), background 140ms ease; }
        button:active, .start-link:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
            .reveal, header, .hook h2, .hook .subhead { animation:none!important; transition:none!important; opacity:1!important; transform:none!important; }
            .pricing-card:hover, .demo-link:hover, button:active, .start-link:active { transform:none!important; }
        }
    </style>
</head>
<body>
    <header>
        <h1>NetBuild.Pro</h1>
        <a href="tel:__CONTACT_PHONE_TEL__">__CONTACT_PHONE__</a>
    </header>

    <div class="hook">
        <h2>Turn more incoming calls into booked work.</h2>
        <p class="subhead">NetBuild.Pro gives home-service businesses a customer-ready site and an integrated receptionist workflow.</p>
    </div>

    <div class="container">
        <div class="math-box reveal">
            <h3>What NetBuild.Pro Sets Up</h3>
            <p><strong>Your customer site:</strong> services, service area, contact details, and Angel chat built from the business information you provide.</p>
            <p><strong>Your receptionist workflow:</strong> call handling, lead routing, and booking are activated after your approved phone, calendar, GHL, and Retell integrations are configured and verified.</p>
            <p>Your site can go live first. Voice and CRM automation are not represented as active until their integrations pass an end-to-end check.</p>
        </div>

        <div class="pricing reveal">
            <h3>Pick Your Plan</h3>
            <p>Choose the service level that matches the work you want NetBuild.Pro to manage.</p>
            <div class="pricing-grid">
                <div class="pricing-card featured">
                    <h4>Essentials</h4>
                    <div class="price">$497</div>
                    <p style="font-size: 0.9rem;">/month. Most popular.</p>
                    <a href="/start" class="start-link" style="display:block; background:#FF6600; color:white; width:100%; margin-top:12px; padding:12px 24px; border-radius:6px; font-weight:600; text-decoration:none;">Start Setup</a>
                </div>
                <div class="pricing-card">
                    <h4>Pro</h4>
                    <div class="price">$2,497</div>
                    <p style="font-size: 0.9rem;">/month. Full front office.</p>
                </div>
                <div class="pricing-card">
                    <h4>Growth</h4>
                    <p style="color: #FF6600;">Custom pricing</p>
                    <p style="font-size: 0.9rem;">Enterprise support</p>
                </div>
            </div>
        </div>

        <div class="faq reveal">
            <h3>Common Questions</h3>
            <div class="faq-item">
                <div class="faq-question">What is included at setup?</div>
                <div class="faq-answer">We collect your business details, generate your customer site, and prepare the integration checklist for the receptionist workflow.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">When does call handling become active?</div>
                <div class="faq-answer">After the approved phone, Retell, calendar, and CRM configuration passes a controlled end-to-end verification.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">Can the site launch before the voice workflow?</div>
                <div class="faq-answer">Yes. Site generation and voice activation are verified separately, so neither is represented as live before it is ready.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">How does booking work?</div>
                <div class="faq-answer">Booking uses your approved calendar and GHL configuration. The workflow is activated only after a test appointment is created, observed, and safely removed or retained as agreed.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">Does it need my sales process?</div>
                <div class="faq-answer">Yes. We import your intake questions, your pricing, your objection responses. It sounds like your team.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">What if an integration is not ready?</div>
                <div class="faq-answer">It stays disabled while the site and other verified parts continue to operate.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">Who controls the business information?</div>
                <div class="faq-answer">You provide the services, service area, credentials, pricing signals, and escalation rules. NetBuild.Pro does not invent them.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">How are failures handled?</div>
                <div class="faq-answer">Each integration has a readiness check and rollback procedure. A failed external sync must not erase the local customer record.</div>
            </div>
            <div class="faq-item">
                <div class="faq-question">What's next?</div>
                <div class="faq-answer">Complete the setup form. We will use the submitted business information to generate your site and identify the remaining activation steps.</div>
            </div>
        </div>

        <div class="cta-section reveal">
            <h3>Build Your Customer Site</h3>
            <p>Start with verified business information. Activate voice and CRM automation after their integrations are ready.</p>
            <a href="/start" class="start-link" style="display:inline-block; background:#FF6600; color:white; font-size:1.1rem; padding:14px 28px; margin-top:16px; border-radius:6px; font-weight:600; text-decoration:none;">Start Setup</a>
            <p style="margin-top: 16px; font-size: 0.95rem;">Questions? Call <a href="tel:__CONTACT_PHONE_TEL__" style="color: #FF6600; text-decoration: none;">__CONTACT_PHONE__</a> or email __CONTACT_EMAIL__</p>
        </div>
    </div>
    <script>
        // Scroll-reveal for .reveal sections. No-op (all visible) if IntersectionObserver
        // is unavailable or the user prefers reduced motion.
        (function () {
            var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var targets = document.querySelectorAll('.reveal');
            if (prefersReduced || !('IntersectionObserver' in window)) {
                targets.forEach(function (el) { el.classList.add('is-visible'); });
                return;
            }
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        io.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
            targets.forEach(function (el) { io.observe(el); });
        })();
    </script>
</body>
</html>
"""
