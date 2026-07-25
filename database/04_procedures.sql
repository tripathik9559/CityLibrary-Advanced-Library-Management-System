-- =====================================================================
-- LIBRARY MANAGEMENT SYSTEM — STORED PROCEDURES
-- File: 04_procedures.sql
-- Demonstrates: transactions (COMMIT/ROLLBACK), error handlers,
--               dynamic SQL (PREPARE/EXECUTE) for search + pagination,
--               data validation with SIGNAL.
-- =====================================================================
USE library_management_system;

DELIMITER $$

-- ---------------------------------------------------------------------
-- sp_issue_book
-- Validates business rules then issues a book to a student inside a
-- single transaction. The actual copy-count decrement is delegated to
-- trg_after_issue_insert (05_triggers.sql) so the invariant
-- "available_copies == total_copies - active_issues" always holds,
-- however the row got inserted.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_issue_book$$
CREATE PROCEDURE sp_issue_book(
    IN  p_book_id       INT,
    IN  p_student_id    INT,
    IN  p_issue_days    INT,          -- loan period in days
    IN  p_admin_id      INT,
    OUT p_issue_id      INT,
    OUT p_message       VARCHAR(255)
)
proc_body: BEGIN
    DECLARE v_available   INT DEFAULT 0;
    DECLARE v_student_status VARCHAR(20);
    DECLARE v_active_loans INT DEFAULT 0;
    DECLARE v_max_books    INT DEFAULT 3;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_issue_id = NULL;
        GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    END;

    START TRANSACTION;

    SELECT available_copies INTO v_available
        FROM books WHERE book_id = p_book_id FOR UPDATE;

    IF v_available IS NULL THEN
        SET p_message = 'Book not found.';
        SET p_issue_id = NULL;
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    IF v_available <= 0 THEN
        SET p_message = 'No copies available for this book.';
        SET p_issue_id = NULL;
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    SELECT status INTO v_student_status FROM students WHERE student_id = p_student_id;

    IF v_student_status IS NULL THEN
        SET p_message = 'Student not found.';
        SET p_issue_id = NULL;
        ROLLBACK;
        LEAVE proc_body;
    ELSEIF v_student_status <> 'active' THEN
        SET p_message = CONCAT('Student membership is ', v_student_status, '.');
        SET p_issue_id = NULL;
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    SELECT CAST(setting_value AS UNSIGNED) INTO v_max_books
        FROM settings WHERE setting_key = 'max_books_per_student' LIMIT 1;

    SET v_active_loans = fn_active_issue_count(p_student_id);

    IF v_active_loans >= v_max_books THEN
        SET p_message = CONCAT('Student already holds the maximum of ', v_max_books, ' books.');
        SET p_issue_id = NULL;
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    INSERT INTO book_issues (book_id, student_id, issue_date, due_date, issued_by, status)
    VALUES (p_book_id, p_student_id, CURDATE(), DATE_ADD(CURDATE(), INTERVAL p_issue_days DAY), p_admin_id, 'issued');

    SET p_issue_id = LAST_INSERT_ID();
    SET p_message = 'Book issued successfully.';

    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- sp_return_book
-- Marks a book returned, computes the late fine via fn_calculate_fine,
-- and lets trg_after_return_update restock the copy automatically.
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_return_book$$
CREATE PROCEDURE sp_return_book(
    IN  p_issue_id      INT,
    IN  p_admin_id      INT,
    OUT p_fine_amount   DECIMAL(8,2),
    OUT p_message       VARCHAR(255)
)
proc_body: BEGIN
    DECLARE v_due_date DATE;
    DECLARE v_status   VARCHAR(20);
    DECLARE v_fine      DECIMAL(8,2) DEFAULT 0.00;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_fine_amount = NULL;
        GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    END;

    START TRANSACTION;

    SELECT due_date, status INTO v_due_date, v_status
        FROM book_issues WHERE issue_id = p_issue_id FOR UPDATE;

    IF v_due_date IS NULL THEN
        SET p_message = 'Issue record not found.';
        SET p_fine_amount = NULL;
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    IF v_status = 'returned' THEN
        SET p_message = 'This book has already been returned.';
        SET p_fine_amount = NULL;
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    SET v_fine = fn_calculate_fine(v_due_date, CURDATE());

    UPDATE book_issues
        SET return_date = CURDATE(),
            fine_amount = v_fine,
            fine_paid   = IF(v_fine = 0, 1, 0),
            status      = 'returned',
            returned_to = p_admin_id
        WHERE issue_id = p_issue_id;

    SET p_fine_amount = v_fine;
    SET p_message = IF(v_fine > 0,
        CONCAT('Book returned. Late fine of Rs. ', v_fine, ' applied.'),
        'Book returned on time. No fine.');

    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- sp_pay_fine — records a (possibly partial) fine payment
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_pay_fine$$
CREATE PROCEDURE sp_pay_fine(
    IN  p_issue_id    INT,
    IN  p_amount      DECIMAL(8,2),
    IN  p_admin_id    INT,
    OUT p_message     VARCHAR(255)
)
proc_body: BEGIN
    DECLARE v_fine_amount DECIMAL(8,2);
    DECLARE v_already_paid DECIMAL(8,2);
    DECLARE v_balance DECIMAL(8,2);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1 p_message = MESSAGE_TEXT;
    END;

    START TRANSACTION;

    SELECT fine_amount INTO v_fine_amount FROM book_issues WHERE issue_id = p_issue_id FOR UPDATE;

    IF v_fine_amount IS NULL THEN
        SET p_message = 'Issue record not found.';
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    SELECT COALESCE(SUM(amount_paid), 0) INTO v_already_paid
        FROM fine_payments WHERE issue_id = p_issue_id;

    SET v_balance = v_fine_amount - v_already_paid;

    IF p_amount <= 0 THEN
        SET p_message = 'Payment amount must be positive.';
        ROLLBACK;
        LEAVE proc_body;
    ELSEIF p_amount > v_balance THEN
        SET p_message = CONCAT('Payment exceeds outstanding balance of Rs. ', v_balance);
        ROLLBACK;
        LEAVE proc_body;
    END IF;

    INSERT INTO fine_payments (issue_id, amount_paid, collected_by)
        VALUES (p_issue_id, p_amount, p_admin_id);

    IF (v_already_paid + p_amount) >= v_fine_amount THEN
        UPDATE book_issues SET fine_paid = 1 WHERE issue_id = p_issue_id;
    END IF;

    SET p_message = 'Payment recorded successfully.';
    COMMIT;
END$$

-- ---------------------------------------------------------------------
-- sp_search_books
-- Dynamic-SQL powered search + filter + pagination + sorting in one
-- call. Built with PREPARE/EXECUTE so the ORDER BY column is validated
-- against a whitelist (prevents SQL injection via identifier) while
-- all *values* are still bound as parameters (true prepared statement).
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_search_books$$
CREATE PROCEDURE sp_search_books(
    IN p_keyword      VARCHAR(200),
    IN p_category_id  INT,
    IN p_sort_column  VARCHAR(30),   -- title | price | publication_year | available_copies
    IN p_sort_dir     VARCHAR(4),    -- ASC | DESC
    IN p_limit        INT,
    IN p_offset       INT
)
BEGIN
    DECLARE v_sort_column VARCHAR(30) DEFAULT 'title';
    DECLARE v_sort_dir    VARCHAR(4)  DEFAULT 'ASC';

    IF p_sort_column IN ('title','price','publication_year','available_copies') THEN
        SET v_sort_column = p_sort_column;
    END IF;
    IF UPPER(p_sort_dir) = 'DESC' THEN
        SET v_sort_dir = 'DESC';
    ELSE
        SET v_sort_dir = 'ASC';
    END IF;

    SET @kw       = CONCAT('%', IFNULL(p_keyword, ''), '%');
    SET @cat_id   = p_category_id;
    SET @lim      = IFNULL(p_limit, 10);
    SET @off      = IFNULL(p_offset, 0);

    SET @sql = CONCAT(
        'SELECT SQL_CALC_FOUND_ROWS book_id, isbn, title, category_name, publisher_name, ',
        'authors, total_copies, available_copies, price, status ',
        'FROM vw_book_catalog ',
        'WHERE (title LIKE ? OR isbn LIKE ? OR authors LIKE ?) ',
        'AND (? IS NULL OR category_id = ?) ',
        'ORDER BY ', v_sort_column, ' ', v_sort_dir, ' ',
        'LIMIT ? OFFSET ?'
    );

    PREPARE stmt FROM @sql;
    SET @cat_id_check = @cat_id;
    EXECUTE stmt USING @kw, @kw, @kw, @cat_id_check, @cat_id, @lim, @off;
    DEALLOCATE PREPARE stmt;

    SELECT FOUND_ROWS() AS total_matching_rows;
END$$

DELIMITER ;
