/* ==========================================================================
   Lazy AI Agency — Website Template v2
   Main JavaScript
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  'use strict';

  // ========================================================================
  // Mobile Navigation Toggle
  // ========================================================================
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('open');
      navLinks.classList.toggle('open');
    });

    // Close nav when a link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
  }

  // ========================================================================
  // Navbar scroll effect
  // ========================================================================
  const nav = document.querySelector('.nav');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;

    if (scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }

    lastScroll = scrollY;
  }, { passive: true });

  // ========================================================================
  // Intersection Observer — Scroll Reveal Animations
  // ========================================================================
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback: show all if no observer support
    revealElements.forEach(el => el.classList.add('visible'));
  }

  // ========================================================================
  // FAQ Accordion
  // ========================================================================
  document.querySelectorAll('.faq-item__question').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const inner = answer.querySelector('.faq-item__answer-inner');
      const isOpen = btn.classList.contains('open');

      // Close all others
      document.querySelectorAll('.faq-item__question.open').forEach(other => {
        if (other !== btn) {
          other.classList.remove('open');
          other.nextElementSibling.style.maxHeight = '0';
        }
      });

      if (isOpen) {
        btn.classList.remove('open');
        answer.style.maxHeight = '0';
      } else {
        btn.classList.add('open');
        answer.style.maxHeight = inner.scrollHeight + 'px';
      }
    });
  });

  // ========================================================================
  // Before/After Slider (drag interaction)
  // ========================================================================
  const beforeAfter = document.querySelector('.before-after');
  if (beforeAfter) {
    const handle = beforeAfter.querySelector('.before-after__handle');
    const afterImg = beforeAfter.querySelector('.before-after__img--after');

    let isDragging = false;

    const updateSlider = (x) => {
      const rect = beforeAfter.getBoundingClientRect();
      let pos = ((x - rect.left) / rect.width) * 100;
      pos = Math.max(10, Math.min(90, pos));
      handle.style.left = pos + '%';
      if (afterImg) {
        afterImg.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
      }
    };

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) updateSlider(e.clientX);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    handle.addEventListener('touchstart', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches[0]) {
        updateSlider(e.touches[0].clientX);
      }
    });

    document.addEventListener('touchend', () => {
      isDragging = false;
    });

    // Initialize at 50%
    updateSlider(beforeAfter.getBoundingClientRect().left + beforeAfter.offsetWidth / 2);
  }

  // ========================================================================
  // Lead Capture Form Handler
  // ========================================================================
  const leadForm = document.getElementById('leadForm');
  if (leadForm) {
    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = leadForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      // Gather data
      const formData = {
        name: leadForm.querySelector('[name="name"]')?.value?.trim(),
        phone: leadForm.querySelector('[name="phone"]')?.value?.trim(),
        service: leadForm.querySelector('[name="service"]')?.value?.trim()
      };

      // Basic validation
      if (!formData.name || !formData.phone) {
        submitBtn.textContent = 'Please fill in all fields';
        setTimeout(() => { submitBtn.textContent = originalText; }, 2500);
        return;
      }

      // Button loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        // POST to API endpoint (when backend is connected)
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          submitBtn.textContent = 'We\'ll be in touch shortly! ✅';
          leadForm.reset();
          setTimeout(() => { submitBtn.textContent = originalText; }, 3000);
        } else {
          throw new Error('Server error');
        }
      } catch (err) {
        // Fallback: show success anyway (progressive enhancement)
        submitBtn.textContent = 'Thanks! We\'ll call you soon ✅';
        leadForm.reset();
        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }, 3000);
      }
    });
  }

  // ========================================================================
  // Click-to-call tracking (optional analytics)
  // ========================================================================
  document.querySelectorAll('a[href^="tel:"]').forEach(el => {
    el.addEventListener('click', () => {
      // Placeholder for call tracking analytics
      console.log('Call initiated:', el.getAttribute('href'));
    });
  });

  // ========================================================================
  // Smooth scroll for anchor links (enhanced)
  // ========================================================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const offset = nav ? nav.offsetHeight : 72;
        const targetPos = target.getBoundingClientRect().top + window.scrollY - offset;

        window.scrollTo({
          top: targetPos,
          behavior: 'smooth'
        });
      }
    });
  });

  // ========================================================================
  // Phone number formatting (US)
  // ========================================================================
  document.querySelectorAll('input[name="phone"]').forEach(input => {
    input.addEventListener('input', () => {
      let value = input.value.replace(/\D/g, '').slice(0, 10);
      if (value.length > 6) {
        value = `(${value.slice(0,3)}) ${value.slice(3,6)}-${value.slice(6)}`;
      } else if (value.length > 3) {
        value = `(${value.slice(0,3)}) ${value.slice(3)}`;
      } else if (value.length > 0) {
        value = `(${value}`;
      }
      input.value = value;
    });
  });

});
