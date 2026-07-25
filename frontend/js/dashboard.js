document.addEventListener("DOMContentLoaded", async () => {
  try {
    const stats = await Api.get("/dashboard/stats");
    document.getElementById("kpiTotalBooks").textContent = stats.total_books;
    document.getElementById("kpiAvailable").textContent = stats.available_books;
    document.getElementById("kpiIssued").textContent = stats.issued_books;
    document.getElementById("kpiLate").textContent = stats.late_returns;
    document.getElementById("kpiStudents").textContent = stats.total_students;
    document.getElementById("kpiReturned").textContent = stats.returned_books;
    document.getElementById("kpiFineCollected").textContent = fmt.money(stats.fine_collected);
    document.getElementById("kpiFinePending").textContent = fmt.money(stats.fine_pending);
  } catch (err) {
    Toast.error(err.message);
  }

  loadTrendChart();
  loadCategoryChart();
  loadRecentActivity();
});

async function loadTrendChart() {
  try {
    const rows = await Api.get("/dashboard/issues-trend?days=14");
    const ctx = document.getElementById("issuesTrendChart");
    new Chart(ctx, {
      type: "line",
      data: {
        labels: rows.map((r) => fmt.date(r.day)),
        datasets: [{
          label: "Books issued",
          data: rows.map((r) => r.issued_count),
          borderColor: "#c9971c",
          backgroundColor: "rgba(201,151,28,0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: "#c9971c",
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#eef1f6" } },
          x: { grid: { display: false } },
        },
      },
    });
  } catch (err) {
    Toast.error("Could not load issues trend: " + err.message);
  }
}

async function loadCategoryChart() {
  try {
    const rows = await Api.get("/dashboard/category-distribution");
    const ctx = document.getElementById("categoryChart");
    const palette = ["#0f1b2d", "#c9971c", "#158f77", "#3563e9", "#d64545", "#e2a034", "#8a660f", "#64748b"];
    new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: rows.map((r) => r.category_name),
        datasets: [{ data: rows.map((r) => r.book_count), backgroundColor: palette, borderWidth: 0 }],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
        cutout: "62%",
      },
    });
  } catch (err) {
    Toast.error("Could not load category distribution: " + err.message);
  }
}

async function loadRecentActivity() {
  const body = document.getElementById("recentActivityBody");
  try {
    const rows = await Api.get("/dashboard/recent-activity?limit=8");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="empty-state"><i class="bi bi-inbox"></i>No activity yet</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r) => `
      <tr>
        <td class="cell-title">${r.title}</td>
        <td>${r.student_name}</td>
        <td class="cell-muted">${fmt.date(r.issue_date)}</td>
        <td class="cell-muted">${r.return_date ? fmt.date(r.return_date) : "—"}</td>
        <td>${fmt.statusBadge(r.status)}</td>
      </tr>
    `).join("");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="empty-state">Could not load activity</td></tr>`;
  }
}
