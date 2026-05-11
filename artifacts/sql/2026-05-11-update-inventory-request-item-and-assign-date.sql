ALTER TABLE inventory_requests
  MODIFY COLUMN item_id INT NULL,
  ADD COLUMN requested_item_name TEXT NULL AFTER item_id;
