// Shared form submission for team and mentor registration, plus the mentor form on the home page.
(() => {
  'use strict';
  const endpoint = () => (window.IDEATHON_FORMS_ENDPOINT || '').trim();

  async function submit(type, data) {
    const payload = { type, submittedAt: new Date().toISOString(), page: location.href, ...data };
    if (!endpoint()) {
      console.info('[Ideathon forms] preview mode, not sent:', payload);
      await new Promise(r => setTimeout(r, 700));
      return { ok: true, preview: true, id: localId(type) };
    }
    // text/plain keeps this a "simple" request, which Google Apps Script accepts without a CORS preflight
    const res = await fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Server replied ${res.status}`);
    const out = await res.json().catch(() => ({}));
    if (out.ok === false) throw new Error(out.error || 'Submission failed');
    return { ok: true, preview: false, id: out.id || localId(type) };
  }
  function localId(type) {
    const n = Math.floor(1000 + Math.random() * 9000);
    return `${type === 'mentor' ? 'MEN' : 'IDT'}26-${n}`;
  }
  window.IdeathonForms = { submit, isPreview: () => !endpoint() };

  // ---- mentor form (home page) ----
  const form = document.getElementById('mentor-form');
  if (!form) return;
  const status = form.querySelector('.mf-status');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = '';
    form.classList.add('was-validated');
    const areas = [...form.querySelectorAll('input[name="areas"]:checked')].map(i => i.value);
    const areaBox = form.querySelector('.mf-areas');
    areaBox.classList.toggle('is-invalid', areas.length === 0);
    if (!form.checkValidity() || areas.length === 0) {
      status.textContent = areas.length === 0 ? 'Pick at least one area you can help with.' : 'Please fill in the highlighted fields.';
      (form.querySelector(':invalid') || areaBox).scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const f = new FormData(form);
    button.disabled = true;
    button.dataset.label = button.dataset.label || button.innerHTML;
    button.textContent = 'Sending…';
    try {
      const result = await submit('mentor', {
        name: f.get('name').trim(), email: f.get('email').trim(), phone: f.get('phone').trim(),
        program: f.get('program').trim(), areas, note: (f.get('note') || '').trim()
      });
      form.closest('.mentor-reg').classList.add('is-done');
      form.hidden = true;
      const done = document.getElementById('mentor-done');
      done.hidden = false;
      done.querySelector('[data-mentor-name]').textContent = f.get('name').trim().split(/\s+/)[0];
      done.querySelector('[data-preview-note]').hidden = !result.preview;
      done.focus();
    } catch (error) {
      status.textContent = 'Could not send right now. Please check your connection and try again.';
      console.error(error);
    } finally {
      button.disabled = false;
      button.innerHTML = button.dataset.label;
    }
  });
})();
