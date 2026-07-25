const BooksPage = {
  page: 1,
  pageSize: 10,
  query: "",
  categoryId: "",
  sortBy: "title",
  sortDir: "ASC",
  categories: [],
  publishers: [],
  authors: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadLookups();
  bindToolbar();
  bindModal();
  fetchBooks();
});

async function loadLookups() {
  try {
    const [categories, publishers, authors] = await Promise.all([
      Api.get("/lookups/categories"),
      Api.get("/lookups/publishers"),
      Api.get("/lookups/authors"),
    ]);
    BooksPage.categories = categories;
    BooksPage.publishers = publishers;
    BooksPage.authors = authors;

    const categoryFilter = document.getElementById("categoryFilter");
    categories.forEach((c) => {
      categoryFilter.insertAdjacentHTML("beforeend", `<option value="${c.category_id}">${c.category_name}</option>`);
    });
    refreshCategorySelect();
    refreshPublisherSelect();
    refreshAuthorSelect();
  } catch (err) {
    Toast.error("Could not load lookup data: " + err.message);
  }
}

function refreshCategorySelect() {
  const sel = document.getElementById("fCategory");
  sel.innerHTML = BooksPage.categories.map((c) => `<option value="${c.category_id}">${c.category_name}</option>`).join("");
}
function refreshPublisherSelect() {
  const sel = document.getElementById("fPublisher");
  sel.innerHTML = BooksPage.publishers.map((p) => `<option value="${p.publisher_id}">${p.publisher_name}</option>`).join("");
}
function refreshAuthorSelect() {
  const sel = document.getElementById("fAuthors");
  sel.innerHTML = BooksPage.authors.map((a) => `<option value="${a.author_id}">${a.author_name}</option>`).join("");
}

function bindToolbar() {
  document.getElementById("searchInput").addEventListener("input", debounce((e) => {
    BooksPage.query = e.target.value.trim();
    BooksPage.page = 1;
    fetchBooks();
  }));

  document.getElementById("categoryFilter").addEventListener("change", (e) => {
    BooksPage.categoryId = e.target.value;
    BooksPage.page = 1;
    fetchBooks();
  });

  document.getElementById("sortBy").addEventListener("change", (e) => {
    BooksPage.sortBy = e.target.value;
    fetchBooks();
  });

  document.getElementById("sortDirBtn").addEventListener("click", () => {
    BooksPage.sortDir = BooksPage.sortDir === "ASC" ? "DESC" : "ASC";
    const icon = document.getElementById("sortDirIcon");
    icon.className = BooksPage.sortDir === "ASC" ? "bi bi-sort-alpha-down" : "bi bi-sort-alpha-up";
    fetchBooks();
  });

  document.getElementById("pageSize").addEventListener("change", (e) => {
    BooksPage.pageSize = parseInt(e.target.value, 10);
    BooksPage.page = 1;
    fetchBooks();
  });

  document.getElementById("btnAddBook").addEventListener("click", () => openBookModal(null));
}

async function fetchBooks() {
  const tbody = document.getElementById("booksTableBody");
  tbody.innerHTML = `<tr class="skeleton-row"><td colspan="8"><div class="skeleton-bar"></div></td></tr>`;

  const params = new URLSearchParams({
    q: BooksPage.query,
    sort_by: BooksPage.sortBy,
    sort_dir: BooksPage.sortDir,
    page: BooksPage.page,
    page_size: BooksPage.pageSize,
  });
  if (BooksPage.categoryId) params.set("category_id", BooksPage.categoryId);

  try {
    const result = await Api.get(`/books?${params.toString()}`);
    renderBooks(result.data);
    renderPagination(document.getElementById("paginationBar"), result.meta, (p) => {
      BooksPage.page = p;
      fetchBooks();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Could not load books — ${err.message}</td></tr>`;
  }
}

function renderBooks(rows) {
  const tbody = document.getElementById("booksTableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="bi bi-journal-x"></i>No books match your search.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((b) => `
    <tr>
      <td>
        <div class="cell-title">${b.title}</div>
        <div class="cell-muted">${b.authors || "Unknown author"}</div>
      </td>
      <td class="mono cell-muted">${b.isbn}</td>
      <td>${b.category_name}</td>
      <td class="cell-muted">${b.publisher_name}</td>
      <td>${b.available_copies} / ${b.total_copies}</td>
      <td class="mono">${fmt.money(b.price)}</td>
      <td>${fmt.statusBadge(b.available_copies > 0 ? "available" : "issued")}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" title="Edit" onclick="editBook(${b.book_id})"><i class="bi bi-pencil"></i></button>
          <button class="icon-btn danger" title="Delete" onclick="deleteBook(${b.book_id}, '${b.title.replace(/'/g, "\\'")}')"><i class="bi bi-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

/* ---------------------------------------------------------------------
   Add / Edit modal
--------------------------------------------------------------------- */
let bookModalInstance;
function bindModal() {
  bookModalInstance = new bootstrap.Modal(document.getElementById("bookModal"));

  document.getElementById("bookForm").addEventListener("submit", saveBook);

  document.getElementById("btnNewCategory").addEventListener("click", async () => {
    const name = prompt("New category name:");
    if (!name) return;
    try {
      const created = await Api.post("/lookups/categories", { name });
      BooksPage.categories.push(created);
      refreshCategorySelect();
      document.getElementById("fCategory").value = created.category_id;
      Toast.success("Category added.");
    } catch (err) { Toast.error(err.message); }
  });

  document.getElementById("btnNewPublisher").addEventListener("click", async () => {
    const name = prompt("New publisher name:");
    if (!name) return;
    try {
      const created = await Api.post("/lookups/publishers", { name });
      BooksPage.publishers.push(created);
      refreshPublisherSelect();
      document.getElementById("fPublisher").value = created.publisher_id;
      Toast.success("Publisher added.");
    } catch (err) { Toast.error(err.message); }
  });

  document.getElementById("btnNewAuthor").addEventListener("click", async () => {
    const input = document.getElementById("newAuthorName");
    const name = input.value.trim();
    if (!name) return;
    try {
      const created = await Api.post("/lookups/authors", { name });
      BooksPage.authors.push(created);
      refreshAuthorSelect();
      input.value = "";
      const sel = document.getElementById("fAuthors");
      Array.from(sel.options).find((o) => o.value == created.author_id).selected = true;
      Toast.success("Author added.");
    } catch (err) { Toast.error(err.message); }
  });
}

function openBookModal(book) {
  document.getElementById("bookForm").reset();
  refreshCategorySelect();
  refreshPublisherSelect();
  refreshAuthorSelect();
  document.getElementById("bookId").value = book ? book.book_id : "";
  document.getElementById("bookModalTitle").textContent = book ? "Edit Book" : "Add Book";

  if (book) {
    document.getElementById("fTitle").value = book.title;
    document.getElementById("fIsbn").value = book.isbn;
    document.getElementById("fIsbn").disabled = true;
    document.getElementById("fCategory").value = book.category_id;
    document.getElementById("fPublisher").value = book.publisher_id;
    document.getElementById("fEdition").value = book.edition || "";
    document.getElementById("fYear").value = book.publication_year || "";
    document.getElementById("fCopies").value = book.total_copies;
    document.getElementById("fPrice").value = book.price;
    document.getElementById("fShelf").value = book.shelf_location || "";
  } else {
    document.getElementById("fIsbn").disabled = false;
  }
  bookModalInstance.show();
}

async function editBook(bookId) {
  try {
    const book = await Api.get(`/books/${bookId}`);
    openBookModal(book);
  } catch (err) {
    Toast.error(err.message);
  }
}

async function saveBook(e) {
  e.preventDefault();
  const bookId = document.getElementById("bookId").value;
  const authorIds = Array.from(document.getElementById("fAuthors").selectedOptions).map((o) => parseInt(o.value, 10));

  if (authorIds.length === 0) {
    Toast.error("Select at least one author.");
    return;
  }

  const payload = {
    title: document.getElementById("fTitle").value.trim(),
    category_id: parseInt(document.getElementById("fCategory").value, 10),
    publisher_id: parseInt(document.getElementById("fPublisher").value, 10),
    edition: document.getElementById("fEdition").value.trim() || null,
    publication_year: document.getElementById("fYear").value ? parseInt(document.getElementById("fYear").value, 10) : null,
    total_copies: parseInt(document.getElementById("fCopies").value, 10),
    price: parseFloat(document.getElementById("fPrice").value),
    shelf_location: document.getElementById("fShelf").value.trim() || null,
    author_ids: authorIds,
  };

  const saveBtn = document.getElementById("bookSaveBtn");
  saveBtn.disabled = true;

  try {
    if (bookId) {
      await Api.put(`/books/${bookId}`, payload);
      Toast.success("Book updated successfully.");
    } else {
      payload.isbn = document.getElementById("fIsbn").value.trim();
      await Api.post("/books", payload);
      Toast.success("Book added successfully.");
    }
    bookModalInstance.hide();
    fetchBooks();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteBook(bookId, title) {
  const confirmed = await confirmDialog({
    title: "Delete this book?",
    body: `"${title}" will be permanently removed if it has no loan history, or marked as discontinued if it does.`,
    confirmText: "Delete",
  });
  if (!confirmed) return;
  try {
    const result = await Api.del(`/books/${bookId}`);
    Toast.success(result.message);
    fetchBooks();
  } catch (err) {
    Toast.error(err.message);
  }
}
