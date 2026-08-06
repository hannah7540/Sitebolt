# ITC Field

Inspection Test Certificates for CDC Marsden Park in-ground services.
Crews sign off inspection steps on phones and iPads; the office tracks
progress, photos, drawings and delays.

---

## Where things are

```
itc-app/
├── index.html              app shell — nav, containers, script tags
├── css/
│   └── app.css             all styling, light and dark themes
├── js/
│   ├── config.js           ← YOUR Supabase keys. Not in git.
│   ├── config.example.js   template — copy to config.js
│   ├── api.js              every database call. Nothing else talks to Supabase.
│   ├── state.js            what the app knows and is showing
│   ├── utils.js            dates, photos, GPS, status calculation
│   ├── views/              one file per screen
│   └── pdf.js              certificate generation
├── assets/
│   └── site-plan.jpg       the drawing behind the zone map
├── db/
│   ├── 01_schema.sql       tables
│   ├── 02_security.sql     who can do what — read this one properly
│   └── 03_seed.sql         zones, services, form definitions
└── docs/
    └── DATA-MODEL.md       why the tables are shaped the way they are
```

**The rule:** views never call Supabase directly. They call `api.js`.
When data misbehaves there's one file to check.

---

## Setting it up

### 1. Supabase project

1. Sign up at supabase.com, create a project.
2. **Region: Sydney.** This matters — it keeps project data in Australia.
3. Save the database password somewhere safe.

### 2. Create the database

SQL Editor in the Supabase dashboard, then run in order:

1. `db/01_schema.sql`
2. `db/02_security.sql`
3. `db/03_seed.sql`

Each should finish with no errors. If one fails part way, fix the cause
and re-run from the top — the scripts assume a clean start.

### 3. Photo storage

Storage → New bucket → name it `itc-photos`, leave it **private**.
The policies in `02_security.sql` handle access.

### 4. Connect the app

```bash
cp js/config.example.js js/config.js
```

Then paste your Project URL and anon key from
Settings → API into `js/config.js`.

The anon key is safe in the browser — it identifies the project, not a
person, and every table is protected by row-level security regardless.
**Never put the `service_role` key in the app.** That one bypasses all
security and belongs on a server, if anywhere.

### 5. Make yourself admin

Authentication → Users → Add user, with your work email.
Then in the SQL editor, uncomment and run the last block of
`03_seed.sql` with your email in it.

Everyone after that you can promote from inside the app.

### 6. Run it

```bash
npx serve .
```

Then open the address it prints. A plain web server is all it needs —
no build step, no bundler, no npm install.

---

## How the permission model works

This is the part worth understanding, because it's the reason the app
can be trusted.

The rules live in **the database**, not the app. `02_security.sql`
defines them and Postgres enforces them on every request. If someone
opens the browser console and tries to update another worker's sign-off,
it's refused. Hiding a button is presentation; this is enforcement.

| Who | Can do |
|---|---|
| **Worker** | Create their own sign-offs. Edit their own comment, with a reason. Add photos. Log progress. Raise change requests against others' sign-offs. |
| **Crew leader** | All of the above, plus verify their own crew's sign-offs, assign ITCs within their crew, raise and close NCRs, write the site diary. |
| **Site admin** | Everything, including creating ITCs, editing the header, issuing, managing zones and drawings, resolving change requests. |

Two things nobody can do, including admin:

- **Delete a sign-off.** No delete policy exists on that table.
- **Alter the audit log.** Insert and select only.

That's deliberate. The audit trail is what makes an ITC defensible.

---

## Why sign-offs are insert-only

Each person's sign-off on a step is its own row. Several people can sign
the same step; nobody edits anyone else's.

This solves three problems at once:

- **Concurrency.** Two workers signing the same step at the same time
  create two rows. Nothing to merge, nothing lost.
- **Offline.** A queued sign-off from a dead spot replays as an insert.
  It can't overwrite work done in the meantime.
- **Audit.** History is the table. Changes after signing go in
  `signoff_edits` with a reason, and the original text is kept.

Keep this property. It's the thing most likely to get broken by a
well-meaning "just update the row" change, and it's load-bearing.

---

## Build order

Don't try to do it all at once. Roughly:

1. **Auth and reference data.** Sign in, load zones and services, show
   the zone bar. Proves the connection and the security rules.
2. **Register.** List ITCs from the database with status colours.
   Read-only.
3. **ITC detail.** Header, steps, existing sign-offs. Still read-only.
4. **Signing.** The first write. Get the permission rules right here —
   test by signing in as a worker and trying to verify your own work.
5. **Photos.** Upload, downscale, the nine slots.
6. **Everything else.** Bulk signing, offline queue, PDF, dashboard.

Steps 1–4 are most of the value. The rest is refinement.

---

## Things that will bite

- **`config.js` in git.** It's gitignored. Check before your first
  commit anyway.
- **Testing as admin only.** The permission rules are the whole point.
  Keep a worker login and a leader login and use them.
- **Forgetting `photoUrl()`.** The bucket is private, so photos need a
  signed URL. A raw storage path won't render.
- **Editing a form version in place.** Changing steps or requirements on
  a version already used by issued ITCs rewrites history. Create a new
  version instead.

---

## Reference

- Supabase JS docs: https://supabase.com/docs/reference/javascript
- Row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- The prototype (`itc_v11.html`) is the behavioural specification.
  When unsure how something should work, open it.
