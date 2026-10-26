'use strict';

let reportMonth = '';
let reportEmployee = '';

function workdaysByYear(from, to) {
  const output = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || to < from) return output;
  const cursor = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  if (!Number.isFinite(+cursor) || !Number.isFinite(+end) || end - cursor > 365 * 86400000) return output;
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const year = cursor.getUTCFullYear();
      output[year] = (output[year] || 0) + 1;
    }
  }
  return output;
}

function leaveBalance(employeeId, type, year, records, settings) {
  const quota = Number(settings[type.toLowerCase() + 'Quota'] || 0);
  let approved = 0;
  let pending = 0;
  records.filter(l => l.employeeId === employeeId && l.type === type).forEach(l => {
    const days = workdaysByYear(l.from, l.to)[year] || 0;
    if (l.status === 'Approved') approved += days;
    if (l.status === 'Pending') pending += days;
  });
  return { quota, approved, pending, available: Math.max(0, quota - approved - pending) };
}

function validateLeave(request, records, settings) {
  const requested = workdaysByYear(request.from, request.to);
  if (!['Annual', 'Casual', 'Sick', 'Unpaid'].includes(request.type)) return 'Choose a valid leave type.';
  if (!Object.keys(requested).length) return 'Choose a valid range containing a workday (maximum 366 calendar days).';
  if (records.some(l => l.employeeId === request.employeeId && ['Pending', 'Approved'].includes(l.status) && l.from <= request.to && l.to >= request.from)) {
    return 'This request overlaps an existing pending or approved leave.';
  }
  if (request.type !== 'Unpaid') {
    for (const year of Object.keys(requested)) {
      const balance = leaveBalance(request.employeeId, request.type, year, records, settings);
      if (requested[year] > balance.available) return `Only ${balance.available} ${request.type.toLowerCase()} days available in ${year}, including pending requests.`;
    }
  }
  return '';
}

function normalizeBackup(input) {
  const data = JSON.parse(JSON.stringify(input));
  data.settings = { shiftStart: '09:00', graceMinutes: 15, ...data.settings };
  data.payroll = data.payroll.map(p => ({ ...p, base: p.base ?? Number(p.net) - Number(p.allowance) + Number(p.deduction) }));
  return data;
}

function reportRows(rows, group) {
  return rows.filter(row => {
    if (reportEmployee && row.employeeId !== reportEmployee) return false;
    if (!reportMonth) return true;
    if (group === 'leaves') {
      const lastDay = new Date(Number(reportMonth.slice(0, 4)), Number(reportMonth.slice(5)), 0).getDate();
      return row.from <= `${reportMonth}-${lastDay}` && row.to >= `${reportMonth}-01`;
    }
    return (row.date || row.month || '').startsWith(reportMonth);
  });
}

function reportFilters() {
  return `<div class="toolbar report-filters">
    <label class="field">Report month<input id="reportMonth" type="month" value="${safe(reportMonth)}"></label>
    <label class="field">Employee<select id="reportEmployee"><option value="">All employees</option>${db.employees.map(e => `<option value="${safe(e.id)}" ${e.id === reportEmployee ? 'selected' : ''}>${safe(e.name)}</option>`).join('')}</select></label>
    <p class="subtitle">Attendance, leave and expense exports use these filters. Clear the month for all dates.</p>
  </div>`;
}

document.addEventListener('change', event => {
  if (event.target.id === 'reportMonth') reportMonth = event.target.value;
  if (event.target.id === 'reportEmployee') reportEmployee = event.target.value;
});

function personalLeaveBalances() {
  const year = Number(TODAY().slice(0, 4));
  return `<div class="stats leave-balances">${['Annual', 'Casual', 'Sick'].map(type => {
    const b = leaveBalance(currentProfile.employee_id, type, year, db.leaves, db.settings);
    return stat(type + ' available', b.available + ' days', `${b.approved} approved · ${b.pending} pending · ${b.quota} total (${year})`, '☷');
  }).join('')}</div>`;
}

function punchControls() {
  const record = db.attendance.find(a => a.date === TODAY());
  const checkedIn = !!record?.checkIn;
  const checkedOut = !!record?.checkOut;
  return `<div class="punch-card">
    <div><h3>Today · ${safe(TODAY())}</h3><p class="subtitle">Check-in ${safe(record?.checkIn || '—')} · Check-out ${safe(record?.checkOut || '—')} · Asia/Karachi</p></div>
    <div class="btn-row"><button class="btn" data-action="punch-in" ${record ? 'disabled' : ''}>Check in</button>
    <button class="btn secondary" data-action="punch-out" ${!checkedIn || checkedOut ? 'disabled' : ''}>Check out</button></div>
    <p class="subtitle">Shift starts ${safe(db.settings.shiftStart || '09:00')}, with ${Number(db.settings.graceMinutes ?? 15)} minutes grace. Server time determines late status.</p>
  </div>`;
}

function employeePage() {
  const e = employee(currentProfile.employee_id);
  if (!e) return panel('Account not linked', '<p>Contact your administrator to link your employee record.</p>');
  if (page === 'overview') {
    const monthly = db.attendance.filter(a => a.date.startsWith(MONTH()));
    return header('Hello, ' + e.name, e.designation + ' · ' + e.department, button('Refresh', 'refresh', 'secondary')) +
      personalLeaveBalances() + panel('Your attendance', punchControls()) +
      `<div class="split">${panel('This month', `<div class="metric"><span>Present / late days</span><b>${monthly.filter(a => ['Present', 'Late'].includes(a.status)).length}</b></div><div class="metric"><span>Late arrivals</span><b>${monthly.filter(a => a.status === 'Late').length}</b></div>`)}
      ${panel('Your details', `<div class="metric"><span>Employee ID</span><b>${safe(e.id)}</b></div><div class="metric"><span>Email</span><b>${safe(e.email)}</b></div><div class="quick-actions"><button data-go="leaves">Request leave →</button><button data-go="payroll">View payslips →</button></div>`)}</div>`;
  }
  if (page === 'attendance') {
    const rows = db.attendance.filter(a => a.date.startsWith(selectedMonth)).sort((a, b) => b.date.localeCompare(a.date));
    return header('My attendance', 'Your check-in and check-out history.', button('Attendance CSV', 'attendance-csv', 'secondary')) +
      panel('Today', punchControls()) + panel('History', `<label class="field">Month<input id="month" type="month" value="${safe(selectedMonth)}"></label>` +
      table(['Date', 'Check in', 'Check out', 'Status'], rows.map(a => tr([safe(a.date), safe(a.checkIn || '—'), safe(a.checkOut || '—'), pill(a.status)]))));
  }
  if (page === 'leaves') {
    return header('My leave', 'Submit a request and follow its approval status.', button('+ Request leave', 'leave-add')) + personalLeaveBalances() +
      panel('Leave requests', table(['Type', 'Dates', 'Workdays', 'Reason', 'Status'], [...db.leaves].sort((a, b) => b.from.localeCompare(a.from)).map(l => tr([
        safe(l.type), safe(l.from) + ' → ' + safe(l.to), daysBetween(l.from, l.to), safe(l.reason || '—'), pill(l.status)
      ]))));
  }
  if (page === 'payroll') {
    return header('My payslips', 'Processed payroll records. Processing does not confirm bank payment.') +
      panel('Payslips', table(['Month', 'Base', 'Allowance', 'Deduction', 'Net pay', 'Payslip'], [...db.payroll].sort((a, b) => b.month.localeCompare(a.month)).map(p => tr([
        safe(p.month), money(p.base), money(p.allowance), money(p.deduction), money(p.net), button('View / download', 'payslip:' + p.id, 'small secondary')
      ]))));
  }
  return '';
}

async function employeeAction(code) {
  if (!currentProfile) throw new Error('Sign in first.');
  if (code === 'punch-in' || code === 'punch-out') {
    acceptWorkspace(await cloud.rpc('pf_punch', { direction: code === 'punch-in' ? 'in' : 'out' }));
    render();
    notify(code === 'punch-in' ? 'Checked in' : 'Checked out');
  } else if (code === 'leave-add') {
    modal('Request leave', `<input type="hidden" name="kind" value="self-leave">
      ${select('Leave type', 'type', ['Annual', 'Casual', 'Sick', 'Unpaid'])}
      <div class="form-grid">${field('From', 'from', 'date', TODAY(), true, `min="${TODAY()}"`)}${field('To', 'to', 'date', TODAY(), true, `min="${TODAY()}"`)}</div>
      ${field('Reason', 'reason', 'text', '', false, 'maxlength="1000"')}
      <p class="subtitle">Saturday and Sunday are excluded. Pending requests reserve your leave balance.</p>`);
  } else if (code === 'attendance-csv') {
    csv(db.attendance.filter(a => a.date.startsWith(selectedMonth)), 'my-attendance-' + selectedMonth);
  } else {
    throw new Error('This action is only available to administrators.');
  }
}

async function submitEmployeeForm(form) {
  const request = Object.fromEntries(new FormData(form));
  if (request.kind !== 'self-leave') throw new Error('This form is not available to employees.');
  request.employeeId = currentProfile.employee_id;
  const error = validateLeave(request, db.leaves, db.settings);
  if (error) throw new Error(error);
  acceptWorkspace(await cloud.rpc('pf_request_leave', {
    leave_type: request.type, from_date: request.from, to_date: request.to, reason: request.reason.trim()
  }));
  close();
  render();
  notify('Leave request submitted');
}

function payslipMarkup(p) {
  const e = employee(p.employeeId);
  if (!e) throw new Error('Employee record unavailable.');
  return `<article class="payslip" id="payslipDocument">
    <div class="payslip-heading"><div><div class="eyebrow">${safe(db.company)}</div><h2>Salary statement</h2></div><b>${safe(p.month)}</b></div>
    <p>${safe(e.name)} · ${safe(e.id)}<br>${safe(e.designation)} · ${safe(e.department)}</p>
    <div class="metric"><span>Base salary</span><b>${money(p.base)}</b></div>
    <div class="metric"><span>Allowances</span><b>${money(p.allowance)}</b></div>
    <div class="metric"><span>Deductions</span><b>${money(p.deduction)}</b></div>
    <div class="metric payslip-net"><span>Net payable</span><b>${money(p.net)}</b></div>
    <p class="subtitle">Reference: ${safe(p.id)}. This statement records a payroll calculation and does not confirm payment. Statutory deductions must be entered by HR.</p>
  </article>`;
}

function showPayslip(id) {
  const p = db.payroll.find(row => row.id === id);
  if (!p) throw new Error('Payslip not found.');
  modal('Payslip', payslipMarkup(p), 'payslipForm');
  document.querySelector('#payslipForm .modal-foot').innerHTML = `<button type="button" class="btn secondary" data-action="payslip-download:${safe(id)}">Download HTML</button><button type="button" class="btn" data-action="payslip-print">Print / Save PDF</button>`;
}

function downloadPayslip(id) {
  const p = db.payroll.find(row => row.id === id);
  if (!p) throw new Error('Payslip not found.');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payslip ${safe(p.month)}</title><style>body{font:16px Arial;color:#172b32;max-width:720px;margin:40px auto;padding:24px}.metric,.payslip-heading{display:flex;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid #dde3ea}.subtitle{font-size:12px;color:#526575}.payslip-net{font-size:22px}p{line-height:1.7}</style></head><body>${payslipMarkup(p)}</body></html>`;
  download('payslip-' + p.employeeId.replace(/[^a-z0-9_-]/gi, '_') + '-' + p.month + '.html', html, 'text/html;charset=utf-8');
}

function accountAccessForm() {
  return `<p class="subtitle">First create the login in Supabase → Authentication → Users → Add user. Then assign its role here. Employee emails must match their work record.</p>
    <form id="accessForm" class="access-form">
    ${field('Login email', 'accessEmail', 'email')}
    ${select('Role', 'accessRole', [['employee','Employee — own records'],['hr','HR — operations'],['admin','Admin — full access']])}
    <div class="field"><label>Employee record (required for employee role)</label><select name="accessEmployee"><option value="">Select employee</option>${empOptions()}</select></div>
    <div class="btn-row"><button class="btn" type="button" data-action="access-save">Assign role</button><button class="btn danger" type="button" data-action="access-revoke">Revoke access</button><button class="btn secondary" type="button" data-action="access-list">View assigned accounts</button></div></form>`;
}

async function saveAccountAccess() {
  if (!isAdmin()) throw new Error('🔒 Administrator access required.');
  const form = document.getElementById('accessForm');
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  await cloud.rpc('pf_set_access', { account_email: data.accessEmail.trim(), account_role: data.accessRole, linked_employee_id: data.accessEmployee || null });
  acceptWorkspace(await cloud.rpc('pf_get_workspace'));
  render();
  notify('Login role saved');
}

async function revokeAccountAccess() {
  if (!isAdmin()) throw new Error('🔒 Administrator access required.');
  const email = document.querySelector('[name="accessEmail"]').value.trim();
  if (!email) throw new Error('Enter the login email.');
  if (!confirm('Revoke workspace access for ' + email + '?')) return;
  await cloud.rpc('pf_revoke_access', { account_email: email });
  acceptWorkspace(await cloud.rpc('pf_get_workspace'));
  render();
  notify('Workspace access revoked');
}

async function listAccountAccess() {
  if (!isAdmin()) throw new Error('🔒 Administrator access required.');
  const rows = await cloud.rpc('pf_list_access');
  modal('Assigned accounts', table(['Login email', 'Role', 'Employee ID'], rows.map(r => tr([safe(r.email), pill(r.role), safe(r.employeeId || '—')]))), 'accessListForm');
  document.querySelector('#accessListForm .modal-foot').innerHTML = '<button type="button" class="btn secondary" data-close="1">Close</button>';
}
