ALTER TABLE employees
  ADD COLUMN wife_name TEXT NULL AFTER marital_status,
  ADD COLUMN wife_date_of_birth TEXT NULL AFTER wife_name,
  ADD COLUMN kids_count TEXT NULL AFTER wife_date_of_birth,
  ADD COLUMN kids_names TEXT NULL AFTER kids_count;
