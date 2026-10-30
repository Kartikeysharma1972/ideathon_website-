(() => {
  'use strict';
  const root = document.documentElement;
  const fine = matchMedia('(pointer: fine) and (min-width: 701px)');
  // Motion is always on for this site.
  const paused = false;
  try { localStorage.removeItem('ideathon-motion'); } catch { /* Storage is optional. */ }
  let frame = 0, last = 0, time = 0, scrollDirty = true;
  let heroVisible = Boolean(document.querySelector('.hero')), labVisible = false;
  const pointer = { x: -1000, y: -1000 };
  const hero = document.querySelector('.hero');
  const art = document.querySelector('.hero-art');
  const lab = document.querySelector('.idea-lab');
  const stage = document.querySelector('.lab-stage');
  const heroCanvas = document.querySelector('.hero-constellation');
  const labCanvas = document.getElementById('idea-universe');
  const trailCanvas = document.getElementById('spark-trail');
  const heroContext = heroCanvas ? heroCanvas.getContext('2d') : null;
  const labContext = labCanvas.getContext('2d');
  const trailContext = trailCanvas.getContext('2d');
  const sizes = { hero: { w: 1, h: 1 }, lab: { w: 1, h: 1 }, trail: { w: 1, h: 1 } };
  const fieldPointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const trail = [];
  const heroNodes = Array.from({ length: 42 }, (_, i) => ({
    x: ((i * 137.508) % 1000) / 1000,
    y: ((i * 223.73 + 193) % 1000) / 1000,
    phase: i * 1.71, radius: i % 5 === 0 ? 2.6 : 1.3
  }));
  const count = fine.matches ? 720 : 420;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const particles = Array.from({ length: count }, (_, i) => {
    const y = 1 - 2 * (i + .5) / count;
    const r = Math.sqrt(1 - y * y);
    const angle = i * goldenAngle;
    const sphere = { x: Math.cos(angle) * r, y: y, z: Math.sin(angle) * r };
    const u = i / count * Math.PI * 2;
    const v = i * goldenAngle;
    const torus = { x: (0.78 + 0.3 * Math.cos(v)) * Math.cos(u), y: .3 * Math.sin(v), z: (0.78 + .3 * Math.cos(v)) * Math.sin(u) };
    const a = u * 3;
    const lane = i % 3 * Math.PI * 2 / 3;
    const helix = { x: .67 * Math.cos(a + lane), y: (i / count - .5) * 2, z: .67 * Math.sin(a + lane) };
    const spin = Math.sqrt((i + .5) / count), arm = i * goldenAngle;
    const galaxy = { x: spin * Math.cos(arm), y: Math.sin(i * 12.9898) * .06 * (1 - spin), z: spin * Math.sin(arm) };
    const side = Math.ceil(Math.sqrt(count)), gx = (i % side) / (side - 1) * 2 - 1, gz = Math.floor(i / side) / (side - 1) * 2 - 1;
    const wave = { x: gx * .95, y: .22 * Math.sin(gx * 4) * Math.cos(gz * 4), z: gz * .95 };
    return { forms: [sphere, torus, helix, galaxy, wave], x: sphere.x, y: sphere.y, z: sphere.z };
  });
  let mode = 0;
  let morphing = false;
  let projected = [];

  function sizeCanvas(canvas, context, key) {
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, fine.matches ? 1.75 : 1.5);
    sizes[key] = { w: rect.width, h: rect.height };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function resize() {
    if (heroCanvas) sizeCanvas(heroCanvas, heroContext, 'hero');
    sizeCanvas(labCanvas, labContext, 'lab');
    sizeCanvas(trailCanvas, trailContext, 'trail');
    scrollDirty = true;
    drawHero(); drawLab(1);
    schedule();
  }
  function drawHero() {
    if (!heroContext) return;
    const ctx = heroContext, { w, h } = sizes.hero;
    ctx.clearRect(0, 0, w, h);
    const rect = heroCanvas.getBoundingClientRect();
    const mx = pointer.x - rect.left, my = pointer.y - rect.top;
    const points = heroNodes.map(node => {
      let x = node.x * w + Math.sin(time * .24 + node.phase) * 15;
      let y = node.y * h + Math.cos(time * .2 + node.phase) * 13;
      const dx = x - mx, dy = y - my, d = Math.hypot(dx, dy);
      if (!paused && d < 120 && d > .1) { x += dx / d * (120 - d) * .27; y += dy / d * (120 - d) * .27; }
      return { x, y, radius: node.radius };
    });
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j], distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < 100) {
          ctx.strokeStyle = `rgba(32,134,243,${(1 - distance / 100) * .2})`;
          ctx.lineWidth = .65; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.fillStyle = i % 4 === 0 ? '#75b2f4aa' : '#53a2f690';
      ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawLab(step) {
    if (!labContext) return;
    const ctx = labContext, { w, h } = sizes.lab;
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(w, h) * .29;
    const rotation = paused ? .32 : time * .13 + fieldPointer.x * .65;
    const tilt = -.2 + fieldPointer.y * .4 + (mode === 1 || mode >= 3 ? .6 : 0);
    const cy = Math.cos(rotation), sy = Math.sin(rotation), cx = Math.cos(tilt), sx = Math.sin(tilt);
    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, scale * 1.5);
    glow.addColorStop(0, 'rgba(106,174,247,.09)'); glow.addColorStop(.65, 'rgba(42,140,244,.035)'); glow.addColorStop(1, 'rgba(10,97,190,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    let delta = 0;
    const smoothing = paused ? 1 : 1 - Math.pow(.93, step);
    projected = particles.map((particle, i) => {
      const dest = particle.forms[mode];
      particle.x += (dest.x - particle.x) * smoothing;
      particle.y += (dest.y - particle.y) * smoothing;
      particle.z += (dest.z - particle.z) * smoothing;
      delta += Math.abs(dest.x - particle.x) + Math.abs(dest.y - particle.y) + Math.abs(dest.z - particle.z);
      const breathing = 1 + Math.sin(time * .65 + i * .04) * (paused ? 0 : .014);
      const x = (particle.x * cy - particle.z * sy) * breathing;
      const z0 = particle.x * sy + particle.z * cy;
      const y = particle.y * cx - z0 * sx;
      const z = particle.y * sx + z0 * cx;
      const depth = 3.6 / (3.6 + z);
      return { x: w / 2 + x * scale * depth, y: h / 2 + y * scale * depth, z, depth, i };
    });
    morphing = delta > .1;
    // Sparse mesh connections are linear in particle count, avoiding all-pairs work.
    ctx.lineWidth = .5;
    for (let i = 0; i < projected.length; i += 2) {
      const a = projected[i];
      for (const offset of [21, 34]) {
        const b = projected[(i + offset) % projected.length];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < scale * .43 && Math.abs(a.z - b.z) < .7) {
          const alpha = Math.max(.015, (1 - distance / (scale * .43)) * .19 * (1.15 - a.z * .35));
          ctx.strokeStyle = `rgba(133,189,249,${alpha})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    projected.sort((a, b) => b.z - a.z);
    for (const point of projected) {
      const alpha = Math.min(1, Math.max(.14, .68 - point.z * .4));
      ctx.fillStyle = point.i % 7 === 0 ? `rgba(203,227,252,${alpha})` : `rgba(165,207,252,${alpha})`;
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(.45, (point.i % 11 === 0 ? 1.9 : 1.05) * point.depth), 0, Math.PI * 2); ctx.fill();
    }
    // A tilted orbital path frames each morph without covering the text.
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-.4 + Math.sin(time * .1) * .12);
    ctx.strokeStyle = 'rgba(152,199,250,.16)'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.ellipse(0, 0, scale * 1.43, scale * .43, 0, 0, Math.PI * 2); ctx.stroke();
    const angle = paused ? .9 : time * .5;
    const ox = Math.cos(angle) * scale * 1.43, oy = Math.sin(angle) * scale * .43;
    ctx.fillStyle = '#c8e1fc'; ctx.shadowColor = '#c8e1fc'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function drawTrail(step) {
    if (!trailContext) return;
    const ctx = trailContext, { w, h } = sizes.trail;
    ctx.clearRect(0, 0, w, h);
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]; p.life -= .026 * step;
      if (p.life <= 0) { trail.splice(i, 1); continue; }
      p.x += p.vx * step; p.y += p.vy * step;
      ctx.strokeStyle = p.lime ? `rgba(76,155,240,${p.life * .65})` : `rgba(39,138,244,${p.life * .6})`;
      ctx.lineWidth = 1;
      const r = p.life * p.radius;
      ctx.beginPath(); ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke();
    }
  }

  const manifesto = document.querySelector('.manifesto');
  const manifestoHeading = manifesto.querySelector('h2');
  const originalText = manifestoHeading.textContent;
  // Keep the full sentence available to assistive technology, with visual word spans hidden from it.
  manifestoHeading.setAttribute('aria-label', originalText);
  const walker = document.createTreeWalker(manifestoHeading, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach(node => {
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(word => {
      if (!word.trim()) { fragment.append(document.createTextNode(word)); return; }
      const span = document.createElement('span'); span.className = 'manifesto-word'; span.textContent = word; span.setAttribute('aria-hidden', 'true'); fragment.append(span);
    });
    node.replaceWith(fragment);
  });
  const words = [...manifesto.querySelectorAll('.manifesto-word')];
  manifesto.classList.add('enhanced');
  function paintScroll() {
    scrollDirty = false;
    const rect = manifesto.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (innerHeight * .9 - rect.top) / (innerHeight * .65)));
    words.forEach((word, i) => word.classList.toggle('lit', paused || progress * (words.length + 2) > i));
    if (!paused) {
      if (hero) {
        hero.style.setProperty('--hero-shift', `${Math.min(scrollY * .08, 55)}px`);
        hero.style.setProperty('--art-shift', `${-Math.min(scrollY * .06, 45)}px`);
      }
      manifesto.style.setProperty('--star-turn', `${progress * 180}deg`);
      document.querySelector('.mentors').style.setProperty('--orbit-turn', `${scrollY * .045}deg`);
    }
  }
  function tick(now) {
    frame = 0;
    if (document.hidden) return;
    const step = last ? Math.min(2.5, (now - last) / 16.667) : 1;
    last = now;
    if (scrollDirty) paintScroll();
    if (!paused) {
      time += step / 60;
      fieldPointer.x += (fieldPointer.targetX - fieldPointer.x) * .065;
      fieldPointer.y += (fieldPointer.targetY - fieldPointer.y) * .065;
      if (heroVisible) drawHero();
      if (labVisible || morphing) drawLab(step);
      if (trail.length) drawTrail(step);
      if (heroVisible || labVisible || trail.length || morphing) schedule();
    }
  }
  function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(tick); }
  function setMotion() {
    root.classList.remove('motion-paused');
    scrollDirty = true; schedule();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; last = 0; }
    else { scrollDirty = true; schedule(); }
  });
  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.target === hero) heroVisible = entry.isIntersecting; if (entry.target === lab) labVisible = entry.isIntersecting; });
      last = 0; schedule();
    }, { rootMargin: '100px' });
    if (hero) visibility.observe(hero);
    visibility.observe(lab);
  } else { labVisible = true; }
  window.addEventListener('scroll', () => { scrollDirty = true; schedule(); }, { passive: true });
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });
  let previousPoint = { x: -1000, y: -1000 };
  window.addEventListener('pointermove', event => {
    if (paused || !fine.matches || event.pointerType === 'touch') return;
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (Math.hypot(pointer.x - previousPoint.x, pointer.y - previousPoint.y) > 7) {
      if (trail.length < 30) trail.push({ x: pointer.x, y: pointer.y, vx: (Math.random() - .5) * .5, vy: -.35 - Math.random() * .4, life: 1, radius: 2 + Math.random() * 2, lime: Math.random() > .65 });
      previousPoint = { x: pointer.x, y: pointer.y };
    }
    schedule();
  }, { passive: true });
  stage.addEventListener('pointermove', event => {
    if (paused || !fine.matches) return;
    const rect = stage.getBoundingClientRect();
    fieldPointer.targetX = (event.clientX - rect.left) / rect.width - .5;
    fieldPointer.targetY = (event.clientY - rect.top) / rect.height - .5;
    schedule();
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { fieldPointer.targetX = 0; fieldPointer.targetY = 0; });

  const prompts = [
    { question: 'Why don’t some lessons click?', hint: 'Ask a classmate about a topic they never understood. Listen to what went wrong.' },
    { question: 'What makes it hard to stay healthy at school?', hint: 'Ask five classmates about their water, food and sleep. Look for the pattern.' },
    { question: 'Where does your lunch waste go?', hint: 'Follow one day of canteen leftovers to the final bin.' },
    { question: 'What do people in villages near you still find hard?', hint: 'Talk to a farmer or shopkeeper about the toughest part of their day.' },
    { question: 'What small problem annoys you every day?', hint: 'Note three everyday frustrations this week. One of them could be your idea.' }
  ];
  const sparkTabs = [...document.querySelectorAll('[data-spark]')];
  function selectSpark(tab) {
    mode = Number(tab.dataset.spark); morphing = true;
    sparkTabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; });
    const panel = document.getElementById('spark-panel');
    panel.setAttribute('aria-labelledby', tab.id);
    document.getElementById('spark-question').textContent = prompts[mode].question;
    document.getElementById('spark-hint').textContent = prompts[mode].hint;
    document.getElementById('field-id').textContent = `00${mode + 1}`;
    if (!paused) panel.animate([{ opacity: .35, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420, easing: 'ease-out' });
    if (paused) drawLab(1);
    schedule();
  }
  sparkTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectSpark(tab));
    tab.addEventListener('keydown', event => {
      let next = null;
      if (event.key === 'ArrowRight') next = sparkTabs[(index + 1) % sparkTabs.length];
      if (event.key === 'ArrowLeft') next = sparkTabs[(index + sparkTabs.length - 1) % sparkTabs.length];
      if (event.key === 'Home') next = sparkTabs[0];
      if (event.key === 'End') next = sparkTabs[sparkTabs.length - 1];
      if (next) { event.preventDefault(); selectSpark(next); next.focus(); }
    });
  });

  document.querySelectorAll('.round-card,.eligibility-card,.sketch-panel,.video-placeholder,.cta-inner').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (paused || !fine.matches) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--light-x', `${x * 100}%`); card.style.setProperty('--light-y', `${y * 100}%`);
      if (card.classList.contains('round-card')) {
        card.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`); card.style.setProperty('--tilt-y', `${(x - .5) * 7}deg`);
      }
    }, { passive: true });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg'); });
  });
  document.querySelectorAll('.button').forEach(button => {
    button.addEventListener('pointermove', event => {
      if (paused || !fine.matches) return;
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--magnet-x', `${Math.max(-5, Math.min(5, (event.clientX - rect.left - rect.width / 2) * .1))}px`);
      button.style.setProperty('--magnet-y', `${Math.max(-4, Math.min(4, (event.clientY - rect.top - rect.height / 2) * .15))}px`);
    }, { passive: true });
    button.addEventListener('pointerleave', () => { button.style.setProperty('--magnet-x', '0px'); button.style.setProperty('--magnet-y', '0px'); });
  });
  if (labContext) stage.classList.add('canvas-ready');
  resize(); setMotion();
})();
