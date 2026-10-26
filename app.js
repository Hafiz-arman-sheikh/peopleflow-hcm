
'use strict';

function TODAY() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function MONTH() {
    return TODAY().slice(0, 7);
}

function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (c) {
        const characters = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return characters[c];
    });
}

function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2, 7);
}

function fmt(number) {
    return new Intl.NumberFormat('en-PK', {
        maximumFractionDigits: 0
    }).format(Number(number) || 0);
}

function money(number) {
    return 'Rs. ' + fmt(number);
}

function emptyWorkspace() {
    return { company: 'PeopleFlow', employees: [], attendance: [], leaves: [],
        expenses: [], recruitment: [], performance: [], payroll: [], activity: [],
        settings: { annualQuota: 20, casualQuota: 10, sickQuota: 8, shiftStart: '09:00', graceMinutes: 15 } };
}

let db = emptyWorkspace();
let currentProfile = null;
let revision = 0;
let busy = false;
let confirmedWorkspace = null;
let refreshTimer;
const cloud = window.PeopleFlowCloud;

function acceptWorkspace(result) {
    db = result.data;
    currentProfile = result.profile;
    revision = result.revision;
    confirmedWorkspace = JSON.stringify(result);
}

function isAdmin() {
    return currentProfile?.role === 'admin';
}

function isStaff() {
    return ['admin', 'hr'].includes(currentProfile?.role);
}

function canAccess(target) {
    if (isAdmin()) return true;
    if (currentProfile?.role === 'hr') return target !== 'settings';
    return ['overview', 'attendance', 'leaves', 'payroll'].includes(target);
}

async function runTask(task) {
    if (busy) return;
    busy = true;
    document.body.classList.add('is-saving');
    document.getElementById('syncStatus').textContent = 'Working…';
    try {
        await task();
        document.getElementById('syncStatus').textContent = 'Saved to Supabase';
    } catch (error) {
        if (confirmedWorkspace) acceptWorkspace(JSON.parse(confirmedWorkspace));
        if (/Records changed/.test(error.message || '')) {
            try { acceptWorkspace(await cloud.rpc('pf_get_workspace')); } catch {}
        }
        if (/not been assigned|inactive or not linked|JWT expired|invalid refresh token/i.test(error.message || '')) clearWorkspace();
        if (currentProfile) render();
        document.getElementById('syncStatus').textContent = 'Action failed — retry';
        notify(error.message || 'Unable to complete the request.');
    } finally {
        busy = false;
        document.body.classList.remove('is-saving');
    }
}

let page = 'overview';
let search = '';
let filter = '';
let selectedMonth = MONTH();
let toastTimer;

async function save() {
    if (!isStaff()) throw new Error('HR or administrator access required.');
    acceptWorkspace(await cloud.rpc('pf_save_workspace', {
        payload: db, expected_revision: revision
    }));
}

function log(text) {
    db.activity.unshift({
        id: uid('ACT'),
        text: text,
        date: TODAY()
    });

    db.activity = db.activity.slice(0, 40);
}

function notify(text) {
    const el = document.getElementById('toast');

    el.textContent = text;
    el.style.display = 'block';

    clearTimeout(toastTimer);

    toastTimer = setTimeout(function () {
        el.style.display = 'none';
    }, 2600);
}

function employee(id) {
    return db.employees.find(function (item) {
        return item.id === id;
    });
}

function displayName(id) {
    const found = employee(id);

    if (found) {
        return found.name;
    }

    return 'Removed employee';
}

const nav = [
    ['overview', '▦', 'Overview'],
    ['employees', '♙', 'Employees'],
    ['attendance', '◷', 'Attendance'],
    ['leaves', '☷', 'Leave requests'],
    ['payroll', '▤', 'Payroll'],
    ['expenses', '◈', 'Expenses'],
    ['recruitment', '⚑', 'Recruitment'],
    ['performance', '◉', 'Performance'],
    ['reports', '▥', 'Reports'],
    ['settings', '⚙', 'Settings']
];

function go(newPage) {
    if (!canAccess(newPage)) { notify('🔒 You do not have access to this module.'); return; }
    page = newPage;
    search = '';
    filter = '';

    document.querySelector('.sidebar').classList.remove('open');

    closeSidebar();
    render();
}

function header(title, subtitle, action = '') {
    return `
        <div class="page-head">
            <div>
                <div class="eyebrow">PEOPLE OPERATIONS</div>
                <h1>${safe(title)}</h1>
                <p class="subtitle">${safe(subtitle)}</p>
            </div>
            ${action}
        </div>
    `;
}

function button(name, action, extra = '') {
    return `
        <button class="btn ${extra}" data-action="${action}">
            ${name}
        </button>
    `;
}

function stat(title, value, sub, icon) {
    return `
        <div class="stat">
            <div class="stat-top">
                <span>${title}</span>
                <span class="stat-icon">${icon}</span>
            </div>
            <h2>${value}</h2>
            <small>${sub}</small>
        </div>
    `;
}

function panel(title, content, note = '') {
    return `
        <section class="panel">
            <div class="panel-title">
                <h3>${title}</h3>
                <span class="panel-note">${note}</span>
            </div>
            ${content}
        </section>
    `;
}

function pill(status) {
    let color = '';

    if (['Active', 'Approved', 'Present', 'Processed', 'Open', 'Completed'].includes(status)) {
        color = 'good';
    } else if (['Pending', 'Late', 'On Leave', 'In Progress'].includes(status)) {
        color = 'warn';
    } else if (['Rejected', 'Absent', 'Inactive', 'Closed'].includes(status)) {
        color = 'bad';
    }

    return `<span class="pill ${color}">${safe(status)}</span>`;
}

function table(headers, rows) {
    let headings = '';

    headers.forEach(function (item) {
        headings += `<th>${item}</th>`;
    });

    let body = '';

    if (rows.length > 0) {
        body = rows.join('');
    } else {
        body = `<tr><td colspan="${headers.length}" class="empty">No records found.</td></tr>`;
    }

    return `
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr>${headings}</tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>
    `;
}

function tr(columns) {
    let result = '<tr>';

    columns.forEach(function (column) {
        result += `<td>${column}</td>`;
    });

    result += '</tr>';

    return result;
}

function person(e) {
    const initials = (e.name || '?')
        .split(' ')
        .map(function (word) {
            return word[0];
        })
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return `
        <div class="person">
            <span class="initial">${safe(initials)}</span>
            <span>
                <b>${safe(e.name)}</b>
                <small>${safe(e.id)}</small>
            </span>
        </div>
    `;
}

function empOptions(id = '') {
    return db.employees.map(function (e) {
        const selected = id === e.id ? 'selected' : '';

        return `
            <option value="${safe(e.id)}" ${selected}>
                ${safe(e.name)} (${safe(e.id)})
            </option>
        `;
    }).join('');
}

function filtered(arr, mapper) {
    return arr.filter(function (item) {
        const text = mapper(item).toLowerCase();
        const matchesSearch = !search || text.includes(search.toLowerCase());
        const matchesFilter = !filter || item.status === filter;

        return matchesSearch && matchesFilter;
    });
}

function overview() {
    const active = db.employees.filter(e => e.status === 'Active').length;

    const present = db.attendance.filter(function (a) {
        return a.date === TODAY() && a.status === 'Present';
    }).length;

    const pending = db.leaves.filter(e => e.status === 'Pending').length;

    const pay = db.employees
        .filter(e => e.status !== 'Inactive')
        .reduce((total, e) => total + Number(e.salary || 0), 0);

    const totals = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date();

        d.setDate(d.getDate() - 6 + i);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');

        const date = `${year}-${month}-${day}`;

        const count = db.attendance.filter(function (a) {
            return a.date === date && a.status === 'Present';
        }).length;

        totals.push({
            label: d.toLocaleDateString('en', { weekday: 'short' }),
            count: count
        });
    }

    let chart = '<div class="chart">';

    totals.forEach(function (item) {
        const height = Math.max(
            5,
            (item.count / Math.max(1, db.employees.length)) * 130
        );

        chart += `
            <div class="bar-col">
                <div class="bar" style="height:${height}px"></div>
                <span class="bar-label">${item.label}</span>
            </div>
        `;
    });

    chart += '</div>';

    chart += `
        <div class="metric">
            <span class="muted">Active workforce</span>
            <b>${active} / ${db.employees.length}</b>
        </div>
    `;

    const teamRows = db.employees.slice(0, 5).map(function (e) {
        return tr([
            person(e),
            safe(e.department),
            pill(e.status)
        ]);
    });

    const quickActions = `
        <div class="quick-actions">
            <button data-action="employee-add">＋ New employee</button>
            <button data-action="attendance-add">◷ Mark attendance</button>
            <button data-action="leave-add">☷ Request leave</button>
            <button data-action="expense-add">◈ Add expense</button>
        </div>
    `;

    let activities = '';

    if (db.activity.length > 0) {
        activities = db.activity.slice(0, 7).map(function (a) {
            return `
                <div class="activity">
                    <span class="activity-icon">✧</span>
                    <div>
                        <b>${safe(a.text)}</b>
                        <small>Workspace update</small>
                    </div>
                    <time>${safe(a.date)}</time>
                </div>
            `;
        }).join('');
    } else {
        activities = '<p class="muted">No recent activity.</p>';
    }

    return header(
        'Good to see you 👋',
        'Here’s what’s happening with your workforce today.',
        button('+ Add employee', 'employee-add')
    ) + `
        <div class="stats">
            ${stat('Total employees', db.employees.length, 'Employees on record', '♙')}
            ${stat('Present today', present, 'Marked in attendance', '◷')}
            ${stat('Pending leaves', pending, 'Awaiting decision', '☷')}
            ${stat('Monthly base payroll', money(pay), 'Before allowances & deductions', '▤')}
        </div>
        <div class="dashboard-grid">
            <div>
                ${panel('Attendance snapshot', chart, 'Last 7 days')}
                ${panel('Your team', table(['Employee', 'Department', 'Status'], teamRows))}
            </div>
            <div>
                ${panel('Quick actions', quickActions)}
                ${panel('Recent activity', activities)}
            </div>
        </div>
    `;
}

function employees() {
    const items = filtered(db.employees, function (e) {
        return `${e.name} ${e.id} ${e.email} ${e.department} ${e.designation}`;
    });

    const rows = items.map(function (e) {
        const actions = `
            <div class="actions">
                ${button('Edit', 'employee-edit:' + e.id, 'small secondary')}
                ${button('Delete', 'employee-delete:' + e.id, 'small danger')}
            </div>
        `;

        return tr([
            person(e),
            safe(e.department),
            safe(e.designation),
            money(e.salary),
            pill(e.status),
            actions
        ]);
    });

    const statuses = ['Active', 'On Leave', 'Inactive'];

    const options = statuses.map(function (status) {
        const selected = filter === status ? 'selected' : '';
        return `<option ${selected}>${status}</option>`;
    }).join('');

    const content = `
        <div class="toolbar">
            <input class="search" id="search"
                placeholder="Search by name, ID, department..."
                value="${safe(search)}">
            <select id="filter" class="filter">
                <option value="">All statuses</option>
                ${options}
            </select>
        </div>
        ${table(
            ['Employee', 'Department', 'Designation', 'Monthly salary', 'Status', 'Actions'],
            rows
        )}
    `;

    return header(
        'Employees',
        'Your people directory, roles and salary records.',
        button('+ Add employee', 'employee-add')
    ) + panel('All employees', content, `${items.length} records`);
}

function attendance() {
    const rows = db.attendance.filter(function (a) {
        const matchesSearch =
            !search ||
            displayName(a.employeeId).toLowerCase().includes(search.toLowerCase()) ||
            a.date.includes(search);

        const matchesFilter = !filter || a.status === filter;

        return matchesSearch && matchesFilter;
    });

    rows.sort(function (a, b) {
        return b.date.localeCompare(a.date);
    });

    const tableRows = rows.map(function (a) {
        return tr([
            safe(displayName(a.employeeId)),
            safe(a.date),
            safe(a.checkIn || '—'),
            safe(a.checkOut || '—'),
            pill(a.status),
            button('Edit', 'attendance-edit:' + a.id, 'small secondary') +
            button('Delete', 'attendance-delete:' + a.id, 'small danger')
        ]);
    });

    const options = ['Present', 'Late', 'Absent', 'On Leave']
        .map(function (status) {
            return `<option ${filter === status ? 'selected' : ''}>${status}</option>`;
        }).join('');

    const content = `
        <div class="toolbar">
            <input class="search" id="search"
                placeholder="Search employee or date..."
                value="${safe(search)}">
            <select id="filter" class="filter">
                <option value="">All statuses</option>
                ${options}
            </select>
        </div>
        ${table(
            ['Employee', 'Date', 'Check in', 'Check out', 'Status', 'Actions'],
            tableRows
        )}
    `;

    return header(
        'Attendance',
        'Mark attendance and track employees by day.',
        button('+ Mark attendance', 'attendance-add')
    ) + panel('Attendance register', content, 'Unique record per employee per day');
}

function daysBetween(from, to) {
    if (!from || !to || from > to) {
        return 0;
    }

    let currentDate = new Date(from + 'T12:00:00');
    const endDate = new Date(to + 'T12:00:00');
    let count = 0;

    while (currentDate <= endDate && count < 366) {
        const day = currentDate.getDay();

        if (day !== 0 && day !== 6) {
            count++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return count;
}

function leaves() {
    const items = filtered(db.leaves, function (l) {
        return `${displayName(l.employeeId)} ${l.type} ${l.from} ${l.to}`;
    });

    items.sort((a, b) => b.from.localeCompare(a.from));

    const rows = items.map(function (l) {
        let actions = '';

        if (l.status === 'Pending') {
            actions += button('Approve', 'leave-approve:' + l.id, 'small');
            actions += button('Reject', 'leave-reject:' + l.id, 'small danger');
        }

        actions += button('Delete', 'leave-delete:' + l.id, 'small secondary');

        return tr([
            safe(displayName(l.employeeId)),
            safe(l.type),
            safe(l.from) + ' → ' + safe(l.to),
            daysBetween(l.from, l.to),
            safe(l.reason || '—'),
            pill(l.status),
            `<div class="actions">${actions}</div>`
        ]);
    });

    const options = ['Pending', 'Approved', 'Rejected']
        .map(s => `<option ${filter === s ? 'selected' : ''}>${s}</option>`)
        .join('');

    const content = `
        <div class="toolbar">
            <input class="search" id="search"
                placeholder="Search employee or leave type..."
                value="${safe(search)}">
            <select id="filter" class="filter">
                <option value="">All statuses</option>
                ${options}
            </select>
        </div>
        ${table(
            ['Employee', 'Type', 'Dates', 'Workdays', 'Reason', 'Status', 'Actions'],
            rows
        )}
    `;

    return header(
        'Leave management',
        'Request, review, approve or reject time off.',
        button('+ New request', 'leave-add')
    ) + panel('Leave requests', content, 'Weekends excluded from leave days');
}

function payroll() {
    const employeesList = db.employees.filter(function (e) {
        return e.status !== 'Inactive';
    });

    const rows = employeesList.map(function (e) {
        const p = db.payroll.find(function (item) {
            return item.employeeId === e.id && item.month === selectedMonth;
        });

        const allowance = p ? p.allowance : 0;
        const deduction = p ? p.deduction : 0;
        const net = p ? p.net : e.salary;
        const status = p ? 'Processed' : 'Not processed';
        const actionName = p ? 'Adjust' : 'Process';

        return tr([
            person(e),
            money(p ? p.base : e.salary),
            money(allowance),
            money(deduction),
            `<b>${money(net)}</b>`,
            pill(status),
            button(actionName, 'payroll-process:' + e.id, 'small secondary') + (p ? button('Payslip', 'payslip:' + p.id, 'small secondary') : '')
        ]);
    });

    const processed = db.payroll.filter(function (p) {
        return p.month === selectedMonth;
    });

    const totalNet = processed.reduce(function (total, p) {
        return total + p.net;
    }, 0);

    const banner = `
        <div class="banner">
            Payroll calculator. It does not calculate Pakistan income tax,
            EOBI, provident fund or statutory compliance automatically.
        </div>
    `;

    const register = `
        <div class="toolbar">
            <label class="field" style="margin:0">
                Pay period
                <input type="month" id="month" value="${selectedMonth}">
            </label>
        </div>
        ${table(
            ['Employee', 'Base salary', 'Allowance', 'Deduction', 'Net pay', 'Status', 'Actions'],
            rows
        )}
    `;

    const summary = `
        <div class="metric">
            <span>Processed employees</span>
            <b>${processed.length}</b>
        </div>
        <div class="metric">
            <span>Net payable</span>
            <span class="big-number">${money(totalNet)}</span>
        </div>
        <div class="btn-row">
            ${button('Export payroll CSV', 'payroll-csv', 'secondary')}
        </div>
    `;

    return header(
        'Payroll',
        'Monthly salary calculations and payslip records.',
        button('Process all', 'payroll-all')
    ) + banner + panel('Salary register', register) +
        panel('Processed payroll totals', summary);
}

function expenses() {
    const items = filtered(db.expenses, function (x) {
        return `${displayName(x.employeeId)} ${x.type} ${x.description}`;
    });

    const rows = items.map(function (x) {
        let actions = '';

        if (x.status === 'Pending') {
            actions += button('Approve', 'expense-approve:' + x.id, 'small');
            actions += button('Reject', 'expense-reject:' + x.id, 'small danger');
        } else {
            actions = button('Delete', 'expense-delete:' + x.id, 'small secondary');
        }

        return tr([
            safe(displayName(x.employeeId)),
            safe(x.type),
            money(x.amount),
            safe(x.date),
            safe(x.description),
            pill(x.status),
            actions
        ]);
    });

    const options = ['Pending', 'Approved', 'Rejected']
        .map(s => `<option ${filter === s ? 'selected' : ''}>${s}</option>`)
        .join('');

    const content = `
        <div class="toolbar">
            <input class="search" id="search"
                placeholder="Search claims..." value="${safe(search)}">
            <select id="filter" class="filter">
                <option value="">All statuses</option>
                ${options}
            </select>
        </div>
        ${table(
            ['Employee', 'Category', 'Amount', 'Date', 'Description', 'Status', 'Actions'],
            rows
        )}
    `;

    return header(
        'Expense claims',
        'Employee reimbursements and approval tracking.',
        button('+ New claim', 'expense-add')
    ) + panel('Claims', content);
}

function recruitment() {
    const rows = db.recruitment.map(function (job) {
        const title = job.status === 'Open' ? 'Close' : 'Reopen';

        return tr([
            safe(job.title),
            safe(job.department),
            job.openings,
            pill(job.status),
            button(title, 'job-toggle:' + job.id, 'small secondary') +
            button('Delete', 'job-delete:' + job.id, 'small danger')
        ]);
    });

    return header(
        'Recruitment',
        'Open positions and hiring requirements.',
        button('+ New opening', 'job-add')
    ) + panel(
        'Current job openings',
        table(['Role', 'Department', 'Openings', 'Status', 'Actions'], rows)
    );
}

function performance() {
    const rows = db.performance.map(function (x) {
        return tr([
            safe(displayName(x.employeeId)),
            safe(x.period),
            `${x.score} / 5`,
            safe(x.notes),
            button('Delete', 'performance-delete:' + x.id, 'small danger')
        ]);
    });

    return header(
        'Performance',
        'Record employee appraisal scores and feedback.',
        button('+ Add review', 'performance-add')
    ) + panel(
        'Appraisal register',
        table(['Employee', 'Period', 'Rating', 'Review notes', 'Actions'], rows)
    );
}

function reports() {
    const departments = [...new Set(db.employees.map(e => e.department))];

    const approved = db.leaves.filter(e => e.status === 'Approved').length;

    const openRoles = db.recruitment.filter(e => e.status === 'Open').length;

    let departmentContent = '';

    departments.forEach(function (department) {
        const count = db.employees.filter(function (e) {
            return e.department === department;
        }).length;

        departmentContent += `
            <div class="metric">
                <span>${safe(department)}</span>
                <b>${count} employee(s)</b>
            </div>
        `;
    });

    if (departments.length === 0) {
        departmentContent = '<p class="muted">No departments</p>';
    }

    const exports = `
        <p class="subtitle" style="margin-bottom:18px">
            Download data you can open in Excel, or save a full JSON backup.
        </p>
        <div class="btn-row">
            ${button('Attendance CSV', 'attendance-csv', 'secondary')}
            ${button('Leave CSV', 'leaves-csv', 'secondary')}
            ${button('Expenses CSV', 'expenses-csv', 'secondary')}
            ${isAdmin() ? button('JSON backup', 'backup', 'secondary') : ''}
        </div>
    `;

    return header(
        'Reports & insights',
        'A quick look at workforce distribution and key metrics.',
        button('Export employees CSV', 'employees-csv', 'secondary')
    ) + reportFilters() + `
        <div class="stats">
            ${stat('Departments', departments.length, 'With employees', '▦')}
            ${stat('Leave approved', approved, 'All dates', '☷')}
            ${stat('Attendance records', db.attendance.length, 'Recorded entries', '◷')}
            ${stat('Open roles', openRoles, 'Available jobs', '⚑')}
        </div>
        <div class="split">
            ${panel('By department', departmentContent)}
            ${panel('Export center', exports)}
        </div>
    `;
}

function settings() {
    const companyForm = `
        <form id="settingsForm">
            <div class="field">
                <label>Company name</label>
                <input name="company" required value="${safe(db.company)}">
            </div>
            <div class="field">
                <label>Annual leave quota (days)</label>
                <input type="number" name="annualQuota" min="0"
                    required value="${db.settings.annualQuota}">
            </div>
            <div class="field">
                <label>Casual leave quota (days)</label>
                <input type="number" name="casualQuota" min="0"
                    required value="${db.settings.casualQuota}">
            </div>
            <div class="field">
                <label>Sick leave quota (days)</label>
                <input type="number" name="sickQuota" min="0"
                    required value="${db.settings.sickQuota}">
            </div>
            ${field('Shift start (Asia/Karachi)', 'shiftStart', 'time', db.settings.shiftStart || '09:00')}
            ${field('Late grace period (minutes)', 'graceMinutes', 'number', db.settings.graceMinutes ?? 15, true, 'min="0" max="366" step="1"')}
            <button class="btn" type="submit">Save settings</button>
        </form>
    `;

    const backups = `
        <p class="subtitle" style="margin-bottom:20px">
            Export a backup of your Supabase records.
            Importing a backup replaces current data.
        </p>
        <div class="btn-row">
            ${button('Download backup', 'backup', 'secondary')}
            <label class="btn secondary" style="cursor:pointer">
                Import JSON
                <input type="file" id="importFile"
                    accept="application/json,.json" hidden>
            </label>

        </div>
        <p class="muted" style="font-size:11px;margin-top:20px">
            Accounts are managed in Supabase Auth. Link each user to an employee ID
            using the setup instructions. Only administrators can change company records.
        </p>
    `;

    return header(
        'Workspace settings',
        'Manage company preferences, attendance rules and backups.'
    ) + panel('Login access & roles', accountAccessForm()) + `
        <div class="split">
            ${panel('Company settings', companyForm)}
            ${panel('Data & backups', backups)}
        </div>
    `;
}

function render() {
    const navigation = document.getElementById('navigation');
    let navigationHTML = '';

    if (!canAccess(page)) page = 'overview';

    nav.forEach(function (item) {
        const id = item[0];
        const icon = item[1];
        const label = item[2];
        const locked = !canAccess(id);
        const active = page === id ? 'active' : '';

        navigationHTML += `
            <button class="nav-link ${active} ${locked ? 'locked' : ''}" data-go="${id}" aria-disabled="${locked}" title="${locked ? 'Access restricted for your role' : label}">
                <span class="symbol">${icon}</span>
                ${label}${locked ? '<span class="nav-lock" aria-label="Locked">🔒</span>' : ''}
            </button>
        `;
    });

    navigation.innerHTML = navigationHTML;

    const currentPage = nav.find(item => item[0] === page);

    document.getElementById('crumb').textContent =
        currentPage ? currentPage[2] : 'Overview';

    document.getElementById('today').textContent =
        new Date().toLocaleDateString('en-PK', {
            timeZone: 'Asia/Karachi',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

    document.getElementById('companyMini').textContent = db.company;

    const pages = {
        overview: overview,
        employees: employees,
        attendance: attendance,
        leaves: leaves,
        payroll: payroll,
        expenses: expenses,
        recruitment: recruitment,
        performance: performance,
        reports: reports,
        settings: settings
    };

    document.getElementById('view').innerHTML = isStaff() ? pages[page]() : employeePage();
    document.querySelector('.profile b').textContent = currentProfile?.display_name || (isStaff() ? (isAdmin() ? 'Administrator' : 'HR Manager') : employee(currentProfile?.employee_id)?.name || 'Employee');
    const initials = isStaff() ? (isAdmin() ? 'AD' : 'HR') : (employee(currentProfile?.employee_id)?.name || 'Employee').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    document.querySelector('.profile .avatar').textContent = initials;
    document.querySelector('.topavatar').textContent = initials;
    document.getElementById('exportBtn').title = isAdmin() ? 'Download backup' : 'Export attendance CSV';
    document.querySelector('.profile small').textContent = isAdmin() ? 'Administrator' : currentProfile?.role === 'hr' ? 'HR Manager' : 'Employee workspace';
}

function field(label, name, type = 'text', value = '', required = true, extra = '') {
    return `
        <div class="field">
            <label>${label}</label>
            <input name="${name}" type="${type}" value="${safe(value)}"
                ${required ? 'required' : ''} ${extra}>
        </div>
    `;
}

function select(label, name, options, value = '') {
    let optionsHTML = '';

    options.forEach(function (option) {
        let optionValue;
        let optionText;

        if (Array.isArray(option)) {
            optionValue = option[0];
            optionText = option[1];
        } else {
            optionValue = option;
            optionText = option;
        }

        const selected = optionValue === value ? 'selected' : '';

        optionsHTML += `
            <option value="${safe(optionValue)}" ${selected}>
                ${safe(optionText)}
            </option>
        `;
    });

    return `
        <div class="field">
            <label>${label}</label>
            <select name="${name}" required>${optionsHTML}</select>
        </div>
    `;
}

function employeeSelect(id) {
    return `
        <div class="field">
            <label>Employee</label>
            <select name="employeeId" required>${empOptions(id)}</select>
        </div>
    `;
}

function modal(title, body, form = 'recordForm') {
    document.getElementById('modalTitle').textContent = title;

    document.getElementById('modalBody').innerHTML = `
        <form id="${form}">
            ${body}
            <div class="modal-foot">
                <button type="button" class="btn secondary" data-close="1">
                    Cancel
                </button>
                <button type="submit" class="btn">Save record</button>
            </div>
        </form>
    `;

    document.getElementById('modal').classList.remove('hidden');
}

function close() {
    document.getElementById('modal').classList.add('hidden');
}

async function action(code) {
    if (code.startsWith('payslip-download:')) return downloadPayslip(code.slice(17));
    if (code === 'payslip-print') return window.print();
    if (code === 'refresh') { acceptWorkspace(await cloud.rpc('pf_get_workspace')); render(); return; }
    if (code.startsWith('payslip:')) return showPayslip(code.slice(8));
    if (code === 'access-list') return listAccountAccess();
    if (code === 'access-save') return saveAccountAccess();
    if (code === 'access-revoke') return revokeAccountAccess();
    if (!isStaff()) return employeeAction(code);
    if (['backup', 'reset'].includes(code) && !isAdmin()) throw new Error('🔒 Only administrators can manage backups.');
    const parts = code.split(':');
    const type = parts[0];
    const id = parts[1];

    let x;

    if (type === 'employee-add' || type === 'employee-edit') {
        if (type === 'employee-edit') {
            x = employee(id);
        } else {
            x = null;
        }

        const employeeId = x?.id ||
            ('EMP-' + Math.floor(100 + Math.random() * 900));

        const body = `
            <input type="hidden" name="kind" value="employee">
            <input type="hidden" name="oldId" value="${safe(x?.id || '')}">
            <div class="form-grid">
                ${field('Employee ID', 'id', 'text', employeeId, true, x ? 'readonly' : '')}
                ${field('Full name', 'name', 'text', x?.name)}
                ${field('Work email', 'email', 'email', x?.email)}
                ${field('Phone', 'phone', 'tel', x?.phone || '', false)}
                ${field('Department', 'department', 'text', x?.department)}
                ${field('Designation', 'designation', 'text', x?.designation)}
                ${field('Joining date', 'joined', 'date', x?.joined || TODAY())}
                ${field('Base salary (PKR)', 'salary', 'number', x?.salary || 0, true, 'min="0" step="1"')}
                ${select('Status', 'status', ['Active', 'On Leave', 'Inactive'], x?.status || 'Active')}
            </div>
        `;

        modal(x ? 'Edit employee' : 'Add employee', body);
        return;
    }

    if (type === 'attendance-add' || type === 'attendance-edit') {
        x = type === 'attendance-edit'
            ? db.attendance.find(a => a.id === id)
            : null;

        if (db.employees.length === 0) {
            notify('Add an employee first');
            return;
        }

        const body = `
            <input type="hidden" name="kind" value="attendance">
            <input type="hidden" name="id" value="${safe(x?.id || '')}">
            ${employeeSelect(x?.employeeId)}
            <div class="form-grid">
                ${field('Date', 'date', 'date', x?.date || TODAY())}
                ${select('Status', 'status', ['Present', 'Late', 'Absent', 'On Leave'], x?.status || 'Present')}
                ${field('Check-in', 'checkIn', 'time', x?.checkIn || '', false)}
                ${field('Check-out', 'checkOut', 'time', x?.checkOut || '', false)}
            </div>
        `;

        modal(x ? 'Edit attendance' : 'Mark attendance', body);
        return;
    }

    if (type === 'leave-add') {
        if (db.employees.length === 0) {
            notify('Add an employee first');
            return;
        }

        const body = `
            <input type="hidden" name="kind" value="leave">
            ${employeeSelect()}
            <div class="form-grid">
                ${select('Leave type', 'type', ['Annual', 'Casual', 'Sick', 'Unpaid'])}
                ${field('From', 'from', 'date', TODAY())}
                ${field('To', 'to', 'date', TODAY())}
            </div>
            ${field('Reason', 'reason', 'text', '', false)}
        `;

        modal('New leave request', body);
        return;
    }

    if (type === 'expense-add') {
        if (db.employees.length === 0) {
            notify('Add an employee first');
            return;
        }

        const body = `
            <input type="hidden" name="kind" value="expense">
            ${employeeSelect()}
            <div class="form-grid">
                ${select('Category', 'type', ['Travel', 'Meals', 'Medical', 'Office', 'Other'])}
                ${field('Amount (PKR)', 'amount', 'number', '0', true, 'min="1"')}
                ${field('Expense date', 'date', 'date', TODAY())}
            </div>
            ${field('Description', 'description')}
        `;

        modal('New expense claim', body);
        return;
    }

    if (type === 'job-add') {
        const body = `
            <input type="hidden" name="kind" value="job">
            ${field('Role title', 'title')}
            ${field('Department', 'department')}
            ${field('Number of openings', 'openings', 'number', '1', true, 'min="1"')}
        `;

        modal('New job opening', body);
        return;
    }

    if (type === 'performance-add') {
        if (db.employees.length === 0) {
            notify('Add an employee first');
            return;
        }

        const scores = [
            ['1', '1 — Needs improvement'],
            ['2', '2 — Developing'],
            ['3', '3 — Meets expectations'],
            ['4', '4 — Exceeds expectations'],
            ['5', '5 — Outstanding']
        ];

        const body = `
            <input type="hidden" name="kind" value="performance">
            ${employeeSelect()}
            ${field('Review period', 'period', 'month', MONTH())}
            ${select('Score', 'score', scores)}
            ${field('Comments', 'notes')}
        `;

        modal('New performance review', body);
        return;
    }

    if (type === 'payroll-process') {
        const e = employee(id);

        if (!e) {
            return;
        }

        const p = db.payroll.find(function (item) {
            return item.employeeId === id && item.month === selectedMonth;
        });

        const body = `
            <input type="hidden" name="kind" value="payroll">
            <input type="hidden" name="employeeId" value="${safe(id)}">
            <p class="subtitle" style="margin-bottom:17px">
                ${selectedMonth} · Base salary ${money(p?.base ?? e.salary)}
            </p>
            ${field('Allowances (PKR)', 'allowance', 'number', p?.allowance || 0, true, 'min="0"')}
            ${field('Deductions (PKR)', 'deduction', 'number', p?.deduction || 0, true, 'min="0"')}
        `;

        modal('Process salary · ' + e.name, body);
        return;
    }

    if (type === 'payroll-all') {
        const message = 'Process all active/non-inactive employee salaries for ' +
            selectedMonth + '? Existing adjustments will be preserved.';

        if (!confirm(message)) {
            return;
        }

        db.employees.forEach(function (e) {
            if (e.status === 'Inactive') {
                return;
            }

            const exists = db.payroll.some(function (p) {
                return p.employeeId === e.id && p.month === selectedMonth;
            });

            if (!exists) {
                db.payroll.push({
                    id: uid('PAY'),
                    employeeId: e.id,
                    month: selectedMonth,
                    base: Number(e.salary),
                    allowance: 0,
                    deduction: 0,
                    net: Number(e.salary)
                });
            }
        });

        log('Payroll processed for ' + selectedMonth);
        await save();
        render();
        notify('Monthly payroll processed');
        return;
    }

    const approvalActions = [
        'leave-approve',
        'leave-reject',
        'expense-approve',
        'expense-reject'
    ];

    if (approvalActions.includes(type)) {
        let area = '';

        if (type.startsWith('leave')) {
            area = 'leaves';
        } else {
            area = 'expenses';
        }

        const item = db[area].find(x => x.id === id);

        if (!item) {
            return;
        }

        if (type.endsWith('approve')) {
            item.status = 'Approved';
        } else {
            item.status = 'Rejected';
        }

        log(area + ' request ' + item.status.toLowerCase());
        await save();
        render();
        notify('Status updated');
        return;
    }

    if (type === 'job-toggle') {
        const item = db.recruitment.find(x => x.id === id);

        if (!item) {
            return;
        }

        if (item.status === 'Open') {
            item.status = 'Closed';
        } else {
            item.status = 'Open';
        }

        await save();
        render();
        return;
    }

    if (type.endsWith('-delete')) {
        const map = {
            employee: 'employees',
            attendance: 'attendance',
            leave: 'leaves',
            expense: 'expenses',
            job: 'recruitment',
            performance: 'performance'
        };

        const kind = type.slice(0, -7);
        const collection = map[kind];

        if (!collection) {
            return;
        }

        if (!confirm('Delete this record? This cannot be undone.')) {
            return;
        }

        db[collection] = db[collection].filter(function (item) {
            return item.id !== id;
        });

        if (kind === 'employee') {
            db.attendance = db.attendance.filter(x => x.employeeId !== id);
            db.leaves = db.leaves.filter(x => x.employeeId !== id);
            db.expenses = db.expenses.filter(x => x.employeeId !== id);
            db.performance = db.performance.filter(x => x.employeeId !== id);
            db.payroll = db.payroll.filter(x => x.employeeId !== id);
        }

        log('Record removed');
        await save();
        render();
        notify('Record deleted');
        return;
    }

    if (type === 'backup') {
        const fileName = 'peopleflow-backup-' + TODAY() + '.json';
        const content = JSON.stringify(db, null, 2);

        download(fileName, content, 'application/json');
        return;
    }

    if (type.endsWith('-csv')) {
        const group = type.replace('-csv', '');
        let rows;

        if (group === 'employees') {
            rows = db.employees;
        } else if (group === 'attendance') {
            rows = db.attendance;
        } else if (group === 'leaves') {
            rows = db.leaves;
        } else if (group === 'expenses') {
            rows = db.expenses;
        } else if (group === 'payroll') {
            rows = db.payroll.filter(x => x.month === selectedMonth);
        }

        if (rows) {
            if (['attendance', 'leaves', 'expenses'].includes(group)) rows = reportRows(rows, group);
            csv(rows, group);
        }

        return;
    }


}

function csv(rows, name) {
    const keys = [...new Set(rows.flatMap(function (item) {
        return Object.keys(item);
    }))];

    const allRows = [
        keys,
        ...rows.map(function (item) {
            return keys.map(function (key) {
                return item[key] ?? '';
            });
        })
    ];

    const text = allRows.map(function (row) {
        return row.map(function (value) {
            const text = String(value);
            const guarded = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
            return '"' + guarded.replace(/"/g, '""') + '"';
        }).join(',');
    }).join('\r\n');

    download(
        name + '-' + TODAY() + '.csv',
        '\ufeff' + text,
        'text/csv;charset=utf-8'
    );
}

function download(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = name;
    link.click();

    setTimeout(function () {
        URL.revokeObjectURL(url);
    }, 2000);
}

async function submitForm(form) {
    if (!isStaff()) return submitEmployeeForm(form);
    const data = Object.fromEntries(new FormData(form));
    const kind = data.kind;

    delete data.kind;

    const trim = value => String(value || '').trim();

    if (kind === 'employee') {
        data.id = trim(data.id);
        data.name = trim(data.name);
        data.email = trim(data.email);
        data.salary = Number(data.salary);

        if (!data.id || !data.name || !data.email || !Number.isFinite(data.salary) || data.salary < 0) {
            notify('Check employee fields');
            return;
        }

        const duplicateId = db.employees.some(function (e) {
            return e.id === data.id && e.id !== data.oldId;
        });

        if (duplicateId) {
            notify('Employee ID already exists');
            return;
        }

        const duplicateEmail = db.employees.some(function (e) {
            return e.email.toLowerCase() === data.email.toLowerCase() &&
                e.id !== data.oldId;
        });

        if (duplicateEmail) {
            notify('Email already exists');
            return;
        }

        if (data.oldId) {
            const index = db.employees.findIndex(e => e.id === data.oldId);

            if (index < 0) {
                return;
            }

            db.employees[index] = { ...data };

            if (data.oldId !== data.id) {
                const collections = [
                    'attendance',
                    'leaves',
                    'expenses',
                    'performance',
                    'payroll'
                ];

                collections.forEach(function (key) {
                    db[key].forEach(function (item) {
                        if (item.employeeId === data.oldId) {
                            item.employeeId = data.id;
                        }
                    });
                });
            }
        } else {
            db.employees.push({ ...data });
        }

        delete db.employees.find(e => e.id === data.id).oldId;

        log('Employee saved: ' + data.name);
    }

    else if (kind === 'attendance') {
        const exists = db.attendance.some(function (a) {
            return a.employeeId === data.employeeId &&
                a.date === data.date &&
                a.id !== data.id;
        });

        if (exists) {
            notify('Attendance already exists for this date');
            return;
        }

        if (data.status === 'Absent' || data.status === 'On Leave') {
            data.checkIn = '';
            data.checkOut = '';
        }

        if (data.checkOut && (!data.checkIn || data.checkOut < data.checkIn)) { notify('Check-out must follow check-in'); return; }
        const index = db.attendance.findIndex(a => a.id === data.id);

        if (index >= 0) {
            db.attendance[index] = data;
        } else {
            db.attendance.push({
                ...data,
                id: uid('ATT')
            });
        }

        log('Attendance marked for ' + displayName(data.employeeId));
    }

    else if (kind === 'leave') {
        const error = validateLeave(data, db.leaves, db.settings);
        if (error) { notify(error); return; }
        db.leaves.push({ ...data, id: uid('LV'), status: 'Pending' });
        log('Leave requested by ' + displayName(data.employeeId));
    }

    else if (kind === 'expense') {
        data.amount = Number(data.amount);

        if (data.amount <= 0) {
            notify('Amount must be positive');
            return;
        }

        db.expenses.push({
            ...data,
            id: uid('EX'),
            status: 'Pending'
        });

        log('Expense claim submitted');
    }

    else if (kind === 'job') {
        data.openings = Number(data.openings);

        if (data.openings < 1) {
            notify('Add at least one opening');
            return;
        }

        db.recruitment.push({
            ...data,
            id: uid('JOB'),
            status: 'Open'
        });

        log('New job opened: ' + data.title);
    }

    else if (kind === 'performance') {
        data.score = Number(data.score);

        db.performance.push({
            ...data,
            id: uid('PR')
        });

        log('Performance review created');
    }

    else if (kind === 'payroll') {
        const e = employee(data.employeeId);

        if (!e) {
            return;
        }

        const allowance = Number(data.allowance);
        const deduction = Number(data.deduction);

        if (allowance < 0 || deduction < 0) {
            notify('Amounts cannot be negative');
            return;
        }

        const previous = db.payroll.find(p => p.employeeId === e.id && p.month === selectedMonth);
        const base = previous?.base ?? Number(e.salary);
        const net = base + allowance - deduction;

        if (net < 0) {
            notify('Deductions exceed total salary');
            return;
        }

        const record = {
            id: uid('PAY'),
            employeeId: e.id,
            month: selectedMonth,
            base: base,
            allowance: allowance,
            deduction: deduction,
            net: net
        };

        db.payroll = db.payroll.filter(function (item) {
            return !(item.employeeId === e.id && item.month === selectedMonth);
        });

        db.payroll.push(record);

        log('Salary processed for ' + e.name);
    }

    else {
        return;
    }

    await save();
    close();
    render();
    notify('Record saved successfully');
}

document.addEventListener('click', function (event) {
    const buttonElement = event.target.closest(
        '[data-action],[data-go],[data-close]'
    );

    if (!buttonElement) {
        return;
    }

    if (buttonElement.dataset.go) {
        go(buttonElement.dataset.go);
    } else if (buttonElement.dataset.close) {
        close();
    } else if (buttonElement.dataset.action) {
        runTask(() => action(buttonElement.dataset.action));
    }
});

document.addEventListener('input', function (event) {
    if (event.target.id === 'search') {
        const position = event.target.selectionStart;

        search = event.target.value;

        render();

        const input = document.getElementById('search');

        if (input) {
            input.focus();
            input.setSelectionRange(position, position);
        }
    }
});

document.addEventListener('change', async function (event) {
    if (event.target.id === 'filter') {
        filter = event.target.value;
        render();
    }

    if (event.target.id === 'month') {
        selectedMonth = event.target.value;
        render();
    }

    if (event.target.id === 'importFile') {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        await runTask(async () => {
            if (!isAdmin()) throw new Error('Administrator access required.');
            const imported = JSON.parse(await file.text());

            if (
                !imported ||
                !Array.isArray(imported.employees) ||
                !Array.isArray(imported.attendance) ||
                !Array.isArray(imported.leaves) ||
                !Array.isArray(imported.payroll) ||
                !Array.isArray(imported.expenses) ||
                !Array.isArray(imported.recruitment) ||
                !Array.isArray(imported.performance) ||
                !Array.isArray(imported.activity) ||
                !imported.settings ||
                typeof imported.company !== 'string'
            ) {
                throw Error('Invalid backup');
            }

            if (!confirm('Replace current data with this backup?')) {
                return;
            }

            db = normalizeBackup(imported);

            await save();
            go('overview');
            notify('Backup imported');
        });
    }
});

document.addEventListener('submit', function (event) {
    if (event.target.id === 'accessForm' || event.target.id === 'payslipForm') event.preventDefault();
    if (event.target.getAttribute('id') === 'recordForm') {
        event.preventDefault();
        runTask(() => submitForm(event.target));
    }

    if (event.target.id === 'settingsForm') {
        event.preventDefault();
        runTask(async () => {
            if (!isAdmin()) throw new Error('Administrator access required.');
            const data = Object.fromEntries(new FormData(event.target));
            db.company = data.company.trim();
            db.settings = { annualQuota: Number(data.annualQuota), casualQuota: Number(data.casualQuota),
                sickQuota: Number(data.sickQuota), shiftStart: data.shiftStart, graceMinutes: Number(data.graceMinutes) };
            await save();
            render();
            notify('Settings saved');
        });
    }
});

function closeSidebar() {
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    document.getElementById('sidebarOverlay').hidden = true;
}

document.getElementById('menuBtn').addEventListener('click', () => {
    const open = document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('menuBtn').setAttribute('aria-expanded', String(open));
    document.getElementById('sidebarOverlay').hidden = !open;
    document.body.classList.toggle('nav-open', open);
});
document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
document.addEventListener('click', event => {
    if (!window.matchMedia('(max-width: 750px)').matches) return;
    if (!event.target.closest('.sidebar, #menuBtn')) closeSidebar();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeSidebar(); close(); }
});
window.addEventListener('resize', () => {
    if (window.innerWidth > 750) closeSidebar();
});
document.getElementById('exportBtn').addEventListener('click', () => {
    runTask(() => action(isAdmin() ? 'backup' : 'attendance-csv'));
});

function showWorkspace() {
    const authenticated = !!currentProfile;
    document.getElementById('signin').classList.toggle('hidden', authenticated);
    document.getElementById('app').classList.toggle('hidden', !authenticated);
    if (authenticated) render();
}

function clearWorkspace() {
    currentProfile = null;
    confirmedWorkspace = null;
    db = emptyWorkspace();
    revision = 0;
    closeSidebar();
    close();
    document.getElementById('view').replaceChildren();
    showWorkspace();
    clearInterval(refreshTimer);
}

async function loadAccount() {
    acceptWorkspace(await cloud.rpc('pf_get_workspace'));
    page = 'overview';
    showWorkspace();
    clearInterval(refreshTimer);
    // Refresh when idle; never overwrite an in-progress form or save.
    refreshTimer = setInterval(refreshWorkspace, 30000);
}

async function refreshWorkspace() {
    if (!currentProfile || busy || document.hidden || !document.getElementById('modal').classList.contains('hidden') || page === 'settings') return;
    await runTask(async () => {
        const result = await cloud.rpc('pf_get_workspace');
        if (result.revision !== revision || JSON.stringify(result.profile) !== JSON.stringify(currentProfile)) {
            acceptWorkspace(result);
            render();
        }
    });
}

document.getElementById('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const submit = event.target.querySelector('[type="submit"]');
    busy = true;
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    document.getElementById('loginError').textContent = '';
    try {
        await cloud.login(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value);
        await loadAccount();
        document.getElementById('loginPassword').value = '';
    } catch (error) {
        clearWorkspace();
        document.getElementById('loginError').textContent = error.message;
    } finally {
        busy = false;
        submit.disabled = false;
        submit.textContent = 'Sign in →';
    }
});

document.getElementById('showPassword').addEventListener('click', () => {
    const input = document.getElementById('loginPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
    document.getElementById('showPassword').setAttribute('aria-label', input.type === 'text' ? 'Hide password' : 'Show password');
});

document.getElementById('logoutBtn').addEventListener('click', () => runTask(async () => {
    await cloud.logout();
    clearWorkspace();
}));

(async function boot() {
    try {
        cloud.initialize();
        cloud.onAuthChange(event => {
            if (event === 'SIGNED_OUT') clearWorkspace();
        });
        if (await cloud.session()) await loadAccount();
    } catch (error) {
        clearWorkspace();
        document.getElementById('loginError').textContent = error.message;
    }
})();
