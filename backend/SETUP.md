# Connect the registration forms to a Google Sheet (about 5 minutes, free)

Team registrations (`register.html`) and mentor registrations (home page) are sent to one Google Apps Script.
It saves each one as a row in a Google Sheet: a **Teams** tab and a **Mentors** tab, created automatically.

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
- Submit a test team on `register.html`. A new row appears in the **Teams** tab, and its Registration ID (e.g. `IDT26-0001`) matches the one shown on the success screen.

## Notes

- If you change the script later, publish it with **Deploy → Manage deployments → Edit → Version: New version**. Do not create a brand-new deployment, because that changes the URL.
- Only people you share the Google Sheet with can see the data.
- Mentor profile uploads (CV / resume, up to 5 MB) are saved in a Google Drive folder called **Ideathon 2026 Mentor Profiles** in the same Google account, and the **Mentors** tab gets a link to each file. That is why Google also asks for Drive permission during step 4.
- Answers that start with `=`, `+`, `-` or `@` are stored as plain text so they can never run as spreadsheet formulas.
- After each registration the script emails a thank-you note (student or mentor) from the Google account that owns the script. Google asks for "send email as you" permission during step 4. Before the test date is announced, fill in `TEST_DATE`, `TEST_TIME` and `CONTACT_PHONE` at the top of the script and publish a new version. A free Gmail account can send about 100 emails a day; a Google Workspace account about 1,500.

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
