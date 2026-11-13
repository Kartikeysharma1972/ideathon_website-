// Registration: individual innovator or team, a short step-by-step form with autosave, strict validation and a review screen.
(() => {
  'use strict';
  const form = document.getElementById('reg-form');
  const steps = [...form.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.reg-steps li')];
  const bar = document.querySelector('.reg-bar i');
  const backBtn = form.querySelector('[data-back]');
  const nextBtn = form.querySelector('[data-next]');
  const formError = form.querySelector('.form-error');
  const joinFields = form.querySelector('.join-fields');
  const membersBox = form.querySelector('.members');
  const addMemberBtn = form.querySelector('[data-add-member]');
  const badge = form.querySelector('.category-badge');
  const savedLabel = document.querySelector('.reg-saved');
  const DRAFT_KEY = 'ideathon-reg-draft-v2';
  const LABELS = ['Basic Details', 'Idea', 'Mock Test', 'Review'];
  const STEP_MOCK = 2, STEP_REVIEW = 3;
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
  // a team is 2 to 6 students; an individual innovator is just one
  const TEAM_MIN = 2, MAX_MEMBERS = 6, MAX_CUSTOM_DOMAINS = 5;
  let current = 0;
  let joinType = '';
  let teamCount = TEAM_MIN;
  const isTeam = () => joinType === 'team';
  const count = () => (isTeam() ? teamCount : joinType ? 1 : 0);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const val = name => (form.elements[name]?.value || '').trim();
  const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);

  // ---------- typing filters: wrong characters never get into the box ----------
  function keepOnly(el, bad) {
    const before = el.value;
    const after = before.replace(bad, '');
    if (after === before) return;
    const caret = el.selectionStart - (before.slice(0, el.selectionStart).length - before.slice(0, el.selectionStart).replace(bad, '').length);
    el.value = after;
    try { el.setSelectionRange(caret, caret); } catch { /* not every input type has a caret */ }
  }
  const NOT_NAME = /[^\p{L}\p{M} .'-]/gu;
  const NOT_TEAM = /[^\p{L}\p{M}0-9 .&'-]/gu;
  const NOT_SCHOOL = /[^\p{L}\p{M}0-9 .,&'()/-]/gu;
  const NOT_PLACE = /[^\p{L}\p{M} .'()-]/gu;
  const NOT_DOMAIN = /[^\p{L}\p{M} &/-]/gu;
  const FILTERS = { teamName: NOT_TEAM, school: NOT_SCHOOL, city: NOT_PLACE, industryOther: NOT_DOMAIN };
  function filterFor(el) {
    if (el.name === 'phone') return /\D/g;
    if (/^m\d_name$/.test(el.name)) return NOT_NAME;
    if (/^m\d_email$/.test(el.name)) return /\s/g;
    return FILTERS[el.name];
  }
  // a pasted "+91 98765-43210" or "098765 43210" becomes the plain 10 digits
  function tenDigits(text) {
    let d = String(text).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.slice(0, 10);
  }
  form.phone.addEventListener('paste', e => {
    e.preventDefault();
    form.phone.value = tenDigits((e.clipboardData || window.clipboardData).getData('text'));
    form.phone.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // tidy spaces when leaving a box
  form.addEventListener('focusout', e => {
    const el = e.target;
    if (el.tagName === 'INPUT' && !['radio', 'checkbox', 'hidden'].includes(el.type) && el.name !== 'phone') {
      const tidy = el.value.replace(/\s+/g, ' ').trim();
      if (tidy !== el.value) { el.value = tidy; save(); }
    }
    if (/_email$/.test(el.name)) el.value = el.value.toLowerCase();
  });

  // ---------- checks ----------
  const letters = v => (v.match(/\p{L}/gu) || []).length;
  const NAME_RE = /^[\p{L}\p{M}]+(?:[ .'-]+[\p{L}\p{M}]+)*\.?$/u;
  const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  const EMAIL_TYPOS = { 'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.in': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmail.con': 'hotmail.com', 'outlook.con': 'outlook.com', 'rediffmail.con': 'rediffmail.com' };
  const repeated = v => /(.)\1{3,}/i.test(v.replace(/\s/g, ''));
  function nameProblem(v, who) {
    if (!v) return `Add ${who} full name.`;
    if (letters(v) < 2 || !NAME_RE.test(v)) return 'Use letters only, e.g. Riya Sharma.';
    if (repeated(v)) return 'That doesn’t look like a real name.';
    return '';
  }
  function emailProblem(v) {
    if (!v) return 'Add an email ID (a parent’s is fine).';
    if (!EMAIL_RE.test(v) || v.includes('..')) return 'That email doesn’t look right, e.g. name@gmail.com.';
    const domain = v.split('@')[1].toLowerCase();
    if (EMAIL_TYPOS[domain]) return `Did you mean ${v.split('@')[0]}@${EMAIL_TYPOS[domain]}?`;
    return '';
  }
  function phoneProblem(v) {
    if (!v) return 'Add a 10-digit mobile number.';
    if (!/^\d{10}$/.test(v)) return `A mobile number has exactly 10 digits (you typed ${v.length}).`;
    if (!/^[6-9]/.test(v)) return 'Indian mobile numbers start with 6, 7, 8 or 9.';
    if (/^(\d)\1{9}$/.test(v)) return 'Please type a real mobile number.';
    return '';
  }

  // ---------- members ----------
  const tpl = document.getElementById('member-tpl');
  for (let i = 1; i <= MAX_MEMBERS; i++) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.member = i;
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
  const getMember = i => ({ name: val(`m${i}_name`), email: val(`m${i}_email`), cls: checked(`m${i}_class`)[0] || '' });
  function setMember(i, m) {
    form.elements[`m${i}_name`].value = m.name;
    form.elements[`m${i}_email`].value = m.email;
    form.querySelectorAll(`input[name="m${i}_class"]`).forEach(r => { r.checked = r.value === m.cls; });
  }
  function renderMembers() {
    const n = count();
    for (let i = 1; i <= MAX_MEMBERS; i++) {
      const node = memberNode(i);
      node.hidden = i > n;
      node.querySelector('.member-no').textContent = !isTeam() ? 'Your details' : i === 1 ? 'Student 1' : `Student ${i}`;
      node.querySelector('.member-role').textContent = isTeam() && i === 1 ? 'Team captain' : '';
      node.querySelector('[data-remove-member]').hidden = !isTeam() || i <= TEAM_MIN;
    }
    const first = memberNode(1);
    first.querySelector('[data-k="name"]').placeholder = isTeam() ? 'Captain’s full name' : 'Your full name';
    first.querySelector('[data-k="email"]').placeholder = isTeam() ? 'Captain’s or parent’s email' : 'Your or your parent’s email';
    addMemberBtn.hidden = !isTeam() || teamCount >= MAX_MEMBERS;
    addMemberBtn.textContent = `+ Add member (${teamCount} of ${MAX_MEMBERS})`;
    updateBadge();
  }
  addMemberBtn.addEventListener('click', () => {
    teamCount = Math.min(MAX_MEMBERS, teamCount + 1);
    renderMembers();
    memberNode(teamCount).querySelector('input').focus();
    save();
  });
  // removing a student moves the ones below up, so the numbering never has gaps
  membersBox.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-member]');
    if (!btn) return;
    const i = +btn.closest('.member').dataset.member;
    for (let j = i; j < teamCount; j++) setMember(j, getMember(j + 1));
    setMember(teamCount, { name: '', email: '', cls: '' });
    teamCount = Math.max(TEAM_MIN, teamCount - 1);
    renderMembers();
    addMemberBtn.focus();
    save();
  });

  function applyJoinType(type) {
    joinType = type === 'team' || type === 'individual' ? type : '';
    joinFields.hidden = !joinType;
    form.querySelectorAll('[data-team-only]').forEach(el => { el.hidden = !isTeam(); });
    form.querySelector('[data-contact-title]').textContent = isTeam() ? 'How can we reach your team?' : 'How can we reach you?';
    renderMembers();
  }
  form.querySelectorAll('input[name="joinType"]').forEach(r => r.addEventListener('change', () => {
    applyJoinType(r.value);
    memberNode(1).querySelector('input').focus({ preventScroll: true });
  }));

  function classes() {
    const out = [];
    for (let i = 1; i <= count(); i++) {
      const v = checked(`m${i}_class`)[0];
      if (v) out.push(+v);
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

  // ---------- city: searchable list of Indian cities ----------
  const city = (() => {
    const input = form.city;
    const stateInput = form.cityState;
    const list = document.getElementById('city-list');
    const POPULAR = ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar', 'Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Hyderabad', 'Ahmedabad', 'Pune', 'Lucknow'];
    const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
    let items = [], active = -1;
    const all = () => window.IDEATHON_CITIES || [];
    function search(q) {
      const n = norm(q);
      if (!n) return POPULAR.map(p => all().find(c => c.city === p)).filter(Boolean);
      const starts = [], inside = [];
      for (const c of all()) {
        const k = norm(c.city);
        if (k.startsWith(n)) starts.push(c);
        else if (n.length > 2 && (k.includes(n) || norm(c.state).startsWith(n))) inside.push(c);
      }
      return starts.concat(inside).slice(0, 60);
    }
    function open() {
      const typed = input.value.trim();
      items = search(typed);
      const exact = items.some(c => norm(c.city) === norm(typed));
      if (typed && letters(typed) >= 2 && !exact) items.push({ city: typed, state: 'Other', custom: true });
      active = -1;
      list.innerHTML = items.length
        ? items.map((c, i) => c.custom
          ? `<li role="option" id="city-opt-${i}" data-i="${i}" class="is-custom">Use “${esc(c.city)}”<small>My city is not in the list</small></li>`
          : `<li role="option" id="city-opt-${i}" data-i="${i}">${esc(c.city)}<small>${esc(c.state)}</small></li>`).join('')
        : '<li class="combo-empty">Type your city’s name</li>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function choose(c) {
      input.value = c.city;
      stateInput.value = c.state;
      close();
      clearError(input.closest('.field'));
      save();
    }
    function highlight(i) {
      active = (i + items.length) % items.length;
      list.querySelectorAll('[role=option]').forEach((li, j) => li.classList.toggle('is-active', j === active));
      const li = list.querySelector(`#city-opt-${active}`);
      if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    }
    input.addEventListener('input', () => { keepOnly(input, NOT_PLACE); stateInput.value = ''; open(); });
    input.addEventListener('focus', open);
    input.closest('.combo').querySelector('.combo-caret').addEventListener('click', () => input.focus());
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) open();
        if (items.length) highlight(active + (e.key === 'ArrowDown' ? 1 : -1));
      } else if (e.key === 'Enter' && !list.hidden) {
        e.preventDefault(); e.stopPropagation();
        const pick = items[active] || (items.length === 1 ? items[0] : items.find(c => norm(c.city) === norm(input.value)));
        if (pick) choose(pick);
      } else if (e.key === 'Escape') close();
    });
    // mousedown keeps focus in the box so the choice lands before blur
    list.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-i]');
      e.preventDefault();
      if (li) choose(items[+li.dataset.i]);
    });
    input.addEventListener('blur', () => {
      // a typed name that matches exactly one listed city counts as picked
      if (!stateInput.value && input.value.trim()) {
        const hits = all().filter(c => norm(c.city) === norm(input.value));
        if (hits.length === 1) { input.value = hits[0].city; stateInput.value = hits[0].state; save(); }
      }
      setTimeout(close, 120);
    });
    return {
      label: () => (stateInput.value && stateInput.value !== 'Other' ? `${val('city')}, ${stateInput.value}` : val('city')),
      problem() {
        const v = val('city');
        if (!v) return 'Pick your city from the list.';
        if (!stateInput.value) return 'Pick your city from the list (or tap “Use …” if it is not there).';
        if (stateInput.value === 'Other' && (letters(v) < 2 || repeated(v))) return 'That doesn’t look like a city name.';
        return '';
      }
    };
  })();

  // ---------- registering through an organization's link (register.html?org=ORG26-0001) ----------
  const orgParam = (new URLSearchParams(location.search).get('org') || '').trim().toUpperCase();
  const organization = { id: /^ORG26-\d{4}$/.test(orgParam) ? orgParam : '', name: '' };
  if (organization.id) {
    const banner = form.querySelector('[data-org-banner]');
    form.querySelector('[data-org-card]').hidden = true;
    banner.hidden = false;
    banner.innerHTML = `Registering through your organization (<b>${organization.id}</b>).`;
    window.IdeathonForms.lookupOrganization(organization.id).then(org => {
      if (!org) return;
      organization.name = org.name;
      const isSchool = org.type === 'School';
      banner.innerHTML = `Registering through <b>${esc(org.name)}</b>${org.city ? `, ${esc(org.city)}` : ''}. ${isSchool ? 'Your school and city are' : 'Your city is'} filled in for you.`;
      if (isSchool && !val('school')) form.school.value = org.name;
      if (org.city && !val('city')) {
        const [c, ...state] = org.city.split(', ');
        form.city.value = c;
        form.cityState.value = state.join(', ') || 'Other';
      }
      save();
    }).catch(() => { /* the registration is still tagged with the ID even if the lookup fails */ });
  }

  // ---------- domains: chips plus your own ("Others") ----------
  const otherToggle = form.querySelector('input[name="industryOtherToggle"]');
  const otherRow = form.querySelector('.other-row');
  const otherInput = form.industryOther;
  const customBox = form.querySelector('.custom-chips');
  const customDomains = () => [...customBox.querySelectorAll('input')].map(i => i.value);
  function addDomainChip(text, on = true) {
    const chip = document.createElement('label');
    chip.className = 'chip chip-custom';
    chip.innerHTML = `<input type="checkbox" name="industry" data-custom><span>${esc(text)} <i aria-hidden="true">×</i></span>`;
    chip.querySelector('input').value = text;
    chip.querySelector('input').checked = on;
    customBox.appendChild(chip);
  }
  function syncOther() { otherRow.hidden = !otherToggle.checked; }
  // returns an error message, or '' when the typed domain was added (or there was nothing to add)
  function addTypedDomain() {
    const text = otherInput.value.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    if (letters(text) < 2 || repeated(text)) return 'Type a real domain name, e.g. Sports.';
    const existing = [...form.querySelectorAll('input[name="industry"]')].find(i => i.value.toLowerCase() === text.toLowerCase() || i.nextElementSibling.textContent.replace('×', '').trim().toLowerCase() === text.toLowerCase());
    if (existing) existing.checked = true;
    else if (customDomains().length >= MAX_CUSTOM_DOMAINS) return `You can add up to ${MAX_CUSTOM_DOMAINS} of your own domains.`;
    else addDomainChip(text);
    otherInput.value = '';
    clearError(form.querySelector('[data-required-group="industry"]'));
    save();
    return '';
  }
  form.querySelector('[data-add-domain]').addEventListener('click', () => {
    const problem = addTypedDomain();
    const group = form.querySelector('[data-required-group="industry"]');
    if (problem) setError(group, problem); else otherInput.focus();
  });
  otherInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); form.querySelector('[data-add-domain]').click(); }
  });
  // unticking one of your own domains removes it
  customBox.addEventListener('change', e => { if (!e.target.checked) { e.target.closest('.chip').remove(); save(); } });
  otherToggle.addEventListener('change', () => { syncOther(); if (otherToggle.checked) otherInput.focus(); });

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

  function validateStep(n) {
    const step = steps[n];
    step.querySelectorAll('.is-invalid').forEach(clearError);
    const bad = [];
    const need = (field, problem) => { if (problem) { setError(field, problem); bad.push(field); } };
    const fieldOf = name => form.elements[name].closest('.field');

    if (n === 0) {
      need(form.querySelector('[data-join-field]'), joinType ? '' : 'Choose “Individual innovator” or “We are a team”.');
      if (joinType) {
        const seen = new Set();
        for (let i = 1; i <= count(); i++) {
          const m = getMember(i);
          const who = !isTeam() ? 'your' : i === 1 ? 'the captain’s' : `student ${i}’s`;
          let nameIssue = nameProblem(m.name, who);
          if (!nameIssue && seen.has(m.name.toLowerCase())) nameIssue = 'This student is already added.';
          seen.add(m.name.toLowerCase());
          need(fieldOf(`m${i}_name`), nameIssue);
          need(fieldOf(`m${i}_email`), emailProblem(m.email));
          need(memberNode(i).querySelector('.class-field'), m.cls ? '' : 'Tap the grade.');
        }
        if (isTeam()) {
          const t = val('teamName');
          need(fieldOf('teamName'), !t ? 'Give your team a name (or tap Suggest).' : letters(t) < 2 ? 'A team name needs at least 2 letters.' : '');
        }
        const s = val('school');
        need(fieldOf('school'), !s ? 'Which school are you from?' : letters(s) < 3 || repeated(s) ? 'Type your school’s full name.' : '');
        need(fieldOf('city'), city.problem());
        need(fieldOf('phone'), phoneProblem(val('phone')));
      }
    }
    if (n === 1) {
      const p = val('pitch');
      need(fieldOf('pitch'), !p ? 'Describe your idea in one line.' : p.split(/\s+/).length < 3 || letters(p) < 8 || repeated(p) ? 'Tell us a bit more: a few words about your idea.' : '');
      const group = form.querySelector('[data-required-group="industry"]');
      const typedIssue = otherToggle.checked ? addTypedDomain() : '';
      need(group, typedIssue || (checked('industry').length ? '' : otherToggle.checked ? 'Type your domain and tap Add.' : 'Pick at least one domain.'));
    }
    if (n === STEP_REVIEW) need(form.consent.closest('.field'), form.consent.checked ? '' : 'Please tick this box to submit.');

    if (bad.length) {
      formError.textContent = bad.length === 1 ? 'One thing needs a quick fix.' : `${bad.length} things need a quick fix.`;
      bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = bad[0].querySelector('input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea') || bad[0].querySelector('input');
      focusable?.focus({ preventScroll: true });
      return false;
    }
    formError.textContent = '';
    return true;
  }
  form.addEventListener('input', e => {
    const bad = filterFor(e.target);
    if (bad) keepOnly(e.target, bad);
    clearError(e.target.closest('.field'));
    if (!form.querySelector('.is-invalid')) formError.textContent = '';
    if (e.target.name?.endsWith('_class')) updateBadge();
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
    nextBtn.innerHTML = n === steps.length - 1 ? 'Submit registration <span>↗︎</span>' : `Next: ${LABELS[n + 1]} <span>→</span>`;
    formError.textContent = '';
    if (n === STEP_MOCK) mock.render(); else mock.leave();
    if (n === STEP_REVIEW) renderReview();
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

  // ---------- mock test (optional practice for the Round 1 aptitude test) ----------
  const MOCK_SECONDS = 5 * 60;
  // two practice tests with different questions: Junior (classes 6–8) and Senior (classes 9–12)
  const TESTS = {
    junior: { label: 'Classes 6–8th', questions: [
      { section: 'Logical Reasoning', q: 'What comes next in the series: 2, 4, 8, 16, ?', options: ['18', '24', '32', '30'], answer: 2 },
      { section: 'Numerical Ability', q: 'One pencil costs ₹5. How much do 12 pencils cost?', options: ['₹50', '₹60', '₹55', '₹65'], answer: 1 },
      { section: 'Verbal Ability', q: 'Which word means the opposite of “ancient”?', options: ['Old', 'Historic', 'Modern', 'Antique'], answer: 2 },
      { section: 'Problem Solving', q: 'The school bus leaves at 7:30 am and takes 45 minutes to reach school. When does it reach?', options: ['8:00 am', '8:15 am', '8:30 am', '8:45 am'], answer: 1 },
      { section: 'Innovation Thinking', q: 'What is the best first step when building a new idea?', options: ['Pick a cool name', 'Understand the problem people face', 'Buy expensive equipment', 'Copy a popular app'], answer: 1 }
    ] },
    senior: { label: 'Classes 9–12th', questions: [
      { section: 'Logical Reasoning', q: 'What comes next in the series: 3, 9, 27, 81, ?', options: ['162', '243', '108', '324'], answer: 1 },
      { section: 'Numerical Ability', q: 'A ₹450 bag is on sale at 20% off. How much do you pay?', options: ['₹360', '₹350', '₹380', '₹400'], answer: 0 },
      { section: 'Verbal Ability', q: 'Which word is closest in meaning to “innovative”?', options: ['Traditional', 'Creative', 'Careless', 'Ordinary'], answer: 1 },
      { section: 'Problem Solving', q: 'A train leaves at 9:40 am and the journey takes 2 hours 35 minutes. When does it arrive?', options: ['12:05 pm', '12:15 pm', '11:55 am', '12:25 pm'], answer: 1 },
      { section: 'Innovation Thinking', q: 'A survey shows students skip breakfast because they are running late. Which idea tackles the real cause?', options: ['A poster about healthy food', 'Grab-and-go breakfast at the school gate', 'A cooking competition', 'A longer lunch break'], answer: 1 }
    ] }
  };
  let QUESTIONS = TESTS.junior.questions;
  const mock = (() => {
    const step = steps[STEP_MOCK];
    const intro = step.querySelector('.mock-intro');
    const test = step.querySelector('.mock-test');
    const result = step.querySelector('.mock-result');
    const timerEl = step.querySelector('.mock-timer');
    const countEl = step.querySelector('.mock-count');
    const track = step.querySelector('.mock-track i');
    const prevBtn = step.querySelector('[data-mock-prev]');
    const qNextBtn = step.querySelector('[data-mock-next]');
    // state: 'choice' (not started or said no) | 'running' | 'done'
    let state = 'choice', index = 0, answers = [], startedAt = 0, timeUsed = 0, tick, level = 'junior';
    const levelInputs = [...step.querySelectorAll('input[name="mockLevel"]')];
    function setLevel(l) { level = TESTS[l] ? l : 'junior'; QUESTIONS = TESTS[level].questions; }

    step.querySelector('.mock-sections').innerHTML = QUESTIONS.map(q => `<span>${q.section}</span>`).join('');
    const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    function render() {
      intro.hidden = state !== 'choice';
      test.hidden = state !== 'running';
      result.hidden = state !== 'done';
      // the test has its own buttons; the main Next only appears once there is a result
      nextBtn.hidden = state !== 'done';
      backBtn.hidden = state === 'running';
      // suggest the test that matches the grades until they pick one
      if (state === 'choice' && !levelInputs.some(i => i.checked)) {
        const c = classes();
        levelInputs.find(i => i.value === (c.length && c.every(x => x >= 9) ? 'senior' : 'junior')).checked = true;
      }
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
      step.querySelector('[data-mock-level]').textContent = `${TESTS[level].label} test`;
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
      setLevel(levelInputs.find(i => i.checked)?.value);
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
    step.querySelector('[data-mock-skip]').addEventListener('click', () => { state = 'choice'; answers = []; show(STEP_REVIEW); });
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
        ? { taken: true, level: TESTS[level].label, score: answers.filter((a, i) => a === QUESTIONS[i].answer).length, total: QUESTIONS.length, time: fmt(timeUsed), seconds: timeUsed }
        : { taken: false },
      // only a finished test is kept in the draft; a half-done test starts over
      saved: () => state === 'done' ? { answers, timeUsed, level } : null,
      restore(data) {
        if (!data || !Array.isArray(data.answers)) return;
        answers = data.answers.map(a => (a == null ? undefined : +a));
        timeUsed = data.timeUsed | 0;
        setLevel(data.level);
        state = 'done';
      }
    };
  })();

  // ---------- collect & review ----------
  function collect() {
    const members = [];
    for (let i = 1; i <= count(); i++) {
      const m = getMember(i);
      members.push({ name: m.name, email: m.email.toLowerCase(), class: m.cls, role: !isTeam() ? 'Individual' : i === 1 ? 'Captain' : 'Member' });
    }
    return {
      registrationType: isTeam() ? 'Team' : 'Individual',
      team: { name: isTeam() ? val('teamName') : '', school: val('school'), city: city.label(), category: category(), orgId: organization.id },
      members,
      contact: { phone: '+91 ' + val('phone') },
      idea: { pitch: val('pitch'), industry: checked('industry').join(', '), problem: val('problem') },
      mockTest: mock.summary()
    };
  }
  function renderReview() {
    const d = collect();
    const row = (k, v) => v ? `<div class="rv-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '';
    const block = (title, step, body) => `<section class="rv-block"><div class="rv-head"><h3>${title}</h3><button type="button" class="rv-edit" data-goto="${step}">Edit</button></div><dl>${body}</dl></section>`;
    const people = d.members.map((m, i) => row(!isTeam() ? 'Name' : i === 0 ? 'Captain' : `Student ${i + 1}`, `${m.name} · Grade ${m.class} · ${m.email}`)).join('');
    form.querySelector('.review').innerHTML =
      block('Basic Details', 0, row('Joining as', isTeam() ? `A team of ${d.members.length}` : 'Individual innovator') + people + row('Team name', d.team.name) +
        row('Category', d.team.category) + row('Organization', organization.name || organization.id) + row('School', d.team.school) + row('City', d.team.city) + row('Contact', d.contact.phone)) +
      block('Idea', 1, row('In one line', d.idea.pitch) + row('Domain', d.idea.industry) + row('Problem', d.idea.problem)) +
      block('Mock Test', STEP_MOCK, d.mockTest.taken ? row('Test', d.mockTest.level) + row('Score', `${d.mockTest.score} / ${d.mockTest.total} in ${d.mockTest.time}`) : '<div class="rv-row"><dd class="rv-empty">Not taken. That’s fine, it was optional.</dd></div>');
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
      // stop any pending autosave first, or it would write the finished form back as a draft
      submitted = true;
      clearTimeout(saveTimer);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage is optional */ }
      const done = document.querySelector('.reg-done');
      const shownName = isTeam() ? data.team.name : data.members[0].name.split(' ')[0];
      form.hidden = true;
      document.querySelector('.reg-progress').hidden = true;
      done.hidden = false;
      done.querySelector('[data-team]').textContent = shownName;
      done.querySelector('[data-reg-id]').textContent = result.id;
      done.querySelector('.done-preview').hidden = !result.preview;
      done.querySelector('.done-buddy').hidden = isTeam();
      const site = `${location.origin}${location.pathname.replace(/register\.html$/, '')}`;
      const text = isTeam()
        ? `We just registered "${data.team.name}" for the MIIC × Codevidhya Ideathon 2026! Registration ID: ${result.id}. ${site}`
        : `I just registered for the MIIC × Codevidhya Ideathon 2026! Want to team up? ${site}`;
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
  let saveTimer, submitted = false;
  function save() {
    clearTimeout(saveTimer);
    if (submitted) return;
    saveTimer = setTimeout(() => {
      const data = { step: current, joinType, teamCount, custom: customDomains(), mock: mock.saved(), fields: {} };
      for (const el of form.elements) {
        if (!el.name || el.type === 'button' || el.name.startsWith('mq') || el.name === 'consent') continue;
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
    teamCount = Math.min(MAX_MEMBERS, Math.max(TEAM_MIN, data.teamCount | 0));
    (Array.isArray(data.custom) ? data.custom : []).slice(0, MAX_CUSTOM_DOMAINS).forEach(t => addDomainChip(String(t), false));
    mock.restore(data.mock);
    Object.entries(data.fields || {}).forEach(([name, v]) => {
      form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach(el => {
        if (el.type === 'radio' || el.type === 'checkbox') el.checked = Array.isArray(v) && v.includes(el.value);
        else el.value = v;
      });
    });
    applyJoinType(data.joinType);
    form.querySelectorAll('[data-count]').forEach(el => el._counter?.());
    syncOther();
    savedLabel.textContent = 'Welcome back, your answers are restored';
    return Math.min(Math.max(0, data.step | 0), STEP_MOCK);
  }

  applyJoinType('');
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
    cursor.classList.toggle('is-hover', Boolean(e.target.closest?.('a, button, label, input, textarea, [role="button"], [role="option"]')));
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') cursor.classList.add('is-down'); }, { passive: true });
  addEventListener('pointerup', () => cursor.classList.remove('is-down'), { passive: true });
  document.addEventListener('mouseout', e => { if (!e.relatedTarget) cursor.style.opacity = '0'; });
})();
