const ReportsPage = { tab: "available", page: 1, pageSize: 10, studentFilter: "", unpaidOnly: false };
let studentsCacheForFilter = null;

const REPORT_DEFS = {
  available: {
    endpoint: () => `/reports/available-books?page=${ReportsPage.page}&page_size=${ReportsPage.pageSize}`,
    paginated: true,
    columns: ["Title", "ISBN", "Category", "Publisher", "Copies", "Price"],
    row: (b) => `
      <td class="cell-title">${b.title}</td>
      <td class="mono cell-muted">${b.isbn}</td>
      <td>${b.category_name}</td>
      <td class="cell-muted">${b.publisher_name}</td>
      <td>${b.available_copies} / ${b.total_copies}</td>
      <td class="mono">${fmt.money(b.price)}</td>`,
  },
  borrowed: {
    endpoint: () => `/reports/borrowed-books?page=${ReportsPage.page}&page_size=${ReportsPage.pageSize}`,
    paginated: true,
    columns: ["Book", "ISBN", "Student", "Issue Date", "Due Date", "Status"],
    row: (r) => `
      <td class="cell-title">${r.title}</td>
      <td class="mono cell-muted">${r.isbn}</td>
      <td>${r.student_name} <span class="cell-muted mono">(${r.roll_number})</span></td>
      <td class="cell-muted">${fmt.date(r.issue_date)}</td>
      <td class="cell-muted">${fmt.date(r.due_date)}</td>
      <td>${fmt.statusBadge(r.status)}</td>`,
  },
  overdue: {
    endpoint: () => `/reports/overdue-books?page=${ReportsPage.page}&page_size=${ReportsPage.pageSize}`,
    paginated: true,
    columns: ["Book", "Student", "Phone", "Due Date", "Days Overdue", "Estimated Fine"],
    row: (r) => `
      <td class="cell-title">${r.title}</td>
      <td>${r.student_name} <span class="cell-muted mono">(${r.roll_number})</span></td>
      <td class="mono cell-muted">${r.phone}</td>
      <td class="cell-muted">${fmt.date(r.due_date)}</td>
      <td><span class="badge-soft badge-danger">${r.days_overdue} days</span></td>
      <td class="mono">${fmt.money(r.estimated_fine)}</td>`,
  },
  "most-borrowed": {
    endpoint: () => `/reports/most-borrowed?limit=15`,
    paginated: false,
    columns: ["Book", "ISBN", "Category", "Times Borrowed", "Currently Out", "Avg Days Held"],
    row: (r) => `
      <td class="cell-title">${r.title}</td>
      <td class="mono cell-muted">${r.isbn}</td>
      <td>${r.category_name}</td>
      <td><span class="badge-soft badge-blue">${r.times_borrowed}×</span></td>
      <td>${r.currently_out}</td>
      <td class="cell-muted">${r.avg_days_held ?? "—"} days</td>`,
  },
  "student-history": {
    endpoint: () => {
      const sid = ReportsPage.studentFilter ? `&student_id=${ReportsPage.studentFilter}` : "";
      return `/reports/student-history?page=${ReportsPage.page}&page_size=${ReportsPage.pageSize}${sid}`;
    },
    paginated: true,
    columns: ["Student", "Book", "Issue Date", "Due Date", "Return Date", "Status", "Fine"],
    row: (r) => `
      <td>${r.student_name} <span class="cell-muted mono">(${r.roll_number})</span></td>
      <td class="cell-title">${r.title}</td>
      <td class="cell-muted">${fmt.date(r.issue_date)}</td>
      <td class="cell-muted">${fmt.date(r.due_date)}</td>
      <td class="cell-muted">${r.return_date ? fmt.date(r.return_date) : "—"}</td>
      <td>${fmt.statusBadge(r.status)}</td>
      <td class="mono">${Number(r.fine_amount) > 0 ? fmt.money(r.fine_amount) : "—"}</td>`,
    toolbar: async () => {
      if (!studentsCacheForFilter) {
        const res = await Api.get("/students?page=1&page_size=100");
        studentsCacheForFilter = res.data;
      }
      const options = studentsCacheForFilter.map((s) => `<option value="${s.student_id}">${s.full_name} (${s.roll_number})</option>`).join("");
      return `
        <select class="form-select" id="studentFilterSelect" style="max-width:260px;">
          <option value="">All students</option>
          ${options}
        </select>`;
    },
  },
  fines: {
    endpoint: () => `/reports/fines?page=${ReportsPage.page}&page_size=${ReportsPage.pageSize}&unpaid_only=${ReportsPage.unpaidOnly}`,
    paginated: true,
    columns: ["Student", "Book", "Due Date", "Fine", "Paid", "Balance", "Status"],
    row: (r) => `
      <td>${r.student_name} <span class="cell-muted mono">(${r.roll_number})</span></td>
      <td class="cell-title">${r.title}</td>
      <td class="cell-muted">${fmt.date(r.due_date)}</td>
      <td class="mono">${fmt.money(r.fine_amount)}</td>
      <td class="mono">${fmt.money(r.amount_paid)}</td>
      <td class="mono">${fmt.money(r.balance_due)}</td>
      <td>${fmt.statusBadge(r.fine_paid ? "paid" : "pending")}</td>`,
    toolbar: () => `
      <div class="form-check form-switch d-flex align-items-center gap-2">
        <input class="form-check-input" type="checkbox" id="unpaidOnlyToggle" ${ReportsPage.unpaidOnly ? "checked" : ""}>
        <label class="form-check-label" for="unpaidOnlyToggle">Unpaid only</label>
      </div>`,
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const initialTab = params.get("tab");
  if (initialTab && REPORT_DEFS[initialTab]) {
    ReportsPage.tab = initialTab;
    document.querySelectorAll("#reportTabs .nav-link").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === initialTab);
    });
  }

  document.querySelectorAll("#reportTabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#reportTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ReportsPage.tab = btn.dataset.tab;
      ReportsPage.page = 1;
      loadReport();
    });
  });

  loadReport();
});

async function loadReport() {
  const def = REPORT_DEFS[ReportsPage.tab];
  const head = document.getElementById("reportTableHead");
  const body = document.getElementById("reportTableBody");
  const toolbar = document.getElementById("reportToolbar");
  const paginationBar = document.getElementById("paginationBar");

  head.innerHTML = `<tr>${def.columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  body.innerHTML = `<tr class="skeleton-row"><td colspan="${def.columns.length}"><div class="skeleton-bar"></div></td></tr>`;
  paginationBar.innerHTML = "";

  // Toolbar (per-report filters), rendered once per tab switch
  if (def.toolbar) {
    toolbar.innerHTML = await def.toolbar();
    bindReportToolbar();
  } else {
    toolbar.innerHTML = `<div class="text-muted-2" style="font-size:.85rem;">${describeReport(ReportsPage.tab)}</div>`;
  }

  try {
    const result = await Api.get(def.endpoint());
    const rows = def.paginated ? result.data : result;
    renderReportRows(rows, def, body);
    if (def.paginated) {
      renderPagination(paginationBar, result.meta, (p) => { ReportsPage.page = p; loadReport(); });
    }
  } catch (err) {
    body.innerHTML = `<tr><td colspan="${def.columns.length}" class="empty-state">Could not load report — ${err.message}</td></tr>`;
  }
}

function bindReportToolbar() {
  const studentSelect = document.getElementById("studentFilterSelect");
  if (studentSelect) {
    studentSelect.value = ReportsPage.studentFilter;
    studentSelect.addEventListener("change", (e) => {
      ReportsPage.studentFilter = e.target.value;
      ReportsPage.page = 1;
      loadReport();
    });
  }
  const unpaidToggle = document.getElementById("unpaidOnlyToggle");
  if (unpaidToggle) {
    unpaidToggle.addEventListener("change", (e) => {
      ReportsPage.unpaidOnly = e.target.checked;
      ReportsPage.page = 1;
      loadReport();
    });
  }
}

function renderReportRows(rows, def, body) {
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${def.columns.length}" class="empty-state"><i class="bi bi-clipboard-x"></i>No data for this report.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r) => `<tr>${def.row(r)}</tr>`).join("");
}

function describeReport(tab) {
  const map = {
    "most-borrowed": "Top 15 titles ranked by total times borrowed.",
  };
  return map[tab] || "";
}
