CREATE TABLE "server_metrics" (
	"server" text,
	"time" timestamp,
	"cpu" real NOT NULL,
	"cores" real NOT NULL,
	"memory" bigint NOT NULL,
	"disk" bigint NOT NULL,
	"disk_total" bigint NOT NULL,
	"network_in" real,
	"network_out" real,
	CONSTRAINT "server_metrics_pkey" PRIMARY KEY("server","time")
);
--> statement-breakpoint
CREATE TABLE "service_metrics" (
	"service_id" text,
	"time" timestamp,
	"cpu" real NOT NULL,
	"cores" real NOT NULL,
	"memory" bigint NOT NULL,
	"network_in" real,
	"network_out" real,
	CONSTRAINT "service_metrics_pkey" PRIMARY KEY("service_id","time")
);
--> statement-breakpoint
ALTER TABLE "service_metrics" ADD CONSTRAINT "service_metrics_service_id_services_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;