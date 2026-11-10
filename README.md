# XE 54 Intelligence Solutions — xe54intelligence.co.za

Company website: Home, About, Capabilities, Investors (request access), Partners, Careers, Contact and a POPIA privacy notice.
Every form is saved to a small database and emailed to skshange@xe54intelligence.co.za. The person who submitted it also gets an automatic acknowledgement with a reference number (e.g. `XE-12`).

No packages to install. It runs on Node.js 22.5 or newer, like the Diamond Health site.

## Run it in VS Code

1. Open this folder in VS Code (**File → Open Folder…**).
2. Open the terminal (**Terminal → New Terminal**) and run `npm start`.
3. Open http://localhost:3000.

Without an email key, form emails are printed in the terminal instead of being sent.

## Files

| File | What it is |
|---|---|
| `public/*.html` | The pages. Edit text directly in these files. The header and footer are repeated in each page, so change them in every file. |
| `public/styles.css` | All colours, fonts and layout. Brand colours are at the top. |
| `public/site.js` | Mobile menu, scroll animations and form sending |
| `public/img/` | Logo files and favicon |
| `server.js` | Serves the site, receives forms, sends emails |

## Deploy on Render

1. Render → **New → Web Service** → connect the `xe54` GitHub repo.
2. Build command: *(leave empty)* · Start command: `npm start`.
3. Add these under **Environment**:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | from resend.com → API Keys |
| `MAIL_FROM` | `XE 54 Intelligence <noreply@xe54intelligence.co.za>` |
| `ENQUIRY_EMAIL` | optional, defaults to `skshange@xe54intelligence.co.za` (comma-separate to add more) |
| `ADMIN_KEY` | optional: a long random password to view all enquiries (see below) |

4. Render → **Settings → Custom Domains** → add `xe54intelligence.co.za` and `www.xe54intelligence.co.za`, then add the DNS records Render shows at your domain registrar.
5. In Resend, add the domain `xe54intelligence.co.za` and add its DNS records at the registrar too, so emails can be sent from it.

## Viewing enquiries

Every enquiry arrives by email; hit **Reply** to answer the person directly.
To download them all at once (with `ADMIN_KEY` set):

```
curl -H "x-admin-key: YOUR_ADMIN_KEY" https://xe54intelligence.co.za/api/admin/enquiries
```

On Render's free plan the database is wiped on every restart, so treat the emails as the main record. A paid plan with a persistent disk keeps the database.

## Investor information

Public pages deliberately contain **no** financial figures (raise, valuation, revenue, costs, ROI). Those belong in the confidential investor pack, which is sent manually after review and an NDA.
