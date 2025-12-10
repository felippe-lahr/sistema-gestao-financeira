CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`blobUrl` text NOT NULL,
	`fileSize` int NOT NULL,
	`mimeType` varchar(127) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`color` varchar(7) DEFAULT '#6B7280',
	`icon` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`color` varchar(7) DEFAULT '#2563EB',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `entities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityId` int NOT NULL,
	`type` enum('INCOME','EXPENSE') NOT NULL,
	`description` text NOT NULL,
	`amount` int NOT NULL,
	`dueDate` timestamp NOT NULL,
	`paymentDate` timestamp,
	`status` enum('PENDING','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
	`categoryId` int,
	`isRecurring` boolean NOT NULL DEFAULT false,
	`recurrencePattern` text,
	`parentTransactionId` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`messageId` varchar(255) NOT NULL,
	`from` varchar(50) NOT NULL,
	`audioUrl` text,
	`transcription` text,
	`extractedData` text,
	`status` enum('RECEIVED','TRANSCRIBED','EXTRACTED','CONFIRMED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
	`transactionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_messages_messageId_unique` UNIQUE(`messageId`)
);
