CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`data` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`ref` text NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_ref_unique` ON `ledger` (`ref`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`invoice` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`total` integer NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`snapshot` text NOT NULL,
	`data` text NOT NULL,
	`payment` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`server_id` integer,
	`panel_user` integer,
	`secret` text,
	`expires` integer,
	`created` integer NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_invoice_unique` ON `orders` (`invoice`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_user_key` ON `orders` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `orders_user_created` ON `orders` (`user_id`,`created`);--> statement-breakpoint
CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`spec` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`provider` text,
	`details` text,
	`checked` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_unique` ON `payments` (`provider`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`order_id` text,
	`data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`role` text DEFAULT 'buyer' NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `voucher_uses` (
	`order_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vouchers` (
	`code` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`max` integer NOT NULL,
	`min` integer NOT NULL,
	`kind` text NOT NULL,
	`expires` integer NOT NULL,
	`quota` integer NOT NULL,
	`per_user` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER ledger_guard BEFORE INSERT ON ledger BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id) THEN RAISE(ABORT,'pengguna tidak ada') END;
 SELECT CASE WHEN (SELECT balance FROM users WHERE id=NEW.user_id)+NEW.amount<0 THEN RAISE(ABORT,'saldo tidak cukup') END;
 SELECT CASE WHEN NEW.ref LIKE 'refund:%' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=substr(NEW.ref,8) AND status IN ('failed','approval','ready') AND payment='paid' AND server_id IS NULL) THEN RAISE(ABORT,'refund tidak diizinkan') END;
END;
--> statement-breakpoint
CREATE TRIGGER ledger_apply AFTER INSERT ON ledger BEGIN
 UPDATE users SET balance=balance+NEW.amount WHERE id=NEW.user_id;
END;
--> statement-breakpoint
CREATE UNIQUE INDEX payment_order_unique ON payments(order_id) WHERE order_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER payment_settle AFTER UPDATE OF status ON payments WHEN NEW.status='paid' AND OLD.status='pending' BEGIN
 INSERT INTO ledger(id,user_id,amount,ref,reason,created) SELECT NEW.id,NEW.user_id,NEW.amount,'deposit:'||NEW.id,'Deposit QRIS',NEW.created WHERE NEW.order_id IS NULL;
 UPDATE orders SET payment='paid',status='settled' WHERE id=NEW.order_id AND payment='pending';
END;
--> statement-breakpoint
CREATE TRIGGER voucher_limit BEFORE INSERT ON voucher_uses BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM voucher_uses WHERE code=NEW.code)>=(SELECT quota FROM vouchers WHERE code=NEW.code) OR (SELECT COUNT(*) FROM voucher_uses WHERE code=NEW.code AND user_id=NEW.user_id)>=(SELECT per_user FROM vouchers WHERE code=NEW.code) THEN RAISE(ABORT,'voucher habis') END;
END;
--> statement-breakpoint
CREATE TRIGGER reseller_limit BEFORE INSERT ON orders WHEN NEW.key LIKE 'reseller-%' BEGIN
 SELECT CASE WHEN (SELECT role FROM users WHERE id=NEW.user_id)!='web_admin' AND (SELECT COUNT(*) FROM orders WHERE user_id=NEW.user_id AND key LIKE 'reseller-%' AND json_extract(snapshot,'$.access')=json_extract(NEW.snapshot,'$.access'))>=json_extract(NEW.snapshot,'$.spec.quota') THEN RAISE(ABORT,'kuota reseller habis') END;
END;
