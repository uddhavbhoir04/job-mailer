# Job Application Mailer

Upload a **PDF or Excel** list of recruiters (SNo, Name, Email, Title, Company), upload your **resume**, preview a **personalized email** for each recruiter, and send them **one by one through your Gmail account**. Everything is tracked, so an application is never sent twice by accident.

- Node.js + Express + SQLite backend; React (Vite + Tailwind) dashboard
- PDF (multi-page, auto-detected columns), XLSX, XLS and CSV import, plus OCR for scanned PDFs
- Template editor with `{{Placeholders}}`, live HTML and plain-text preview
- Configurable delay, batching, retries, daily limit, and pause/resume/stop
- DRY_RUN mode (on by default) that builds every email but sends nothing

---

## 1. Architecture

```
job-mailer/
├── package.json              # root scripts: dev (runs both), test, build
├── backend/
│   ├── server.js             # Express app, crash recovery, serves built frontend
│   ├── config/
│   │   ├── index.js          # the ONLY place process.env is read
│   │   └── db.js             # SQLite schema (recruiters, templates, campaigns, email_logs, suppression_list, settings)
│   ├── routes/index.js       # all /api routes
│   ├── controllers/          # HTTP layer: upload, recruiter, template, resume, email, campaign, stats
│   ├── services/
│   │   ├── pdfExtraction.service.js    # pdfjs-dist text with x/y positions
│   │   ├── tableReconstruction.js      # positions → rows/columns (shared by PDF + OCR)
│   │   ├── ocr.service.js              # scanned PDFs: pdf-to-img + tesseract.js
│   │   ├── excelExtraction.service.js  # SheetJS (xlsx/xls/csv)
│   │   ├── columnMapper.service.js     # header auto-detection + fallbacks
│   │   ├── emailValidation.service.js  # normalize + validate (+ optional MX check)
│   │   ├── recordImport.service.js     # extract → validate → dedupe → store
│   │   ├── emailGeneration.service.js  # placeholder rendering, HTML escaping, text version
│   │   ├── resume.service.js           # PDF check (magic bytes), size, replace
│   │   ├── gmail.service.js            # Nodemailer Gmail SMTP / dry-run transport, error classification
│   │   ├── sendQueue.service.js        # sequential sender: delay, batches, retry, pause/resume
│   │   └── tracking.service.js         # history, stats, unsubscribe list, daily count
│   ├── models/               # SQLite data access (recruiter, template, campaign, settings)
│   ├── utils/                # logger (winston), errors, multer upload config, hashing, sleep
│   ├── uploads/              # data/ (temporary uploads), resume/ (current resume.pdf)
│   ├── logs/                 # app.log, error.log
│   ├── sample-data/          # test files + generator
│   └── tests/                # node:test suites
└── frontend/
    ├── vite.config.js        # proxies /api → http://127.0.0.1:5000
    └── src/
        ├── App.jsx           # dashboard layout, polling, modals
        ├── api.js            # fetch wrapper
        └── components/       # StatsCards, UploadPanel, ResumePanel, SettingsPanel, SendControls,
                              # RecordsTable, TemplateEditor, EmailPreview, HistoryTable, SuppressionList
```

**Request flow.** Uploading a file goes through `recordImport`, which picks the PDF or Excel extractor, then `columnMapper` turns the rows into records. Each record is validated, deduped by a SHA-256 of *email + company + title*, and stored in `recruiters`.

**Send flow.** Start a campaign and `sendQueue` handles one recruiter at a time:

1. It atomically claims the row (`pending`/`failed` → `sending`). A row that is already `sent` can't be claimed.
2. `emailGeneration` renders the email, `resume` adds the attachment, and `gmail` sends it.
3. The result goes to `email_logs`.
4. It waits for the delay, then moves to the next recruiter.

### How duplicates and re-sends are prevented

| Layer | Mechanism |
|---|---|
| Import | `dedupe_key` UNIQUE column (case-insensitive email + company + title). Duplicates inside a file and across uploads are counted, not inserted. |
| Send | `UPDATE … SET status='sending' WHERE id=? AND status IN ('pending','failed','queued')` runs before every email. A `sent` row is never picked up again. |
| Manual resend | Possible only from the ✉️ button on a sent row, by ticking “send it again”. The API also requires `force: true`. |
| Restart | On boot, rows stuck in `sending`/`queued` go back to `pending` and a running campaign becomes `paused`, so you can resume it. |
| Unsubscribe | Addresses on the do-not-contact list are skipped at send time, including in future uploads. |

---

## 2. Installation

Requirements: **Node.js 20.19+** (tested on Node 24). Nothing else: OCR is pure JavaScript.

```bash
cd job-mailer
npm run install:all                 # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env
```

Edit `backend/.env`. At minimum set `SENDER_NAME` and `SENDER_PHONE`, and leave `DRY_RUN=true` for now.

> `pdfjs-dist` is pinned to `~6.4.299` to match the copy bundled with `pdf-to-img`. Two different pdfjs versions in one process break OCR ("API version does not match Worker version"). If you upgrade one, upgrade both together.

---

## 3. Gmail App Password setup

Gmail SMTP does not accept your normal password. You need an **App Password**:

1. Open <https://myaccount.google.com/security> and turn on **2-Step Verification**. App Passwords require it.
2. Open <https://myaccount.google.com/apppasswords>. If the page says it isn't available, 2-Step Verification is off, or your Workspace admin has disabled App Passwords.
3. Enter a name such as `Job Mailer` and click **Create**.
4. Google shows a 16-character password like `abcd efgh ijkl mnop`. Copy it; it is shown only once.
5. In `backend/.env`:
   ```env
   GMAIL_USER=your.address@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop   # spaces are stripped automatically
   ```
6. Restart the backend, then click **Verify SMTP** in the dashboard (or `curl http://127.0.0.1:5000/api/email/verify`).

Credentials are read only by `backend/config/index.js`. They are never returned by the API (the dashboard sees only a masked address) and `.env` is git-ignored. To revoke access later, delete the App Password on the same Google page.

---

## 4. Running locally

```bash
npm run dev          # from job-mailer/: backend on :5000 + dashboard on :5173
```

Open **http://localhost:5173**.

Or run them separately: `cd backend && npm run dev`, and `cd frontend && npm run dev`.

Single-process option: `npm run build && npm start` serves the built dashboard from the backend at http://127.0.0.1:5000.

Tests: `npm test` (20 tests covering extraction, dedupe, template rendering, the never-resend guarantee and SMTP error classification).

---

## 5. Uploading recruiter data (PDF / Excel)

Click **Upload PDF or Excel**, or drag a file onto the panel. Accepted: `.pdf`, `.xlsx`, `.xls`, `.csv`, up to `MAX_UPLOAD_MB` (10 MB by default).

- **Column detection.** Headers are found automatically in the first 10 rows, even below a title line and in any order. Many header names are recognized: `S.No`, `#`, `Recruiter Name`, `HR Name`, `Mail ID`, `E-mail Address`, `Job Title`, `Position`, `Designation`, `Role`, `Organisation`, `Employer` and more. With no headers, it falls back to column order SNo, Name, Email, Title, Company, and then to finding emails by pattern.
- **PDF tables.** Text positions are used to rebuild rows and columns. This handles multiple pages, headers repeated on each page, text wrapped inside a cell, and page-number footers.
- **Scanned PDFs.** If a PDF has no text layer, the dashboard says so and shows **Run OCR**. OCR takes a few seconds per page, and the first run downloads English language data, so it needs internet once. **Always review OCR results**: misread emails are flagged as invalid and you can fix them with ✏️.
- **Validation.** Emails are trimmed, lower-cased and checked. Invalid ones are kept but shown in red, can't be selected for sending, and can be fixed with ✏️. Rows without any email are skipped and reported. Set `VALIDATE_MX=true` to also check that each domain has a mail server.
- **Duplicates.** The upload summary shows found / new / duplicates / invalid. Re-uploading the same file inserts nothing.

**Adding recruiters manually.** Click **＋ Type / paste emails** under the upload area.
- **Type one:** enter the email (required) plus name, title and company. Use **Add & add another** to enter several in a row.
- **Paste a list:** one recruiter per line, as `email`, `Name, email` or `Name, email, Title, Company`. You can also paste rows copied from Excel or Google Sheets, with or without a header row.

Typed entries go through the same checks as uploads (validation, duplicates, unsubscribe list). A typo like `name@company` is added but flagged as invalid so you can fix it with ✏️.

In the **Records** tab you can search, filter by status or validity, select individual rows or all sendable rows, edit, delete, preview (👁), send one (✉️), or mark do-not-contact (🚫).

## 6. Uploading your resume

In **2. Resume (PDF)**, click **Upload resume**. Only real PDFs are accepted: the file content must start with `%PDF-`, so a renamed `.docx` is rejected. The size limit is `MAX_RESUME_MB` (5 MB by default). **Replace resume** swaps it atomically, **View** opens the stored copy, and the attachment keeps your original file name. Sending is blocked until a resume exists.

## 7. Email template

In the **Email template** tab:

- **Placeholders** (case-insensitive): `{{Name}} {{Title}} {{Company}} {{SNo}} {{Email}} {{SenderName}} {{SenderPhone}} {{SenderEmail}}`. Click a chip to insert it at the cursor.
- **Missing data** gets a fallback: Name → “Hiring Manager”, Title → “open”, Company → “your company”. The preview lists a warning for each fallback used.
- **Format.** The body is HTML (`<p>` for paragraphs). A plain-text version is generated automatically, or you can write your own. Every email is sent with both versions.
- **Preview.** Pick any recruiter from the dropdown to see the live result, including unsaved edits. Click **Save template** before sending.

The default template is the one from your brief, plus a one-line “reply *unsubscribe*” footer and a `List-Unsubscribe` header.

## 8. Testing with DRY_RUN

`DRY_RUN=true` (the default) runs the whole pipeline: claiming rows, rendering, attaching the resume, building the MIME message, logging and pacing. The only step skipped is the SMTP delivery.

1. Run `npm run dev` with `DRY_RUN=true`.
2. Upload `backend/sample-data/recruiters.pdf`. You should see **25 found, 23 new, 2 duplicates, 2 invalid**.
3. Upload `backend/sample-data/recruiters.xlsx`. You should see **0 new, 25 duplicates**.
4. Upload your resume and set your name and phone in **Settings**.
5. Set **Delay** to `2` seconds and save.
6. Select a few rows and click **Start sending**. The confirmation dialog shows a preview. Then try **Pause**, **Resume** and **Stop**.
7. Rows get a “dry-run ✓” badge, and **History** shows `sent` + `dry run`. Dry-run rows stay `pending`, so a later real send still goes out.
8. To try OCR, upload `backend/sample-data/recruiters-scanned.pdf` and click **Run OCR**.

Going live:

1. Set `DRY_RUN=false` in `.env` and restart.
2. First send **one** email to yourself: add a row with your own address, or edit one, then use ✉️.
3. Check that it arrived with the resume attached.
4. Then start a campaign.

`DRY_RUN` is only the starting value. You can switch it either way with the **Dry-run mode** checkbox in Settings, and turning it off asks for confirmation. To force dry-run and disable the checkbox, set `DRY_RUN_LOCKED=true`. On hosts whose filesystem is wiped on restart, such as Render's free plan, the checkbox choice is lost on restart and the app goes back to `DRY_RUN`, which is the safe direction.

## 9. Sending behaviour and limits

| Setting | Default | Notes |
|---|---|---|
| `EMAIL_DELAY_MS` | 30000 | ±20% random jitter. Editable in the dashboard and applied live. |
| `BATCH_SIZE` / `BATCH_PAUSE_MS` | 20 / 120000 | Longer pause after each batch. |
| `MAX_RETRIES` | 3 | Only for temporary errors (timeouts, 4xx), with backoff of 5s, 10s, 20s. |
| `DAILY_SEND_LIMIT` | 400 | Real sends since local midnight. Gmail allows about 500/day for personal accounts and 2,000 for Workspace. |

- Each email goes to exactly one recipient, never CC or BCC.
- **Gmail daily-limit error (550 5.4.5)** pauses the campaign. That recipient stays pending; resume the next day.
- **Authentication error (535)** stops the campaign. Fix `.env` and restart.
- **Permanent recipient error** (e.g. user unknown) marks that row `failed` and moves on. Failed rows can be selected and sent again.
- Every attempt, retry and skip is recorded in **History** and `backend/logs/`.

## Deploying (Vercel frontend + Render backend)

The frontend calls the backend URL in `VITE_API_URL`. It's set in `frontend/.env.production`, which currently points to `https://job-mailer-backend-amfp.onrender.com`. A `VITE_API_URL` env var set in Vercel overrides it. The value is baked in at build time, so redeploy the frontend after changing it.

**Render (backend: Web Service)**

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |

Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (listens on 0.0.0.0 and requires `APP_PASSWORD`) |
| `APP_PASSWORD` | a strong password; the dashboard asks for it |
| `FRONTEND_ORIGIN` | your Vercel URL, e.g. `https://job-mailer.vercel.app` (comma-separate several) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail credentials |
| `SENDER_NAME`, `SENDER_PHONE` | your signature |
| `DRY_RUN` | `true` until you've tested |
| `DATA_DIR` | optional: mount path of a persistent disk |

Do **not** set `HOST`; it defaults to `0.0.0.0` in production.

**Vercel (frontend):** Root Directory `frontend`, Framework Preset `Vite` (build `npm run build`, output `dist`).

**Check it works**
- `https://<backend>/api/health` returns `{"ok":true,"authRequired":true}`.
- `/api/stats` without a password returns 401.
- The Vercel URL shows a login screen; enter `APP_PASSWORD`.

**Free-plan caveats**
- **Data is wiped.** Render's free filesystem resets on every deploy and restart, which removes the SQLite database, your uploaded resume and the history. For data that lasts, add a persistent disk and set `DATA_DIR` to its mount path (e.g. `/var/data`).
- **Slow first load.** A free instance sleeps after about 15 minutes idle, so the first request takes about a minute.
- **Campaigns pause.** If the instance sleeps or restarts mid-campaign, the campaign is paused. Resume it from the dashboard.

## 10. Responsible use

- Every send needs an explicit confirmation in the dashboard, and the API rejects requests without `confirm: true`.
- Only email recruiters who publish their address for hiring, or who expect applications.
- Honour “unsubscribe” replies right away by adding the address in the **Unsubscribes** tab.
- Keep the volume modest. Bulk cold email can get your Gmail account limited.

## Sample data

`backend/sample-data/` contains `recruiters.pdf` (2 pages), `recruiters.xlsx`, `recruiters.xls` and `recruiters-scanned.pdf` (image only, for OCR). The 25 rows include 2 duplicates, 2 invalid emails, a missing name, a missing title, and a company name long enough to wrap. All addresses use the reserved `example.com`/`example.org` domains, so nothing can be delivered. Regenerate them with `npm run samples`.

## API reference

```
POST   /api/upload/records          multipart "file"  → { extracted, inserted, duplicates, invalid, requiresOcr }
POST   /api/upload/records/ocr      OCR the last scanned PDF
GET    /api/recruiters?search=&status=&valid=
POST   /api/recruiters          {records?:[{name,email,title,company}], text?}  (manual entry)
PATCH  /api/recruiters/:id          DELETE /api/recruiters/:id     POST /api/recruiters/bulk-delete {ids}
POST   /api/recruiters/:id/unsubscribe
GET|POST /api/suppressions          DELETE /api/suppressions/:email
GET|POST|DELETE /api/resume         GET /api/resume/file
GET|PUT /api/templates/default      POST /api/templates/reset      POST /api/templates/preview {recruiterId?, template?}
GET    /api/email/verify
POST   /api/email/send-one/:id      {confirm:true, force?}
POST   /api/email/send              {confirm:true, recruiterIds:[...]}
GET    /api/campaigns/current       POST /api/campaigns/pause|resume|stop
GET    /api/stats   GET /api/history   GET|PUT /api/settings
```
