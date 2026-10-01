CREATE TABLE `panel_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `panel_links_user_order` ON `panel_links` (`user_id`,`order_id`);