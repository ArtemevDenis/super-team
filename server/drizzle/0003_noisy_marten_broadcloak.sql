ALTER TABLE `people` ADD `kind` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `external_role` text;