// Organization registration (schools, colleges, NGOs, learning centres): one short form, strict checks,
// then the organization's own student registration link (register.html?org=ORG26-0001) to share.
(() => {
  'use strict';
  const form = document.getElementById('org-form');
  const formError = form.querySelector('.form-error');
  const submitBtn = form.querySelector('[data-submit]');
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
  const NOT_ORG = /[^\p{L}\p{M}0-9 .,&'()/-]/gu;
  const NOT_PLACE = /[^\p{L}\p{M} .'()-]/gu;
  const FILTERS = {
    orgName: NOT_ORG, orgTypeOther: NOT_ORG, head: NOT_NAME, coordName: NOT_NAME, designation: NOT_ORG, city: NOT_PLACE,
    address: /[^\p{L}\p{M}0-9 .,&'()/#:-]/gu, coordEmail: /\s/g, phone: /\D/g, pincode: /\D/g, expected: /\D/g
  };
  form.phone.addEventListener('paste', e => {
    e.preventDefault();
    let d = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    form.phone.value = d.slice(0, 10);
    form.phone.dispatchEvent(new Event('input', { bubbles: true }));
  });
  form.addEventListener('focusout', e => {
    const el = e.target;
    if (el.tagName === 'INPUT' && !['radio', 'checkbox', 'hidden'].includes(el.type)) el.value = el.value.replace(/\s+/g, ' ').trim();
    if (el.name === 'coordEmail') el.value = el.value.toLowerCase();
  });

  // ---------- checks (same rules as the student form) ----------
  const letters = v => (v.match(/\p{L}/gu) || []).length;
  const repeated = v => /(.)\1{3,}/i.test(v.replace(/\s/g, ''));
  const NAME_RE = /^[\p{L}\p{M}]+(?:[ .'-]+[\p{L}\p{M}]+)*\.?$/u;
  const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  const EMAIL_TYPOS = { 'gamil.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.in': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmail.con': 'hotmail.com', 'outlook.con': 'outlook.com', 'rediffmail.con': 'rediffmail.com' };
  function nameProblem(v, who) {
    if (!v) return `Add ${who} full name.`;
    if (letters(v) < 2 || !NAME_RE.test(v)) return 'Use letters only, e.g. Anita Sharma.';
    if (repeated(v)) return 'That doesn’t look like a real name.';
    return '';
  }
  function emailProblem(v) {
    if (!v) return 'Add the coordinator’s email ID. We send the students’ link here.';
    if (!EMAIL_RE.test(v) || v.includes('..')) return 'That email doesn’t look right, e.g. name@school.edu.in.';
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

  // ---------- board only for schools; "Other" opens a box to type the type ----------
  const boardField = form.querySelector('[data-school-only]');
  const otherType = form.orgTypeOther;
  form.querySelectorAll('input[name="orgType"]').forEach(r => r.addEventListener('change', () => {
    boardField.hidden = r.value !== 'School';
    if (boardField.hidden) form.querySelectorAll('input[name="board"]').forEach(b => { b.checked = false; });
    otherType.hidden = r.value !== 'Other';
    if (otherType.hidden) otherType.value = ''; else otherType.focus();
  }));

  // ---------- city: searchable list of Indian cities ----------
  const city = (() => {
    const input = form.city;
    const stateInput = form.cityState;
    const list = document.getElementById('city-list');
    const POPULAR = ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar', 'Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Hyderabad', 'Ahmedabad', 'Pune', 'Lucknow'];
    const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
    const all = () => window.IDEATHON_CITIES || [];
    let items = [], active = -1;
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
      if (typed && letters(typed) >= 2 && !items.some(c => norm(c.city) === norm(typed))) items.push({ city: typed, state: 'Other', custom: true });
      active = -1;
      list.innerHTML = items.length
        ? items.map((c, i) => c.custom
          ? `<li role="option" id="city-opt-${i}" data-i="${i}" class="is-custom">Use “${esc(c.city)}”<small>Our city is not in the list</small></li>`
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
    }
    function highlight(i) {
      active = (i + items.length) % items.length;
      list.querySelectorAll('[role=option]').forEach((li, j) => li.classList.toggle('is-active', j === active));
      const li = list.querySelector(`#city-opt-${active}`);
      if (li) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    }
    input.addEventListener('input', () => { stateInput.value = ''; open(); });
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
    list.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-i]');
      e.preventDefault();
      if (li) choose(items[+li.dataset.i]);
    });
    input.addEventListener('blur', () => {
      if (!stateInput.value && input.value.trim()) {
        const hits = all().filter(c => norm(c.city) === norm(input.value));
        if (hits.length === 1) { input.value = hits[0].city; stateInput.value = hits[0].state; }
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
  function validate() {
    form.querySelectorAll('.is-invalid').forEach(clearError);
    const bad = [];
    const need = (field, problem) => { if (problem) { setError(field, problem); bad.push(field); } };
    const fieldOf = name => form.elements[name].closest('.field');
    const type = checked('orgType')[0], typed = val('orgTypeOther');
    need(form.querySelector('[data-required-group="orgType"]'), !type ? 'Choose the type of organization.'
      : type === 'Other' && (letters(typed) < 3 || repeated(typed)) ? 'Type your organization type, e.g. Science club.' : '');
    const n = val('orgName');
    need(fieldOf('orgName'), !n ? 'Add the organization’s full name.' : letters(n) < 3 || repeated(n) ? 'Type the organization’s full name.' : '');
    need(fieldOf('city'), city.problem());
    const a = val('address');
    need(fieldOf('address'), !a ? 'Add the address (building, street, area).' : letters(a) < 4 || repeated(a) ? 'Type a complete address.' : '');
    const pin = val('pincode');
    need(fieldOf('pincode'), !pin ? 'Add the 6-digit pincode.' : !/^[1-9]\d{5}$/.test(pin) ? 'A pincode has 6 digits and does not start with 0.' : '');
    need(fieldOf('head'), nameProblem(val('head'), 'the principal’s or director’s'));
    need(fieldOf('coordName'), nameProblem(val('coordName'), 'the coordinator’s'));
    const d = val('designation');
    need(fieldOf('designation'), !d ? 'Add the coordinator’s designation.' : letters(d) < 2 || repeated(d) ? 'Type a designation, e.g. Computer Teacher.' : '');
    need(fieldOf('coordEmail'), emailProblem(val('coordEmail')));
    need(fieldOf('phone'), phoneProblem(val('phone')));
    need(form.querySelector('[data-required-group="grades"]'), checked('grades').length ? '' : 'Pick at least one group of grades.');
    const ex = val('expected');
    need(fieldOf('expected'), ex && (+ex < 1 || +ex > 10000) ? 'Type a number between 1 and 10,000, or leave it empty.' : '');
    need(form.consent.closest('.field'), form.consent.checked && form.parentConsent.checked ? '' : 'Please tick both boxes to register.');
    if (bad.length) {
      formError.textContent = bad.length === 1 ? 'One thing needs a quick fix.' : `${bad.length} things need a quick fix.`;
      bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      (bad[0].querySelector('input:not([type=radio]):not([type=checkbox]):not([type=hidden])') || bad[0].querySelector('input'))?.focus({ preventScroll: true });
      return false;
    }
    formError.textContent = '';
    return true;
  }
  form.addEventListener('input', e => {
    const bad = FILTERS[e.target.name];
    if (bad) keepOnly(e.target, bad);
    clearError(e.target.closest('.field'));
    if (!form.querySelector('.is-invalid')) formError.textContent = '';
  });

  // ---------- submit ----------
  function collect() {
    return {
      orgType: checked('orgType')[0] === 'Other' ? `Other: ${val('orgTypeOther')}` : checked('orgType')[0] || '',
      name: val('orgName'),
      board: checked('board')[0] || '',
      city: city.label(),
      address: val('address'),
      pincode: val('pincode'),
      head: val('head'),
      coordinator: { name: val('coordName'), designation: val('designation'), email: val('coordEmail').toLowerCase(), phone: '+91 ' + val('phone') },
      grades: checked('grades'),
      expected: val('expected')
    };
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validate()) return;
    submitBtn.disabled = true;
    const label = submitBtn.innerHTML;
    submitBtn.textContent = 'Registering…';
    try {
      const data = collect();
      const result = await window.IdeathonForms.submit('organization', data);
      const site = `${location.origin}${location.pathname.replace(/organization\.html$/, '')}`;
      const link = `${site}register.html?org=${encodeURIComponent(result.id)}`;
      const done = document.querySelector('.reg-done');
      form.hidden = true;
      done.hidden = false;
      done.querySelector('[data-org-name]').textContent = data.name;
      done.querySelector('[data-org-id]').textContent = result.id;
      done.querySelector('[data-org-link]').value = link;
      done.querySelector('[data-org-email]').textContent = data.coordinator.email;
      done.querySelector('.done-preview').hidden = !result.preview;
      const text = `The MIIC × Codevidhya Ideathon 2026 is open for students of Grades 6–8 and 9–12 at ${data.name}. Register on your own or as a team of up to 6, in about 5 minutes: ${link}`;
      done.querySelector('[data-share]').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      done.focus();
      done.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error(error);
      formError.textContent = 'Could not register right now. Check your internet and try again.';
      submitBtn.innerHTML = label;
    } finally {
      submitBtn.disabled = false;
    }
  });
  const copyBtn = document.querySelector('[data-copy]');
  copyBtn.addEventListener('click', async () => {
    const input = document.querySelector('[data-org-link]');
    try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
    copyBtn.textContent = 'Copied ✓';
  });
})();
