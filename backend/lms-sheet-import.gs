/**
 * Ideathon 2026 → LMS sheet import. For the LMS sheet's own Apps Script project (not the registration script).
 * Every minute it copies new student registrations from the Ideathon registration sheet into this LMS sheet as
 * Email | Name | Class N (an email already here is never added again).
 * Paste it as a NEW file in that project (+ → Script, name it "IdeathonImport"); do NOT replace the existing code.
 * Then run setupIdeathonImport once (▶ Run) from the account that runs the LMS triggers. That account needs view access
 * to the registration sheet.
 */
const IDEATHON_REG_URL = 'https://docs.google.com/spreadsheets/d/15aXBQ3FUMYQTWDreSqnKAowsyz0RSmkUXTxv5_DaKTo/edit?gid=1137941265#gid=1137941265';
// the tab of this LMS sheet to add students to (the #gid in its link)
const IDEATHON_LMS_GID = '0';

function ideathonImport() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;
  try {
    const lower = function (h) { return String(h).trim().toLowerCase(); };
    const safe = function (v) { return /^[=+\-@]/.test(v) ? "'" + v : v; };

    // this LMS tab: its Email, Name and Class columns and the emails already in it
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const lms = book.getSheets().filter(function (t) { return String(t.getSheetId()) === IDEATHON_LMS_GID; })[0] || book.getSheets()[0];
    const head = lms.getRange(1, 1, 1, lms.getLastColumn()).getValues()[0].map(lower);
    const ce = head.indexOf('email'), cn = head.indexOf('name'), cc = head.indexOf('class');
    if (ce < 0 || cn < 0 || cc < 0) throw new Error('The LMS tab needs Email, Name and Class headers in row 1');
    const has = {};
    if (lms.getLastRow() > 1) lms.getRange(2, ce + 1, lms.getLastRow() - 1, 1).getValues().forEach(function (r) { has[lower(r[0])] = true; });

    // the registration tab: "Captain / student email", "Student 2 email", ... each with its "… name" and "… grade"
    const gid = IDEATHON_REG_URL.match(/gid=(\d+)/)[1];
    const reg = SpreadsheetApp.openByUrl(IDEATHON_REG_URL).getSheets().filter(function (t) { return String(t.getSheetId()) === gid; })[0];
    if (!reg) throw new Error('Registration tab not found');
    const values = reg.getDataRange().getDisplayValues();
    const rh = values[0].map(lower);
    const people = [];
    rh.forEach(function (h, i) {
      if (!/email$/.test(h)) return;
      const p = h.replace(/\s*email$/, '');
      people.push({ email: i, name: rh.indexOf(p + ' name'), grade: rh.indexOf(p + ' grade') });
    });

    const rows = [];
    values.slice(1).forEach(function (row) {
      people.forEach(function (p) {
        const email = lower(row[p.email]);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || has[email]) return;
        const grade = p.grade >= 0 ? String(row[p.grade]).trim() : '';
        const out = head.map(function () { return ''; });
        out[ce] = email;
        out[cn] = safe(p.name >= 0 ? String(row[p.name]).trim() : '');
        out[cc] = !grade ? '' : /^class\b/i.test(grade) ? safe(grade) : 'Class ' + grade;
        rows.push(out);
        has[email] = true;
      });
    });
    if (rows.length) lms.getRange(lms.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
    Logger.log('Ideathon import: ' + rows.length + ' new students added.');
  } finally {
    lock.releaseLock();
  }
}

// run once (▶ Run): imports everyone registered so far, then checks every minute
function setupIdeathonImport() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ideathonImport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('ideathonImport').timeBased().everyMinutes(1).create();
  ideathonImport();
}
