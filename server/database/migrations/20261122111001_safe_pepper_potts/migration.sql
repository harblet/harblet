ALTER TYPE "deployment_trigger" ADD VALUE 'push' BEFORE 'rollback';--> statement-breakpoint
ALTER TABLE "git_connections" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "auto_deploy" boolean DEFAULT true NOT NULL;