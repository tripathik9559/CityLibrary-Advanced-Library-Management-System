# SQL Design Walkthrough

A guided tour of the database layer — written so you can talk an
interviewer through *why*, not just *what*.

## 1. Normalization (3NF)

Every table stores facts about exactly one thing:

- `categories`, `publishers`, `authors` are separated out instead of being
  free-text columns on `books` — this kills update anomalies (renaming a
  publisher in one place) and lets you index/query them independently.
- `books` ↔ `authors` is genuinely many-to-many (a book can have multiple
  authors; an author writes multiple books), so it's modeled with a
  junction table, `book_authors(book_id, author_id)`, with a **composite
  primary key** instead of a surrogate one — the pair itself is the
  natural key, so there's no reason to invent another.
- `book_issues` is the transactional heart of the schema: it references
  `books`, `students`, and `admins` (twice — `issued_by` and
  `returned_to`), and nothing about a book or a student is duplicated
  onto it.
- `fine_payments` is split out from `book_issues` rather than adding a
  `paid_amount` column, because a fine can be paid in installments — one
  issue can have many payment rows. This is also what makes
  `vw_fine_report`'s balance calculation a genuine aggregate rather than
  a stored, driftable number.

## 2. Constraints doing real work

- `CHECK (available_copies >= 0 AND available_copies <= total_copies)` on
  `books` — the database itself refuses to let stock go negative or
  exceed the physical copy count, independent of whatever the app does.
- `CHECK (due_date >= issue_date)` on `book_issues` — can't insert a
  logically impossible loan.
- FKs are `ON DELETE RESTRICT` for `books`/`students` referenced from
  `book_issues` **on purpose** — you should never be able to silently
  delete a book or student that has loan history and orphan the report
  data. The API layer catches the resulting `IntegrityError` and does a
  soft delete (`status = 'discontinued' / 'inactive'`) instead.

## 3. Indexing choices

- `idx_issues_due_status ON book_issues(due_date, status)` is a composite
  index built specifically for the overdue-report query pattern
  (`WHERE status IN ('issued','overdue') AND due_date < CURDATE()`) — a
  single-column index on either field alone wouldn't serve that filter
  as well.
- `ft_books_title_search FULLTEXT INDEX` exists to show awareness of
  full-text search as an alternative to `LIKE '%...%'` for larger
  catalogs (the current `sp_search_books` procedure uses `LIKE` for
  simplicity/portability across MySQL and MariaDB, but the FULLTEXT
  index is there to point to as a scaling path).
- Every FK column has a supporting index (`idx_books_category`,
  `idx_issues_student`, etc.) — MySQL doesn't always auto-create these,
  and without them, joins and cascading deletes degrade to scans.

## 4. Transactions with real rollback paths

`sp_issue_book` (see `database/04_procedures.sql`) is the clearest
example: it takes a row lock (`SELECT ... FOR UPDATE`) on the book row,
checks availability, checks the student's status, checks the
max-books-per-student cap, and only then inserts — all inside one
`START TRANSACTION` with an `EXIT HANDLER FOR SQLEXCEPTION` that rolls
back and surfaces a clean message instead of a raw MySQL error. If two
librarians try to issue the last copy of the same book at the same
moment, the row lock means one of them gets a proper "no copies
available" response instead of both succeeding and driving
`available_copies` negative.

## 5. Triggers: validation vs. maintenance vs. audit

Three distinct jobs, kept in three distinct triggers rather than one
do-everything trigger:

- **Validation** (`trg_before_issue_insert`) — `SIGNAL SQLSTATE '45000'`
  rejects an insert outright if the book has no available copies. This
  exists as defense-in-depth even though `sp_issue_book` already checks
  this with a lock, in case something ever inserts into `book_issues`
  directly.
- **Maintenance** (`trg_after_issue_insert`, `trg_after_return_update`) —
  keeps `books.available_copies` in sync automatically, so it's derived
  state that can never be forgotten by whatever wrote the row.
- **Audit** (`trg_audit_books_update`, `trg_audit_students_delete`, etc.)
  — every meaningful change is written to `audit_log` with an
  old-value/new-value diff, independent of the application code path
  that triggered it.

## 6. Dynamic SQL, done safely

`sp_search_books` builds its `ORDER BY` clause dynamically (since MySQL
doesn't allow parameterizing an identifier), but the column name is
checked against a **whitelist** (`IF p_sort_column IN (...)`) before
being concatenated into the SQL string — every *value* (the search
keyword, category ID, limit, offset) is still passed through
`PREPARE`/`EXECUTE ... USING`, i.e. genuine bound parameters. This is the
standard safe pattern for "sort by a column the user picked" — validate
the identifier, parameterize the values.

## 7. Views as a documentation layer

Views like `vw_dashboard_stats`, `vw_overdue_books`, and
`vw_student_summary` aren't just query reuse — they're where the
business definitions live. "Overdue" is defined exactly once
(`status IN ('issued','overdue') AND due_date < CURDATE()`), and every
report or dashboard card that needs that concept reads from the view
instead of re-deriving the condition (and risking two slightly different
definitions of "late" existing in the codebase).
