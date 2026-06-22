ALTER TABLE `attendance`
ADD COLUMN `work_mode` ENUM('onsite','remote_work') NULL AFTER `status`;
