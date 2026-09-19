import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { SharedGame } from "@/lib/sync/shared-game";

export const games = pgTable("games", {
  // Knowing the id is what grants access, so it must be unguessable.
  id: text("id").primaryKey(),
  // Incremented on every accepted save; stale writers are rejected.
  version: integer("version").notNull().default(1),
  // Lets a client safely retry a save whose response was lost.
  lastMutationId: text("last_mutation_id"),
  payload: jsonb("payload").$type<SharedGame>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
