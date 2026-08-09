# Intake Structure & Dashboard Improvements

**Date:** 2026-08-07  
**Status:** ✅ Implemented

## Summary

Streamlined the intake form structure and enhanced dashboard capabilities to provide better UX for business owners and clearer visibility into onboarding progress.

## Changes Made

### 1. Intake Structure (`webstaffr/intake.py`)

#### Added Section Definitions
Introduced `INTAKE_SECTIONS` constant that organizes all intake fields into 9 logical sections with metadata for dashboard rendering:

```python
INTAKE_SECTIONS = [
    {"id": "business_basics", "title": "Business Basics", "icon": "building", ...},
    {"id": "web_presence", "title": "Current Web Presence", "icon": "globe", ...},
    {"id": "brand", "title": "Brand Identity", "icon": "palette", ...},
    {"id": "positioning", "title": "Positioning", "icon": "target", ...},
    {"id": "services", "title": "Services & Licensing", "icon": "wrench", ...},
    {"id": "proof", "title": "Proof & Credibility", "icon": "star", ...},
    {"id": "social_tools", "title": "Social & Tools", "icon": "share", ...},
    {"id": "workforce", "title": "Workforce Plan", "icon": "users", ...},
    {"id": "content_seo", "title": "Content & SEO", "icon": "search", ...},
]
```

Each section includes:
- **id**: Machine-readable identifier
- **title**: Human-readable display name
- **icon**: UI icon reference (for frontend rendering)
- **fields**: List of field names belonging to this section

#### Added Dashboard Summary Method
`IntakeRepository.get_dashboard_summary()` computes:
- Overall completion percentage (based on optional fields filled)
- Per-section completion metrics (completed/total/percentage)
- Business info snapshot (name, industry, plan)

#### Export Function
`get_intake_sections()` - allows frontend to dynamically render form structure without hardcoding.

### 2. Dashboard Endpoints (`webstaffr/attribution_router.py`)

#### New Endpoint: `GET /tenants/{tenant_id}/dashboard`
Comprehensive dashboard data combining:
- **Business Info**: Name, industry, plan
- **Intake Completion**: Overall % + per-section breakdown
- **Performance Metrics**: Calls received/completed, appointments booked, estimated value
- **Tracking**: Assigned tracking number
- **Recent Activity**: Last 10 call events

**Response Shape:**
```json
{
  "tenant_id": "...",
  "business_info": {
    "biz_name": "...",
    "industry": "...",
    "plan": "..."
  },
  "intake_completion": {
    "overall_percentage": 42,
    "sections": {
      "business_basics": {"title": "...", "completed": 5, "total": 7, "percentage": 71},
      ...
    },
    "has_required_data": true
  },
  "performance_metrics": {
    "calls_received": 12,
    "calls_completed": 10,
    "appointments_booked": 3,
    "estimated_value_usd": 750.00
  },
  "tracking": {
    "tracking_number": "trk_..."
  },
  "recent_activity": [...]
}
```

#### New Endpoint: `GET /intake/sections`
Returns the canonical section definitions for dynamic form rendering:

```json
{
  "sections": [
    {"id": "business_basics", "title": "Business Basics", "icon": "building", "fields": [...]},
    ...
  ]
}
```

## Benefits

### For Business Owners
- **Clear Progress Tracking**: See exactly which sections are complete and what's remaining
- **Unified View**: Intake progress + call performance in one dashboard
- **Actionable Insights**: Low-completion sections highlight areas needing attention

### For Frontend Developers
- **Dynamic Rendering**: No hardcoded form structure - fetch from API
- **Consistent Metadata**: Icons, titles, field lists all from one source
- **Progress Calculation**: Backend handles completion logic, frontend just displays

### For Operations
- **Onboarding Visibility**: Quickly identify tenants stuck at specific sections
- **Data Quality**: Completion metrics help prioritize outreach for profile completion
- **ROI Tracking**: Estimated value from appointments booked shown alongside intake status

## Testing

✅ All endpoints tested successfully:
- `POST /intake` - submission works
- `GET /tenants/{tenant_id}/dashboard` - returns comprehensive data
- `GET /intake/sections` - returns 9 sections with metadata
- Section completion calculation accurate (tested with partial data: 6% completion)

## Next Steps (Optional Enhancements)

1. **Email Triggers**: Send reminders when sections are incomplete after X days
2. **Gamification**: Show badges/milestones for section completion
3. **Admin Dashboard**: Aggregate view across all tenants for ops team
4. **Trend Charts**: Track completion velocity over time per tenant
5. **Section Dependencies**: Unlock certain sections only after prerequisites completed

## Files Modified

- `webstaffr/intake.py`: Added `INTAKE_SECTIONS`, `get_intake_sections()`, `IntakeRepository.get_dashboard_summary()`
- `webstaffr/attribution_router.py`: Added `/tenants/{tenant_id}/dashboard` and `/intake/sections` endpoints

## Backward Compatibility

✅ All existing endpoints unchanged
✅ Existing intake submissions work with new dashboard logic
✅ New endpoints are additive - no breaking changes
