(() => {
  'use strict';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const progress = document.querySelector('.scroll-progress');
  let scheduled = false;
  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`;
    scheduled = false;
  };
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateProgress); }
  }, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    document.documentElement.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    const counterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = Number(el.dataset.count);
        const start = performance.now();
        const tick = now => {
          const t = Math.min((now - start) / 1300, 1);
          el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString('en-IN');
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        counterObserver.unobserve(el);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(el => counterObserver.observe(el));
  }

  const menuButton = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const closeMenu = () => {
    mobileNav.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  };
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    mobileNav.hidden = !open;
  });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !mobileNav.hidden) { closeMenu(); menuButton.focus(); }
  });
  document.addEventListener('click', event => {
    if (!mobileNav.hidden && !event.target.closest('.header')) closeMenu();
  });
  window.matchMedia('(min-width: 701px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

  const bandCopy = {
    junior: { title: 'Classes 6–8.', description: 'Fresh eyes see new possibilities. Start with a problem around you and ask: could we make this better?', note: 'Curiosity has no minimum age.' },
    senior: { title: 'Classes 9–12.', description: 'Take your curiosity further. Explore a real need, shape a practical solution and make a compelling case for your idea.', note: 'Your next chapter starts with an idea.' }
  };
  const tabs = [...document.querySelectorAll('[data-band]')];
  const selectBand = tab => {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    const copy = bandCopy[tab.dataset.band];
    document.getElementById('band-title').textContent = copy.title;
    document.getElementById('band-description').textContent = copy.description;
    document.querySelector('.eligibility-card > .handwritten').textContent = copy.note;
    document.getElementById('band-panel').setAttribute('aria-labelledby', tab.id);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectBand(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); selectBand(next); next.focus(); }
    });
  });

  const dialog = document.getElementById('registration-dialog');
  document.querySelectorAll('[data-open-registration]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });

  const cursor = document.querySelector('.pencil-cursor');
  const finePointer = window.matchMedia('(pointer: fine) and (min-width: 701px)');
  let cursorX = 0, cursorY = 0, cursorQueued = false;
  const paintCursor = () => {
    cursor.style.transform = `translate3d(${cursorX + 12}px, ${cursorY + 8}px, 0)`;
    cursorQueued = false;
  };
  window.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches || document.documentElement.classList.contains('motion-paused') || event.pointerType === 'touch') return;
    cursorX = event.clientX; cursorY = event.clientY;
    cursor.style.opacity = '1';
    if (!cursorQueued) { cursorQueued = true; requestAnimationFrame(paintCursor); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { cursor.style.opacity = '0'; });
  window.addEventListener('blur', () => { cursor.style.opacity = '0'; });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { document.documentElement.classList.remove('motion-ready'); cursor.style.opacity = '0'; }
  });

  const art = document.querySelector('.hero-art');
  const notebook = document.querySelector('.notebook');
  art.addEventListener('pointermove', event => {
    if (!finePointer.matches || reducedMotion.matches || document.documentElement.classList.contains('motion-paused')) return;
    const rect = art.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    notebook.style.transform = `rotate(-10deg) rotateY(${x * 13}deg) rotateX(${-y * 10}deg)`;
  }, { passive: true });
  art.addEventListener('pointerleave', () => { notebook.style.transform = ''; });
})();
