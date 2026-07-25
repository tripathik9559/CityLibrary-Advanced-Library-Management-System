-- =====================================================================
-- LIBRARY MANAGEMENT SYSTEM — TRIGGERS
-- File: 05_triggers.sql
-- Demonstrates: BEFORE/AFTER triggers, SIGNAL for validation errors,
--               automatic stock-count maintenance, audit trail.
-- =====================================================================
USE library_management_system;

DELIMITER $$

-- ---------------------------------------------------------------------
-- Guard: never let an issue be inserted for a book with no free copies
-- (defence in depth — sp_issue_book already checks this with a row
-- lock, but the trigger protects against any direct INSERT too).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_before_issue_insert$$
CREATE TRIGGER trg_before_issue_insert
BEFORE INSERT ON book_issues
FOR EACH ROW
BEGIN
    DECLARE v_available INT;
    SELECT available_copies INTO v_available FROM books WHERE book_id = NEW.book_id;

    IF v_available IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot issue: book does not exist.';
    ELSEIF v_available <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot issue: no copies available.';
    END IF;
END$$

-- ---------------------------------------------------------------------
-- After a new issue row lands, decrement the book's available_copies.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_after_issue_insert$$
CREATE TRIGGER trg_after_issue_insert
AFTER INSERT ON book_issues
FOR EACH ROW
BEGIN
    UPDATE books
        SET available_copies = available_copies - 1
        WHERE book_id = NEW.book_id;
END$$

-- ---------------------------------------------------------------------
-- When an issue flips from active to 'returned', restock the copy.
-- Guarded so it can only ever fire once per issue row.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_after_return_update$$
CREATE TRIGGER trg_after_return_update
AFTER UPDATE ON book_issues
FOR EACH ROW
BEGIN
    IF OLD.status <> 'returned' AND NEW.status = 'returned' THEN
        UPDATE books
            SET available_copies = available_copies + 1
            WHERE book_id = NEW.book_id;
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Nightly-eligible trigger substitute: whenever an issue row is
-- touched, auto-flip 'issued' -> 'overdue' once past due_date so
-- reports/views never need to recompute it (still deterministic —
-- vw_overdue_books also derives it live for rows not yet touched).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_before_issue_update_flag_overdue$$
CREATE TRIGGER trg_before_issue_update_flag_overdue
BEFORE UPDATE ON book_issues
FOR EACH ROW
BEGIN
    IF NEW.status = 'issued' AND NEW.return_date IS NULL AND NEW.due_date < CURDATE() THEN
        SET NEW.status = 'overdue';
    END IF;
END$$

-- ---------------------------------------------------------------------
-- Audit trail: books
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_books_update$$
CREATE TRIGGER trg_audit_books_update
AFTER UPDATE ON books
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('books', 'UPDATE', NEW.book_id,
        CONCAT('title=', NEW.title, ' | total_copies:', OLD.total_copies, '->', NEW.total_copies,
               ' | available_copies:', OLD.available_copies, '->', NEW.available_copies));
END$$

DROP TRIGGER IF EXISTS trg_audit_books_delete$$
CREATE TRIGGER trg_audit_books_delete
BEFORE DELETE ON books
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('books', 'DELETE', OLD.book_id, CONCAT('title=', OLD.title, ' | isbn=', OLD.isbn));
END$$

-- ---------------------------------------------------------------------
-- Audit trail: students
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_students_update$$
CREATE TRIGGER trg_audit_students_update
AFTER UPDATE ON students
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('students', 'UPDATE', NEW.student_id,
        CONCAT('status:', OLD.status, '->', NEW.status));
END$$

DROP TRIGGER IF EXISTS trg_audit_students_delete$$
CREATE TRIGGER trg_audit_students_delete
BEFORE DELETE ON students
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('students', 'DELETE', OLD.student_id, CONCAT('name=', OLD.full_name, ' | roll=', OLD.roll_number));
END$$

-- ---------------------------------------------------------------------
-- Audit trail: fine payments (financial actions are always logged)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_fine_payment$$
CREATE TRIGGER trg_audit_fine_payment
AFTER INSERT ON fine_payments
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, action, record_id, details)
    VALUES ('fine_payments', 'INSERT', NEW.payment_id,
        CONCAT('issue_id=', NEW.issue_id, ' | amount=', NEW.amount_paid));
END$$

DELIMITER ;
