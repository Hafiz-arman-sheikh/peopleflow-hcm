// Run: node tests/frontend.mjs (npm install --no-save linkedom@0.18.12)
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const { parseHTML } = await import(process.env.LINKEDOM_MODULE || 'linkedom');
const { document } = parseHTML(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
const window = document.defaultView;
window.matchMedia = () => ({ matches: true });
window.innerWidth = 375;
let nextRpc;
window.PeopleFlowCloud = { initialize() {}, onAuthChange() {}, async session() { return null; }, async rpc(name, args) { return nextRpc(name, args); } };
class FormDataStub { constructor(form) { return Object.entries(form.values); } }
const context = vm.createContext({ window, document, console, Intl, Date, Math, JSON, Set, Object, Number, String,
  FormData: FormDataStub, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, confirm: () => true });
for (const file of ['features.js', 'app.js']) vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
await new Promise(resolve => setImmediate(resolve));
const run = code => vm.runInContext(code, context);
const employee = {id:'EMP-1',name:'Employee One',email:'one@example.com',department:'Operations',designation:'Officer',joined:'2025-01-01',salary:60000,status:'Active'};
function account(role) {
  const data = JSON.parse(run('JSON.stringify(emptyWorkspace())'));
  data.employees = [employee];
  data.payroll = [{id:'PAY-1',employeeId:'EMP-1',month:'2035-01',base:60000,allowance:1000,deduction:500,net:60500}];
  context.fixture = {data,revision:1,profile:{role,employee_id:role==='employee'?'EMP-1':null,display_name:'Test user'}};
  run("acceptWorkspace(fixture); page='overview'; showWorkspace();");
}
let checks = 0;
async function check(label, task) { await task(); checks++; console.log('PASS', label); }
await check('admin has all modules and account controls', () => {
  account('admin'); assert.equal(document.querySelectorAll('.nav-lock').length, 0);
  run("go('settings')"); assert.ok(document.getElementById('accessForm'));
});
await check('HR has operations but settings and backup are restricted', async () => {
  account('hr'); assert.equal(document.querySelectorAll('.nav-lock').length, 1);
  assert.equal(run("canAccess('settings')"), false);
  run("go('settings')"); assert.equal(run('page'), 'overview');
  await assert.rejects(run("action('backup')"), /Only administrators/);
  run("go('reports')"); assert.equal(document.querySelector('[data-action="backup"]'), null);
});
await check('employee sees own dashboard and six locked modules', async () => {
  account('employee'); assert.equal(document.querySelectorAll('.nav-lock').length, 6);
  assert.match(document.getElementById('view').textContent, /Hello, Employee One/);
  run("go('employees')"); assert.equal(run('page'), 'overview');
  await assert.rejects(run("action('employee-add')"), /administrators/);
});
await check('mobile menu closes on overlay, navigation and Escape', () => {
  document.getElementById('menuBtn').click(); assert.ok(document.querySelector('.sidebar.open'));
  document.getElementById('sidebarOverlay').click(); assert.equal(document.querySelector('.sidebar.open'), null);
  document.getElementById('menuBtn').click(); run("go('attendance')"); assert.equal(document.querySelector('.sidebar.open'), null);
  document.getElementById('menuBtn').click();
  const event = new window.Event('keydown'); event.key = 'Escape'; document.dispatchEvent(event);
  assert.equal(document.querySelector('.sidebar.open'), null);
  assert.equal(document.getElementById('menuBtn').getAttribute('aria-expanded'), 'false');
});
await check('employee payslip uses historical base and escapes HTML', () => {
  account('employee'); run("db.employees[0].salary=90000; db.employees[0].name='<img src=x onerror=alert(1)>'; showPayslip('PAY-1');");
  const slip = document.getElementById('payslipDocument');
  assert.match(slip.textContent, /60,000/); assert.doesNotMatch(slip.textContent, /90,000/);
  assert.equal(slip.querySelector('img'), null);
  assert.ok(document.querySelector('[data-action="payslip-download:PAY-1"]'));
});
await check('cross-year leave reserves the correct quota for each year', () => {
  const days = JSON.parse(run("JSON.stringify(workdaysByYear('2035-12-31','2036-01-02'))"));
  assert.equal(days['2035'], 1); assert.equal(days['2036'], 2);
  const error = run("validateLeave({employeeId:'EMP-1',type:'Annual',from:'2035-12-31',to:'2036-01-02'},[],{annualQuota:1})");
  assert.match(error, /2036/);
});
await check('pending leave reserves quota and overlapping leave is rejected', () => {
  run("db.leaves=[{id:'L-1',employeeId:'EMP-1',type:'Annual',from:'2035-01-08',to:'2035-01-09',status:'Pending'}]");
  assert.equal(run("leaveBalance('EMP-1','Annual',2035,db.leaves,{annualQuota:3}).available"), 1);
  assert.match(run("validateLeave({employeeId:'EMP-1',type:'Annual',from:'2035-01-09',to:'2035-01-10'},db.leaves,{annualQuota:3})"), /overlaps/);
});
await check('CSV protects formulas and quotes', () => {
  run("download=(name,text,mime)=>{window.lastExport={name,text,mime}}; csv([{name:'=HYPERLINK(\"bad\")'}],'test');");
  assert.match(window.lastExport.text, /'=/);
  assert.match(window.lastExport.text, /""bad""/);
});
await check('failed database writes restore the confirmed state', async () => {
  account('admin'); nextRpc = async () => { throw Error('Network unavailable'); };
  await run("runTask(async ()=>{db.company='Unsaved'; await save()})");
  assert.equal(run('db.company'), 'PeopleFlow');
  assert.match(document.getElementById('toast').textContent, /Network unavailable/);
});
await check('save success uses server revision and only then reports success', async () => {
  account('admin');
  nextRpc = async (name, args) => ({data:args.payload,revision:2,profile:{role:'admin'}});
  await run("runTask(async ()=>{db.company='Saved Company'; await save()})");
  assert.equal(run('revision'), 2); assert.equal(run('db.company'), 'Saved Company');
});
console.log(`\n${checks} frontend checks passed.`);
