import { env } from "cloudflare:workers";

export type Category = "classic" | "keep" | "marginal" | "gone";

export const categories = new Set<Category>(["classic", "keep", "marginal", "gone"]);

export function slugify(value: string, fallback = "friday-sort") {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

export function getD1() {
  if (!env.DB) throw new Error("Database is not configured yet.");
  return env.DB;
}

export async function ensureSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS rooms (id text PRIMARY KEY NOT NULL, name text NOT NULL, description text DEFAULT '' NOT NULL, image_url text DEFAULT '' NOT NULL, external_url text DEFAULT '' NOT NULL, spotify_playlist_id text DEFAULT '' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)"
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS tracks (id text PRIMARY KEY NOT NULL, room_id text NOT NULL, spotify_track_id text DEFAULT '' NOT NULL, uri text DEFAULT '' NOT NULL, name text NOT NULL, artists text DEFAULT '' NOT NULL, album text DEFAULT '' NOT NULL, image_url text DEFAULT '' NOT NULL, duration_ms integer DEFAULT 0 NOT NULL, position integer NOT NULL, category text, sorted_by text DEFAULT '' NOT NULL, created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL, FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE cascade)"
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS tracks_room_position_idx ON tracks (room_id, position)"),
    db.prepare("CREATE INDEX IF NOT EXISTS tracks_room_category_idx ON tracks (room_id, category)"),
  ]);
}

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return Response.json({ error: message }, { status });
}

export function parsePlaylistId(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    if (playlistIndex >= 0 && parts[playlistIndex + 1]) return parts[playlistIndex + 1];
  } catch {
    // Plain playlist IDs are accepted below.
  }

  return /^[a-zA-Z0-9]{12,}$/.test(trimmed) ? trimmed : "";
}
