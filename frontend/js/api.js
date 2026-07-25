/* =====================================================================
   Shared frontend utilities: auth session, API client, toasts,
   confirmation dialogs, and small formatting helpers.
   Loaded on every page before the page-specific script.
   ===================================================================== */

const Session = {
  KEY_TOKEN: "lms_token",
  KEY_ADMIN: "lms_admin",

  save(token, admin) {
    localStorage.setItem(this.KEY_TOKEN, token);
    localStorage.setItem(this.KEY_ADMIN, JSON.stringify(admin));
  },
  getToken() {
    return localStorage.getItem(this.KEY_TOKEN);
  },
  getAdmin() {
    const raw = localStorage.getItem(this.KEY_ADMIN);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(this.KEY_TOKEN);
    localStorage.removeItem(this.KEY_ADMIN);
  },
  requireAuth() {
    if (!this.getToken()) {
      window.location.href = "index.html";
    }
  },
};

/**
 * Thin fetch wrapper: attaches the bearer token, parses JSON, and
 * throws a normalized Error with the server's `detail` message so
 * every caller can just .catch(err => toast.error(err.message)).
 */
async function apiRequest(path, { method = "GET", body = null, isForm = false } = {}) {
  const headers = {};
  const token = Session.getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };

  if (body !== null) {
    if (isForm) {
      opts.body = body; // URLSearchParams
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    } else {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }

  let response;
  try {
    response = await fetch(`${APP_CONFIG.API_BASE_URL}${path}`, opts);
  } catch (networkErr) {
    throw new Error("Could not reach the API server. Is the backend running on port 8000?");
  }

  if (response.status === 401) {
    Session.clear();
    window.location.href = "index.html?expired=1";
    throw new Error("Session expired");
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const message = (data && (data.detail || data.message)) || `Request failed (${response.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

const Api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: "POST", body }),
  put: (path, body) => apiRequest(path, { method: "PUT", body }),
  del: (path) => apiRequest(path, { method: "DELETE" }),
};

/* ---------------------------------------------------------------------
   Toasts
--------------------------------------------------------------------- */
function ensureToastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

const Toast = {
  show(message, type = "info") {
    const stack = ensureToastStack();
    const icon = type === "success" ? "bi-check-circle-fill" : type === "error" ? "bi-x-circle-fill" : "bi-info-circle-fill";
    const el = document.createElement("div");
    el.className = `toast-item ${type}`;
    el.innerHTML = `<i class="bi ${icon}"></i><div>${message}</div>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 250);
    }, 3800);
  },
  success(msg) { this.show(msg, "success"); },
  error(msg) { this.show(msg, "error"); },
};

/* ---------------------------------------------------------------------
   Confirmation dialog (Bootstrap modal, promise-based)
--------------------------------------------------------------------- */
function confirmDialog({ title = "Are you sure?", body = "", confirmText = "Confirm", danger = true }) {
  return new Promise((resolve) => {
    let modalEl = document.getElementById("confirmDialogModal");
    if (!modalEl) {
      modalEl = document.createElement("div");
      modalEl.id = "confirmDialogModal";
      modalEl.className = "modal fade";
      modalEl.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="confirmDialogTitle"></h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="confirmDialogBody"></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-ink" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn" id="confirmDialogBtn"></button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modalEl);
    }
    modalEl.querySelector("#confirmDialogTitle").textContent = title;
    modalEl.querySelector("#confirmDialogBody").textContent = body;
    const btn = modalEl.querySelector("#confirmDialogBtn");
    btn.textContent = confirmText;
    btn.className = `btn ${danger ? "btn-ink" : "btn-brass"}`;
    btn.style.background = danger ? "var(--danger)" : "";
    btn.style.borderColor = danger ? "var(--danger)" : "";

    const modal = new bootstrap.Modal(modalEl);
    const onConfirm = () => { cleanup(); modal.hide(); resolve(true); };
    const onHidden = () => { cleanup(); resolve(false); };
    function cleanup() {
      btn.removeEventListener("click", onConfirm);
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
    }
    btn.addEventListener("click", onConfirm);
    modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });
    modal.show();
  });
}

/* ---------------------------------------------------------------------
   Formatting helpers
--------------------------------------------------------------------- */
const fmt = {
  money(n) {
    const num = Number(n || 0);
    return `Rs. ${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  date(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  },
  initials(name) {
    if (!name) return "?";
    return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  },
  statusBadge(status) {
    const map = {
      active: "badge-teal", available: "badge-teal", returned: "badge-teal", paid: "badge-teal",
      issued: "badge-blue",
      overdue: "badge-danger", blocked: "badge-danger", discontinued: "badge-danger",
      inactive: "badge-muted", pending: "badge-amber", lost: "badge-danger",
    };
    const cls = map[status] || "badge-muted";
    return `<span class="badge-soft ${cls}">${status}</span>`;
  },
};

/* ---------------------------------------------------------------------
   Pagination control renderer
   onPageChange(page) is called when the user clicks a page button.
--------------------------------------------------------------------- */
function renderPagination(container, meta, onPageChange) {
  if (!meta || meta.total_rows === 0) {
    container.innerHTML = "";
    return;
  }
  const start = (meta.page - 1) * meta.page_size + 1;
  const end = Math.min(meta.page * meta.page_size, meta.total_rows);

  const prevDisabled = meta.page <= 1 ? "disabled" : "";
  const nextDisabled = meta.page >= meta.total_pages ? "disabled" : "";

  container.innerHTML = `
    <div>Showing <strong>${start}-${end}</strong> of <strong>${meta.total_rows}</strong></div>
    <div class="d-flex gap-2">
      <button class="btn btn-outline-ink" id="pgPrev" ${prevDisabled}><i class="bi bi-chevron-left"></i> Prev</button>
      <span class="d-flex align-items-center px-2">Page ${meta.page} of ${meta.total_pages}</span>
      <button class="btn btn-outline-ink" id="pgNext" ${nextDisabled}>Next <i class="bi bi-chevron-right"></i></button>
    </div>`;

  const prevBtn = container.querySelector("#pgPrev");
  const nextBtn = container.querySelector("#pgNext");
  if (prevBtn && !prevDisabled) prevBtn.addEventListener("click", () => onPageChange(meta.page - 1));
  if (nextBtn && !nextDisabled) nextBtn.addEventListener("click", () => onPageChange(meta.page + 1));
}

/** Simple debounce for search inputs. */
function debounce(fn, delay = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* ---------------------------------------------------------------------
   Sidebar: highlight active link + populate user info + logout
--------------------------------------------------------------------- */
function initShell() {
  const admin = Session.getAdmin();
  if (admin) {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = admin.full_name));
    document.querySelectorAll("[data-user-role]").forEach((el) => (el.textContent = admin.role.replace("_", " ")));
    document.querySelectorAll("[data-user-initials]").forEach((el) => (el.textContent = fmt.initials(admin.full_name)));
  }

  const current = document.body.dataset.page;
  document.querySelectorAll(".sidebar-nav .nav-link").forEach((link) => {
    if (link.dataset.page === current) link.classList.add("active");
  });

  document.querySelectorAll("[data-action='logout']").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      try { await Api.post("/auth/logout", {}); } catch { /* ignore */ }
      Session.clear();
      window.location.href = "index.html";
    });
  });

  const toggleBtn = document.querySelector("[data-action='toggle-sidebar']");
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector(".sidebar-backdrop");
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      backdrop?.classList.toggle("show");
    });
    backdrop?.addEventListener("click", () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
    });
  }

  // Late-return badge count in the topbar bell, best-effort.
  const bell = document.querySelector("[data-late-count]");
  if (bell) {
    Api.get("/dashboard/stats")
      .then((stats) => {
        if (stats.late_returns > 0) {
          bell.textContent = stats.late_returns > 9 ? "9+" : stats.late_returns;
          bell.style.display = "flex";
        }
      })
      .catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.requiresAuth !== "false") {
    Session.requireAuth();
  }
  initShell();
});
