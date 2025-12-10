CREATE TABLE `bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`bank` varchar(255),
	`accountNumber` varchar(50),
	`balance` int NOT NULL DEFAULT 0,
	`color` varchar(7) DEFAULT '#6B7280',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('CREDIT_CARD','DEBIT_CARD','PIX','CASH','BANK_TRANSFER','OTHER') NOT NULL,
	`color` varchar(7) DEFAULT '#6B7280',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `bankAccountId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `paymentMethodId` int;