CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `folders_parent_id_idx` ON `folders` (`parent_id`);--> statement-breakpoint
ALTER TABLE `links` ADD `folder_id` text REFERENCES `folders`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `links_folder_id_created_at_desc_slug_idx` ON `links` (`folder_id`,"created_at" desc,`slug`);