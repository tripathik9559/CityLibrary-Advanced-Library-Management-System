-- =====================================================================
-- LIBRARY MANAGEMENT SYSTEM — DATABASE SCHEMA
-- =====================================================================
-- Engine   : MySQL 8.0+ / MariaDB 10.6+
-- Design   : Third Normal Form (3NF)
-- Author   : Kartikey Tripathi
-- File     : 01_schema.sql
--
-- Load order for the full database/ folder:
--   01_schema.sql      -> tables, keys, constraints, indexes
--   02_views.sql        -> reporting views
--   03_functions.sql    -> reusable scalar functions
--   04_procedures.sql   -> stored procedures (transactional business logic)
--   05_triggers.sql     -> data-integrity + audit triggers
--   06_seed_data.sql    -> sample dataset
-- =====================================================================

-- NOTE: the database itself and the library_admin user are created by
-- 00_create_database_and_user.sql, which must be run first (as root).
-- Run this file, and every file after it, connected AS library_admin —
-- see the note at the top of that script for why this matters.
USE library_management_system;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. SYSTEM SETTINGS  (drives fn_calculate_fine / issue-limit logic)
-- ---------------------------------------------------------------------
CREATE TABLE settings (
    setting_key     VARCHAR(50)     NOT NULL PRIMARY KEY,
    setting_value   VARCHAR(255)    NOT NULL,
    description     VARCHAR(255)    NULL,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. ADMINS  (Authentication)
-- ---------------------------------------------------------------------
CREATE TABLE admins (
    admin_id        INT             NOT NULL AUTO_INCREMENT,
    username        VARCHAR(50)     NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,          -- bcrypt hash, never plaintext
    full_name       VARCHAR(100)    NOT NULL,
    email           VARCHAR(120)    NOT NULL,
    role            ENUM('super_admin','librarian') NOT NULL DEFAULT 'librarian',
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    last_login      DATETIME        NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (admin_id),
    UNIQUE KEY uk_admins_username (username),
    UNIQUE KEY uk_admins_email (email)
) ENGINE=InnoDB;

-- Session table backs JWT bearer tokens so sessions can be audited / revoked
-- server-side instead of being purely stateless.
CREATE TABLE admin_sessions (
    session_id      CHAR(36)        NOT NULL,           -- UUID
    admin_id        INT             NOT NULL,
    token_hash      CHAR(64)        NOT NULL,           -- SHA-256 of the issued JWT
    ip_address      VARCHAR(45)     NULL,
    user_agent      VARCHAR(255)    NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NOT NULL,
    is_active       TINYINT(1)      NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id),
    KEY idx_sessions_admin (admin_id),
    KEY idx_sessions_token (token_hash),
    CONSTRAINT fk_session_admin FOREIGN KEY (admin_id)
        REFERENCES admins(admin_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. CATEGORIES / PUBLISHERS / AUTHORS  (lookup entities — 3NF)
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    category_id     INT             NOT NULL AUTO_INCREMENT,
    category_name   VARCHAR(80)     NOT NULL,
    description     VARCHAR(255)    NULL,
    PRIMARY KEY (category_id),
    UNIQUE KEY uk_category_name (category_name)
) ENGINE=InnoDB;

CREATE TABLE publishers (
    publisher_id    INT             NOT NULL AUTO_INCREMENT,
    publisher_name  VARCHAR(120)    NOT NULL,
    address         VARCHAR(255)    NULL,
    contact_email   VARCHAR(120)    NULL,
    phone           VARCHAR(20)     NULL,
    PRIMARY KEY (publisher_id),
    UNIQUE KEY uk_publisher_name (publisher_name)
) ENGINE=InnoDB;

CREATE TABLE authors (
    author_id       INT             NOT NULL AUTO_INCREMENT,
    author_name     VARCHAR(120)    NOT NULL,
    nationality     VARCHAR(60)     NULL,
    PRIMARY KEY (author_id),
    UNIQUE KEY uk_author_name (author_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. BOOKS
-- ---------------------------------------------------------------------
CREATE TABLE books (
    book_id             INT             NOT NULL AUTO_INCREMENT,
    isbn                VARCHAR(20)     NOT NULL,
    title               VARCHAR(200)    NOT NULL,
    category_id         INT             NOT NULL,
    publisher_id        INT             NOT NULL,
    edition             VARCHAR(30)     NULL,
    publication_year    YEAR            NULL,
    total_copies        INT             NOT NULL DEFAULT 1,
    available_copies    INT             NOT NULL DEFAULT 1,
    shelf_location      VARCHAR(30)     NULL,
    price               DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    status              ENUM('active','discontinued') NOT NULL DEFAULT 'active',
    added_on            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id),
    UNIQUE KEY uk_books_isbn (isbn),
    CONSTRAINT fk_books_category FOREIGN KEY (category_id)
        REFERENCES categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_books_publisher FOREIGN KEY (publisher_id)
        REFERENCES publishers(publisher_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_books_copies CHECK (available_copies >= 0 AND available_copies <= total_copies),
    CONSTRAINT chk_books_total CHECK (total_copies >= 0),
    CONSTRAINT chk_books_price CHECK (price >= 0)
) ENGINE=InnoDB;

-- Many-to-many: a book can have multiple authors, an author can have multiple books
CREATE TABLE book_authors (
    book_id         INT             NOT NULL,
    author_id       INT             NOT NULL,
    PRIMARY KEY (book_id, author_id),
    CONSTRAINT fk_ba_book FOREIGN KEY (book_id)
        REFERENCES books(book_id) ON DELETE CASCADE,
    CONSTRAINT fk_ba_author FOREIGN KEY (author_id)
        REFERENCES authors(author_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Search / filter / sort performance indexes
CREATE INDEX idx_books_title       ON books(title);
CREATE INDEX idx_books_category    ON books(category_id);
CREATE INDEX idx_books_publisher   ON books(publisher_id);
CREATE INDEX idx_books_status      ON books(status);
CREATE FULLTEXT INDEX ft_books_title_search ON books(title);

-- ---------------------------------------------------------------------
-- 5. STUDENTS
-- ---------------------------------------------------------------------
CREATE TABLE students (
    student_id      INT             NOT NULL AUTO_INCREMENT,
    roll_number     VARCHAR(30)     NOT NULL,
    full_name       VARCHAR(100)    NOT NULL,
    email           VARCHAR(120)    NOT NULL,
    phone           VARCHAR(15)     NOT NULL,
    department      VARCHAR(80)     NULL,
    semester        TINYINT         NULL,
    address         VARCHAR(255)    NULL,
    membership_date DATE            NOT NULL DEFAULT (CURRENT_DATE),
    status          ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id),
    UNIQUE KEY uk_students_roll (roll_number),
    UNIQUE KEY uk_students_email (email),
    UNIQUE KEY uk_students_phone (phone),
    CONSTRAINT chk_students_semester CHECK (semester BETWEEN 1 AND 12)
) ENGINE=InnoDB;

CREATE INDEX idx_students_name   ON students(full_name);
CREATE INDEX idx_students_dept   ON students(department);
CREATE INDEX idx_students_status ON students(status);

-- ---------------------------------------------------------------------
-- 6. BOOK ISSUES  (the transactional heart of the system)
-- ---------------------------------------------------------------------
CREATE TABLE book_issues (
    issue_id        INT             NOT NULL AUTO_INCREMENT,
    book_id         INT             NOT NULL,
    student_id      INT             NOT NULL,
    issue_date      DATE            NOT NULL DEFAULT (CURRENT_DATE),
    due_date        DATE            NOT NULL,
    return_date     DATE            NULL,
    fine_amount     DECIMAL(8,2)    NOT NULL DEFAULT 0.00,
    fine_paid       TINYINT(1)      NOT NULL DEFAULT 0,
    status          ENUM('issued','returned','overdue','lost') NOT NULL DEFAULT 'issued',
    issued_by       INT             NULL,
    returned_to     INT             NULL,
    remarks         VARCHAR(255)    NULL,
    PRIMARY KEY (issue_id),
    CONSTRAINT fk_issue_book FOREIGN KEY (book_id)
        REFERENCES books(book_id) ON DELETE RESTRICT,
    CONSTRAINT fk_issue_student FOREIGN KEY (student_id)
        REFERENCES students(student_id) ON DELETE RESTRICT,
    CONSTRAINT fk_issue_admin FOREIGN KEY (issued_by)
        REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT fk_return_admin FOREIGN KEY (returned_to)
        REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT chk_issue_dates CHECK (due_date >= issue_date),
    CONSTRAINT chk_fine_amount CHECK (fine_amount >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_issues_book        ON book_issues(book_id);
CREATE INDEX idx_issues_student     ON book_issues(student_id);
CREATE INDEX idx_issues_status      ON book_issues(status);
CREATE INDEX idx_issues_due_status  ON book_issues(due_date, status);   -- overdue-report composite index
CREATE INDEX idx_issues_issue_date  ON book_issues(issue_date);

-- ---------------------------------------------------------------------
-- 7. FINE PAYMENTS  (supports partial payments + a clean fine report)
-- ---------------------------------------------------------------------
CREATE TABLE fine_payments (
    payment_id      INT             NOT NULL AUTO_INCREMENT,
    issue_id        INT             NOT NULL,
    amount_paid     DECIMAL(8,2)    NOT NULL,
    payment_date    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    collected_by    INT             NULL,
    PRIMARY KEY (payment_id),
    CONSTRAINT fk_payment_issue FOREIGN KEY (issue_id)
        REFERENCES book_issues(issue_id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_admin FOREIGN KEY (collected_by)
        REFERENCES admins(admin_id) ON DELETE SET NULL,
    CONSTRAINT chk_payment_amount CHECK (amount_paid > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_payments_issue ON fine_payments(issue_id);

-- ---------------------------------------------------------------------
-- 8. AUDIT LOG  (populated by triggers — demonstrates traceability)
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    log_id          BIGINT          NOT NULL AUTO_INCREMENT,
    table_name      VARCHAR(50)     NOT NULL,
    action          ENUM('INSERT','UPDATE','DELETE') NOT NULL,
    record_id       INT             NOT NULL,
    changed_by      VARCHAR(100)    NULL,
    details         VARCHAR(500)    NULL,
    changed_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    KEY idx_audit_table_record (table_name, record_id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
