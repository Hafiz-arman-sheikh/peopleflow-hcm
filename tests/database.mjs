process.on('uncaughtException', error => { console.error(error.message, error.where || ''); process.exit(1); });
// Run: node tests/database.mjs
// Dependency: npm install --no-save @electric-sql/pglite@0.3.14
// PGLITE_MODULE may point to an existing local installation for isolated testing.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const pg = new PGlite();
let checks = 0;
async function check(label, task) { await task(); checks++; console.log('PASS', label); }
async function reject(task, pattern) { await assert.rejects(task, pattern); }
await pg.exec(`
  create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
const sql = fs.readFileSync(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
await check('migration compiles and is rerunnable', async () => { await pg.exec(sql); await pg.exec(sql); });
const ids = {
  admin: '11111111-1111-4111-8111-111111111111',
  hr: '22222222-2222-4222-8222-222222222222',
  employee: '33333333-3333-4333-8333-333333333333',
  other: '44444444-4444-4444-8444-444444444444',
  unassigned: '55555555-5555-4555-8555-555555555555'
};
for (const [name, id] of Object.entries(ids)) await pg.query('insert into auth.users values ($1,$2)', [id, name + '@example.com']);
await pg.query("insert into public.pf_profiles(user_id,role) values ($1,'admin'),($2,'hr')", [ids.admin, ids.hr]);
async function actor(name) {
  await pg.exec('reset role');
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || '']);
  await pg.exec('set role ' + (name === 'anonymous' ? 'anon' : 'authenticated'));
}
async function rpc(name, args = []) {
  const placeholders = args.map((_, i) => '$' + (i + 1)).join(',');
  return (await pg.query(`select public.${name}(${placeholders}) as result`, args)).rows[0].result;
}
async function get() { return rpc('pf_get_workspace'); }
async function save(data, revision) { return rpc('pf_save_workspace', [data, revision]); }
await actor('admin');
let initial = await get();
const employees = [
  { id: 'EMP-1', name: 'Employee One', email: 'employee@example.com', salary: 60000, status: 'Active', joined: '2025-01-01' },
  { id: 'EMP-2', name: 'Employee Two', email: 'other@example.com', salary: 90000, status: 'Active', joined: '2025-01-01' }
];
initial.data.employees = employees;
await check('admin can save workspace', async () => { await save(initial.data, initial.revision); });
await check('stale concurrent saves are rejected', async () => { await reject(() => save(initial.data, initial.revision), /Records changed/); });
await check('admin links employee accounts', async () => {
  await rpc('pf_set_access', ['employee@example.com', 'employee', 'EMP-1']);
  await rpc('pf_set_access', ['other@example.com', 'employee', 'EMP-2']);
});
await check('wrong email / employee mapping is rejected', async () => {
  await reject(() => rpc('pf_set_access', ['employee@example.com', 'employee', 'EMP-2']), /work email/);
});
await check('admin cannot demote or revoke their own account', async () => {
  await reject(() => rpc('pf_set_access', ['admin@example.com', 'hr', null]), /own administrator/);
  await reject(() => rpc('pf_revoke_access', ['admin@example.com']), /own access/);
});
await actor('employee');
await check('employee receives only own record', async () => {
  const result = await get();
  assert.deepEqual(result.data.employees.map(e => e.id), ['EMP-1']);
  assert.equal(result.data.activity.length, 0);
});
await check('employee cannot read raw workspace or modify roles', async () => {
  await reject(() => pg.query('select * from public.pf_workspace'), /permission denied/);
  await reject(() => pg.query("update public.pf_profiles set role='admin'"), /permission denied/);
  await reject(() => rpc('pf_set_access', ['employee@example.com', 'admin', null]), /Only administrators/);
  await reject(() => rpc('pf_list_access'), /Only administrators/);
});
await check('employee cannot call admin save directly', async () => { await reject(() => save(initial.data, 0), /HR or administrator/); });
await check('checkout requires checkin', async () => { await reject(() => rpc('pf_punch', ['out']), /Check in first/); });
await check('attendance uses server time and prevents repeated checkin/out', async () => {
  let result = await rpc('pf_punch', ['in']);
  assert.equal(result.data.attendance.length, 1);
  assert.ok(result.data.attendance[0].checkInAt);
  await reject(() => rpc('pf_punch', ['in']), /already exists/);
  result = await rpc('pf_punch', ['out']);
  assert.ok(result.data.attendance[0].checkOutAt);
  await reject(() => rpc('pf_punch', ['out']), /Already checked out/);
});
await check('leave validates range, weekdays, past dates and overlaps', async () => {
  await reject(() => rpc('pf_request_leave', ['Annual', '2000-01-03', '2000-01-03', 'past']), /future date/);
  await reject(() => rpc('pf_request_leave', ['Annual', '2035-01-07', '2035-01-06', 'bad']), /Invalid leave/);
  await reject(() => rpc('pf_request_leave', ['Annual', '2035-01-06', '2035-01-07', 'weekend']), /workday/);
  const result = await rpc('pf_request_leave', ['Annual', '2035-01-08', '2035-01-09', 'test']);
  assert.equal(result.data.leaves.length, 1);
  assert.equal(result.data.leaves[0].status, 'Pending');
  await reject(() => rpc('pf_request_leave', ['Annual', '2035-01-09', '2035-01-10', 'overlap']), /Overlapping/);
  await reject(() => rpc('pf_request_leave', ['Annual', '2035-02-01', '2035-03-15', 'quota']), /quota/);
});
await actor('hr');
await check('HR sees workforce and can approve leave', async () => {
  const w = await get();
  assert.equal(w.data.employees.length, 2);
  w.data.leaves[0].status = 'Approved';
  await save(w.data, w.revision);
});
await check('HR cannot modify company settings, roles or view accounts', async () => {
  const w = await get(); w.data.settings.annualQuota = 200;
  await reject(() => save(w.data, w.revision), /Only administrators/);
  await reject(() => rpc('pf_set_access', ['hr@example.com','admin',null]), /Only administrators/);
  await reject(() => rpc('pf_list_access'), /Only administrators/);
  await reject(() => rpc('pf_revoke_access',['other@example.com']), /Only administrators/);
});
await actor('admin');
await check('server rejects duplicate attendance and employee emails', async () => {
  let w = await get();
  w.data.attendance.push({ ...w.data.attendance[0], id: 'duplicate' });
  await reject(() => save(w.data, w.revision), /Attendance already/);
  w = await get(); w.data.employees[1].email = 'EMPLOYEE@example.com';
  await reject(() => save(w.data, w.revision), /emails must be unique/);
});
await check('linked employees cannot be deleted accidentally', async () => {
  const w = await get(); w.data.employees = [];
  w.data.attendance = []; w.data.leaves = [];
  await reject(() => save(w.data, w.revision), /Unlink the employee/);
});
await check('payroll amounts and duplicate pay periods are validated', async () => {
  let w = await get();
  w.data.payroll = [{ id:'PAY-1', employeeId:'EMP-1', month:'2035-01', base:60000, allowance:2000, deduction:1000, net:99999 }];
  await reject(() => save(w.data, w.revision), /Payroll net/);
  w.data.payroll[0].net = 61000;
  const saved = await save(w.data, w.revision);
  assert.equal(saved.data.payroll[0].base, 60000);
  w = await get(); w.data.payroll.push({ ...w.data.payroll[0], id:'PAY-2' });
  await reject(() => save(w.data, w.revision), /Payroll already/);
});
await actor('other');
await check('other employee cannot read colleague attendance, leave or payslip', async () => {
  const w = await get();
  assert.equal(w.data.attendance.length, 0);
  assert.equal(w.data.leaves.length, 0);
  assert.equal(w.data.payroll.length, 0);
});
await actor('unassigned');
await check('unassigned login is denied', async () => { await reject(get, /not been assigned/); });
await actor('anonymous');
await check('anonymous callers cannot invoke workspace RPC', async () => { await reject(get, /permission denied/); });
await actor('admin');
await check('admin can revoke access and data stops being returned', async () => {
  await rpc('pf_revoke_access', ['employee@example.com']);
  await actor('employee');
  await reject(get, /not been assigned/);
});
console.log(`\n${checks} database/security checks passed.`);
await pg.close();
