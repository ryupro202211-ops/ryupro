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

    // transform はパララックスが使うので、個別プロパティの scale で寄せる
    animate(image, [
      { scale: `${mobile ? 1.015 : 1.04}` },
      { scale: '1' }
    ], { duration: mobile ? 400 : 600, easing }, settle);
  };

  // 事業写真：スクロールに合わせて枠の中で上下にずらす
  const setupParallax = () => {
    if (mobileLayout.matches || reducedMotion.matches) return;
    const images = Array.from(page.querySelectorAll('.service-image img'));
    if (!images.length) return;

    const visible = new Set();
    let ticking = false;
    const update = () => {
      ticking = false;
      const viewport = window.innerHeight;
      visible.forEach((image) => {
        const frame = image.parentElement.getBoundingClientRect();
        // -1（画面下）〜 1（画面上）に正規化して、枠の高さの ±4.5% 動かす
        const progress = (frame.top + frame.height / 2 - viewport / 2) / (viewport / 2 + frame.height / 2);
        const offset = Math.max(-1, Math.min(1, progress)) * frame.height * -0.045;
        image.style.setProperty('--parallax-y', `${offset.toFixed(1)}px`);
      });
    };
    const request = () => {
      if (ticking || !visible.size) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const image = entry.target.querySelector('img');
        if (entry.isIntersecting) visible.add(image);
        else visible.delete(image);
      });
      request();
    }, { rootMargin: '10% 0px' });

    images.forEach((image) => {
      image.dataset.parallax = '';
      observer.observe(image.parentElement);
    });
    activeObservers.add(observer);
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
  };

  // つながりの線の上を、光の粒がゆっくり行き来する
  const startSparks = (visual) => {
    if (reducedMotion.matches || visual.dataset.sparks) return;
    visual.dataset.sparks = 'on';
    const ns = 'http://www.w3.org/2000/svg';
    const paths = Array.from(visual.querySelectorAll('path[id]'));

    paths.forEach((path, index) => {
      if (getComputedStyle(path).display === 'none') return;
      const spark = document.createElementNS(ns, 'circle');
      spark.setAttribute('class', 'connection-spark');
      spark.setAttribute('r', '3');
      spark.setAttribute('opacity', '0');

      const duration = 4.6 + (index % 3) * 1.3;
      const begin = `${(index * 1.7).toFixed(1)}s`;

      const motion = document.createElementNS(ns, 'animateMotion');
      motion.setAttribute('dur', `${duration}s`);
      motion.setAttribute('begin', begin);
      motion.setAttribute('repeatCount', 'indefinite');
      motion.setAttribute('calcMode', 'spline');
      motion.setAttribute('keyTimes', '0;1');
      motion.setAttribute('keySplines', '.45 0 .25 1');
      motion.setAttribute('keyPoints', index % 2 ? '1;0' : '0;1');
      const mpath = document.createElementNS(ns, 'mpath');
      mpath.setAttribute('href', `#${path.id}`);
      motion.append(mpath);

      const fade = document.createElementNS(ns, 'animate');
      fade.setAttribute('attributeName', 'opacity');
      fade.setAttribute('dur', `${duration}s`);
      fade.setAttribute('begin', begin);
      fade.setAttribute('repeatCount', 'indefinite');
      fade.setAttribute('values', '0;1;1;0');
      fade.setAttribute('keyTimes', '0;.18;.8;1');

      spark.append(motion, fade);
      visual.append(spark);
    });

    // 画面外や別タブのときは止めて、無駄に動かさない
    let onScreen = true;
    const sync = () => {
      if (onScreen && canAnimate()) visual.unpauseAnimations();
      else visual.pauseAnimations();
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    observer.observe(visual);
    activeObservers.add(observer);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener?.('change', () => {
      visual.querySelectorAll('.connection-spark').forEach((spark) => spark.remove());
    });
  };

  const animateConnections = () => {
    const visual = page.querySelector('[data-motion="connections"]');
    if (!visual) return;

    // 読み込み時点ですでに見えている場合は、線を描かずに光だけ流す
    if (visual.getBoundingClientRect().top < window.innerHeight * .82) {
      startSparks(visual);
      return;
    }

    observeOnce([visual], () => {
      window.setTimeout(() => startSparks(visual), 1100);
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

  // 記事カードを押したら、そのサムネイルを記事上部の画像へつなげて遷移する
  const setupPostTransitions = (root, cardSelector) => {
    if (!('onpagereveal' in window)) return; // View Transitions 非対応ブラウザは通常遷移
    root.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const card = event.target.closest(cardSelector);
      const image = card?.querySelector('img');
      if (!image || reducedMotion.matches) return;
      root.querySelectorAll(cardSelector + ' img').forEach((other) => { other.style.viewTransitionName = ''; });
      image.style.viewTransitionName = 'post-hero';
    });
    // 戻るボタンで戻ってきたときに名前が残らないようにする
    window.addEventListener('pageshow', () => {
      root.querySelectorAll(cardSelector + ' img').forEach((image) => { image.style.viewTransitionName = ''; });
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
    setupParallax();
    animateConnections();
    setupPostTransitions(page, '.journal-card');
  } catch {
    cancelActiveAnimations();
    activeObservers.forEach((observer) => observer.disconnect());
    activeObservers.clear();
  }
})();
