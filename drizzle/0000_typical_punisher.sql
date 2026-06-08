CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`assets` text DEFAULT '[]' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_generations_created_at` ON `generations` ("created_at" desc);