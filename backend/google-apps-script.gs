/**
 * Ideathon 2026 registrations → Google Sheet.
 * Receives team and mentor registrations from the website (forms.js) and appends one row each
 * to the "Teams" or "Mentors" tab of the spreadsheet this script is bound to.
 * Setup: see backend/SETUP.md.
 */
const TEAM_HEADERS = [
  'Registration ID', 'Submitted at', 'Team name', 'School', 'City', 'Category',
  'Captain name', 'Captain class', 'Captain section',
  'Student 2 name', 'Student 2 class', 'Student 2 section',
  'Student 3 name', 'Student 3 class', 'Student 3 section',
  'Student 4 name', 'Student 4 class', 'Student 4 section',
  'WhatsApp', 'Email',
  'Idea (one line)', 'Area', 'Problem', 'Solution', 'Who will use it',
  'Special because', 'Special (one line)', 'Already exists?', 'Helps with', 'Deck / video link'
];
const MENTOR_HEADERS = ['Registration ID', 'Submitted at', 'Name', 'Email', 'WhatsApp', 'Branch & year', 'Can help with', 'Note'];

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
  const t = d.team || {}, c = d.contact || {}, i = d.idea || {}, b = d.bonus || {};
  const m = d.members || [];
  const member = n => [clean(m[n] && m[n].name), clean(m[n] && m[n].class), clean(m[n] && m[n].section)];
  return [
    id, new Date(), clean(t.name), clean(t.school), clean(t.city), clean(t.category),
    ...member(0), ...member(1), ...member(2), ...member(3),
    clean(c.phone), clean(c.email),
    clean(i.pitch), clean(i.industry), clean(i.problem), clean(i.solution), list(i.audience),
    list(b.usp), clean(b.uspLine), clean(b.existing), list(b.impact), clean(b.link)
  ];
}

function mentorRow(id, d) {
  return [id, new Date(), clean(d.name), clean(d.email), clean(d.phone), clean(d.program), list(d.areas), clean(d.note)];
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
