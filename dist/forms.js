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
  const MAX_FILE = 5 * 1024 * 1024;
  const fileInput = form.querySelector('input[name="profile"]');
  const upload = fileInput.closest('.mf-upload');
  const dropText = upload.querySelector('.mf-drop-text');
  const dropDefault = dropText.innerHTML;
  const fileError = () => {
    const file = fileInput.files[0];
    if (!file) return '';
    if (file.size > MAX_FILE) return 'That file is over 5 MB. Please pick a smaller one.';
    if (!/\.(pdf|docx?|jpe?g|png)$/i.test(file.name)) return 'Please upload a PDF, Word file or image.';
    return '';
  };
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    upload.classList.toggle('has-file', !!file);
    upload.classList.toggle('is-invalid', !!fileError());
    dropText.innerHTML = file ? `<b>${file.name.replace(/[&<>"]/g, '')}</b> · ${file.size < 1048576 ? Math.max(1, Math.round(file.size / 1024)) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB'} · tap to change` : dropDefault;
    status.textContent = fileError();
  });
  // the file travels inside the JSON as base64; the Apps Script saves it to Google Drive
  const readFile = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type || 'application/octet-stream', data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = '';
    form.classList.add('was-validated');
    const areas = [...form.querySelectorAll('input[name="areas"]:checked')].map(i => i.value);
    const areaBox = form.querySelector('.mf-areas');
    areaBox.classList.toggle('is-invalid', areas.length === 0);
    const badFile = fileError();
    if (!form.checkValidity() || areas.length === 0 || badFile) {
      status.textContent = areas.length === 0 ? 'Pick at least one area you can help with.' : badFile || 'Please fill in the highlighted fields.';
      (form.querySelector(':invalid') || (badFile ? upload : areaBox)).scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const f = new FormData(form);
    button.disabled = true;
    button.dataset.label = button.dataset.label || button.innerHTML;
    button.textContent = 'Sending…';
    try {
      const result = await submit('mentor', {
        name: f.get('name').trim(), email: f.get('email').trim(), phone: f.get('phone').trim(),
        program: f.get('program').trim(), areas, note: (f.get('note') || '').trim(),
        profile: fileInput.files[0] ? await readFile(fileInput.files[0]) : null
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
