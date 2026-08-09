# LazyAI Assets Integration — NetBuild.Pro

**Date:** 2026-08-09  
**Source:** github.com/keithtortorich/LazyAI  
**Status:** ASSETS INTEGRATED

---

## Assets Integrated

### 1. Lead Scraper (`scraper/maps_scraper.py`)

**Purpose:** Generates lead lists across 9 service niches for local businesses.

**Niches Supported:**
- Water Damage Restoration ($2.5K–$15K avg ticket)
- Garage Doors ($300–$1.5K)
- Roofing ($5K–$20K)
- Fitness ($100–$200/mo)
- Beauty ($40–$150/visit)
- Dental ($500–$5K)
- Auto ($150–$2K)
- Vet & Pet ($100–$500/visit)
- Chiro & PT ($50–$200/visit)

**Usage:**
```bash
python3 scraper/maps_scraper.py --niche water,roof --city "Austin, TX" --max 20 --output leads.csv
python3 scraper/maps_scraper.py --niche all  # Defaults to 3 target cities
```

**Output:** CSV with columns: niche, name, is_franchise, avg_ticket, rating, reviews, phone, city, scraped_at

**Integration Point:** Use for tenant lead generation during onboarding or as a demo dataset for Angel's booking pipeline.

---

### 2. Website Template v2 (`template/`)

**Purpose:** Mobile-first HTML/CSS/JS template for local service businesses.

**Demo:** Lone Star Roofing (Austin, TX)

**File Structure:**
```
template/
├── index.html                 # Homepage (hero, services, proof, story, lead capture)
├── css/style.css              # Mobile-first, <40KB
├── js/main.js                 # Scroll reveal, image slider, form handling, ~9KB
├── services/                  # Service page templates
│   ├── template.html          # Blank template (copy for new services)
│   ├── roof-repair.html       # Fully filled example
│   ├── roof-replacement.html
│   ├── gutter-installation.html
│   ├── skylight-installation.html
│   ├── roof-maintenance.html
│   └── storm-damage-repair.html
└── README.md                  # Full adaptation guide
```

**Key Features:**
- ✅ Mobile-first (breakpoints: 1024px, 768px, 480px)
- ✅ <3s load time (~40KB CSS, ~9KB JS, no framework bloat)
- ✅ Click-to-call on all phone numbers (`tel:` links)
- ✅ One H1 per page (homepage + service pages)
- ✅ JSON-LD Schema (LocalBusiness + Service + FAQPage)
- ✅ Scroll reveal animations (IntersectionObserver)
- ✅ Before/after image slider
- ✅ Mobile sticky call/text bar
- ✅ FAQ accordion with schema markup
- ✅ Lead capture form (POSTs to `/api/leads`)
- ✅ Responsive nav with hamburger menu

**Current Setup:**
- Demo industry: Roofing (Lone Star Roofing, Austin)
- Only `roof-repair.html` fully filled; others use `template.html` as starter

---

## Integration with NetBuild.Pro

### Phase 1: Wire Scraper Into Angel Backend (D2)

**Goal:** Use scraper output as demo leads + tenant lead-gen tool.

**Steps:**
1. Add scraper to `webstaffr/integrations/lead_scraper.py`
2. Create endpoint `POST /api/tenants/{tenant_id}/generate-demo-leads`
3. Route scraper output → `/tenants/{tenant_id}/leads` table
4. Seed demo tenants with real-looking leads during onboarding
5. Document in `docs/LEAD_GENERATION.md`

---

### Phase 2: Replace site_renderer Output with Template (D3)

**Goal:** Swap current Jinja2 rendering for pre-built template + dynamic data injection.

**Trade-off Analysis:**
- **Current:** `site_renderer.py` templates dynamically from `site_data.py` projection
- **Template:** Static HTML + JS form handler, cleaner UX, faster shipping
- **Decision:** Use template as the default output; keep site_renderer for highly custom overrides (post-MVP)

**Implementation:**
1. Copy `template/index.html` as the new site shell for all tenants
2. Create `template_adapter.py` to inject tenant data into template slots
3. Update `site_render_router.py` to serve template instead of jinja2 output
4. Map `site_data.py` fields → template data attributes
5. Test with current demo tenants

---

### Phase 3: Service Page Generation (D2, Post-MVP)

**Goal:** Auto-generate service pages from Angel's service list.

**Steps:**
1. For each service in `tenants.services`, copy `template/services/template.html`
2. Inject service-specific copy (description, pricing, FAQs)
3. Generate `/sites/{tenant_id}/service/{service_slug}.html`
4. Link from homepage to service pages

---

## Next Steps

- [ ] **D2 Task:** Integrate scraper into `webstaffr/integrations/lead_scraper.py`, test with demo tenants
- [ ] **D2 Task:** Create `template_adapter.py`, map `site_data` fields to template slots
- [ ] **D3 Design:** Document template-swap decision in `docs/DECISIONS.md` (ADR-021)
- [ ] **D2 Task:** Update `site_render_router.py` to serve template instead of jinja2
- [ ] **D1 Task:** Add service page generation to demo tenant seeding

---

## Files Modified/Added

- ✅ `/scraper/maps_scraper.py` (copied from LazyAI)
- ✅ `/template/` (copied from LazyAI website-template-v2)
- ⏳ `webstaffr/integrations/lead_scraper.py` (to create)
- ⏳ `webstaffr/template_adapter.py` (to create)
- ⏳ `docs/DECISIONS.md` ADR-021 (to create)

---

## References

- **LazyAI Repo:** https://github.com/keithtortorich/LazyAI
- **Website Template v2:** https://github.com/keithtortorich/LazyAI/tree/main/website-template-v2
- **Lead Scraper:** https://github.com/keithtortorich/LazyAI/blob/main/scraper/maps_scraper.py
- **Site Renderer Plan:** docs/SITE_RENDERER_PLAN.md
- **Current Projection:** webstaffr/site_data.py
