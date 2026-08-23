CREATE TABLE `issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`one_on_one_id` integer,
	`description` text NOT NULL,
	`happened_at` text NOT NULL,
	`discussed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`one_on_one_id`) REFERENCES `one_on_ones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `issue_person` ON `issues` (`person_id`,`happened_at`);