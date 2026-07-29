import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  externalUrl: text("external_url").notNull().default(""),
  spotifyPlaylistId: text("spotify_playlist_id").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  spotifyTrackId: text("spotify_track_id").notNull().default(""),
  uri: text("uri").notNull().default(""),
  name: text("name").notNull(),
  artists: text("artists").notNull().default(""),
  album: text("album").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
  position: integer("position").notNull(),
  category: text("category", {
    enum: ["classic", "keep", "marginal", "gone"],
  }),
  sortedBy: text("sorted_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
