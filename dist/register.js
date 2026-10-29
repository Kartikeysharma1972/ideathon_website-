// Team registration: a short step-by-step form with autosave, friendly validation and a review screen.
(() => {
  'use strict';
  const form = document.getElementById('reg-form');
  const steps = [...form.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.reg-steps li')];
  const bar = document.querySelector('.reg-bar i');
  const backBtn = form.querySelector('[data-back]');
  const nextBtn = form.querySelector('[data-next]');
  const formError = form.querySelector('.form-error');
  const membersBox = form.querySelector('.members');
  const addMemberBtn = form.querySelector('[data-add-member]');
  const badge = form.querySelector('.category-badge');
  const savedLabel = document.querySelector('.reg-saved');
  const DRAFT_KEY = 'ideathon-team-draft';
  const LABELS = ['Team', 'Members', 'Idea', 'Mock Test', 'Review'];
  const NAMES = [
    'VisionX', 'NextGen', 'Spark Squad', 'Idea Rockets', 'Bright Minds', 'Future Fixers', 'Eco Warriors', 'Tech Titans', 'Dream Builders', 'Brain Wave',
    'Code Crafters', 'Think Tank', 'Mission Possible', 'Blue Comets', 'Pixel Pioneers', 'Mind Mavericks', 'Innovation Ninjas', 'Bright Sparks', 'Little Einsteins', 'Curious Coders',
    'Smart Squad', 'Idea Hive', 'Rocket Minds', 'The Problem Solvers', 'Bot Builders', 'Green Guardians', 'Star Seekers', 'Quantum Kids', 'Logic Legends', 'Byte Busters',
    'Dream Team', 'Wonder Works', 'Creative Crew', 'Future Founders', 'Mini Moguls', 'Tomorrow Makers', 'The Inventors', 'Galaxy Gurus', 'Thunder Thinkers', 'Nova Ninjas',
    'Circuit Breakers', 'Startup Stars', 'Lightbulb Club', 'Atom Squad', 'Brainstormers', 'The Changemakers', 'Imagine Inc', 'Ideas Unlimited', 'Phoenix Rising', 'Solar Squad',
    'Data Dragons', 'Robo Rangers', 'The Bright Side', 'Spark Lab', 'Planet Protectors', 'Mission Mars', 'Eureka Crew', 'Gen Z Geniuses', 'Tech Tigers', 'Think Big',
    'Infinity Squad', 'Fusion Force', 'The Explorers', 'Code Comets', 'Pixel Pandas', 'Turbo Thinkers', 'Next Big Thing', 'Smart Starters', 'Idea Igniters', 'Bold Builders',
    'The Visionaries', 'Moonshot Makers', 'Idea Engine', 'Clever Clan', 'Neon Ninjas', 'Wise Owls', 'Hustle Hub', 'Bright Future', 'Super Solvers', 'Chai and Code',
    'Desi Dreamers', 'Jugaad Geniuses', 'Pink City Pioneers', 'Startup Squad', 'Blue Print', 'Zero to One', 'Level Up', 'Brain Bytes', 'Tiny Titans', 'Eco Innovators',
    'Mind Matrix', 'Rising Stars', 'Skyline Squad', 'The Disruptors', 'Gear Heads', 'Spark Plug', 'Alpha Minds', 'Vision Valley', 'Tech Sparks', 'Orbit Crew',
    'Thinkers Inc', 'Young Founders', 'Smart Hive', 'Future Ready', 'Bright Bulbs', 'Code Red', 'Starlight Squad', 'Brave Builders', 'Mind Sprint', 'Cosmic Coders'
  ];
  const MIN_MEMBERS = 2, MAX_MEMBERS = 5;
  let current = 0;
  let memberCount = MIN_MEMBERS;

  if (window.IdeathonForms?.isPreview()) document.querySelector('.reg-preview').hidden = false;

  // ---------- members ----------
  const tpl = document.getElementById('member-tpl');
  for (let i = 1; i <= MAX_MEMBERS; i++) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.member = i;
    node.querySelector('.member-no').textContent = `Student ${i}`;
    node.querySelector('.member-role').textContent = i === 1 ? 'Team captain' : i > MIN_MEMBERS ? 'Optional' : '';
    node.querySelectorAll('[data-k]').forEach(input => {
      input.name = `m${i}_${input.dataset.k}`;
      if (input.type !== 'radio') {
        input.id = input.name;
        input.closest('.field').querySelector('label').htmlFor = input.id;
      }
    });
    membersBox.appendChild(node);
  }
  const memberNode = i => membersBox.querySelector(`[data-member="${i}"]`);
  function setMemberCount(n) {
    memberCount = Math.min(MAX_MEMBERS, Math.max(MIN_MEMBERS, n | 0));
    for (let i = 1; i <= MAX_MEMBERS; i++) {
      const node = memberNode(i);
      node.hidden = i > memberCount;
      // only the last optional member can be removed, so the numbering never has gaps
      node.querySelector('[data-remove-member]').hidden = i !== memberCount || i <= MIN_MEMBERS;
      if (i > memberCount) node.querySelectorAll('input').forEach(el => { if (el.type === 'radio') el.checked = false; else el.value = ''; });
    }
    addMemberBtn.hidden = memberCount >= MAX_MEMBERS;
  }
  addMemberBtn.addEventListener('click', () => { setMemberCount(memberCount + 1); memberNode(memberCount).querySelector('input').focus(); save(); });
  membersBox.addEventListener('click', e => { if (e.target.closest('[data-remove-member]')) { setMemberCount(memberCount - 1); addMemberBtn.focus(); save(); updateBadge(); } });

  function classes() {
    const out = [];
    for (let i = 1; i <= memberCount; i++) {
      const v = form.querySelector(`input[name="m${i}_class"]:checked`);
      if (v) out.push(+v.value);
    }
    return out;
  }
  function category() {
    const c = classes();
    if (!c.length) return '';
    if (c.every(x => x <= 8)) return 'Junior (classes 6–8)';
    if (c.every(x => x >= 9)) return 'Senior (classes 9–12)';
    return 'Mixed classes (organisers will confirm the category)';
  }
  function updateBadge() {
    const cat = category();
    badge.hidden = !cat;
    badge.textContent = cat ? `Your category: ${cat}` : '';
  }

  // ---------- team name suggestions ----------
  form.querySelector('[data-suggest]').addEventListener('click', () => {
    const input = form.teamName;
    let pick;
    do { pick = NAMES[Math.floor(Math.random() * NAMES.length)]; } while (pick === input.value && NAMES.length > 1);
    input.value = pick;
    clearError(input.closest('.field'));
    save();
  });

  // ---------- "Other" industry ----------
  const otherInput = form.querySelector('[name="industryOther"]');
  function syncOther() {
    const isOther = form.querySelector('input[name="industry"]:checked')?.value === 'Other';
    otherInput.hidden = !isOther;
    otherInput.required = isOther;
  }

  // ---------- character counters ----------
  form.querySelectorAll('[data-count]').forEach(el => {
    const counter = document.createElement('span');
    counter.className = 'counter';
    el.insertAdjacentElement('afterend', counter);
    const update = () => {
      const left = el.maxLength - el.value.length;
      counter.textContent = `${el.value.length}/${el.maxLength}`;
      counter.classList.toggle('near', left < 20);
    };
    el.addEventListener('input', update);
    el._counter = update;
    update();
  });

  // ---------- validation ----------
  function setError(field, message) {
    field.classList.add('is-invalid');
    let p = field.querySelector(':scope > .error');
    if (!p) { p = document.createElement('p'); p.className = 'error'; field.appendChild(p); }
    p.textContent = message;
  }
  function clearError(field) {
    if (!field) return;
    field.classList.remove('is-invalid');
    field.querySelector(':scope > .error')?.remove();
  }
  const phoneOk = v => v.replace(/\D/g, '').length >= 10;
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function validateStep(n) {
    const step = steps[n];
    step.querySelectorAll('.is-invalid').forEach(clearError);
    const bad = [];
    const need = (field, ok, message) => { if (!ok) { setError(field, message); bad.push(field); } };

    if (n === 0) {
      need(form.teamName.closest('.field'), form.teamName.value.trim().length >= 2, 'Give your team a name (or tap Suggest).');
      need(form.school.closest('.field'), form.school.value.trim().length >= 3, 'Which school are you from?');
      need(form.city.closest('.field'), form.city.value.trim().length >= 2, 'Add your city.');
    }
    if (n === 1) {
      for (let i = 1; i <= memberCount; i++) {
        const m = memberNode(i);
        const name = m.querySelector(`[name="m${i}_name"]`);
        const optionalEmpty = i > MIN_MEMBERS && !name.value.trim() && !form.querySelector(`input[name="m${i}_class"]:checked`);
        if (optionalEmpty) continue;
        need(name.closest('.field'), name.value.trim().length >= 2, i === 1 ? 'Add the captain’s name.' : `Add student ${i}’s name.`);
        need(m.querySelector('.class-field'), !!form.querySelector(`input[name="m${i}_class"]:checked`), 'Tap their class.');
      }
      const phone = form.phone.value.trim(), email = form.email.value.trim();
      const contactField = form.phone.closest('.field');
      if (!phone && !email) need(contactField, false, 'Add a WhatsApp number or an email.');
      else {
        if (phone) need(contactField, phoneOk(phone), 'That number looks short. Use 10 digits.');
        if (email) need(form.email.closest('.field'), emailOk(email), 'That email doesn’t look right.');
      }
    }
    if (n === 2) {
      need(form.pitch.closest('.field'), form.pitch.value.trim().length >= 8, 'Describe your idea in a few words.');
      const ind = form.querySelector('input[name="industry"]:checked');
      need(form.querySelector('[data-required-group="industry"]'), !!ind && (ind.value !== 'Other' || otherInput.value.trim()), ind ? 'Tell us the area.' : 'Pick the closest area.');
    }
    if (n === 4) need(form.consent.closest('.field'), form.consent.checked, 'Please tick this to submit.');

    if (bad.length) {
      formError.textContent = bad.length === 1 ? 'One thing needs a quick fix.' : `${bad.length} things need a quick fix.`;
      bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = bad[0].querySelector('input:not([type=radio]):not([type=checkbox]), textarea') || bad[0].querySelector('input');
      focusable?.focus({ preventScroll: true });
      return false;
    }
    formError.textContent = '';
    return true;
  }
  form.addEventListener('input', e => {
    clearError(e.target.closest('.field'));
    if (e.target.name === 'email' || e.target.name === 'phone') clearError(form.phone.closest('.field'));
    if (!form.querySelector('.is-invalid')) formError.textContent = '';
    if (e.target.name?.endsWith('_class')) updateBadge();
    if (e.target.name === 'industry') syncOther();
    save();
  });

  // ---------- step navigation ----------
  function show(n, focus = true, persist = true) {
    current = n;
    steps.forEach((s, i) => { s.hidden = i !== n; });
    dots.forEach((d, i) => { d.classList.toggle('is-done', i < n); d.classList.toggle('is-current', i === n); d.toggleAttribute('aria-current', i === n); });
    bar.style.transform = `scaleX(${(n + 1) / steps.length})`;
    backBtn.hidden = n === 0;
    nextBtn.hidden = false;
    nextBtn.innerHTML = n === steps.length - 1 ? 'Submit registration <span>↗</span>' : `Next: ${LABELS[n + 1]} <span>→</span>`;
    formError.textContent = '';
    if (n === 3) mock.render(); else mock.leave();
    if (n === 4) renderReview();
    if (focus) {
      [...steps[n].querySelectorAll('.step-title')].find(t => t.offsetParent)?.focus({ preventScroll: true });
      document.querySelector('.reg-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (persist) save();
  }
  nextBtn.addEventListener('click', () => {
    if (!validateStep(current)) return;
    if (current < steps.length - 1) show(current + 1);
    else submit();
  });
  backBtn.addEventListener('click', () => show(Math.max(0, current - 1)));
  // Enter moves forward instead of submitting half a form (but keeps new lines in text areas)
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); nextBtn.click(); }
  });
  form.addEventListener('submit', e => e.preventDefault());
  dots.forEach((d, i) => d.addEventListener('click', () => { if (i < current) show(i); }));

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- mock test (optional practice for the Round 1 aptitude test) ----------
  const MOCK_SECONDS = 5 * 60;
  const QUESTIONS = [
    { section: 'Logical Reasoning', q: 'What comes next in the series: 2, 4, 8, 16, ?', options: ['18', '24', '32', '30'], answer: 2 },
    { section: 'Numerical Ability', q: 'One pencil costs ₹5. How much do 12 pencils cost?', options: ['₹50', '₹60', '₹55', '₹65'], answer: 1 },
    { section: 'Verbal Ability', q: 'Which word means the opposite of “ancient”?', options: ['Old', 'Historic', 'Modern', 'Antique'], answer: 2 },
    { section: 'Problem Solving', q: 'The school bus leaves at 7:30 am and takes 45 minutes to reach school. When does it reach?', options: ['8:00 am', '8:15 am', '8:30 am', '8:45 am'], answer: 1 },
    { section: 'Innovation Thinking', q: 'What is the best first step when building a new idea?', options: ['Pick a cool name', 'Understand the problem people face', 'Buy expensive equipment', 'Copy a popular app'], answer: 1 }
  ];
  const mock = (() => {
    const step = steps[3];
    const intro = step.querySelector('.mock-intro');
    const test = step.querySelector('.mock-test');
    const result = step.querySelector('.mock-result');
    const timerEl = step.querySelector('.mock-timer');
    const countEl = step.querySelector('.mock-count');
    const track = step.querySelector('.mock-track i');
    const prevBtn = step.querySelector('[data-mock-prev]');
    const qNextBtn = step.querySelector('[data-mock-next]');
    // state: 'choice' (not started or said no) | 'running' | 'done'
    let state = 'choice', index = 0, answers = [], startedAt = 0, timeUsed = 0, tick;

    step.querySelector('.mock-sections').innerHTML = QUESTIONS.map(q => `<span>${q.section}</span>`).join('');
    const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    function render() {
      intro.hidden = state !== 'choice';
      test.hidden = state !== 'running';
      result.hidden = state !== 'done';
      // the test has its own buttons; the main Next only appears once there is a result
      nextBtn.hidden = state !== 'done';
      backBtn.hidden = state === 'running';
      if (state === 'running') renderQuestion();
      if (state === 'done') renderResult();
    }
    function renderQuestion() {
      const item = QUESTIONS[index];
      countEl.textContent = `Question ${index + 1} of ${QUESTIONS.length}`;
      track.style.transform = `scaleX(${(index + 1) / QUESTIONS.length})`;
      step.querySelector('.mock-tag').textContent = item.section;
      step.querySelector('.mock-question').textContent = item.q;
      step.querySelector('.mock-options').innerHTML = item.options.map((o, i) =>
        `<label class="mock-option"><input type="radio" name="mq${index}" value="${i}"${answers[index] === i ? ' checked' : ''}><span><b>${'ABCD'[i]}</b>${esc(o)}</span></label>`).join('');
      prevBtn.hidden = index === 0;
      qNextBtn.innerHTML = index === QUESTIONS.length - 1 ? 'Finish test <span>✓</span>' : 'Next question <span>→</span>';
    }
    function renderResult() {
      const score = answers.filter((a, i) => a === QUESTIONS[i].answer).length;
      step.querySelector('[data-mock-score]').textContent = `${score} / ${QUESTIONS.length}`;
      step.querySelector('[data-mock-msg]').textContent = `${score >= 4 ? 'Brilliant! You’re ready for Round 1.' : score >= 2 ? 'Good start! A little practice will help.' : 'Nice try! Practice makes perfect.'} Time taken: ${fmt(timeUsed)}`;
      step.querySelector('.mock-review').innerHTML = QUESTIONS.map((q, i) => {
        const ok = answers[i] === q.answer;
        return `<li class="${ok ? 'is-right' : 'is-wrong'}"><span class="mr-mark" aria-hidden="true">${ok ? '✓' : '✗'}</span><div><small>${q.section}</small><p>${esc(q.q)}</p><p class="mr-ans">${ok ? 'Correct' : `${answers[i] == null ? 'Not answered' : 'Your answer: ' + esc(q.options[answers[i]])} · Correct: <b>${esc(q.options[q.answer])}</b>`}</p></div></li>`;
      }).join('');
    }
    function updateTimer() {
      const left = Math.max(0, MOCK_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      timerEl.textContent = fmt(left);
      timerEl.classList.toggle('is-low', left <= 60);
      if (left === 0) finish();
    }
    function start() {
      state = 'running'; index = 0; answers = []; startedAt = Date.now();
      clearInterval(tick);
      tick = setInterval(updateTimer, 250);
      updateTimer();
      render();
      document.querySelector('.reg-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function finish() {
      clearInterval(tick);
      timeUsed = Math.min(MOCK_SECONDS, Math.round((Date.now() - startedAt) / 1000));
      state = 'done';
      render();
      result.querySelector('.step-title').focus({ preventScroll: true });
      save();
    }
    step.querySelector('[data-mock-start]').addEventListener('click', start);
    step.querySelector('[data-mock-retry]').addEventListener('click', start);
    step.querySelector('[data-mock-skip]').addEventListener('click', () => { state = 'choice'; answers = []; show(4); });
    step.querySelector('.mock-options').addEventListener('change', e => { answers[index] = +e.target.value; });
    prevBtn.addEventListener('click', () => { index = Math.max(0, index - 1); renderQuestion(); });
    qNextBtn.addEventListener('click', () => {
      if (index < QUESTIONS.length - 1) { index++; renderQuestion(); } else finish();
    });

    return {
      render,
      // leaving the step mid-test (e.g. tapping an earlier step) cancels the attempt
      leave() { if (state === 'running') { clearInterval(tick); state = 'choice'; } },
      summary: () => state === 'done'
        ? { taken: true, score: answers.filter((a, i) => a === QUESTIONS[i].answer).length, total: QUESTIONS.length, time: fmt(timeUsed), seconds: timeUsed }
        : { taken: false },
      // only a finished test is kept in the draft; a half-done test starts over
      saved: () => state === 'done' ? { answers, timeUsed } : null,
      restore(data) {
        if (!data || !Array.isArray(data.answers)) return;
        answers = data.answers.map(a => (a == null ? undefined : +a));
        timeUsed = data.timeUsed | 0;
        state = 'done';
      }
    };
  })();

  // ---------- collect & review ----------
  const val = name => (form.elements[name]?.value || '').trim();
  const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  function collect() {
    const members = [];
    for (let i = 1; i <= memberCount; i++) {
      const name = val(`m${i}_name`);
      if (!name) continue;
      members.push({ name, class: checked(`m${i}_class`)[0] || '', role: i === 1 ? 'Captain' : 'Member' });
    }
    const industry = checked('industry')[0] || '';
    return {
      team: { name: val('teamName'), school: val('school'), city: val('city'), category: category() },
      members,
      contact: { phone: val('phone'), email: val('email') },
      idea: { pitch: val('pitch'), industry: industry === 'Other' ? `Other: ${val('industryOther')}` : industry, problem: val('problem') },
      mockTest: mock.summary()
    };
  }
  function renderReview() {
    const d = collect();
    const row = (k, v) => v ? `<div class="rv-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '';
    const block = (title, step, body) => `<section class="rv-block"><div class="rv-head"><h3>${title}</h3><button type="button" class="rv-edit" data-goto="${step}">Edit</button></div><dl>${body}</dl></section>`;
    form.querySelector('.review').innerHTML =
      block('Team', 0, row('Name', d.team.name) + row('School', d.team.school) + row('City', d.team.city)) +
      block('Members', 1, d.members.map((m, i) => row(i === 0 ? 'Captain' : `Student ${i + 1}`, `${m.name} · Class ${m.class}`)).join('') + row('Category', d.team.category) + row('Contact', [d.contact.phone, d.contact.email].filter(Boolean).join(' · '))) +
      block('Idea', 2, row('In one line', d.idea.pitch) + row('Area', d.idea.industry) + row('Problem', d.idea.problem)) +
      block('Mock Test', 3, d.mockTest.taken ? row('Score', `${d.mockTest.score} / ${d.mockTest.total} in ${d.mockTest.time}`) : '<div class="rv-row"><dd class="rv-empty">Not taken. That’s fine, it was optional.</dd></div>');
  }
  form.querySelector('.review').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (b) show(+b.dataset.goto);
  });

  // ---------- submit ----------
  async function submit() {
    nextBtn.disabled = true;
    const label = nextBtn.innerHTML;
    nextBtn.textContent = 'Submitting…';
    try {
      const data = collect();
      const result = await window.IdeathonForms.submit('team', data);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage is optional */ }
      const done = document.querySelector('.reg-done');
      form.hidden = true;
      document.querySelector('.reg-progress').hidden = true;
      done.hidden = false;
      done.querySelector('[data-team]').textContent = data.team.name;
      done.querySelector('[data-reg-id]').textContent = result.id;
      done.querySelector('.done-preview').hidden = !result.preview;
      const text = `We just registered "${data.team.name}" for the MIIC × Codevidhya Ideathon 2026! Registration ID: ${result.id}. ${location.origin}${location.pathname.replace(/register\.html$/, '')}`;
      done.querySelector('[data-share]').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      savedLabel.textContent = '';
      done.focus();
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      formError.textContent = 'Could not submit right now. Check your internet and try again. Your answers are saved.';
      nextBtn.innerHTML = label;
    } finally {
      nextBtn.disabled = false;
    }
  }

  // ---------- draft autosave (this device only) ----------
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = { step: current, members: memberCount, mock: mock.saved(), fields: {} };
      for (const el of form.elements) {
        if (!el.name || el.type === 'button' || el.name.startsWith('mq')) continue;
        if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) (data.fields[el.name] ||= []).push(el.value); }
        else if (el.value) data.fields[el.name] = el.value;
      }
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
        savedLabel.textContent = 'Saved ✓';
      } catch { /* storage is optional */ }
    }, 400);
  }
  function restore() {
    let data;
    try { data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { data = null; }
    if (!data) return 0;
    setMemberCount(data.members);
    mock.restore(data.mock);
    Object.entries(data.fields || {}).forEach(([name, v]) => {
      const els = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      els.forEach(el => {
        if (el.type === 'radio' || el.type === 'checkbox') el.checked = Array.isArray(v) && v.includes(el.value);
        else el.value = v;
      });
    });
    form.consent.checked = false;
    form.querySelectorAll('[data-count]').forEach(el => el._counter?.());
    syncOther();
    updateBadge();
    savedLabel.textContent = 'Welcome back, your answers are restored';
    return Math.min(Math.max(0, data.step | 0), 3);
  }

  setMemberCount(MIN_MEMBERS);
  show(restore(), false, false);

  // ---------- pencil cursor (same as the main site) ----------
  const cursor = document.querySelector('.pencil-cursor');
  const fine = matchMedia('(pointer: fine) and (min-width: 701px)');
  let cx = 0, cy = 0, queued = false;
  const paint = () => { cursor.style.transform = `translate3d(${cx - 3}px, ${cy - 37}px, 0)`; queued = false; };
  addEventListener('pointermove', e => {
    if (!fine.matches || e.pointerType !== 'mouse') { document.documentElement.classList.remove('pencil-on'); cursor.style.opacity = '0'; return; }
    document.documentElement.classList.add('pencil-on');
    cx = e.clientX; cy = e.clientY;
    cursor.style.opacity = '1';
    cursor.classList.toggle('is-hover', Boolean(e.target.closest?.('a, button, label, input, textarea, [role="button"]')));
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') cursor.classList.add('is-down'); }, { passive: true });
  addEventListener('pointerup', () => cursor.classList.remove('is-down'), { passive: true });
  document.addEventListener('mouseout', e => { if (!e.relatedTarget) cursor.style.opacity = '0'; });
})();
