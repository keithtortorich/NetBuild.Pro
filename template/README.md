# Lazy AI Agency — Local Service Website Template v2

A mobile-first, SEO-optimized HTML/CSS/JS website template built for local service businesses (roofing, HVAC, plumbing, dental, salons, auto shops, real estate, etc.).

Demo industry: **Lone Star Roofing** (Austin, TX)

---

## 🚀 Quick Start

### Option 1: Static File Server (Python)

```bash
cd website-template-v2
python3 -m http.server 3000
```

### Option 2: Node.js (any static server)

```bash
npx serve . -p 3000
```

### Option 3: Nginx (production)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/website-template-v2;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

---

## 📁 File Structure

```
website-template-v2/
├── index.html                  # Homepage (all 9 sections)
├── css/
│   └── style.css               # All styles, mobile-first
├── js/
│   └── main.js                 # Interactivity, forms, sliders, animations
├── images/
│   ├── hero-placeholder.webp           # Hero background image
│   ├── hero-video-placeholder.mp4      # Hero background video (optional)
│   ├── team-placeholder.webp           # Team/owner photo
│   ├── roof-before-placeholder.webp    # Before image for slider
│   ├── roof-after-placeholder.webp     # After image for slider
│   └── favicon.svg                     # SVG favicon
├── services/
│   ├── template.html                   # Service page template (use this to create new services)
│   ├── roof-repair.html
│   ├── roof-replacement.html
│   ├── gutter-installation.html
│   ├── skylight-installation.html
│   ├── roof-maintenance.html
│   └── storm-damage-repair.html
└── README.md
```

---

## 🎨 Adapting for a Different Business

### 1. Replace Brand Info

Edit `index.html`:
- **Title tags** (`<title>`) — change business name, city, service
- **Meta description** — change description
- **NAP (Name, Address, Phone)** — update throughout
- **Logo** — change the `LS` logo icon text in the nav
- **JSON-LD schema** — update all `LocalBusiness` fields

### 2. Replace Content Per Section

| Section | What To Change |
|---------|---------------|
| **Hero** | Headline, subtitle, phone number, background image/video |
| **Trust Bar** | Statistics, certifications, years in business |
| **Services** | Card titles, descriptions, links to new service pages |
| **Why Us** | Differentiators tailored to the business |
| **Proof** | Real customer reviews, before/after images |
| **Story** | Owner name/photo, origin story text |
| **Local** | Google Maps embed URL, neighborhood list |
| **Lead Capture** | Incentive text ("Free estimate", "10% off", etc.) |
| **Footer** | Address, phone, email, social links, license numbers |

### 3. Create Service Pages

Copy `services/template.html` for each service and:
1. Change the `serviceName`, `serviceSlug`, `city`, `brand` at the top
2. Update the hero title and subtitle
3. Customize the body content (problem headline, what's included, process)
4. Replace the pricing signal
5. Update the 5 FAQs
6. Update the sidebar content
7. Update JSON-LD schemas

Only the roof-repair.html is fully filled in as an example. For other services, start from template.html and customize.

---

## ⚡ Technical Specs

| Requirement | Status |
|-------------|--------|
| **Mobile-first** | ✅ All breakpoints at 1024px, 768px, 480px |
| **Load under 3s** | ✅ ~40KB CSS, ~9KB JS, no framework bloat |
| **Click-to-call** | ✅ Every phone number is a `tel:` link |
| **One H1/page** | ✅ H1 on index, H1 on each service page |
| **SEO titles** | ✅ `[Service] in [City] \| [Brand]` |
| **JSON-LD Schema** | ✅ `LocalBusiness` on homepage, `Service` + `FAQPage` on service pages |
| **NAP matches GBP** | ✅ Address, phone in schema matches footer display text |
| **SSL-ready** | ✅ All relative URLs, no mixed content |
| **WebP placeholders** | ✅ All images reference `.webp` for modern format |
| **Schema markup** | ✅ LocalBusiness + Service + FAQPage (rich results eligible) |
| **Accessibility** | ✅ Skip link, ARIA labels, semantic HTML, proper heading hierarchy |

---

## 🧩 Features

- **Scroll reveal animations** — Elements fade in as you scroll (with IntersectionObserver)
- **Before/After image slider** — Drag to compare visuals
- **Mobile sticky bar** — Fixed call/text buttons at the bottom on phones
- **FAQ accordion** — Expandable questions with Schema.org FAQ markup
- **Phone formatting** — Auto-formats US phone numbers on input
- **Lead capture form** — 3-field form with API-ready POST handler (falls back gracefully if backend isn't connected)
- **Responsive nav** — Hamburger menu on mobile, full nav on desktop
- **Nav scroll effect** — Subtle shadow on scroll

---

## 🔌 API Integration

The lead capture form POSTs to `/api/leads` with JSON:

```json
{
  "name": "Jane Smith",
  "phone": "(512) 555-1234",
  "service": "roof-repair"
}
```

Expected response: `200 OK` or `201 Created`.

For backend integration, see the backend team's API documentation.

---

## 📐 Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#1a56db` | Buttons, links, accents |
| `--color-accent` | `#f59e0b` | CTA buttons, highlights |
| `--color-text` | `#1f2937` | Body text |
| `--color-bg-alt` | `#f9fafb` | Alternate section backgrounds |

### Font
**Inter** — system font stack fallback (loaded from Google Fonts).

### Container
Max-width: `1200px` with `1.25rem` padding on mobile.

---

## 📄 License

This template is proprietary to Lazy AI Agency and is provided to clients as part of their website package.