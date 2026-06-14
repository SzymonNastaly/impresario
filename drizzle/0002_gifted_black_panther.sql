CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_created_at` ON `conversations` ("created_at" desc);--> statement-breakpoint
ALTER TABLE `generations` ADD `conversation_id` text REFERENCES conversations(id);--> statement-breakpoint
ALTER TABLE `generations` ADD `attachments` text DEFAULT '[]' NOT NULL;