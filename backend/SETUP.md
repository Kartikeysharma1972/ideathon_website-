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
7. Re-upload the website. The yellow "Preview mode" notes disappear.

## Check it works

- Open the Web app URL in a browser. It should show `{"ok":true,"service":"Ideathon 2026 registrations"}`.
- Submit a test team on `register.html`. A new row appears in the **Teams** tab, and its Registration ID (e.g. `IDT26-0001`) matches the one shown on the success screen.

## Notes

- If you change the script later, publish it with **Deploy → Manage deployments → Edit → Version: New version**. Do not create a brand-new deployment, because that changes the URL.
- Only people you share the Google Sheet with can see the data.
- Answers that start with `=`, `+`, `-` or `@` are stored as plain text so they can never run as spreadsheet formulas.
