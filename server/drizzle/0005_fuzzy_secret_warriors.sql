CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`active_team_id` integer,
	`presentation_mode` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
--> Колонка добавляется допускающей NULL, хотя в схеме она notNull.
--> Две причины: SQLite вообще отказывается добавлять NOT NULL-колонку со
--> ссылкой и без значения по умолчанию, и на момент миграции ни одного
--> пользователя ещё нет — владельца существующим командам взять неоткуда.
--> Их забирает первый аккаунт, заведённый через `npm run user:add`.
ALTER TABLE `teams` ADD `owner_id` integer REFERENCES users(id);