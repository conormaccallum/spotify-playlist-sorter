CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`external_url` text DEFAULT '' NOT NULL,
	`spotify_playlist_id` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`spotify_track_id` text DEFAULT '' NOT NULL,
	`uri` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`artists` text DEFAULT '' NOT NULL,
	`album` text DEFAULT '' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`position` integer NOT NULL,
	`category` text,
	`sorted_by` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
