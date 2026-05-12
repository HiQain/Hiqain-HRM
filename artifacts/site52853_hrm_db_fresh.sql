-- Fresh HRM database import
-- Import this file into a new empty MySQL/MariaDB database via phpMyAdmin.
-- Default admin login after import:
--   email: admin@hiqain.com
--   password: password

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `inventory_assignments`;
DROP TABLE IF EXISTS `inventory_requests`;
DROP TABLE IF EXISTS `inventory_items`;
DROP TABLE IF EXISTS `loan_installments`;
DROP TABLE IF EXISTS `loans`;
DROP TABLE IF EXISTS `news_posts`;
DROP TABLE IF EXISTS `salary_components`;
DROP TABLE IF EXISTS `remote_work_requests`;
DROP TABLE IF EXISTS `payslips`;
DROP TABLE IF EXISTS `leave_requests`;
DROP TABLE IF EXISTS `salary_events`;
DROP TABLE IF EXISTS `general_requests`;
DROP TABLE IF EXISTS `attendance`;
DROP TABLE IF EXISTS `designation_changes`;
DROP TABLE IF EXISTS `employees`;
DROP TABLE IF EXISTS `user_sessions`;
DROP TABLE IF EXISTS `app_settings`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `app_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_name` varchar(255) NOT NULL DEFAULT 'HiQain',
  `default_casual_leave_quota` int NOT NULL DEFAULT 6,
  `default_sick_leave_quota` int NOT NULL DEFAULT 6,
  `default_annual_leave_quota` int NOT NULL DEFAULT 12,
  `default_grace_period_minutes` int NOT NULL DEFAULT 15,
  `default_probation_months` int NOT NULL DEFAULT 3,
  `default_office_start_time` varchar(16) NOT NULL DEFAULT '09:00',
  `default_office_end_time` varchar(16) NOT NULL DEFAULT '18:00',
  `weekly_off_days` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `public_holidays` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `pro_rated_quotas` tinyint(1) NOT NULL DEFAULT 1,
  `weekly_hours` int NOT NULL DEFAULT 40,
  `monthly_hours` int NOT NULL DEFAULT 176,
  `attendance_policy` varchar(2048) NOT NULL DEFAULT '',
  `attendance_policy_file_url` varchar(1024) NOT NULL DEFAULT '',
  `attendance_policy_file_name` varchar(255) NOT NULL DEFAULT '',
  `basic_salary_percent` decimal(5,2) NOT NULL DEFAULT '50',
  `allowance_percent` decimal(5,2) NOT NULL DEFAULT '50',
  `provident_fund_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `default_provident_fund_percent` decimal(5,2) NOT NULL DEFAULT '5',
  `company_policy` varchar(2048) NOT NULL DEFAULT '',
  `company_policy_file_url` varchar(1024) NOT NULL DEFAULT '',
  `company_policy_file_name` varchar(255) NOT NULL DEFAULT '',
  `loan_min_tenure_months` int NOT NULL DEFAULT 12,
  `loan_max_salary_multiplier` decimal(5,2) NOT NULL DEFAULT '1',
  `loan_default_months` int NOT NULL DEFAULT 6,
  `late_grace_count` int NOT NULL DEFAULT 2,
  `late_deduction_fraction` decimal(4,2) NOT NULL DEFAULT '0.5',
  `late_absence_every` int NOT NULL DEFAULT 3,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
);

CREATE TABLE `users` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','hr','employee') NOT NULL DEFAULT 'employee',
  `must_change_password` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `users_id` PRIMARY KEY(`id`),
  CONSTRAINT `users_email_unique` UNIQUE(`email`)
);

CREATE TABLE `employees` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `personal_email` varchar(255),
  `phone` varchar(64),
  `position` varchar(255),
  `department` varchar(255),
  `position_type` enum('onsite','remote') NOT NULL DEFAULT 'onsite',
  `joining_date` date NOT NULL,
  `probation_months` int NOT NULL DEFAULT 3,
  `office_start_time` varchar(16) NOT NULL DEFAULT '09:00',
  `office_end_time` varchar(16) NOT NULL DEFAULT '18:00',
  `grace_period_minutes` int NOT NULL DEFAULT 15,
  `basic_salary` decimal(12,2) NOT NULL DEFAULT '0',
  `allowances` decimal(12,2) NOT NULL DEFAULT '0',
  `casual_leave_quota` int NOT NULL DEFAULT 10,
  `sick_leave_quota` int NOT NULL DEFAULT 10,
  `annual_leave_quota` int NOT NULL DEFAULT 14,
  `date_of_birth` date,
  `education` text,
  `address` text,
  `avatar_url` varchar(1024),
  `employee_code` varchar(64),
  `marital_status` text,
  `left_date` date,
  `emergency_contact_name` varchar(255),
  `emergency_contact_number` varchar(64),
  `emergency_contact_relation` text,
  `emergency_contact` varchar(255),
  `cnic` varchar(64),
  `last_qualification` varchar(255),
  `previous_company` varchar(255),
  `last_pay` decimal(12,2),
  `benefits` text,
  `notes` text,
  `immediate_family` text,
  `employment_contract_url` varchar(1024),
  `employment_contract_name` varchar(255),
  `cnic_document_url` varchar(1024),
  `cnic_document_name` varchar(255),
  `cnic_front_document_url` varchar(1024),
  `cnic_front_document_name` varchar(255),
  `cnic_back_document_url` varchar(1024),
  `cnic_back_document_name` varchar(255),
  `qualification_document_url` varchar(1024),
  `qualification_document_name` varchar(255),
  `last_payslip_one_url` varchar(1024),
  `last_payslip_one_name` varchar(255),
  `last_payslip_two_url` varchar(1024),
  `last_payslip_two_name` varchar(255),
  `last_payslip_three_url` varchar(1024),
  `last_payslip_three_name` varchar(255),
  `bank_account_title` varchar(255),
  `bank_account_number` varchar(255),
  `bank_name` varchar(255),
  `bank_iban` varchar(64),
  `bank_branch_code` varchar(64),
  `primary_bank_account_title` varchar(255),
  `primary_bank_account_number` varchar(255),
  `primary_bank_name` varchar(255),
  `primary_bank_iban` varchar(64),
  `primary_bank_branch_code` varchar(64),
  `secondary_bank_account_title` varchar(255),
  `secondary_bank_account_number` varchar(255),
  `secondary_bank_name` varchar(255),
  `secondary_bank_iban` varchar(64),
  `secondary_bank_branch_code` varchar(64),
  `provident_fund_percent` decimal(5,2) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `employees_id` PRIMARY KEY(`id`),
  CONSTRAINT `employees_user_id_unique` UNIQUE(`user_id`)
);

CREATE TABLE `attendance` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `date` date NOT NULL,
  `check_in_time` timestamp NULL DEFAULT NULL,
  `check_out_time` timestamp NULL DEFAULT NULL,
  `worked_minutes` int,
  `paused_at` timestamp NULL DEFAULT NULL,
  `paused_minutes` int NOT NULL DEFAULT 0,
  `status` enum('present','late','absent','on_leave','half_day','remote_work') NOT NULL DEFAULT 'present',
  `is_late` tinyint(1) NOT NULL DEFAULT 0,
  `excused` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
  CONSTRAINT `attendance_emp_date_unique` UNIQUE(`employee_id`,`date`)
);

CREATE TABLE `designation_changes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `from_title` varchar(255),
  `to_title` varchar(255) NOT NULL,
  `effective_date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `designation_changes_id` PRIMARY KEY(`id`)
);

CREATE TABLE `general_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `type` enum('half_day','loan','increment','remote_work','late','pf_withdrawal','resignation','other') NOT NULL,
  `date` date NOT NULL,
  `date_to` date,
  `amount` decimal(12,2),
  `reason` text NOT NULL,
  `attachment_url` varchar(1024),
  `attachment_name` varchar(255),
  `attachments` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `mentioned_employee_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `installment_months` int,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `general_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE `salary_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `type` enum('bonus','loan','increment','commission') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `amount_mode` enum('fixed','percentage') NOT NULL DEFAULT 'fixed',
  `percent_value` decimal(6,2),
  `date` date NOT NULL,
  `reason` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `salary_events_id` PRIMARY KEY(`id`)
);

CREATE TABLE `leave_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `type` enum('sick','casual','annual') NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `days` int NOT NULL,
  `reason` text NOT NULL,
  `attachment_url` varchar(1024),
  `attachment_name` varchar(255),
  `attachments` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `mentioned_employee_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `leave_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE `payslips` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `month` int NOT NULL,
  `year` int NOT NULL,
  `total_working_days` int NOT NULL,
  `present_days` int NOT NULL,
  `absent_days` int NOT NULL,
  `paid_leave_days` int NOT NULL DEFAULT 0,
  `unpaid_leave_days` int NOT NULL DEFAULT 0,
  `late_count` int NOT NULL DEFAULT 0,
  `late_absence_days` decimal(5,2) NOT NULL DEFAULT '0',
  `basic_salary` decimal(12,2) NOT NULL,
  `allowances` decimal(12,2) NOT NULL,
  `bonus` decimal(12,2) NOT NULL DEFAULT '0',
  `loan_deduction` decimal(12,2) NOT NULL DEFAULT '0',
  `other_deductions` decimal(12,2) NOT NULL DEFAULT '0',
  `net_salary` decimal(12,2) NOT NULL,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `payslips_id` PRIMARY KEY(`id`),
  CONSTRAINT `payslip_emp_month_unique` UNIQUE(`employee_id`,`month`,`year`)
);

CREATE TABLE `remote_work_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `date` date NOT NULL,
  `reason` text NOT NULL,
  `attachment_url` varchar(1024),
  `attachment_name` varchar(255),
  `attachments` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `mentioned_employee_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `remote_work_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE `salary_components` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `kind` enum('designation','commission','allowance','provident_fund','other') NOT NULL DEFAULT 'allowance',
  `value_type` enum('fixed','percentage') NOT NULL DEFAULT 'fixed',
  `percentage_base` enum('basic_salary','gross_salary') NOT NULL DEFAULT 'basic_salary',
  `value` decimal(12,2) NOT NULL DEFAULT '0',
  `is_deduction` int NOT NULL DEFAULT 0,
  `is_taxable` int NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `salary_components_id` PRIMARY KEY(`id`)
);

CREATE TABLE `news_posts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `author_id` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `attachment_url` varchar(1024),
  `attachment_name` varchar(255),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `news_posts_id` PRIMARY KEY(`id`)
);

CREATE TABLE `loans` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `request_id` int,
  `principal_amount` decimal(12,2) NOT NULL,
  `months_to_repay` int NOT NULL,
  `start_month` int NOT NULL,
  `start_year` int NOT NULL,
  `status` enum('active','closed','cancelled') NOT NULL DEFAULT 'active',
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` timestamp NULL DEFAULT NULL,
  CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);

CREATE TABLE `loan_installments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `loan_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `month` int NOT NULL,
  `year` int NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payslip_id` int,
  `paid_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `loan_installments_id` PRIMARY KEY(`id`)
);

CREATE TABLE `inventory_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` varchar(255) NOT NULL,
  `sku` varchar(128),
  `total_stock` int NOT NULL DEFAULT 0,
  `available_stock` int NOT NULL DEFAULT 0,
  `reorder_level` int NOT NULL DEFAULT 0,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE `inventory_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `item_id` int,
  `requested_item_name` text,
  `quantity` int NOT NULL DEFAULT 1,
  `reason` text,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `admin_notes` text,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by_user_id` int,
  CONSTRAINT `inventory_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE `inventory_assignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employee_id` int NOT NULL,
  `item_id` int NOT NULL,
  `request_id` int,
  `quantity` int NOT NULL DEFAULT 1,
  `notes` text,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `returned_at` timestamp NULL DEFAULT NULL,
  `assigned_by_user_id` int,
  CONSTRAINT `inventory_assignments_id` PRIMARY KEY(`id`)
);

CREATE TABLE `user_sessions` (
  `sid` varchar(191) NOT NULL,
  `sess` longtext NOT NULL,
  `expire` datetime NOT NULL,
  PRIMARY KEY (`sid`),
  KEY `user_sessions_expire_idx` (`expire`)
);

ALTER TABLE `attendance`
  ADD CONSTRAINT `attendance_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `designation_changes`
  ADD CONSTRAINT `designation_changes_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `employees`
  ADD CONSTRAINT `employees_user_id_users_id_fk`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `general_requests`
  ADD CONSTRAINT `general_requests_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `salary_events`
  ADD CONSTRAINT `salary_events_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `leave_requests`
  ADD CONSTRAINT `leave_requests_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `payslips`
  ADD CONSTRAINT `payslips_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `remote_work_requests`
  ADD CONSTRAINT `remote_work_requests_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `salary_components`
  ADD CONSTRAINT `salary_components_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `news_posts`
  ADD CONSTRAINT `news_posts_author_id_users_id_fk`
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `loan_installments`
  ADD CONSTRAINT `loan_installments_loan_id_loans_id_fk`
  FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON DELETE cascade ON UPDATE no action,
  ADD CONSTRAINT `loan_installments_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `loans`
  ADD CONSTRAINT `loans_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `inventory_assignments`
  ADD CONSTRAINT `inventory_assignments_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action,
  ADD CONSTRAINT `inventory_assignments_item_id_inventory_items_id_fk`
  FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE cascade ON UPDATE no action,
  ADD CONSTRAINT `inventory_assignments_request_id_inventory_requests_id_fk`
  FOREIGN KEY (`request_id`) REFERENCES `inventory_requests`(`id`) ON DELETE set null ON UPDATE no action,
  ADD CONSTRAINT `inventory_assignments_assigned_by_user_id_users_id_fk`
  FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

ALTER TABLE `inventory_requests`
  ADD CONSTRAINT `inventory_requests_employee_id_employees_id_fk`
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action,
  ADD CONSTRAINT `inventory_requests_item_id_inventory_items_id_fk`
  FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE cascade ON UPDATE no action,
  ADD CONSTRAINT `inventory_requests_reviewed_by_user_id_users_id_fk`
  FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;

INSERT INTO `app_settings` (
  `id`,
  `company_name`,
  `default_casual_leave_quota`,
  `default_sick_leave_quota`,
  `default_annual_leave_quota`,
  `default_grace_period_minutes`,
  `default_probation_months`,
  `default_office_start_time`,
  `default_office_end_time`,
  `weekly_off_days`,
  `public_holidays`,
  `pro_rated_quotas`,
  `weekly_hours`,
  `monthly_hours`,
  `attendance_policy`,
  `attendance_policy_file_url`,
  `attendance_policy_file_name`,
  `basic_salary_percent`,
  `allowance_percent`,
  `provident_fund_enabled`,
  `default_provident_fund_percent`,
  `company_policy`,
  `company_policy_file_url`,
  `company_policy_file_name`,
  `loan_min_tenure_months`,
  `loan_max_salary_multiplier`,
  `loan_default_months`,
  `late_grace_count`,
  `late_deduction_fraction`,
  `late_absence_every`,
  `updated_at`
) VALUES (
  1,
  'HiQain',
  6,
  6,
  12,
  15,
  3,
  '09:00',
  '18:00',
  '[0, 6]',
  '[{"date":"2026-01-01","name":"New Year''s Day","country":"us"},{"date":"2026-03-21","name":"Eid-ul-Fitr - Day 1 (subject to moon sighting)","country":"pk"},{"date":"2026-03-22","name":"Eid-ul-Fitr - Day 2 (subject to moon sighting)","country":"pk"},{"date":"2026-03-23","name":"Eid-ul-Fitr - Day 3 (subject to moon sighting)","country":"pk"},{"date":"2026-05-25","name":"Memorial Day","country":"us"},{"date":"2026-05-27","name":"Eid-ul-Adha - Day 1 (subject to moon sighting)","country":"pk"},{"date":"2026-05-28","name":"Eid-ul-Adha - Day 2 (subject to moon sighting)","country":"pk"},{"date":"2026-05-29","name":"Eid-ul-Adha - Day 3 (subject to moon sighting)","country":"pk"},{"date":"2026-06-24","name":"Muharram - 9th Muharram (subject to moon sighting)","country":"pk"},{"date":"2026-06-25","name":"Muharram - 10th Muharram (subject to moon sighting)","country":"pk"},{"date":"2026-07-03","name":"Independence Day","country":"us"},{"date":"2026-09-07","name":"Labor Day","country":"us"},{"date":"2026-11-26","name":"Thanksgiving Day","country":"us"},{"date":"2026-12-24","name":"Christmas Day","country":"us"},{"date":"2026-12-25","name":"Christmas Day","country":"us"},{"date":"2026-12-31","name":"New Year''s Eve","country":"us"}]',
  1,
  40,
  176,
  '',
  '',
  '',
  '50.00',
  '50.00',
  1,
  '5.00',
  '',
  '',
  '',
  12,
  '1.00',
  6,
  2,
  '0.50',
  3,
  '2026-05-08 14:23:57'
);

INSERT INTO `users` (
  `id`,
  `email`,
  `password_hash`,
  `role`,
  `must_change_password`,
  `created_at`
) VALUES (
  1,
  'admin@hiqain.com',
  '$2b$10$UmF2nU1cr92EIHHXo41zD.SveL9AdWGXNjkYG66eZWWYlAT3pkb0C',
  'admin',
  0,
  NOW()
);

COMMIT;
