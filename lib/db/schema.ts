import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Provisional table that proves the ORM, migration, and driver wiring.
// Replace or extend it when server-side persistence is designed.
export const games = pgTable("games", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
