# BBA Networking — bbanetworking.com

Public website (bbanetworking.com: landing page + `/visit` visitor form) + members app, admin panel and API
(dashboard.bbanetworking.com) for the Burhani Business Association. Spec: `BBA_Networking_App_DPR.md` (kept locally, not in the repo).

**Stack:** React 18 + Vite + TypeScript + Tailwind (built locally to static files) · plain PHP 7.3 JSON API
(`server/api`) · SQLite by default (MySQL supported via config) · PHPMailer for OTP/transactional email.

## Local development
```bash
npm install
php -d extension=pdo_sqlite server/tools/seed.php     # dev data: 25 members, 80 referrals… (local only)
npm run api                                            # PHP API on :8080
npm run dev                                            # app on http://localhost:5173 (proxies /api)
npm run test:e2e                                       # ~340 end-to-end API checks (see below)
```
The e2e tests need a fresh seed: delete `server/api/_private/data`, `_private/uploads`, `_private/backups` and
`server/uploads/site`, re-run the seed, then `npm run test:e2e` (PHP 7.3 recommended:
`php -d extension=pdo_sqlite -d extension=fileinfo -d extension=mbstring -S 127.0.0.1:8080 server/dev-router.php`).

## Layout
```
src/                      React app (one build serves both domains)
  features/landing/       bbanetworking.com landing page (+ style.ts: the signboard look)
  features/visit/         bbanetworking.com/visit — "Attend as a visitor" form
  features/admin/         admin panel (VisitorForm.tsx, Backup.tsx, …)
  features/…              member app screens
server/api/               PHP 7.3 JSON API — index.php front controller, lib/ helpers, routes/ endpoints
server/api/_private/      never served: config, SQLite DB, sessions, logs, private uploads, backups (all gitignored)
server/uploads/           public uploads (avatars, site = visitor-form QR, ig = Instagram covers)
server/main-site/         .htaccess for bbanetworking.com
scripts/postbuild.mjs     splits the build into dist/dashboard and dist/main
tests/                    end-to-end API tests (helpers.mjs shared)
media/                    source artwork for the logo and icons
```
Local config: `server/api/_private/config.secrets.php` (mail is logged, OTPs written to `_private/logs/otp.log`).
The seed creates throwaway local-only accounts (see `server/tools/seed.php`); none of them exist on the live site.

## Build & deploy
```bash
npm run build              # → dist/dashboard (app + API) and dist/main (landing page + visitor form)
bash deploy.sh check       # confirms /bbanetworking.com and /dashboard.bbanetworking.com exist on FTP
bash deploy.sh secrets     # FIRST DEPLOY ONLY — uploads hosting-details/config.secrets.production.php
bash deploy.sh all         # assets first, HTML last
```
FTP login lives in `hosting-details/.netrc-deploy` (gitignored). The build never contains secrets, the
database, sessions, logs or uploads, so redeploys can't overwrite live data.

The database creates itself on the first API request (tables, categories, settings). Production has no bootstrap
admin (`ADMIN_EMAIL` is empty): admins join through invite links. If the site ever has no admin left, upload a one-time
token-protected runner that calls `invite_issue()` (see FTP guide rule 6), run it once, then delete it.

## Email (Resend)
Invites, OTP codes and approval emails go through [Resend](https://resend.com) (free: 3,000 emails/month, 100/day).
**Live:** set up and verified; account details are in `hosting-details/live-accounts.md` (gitignored).
Delivery log: resend.com → Emails. To set it up again from scratch:
1. Create a Resend account → Domains → add `bbanetworking.com` → add the DNS records it shows (SPF, DKIM, and MX for
   `send.bbanetworking.com`) at the domain's DNS host → wait for "Verified".
2. API Keys → create a key with "Sending access" for that domain.
3. In the live `api/_private/config.secrets.php` set `MAIL_DRIVER => 'resend'`, `RESEND_API_KEY => 're_…'` and
   `MAIL_FROM => 'no-reply@bbanetworking.com'` (update `hosting-details/config.secrets.production.php`, then `bash deploy.sh secrets`).
4. Admin → Settings → "Send test email".

Other drivers still work: `smtp` (e.g. a Gmail App Password), `mail` (host's PHP mail(), often lands in spam), `log` (dev).
Failures are written to `api/_private/logs/mail.log`.

## Adding members
- **Invite (admins):** Admin → Members → *Invite member*. The person gets an email link (valid 7 days, single use) to fill in
  their profile and set a password, and joins already approved. The admin also sees the link to copy or share on WhatsApp,
  so an invite still works if email is down. Choose *Admin* for an admin account: it asks only for name, mobile and
  password, and is admin-only (no member dashboard, profile or directory entry).
- **Apply (public):** `/join` → email code → admin approves under Applications.

## Visitor form (bbanetworking.com/visit)
"Attend as a visitor" button on the landing page → a form for people to register for a meeting as a guest.
Everything is edited in **Admin → Visitor form**:
- **Responses:** every registration, searchable, with status (New / Contacted / Confirmed / Attended / Cancelled),
  admin notes, attachments (payment screenshots), WhatsApp/call/email buttons and Excel export.
- **Questions:** add, remove, reorder, rename and retype questions (short/long answer, phone, email, number, date,
  choice list, tick box, photo/PDF upload), mark them required. Name and mobile are always asked.
- **Page & payment:** page text, thank-you and closed messages, open/closed switch, meeting picker, visitor fee,
  payment QR image, UPI ID, payment link, who gets the alert email, and the BBA WhatsApp number.

Each registration is emailed (to the listed addresses, or every admin), shown on the bell, and the visitor gets a
"Send my details on WhatsApp" button that opens a chat with the BBA number, details pre-filled. (Fully automatic
WhatsApp would need the paid WhatsApp Business API.) Spam: hidden bot-trap field, max 20 registrations per IP per
hour, double-submits within 15 minutes collapse into one.

## Instagram grid on the landing page
Live: the BBA Instagram account via a Behold.so feed (details in `hosting-details/live-accounts.md`, gitignored).
Change either in Admin → Settings → "Instagram on the landing page".

How a new post reaches the site, with no one doing anything: Behold re-reads Instagram once a day (free plan;
$10/month Starter is hourly), and our API re-reads Behold once an hour. Worst case a post appears ~25 hours after it
is published, usually sooner. That is ~720 feed requests a month, under the free plan's 1,200.

Reel tiles use the cover the account chose. Instagram's API only gives a reel's first frame (often black), so the API
reads each reel's public link preview once, keeps a copy in `uploads/ig/`, and falls back to Behold's image if that
fails. Covers of posts that leave the feed are deleted automatically.

## Backups
**Admin → Backup → Download backup** saves one `.zip` with every database table (`database/*.json`) and every uploaded
file (`files/…`), described by `manifest.json`. Download one monthly and before big changes; keep it private.

**Restore** (same page): choose that zip. It uploads in 2 MB chunks (the host caps single uploads), is checked
completely (manifest, every table's rows, every file's checksum) and changes nothing until you type RESTORE. The
database is replaced in one transaction and each upload folder ends up holding exactly the backup's files. A
*safety copy* of the current data is saved first (last 5 kept), so a restore can be undone from the same page.
Backups from older app versions are upgraded automatically; backups from newer versions are refused.
Not included: `config.secrets.php` (email key, DB settings) — keep `hosting-details/config.secrets.production.php`.

**If the server is lost:** deploy the app to the new host (`bash deploy.sh secrets` + `bash deploy.sh all`), create one
admin (one-time invite runner, see above), log in, Admin → Backup → restore. Everyone then uses their old passwords.

Local copies of the live database taken before past deploys are in `hosting-details/backups/` (gitignored).

## Logo
The official seal is `media/bba logo.jpeg` (cropped to `media/logo.png`). `public/logo*.png`, the favicons, app icons and
`og-image.png` are generated from it. `<Logo>` / `<Wordmark>` in `src/components/Brand.tsx` render it in the app.

## Open items
- ITS number validation assumes exactly 8 digits.
