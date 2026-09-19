CREATE TYPE "public"."at_bat_result" AS ENUM('single', 'double', 'triple', 'homerun', 'groundOut', 'flyOut', 'strikeout', 'strikeoutSwinging', 'strikeoutLooking', 'doublePlay', 'otherOut', 'walk', 'hitByPitch', 'error', 'sacrifice', 'sacrificeFly', 'fieldersChoice', 'interference', 'uncaughtThirdStrike');--> statement-breakpoint
CREATE TYPE "public"."base_running_type" AS ENUM('steal', 'caughtStealing', 'wildPitch', 'passedBall', 'pickOff', 'balk', 'otherAdvance', 'otherOut');--> statement-breakpoint
CREATE TYPE "public"."batted_ball_depth" AS ENUM('shallow', 'deep');--> statement-breakpoint
CREATE TYPE "public"."batted_ball_type" AS ENUM('ground', 'fly', 'liner', 'bunt');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('atBat', 'baseRunning', 'substitution', 'gameControl', 'note', 'positionChange', 'runnerPlacement');--> statement-breakpoint
CREATE TYPE "public"."event_state" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."fielding_position" AS ENUM('pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right', 'dh');--> statement-breakpoint
CREATE TYPE "public"."game_control_action" AS ENUM('endGame');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('setup', 'live', 'finished');--> statement-breakpoint
CREATE TYPE "public"."out_type" AS ENUM('force', 'tag');--> statement-breakpoint
CREATE TYPE "public"."roster_role" AS ENUM('lineup', 'bench');--> statement-breakpoint
CREATE TYPE "public"."runner_destination" AS ENUM('first', 'second', 'third', 'home', 'out');--> statement-breakpoint
CREATE TYPE "public"."runner_origin" AS ENUM('batter', 'first', 'second', 'third');--> statement-breakpoint
CREATE TYPE "public"."substitution_role" AS ENUM('pinchHitter', 'pinchRunner', 'fielder', 'pitcher');--> statement-breakpoint
CREATE TYPE "public"."team_side" AS ENUM('away', 'home');--> statement-breakpoint
CREATE TABLE "event_position_changes" (
	"game_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"player_id" text NOT NULL,
	"position" "fielding_position" NOT NULL,
	CONSTRAINT "event_position_changes_game_id_event_id_sequence_pk" PRIMARY KEY("game_id","event_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "event_runner_movements" (
	"game_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"player_id" text NOT NULL,
	"origin" "runner_origin" NOT NULL,
	"destination" "runner_destination" NOT NULL,
	"is_rbi" boolean NOT NULL,
	"play_order" integer,
	"out_type" "out_type",
	CONSTRAINT "event_runner_movements_game_id_event_id_sequence_pk" PRIMARY KEY("game_id","event_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"game_id" text NOT NULL,
	"id" text NOT NULL,
	"state" "event_state" NOT NULL,
	"sequence" integer NOT NULL,
	"restore_index" integer,
	"kind" "event_kind" NOT NULL,
	"batter_id" text,
	"at_bat_result" "at_bat_result",
	"batted_ball_position" "fielding_position",
	"batted_ball_type" "batted_ball_type",
	"batted_ball_depth" "batted_ball_depth",
	"fielding_sequence" "fielding_position"[],
	"at_bat_note" text,
	"base_running_type" "base_running_type",
	"rbi_credit_batter_id" text,
	"substitution_side" "team_side",
	"in_player_id" text,
	"out_player_id" text,
	"substitution_role" "substitution_role",
	"substitution_position" "fielding_position",
	"position_change_side" "team_side",
	"placed_first_id" text,
	"placed_second_id" text,
	"placed_third_id" text,
	"control_action" "game_control_action",
	"control_reason" text,
	"note_text" text,
	CONSTRAINT "game_events_game_id_id_pk" PRIMARY KEY("game_id","id"),
	CONSTRAINT "game_events_list_position" UNIQUE("game_id","state","sequence"),
	CONSTRAINT "game_events_restore_index_matches_state" CHECK (("game_events"."state" = 'deleted') = ("game_events"."restore_index" is not null)),
	CONSTRAINT "game_events_batted_ball_is_complete" CHECK (("game_events"."batted_ball_position" is null) = ("game_events"."batted_ball_type" is null) and ("game_events"."batted_ball_depth" is null or "game_events"."batted_ball_type" is not null)),
	CONSTRAINT "game_events_kind_has_required_columns" CHECK (case "game_events"."kind"
        when 'atBat' then "game_events"."batter_id" is not null and "game_events"."at_bat_result" is not null
        when 'baseRunning' then "game_events"."base_running_type" is not null
        when 'substitution' then "game_events"."substitution_side" is not null and "game_events"."in_player_id" is not null and "game_events"."out_player_id" is not null and "game_events"."substitution_role" is not null
        when 'positionChange' then "game_events"."position_change_side" is not null
        when 'runnerPlacement' then true
        when 'gameControl' then "game_events"."control_action" is not null
        when 'note' then "game_events"."note_text" is not null
      end)
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"game_id" text NOT NULL,
	"id" text NOT NULL,
	"side" "team_side" NOT NULL,
	"roster_role" "roster_role" NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"batting_order" integer NOT NULL,
	"position" "fielding_position",
	CONSTRAINT "game_players_game_id_id_pk" PRIMARY KEY("game_id","id"),
	CONSTRAINT "game_players_list_position" UNIQUE("game_id","side","roster_role","sequence")
);
--> statement-breakpoint
CREATE TABLE "game_teams" (
	"game_id" text NOT NULL,
	"side" "team_side" NOT NULL,
	"name" text NOT NULL,
	"starting_pitcher_id" text,
	"starting_pitcher_name" text,
	CONSTRAINT "game_teams_game_id_side_pk" PRIMARY KEY("game_id","side")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_mutation_id" text,
	"status" "game_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"regulation_innings" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_regulation_innings_range" CHECK ("games"."regulation_innings" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "event_position_changes" ADD CONSTRAINT "event_position_changes_event" FOREIGN KEY ("game_id","event_id") REFERENCES "public"."game_events"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_runner_movements" ADD CONSTRAINT "event_runner_movements_event" FOREIGN KEY ("game_id","event_id") REFERENCES "public"."game_events"("game_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_teams" ADD CONSTRAINT "game_teams_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;