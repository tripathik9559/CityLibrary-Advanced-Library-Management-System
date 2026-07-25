-- =====================================================================
-- LIBRARY MANAGEMENT SYSTEM — FUNCTIONS
-- File: 02_functions.sql
-- =====================================================================
USE library_management_system;

DELIMITER $$

-- ---------------------------------------------------------------------
-- fn_calculate_fine
-- Late fine = (days late) * (fine_per_day from settings), capped at
-- max_fine_per_book. Returns 0.00 if not late. Pure/deterministic.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_calculate_fine$$
CREATE FUNCTION fn_calculate_fine(
    p_due_date DATE,
    p_return_date DATE
) RETURNS DECIMAL(8,2)
    DETERMINISTIC
    READS SQL DATA
BEGIN
    DECLARE v_days_late INT DEFAULT 0;
    DECLARE v_fine_per_day DECIMAL(8,2) DEFAULT 5.00;
    DECLARE v_max_fine DECIMAL(8,2) DEFAULT 500.00;
    DECLARE v_fine DECIMAL(8,2) DEFAULT 0.00;

    IF p_return_date IS NULL OR p_due_date IS NULL THEN
        RETURN 0.00;
    END IF;

    SET v_days_late = DATEDIFF(p_return_date, p_due_date);

    SELECT CAST(setting_value AS DECIMAL(8,2)) INTO v_fine_per_day
        FROM settings WHERE setting_key = 'fine_per_day' LIMIT 1;
    SELECT CAST(setting_value AS DECIMAL(8,2)) INTO v_max_fine
        FROM settings WHERE setting_key = 'max_fine_per_book' LIMIT 1;

    IF v_days_late <= 0 THEN
        RETURN 0.00;
    END IF;

    SET v_fine = v_days_late * v_fine_per_day;

    IF v_fine > v_max_fine THEN
        SET v_fine = v_max_fine;
    END IF;

    RETURN v_fine;
END$$

-- ---------------------------------------------------------------------
-- fn_active_issue_count — how many books a student currently holds
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_active_issue_count$$
CREATE FUNCTION fn_active_issue_count(p_student_id INT)
RETURNS INT
    READS SQL DATA
BEGIN
    DECLARE v_count INT DEFAULT 0;
    SELECT COUNT(*) INTO v_count
        FROM book_issues
        WHERE student_id = p_student_id AND status IN ('issued','overdue');
    RETURN v_count;
END$$

-- ---------------------------------------------------------------------
-- fn_is_book_available — TRUE if a book has at least one free copy
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_is_book_available$$
CREATE FUNCTION fn_is_book_available(p_book_id INT)
RETURNS TINYINT(1)
    READS SQL DATA
BEGIN
    DECLARE v_available INT DEFAULT 0;
    SELECT available_copies INTO v_available FROM books WHERE book_id = p_book_id;
    RETURN IFNULL(v_available, 0) > 0;
END$$

DELIMITER ;
