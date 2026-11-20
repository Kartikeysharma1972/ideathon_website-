/**
 * Ideathon 2026 daily registration report, emailed as cards: students registered till date and on the day, by city,
 * school / organization and category. Paste it as a NEW file (+ → Script, name it "DailyReport") in the registration
 * sheet's Apps Script project, next to the main script, whose esc() and studentsTab() it uses.
 * The report is sent from the account that runs it: run everything below from your own account.
 * Test: run testDailyReport (▶ Run); the report comes to your own inbox only.
 * Go live: set REPORT_TO, then run setupDailyReport once from your own account.
 */
// who gets the daily report, comma separated; blank = only the account that runs it
const REPORT_TO = '';
// the hour (India time, 0-23) the report goes out; Google sends it within about 15 minutes of it.
// Before noon the report covers yesterday's full day, from noon on it covers today so far.
const REPORT_HOUR = 9;
// rows whose email, name or team name look like a test are left out of the numbers
const REPORT_TEST_ROW = /(^|[^a-z])test|@(example|demo)\.|^dummy/i;

// run from the editor: sends the report to you only
function testDailyReport() {
  const me = Session.getEffectiveUser().getEmail();
  Logger.log(sendReportTo(me) + ' (to ' + me + ')');
}

// run once from the editor: sends the report every day at REPORT_HOUR, India time
function setupDailyReport() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendDailyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDailyReport').timeBased().everyDays(1).atHour(REPORT_HOUR).nearMinute(0).inTimezone('Asia/Kolkata').create();
  Logger.log('Done: the report goes to ' + (REPORT_TO || Session.getEffectiveUser().getEmail()) + ' every day around ' + REPORT_HOUR + ':00 India time.');
}

function sendDailyReport() {
  return sendReportTo(REPORT_TO || Session.getEffectiveUser().getEmail());
}

function sendReportTo(to) {
  const r = reportData(new Date());
  const subject = 'Ideathon registrations · ' + r.dayLabel + ': ' + r.day.students + ' new students · ' + r.all.students + ' till date';
  const text = 'Ideathon 2026 registrations\n\n' + r.dayLabel + ': ' + r.day.students + ' students in ' + r.day.regs + ' registrations\n' +
    'Till date: ' + r.all.students + ' students in ' + r.all.regs + ' registrations, from ' + r.all.cities.length + ' cities\n\n' +
    'Top cities: ' + r.all.cities.slice(0, 5).map(function (c) { return c[0] + ' ' + c[1]; }).join(', ');
  // sent from the account that runs it (yours), not from head office
  GmailApp.sendEmail(to, subject, text, { htmlBody: reportHtml(r) });
  return 'Sent from ' + Session.getEffectiveUser().getEmail();
}

// counts the student registrations tab: everything till date, and the report's day (with the day before it to compare)
function reportData(now) {
  const tz = 'Asia/Kolkata', dayKey = function (d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };
  const hour = Number(Utilities.formatDate(now, tz, 'H'));
  const day = hour < 12 ? new Date(now.getTime() - 864e5) : now;
  const key = dayKey(day), prevKey = dayKey(new Date(day.getTime() - 864e5));

  const values = studentsTab().getDataRange().getValues();
  const head = values[0].map(function (h) { return String(h).trim(); });
  const col = function (h) { return head.indexOf(h); };
  const cAt = col('Submitted at'), cType = col('Registration type'), cTeam = col('Team Name'), cSchool = col('School Name'), cCity = col('City'),
    cCat = col('Category'), cOrg = col('Organization ID');
  const emails = head.map(function (h, i) { return /email$/i.test(h) ? i : -1; }).filter(function (i) { return i >= 0; });
  const orgNames = reportOrgNames();

  const blank = function () { return { regs: 0, students: 0, solo: 0, team: 0, cities: {}, schools: {}, orgs: {}, cats: {} }; };
  const all = blank(), today = blank();
  let prev = 0, tests = 0;
  values.slice(1).forEach(function (row) {
    const mails = emails.map(function (i) { return String(row[i]).trim(); }).filter(function (e) { return /@/.test(e); });
    if (!mails.length) return;
    if (mails.some(function (e) { return REPORT_TEST_ROW.test(e); }) || REPORT_TEST_ROW.test(String(row[cTeam] || '')) || REPORT_TEST_ROW.test(String(row[col('Captain / student name')] || ''))) { tests++; return; }
    const at = row[cAt] instanceof Date ? row[cAt] : new Date(row[cAt]);
    const k = isNaN(at) ? '' : dayKey(at);
    const n = mails.length;
    const r = {
      solo: /individual|solo/i.test(String(row[cType])),
      city: reportName(row[cCity]) || 'Not given',
      school: reportName(row[cSchool]),
      org: String(row[cOrg] || '').trim().toUpperCase(),
      cat: /junior|6\D+8/i.test(String(row[cCat])) ? 'Junior (6–8)' : /senior|9\D+12/i.test(String(row[cCat])) ? 'Senior (9–12)' : 'Not given'
    };
    [all].concat(k === key ? [today] : []).forEach(function (s) {
      s.regs++; s.students += n; s[r.solo ? 'solo' : 'team']++;
      s.cities[r.city] = (s.cities[r.city] || 0) + n;
      s.cats[r.cat] = (s.cats[r.cat] || 0) + n;
      if (r.school) s.schools[r.school] = (s.schools[r.school] || 0) + n;
      if (r.org) { const name = orgNames[r.org] || r.org; s.orgs[name] = (s.orgs[name] || 0) + n; }
    });
    if (k === prevKey) prev += n;
  });
  const sorted = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); }); };
  [all, today].forEach(function (s) { ['cities', 'schools', 'orgs', 'cats'].forEach(function (f) { s[f] = sorted(s[f]); }); });
  return {
    all: all, day: today, prev: prev, tests: tests, isToday: hour >= 12,
    dayLabel: (hour >= 12 ? 'Today' : 'Yesterday') + ', ' + Utilities.formatDate(day, tz, 'd MMM'),
    sentAt: Utilities.formatDate(now, tz, 'd MMM yyyy, h:mm a')
  };
}

// "  jaipur " and "JAIPUR" are counted as one: Jaipur
function reportName(v) {
  return String(v || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s(\-\/.])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
}

function reportOrgNames() {
  const tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Organizations');
  const out = {};
  if (!tab || tab.getLastRow() < 2) return out;
  tab.getRange(2, 1, tab.getLastRow() - 1, 4).getValues().forEach(function (r) { out[String(r[0]).trim().toUpperCase()] = String(r[3]).trim(); });
  return out;
}

function reportHtml(r) {
  const BLUE = '#0b6cd3', INK = '#14213d', MUTED = '#5b6b80', LINE = '#dbe8f7';
  const font = 'font-family:Arial,Helvetica,sans-serif;';
  const fmt = function (n) { return Number(n).toLocaleString('en-IN'); };
  const card = function (num, label, sub, dark) {
    return '<td width="33%" valign="top" style="padding:6px"><div style="' + font + 'border-radius:14px;padding:16px 14px;' +
      (dark ? 'background:' + BLUE + ';color:#fff' : 'background:#f3f8ff;border:1px solid ' + LINE + ';color:' + INK) + '">' +
      '<div style="font-size:30px;font-weight:bold;line-height:1.1">' + num + '</div>' +
      '<div style="font-size:13px;font-weight:bold;margin-top:6px">' + label + '</div>' +
      (sub ? '<div style="font-size:12px;margin-top:3px;' + (dark ? 'color:#d6e9ff' : 'color:' + MUTED) + '">' + sub + '</div>' : '') + '</div></td>';
  };
  const cards = function (list) { return '<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>' + list.join('') + '</tr></table>'; };
  const heading = function (text, note) {
    return '<div style="' + font + 'font-size:12px;font-weight:bold;letter-spacing:1.5px;color:' + BLUE + ';margin:26px 6px 8px">' + text +
      (note ? ' <span style="color:' + MUTED + ';font-weight:normal;letter-spacing:0">· ' + note + '</span>' : '') + '</div>';
  };
  // a ranked list with bars; the rest are added up as "Others"
  const bars = function (title, rows, top) {
    if (!rows.length) return '';
    const shown = rows.slice(0, top), rest = rows.slice(top).reduce(function (n, x) { return n + x[1]; }, 0);
    if (rest) shown.push(['Others (' + (rows.length - top) + ')', rest]);
    const max = Math.max.apply(null, shown.map(function (x) { return x[1]; }));
    return '<div style="border:1px solid ' + LINE + ';border-radius:14px;padding:14px 16px;margin:6px">' +
      '<div style="' + font + 'font-size:14px;font-weight:bold;color:' + INK + ';margin-bottom:8px">' + title + '</div>' +
      '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">' + shown.map(function (x) {
        const w = Math.max(3, Math.round(100 * x[1] / max));
        return '<tr><td width="38%" style="' + font + 'font-size:13px;color:' + INK + ';padding:5px 8px 5px 0">' + esc(x[0]) + '</td>' +
          '<td style="padding:5px 0"><table width="' + w + '%" cellpadding="0" cellspacing="0" role="presentation"><tr><td height="10" style="background:#399aff;border-radius:6px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>' +
          '<td width="44" align="right" style="' + font + 'font-size:13px;font-weight:bold;color:' + INK + ';padding:5px 0 5px 8px">' + fmt(x[1]) + '</td></tr>';
      }).join('') + '</table></div>';
  };
  const d = r.day, a = r.all, diff = d.students - r.prev;
  const vs = (diff > 0 ? '▲ ' + diff : diff < 0 ? '▼ ' + (-diff) : 'Same as') + ' vs the day before';
  const split = function (s) { return fmt(s.solo) + ' individual · ' + fmt(s.team) + ' team'; };

  return '<div style="background:#eef4fb;padding:20px 8px">' +
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td>' +
    '<div style="background:' + BLUE + ';padding:26px 24px;' + font + 'color:#fff">' +
    '<div style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#cfe6ff">MIIC × CODEVIDHYA IDEATHON 2026</div>' +
    '<div style="font-size:26px;font-weight:bold;margin-top:8px">Daily registration report</div>' +
    '<div style="font-size:13px;color:#d6e9ff;margin-top:6px">' + esc(r.sentAt) + ' (India time)</div></div>' +
    '<div style="padding:4px 14px 22px">' +
    heading(r.dayLabel.toUpperCase(), r.isToday ? 'so far' : 'full day') +
    cards([card(fmt(d.students), 'Students registered', vs, true), card(fmt(d.regs), 'Registrations', split(d)), card(fmt(d.cities.length), 'Cities', d.cities[0] ? 'Most: ' + esc(d.cities[0][0]) : 'None yet')]) +
    bars('Where they registered from', d.cities, 8) +
    bars('Schools / organizations', d.orgs.length ? d.orgs : d.schools, 5) +
    heading('TILL DATE') +
    cards([card(fmt(a.students), 'Total students', 'since registration opened', true), card(fmt(a.regs), 'Registrations', split(a)), card(fmt(a.cities.length), 'Cities', a.schools.length + ' schools')]) +
    bars('Top cities', a.cities, 10) +
    bars('Top schools', a.schools, 5) +
    (a.orgs.length ? bars('Organizations (students through their link)', a.orgs, 5) : '') +
    bars('Category', a.cats, 3) +
    '<div style="' + font + 'font-size:11px;color:' + MUTED + ';margin:18px 6px 0">Students are counted per person (a team of 4 is 4 students). ' +
    (r.tests ? r.tests + ' test registration' + (r.tests > 1 ? 's are' : ' is') + ' left out. ' : '') + 'Sent automatically from the registration sheet.</div>' +
    '</div></td></tr></table></div>';
}
