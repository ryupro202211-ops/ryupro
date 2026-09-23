(() => {
  'use strict';

  const page = document.querySelector('.corporate-site');
  if (!page || typeof Element.prototype.animate !== 'function' || !('IntersectionObserver' in window)) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileLayout = window.matchMedia('(max-width: 640px)');
  const activeAnimations = new Set();
  const activeObservers = new Set();
  const easing = 'cubic-bezier(.22, .61, .36, 1)';

  const canAnimate = () => !reducedMotion.matches && document.visibilityState === 'visible';

  const animate = (element, keyframes, options, onSettle = () => {}) => {
    if (!canAnimate()) {
      onSettle();
      return null;
    }

    let animation;
    try {
      animation = element.animate(keyframes, { fill: 'none', ...options });
    } catch {
      onSettle();
      return null;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      activeAnimations.delete(animation);
      onSettle();
    };

    activeAnimations.add(animation);
    animation.onfinish = settle;
    animation.oncancel = settle;
    return animation;
  };

  const observeOnce = (elements, onEnter, options = {}) => {
    const pending = new Set(elements.filter((element) => {
      const bounds = element.getBoundingClientRect();
      return element.isConnected && bounds.top >= window.innerHeight * .82;
    }));
    if (!pending.size) return;

    const observer = new IntersectionObserver((entries) => {
      const entered = entries
        .filter((entry) => entry.isIntersecting && pending.has(entry.target))
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

      entered.forEach((entry, index) => {
        pending.delete(entry.target);
        observer.unobserve(entry.target);
        onEnter(entry.target, index, entered.length);
      });

      if (!pending.size) {
        observer.disconnect();
        activeObservers.delete(observer);
      }
    }, { threshold: .16, rootMargin: '0px 0px -8% 0px', ...options });

    pending.forEach((element) => observer.observe(element));
    activeObservers.add(observer);
  };

  const animateHero = () => {
    const hero = page.querySelector('.hero');
    if (!hero || !canAnimate() || window.scrollY > 24 || performance.now() > 1800) return;

    const accent = hero.querySelector('[data-motion="hero-accent"]');
    if (accent) {
      animate(accent, [
        { transform: 'scaleX(0)' },
        { transform: 'scaleX(1)' }
      ], { duration: mobileLayout.matches ? 400 : 600, easing });
    }

    if (!mobileLayout.matches) {
      const image = hero.querySelector('.hero-visual img');
      if (image?.complete && image.naturalWidth > 0) {
        animate(image, [
          { transform: 'scale(1.035)' },
          { transform: 'scale(1)' }
        ], { duration: 700, easing });
      }
    }
  };

  const animateHeadings = () => {
    const targets = Array.from(page.querySelectorAll('[data-motion="heading"], [data-motion="service-index"]'));
    observeOnce(targets, (target, index, count) => {
      const mobile = mobileLayout.matches;
      const delay = mobile ? 0 : Math.min(160, Math.max(0, count - 1) * 80, index * 80);
      const distance = mobile ? 6 : 12;
      animate(target, [
        { transform: `translateY(${distance}px)` },
        { transform: 'translateY(0)' }
      ], { duration: mobile ? 350 : 450, delay, easing });
    });
  };

  const animatePhoto = (image) => {
    if (!image.complete || image.naturalWidth === 0) return;

    const mobile = mobileLayout.matches;
    const frame = image.parentElement;
    if (!frame) return;

    let remaining = mobile ? 1 : 2;
    const previousWillChange = image.style.willChange;
    const settle = () => {
      remaining -= 1;
      if (remaining > 0) return;
      image.style.willChange = previousWillChange;
      frame.querySelector(':scope > .motion-photo-wipe')?.remove();
    };

    image.style.willChange = 'transform';
    if (!mobile) {
      const wipe = document.createElement('span');
      wipe.className = 'motion-photo-wipe';
      wipe.setAttribute('aria-hidden', 'true');
      frame.append(wipe);
      animate(wipe, [
        { transform: 'scaleX(1)' },
        { transform: 'scaleX(0)' }
      ], { duration: 600, easing }, settle);
    }

    animate(image, [
      { transform: `scale(${mobile ? 1.015 : 1.04})` },
      { transform: 'scale(1)' }
    ], { duration: mobile ? 400 : 600, easing }, settle);
  };

  const animateConnections = () => {
    const visual = page.querySelector('[data-motion="connections"]');
    if (!visual) return;

    observeOnce([visual], () => {
      const paths = Array.from(visual.querySelectorAll('path'));
      paths.forEach((path, index) => {
        animate(path, [
          { strokeDashoffset: 100 },
          { strokeDashoffset: 0 }
        ], { duration: 850, delay: index * 110, easing });
      });

      visual.querySelectorAll('circle').forEach((node, index) => {
        animate(node, [
          { opacity: .24, transform: 'scale(.65)' },
          { opacity: 1, transform: 'scale(1)' }
        ], { duration: 420, delay: 160 + index * 75, easing });
      });
    });
  };

  const cancelActiveAnimations = () => {
    activeAnimations.forEach((animation) => animation.cancel());
  };

  const stopForPreference = (event) => {
    if (event.matches) cancelActiveAnimations();
  };

  if (typeof reducedMotion.addEventListener === 'function') {
    reducedMotion.addEventListener('change', stopForPreference);
  } else {
    reducedMotion.addListener(stopForPreference);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') cancelActiveAnimations();
  });

  try {
    animateHero();
    animateHeadings();
    observeOnce(Array.from(page.querySelectorAll('[data-motion="photo"]')), animatePhoto);
    animateConnections();
  } catch {
    cancelActiveAnimations();
    activeObservers.forEach((observer) => observer.disconnect());
    activeObservers.clear();
  }
})();
