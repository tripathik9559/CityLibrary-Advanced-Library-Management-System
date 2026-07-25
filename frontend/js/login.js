document.addEventListener("DOMContentLoaded", () => {
  // Already signed in? skip straight to the dashboard.
  if (Session.getToken()) {
    window.location.href = "dashboard.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const errorBox = document.getElementById("loginError");
  if (params.get("expired") === "1") {
    errorBox.textContent = "Your session expired. Please sign in again.";
    errorBox.style.display = "block";
  }

  const form = document.getElementById("loginForm");
  const btn = document.getElementById("loginBtn");
  const btnText = document.getElementById("loginBtnText");
  const spinner = document.getElementById("loginSpinner");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.style.display = "none";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      errorBox.textContent = "Please enter both username and password.";
      errorBox.style.display = "block";
      return;
    }

    btn.disabled = true;
    btnText.textContent = "Signing in…";
    spinner.classList.remove("d-none");

    try {
      const body = new URLSearchParams();
      body.set("username", username);
      body.set("password", password);
      const result = await apiRequest("/auth/login", { method: "POST", body, isForm: true });
      Session.save(result.access_token, result.admin);
      window.location.href = "dashboard.html";
    } catch (err) {
      errorBox.textContent = err.message || "Invalid username or password.";
      errorBox.style.display = "block";
      btn.disabled = false;
      btnText.textContent = "Sign In";
      spinner.classList.add("d-none");
    }
  });
});
