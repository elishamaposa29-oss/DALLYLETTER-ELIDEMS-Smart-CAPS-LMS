import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const breakElidemEventsTable = pgTable("break_elide_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: text("event_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  meetLink: text("meet_link"),
  status: text("status").notNull().default("scheduled"),
  tempBenefitsConfig: text("temp_benefits_config"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const breakElidemVolunteersTable = pgTable("break_elide_volunteers", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => breakElidemEventsTable.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(),
  details: text("details"),
  isSelected: boolean("is_selected").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BreakElidemEvent = typeof breakElidemEventsTable.$inferSelect;
export type BreakElidemVolunteer = typeof breakElidemVolunteersTable.$inferSelect;
