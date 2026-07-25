const StudentsPage = { page: 1, pageSize: 10, query: "", status: "" };

document.addEventListener("DOMContentLoaded", () => {
  bindToolbar();
  bindModal();
  fetchStudents();
});

function bindToolbar() {
  document.getElementById("searchInput").addEventListener("input", debounce((e) => {
    StudentsPage.query = e.target.value.trim();
    StudentsPage.page = 1;
    fetchStudents();
  }));

  document.getElementById("statusFilter").addEventListener("change", (e) => {
    StudentsPage.status = e.target.value;
    StudentsPage.page = 1;
    fetchStudents();
  });

  document.getElementById("pageSize").addEventListener("change", (e) => {
    StudentsPage.pageSize = parseInt(e.target.value, 10);
    StudentsPage.page = 1;
    fetchStudents();
  });

  document.getElementById("btnAddStudent").addEventListener("click", () => openStudentModal(null));
}

async function fetchStudents() {
  const tbody = document.getElementById("studentsTableBody");
  tbody.innerHTML = `<tr class="skeleton-row"><td colspan="7"><div class="skeleton-bar"></div></td></tr>`;

  const params = new URLSearchParams({
    q: StudentsPage.query,
    page: StudentsPage.page,
    page_size: StudentsPage.pageSize,
  });
  if (StudentsPage.status) params.set("status", StudentsPage.status);

  try {
    const result = await Api.get(`/students?${params.toString()}`);
    renderStudents(result.data);
    renderPagination(document.getElementById("paginationBar"), result.meta, (p) => {
      StudentsPage.page = p;
      fetchStudents();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Could not load students — ${err.message}</td></tr>`;
  }
}

function renderStudents(rows) {
  const tbody = document.getElementById("studentsTableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><i class="bi bi-person-x"></i>No students match your search.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((s) => `
    <tr>
      <td>
        <div class="cell-title">${s.full_name}</div>
        <div class="cell-muted mono">${s.roll_number}</div>
      </td>
      <td class="cell-muted">${s.department || "—"}</td>
      <td>${s.books_currently_held || 0}</td>
      <td>${Number(s.overdue_count || 0) > 0
          ? `<span class="badge-soft badge-danger">${s.overdue_count}</span>`
          : `<span class="cell-muted">0</span>`}</td>
      <td class="mono">${fmt.money((s.total_fine_charged || 0) - (s.total_fine_paid || 0))}</td>
      <td>${fmt.statusBadge(s.status)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" onclick="editStudent(${s.student_id})"><i class="bi bi-pencil"></i></button>
          <button class="icon-btn danger" title="Delete" onclick="deleteStudent(${s.student_id}, '${s.full_name.replace(/'/g, "\\'")}')"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

/* ---------------------------------------------------------------------
   Add / Edit modal
--------------------------------------------------------------------- */
let studentModalInstance;
function bindModal() {
  studentModalInstance = new bootstrap.Modal(document.getElementById("studentModal"));
  document.getElementById("studentForm").addEventListener("submit", saveStudent);
}

function openStudentModal(student) {
  document.getElementById("studentForm").reset();
  document.getElementById("studentId").value = student ? student.student_id : "";
  document.getElementById("studentModalTitle").textContent = student ? "Edit Student" : "Add Student";
  document.getElementById("statusFieldGroup").style.display = student ? "block" : "none";
  document.getElementById("fRollNumber").disabled = !!student;

  if (student) {
    document.getElementById("fFullName").value = student.full_name;
    document.getElementById("fRollNumber").value = student.roll_number;
    document.getElementById("fEmail").value = student.email || "";
    document.getElementById("fPhone").value = student.phone || "";
    document.getElementById("fDepartment").value = student.department || "";
    document.getElementById("fSemester").value = student.semester || "";
    document.getElementById("fAddress").value = student.address || "";
    document.getElementById("fStatus").value = student.status;
  }
  studentModalInstance.show();
}

async function editStudent(studentId) {
  try {
    const student = await Api.get(`/students/${studentId}`);
    openStudentModal(student);
  } catch (err) {
    Toast.error(err.message);
  }
}

async function saveStudent(e) {
  e.preventDefault();
  const studentId = document.getElementById("studentId").value;

  const payload = {
    full_name: document.getElementById("fFullName").value.trim(),
    email: document.getElementById("fEmail").value.trim(),
    phone: document.getElementById("fPhone").value.trim(),
    department: document.getElementById("fDepartment").value.trim() || null,
    semester: document.getElementById("fSemester").value ? parseInt(document.getElementById("fSemester").value, 10) : null,
    address: document.getElementById("fAddress").value.trim() || null,
  };

  const saveBtn = document.getElementById("studentSaveBtn");
  saveBtn.disabled = true;

  try {
    if (studentId) {
      payload.status = document.getElementById("fStatus").value;
      await Api.put(`/students/${studentId}`, payload);
      Toast.success("Student updated successfully.");
    } else {
      payload.roll_number = document.getElementById("fRollNumber").value.trim();
      await Api.post("/students", payload);
      Toast.success("Student added successfully.");
    }
    studentModalInstance.hide();
    fetchStudents();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteStudent(studentId, name) {
  const confirmed = await confirmDialog({
    title: "Delete this student?",
    body: `"${name}" will be permanently removed if they have no borrowing history, or marked inactive if they do.`,
    confirmText: "Delete",
  });
  if (!confirmed) return;
  try {
    const result = await Api.del(`/students/${studentId}`);
    Toast.success(result.message);
    fetchStudents();
  } catch (err) {
    Toast.error(err.message);
  }
}
