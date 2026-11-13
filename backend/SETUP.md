# Connect the registration forms to a Google Sheet (about 5 minutes, free)

Student registrations (`register.html`, individual or team) and mentor registrations (home page) are sent to one Google Apps Script.
It saves each one as a row in a Google Sheet: a **Teams** tab (individuals and teams, with a "Registration type" column) and a **Mentors** tab, created automatically. When the form gains new questions, the script updates the header row by itself.

## Steps

1. Log in to the Google account that should own the data (ideally a Codevidhya account) and create a new Google Sheet, e.g. "Ideathon 2026 Registrations".
2. In the sheet: **Extensions → Apps Script**.
3. Delete the sample code, paste the entire contents of `backend/google-apps-script.gs`, and click **Save**.
4. Click **Deploy → New deployment** → gear icon → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then **Authorize access** and allow the permissions. On the "Google hasn't verified this app" screen, click **Advanced → Go to (project)**. This is your own script.
5. Copy the **Web app URL** (it ends in `/exec`).
6. Open `dist/forms-config.js` and paste it:
   ```js
   window.IDEATHON_FORMS_ENDPOINT = 'https://script.google.com/macros/s/XXXX/exec';
   ```
7. Re-upload the website. The "Preview mode" note after submitting disappears.

## Check it works

- Open the Web app URL in a browser. It should show `{"ok":true,"service":"Ideathon 2026 registrations"}`.
- Submit a test registration on `register.html`. A new row appears in the **Teams** tab, and its Registration ID (e.g. `IDT26-0001`) matches the one shown on the success screen.

## Notes

- If you change the script later, publish it with **Deploy → Manage deployments → Edit → Version: New version**. Do not create a brand-new deployment, because that changes the URL.
- Only people you share the Google Sheet with can see the data.
- Mentor profile uploads (CV / resume, up to 5 MB) are saved in a Google Drive folder called **Ideathon 2026 Mentor Profiles** in the same Google account, and the **Mentors** tab gets a link to each file. That is why Google also asks for Drive permission during step 4.
- Answers that start with `=`, `+`, `-` or `@` are stored as plain text so they can never run as spreadsheet formulas.
- Emails are switched on separately at the top of the script: `SEND_MENTOR_EMAILS = true` (mentors get the registration email) and `SEND_STUDENT_EMAILS = false` (student registrations are only saved for now). Change one and publish a new version.
- Emails go out from `headoffice.codevidhya@codevidhya.com` (`SEND_FROM`) if the script is deployed from that Google account, or if the deploying account has it as a Gmail "Send mail as" address. Otherwise they go from the deploying account, with replies going to head office. The Mentors tab's last column, **Email sent**, shows what happened for each mentor.
- After pasting a new version that sends email, run `testMentorMail` once from the editor (▶ Run). Google asks for Gmail permission, and a sample mentor email arrives in your own inbox.

## Make the live site fast (for the server admin)

The 3D models are already compressed (about 1.9 MB in total). Three server settings make the site faster still:

1. **Allow `dist/.htaccess`.** It turns on gzip for the 3D models and browser caching. In the site's Apache config set `AllowOverride FileInfo Indexes` (or `All`) for the site folder, then enable the modules and reload:
   ```bash
   sudo a2enmod deflate expires headers
   sudo systemctl reload apache2
   ```
   Make sure `.htaccess` is uploaded too (it is a hidden file, so some upload tools skip it).
2. **Turn on HTTP/2** so the browser downloads all files over one connection:
   ```bash
   sudo a2enmod http2
   # in the site's <VirtualHost *:443> add:  Protocols h2 http/1.1
   sudo systemctl reload apache2
   ```
   (HTTP/2 needs Apache's `mpm_event`. If the server uses `mpm_prefork` with mod_php, check before switching.)
3. **Check it:** `curl -sI -H "Accept-Encoding: gzip" https://live.codevidhya.com/assets/models/teacher.glb` should show `Content-Encoding: gzip` and an `Expires` header, and `curl -sI --http2 https://live.codevidhya.com/` should start with `HTTP/2 200`.

## Organization (school) registration

- Schools, colleges, NGOs and learning centres register on `organization.html` (the "Organization registration" card on the registration page). Each one gets a row in the **Organizations** tab with an ID like `ORG26-0001`.
- The coordinator is emailed the organization's student link, `https://live.codevidhya.com/ideathon-2026/register.html?org=ORG26-0001` (`SEND_ORG_EMAILS`, sent from head office like the mentor email; the **Email sent** column shows what happened).
- A student who opens that link sees the organization's name, gets the school (for schools) and city filled in, and their registration is tagged in the Teams tab's last column, **Organization ID**. The organization's **Students registered** count goes up by the number of students in the registration.
- The website looks up an organization with `GET <web app URL>?org=ORG26-0001`, which returns only its ID, type, name and city.
