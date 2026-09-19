ALTER TABLE "games" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "last_mutation_id" text;