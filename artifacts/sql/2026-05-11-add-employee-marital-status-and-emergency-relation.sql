ALTER TABLE employees
  ADD COLUMN marital_status TEXT NULL AFTER employee_code,
  ADD COLUMN emergency_contact_relation TEXT NULL AFTER emergency_contact_number;
