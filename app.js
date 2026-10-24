
'use strict';

const KEY = 'peopleflow_hrms_v1';

function TODAY() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
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

function seed() {
    const day = TODAY();

    return {
        company: 'Sanaulla Store',

        employees: [
            {
                id: 'EMP-101',
                name: 'Ayesha Malik',
                email: 'ayesha@example.com',
                phone: '03001234567',
                department: 'Design',
                designation: 'UI Designer',
                joined: '2025-04-10',
                salary: 78000,
                status: 'Active'
            },
            {
                id: 'EMP-102',
                name: 'Hamza Ali',
                email: 'hamza@example.com',
                phone: '03011234567',
                department: 'Engineering',
                designation: 'Frontend Developer',
                joined: '2025-07-19',
                salary: 95000,
                status: 'Active'
            },
            {
                id: 'EMP-103',
                name: 'Sara Khan',
                email: 'sara@example.com',
                phone: '03021234567',
                department: 'People Ops',
                designation: 'HR Executive',
                joined: '2024-09-02',
                salary: 85000,
                status: 'Active'
            },
            {
                id: 'EMP-104',
                name: 'Bilal Ahmed',
                email: 'bilal@example.com',
                phone: '03031234567',
                department: 'Operations',
                designation: 'Operations Officer',
                joined: '2026-01-15',
                salary: 62000,
                status: 'Active'
            },
            {
                id: 'EMP-105',
                name: 'Zoya Ahmed',
                email: 'zoya@example.com',
                phone: '03041234567',
                department: 'Marketing',
                designation: 'Content Lead',
                joined: '2025-11-07',
                salary: 72000,
                status: 'On Leave'
            }
        ],

        attendance: [
            {
                id: uid('ATT'),
                employeeId: 'EMP-101',
                date: day,
                status: 'Present',
                checkIn: '09:03',
                checkOut: '18:00'
            },
            {
                id: uid('ATT'),
                employeeId: 'EMP-102',
                date: day,
                status: 'Present',
                checkIn: '09:27',
                checkOut: '18:12'
            },
            {
                id: uid('ATT'),
                employeeId: 'EMP-103',
                date: day,
                status: 'Present',
                checkIn: '08:58',
                checkOut: '17:50'
            },
            {
                id: uid('ATT'),
                employeeId: 'EMP-104',
                date: day,
                status: 'Absent',
                checkIn: '',
                checkOut: ''
            }
        ],

        leaves: [
            {
                id: uid('LV'),
                employeeId: 'EMP-105',
                type: 'Annual',
                from: day,
                to: day,
                reason: 'Personal',
                status: 'Approved'
            },
            {
                id: uid('LV'),
                employeeId: 'EMP-102',
                type: 'Casual',
                from: day,
                to: day,
                reason: 'Family appointment',
                status: 'Pending'
            }
        ],

        expenses: [
            {
                id: uid('EX'),
                employeeId: 'EMP-104',
                type: 'Travel',
                amount: 2500,
                date: day,
                description: 'Client site visit',
                status: 'Pending'
            }
        ],

        recruitment: [
            {
                id: uid('JOB'),
                title: 'Product Designer',
                department: 'Design',
                openings: 1,
                status: 'Open'
            },
            {
                id: uid('JOB'),
                title: 'QA Engineer',
                department: 'Engineering',
                openings: 2,
                status: 'Open'
            }
        ],

        performance: [
            {
                id: uid('PR'),
                employeeId: 'EMP-101',
                period: MONTH(),
                score: 4,
                notes: 'Strong delivery'
            }
        ],

        payroll: [],

        activity: [
            {
                id: uid('ACT'),
                text: 'Demo workspace ready',
                date: day
            }
        ],

        settings: {
            annualQuota: 20,
            casualQuota: 10,
            sickQuota: 8
        }
    };
}

function load() {
    try {
        const savedData = localStorage.getItem(KEY);
        const data = JSON.parse(savedData);

        if (data && Array.isArray(data.employees)) {
            return data;
        }
    } catch (error) {
    }

    const data = seed();

    try {
        localStorage.setItem(KEY, JSON.stringify(data));
    } catch (error) {
    }

    return data;
}

let db = load();
let page = 'overview';
let search = '';
let filter = '';
let selectedMonth = MONTH();
let toastTimer;

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(db));
        return true;
    } catch (error) {
        alert('Browser storage full or blocked. Please export your data.');
        return false;
    }
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
    page = newPage;
    search = '';
    filter = '';

    document.querySelector('.sidebar').classList.remove('open');

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

    if (['Active', 'Approved', 'Present', 'Paid', 'Open', 'Completed'].includes(status)) {
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
        const status = p ? 'Paid' : 'Not processed';
        const actionName = p ? 'Adjust' : 'Process';

        return tr([
            person(e),
            money(e.salary),
            money(allowance),
            money(deduction),
            `<b>${money(net)}</b>`,
            pill(status),
            button(actionName, 'payroll-process:' + e.id, 'small secondary')
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
            Demo payroll calculator. It does not calculate Pakistan income tax,
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
            ${button('JSON backup', 'backup', 'secondary')}
        </div>
    `;

    return header(
        'Reports & insights',
        'A quick look at workforce distribution and key metrics.',
        button('Export employees CSV', 'employees-csv', 'secondary')
    ) + `
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
            <button class="btn" type="submit">Save settings</button>
        </form>
    `;

    const backups = `
        <p class="subtitle" style="margin-bottom:20px">
            Save your records outside this browser.
            Importing a backup replaces current data.
        </p>
        <div class="btn-row">
            ${button('Download backup', 'backup', 'secondary')}
            <label class="btn secondary" style="cursor:pointer">
                Import JSON
                <input type="file" id="importFile"
                    accept="application/json,.json" hidden>
            </label>
            ${button('Reset demo data', 'reset', 'danger')}
        </div>
        <p class="muted" style="font-size:11px;margin-top:20px">
            LocalStorage is not secure shared storage.
            Avoid real employee personal information.
        </p>
    `;

    return header(
        'Workspace settings',
        'Edit demo workspace preferences and backups.'
    ) + `
        <div class="split">
            ${panel('Company settings', companyForm)}
            ${panel('Data & backups', backups)}
        </div>
    `;
}

function render() {
    const navigation = document.getElementById('navigation');
    let navigationHTML = '';

    nav.forEach(function (item) {
        const id = item[0];
        const icon = item[1];
        const label = item[2];
        const active = page === id ? 'active' : '';

        navigationHTML += `
            <button class="nav-link ${active}" data-go="${id}">
                <span class="symbol">${icon}</span>
                ${label}
            </button>
        `;
    });

    navigation.innerHTML = navigationHTML;

    const currentPage = nav.find(item => item[0] === page);

    document.getElementById('crumb').textContent =
        currentPage ? currentPage[2] : 'Overview';

    document.getElementById('today').textContent =
        new Date().toLocaleDateString('en-PK', {
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

    document.getElementById('view').innerHTML = pages[page]();
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

function action(code) {
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
                ${selectedMonth} · Base salary ${money(e.salary)}
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
                    allowance: 0,
                    deduction: 0,
                    net: Number(e.salary)
                });
            }
        });

        log('Payroll processed for ' + selectedMonth);
        save();
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
        save();
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

        save();
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
        save();
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
            csv(rows, group);
        }

        return;
    }

    if (type === 'reset') {
        if (!confirm('Reset all changes and restore example data?')) {
            return;
        }

        db = seed();

        save();
        go('overview');
        notify('Demo restored');
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
            return '"' + String(value).replace(/"/g, '""') + '"';
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

function submitForm(form) {
    const data = Object.fromEntries(new FormData(form));
    const kind = data.kind;

    delete data.kind;

    const trim = value => String(value || '').trim();

    if (kind === 'employee') {
        data.id = trim(data.id);
        data.name = trim(data.name);
        data.email = trim(data.email);
        data.salary = Number(data.salary);

        if (!data.id || !data.name || !data.email || data.salary < 0) {
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
        if (data.to < data.from) {
            notify('End date must not precede start');
            return;
        }

        if (data.type !== 'Unpaid') {
            const quotaKey = data.type.toLowerCase() + 'Quota';
            const quota = db.settings[quotaKey];

            const approvedLeaves = db.leaves.filter(function (l) {
                return l.employeeId === data.employeeId &&
                    l.type === data.type &&
                    l.status === 'Approved' &&
                    l.from.slice(0, 4) === data.from.slice(0, 4);
            });

            const used = approvedLeaves.reduce(function (total, l) {
                return total + daysBetween(l.from, l.to);
            }, 0);

            const requested = daysBetween(data.from, data.to);

            if (used + requested > quota) {
                notify('Leave request exceeds annual quota');
                return;
            }
        }

        db.leaves.push({
            ...data,
            id: uid('LV'),
            status: 'Pending'
        });

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

        const net = Number(e.salary) + allowance - deduction;

        if (net < 0) {
            notify('Deductions exceed total salary');
            return;
        }

        const record = {
            id: uid('PAY'),
            employeeId: e.id,
            month: selectedMonth,
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

    save();
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
        action(buttonElement.dataset.action);
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

        try {
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

            db = imported;

            save();
            go('overview');
            notify('Backup imported');
        } catch (error) {
            notify('Invalid JSON backup file');
        }
    }
});

document.addEventListener('submit', function (event) {
    if (event.target.id === 'recordForm') {
        event.preventDefault();
        submitForm(event.target);
    }

    if (event.target.id === 'settingsForm') {
        event.preventDefault();

        const data = Object.fromEntries(new FormData(event.target));

        db.company = data.company.trim() || 'Company';

        db.settings = {
            annualQuota: Number(data.annualQuota),
            casualQuota: Number(data.casualQuota),
            sickQuota: Number(data.sickQuota)
        };

        save();
        render();
        notify('Settings saved');
    }
});

document.getElementById('menuBtn').addEventListener('click', function () {
    document.querySelector('.sidebar').classList.toggle('open');
});

document.getElementById('exportBtn').addEventListener('click', function () {
    action('backup');
});

render();

const LOGIN_SESSION = 'peopleflow_demo_signed_in';

function showWorkspace() {
    const authenticated = sessionStorage.getItem(LOGIN_SESSION) === 'yes';

    document.getElementById('signin').classList.toggle(
        'hidden',
        authenticated
    );

    document.getElementById('app').classList.toggle(
        'hidden',
        !authenticated
    );
}

document.getElementById('loginForm').addEventListener('submit', function (event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail')
        .value.trim().toLowerCase();

    const password = document.getElementById('loginPassword').value;

    if (email === 'admin@demo.com' && password === 'admin123') {
        sessionStorage.setItem(LOGIN_SESSION, 'yes');

        document.getElementById('loginError').textContent = '';

        go('overview');
        showWorkspace();
    } else {
        document.getElementById('loginError').textContent =
            'Incorrect email or password.';
    }
});

document.getElementById('showPassword').addEventListener('click', function () {
    const input = document.getElementById('loginPassword');

    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
});

document.getElementById('logoutBtn').addEventListener('click', function () {
    sessionStorage.removeItem(LOGIN_SESSION);
    showWorkspace();
});

showWorkspace();
