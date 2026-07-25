-- =====================================================================
-- LIBRARY MANAGEMENT SYSTEM — VIEWS
-- File: 02_views.sql
-- Demonstrates: INNER JOIN, LEFT JOIN, GROUP BY, HAVING, aggregate
--               functions, subqueries.
-- =====================================================================
USE library_management_system;

-- ---------------------------------------------------------------------
-- vw_book_catalog
-- Master catalog view joining books with category, publisher and a
-- comma-separated author list (subquery + GROUP_CONCAT).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_book_catalog AS
SELECT
    b.book_id,
    b.isbn,
    b.title,
    c.category_id,
    c.category_name,
    p.publisher_id,
    p.publisher_name,
    b.edition,
    b.publication_year,
    b.total_copies,
    b.available_copies,
    (b.total_copies - b.available_copies) AS copies_issued,
    b.shelf_location,
    b.price,
    b.status,
    (
        SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_name SEPARATOR ', ')
        FROM book_authors ba
        INNER JOIN authors a ON a.author_id = ba.author_id
        WHERE ba.book_id = b.book_id
    ) AS authors
FROM books b
INNER JOIN categories c  ON c.category_id  = b.category_id
INNER JOIN publishers p  ON p.publisher_id = b.publisher_id;

-- ---------------------------------------------------------------------
-- vw_available_books — books that currently have at least one free copy
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_available_books AS
SELECT *
FROM vw_book_catalog
WHERE available_copies > 0 AND status = 'active';

-- ---------------------------------------------------------------------
-- vw_currently_issued — all books out on loan right now, with borrower
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_currently_issued AS
SELECT
    bi.issue_id,
    b.book_id,
    b.title,
    b.isbn,
    s.student_id,
    s.roll_number,
    s.full_name       AS student_name,
    bi.issue_date,
    bi.due_date,
    DATEDIFF(CURDATE(), bi.due_date) AS days_overdue,
    bi.status
FROM book_issues bi
INNER JOIN books b     ON b.book_id    = bi.book_id
INNER JOIN students s  ON s.student_id = bi.student_id
WHERE bi.status IN ('issued', 'overdue');

-- ---------------------------------------------------------------------
-- vw_overdue_books — issued books past their due date and not returned
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_overdue_books AS
SELECT
    bi.issue_id,
    b.title,
    b.isbn,
    s.roll_number,
    s.full_name        AS student_name,
    s.phone,
    bi.issue_date,
    bi.due_date,
    DATEDIFF(CURDATE(), bi.due_date) AS days_overdue,
    fn_calculate_fine(bi.due_date, CURDATE()) AS estimated_fine
FROM book_issues bi
INNER JOIN books b     ON b.book_id    = bi.book_id
INNER JOIN students s  ON s.student_id = bi.student_id
WHERE bi.status IN ('issued','overdue')
  AND bi.due_date < CURDATE();

-- ---------------------------------------------------------------------
-- vw_most_borrowed_books — borrow frequency ranking (GROUP BY + HAVING)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_most_borrowed_books AS
SELECT
    b.book_id,
    b.title,
    b.isbn,
    c.category_name,
    COUNT(bi.issue_id)              AS times_borrowed,
    SUM(bi.status = 'issued')       AS currently_out,
    ROUND(AVG(DATEDIFF(COALESCE(bi.return_date, CURDATE()), bi.issue_date)), 1) AS avg_days_held
FROM books b
INNER JOIN categories c  ON c.category_id = b.category_id
LEFT JOIN book_issues bi ON bi.book_id = b.book_id
GROUP BY b.book_id, b.title, b.isbn, c.category_name
HAVING COUNT(bi.issue_id) > 0
ORDER BY times_borrowed DESC;

-- ---------------------------------------------------------------------
-- vw_student_borrow_history — every issue record per student
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_student_borrow_history AS
SELECT
    s.student_id,
    s.roll_number,
    s.full_name AS student_name,
    bi.issue_id,
    b.title,
    b.isbn,
    bi.issue_date,
    bi.due_date,
    bi.return_date,
    bi.status,
    bi.fine_amount,
    bi.fine_paid
FROM students s
INNER JOIN book_issues bi ON bi.student_id = s.student_id
INNER JOIN books b        ON b.book_id     = bi.book_id;

-- ---------------------------------------------------------------------
-- vw_student_summary — per-student rollup (RIGHT JOIN kept intentionally
-- so every student appears even with zero issues; aggregate + subquery)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_student_summary AS
SELECT
    s.student_id,
    s.roll_number,
    s.full_name,
    s.department,
    s.status,
    COUNT(bi.issue_id)                                       AS total_books_borrowed,
    SUM(bi.status IN ('issued','overdue'))                    AS books_currently_held,
    SUM(bi.status = 'overdue' OR (bi.status='issued' AND bi.due_date < CURDATE())) AS overdue_count,
    COALESCE(SUM(bi.fine_amount), 0)                          AS total_fine_charged,
    COALESCE(SUM(CASE WHEN bi.fine_paid = 1 THEN bi.fine_amount ELSE 0 END), 0) AS total_fine_paid
FROM students s
LEFT JOIN book_issues bi ON bi.student_id = s.student_id
GROUP BY s.student_id, s.roll_number, s.full_name, s.department, s.status;

-- ---------------------------------------------------------------------
-- vw_fine_report — one row per issue that ever incurred a fine
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_fine_report AS
SELECT
    bi.issue_id,
    s.roll_number,
    s.full_name        AS student_name,
    b.title,
    bi.due_date,
    bi.return_date,
    bi.fine_amount,
    COALESCE((SELECT SUM(fp.amount_paid) FROM fine_payments fp WHERE fp.issue_id = bi.issue_id), 0) AS amount_paid,
    bi.fine_amount - COALESCE((SELECT SUM(fp.amount_paid) FROM fine_payments fp WHERE fp.issue_id = bi.issue_id), 0) AS balance_due,
    bi.fine_paid
FROM book_issues bi
INNER JOIN students s ON s.student_id = bi.student_id
INNER JOIN books b    ON b.book_id    = bi.book_id
WHERE bi.fine_amount > 0;

-- ---------------------------------------------------------------------
-- vw_dashboard_stats — single-row KPI summary for the dashboard cards
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM books)                                          AS total_books,
    (SELECT COALESCE(SUM(available_copies),0) FROM books)                 AS available_books,
    (SELECT COALESCE(SUM(total_copies - available_copies),0) FROM books)  AS issued_books,
    (SELECT COUNT(*) FROM book_issues WHERE status = 'returned')          AS returned_books,
    (SELECT COUNT(*) FROM students WHERE status = 'active')               AS total_students,
    (SELECT COUNT(*) FROM book_issues
        WHERE status IN ('issued','overdue') AND due_date < CURDATE())    AS late_returns,
    (SELECT COALESCE(SUM(fine_amount),0) FROM book_issues WHERE fine_paid = 1) AS fine_collected,
    (SELECT COALESCE(SUM(fine_amount),0) FROM book_issues WHERE fine_paid = 0) AS fine_pending;
