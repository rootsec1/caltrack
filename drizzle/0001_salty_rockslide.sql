ALTER TABLE `product_cache` ADD `serving_quantity` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `serving_unit` text DEFAULT 'serving' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `calories` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `protein` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `carbs` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `fat` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `confidence` real;--> statement-breakpoint
ALTER TABLE `product_cache` ADD `assumptions` text;