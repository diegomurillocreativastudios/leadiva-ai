ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'USER';--> statement-breakpoint
UPDATE "users"
SET "role" = 'USER',
    "updated_at" = now()
WHERE "role" <> 'ADMIN';--> statement-breakpoint
UPDATE "users"
SET "role" = 'ADMIN',
    "updated_at" = now()
WHERE lower("email") = 'diego@creativastudios.us';
