CREATE TABLE IF NOT EXISTS `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
DROP INDEX `departments_name_unique`;--> statement-breakpoint
ALTER TABLE `departments` ADD `team_id` integer REFERENCES teams(id);--> statement-breakpoint
UPDATE `departments` SET `team_id` = 1 WHERE `team_id` IS NULL;--> statement-breakpoint
DROP INDEX `grades_name_unique`;--> statement-breakpoint
DROP INDEX `grades_level_unique`;--> statement-breakpoint
ALTER TABLE `grades` ADD `team_id` integer REFERENCES teams(id);--> statement-breakpoint
UPDATE `grades` SET `team_id` = 1 WHERE `team_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `grades_team_level` ON `grades` (`team_id`,`level`);--> statement-breakpoint
DROP INDEX `karma_categories_name_unique`;--> statement-breakpoint
ALTER TABLE `karma_categories` ADD `team_id` integer REFERENCES teams(id);--> statement-breakpoint
UPDATE `karma_categories` SET `team_id` = 1 WHERE `team_id` IS NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`team_id` integer DEFAULT 0 NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`team_id`, `key`)
);
--> statement-breakpoint
-- В старой таблице колонки team_id не было: всё, что там лежало, —
-- общие настройки приложения, то есть область 0.
INSERT INTO `__new_settings`("team_id", "key", "value", "created_at", "updated_at") SELECT 0, "key", "value", "created_at", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `attributes` ADD `team_id` integer REFERENCES teams(id);--> statement-breakpoint
UPDATE `attributes` SET `team_id` = 1 WHERE `team_id` IS NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `team_id` integer REFERENCES teams(id);--> statement-breakpoint
UPDATE `people` SET `team_id` = 1 WHERE `team_id` IS NULL;