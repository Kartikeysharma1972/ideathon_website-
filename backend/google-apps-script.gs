/**
 * Ideathon 2026 registrations → Google Sheet.
 * Receives student registrations (individual or team), mentor registrations and organization (school) registrations from the
 * website (forms.js) and appends one row each to the "Teams", "Mentors" or "Organizations" tab of the spreadsheet this script is bound to,
 * and emails a thank-you note to the address they gave (mentors and students are switched on separately below).
 * Setup: see backend/SETUP.md.
 */
const TEAM_HEADERS = [
  'Registration ID', 'Submitted at', 'Registration type', 'Team Name', 'School Name', 'City', 'Category', 'Team size',
  'Captain / student name', 'Captain / student grade', 'Captain / student email',
  'Student 2 name', 'Student 2 grade', 'Student 2 email',
  'Student 3 name', 'Student 3 grade', 'Student 3 email',
  'Student 4 name', 'Student 4 grade', 'Student 4 email',
  'Student 5 name', 'Student 5 grade', 'Student 5 email',
  'Student 6 name', 'Student 6 grade', 'Student 6 email',
  'Contact Number',
  'Idea (one line)', 'Domain', 'Problem (optional)',
  'Mock test taken?', 'Mock test level', 'Mock test score', 'Mock test time', 'Added to LMS sheet', 'Organization ID'
];
// students who register through an organization's link are tagged with its ID, and counted on its row
const ORG_HEADERS = ['Organization ID', 'Submitted at', 'Type', 'Organization name', 'Board', 'City', 'Address', 'Pincode',
  'Head of organization', 'Coordinator name', 'Designation', 'Coordinator email', 'Coordinator mobile', 'Grades', 'Expected students',
  'Student registration link', 'Students registered', 'Email sent'];
const MENTOR_HEADERS = ['Registration ID', 'Submitted at', 'Full Name', 'Email', 'WhatsApp Number', 'Branch & Year', 'Can help with', 'Note', 'Profile file', 'Email sent'];
// uploaded mentor profiles (CV / resume) are saved in this Google Drive folder, created on first upload
const PROFILE_FOLDER = 'Ideathon 2026 Mentor Profiles';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|docx?|jpe?g|png)$/i;

// thank-you emails, switched on separately (publish a new version after changing):
// students are OFF for now (registrations are only saved); mentors get the registration email.
const SEND_STUDENT_EMAILS = false;
const SEND_MENTOR_EMAILS = true;
// the organization's coordinator gets their students' registration link by email
const SEND_ORG_EMAILS = true;
// the website; an organization's student link is SITE_URL + 'register.html?org=ORG26-0001'
const SITE_URL = 'https://live.codevidhya.com/';
// emails go out from this address when the script runs under it, or when the script owner's Gmail
// has it added as a "Send mail as" address; otherwise they go from the owner's account with replies to it
const SEND_FROM = 'headoffice.codevidhya@codevidhya.com';

// thank-you emails: fill these in before the test date is announced (blank = the line is left out)
const TEST_DATE = '';      // e.g. '15 December 2026'
const TEST_TIME = '';      // e.g. '11:00 am'
// the thank-you emails' reply-to and contact address (the website footer keeps support@)
const CONTACT_EMAIL = 'support@codevidhya.com';
const CONTACT_PHONE = '';  // e.g. '+91 98xxx xxxxx'
const LMS_URL = 'https://cvlms.codevidhya.com/';
const SIGN_OFF = 'Team MIIC × Codevidhya Ideathon 2026';

// every registered student (the individual, or each team member) is also added to the LMS sheet as Email | Name | Class;
// the LMS then fills in LMS Status and LMS Link there. Paste the link of that tab (with its #gid=...); blank = switched off.
const LMS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Vh3GW6IfTiYdbB3_tl9_9Ni_xYLkuq_PTKGkq4Ozs6w/edit?gid=0#gid=0';

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === 'organization') return registerOrganization(lock, data);
    const isMentor = data.type === 'mentor';
    const sheet = sheetFor(isMentor ? 'Mentors' : 'Teams', isMentor ? MENTOR_HEADERS : TEAM_HEADERS);
    const id = (isMentor ? 'MEN' : 'IDT') + '26-' + String(sheet.getLastRow()).padStart(4, '0');
    sheet.appendRow(isMentor ? mentorRow(id, data) : teamRow(id, data));
    const row = sheet.getLastRow();
    // inside the lock, so two registrations at once can't add the same email twice
    if (!isMentor) {
      sheet.getRange(row, TEAM_HEADERS.indexOf('Added to LMS sheet') + 1).setValue(addToLmsSheet(data.members || []));
      countForOrganization((data.team || {}).orgId, (data.members || []).length);
    }
    lock.releaseLock();
    if (isMentor && SEND_MENTOR_EMAILS) {
      // the last column records what happened, so a failed email is visible in the sheet
      sheet.getRange(row, MENTOR_HEADERS.length).setValue(sendMentorMail(id, data));
    }
    if (!isMentor && SEND_STUDENT_EMAILS) sendThankYou(false, data);
    return json({ ok: true, id: id });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// a failed email never fails the registration; the row is already saved
function sendThankYou(isMentor, d) {
  const people = isMentor ? [{ name: d.name, email: d.email }] : (d.members || []);
  const sent = {};
  people.forEach(function (p) {
    const to = String(p.email || '').trim().toLowerCase();
    // one email per address, even when a parent's email is shared by two students
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || sent[to]) return;
    sent[to] = true;
    const mail = thankYouMail(isMentor, String(p.name || 'there').trim());
    try {
      MailApp.sendEmail({ to: to, subject: mail.subject, name: SIGN_OFF, replyTo: CONTACT_EMAIL,
        body: mail.body.concat(['Warm regards,\n' + SIGN_OFF]).join('\n\n') });
    } catch (err) { /* daily email quota reached or mail not authorised */ }
  });
}

function thankYouMail(isMentor, name) {
  const contact = CONTACT_EMAIL + (CONTACT_PHONE ? ' or call ' + CONTACT_PHONE : '');
  return isMentor ? {
    subject: 'Thank you for registering as a mentor: Codevidhya x MNIT Ideathon',
    body: [
      'Hi ' + name + ',',
      'Thank you for registering as a mentor for the Codevidhya x MNIT Ideathon. We’re glad to have you with us.',
      'You will be paired with a school team and guide them through Round 2 (online), helping them sharpen their ideas and giving feedback on their report and pitch. We will contact you soon with your team details and the other information you need.',
      'For any questions, reach us at ' + contact + '.'
    ]
  } : {
    subject: 'Thank you for registering: Codevidhya x MNIT Ideathon',
    body: [
      'Hi ' + name + ',',
      'Thank you for registering for the Codevidhya x MNIT Ideathon. We’re so happy to have you with us!',
      'Your first step is the online aptitude test (Round 1: Think), which will be conducted on our LMS. You can log in here with your registered email id: ' + LMS_URL,
      (TEST_DATE ? 'The test will be held on ' + TEST_DATE + (TEST_TIME ? ' at ' + TEST_TIME : '') + '.' : 'We will share the test date and time with you soon.') +
        ' Please make sure you have a stable internet connection and a quiet spot to sit. There is no need to stress, as the test is just a fun way to see how you think.',
      'If you have any questions, ask a parent or teacher to write to us at ' + contact + '.',
      'See you at the test!'
    ]
  };
}

// mentor registration email; returns a short status for the sheet's "Email sent" column
function sendMentorMail(id, d) {
  const to = String(d.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return 'Not sent: invalid email';
  const name = String(d.name || 'there').trim().split(/\s+/)[0];
  const areas = list(d.areas) || 'Not specified';
  const subject = 'Thank you for registering as a mentor: MIIC × Codevidhya Ideathon 2026';
  const sections = [
    ['p', 'Hi ' + esc(name) + ','],
    ['p', 'Thank you for registering as an <b>MNIT Innovation Mentor</b> for the <b>MIIC × Codevidhya Ideathon 2026</b>! We’re really glad to have you with us.'],
    ['h', 'What you told us'],
    ['ul', ['Branch &amp; year: ' + esc(d.program || 'Not specified'), 'You can help with: ' + esc(areas), 'WhatsApp: ' + esc(d.phone || 'Not given')]],
    ['h', 'What happens next'],
    ['ol', [
      '<b>Team pairing:</b> After Round 1, we will pair you with a school team or individual (Grades 6-8/9-12) whose idea matches your strengths.',
      '<b>Orientation:</b> You will join a short online orientation by Codevidhya about the Ideathon and what is expected from mentors.',
      '<b>Mentor session (online, Round 2):</b> A 1-hour session with your team/individual to help them sharpen their problem and solution, and to give feedback on their idea presentation (PPT) and pitch video.',
      '<b>Campus final (Round 3):</b> If your team/individual makes it to the top 20 finalists, you will be with them in person at MNIT on the final day and take responsibility for them on campus: welcome them and help them settle in, run a last practice of their pitch, make sure they are ready on time, and support them while they present to the judges.'
    ]],
    ['p', 'We will share your team/individual details, session dates and joining links on email and WhatsApp before Round 2.'],
    ['h', 'What you get'],
    ['ul', ['A certificate for your contribution, plus free goodies as a thank-you', 'Real leadership experience guiding a team from idea to pitch', 'Connections across MIIC, Codevidhya and partner schools']],
    ['p', 'If you have any questions or your availability changes, write to us at <b>' + CONTACT_EMAIL + '</b>.'],
    ['p', 'Thank you for helping young innovators turn a spark into something real!'],
    ['p', 'Warm regards,<br>' + SIGN_OFF],
    ['small', 'Mentor registration ID: ' + id]
  ];
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1d2433;max-width:620px">' + sections.map(function (s) {
    if (s[0] === 'h') return '<p style="margin:18px 0 6px"><b>' + s[1] + '</b></p>';
    if (s[0] === 'ul' || s[0] === 'ol') return '<' + s[0] + ' style="margin:0 0 10px;padding-left:22px">' + s[1].map(function (li) { return '<li style="margin:3px 0">' + li + '</li>'; }).join('') + '</' + s[0] + '>';
    if (s[0] === 'small') return '<p style="margin-top:18px;font-size:12px;color:#5b6475">' + s[1] + '</p>';
    return '<p style="margin:0 0 10px">' + s[1] + '</p>';
  }).join('') + '</div>';
  const text = sections.map(function (s) {
    if (s[0] === 'ul') return s[1].map(function (li) { return '- ' + li; }).join('\n');
    if (s[0] === 'ol') return s[1].map(function (li, i) { return (i + 1) + '. ' + li; }).join('\n');
    return s[1];
  }).join('\n\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return deliver(to, subject, text, html);
}

// sends from SEND_FROM when this account can; otherwise from the script owner's account with replies to SEND_FROM
function deliver(to, subject, text, html) {
  const opts = { name: SIGN_OFF, replyTo: CONTACT_EMAIL, htmlBody: html };
  try {
    const me = String(Session.getEffectiveUser().getEmail()).toLowerCase();
    const canSendAs = me === SEND_FROM || GmailApp.getAliases().map(function (a) { return a.toLowerCase(); }).indexOf(SEND_FROM) >= 0;
    if (canSendAs && me !== SEND_FROM) opts.from = SEND_FROM;
    GmailApp.sendEmail(to, subject, text, opts);
    return canSendAs ? 'Sent from ' + SEND_FROM : 'Sent from ' + me + ' (replies go to ' + CONTACT_EMAIL + ')';
  } catch (err) {
    return 'Not sent: ' + String(err).slice(0, 200);
  }
}

// run this once from the editor (Run ▶) after pasting: it asks for Gmail permission and sends a sample to you
function testMentorMail() {
  Logger.log(sendMentorMail('MEN26-TEST', { name: 'Test Mentor', email: Session.getEffectiveUser().getEmail(), program: 'B.Tech CSE, 3rd year', areas: ['Coding', 'AI / ML'], phone: '+91 9000000000' }));
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// adds the students to the LMS sheet, matching its columns by their headers; returns a short status for the Teams tab.
// An email that is already in the LMS sheet is skipped, since the LMS makes one login per email.
function addToLmsSheet(members) {
  if (!LMS_SHEET_URL) return 'Not set up';
  try {
    const sheet = lmsSheet();
    const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
    const ce = head.indexOf('email'), cn = head.indexOf('name'), cc = head.indexOf('class');
    if (ce < 0 || cn < 0 || cc < 0) return 'Failed: the LMS sheet needs Email, Name and Class headers in row 1';
    const last = sheet.getLastRow();
    const existing = last > 1 ? sheet.getRange(2, ce + 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); }) : [];
    const added = [], skipped = [];
    members.forEach(function (m) {
      const email = String(m.email || '').trim().toLowerCase();
      if (!email) return;
      if (existing.indexOf(email) >= 0) { skipped.push(email); return; }
      const out = head.map(function () { return ''; });
      out[ce] = clean(email);
      out[cn] = clean(String(m.name || '').trim());
      out[cc] = m.class ? 'Class ' + clean(m.class) : '';
      sheet.appendRow(out);
      existing.push(email);
      added.push(email);
    });
    return 'Added ' + added.length + (skipped.length ? '; already there: ' + skipped.join(', ') : '');
  } catch (err) {
    return 'Failed: ' + String(err).slice(0, 200);
  }
}

function lmsSheet() {
  const book = SpreadsheetApp.openByUrl(LMS_SHEET_URL);
  const gid = (LMS_SHEET_URL.match(/[#&?]gid=(\d+)/) || [])[1];
  const tab = gid && book.getSheets().filter(function (t) { return String(t.getSheetId()) === gid; })[0];
  return tab || book.getSheets()[0];
}

// run once from the editor (Run ▶) after pasting: asks for permission and shows which LMS tab and columns were found
function checkLmsSheet() {
  const sheet = lmsSheet();
  Logger.log('LMS tab: ' + sheet.getName() + ' | headers: ' + sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].join(' | ') + ' | rows: ' + sheet.getLastRow());
}

// ---------- organizations (schools, colleges, NGOs, learning centres) ----------
function registerOrganization(lock, d) {
  const sheet = sheetFor('Organizations', ORG_HEADERS);
  const id = 'ORG26-' + String(sheet.getLastRow()).padStart(4, '0');
  const link = SITE_URL + 'register.html?org=' + id;
  const c = d.coordinator || {};
  sheet.appendRow([id, new Date(), clean(d.orgType), clean(d.name), clean(d.board), clean(d.city), clean(d.address), clean(d.pincode),
    clean(d.head), clean(c.name), clean(c.designation), clean(String(c.email || '').toLowerCase()), clean(c.phone), list(d.grades), clean(d.expected),
    link, 0, '']);
  const row = sheet.getLastRow();
  lock.releaseLock();
  if (SEND_ORG_EMAILS) sheet.getRange(row, ORG_HEADERS.length).setValue(sendOrganizationMail(id, link, d));
  return json({ ok: true, id: id, link: link });
}

// adds a registration's students to its organization's "Students registered" count
function countForOrganization(orgId, students) {
  const id = String(orgId || '').trim().toUpperCase();
  if (!/^ORG26-\d{4}$/.test(id) || !students) return;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
  if (!sheet || sheet.getLastRow() < 2) return;
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== id) continue;
    const cell = sheet.getRange(i + 2, ORG_HEADERS.indexOf('Students registered') + 1);
    cell.setValue((Number(cell.getValue()) || 0) + students);
    return;
  }
}

// the website looks up an organization's name and city (nothing else) when a student opens its link
function findOrganization(orgId) {
  const id = String(orgId || '').trim().toUpperCase();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
  if (!/^ORG26-\d{4}$/.test(id) || !sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === id) return { id: id, type: String(rows[i][2]), name: String(rows[i][3]), city: String(rows[i][5]) };
  }
  return null;
}

function sendOrganizationMail(id, link, d) {
  const c = d.coordinator || {};
  const to = String(c.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return 'Not sent: invalid email';
  const name = String(c.name || 'there').trim().split(/\s+/)[0];
  const org = String(d.name || 'your organization').trim();
  const forward = 'The MIIC × Codevidhya Ideathon 2026 is open for students of Grades 6–8 and 9–12. Register on your own or as a team of up to 6, in about 5 minutes: ' + link;
  const subject = org + ' is registered: MIIC × Codevidhya Ideathon 2026';
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1d2433;max-width:620px">' +
    '<p>Hi ' + esc(name) + ',</p>' +
    '<p>Thank you for registering <b>' + esc(org) + '</b> for the <b>MIIC × Codevidhya Ideathon 2026</b>! Your Organization ID is <b>' + id + '</b>.</p>' +
    '<p style="margin:18px 0 6px"><b>Your students’ registration link</b></p>' +
    '<p style="margin:0 0 10px"><a href="' + link + '">' + link + '</a></p>' +
    '<p style="margin:0 0 10px">Share this link with your students and their parents. When a student registers through it, your organization’s name and city are filled in for them, and the registration is counted for ' + esc(org) + '.</p>' +
    '<p style="margin:18px 0 6px"><b>What happens next</b></p>' +
    '<ol style="margin:0 0 10px;padding-left:22px">' +
    '<li style="margin:3px 0">Students register on their own or as a team of up to 6 (Grades 6–8 and 9–12).</li>' +
    '<li style="margin:3px 0"><b>Round 1:</b> an online aptitude test on our LMS. We will share the date by email.</li>' +
    '<li style="margin:3px 0"><b>Round 2:</b> shortlisted teams work on their idea with an MNIT mentor and pitch it online.</li>' +
    '<li style="margin:3px 0"><b>Round 3:</b> up to 20 finalist teams pitch live at MNIT, Jaipur.</li>' +
    '</ol>' +
    '<p style="margin:0 0 10px">Most participants are under 18, so please help your students get their parent’s or guardian’s consent before they register.</p>' +
    '<p style="margin:18px 0 6px"><b>A message you can forward to students and parents</b></p>' +
    '<p style="margin:0 0 10px;padding:10px 14px;background:#f6faff;border-radius:8px">' + esc(forward) + '</p>' +
    '<p style="margin:0 0 10px">For any questions, write to us at <b>' + CONTACT_EMAIL + '</b>.</p>' +
    '<p style="margin:0 0 10px">Warm regards,<br>' + SIGN_OFF + '</p></div>';
  const text = html.replace(/<\/p>/g, '\n\n').replace(/<\/li>/g, '\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
  return deliver(to, subject, text, html);
}

// opening the web app URL in a browser shows it is live; ?org=ORG26-0001 returns that organization's name and city
function doGet(e) {
  const orgId = e && e.parameter && e.parameter.org;
  if (orgId) {
    const org = findOrganization(orgId);
    return json(org ? { ok: true, org: org } : { ok: false, error: 'Organization not found' });
  }
  return json({ ok: true, service: 'Ideathon 2026 registrations' });
}

function teamRow(id, d) {
  const t = d.team || {}, c = d.contact || {}, i = d.idea || {}, mt = d.mockTest || {};
  const m = d.members || [];
  const member = n => [clean(m[n] && m[n].name), clean(m[n] && m[n].class), clean(m[n] && m[n].email)];
  return [
    id, new Date(), clean(d.registrationType || 'Team'), clean(t.name), clean(t.school), clean(t.city), clean(t.category), m.length,
    ...member(0), ...member(1), ...member(2), ...member(3), ...member(4), ...member(5),
    clean(c.phone),
    clean(i.pitch), clean(i.industry), clean(i.problem),
    mt.taken ? 'Yes' : 'No', mt.taken ? clean(mt.level) : '', mt.taken ? clean(mt.score + ' / ' + mt.total) : '', mt.taken ? clean(mt.time) : '',
    '', clean(String(t.orgId || '').toUpperCase())
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
  }
  // when the form gains new questions, the header row is brought up to date
  const top = sheet.getRange(1, 1, 1, headers.length);
  if (top.getValues()[0].join('|') !== headers.join('|')) top.setValues([headers]);
  top.setFontWeight('bold').setBackground('#e3f0ff');
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
