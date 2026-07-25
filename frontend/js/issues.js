const IssuesPage = { page: 1, pageSize: 10, status: "" };

document.addEventListener("DOMContentLoaded", () => {
  bindToolbar();
  bindModals();
  fetchIssues();

  // Deep-link support: issues.html?student_id=3
  const params = new URLSearchParams(window.location.search);
  if (params.get("openIssueModal") === "1") {
    document.getElementById("btnIssueBook").click();
  }
});

function bindToolbar() {
  document.querySelectorAll("#statusTabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#statusTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      IssuesPage.status = btn.dataset.status;
      IssuesPage.page = 1;
      fetchIssues();
    });
  });

  document.getElementById("pageSize").addEventListener("change", (e) => {
    IssuesPage.pageSize = parseInt(e.target.value, 10);
    IssuesPage.page = 1;
    fetchIssues();
  });
}

async function fetchIssues() {
  const tbody = document.getElementById("issuesTableBody");
  tbody.innerHTML = `<tr class="skeleton-row"><td colspan="8"><div class="skeleton-bar"></div></td></tr>`;

  const params = new URLSearchParams({ page: IssuesPage.page, page_size: IssuesPage.pageSize });
  if (IssuesPage.status) params.set("status", IssuesPage.status);

  try {
    const result = await Api.get(`/issues?${params.toString()}`);
    renderIssues(result.data);
    renderPagination(document.getElementById("paginationBar"), result.meta, (p) => {
      IssuesPage.page = p;
      fetchIssues();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Could not load issues — ${err.message}</td></tr>`;
  }
}

function renderIssues(rows) {
  const tbody = document.getElementById("issuesTableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="bi bi-inbox"></i>No records found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r) => {
    const balance = Number(r.fine_amount || 0);
    const isOutstanding = balance > 0 && !r.fine_paid;
    const canReturn = r.status === "issued" || r.status === "overdue";
    return `
    <tr>
      <td>
        <div class="cell-title">${r.title}</div>
        <div class="cell-muted mono">${r.isbn}</div>
      </td>
      <td>
        <div>${r.student_name}</div>
        <div class="cell-muted mono">${r.roll_number}</div>
      </td>
      <td class="cell-muted">${fmt.date(r.issue_date)}</td>
      <td class="cell-muted">${fmt.date(r.due_date)}</td>
      <td class="cell-muted">${r.return_date ? fmt.date(r.return_date) : "—"}</td>
      <td class="mono">${balance > 0 ? fmt.money(balance) : "—"}</td>
      <td>${fmt.statusBadge(r.status)}</td>
      <td>
        <div class="row-actions">
          ${canReturn ? `<button class="btn btn-outline-ink" onclick="returnBook(${r.issue_id}, '${r.title.replace(/'/g, "\\'")}')"><i class="bi bi-arrow-return-left"></i> Return</button>` : ""}
          ${isOutstanding ? `<button class="btn btn-brass" onclick="openPayFine(${r.issue_id}, ${balance})"><i class="bi bi-cash"></i> Pay Fine</button>` : ""}
        </div>
      </td>
    </tr>
  `;
  }).join("");
}

/* ---------------------------------------------------------------------
   Issue Book modal
--------------------------------------------------------------------- */
let issueModalInstance, payFineModalInstance;
let availableBooksCache = [];

function bindModals() {
  issueModalInstance = new bootstrap.Modal(document.getElementById("issueModal"));
  payFineModalInstance = new bootstrap.Modal(document.getElementById("payFineModal"));

  document.getElementById("btnIssueBook").addEventListener("click", openIssueModal);
  document.getElementById("issueForm").addEventListener("submit", submitIssue);
  document.getElementById("payFineForm").addEventListener("submit", submitPayFine);

  document.getElementById("issueBookSelect").addEventListener("change", (e) => {
    const book = availableBooksCache.find((b) => b.book_id == e.target.value);
    const hint = document.getElementById("bookAvailabilityHint");
    hint.textContent = book ? `${book.available_copies} of ${book.total_copies} copies available` : "";
  });
}

async function openIssueModal() {
  const bookSelect = document.getElementById("issueBookSelect");
  const studentSelect = document.getElementById("issueStudentSelect");
  bookSelect.innerHTML = `<option>Loading…</option>`;
  studentSelect.innerHTML = `<option>Loading…</option>`;
  issueModalInstance.show();

  try {
    const [books, students] = await Promise.all([
      Api.get("/reports/available-books?page=1&page_size=100"),
      Api.get("/students?status=active&page=1&page_size=100"),
    ]);
    availableBooksCache = books.data;
    bookSelect.innerHTML = books.data.map((b) =>
      `<option value="${b.book_id}">${b.title} (${b.available_copies} available)</option>`).join("") ||
      `<option value="">No books available</option>`;
    studentSelect.innerHTML = students.data.map((s) =>
      `<option value="${s.student_id}">${s.full_name} — ${s.roll_number}</option>`).join("") ||
      `<option value="">No active students</option>`;
    bookSelect.dispatchEvent(new Event("change"));
  } catch (err) {
    Toast.error("Could not load issue form data: " + err.message);
  }
}

async function submitIssue(e) {
  e.preventDefault();
  const bookId = document.getElementById("issueBookSelect").value;
  const studentId = document.getElementById("issueStudentSelect").value;
  const issueDays = parseInt(document.getElementById("issueDays").value, 10) || 14;

  if (!bookId || !studentId) {
    Toast.error("Select both a book and a student.");
    return;
  }

  const btn = document.getElementById("issueSaveBtn");
  btn.disabled = true;
  try {
    const result = await Api.post("/issues/issue", { book_id: parseInt(bookId, 10), student_id: parseInt(studentId, 10), issue_days: issueDays });
    Toast.success(result.message);
    issueModalInstance.hide();
    fetchIssues();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------------------
   Return + Pay Fine
--------------------------------------------------------------------- */
async function returnBook(issueId, title) {
  const confirmed = await confirmDialog({
    title: "Confirm return",
    body: `Mark "${title}" as returned? Any late fine will be calculated automatically.`,
    confirmText: "Confirm Return",
    danger: false,
  });
  if (!confirmed) return;

  try {
    const result = await Api.post(`/issues/${issueId}/return`, {});
    Toast.success(result.message);
    fetchIssues();
  } catch (err) {
    Toast.error(err.message);
  }
}

function openPayFine(issueId, balance) {
  document.getElementById("payFineIssueId").value = issueId;
  document.getElementById("payFineBalance").textContent = fmt.money(balance);
  document.getElementById("payFineAmount").value = balance;
  document.getElementById("payFineAmount").max = balance;
  payFineModalInstance.show();
}

async function submitPayFine(e) {
  e.preventDefault();
  const issueId = document.getElementById("payFineIssueId").value;
  const amount = parseFloat(document.getElementById("payFineAmount").value);

  const btn = document.getElementById("payFineSaveBtn");
  btn.disabled = true;
  try {
    const result = await Api.post(`/issues/${issueId}/pay-fine`, { amount });
    Toast.success(result.message);
    payFineModalInstance.hide();
    fetchIssues();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false;
  }
}
