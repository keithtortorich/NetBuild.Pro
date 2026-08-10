# WebStaffr 4.0 — 10 Demo Website Templates

**Deployment Status:** Complete  
**Last Updated:** 2026-07-27  
**Angel Widget:** Integrated in all 10 templates

---

## Template Inventory

### Top 3 Priority Trades

| Trade | Filename | Location | Primary Color | Font Pairing | Hero Hook |
|-------|----------|----------|---|---|---|
| **1. HVAC** | `01-hvac-desert-cooling.html` | Phoenix, AZ | Ice Blue (#4FC3F7) | Montserrat + Inter | "Keeping Phoenix Cool" |
| **2. Plumbing** | `02-plumbing-rivera.html` | Portland, OR | Gold (#E8A838) | Roboto Condensed + Inter | "When You Need A Plumber Fast" |
| **3. Electrical** | `03-electrical-kim.html` | Portland, OR | Amber (#F39C12) | Exo + Inter | "Powering Homes & Businesses" |

### Trades 4–6

| Trade | Filename | Location | Primary Color | Font Pairing | Hero Hook |
|-------|----------|----------|---|---|---|
| **4. Roofing** | `04-roofing-gulf-coast.html` | Tampa, FL | Storm Blue (#5B8CBF) | Oswald + Inter | "Storm Damage? We Respond Fast" |
| **5. Water Damage** | `05-water-damage-rapiddry.html` | Portland, OR | Orange (#E86A2C) | Inter (bold) | "Water Damage? We Respond Fast" |
| **6. Garage Door** | `06-garage-door-premier.html` | Portland, OR | Red (#E63946) | Inter (bold) | "Garage Door Fixed Fast" |

### Trades 7–10

| Trade | Filename | Location | Primary Color | Font Pairing | Hero Hook |
|-------|----------|----------|---|---|---|
| **7. Pest Control** | `07-pest-shield.html` | Portland, OR | Green (#4CAF50) | Inter (bold) | "Pest Free. Peace of Mind." |
| **8. Landscaping** | `08-landscape-evergreen.html` | Portland, OR | Forest Green (#2E7D32) | Inter (bold) | "Your Outdoor Sanctuary" |
| **9. Tree Service** | `09-tree-northwest.html` | Portland, OR | Deep Brown (#6D4C2A) | Inter (bold) | "Tree Care You Can Trust" |
| **10. Cleaning** | `10-cleaning-sparkle.html` | Portland, OR | Sky Blue (#4A90D9) | Inter (bold) | "A Clean Home. Peace of Mind." |

---

## Site Structure (Per Template)

Each template includes:

- **Emergency Banner** — 24/7 call-to-action (emergency services only)
- **Navigation** — Logo, quick links, CTA button
- **Hero Section** — Headline, 3 hero features, 3 stats, 2 CTAs
- **Trust Bar** — 4 trust metrics (reviews, licenses, service promise, etc.)
- **3 Reasons Grid** — Value propositions with icons
- **Reviews Section** — 2 customer testimonials with stars
- **Founder Story** — Narrative + initials placeholder + license/credentials
- **Service Area** — Location info + city list + CTA
- **Lead Capture Form** — 3-field form (name, phone, context)
- **Angel AI Widget** — Fixed bottom-right badge (✦)
- **Footer** — Company info, quick links, contact
- **SEO Metadata** — Title, meta description, Open Graph ready

---

## Design System

**Dark Theme Default** (Electrical, Plumbing, Roofing, Water Damage, Garage Door, Pest, Tree)
- `--bg`: Deep (dark navy/grey/black)
- `--bg-surface`: Lighter surface layer
- `--primary`: Brand accent color (see table)
- `--text`: Off-white (#F0F2F5)
- Shadow: 0 8px 30px rgba(0,0,0,0.3-0.4)

**Light Theme** (Cleaning Services only)
- `--bg`: Light blue-gray (#F0F5FA)
- `--bg-surface`: White
- `--primary`: Sky Blue (#4A90D9)
- `--text`: Dark navy (#1A2A3A)
- Shadow: 0 8px 30px rgba(0,0,0,0.06)

---

## Integration Checklist

- [ ] Copy all 10 templates to `/demo-templates/` directory
- [ ] Test Angel widget on each site (click badge → alert fires)
- [ ] Verify responsive mobile layout (< 768px)
- [ ] Check form submit handling (should show success alert)
- [ ] Validate SEO metadata presence (title, meta description)
- [ ] Review accent colors per trade (see Primary Color column)
- [ ] Confirm founder initials placeholders (ready for photos)
- [ ] Test all CTA buttons (lead capture, emergency, secondary)
- [ ] Validate phone numbers match location (not hardcoded conflicts)

---

## Next Steps for Site Generation

1. **Site Renderer Integration** — Jinja2 templates render via site_renderer.py
2. **Brand Customization** — Override company names, phone numbers, locations per customer
3. **Image Placeholders** — Replace emoji placeholders with real photos (hero image, founder)
4. **Lead Form Integration** — Wire form to customer's CRM (e.g., GHL, Stripe, Zapier)
5. **Angel Widget Configuration** — Test live widget embedding and message routing
6. **Domain & Deployment** — Deploy via Vercel + custom domain per tenant

---

## File Locations

All templates saved to:  
`/Users/doc/Desktop/WebStaffr4/demo-templates/`

Filename convention:  
`##-[trade]-[company-name].html`

Example:  
`01-hvac-desert-cooling.html`

---

## Brand Governance Notes

- **Never "AI"** in customer-facing copy (use "Angel" for widget, omit elsewhere)
- **Company Name:** WebStaffr (capital W, capital S) — never "WebStaff"
- **No Emojis** in production sites (placeholders only, swap for real images)
- **Em-dash Ban:** Use — sparingly; default to double-hyphen (--) per Governance Manual
- **License Numbers:** Placeholder format #XX-12345 (replace with real state credentials)
- **Phone Numbers:** Unique per location (not shared across trades)

---

## Angel Widget Implementation

Each template includes:

```html
<div class="angel-badge" onclick="alert('Hi! This is Angel, the AI receptionist at [Company Name]. How can I help you today?')">✦</div>
```

**Styling:**
- Position: Fixed bottom-right (28px from edges)
- Size: 64x64px, circular
- Color: Primary accent (per trade)
- Animation: Hover scale 1.06

**Production Upgrade:**
Replace `onclick` alert with actual Retell live-call widget embed.

---

## Accessibility & Performance

- **WCAG 2.1 AA Ready** — High contrast, readable fonts, semantic HTML
- **Mobile Responsive** — CSS Grid + media queries (< 768px)
- **Font Optimization** — Google Fonts (preconnect, async load)
- **Form Accessibility** — Labels, required attributes, focus states
- **CTA Color Contrast** — Meets AA standards per trade palette

---

## Customization Quick Reference

**To adapt for a new customer:**

1. Replace company name (`.logo span`)
2. Change primary color (CSS `--primary` variable)
3. Update phone number (emergency banner + footer)
4. Update service area cities (location section)
5. Update founder initials + name (story section)
6. Update license number (footer + story)
7. Replace emoji hero image with real photo
8. Wire form submission to customer's backend

All changes are non-destructive and template-portable.

---

**Ready for site generation and customer integration.**
