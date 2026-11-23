/**
 * Ideathon 2026 Round 1 test reminder: every registered student (the individual, or each team member) is emailed a reminder
 * 7 days after they registered, and again every 7 days after that, until the test's last date (TEST_DEADLINE in the main script).
 * Paste it as a NEW file (+ → Script, name it "StudentReminder") in the registration sheet's Apps Script project, next to the
 * main script, whose TEST_DEADLINE, CONTACT_EMAIL, SIGN_OFF, deliver(), esc(), sheetFor() and studentsTab() it uses.
 * Emails go out like the other student emails: from head office when the account that runs it can send as head office.
 * Every reminder sent is listed in the "Reminders" tab, so nobody gets the same reminder twice.
 * Test: run testStudentReminder (▶ Run); a sample comes to your own inbox only.
 * See who is due: run previewStudentReminders; it sends nothing.
 * Go live: run setupStudentReminders once from your own account. Stop: run stopStudentReminders.
 */
// days after registering before the first reminder, and between reminders
const REMINDER_EVERY_DAYS = 7;
// where students take the test, as written in the reminder
const REMINDER_LMS_URL = 'https://cv-edu.codevidhya.com/my/';
// reminders go out only between these hours, India time (24-hour); the run is hourly, so anyone missed is sent the next hour
const REMINDER_FROM_HOUR = 9;
const REMINDER_TO_HOUR = 20;
// emails left in the day's Gmail quota for the registration emails; reminders stop before it and continue the next day
const REMINDER_KEEP_QUOTA = 100;
const REMINDER_HEADERS = ['Registration ID', 'Email', 'Student name', 'Reminder', 'Sent at', 'Status'];

// run every hour by the trigger from setupStudentReminders
function sendStudentReminders() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'H'));
  if (hour < REMINDER_FROM_HOUR || hour > REMINDER_TO_HOUR) return;
  // a run that is still busy is not started a second time (not the script lock: that would hold up registrations)
  const props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty('reminderBusyUntil') || 0) > Date.now()) return;
  props.setProperty('reminderBusyUntil', String(Date.now() + 5 * 60 * 1000));
  try {
    const sheet = sheetFor('Reminders', REMINDER_HEADERS);
    const started = Date.now();
    let sent = 0;
    const due = remindersDue();
    for (let k = 0; k < due.length; k++) {
      // the rest go in the next hour's run, well within Google's 6-minute limit
      if (Date.now() - started > 4 * 60 * 1000 || MailApp.getRemainingDailyQuota() <= REMINDER_KEEP_QUOTA) break;
      const s = due[k];
      const status = sendReminderMail(s.email, s.name, s.id);
      sheet.appendRow([s.id, s.email, clean(s.name), s.round, new Date(), status]);
      sent++;
    }
    Logger.log('Reminders: ' + sent + ' sent, ' + (due.length - sent) + ' still due.');
  } finally {
    props.deleteProperty('reminderBusyUntil');
  }
}

// the students due a reminder now: each email once (their first registration), whose latest 7-day mark has no reminder yet
function remindersDue() {
  const last = reminderLastDay();
  const now = new Date();
  if (Utilities.formatDate(now, 'Asia/Kolkata', 'yyyy-MM-dd') > last) return [];

  const done = {};
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reminders');
  if (log && log.getLastRow() > 1) {
    log.getRange(2, 2, log.getLastRow() - 1, 3).getValues().forEach(function (r) { done[String(r[0]).toLowerCase() + '|' + r[2]] = true; });
  }

  const values = studentsTab().getDataRange().getValues();
  const head = values[0].map(function (h) { return String(h).trim(); });
  const cId = head.indexOf('Registration ID'), cAt = head.indexOf('Submitted at');
  const people = [];
  head.forEach(function (h, i) { if (/email$/i.test(h)) people.push({ email: i, name: head.indexOf(h.replace(/email$/i, 'name')) }); });

  const first = {};
  values.slice(1).forEach(function (row) {
    const at = row[cAt] instanceof Date ? row[cAt] : new Date(row[cAt]);
    if (isNaN(at)) return;
    people.forEach(function (p) {
      const email = String(row[p.email]).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (first[email] && first[email].at <= at)) return;
      first[email] = { email: email, at: at, id: String(row[cId]).trim(), name: p.name >= 0 ? String(row[p.name]).trim() : '' };
    });
  });

  const due = [];
  Object.keys(first).forEach(function (email) {
    const s = first[email];
    s.round = Math.floor((now - s.at) / (REMINDER_EVERY_DAYS * 864e5));
    if (s.round >= 1 && !done[email + '|' + s.round]) due.push(s);
  });
  return due.sort(function (a, b) { return a.at - b.at; });
}

// TEST_DEADLINE ("7th December 2026") as yyyy-MM-dd
function reminderLastDay() {
  const d = new Date(TEST_DEADLINE.replace(/(\d+)(st|nd|rd|th)\b/i, '$1'));
  if (isNaN(d)) throw new Error('TEST_DEADLINE in the main script is not a date: ' + TEST_DEADLINE);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function sendReminderMail(to, name, id) {
  const subject = 'Reminder: your Round 1 test for the MIIC × Codevidhya Ideathon 2026 is waiting';
  const p = function (text) { return '<p style="margin:0 0 12px">' + text + '</p>'; };
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1d2433;max-width:620px">' +
    p('Hi ' + (name ? esc(name) : 'there') + ',') +
    p('This is a friendly reminder that you are registered for the <b>MIIC × Codevidhya Ideathon 2026</b> (Registration ID: <b>' + esc(id) + '</b>).') +
    p('Your next step is the <b>Round 1 Aptitude Test</b> on our LMS. If you haven’t taken it yet, please complete it before <b>' + esc(TEST_DEADLINE) + '</b>.') +
    '<ul style="margin:0 0 12px;padding-left:20px">' +
    '<li><b>Where:</b> <a href="' + REMINDER_LMS_URL + '">' + REMINDER_LMS_URL + '</a></li>' +
    '<li><b>Log in with:</b> the same email ID you registered with</li>' +
    '<li><b>Time:</b> 25 minutes, one attempt</li>' +
    '<li><b>Tip:</b> use a stable internet connection and sit somewhere quiet</li></ul>' +
    p('There’s no need to stress. The test is just a fun way to see how you think and solve problems.') +
    p('<b>Already taken the test?</b> Great job! You don’t need to do anything more for now. We will email you your result and the next steps soon.') +
    p('If you have any questions, or need help logging in, ask a parent or teacher to write to us at <a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a>.') +
    p('Warm regards,<br>' + SIGN_OFF) + '</div>';
  const text = html.replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1').replace(/<li>/g, '- ').replace(/<\/(p|li)>/g, '\n').replace(/<br>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  return deliver(to, subject, text, html);
}

// run from the editor: a sample reminder to you only
function testStudentReminder() {
  Logger.log(sendReminderMail(Session.getEffectiveUser().getEmail(), 'Test Student', 'IDT26-0000'));
}

// run from the editor: shows who would get a reminder right now, without sending anything
function previewStudentReminders() {
  const due = remindersDue();
  Logger.log(due.length + ' students due a reminder now (last date ' + reminderLastDay() + ').');
  due.slice(0, 20).forEach(function (s) { Logger.log(s.id + ' · ' + s.email + ' · reminder ' + s.round); });
}

// run once from the editor: checks every hour and sends the reminders that are due (only replaces its own trigger)
function setupStudentReminders() {
  stopStudentReminders();
  ScriptApp.newTrigger('sendStudentReminders').timeBased().everyHours(1).create();
  Logger.log('Done: reminders go out every ' + REMINDER_EVERY_DAYS + ' days after registering, between ' + REMINDER_FROM_HOUR + ':00 and ' +
    (REMINDER_TO_HOUR + 1) + ':00 India time, until ' + TEST_DEADLINE + '.');
}

function stopStudentReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendStudentReminders') ScriptApp.deleteTrigger(t); });
}
