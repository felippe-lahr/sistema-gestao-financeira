ALTER TABLE `bank_accounts` MODIFY COLUMN `entityId` int;--> statement-breakpoint
ALTER TABLE `categories` MODIFY COLUMN `entityId` int;--> statement-breakpoint
ALTER TABLE `payment_methods` MODIFY COLUMN `entityId` int;--> statement-breakpoint
ALTER TABLE `bank_accounts` ADD `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `userId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_methods` ADD `userId` int NOT NULL;