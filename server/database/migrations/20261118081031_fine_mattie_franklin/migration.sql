CREATE TYPE "backup_provider" AS ENUM('s3');--> statement-breakpoint
CREATE TYPE "backup_schedule" AS ENUM('off', 'every_15_minutes', 'hourly', 'daily');--> statement-breakpoint
CREATE TYPE "backup_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "backup_trigger" AS ENUM('user', 'schedule');--> statement-breakpoint
CREATE TYPE "deployment_status" AS ENUM('queued', 'building', 'deploying', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "deployment_trigger" AS ENUM('user', 'hook', 'rollback');--> statement-breakpoint
CREATE TYPE "git_provider" AS ENUM('github', 'gitlab');--> statement-breakpoint
CREATE TYPE "service_type" AS ENUM('image', 'git', 'postgres', 'mysql');--> statement-breakpoint
CREATE TABLE "backup_destinations" (
	"id" text PRIMARY KEY,
	"provider" "backup_provider" NOT NULL,
	"name" text NOT NULL UNIQUE,
	"config" jsonb NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" text PRIMARY KEY,
	"service_id" text,
	"destination_id" text NOT NULL,
	"user_id" text,
	"trigger" "backup_trigger" NOT NULL,
	"status" "backup_status" DEFAULT 'running'::"backup_status" NOT NULL,
	"key" text NOT NULL,
	"size" bigint,
	"error" text,
	"finished_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY,
	"certificate" text NOT NULL,
	"private_key" text NOT NULL,
	"hostnames" text[] NOT NULL,
	"issuer" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_variables" (
	"id" text PRIMARY KEY,
	"deployment_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "deployment_variables_deployment_id_key_unique" UNIQUE("deployment_id","key")
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" text PRIMARY KEY,
	"service_id" text NOT NULL,
	"user_id" text,
	"after_deployment_id" text,
	"trigger" "deployment_trigger" NOT NULL,
	"status" "deployment_status" DEFAULT 'queued'::"deployment_status" NOT NULL,
	"commit_sha" text,
	"commit_message" text,
	"image" text,
	"image_digest" text,
	"port" integer,
	"health_check_path" text,
	"command" text,
	"logs" text,
	"build_logs" text,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY,
	"service_id" text NOT NULL,
	"hostname" text NOT NULL UNIQUE,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environment_variables" (
	"id" text PRIMARY KEY,
	"service_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "environment_variables_service_id_key_unique" UNIQUE("service_id","key")
);
--> statement-breakpoint
CREATE TABLE "git_connections" (
	"id" text PRIMARY KEY,
	"provider" "git_provider" NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"config" jsonb NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY,
	"inviter_id" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"role" text DEFAULT 'user' NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"namespace" text NOT NULL UNIQUE,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restores" (
	"id" text PRIMARY KEY,
	"service_id" text NOT NULL,
	"backup_id" text,
	"user_id" text,
	"status" "backup_status" DEFAULT 'running'::"backup_status" NOT NULL,
	"error" text,
	"finished_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"hostname" text NOT NULL,
	"type" "service_type" NOT NULL,
	"image" text,
	"repository" text,
	"git_connection_id" text,
	"branch" text,
	"root_directory" text,
	"dockerfile_path" text,
	"port" integer,
	"health_check_path" text,
	"start_timeout" integer DEFAULT 5 NOT NULL,
	"command" text,
	"instances" integer DEFAULT 1 NOT NULL,
	"database_name" text,
	"database_user" text,
	"database_password" text,
	"backup_destination_id" text,
	"backup_schedule" "backup_schedule" DEFAULT 'off'::"backup_schedule" NOT NULL,
	"backup_retention" integer DEFAULT 7 NOT NULL,
	"deploy_hook_token" text NOT NULL UNIQUE,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "services_project_id_hostname_unique" UNIQUE("project_id","hostname")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"backup_destination_id" text,
	"backup_schedule" "backup_schedule" DEFAULT 'off'::"backup_schedule" NOT NULL,
	"backup_retention" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" text PRIMARY KEY,
	"service_id" text NOT NULL,
	"mount_path" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "volumes_service_id_mount_path_unique" UNIQUE("service_id","mount_path")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_codes" (
	"id" text PRIMARY KEY,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "backups_service_id_idx" ON "backups" ("service_id");--> statement-breakpoint
CREATE INDEX "deployments_service_id_idx" ON "deployments" ("service_id");--> statement-breakpoint
CREATE INDEX "domains_service_id_idx" ON "domains" ("service_id");--> statement-breakpoint
CREATE INDEX "restores_service_id_idx" ON "restores" ("service_id");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deviceCodes_deviceCode_uidx" ON "device_codes" ("device_code");--> statement-breakpoint
CREATE UNIQUE INDEX "deviceCodes_userCode_uidx" ON "device_codes" ("user_code");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_destination_id_backup_destinations_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "backup_destinations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "deployment_variables" ADD CONSTRAINT "deployment_variables_deployment_id_deployments_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_after_deployment_id_deployments_id_fkey" FOREIGN KEY ("after_deployment_id") REFERENCES "deployments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "environment_variables" ADD CONSTRAINT "environment_variables_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_backup_id_backups_id_fkey" FOREIGN KEY ("backup_id") REFERENCES "backups"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "restores" ADD CONSTRAINT "restores_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_git_connection_id_git_connections_id_fkey" FOREIGN KEY ("git_connection_id") REFERENCES "git_connections"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_backup_destination_id_backup_destinations_id_fkey" FOREIGN KEY ("backup_destination_id") REFERENCES "backup_destinations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_backup_destination_id_backup_destinations_id_fkey" FOREIGN KEY ("backup_destination_id") REFERENCES "backup_destinations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;