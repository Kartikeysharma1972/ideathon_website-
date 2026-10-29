/**
 * Ideathon 2026 registrations → Google Sheet.
 * Receives team and mentor registrations from the website (forms.js) and appends one row each
 * to the "Teams" or "Mentors" tab of the spreadsheet this script is bound to.
 * Setup: see backend/SETUP.md.
 */
const TEAM_HEADERS = [
  'Registration ID', 'Submitted at', 'Team Name', 'School Name', 'City', 'Category', 'Team size',
  'Captain name', 'Captain class',
  'Student 2 name', 'Student 2 class',
  'Student 3 name', 'Student 3 class',
  'Student 4 name', 'Student 4 class',
  'Student 5 name', 'Student 5 class',
  'WhatsApp Number', 'Email',
  'Idea (one line)', 'Area', 'Problem (optional)',
  'Mock test taken?', 'Mock test score', 'Mock test time'
];
const MENTOR_HEADERS = ['Registration ID', 'Submitted at', 'Full Name', 'Email', 'WhatsApp Number', 'Branch & Year', 'Can help with', 'Note', 'Profile file'];
// uploaded mentor profiles (CV / resume) are saved in this Google Drive folder, created on first upload
const PROFILE_FOLDER = 'Ideathon 2026 Mentor Profiles';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|docx?|jpe?g|png)$/i;

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    const isMentor = data.type === 'mentor';
    const sheet = sheetFor(isMentor ? 'Mentors' : 'Teams', isMentor ? MENTOR_HEADERS : TEAM_HEADERS);
    const id = (isMentor ? 'MEN' : 'IDT') + '26-' + String(sheet.getLastRow()).padStart(4, '0');
    sheet.appendRow(isMentor ? mentorRow(id, data) : teamRow(id, data));
    return json({ ok: true, id: id });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// lets you open the web app URL in a browser to check it is live
function doGet() {
  return json({ ok: true, service: 'Ideathon 2026 registrations' });
}

function teamRow(id, d) {
  const t = d.team || {}, c = d.contact || {}, i = d.idea || {}, mt = d.mockTest || {};
  const m = d.members || [];
  const member = n => [clean(m[n] && m[n].name), clean(m[n] && m[n].class)];
  return [
    id, new Date(), clean(t.name), clean(t.school), clean(t.city), clean(t.category), m.length,
    ...member(0), ...member(1), ...member(2), ...member(3), ...member(4),
    clean(c.phone), clean(c.email),
    clean(i.pitch), clean(i.industry), clean(i.problem),
    mt.taken ? 'Yes' : 'No', mt.taken ? clean(mt.score + ' / ' + mt.total) : '', mt.taken ? clean(mt.time) : ''
  ];
}

function mentorRow(id, d) {
  return [id, new Date(), clean(d.name), clean(d.email), clean(d.phone), clean(d.program), list(d.areas), clean(d.note), saveProfile(id, d)];
}

// saves the optional CV / resume to Drive and returns its link (or a short reason it was skipped)
function saveProfile(id, d) {
  const f = d.profile;
  if (!f || !f.data) return '';
  if (!FILE_TYPES.test(String(f.name))) return 'Skipped: unsupported file type';
  const bytes = Utilities.base64Decode(f.data);
  if (bytes.length > MAX_FILE_BYTES) return 'Skipped: file over 5 MB';
  const folders = DriveApp.getFoldersByName(PROFILE_FOLDER);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PROFILE_FOLDER);
  const safeName = (id + ' - ' + String(d.name || 'mentor') + ' - ' + String(f.name)).replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
  const file = folder.createFile(Utilities.newBlob(bytes, String(f.type || 'application/octet-stream'), safeName));
  return file.getUrl();
}

function sheetFor(name, headers) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e3f0ff');
  }
  return sheet;
}

// strip leading = + - @ so a typed answer can never run as a spreadsheet formula
function clean(v) {
  const s = v == null ? '' : String(v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function list(a) {
  return Array.isArray(a) ? clean(a.join(', ')) : clean(a);
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
