# PeopleFlow HCM — Supabase edition

Existing vanilla JavaScript design with Supabase Auth, shared PostgreSQL storage,
Admin / HR / Employee permissions, employee self-service, attendance punches,
leave balances, payroll statements, and responsive navigation.

## Pehle setup karein

1. Apna **Supabase project** open karein. SQL Editor mein `supabase/setup.sql` ka
   poora code paste karke **Run** karein. Script dobara chalane se data reset nahi hota.
2. `supabase-config.js` mein `url` aur `publishableKey` fill karein. Project Settings
   / Connect se **Project URL** aur **publishable key** (ya legacy anon key) lein.
   Browser mein secret ya service-role key use na karein.
3. Authentication → Users → Add user se apna Admin login banayein. Email confirm
   karein. Password sirf Supabase ke form mein enter karein.
4. `supabase/bootstrap-admin.sql.example` mein `YOUR_ADMIN_EMAIL_HERE` replace
   karke us SQL ko SQL Editor mein run karein. Ye pehla Admin assign karta hai.
5. Updated project files apne GitHub repo mein replace/add karke Vercel par deploy
   karein. Framework preset **Other**, project root isi folder par; build command
   aur output directory blank rakhein. Build tools ki zaroorat nahi.
6. Admin email/password se login karein. Ab demo credentials kaam nahi karte.

Ye steps project ki live configuration hain. Blank config mein app setup message
show karegi; silently localStorage ya example data par fallback nahi karegi.

## HR aur Employee login

1. Admin se **Employees → Add employee** karein. Unique ID aur work email dein.
2. Supabase Authentication → Users mein usi email se login create karein aur email
   confirm karein. Public signup is app mein available nahi hai.
3. Admin app mein **Settings → Login access & roles** open karein.
4. Login email, role, aur employee role ke liye matching employee record choose
   karke **Assign role** karein. Email match database par enforce hota hai.
5. HR/Employee apne email/password se login kar sakte hain. Assigned accounts
   Settings mein dekhe ja sakte hain aur Admin doosron ka access revoke kar sakta hai.

| Access | Admin | HR | Employee |
|---|---|---|---|
| Company overview | All | All | Own dashboard |
| Employees, recruitment, performance | Manage | Manage | Locked |
| Attendance | Manage all | Manage all | Own history + check in/out |
| Leave | Manage/approve all | Manage/approve all | Own balance + request/history |
| Payroll | Manage all + payslips | Manage all + payslips | Own payslips |
| Expenses and reports | Manage/export | Manage/export | Locked |
| Company settings and backup/import | Manage | Locked | Locked |
| Assign/revoke login roles | Manage | Locked | Locked |

Employee ko locked modules sidebar mein 🔒 ke saath nazar aate hain. Menu item ko
force-open ya browser code change karne par bhi database doosron ka data nahi deta.
Admin/HR data edits ke waqt server permission dobara check hoti hai.

## Pehle se maujood browser data

Purani live site se Admin ka **Download backup** use karke JSON export kar lein,
phir nayi version deploy karein. New Admin login → Settings → Import JSON se
backup import karein. Data apne aap migrate nahi hota. Legacy payroll records mein
base salary `net - allowance + deduction` se recover hoti hai.

Import server validation ke baad hi save hota hai. Agar purane data mein overlap,
quota se zyada leaves, duplicate attendance, ya invalid amounts hon to import reject
hoga aur database unchanged rahega. Original backup ki copy rakh kar invalid entries
correct karein. Employee accounts data import ke **baad** link karein.

## Feature behavior

- **Navigation:** mobile mein outside tap, menu selection aur Escape se close;
  sidebar independent scrolling; page horizontally overflow nahi karta, tables swipe hoti hain.
- **Attendance:** employee punches server time **Asia/Karachi** par record hote hain.
  Default shift 09:00, 15 minute grace; Admin Settings se change karein. One record
  per employee per day. Repeated check-in/out reject. Same-day shifts supported;
  overnight shifts aur automatic absence deduction implemented nahi.
- **Leave:** Saturday/Sunday excluded. Annual, Casual, Sick quotas per calendar year;
  cross-year requests har year mein count hoti hain. Pending requests bhi quota
  reserve karti hain. Overlaps reject hote hain. Unpaid leave quota-free hai.
  Public-holiday calendar is version mein included nahi.
- **Payroll:** base + allowance - deduction = net. Processing payment confirmation
  nahi hai. Historical base salary stored. Statutory tax/EOBI/PF aur attendance
  deductions HR ko calculate/enter karne hain; app automatically legal deductions
  calculate nahi karti.
- **Payslip:** employee/admin/HR view; HTML download; Print / Save PDF via browser.
- **Reports:** Reports page par month aur employee select karke attendance, leave
  aur expense CSV export karein. Blank month = all dates. Employee CSV apni selected
  attendance month ki hoti hai. Formula-like CSV text Excel-safe prefix ke saath export hota hai.
- **Sync:** successful database response ke baad success message. Failed saves
  confirmed state restore karti hain. Stale concurrent edits reject aur fresh data
  load hota hai; form dobara submit karein. Idle pages 30 seconds mein refresh hoti hain;
  in-progress modal aur settings form polling se overwrite nahi hote.

## Database design and limits

One company per Supabase project. A single `pf_workspace` JSONB document preserves
existing collection formats; `pf_profiles` maps Auth UUIDs to roles and employee IDs.
RLS and grants deny direct workspace access; authenticated RPCs enforce roles and
filter employee records **before** returning data. Internal helpers have no client
execute grants. Profiles cannot be self-promoted. Admin role assignment requires
an existing Auth user. No service key is shipped to the browser.

Workspace writes are atomic, serialized with a database row lock, and checked with
an optimistic revision. This is appropriate for a small-team project; large teams
need normalized tables, pagination and narrower writes rather than a growing full
workspace snapshot. Supabase Auth token storage is managed by supabase-js; HR
records are not persisted in localStorage by this app.

Supabase JS loads from a pinned jsDelivr CDN version. Internet/CDN access is required.
Actual Supabase connection must be verified after the owner supplies configuration
and runs the migration. Local tests use real PostgreSQL behavior through PGlite;
UI preview fixtures are separate and not shipped as a login bypass.

## Checks

Install optional test dependencies outside the deploy folder if preferred:

```sh
npm install --no-save @electric-sql/pglite@0.3.14 linkedom@0.18.12
node tests/database.mjs
node tests/frontend.mjs
node --check app.js
node --check cloud.js
node --check features.js
```

Database tests create an isolated in-memory database, **not** your Supabase project.
They cover role restrictions, employee isolation, duplicate punches, quota/overlap
checks, payroll validation, revision conflicts and access revocation. Frontend
checks cover locked navigation, mobile close behavior, payslips, leave calculations,
CSV escaping and failed-save rollback.
