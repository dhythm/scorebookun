ALTER TYPE "public"."base_running_type" ADD VALUE 'otherAdvance';--> statement-breakpoint
ALTER TYPE "public"."base_running_type" ADD VALUE 'otherOut';--> statement-breakpoint
ALTER TYPE "public"."event_kind" ADD VALUE 'positionChange';--> statement-breakpoint
ALTER TYPE "public"."event_kind" ADD VALUE 'runnerPlacement';--> statement-breakpoint
CREATE TABLE "event_position_changes" (
	"game_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"player_id" text NOT NULL,
	"position" "fielding_position" NOT NULL,
	CONSTRAINT "event_position_changes_game_id_event_id_sequence_pk" PRIMARY KEY("game_id","event_id","sequence")
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "substitution_position" "fielding_position";--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "position_change_side" "team_side";--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "placed_first_id" text;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "placed_second_id" text;--> statement-breakpoint
ALTER TABLE "game_events" ADD COLUMN "placed_third_id" text;--> statement-breakpoint
ALTER TABLE "event_position_changes" ADD CONSTRAINT "event_position_changes_event" FOREIGN KEY ("game_id","event_id") REFERENCES "public"."game_events"("game_id","id") ON DELETE cascade ON UPDATE no action;