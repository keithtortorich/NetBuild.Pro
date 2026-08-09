"""
Impeccable Skills Pipeline (7-Stage)
Applies strategic refinement steps in succession to transform raw tenant data 
into a high-converting, psychologically optimized website context.

Pipeline: Strategy → Copy → Design → Trust → Conversion → Authority → Retention
"""
from typing import Dict, Any, List
import logging

logger = logging.getLogger(__name__)

class ImpeccableSkill:
    """Base class for all Impeccable skills."""
    
    def __init__(self):
        self.name = "BaseSkill"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Apply the skill to the context and return the enhanced context."""
        raise NotImplementedError


class StrategySkill(ImpeccableSkill):
    """
    Skill 1: Market Positioning & Strategy
    Defines the core value proposition, target audience, and differentiators.
    """
    def __init__(self):
        self.name = "Strategy"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        business = context.get('business', {}) or context
        industry_raw = business.get('industry', 'General')
        industry_lower = industry_raw.lower()
        
        # Define strategic positioning based on industry
        if 'hvac' in industry_lower or 'heating' in industry_lower or 'cooling' in industry_lower or 'air conditioning' in industry_lower:
            strategy = {
                'angle': 'Comfort & Reliability',
                'differentiator': '24/7 Emergency Response & NATE Certified Techs',
                'tone': 'Professional, Reassuring, Urgent',
                'cta_focus': 'Immediate Service Booking'
            }
        elif 'plumb' in industry_lower:
            strategy = {
                'angle': 'Speed & Integrity',
                'differentiator': 'Upfront Pricing & No-Mess Guarantee',
                'tone': 'Direct, Honest, Efficient',
                'cta_focus': 'Fast Quote Request'
            }
        elif 'legal' in industry_lower or 'law' in industry_lower or 'attorney' in industry_lower:
            strategy = {
                'angle': 'Justice & Results',
                'differentiator': 'No Win No Fee & Decades of Courtroom Experience',
                'tone': 'Authoritative, Empathetic, Aggressive',
                'cta_focus': 'Free Case Evaluation'
            }
        else:
            strategy = {
                'angle': 'Quality & Trust',
                'differentiator': 'Local Expertise & Verified Reviews',
                'tone': 'Friendly, Professional, Reliable',
                'cta_focus': 'Contact Us Today'
            }
        
        context['strategy'] = {
            'core_angle': strategy['angle'],
            'unique_value_prop': strategy['differentiator'],
            'brand_tone': strategy['tone'],
            'primary_goal': strategy['cta_focus'],
            'target_audience': f"Homeowners and businesses in {business.get('city', 'the area')} seeking reliable {industry_raw} services."
        }
        
        logger.info(f"[Strategy] Applied angle: {strategy['angle']}")
        return context


class CopySkill(ImpeccableSkill):
    """
    Skill 2: Persuasive Copywriting
    Generates headlines, subheads, and body copy based on the strategy.
    """
    def __init__(self):
        self.name = "Copy"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        strategy = context.get('strategy', {})
        business = context.get('business', {})
        name = business.get('name', 'Our Business')
        angle = strategy.get('core_angle', 'Quality')
        uvp = strategy.get('unique_value_prop', '')
        
        context['copy'] = {
            'hero_headline': f"{angle}-Driven {business.get('industry', 'Services')} in {business.get('city', 'Your Area')}",
            'hero_subhead': f"Experience the {name} difference. {uvp}.",
            'about_headline': f"Why Local Clients Trust {name}",
            'services_headline': 'Comprehensive Solutions for Your Needs',
            'testimonials_headline': 'Don\'t Just Take Our Word For It',
            'cta_text': 'Get Your Free Quote',
            'emergency_banner': f"Need Help Now? {uvp.split('&')[0].strip()}" if 'Emergency' in uvp else None
        }
        
        logger.info(f"[Copy] Generated headline: {context['copy']['hero_headline']}")
        return context


class DesignSkill(ImpeccableSkill):
    """
    Skill 3: Psychological Design & Color Theory
    Selects color palettes and layout structures that evoke the right emotions.
    """
    def __init__(self):
        self.name = "Design"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        strategy = context.get('strategy', {})
        tone = strategy.get('brand_tone', 'Professional')
        industry = context.get('business', {}).get('industry', '').lower()
        
        palette_map = {
            'hvac': {'base_hue': 210, 'sat': 85, 'light': 55},
            'plumbing': {'base_hue': 200, 'sat': 70, 'light': 45},
            'legal': {'base_hue': 220, 'sat': 60, 'light': 35},
            'medical': {'base_hue': 160, 'sat': 60, 'light': 45},
            'default': {'base_hue': 215, 'sat': 75, 'light': 50}
        }
        
        colors = palette_map.get(industry, palette_map['default'])
        
        context['design'] = {
            'palette_config': colors,
            'layout_style': 'clean-grid' if 'Professional' in tone else 'bold-impact',
            'typography_pair': 'modern-sans' if 'Efficient' in tone else 'classic-serif',
            'visual_weight': 'high' if 'Urgent' in tone else 'balanced'
        }
        
        logger.info(f"[Design] Selected palette hue: {colors['base_hue']}")
        return context


class TrustSkill(ImpeccableSkill):
    """
    Skill 4: Dynamic Trust Signals
    Identifies and prioritizes social proof, credentials, and guarantees.
    """
    def __init__(self):
        self.name = "Trust"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        intake = context.get('intake', {})
        reviews = intake.get('reviews', [])
        licenses = intake.get('licenses', [])
        years_in_business = intake.get('years_in_business', 0)
        
        trust_signals = []
        
        if reviews and len(reviews) > 0:
            avg_rating = sum(r.get('rating', 5) for r in reviews) / len(reviews)
            trust_signals.append({
                'type': 'rating',
                'icon': '⭐',
                'text': f"{avg_rating:.1f} / 5 — {len(reviews)}+ Reviews",
                'priority': 1
            })
        
        if licenses:
            trust_signals.append({
                'type': 'credential',
                'icon': '🛡️',
                'text': f"Licensed & Insured ({', '.join(licenses[:2])})",
                'priority': 2
            })
        elif years_in_business > 5:
            trust_signals.append({
                'type': 'experience',
                'icon': '🏆',
                'text': f"Serving the Community for {years_in_business}+ Years",
                'priority': 2
            })
        
        trust_signals.append({
            'type': 'guarantee',
            'icon': '✅',
            'text': '100% Satisfaction Guaranteed',
            'priority': 3
        })
        
        trust_signals.sort(key=lambda x: x['priority'])
        
        context['trust'] = {
            'signals': trust_signals,
            'show_badge_grid': len(trust_signals) >= 2,
            'primary_proof': trust_signals[0]['text'] if trust_signals else 'Trusted Local Expert'
        }
        
        logger.info(f"[Trust] Assembled {len(trust_signals)} trust signals")
        return context


class ConversionSkill(ImpeccableSkill):
    """
    Skill 5: Conversion Optimization
    Optimizes form placement, CTA wording, and friction reduction.
    """
    def __init__(self):
        self.name = "Conversion"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        strategy = context.get('strategy', {})
        
        context['conversion'] = {
            'form_position': 'above-fold',
            'form_fields': ['name', 'phone', 'service_needed'],
            'cta_color': 'high-contrast',
            'sticky_cta': True,
            'urgency_trigger': 'Limited Availability Today' if 'Urgent' in strategy.get('brand_tone', '') else None,
            'guarantee_near_cta': True
        }
        
        logger.info("[Conversion] Optimized form and CTA placement")
        return context


class AuthoritySkill(ImpeccableSkill):
    """
    Skill 6: Authority & Thought Leadership
    Establishes credibility through published content, certifications, and industry standing.
    """
    def __init__(self):
        self.name = "Authority"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        business = context.get('business', {})
        industry = business.get('industry', '').lower()
        
        authority_map = {
            'hvac': {
                'certifications': ['NATE Certified', 'EPA 608 Certified'],
                'affiliations': ['HVAC Excellence', 'Better Business Bureau'],
                'content_topics': ['Seasonal Maintenance Tips', 'Energy Efficiency Guide', 'Emergency Response Protocol']
            },
            'plumbing': {
                'certifications': ['Master Plumber License', 'Backflow Prevention Certified'],
                'affiliations': ['Plumbing Association', 'Licensed Contractors Board'],
                'content_topics': ['Common Plumbing Issues', 'Preventive Maintenance', 'Water Conservation']
            },
            'legal': {
                'certifications': ['Bar Licensed', 'Specialization in Practice Area'],
                'affiliations': ['State Bar Association', 'Legal Specialty Boards'],
                'content_topics': ['Legal Updates', 'Case Outcomes', 'Client Rights']
            },
            'default': {
                'certifications': ['Industry Certified', 'Continuing Education'],
                'affiliations': ['Professional Association', 'Trade Board'],
                'content_topics': ['Best Practices', 'Industry News', 'Expert Tips']
            }
        }
        
        authority_data = authority_map.get(industry, authority_map['default'])
        
        context['authority'] = {
            'certifications': authority_data['certifications'],
            'affiliations': authority_data['affiliations'],
            'blog_topics': authority_data['content_topics'],
            'show_expertise_section': True,
            'content_cadence': 'monthly'
        }
        
        logger.info(f"[Authority] Set up authority signals: {', '.join(authority_data['certifications'])}")
        return context


class RetentionSkill(ImpeccableSkill):
    """
    Skill 7: Retention & Lifetime Value
    Designs customer retention mechanics: email campaigns, loyalty programs, referral incentives.
    """
    def __init__(self):
        self.name = "Retention"
    
    def apply(self, context: Dict[str, Any]) -> Dict[str, Any]:
        business = context.get('business', {})
        industry = business.get('industry', '').lower()
        
        retention_map = {
            'hvac': {
                'campaign_type': 'seasonal-maintenance-reminders',
                'email_frequency': 'quarterly',
                'loyalty_program': 'service-agreement-discount',
                'referral_incentive': '$50 credit for each referral'
            },
            'plumbing': {
                'campaign_type': 'preventive-maintenance-tips',
                'email_frequency': 'bi-monthly',
                'loyalty_program': 'annual-inspection-discount',
                'referral_incentive': '$75 credit for each referral'
            },
            'legal': {
                'campaign_type': 'legal-updates-newsletter',
                'email_frequency': 'monthly',
                'loyalty_program': 'retainer-agreement-discount',
                'referral_incentive': 'Free consultation referral fee'
            },
            'default': {
                'campaign_type': 'value-added-updates',
                'email_frequency': 'monthly',
                'loyalty_program': 'repeat-customer-discount',
                'referral_incentive': '$50 credit for each referral'
            }
        }
        
        retention_data = retention_map.get(industry, retention_map['default'])
        
        context['retention'] = {
            'email_campaigns': retention_data['campaign_type'],
            'email_frequency': retention_data['email_frequency'],
            'loyalty_program': retention_data['loyalty_program'],
            'referral_incentive': retention_data['referral_incentive'],
            'show_newsletter_signup': True,
            'estimated_ltv_increase': '35%'
        }
        
        logger.info(f"[Retention] Configured retention strategy: {retention_data['campaign_type']}")
        return context


class ImpeccablePipeline:
    """
    Executes the full chain of skills in succession.
    Order: Strategy → Copy → Design → Trust → Conversion → Authority → Retention
    """
    
    def __init__(self):
        self.skills = [
            StrategySkill(),
            CopySkill(),
            DesignSkill(),
            TrustSkill(),
            ConversionSkill(),
            AuthoritySkill(),
            RetentionSkill()
        ]
    
    def run(self, raw_context: Dict[str, Any]) -> Dict[str, Any]:
        """Run all skills in sequence, passing the enriched context forward."""
        context = raw_context.copy()
        
        logger.info("Starting Impeccable Skill Pipeline (7-stage)...")
        
        for skill in self.skills:
            try:
                context = skill.apply(context)
            except Exception as e:
                logger.error(f"Error in {skill.name} skill: {str(e)}")
        
        logger.info("Impeccable Skill Pipeline complete.")
        return context
