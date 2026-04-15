import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import type { Problem } from "@/lib/sta/types";

export const problems = pgTable("problems", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  difficulty: text("difficulty").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  data: jsonb("data").$type<Problem>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id),
  commandLog: jsonb("command_log").$type<CommandLogEntry[]>().notNull().default([]),
  hintLevel: integer("hint_level").notNull().default(0),
  diagnosis: text("diagnosis"),
  chosenFix: text("chosen_fix"),
  score: integer("score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CommandLogEntry = {
  command: string;
  args: Record<string, unknown>;
  output: string;
  timestamp: number;
};
