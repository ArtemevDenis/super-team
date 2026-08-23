CREATE TABLE `absences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`from_day` text NOT NULL,
	`to_day` text NOT NULL,
	`kind` text DEFAULT 'отпуск' NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `absences_person` ON `absences` (`person_id`,`from_day`);--> statement-breakpoint
CREATE TABLE `alert_mutes` (
	`alert_key` text PRIMARY KEY NOT NULL,
	`muted_until` text NOT NULL,
	`muted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assessments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	`value` integer NOT NULL,
	`confidence` text DEFAULT 'sure' NOT NULL,
	`evidence` text,
	`assessed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assessments_lookup` ON `assessments` (`person_id`,`attribute_id`,`assessed_at`);--> statement-breakpoint
CREATE TABLE `attributes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`short_code` text NOT NULL,
	`kind` text NOT NULL,
	`specialization_id` integer,
	`axis` text DEFAULT 'neutral' NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`specialization_id`) REFERENCES `specializations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attributes_key_unique` ON `attributes` (`key`);--> statement-breakpoint
CREATE INDEX `attributes_kind` ON `attributes` (`kind`,`specialization_id`);--> statement-breakpoint
CREATE TABLE `climate_checkins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`one_on_one_id` integer,
	`measured_at` text NOT NULL,
	`motivation` integer NOT NULL,
	`workload_pressure` integer NOT NULL,
	`satisfaction` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`one_on_one_id`) REFERENCES `one_on_ones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `climate_person` ON `climate_checkins` (`person_id`,`measured_at`);--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`one_on_one_id` integer,
	`direction` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`due_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` text,
	`snoozed_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`one_on_one_id`) REFERENCES `one_on_ones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `commitments_person` ON `commitments` (`person_id`,`status`);--> statement-breakpoint
CREATE INDEX `commitments_due` ON `commitments` (`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#64748b' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_name_unique` ON `departments` (`name`);--> statement-breakpoint
CREATE TABLE `development_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`started_at` text,
	`target_at` text,
	`status` text DEFAULT 'идёт' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goals_person` ON `development_goals` (`person_id`,`status`);--> statement-breakpoint
CREATE TABLE `grade_expectations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grade_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	`expected_value` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`grade_id`) REFERENCES `grades`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grade_expectations_pair` ON `grade_expectations` (`grade_id`,`attribute_id`);--> statement-breakpoint
CREATE TABLE `grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`level` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `grades_name_unique` ON `grades` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `grades_level_unique` ON `grades` (`level`);--> statement-breakpoint
CREATE TABLE `karma_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`one_on_one_id` integer,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`happened_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`one_on_one_id`) REFERENCES `one_on_ones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `karma_person` ON `karma_entries` (`person_id`,`happened_at`);--> statement-breakpoint
CREATE TABLE `knowledge_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`criticality` integer DEFAULT 2 NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_areas_name_unique` ON `knowledge_areas` (`name`);--> statement-breakpoint
CREATE TABLE `note_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`kind` text NOT NULL,
	`content` text,
	`value` text,
	`review_at` text,
	`confirmed_at` text,
	`is_sensitive` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `note_blocks_person_kind` ON `note_blocks` (`person_id`,`kind`);--> statement-breakpoint
CREATE TABLE `one_on_ones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`planned_at` text,
	`happened_at` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`agenda` text,
	`notes` text,
	`duration_minutes` integer,
	`is_sensitive` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `one_on_ones_person` ON `one_on_ones` (`person_id`,`happened_at`);--> statement-breakpoint
CREATE INDEX `one_on_ones_status` ON `one_on_ones` (`status`,`planned_at`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`specialization_id` integer,
	`grade_id` integer,
	`photo_path` text,
	`hired_at` text,
	`probation_ends_at` text,
	`birthday` text,
	`cadence_days` integer DEFAULT 14 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`left_at` text,
	`archived_at` text,
	`archive_reason` text,
	`last_quadrant` text,
	`last_quadrant_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`specialization_id`) REFERENCES `specializations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`grade_id`) REFERENCES `grades`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "people_archived_consistency" CHECK(("people"."status" = 'active' AND "people"."archived_at" IS NULL)
          OR ("people"."status" = 'archived' AND "people"."archived_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `people_status` ON `people` (`status`);--> statement-breakpoint
CREATE TABLE `person_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`kind` text NOT NULL,
	`at` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `person_events_person` ON `person_events` (`person_id`,`at`);--> statement-breakpoint
CREATE TABLE `person_knowledge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`area_id` integer NOT NULL,
	`level` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `knowledge_areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_knowledge_pair` ON `person_knowledge` (`person_id`,`area_id`);--> statement-breakpoint
CREATE TABLE `relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_person_id` integer NOT NULL,
	`to_person_id` integer NOT NULL,
	`kind` text NOT NULL,
	`strength` integer DEFAULT 3 NOT NULL,
	`note` text,
	`is_sensitive` integer DEFAULT false NOT NULL,
	`started_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`from_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "relations_no_self" CHECK("relations"."from_person_id" <> "relations"."to_person_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relations_unique` ON `relations` (`from_person_id`,`to_person_id`,`kind`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `specializations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`department_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `specializations_dept_name` ON `specializations` (`department_id`,`name`);