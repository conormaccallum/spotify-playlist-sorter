export type Category = "classic" | "keep" | "marginal" | "gone";

export type StoredRoom = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  externalUrl: string;
  spotifyPlaylistId: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredTrack = {
  id: string;
  spotifyTrackId: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  imageUrl: string;
  durationMs: number;
  position: number;
  category: Category | null;
  sortedBy: string;
  createdAt: string;
  updatedAt: string;
};

export const categories = new Set<Category>(["classic", "keep", "marginal", "gone"]);

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
}

function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
}

export function hasRedis() {
  return Boolean(redisUrl() && redisToken());
}

export function requireRedis() {
  if (!hasRedis()) {
    throw new Error(
      "Shared storage is not configured. In Vercel, add a Redis/KV store and expose KV_REST_API_URL and KV_REST_API_TOKEN."
    );
  }
}

async function redisCommand<T>(command: unknown[]) {
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) {
    throw new Error(
      "Shared storage is not configured. In Vercel, add a Redis/KV store and expose KV_REST_API_URL and KV_REST_API_TOKEN."
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Storage request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as { result?: T; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result as T;
}

const roomKey = (roomId: string) => `room:${roomId}`;
const tracksKey = (roomId: string) => `tracks:${roomId}`;

export function slugify(value: string, fallback = "friday-sort") {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function getRoom(roomId: string) {
  const raw = await redisCommand<string | null>(["GET", roomKey(roomId)]);
  return raw ? (JSON.parse(raw) as StoredRoom) : null;
}

export async function getTracks(roomId: string) {
  const raw = await redisCommand<string | null>(["GET", tracksKey(roomId)]);
  const tracks = raw ? (JSON.parse(raw) as StoredTrack[]) : [];
  return tracks.sort((a, b) => a.position - b.position);
}

export async function saveRoomWithTracks(room: StoredRoom, incomingTracks: StoredTrack[]) {
  const existingTracks = await getTracks(room.id);
  const existingById = new Map(existingTracks.map((track) => [track.id, track]));
  const nextTracks = incomingTracks.map((track) => ({
    ...track,
    category: existingById.get(track.id)?.category ?? track.category,
    sortedBy: existingById.get(track.id)?.sortedBy ?? track.sortedBy,
    createdAt: existingById.get(track.id)?.createdAt ?? track.createdAt,
    updatedAt: existingById.get(track.id)?.updatedAt ?? track.updatedAt,
  }));

  await Promise.all([
    redisCommand(["SET", roomKey(room.id), JSON.stringify(room)]),
    redisCommand(["SET", tracksKey(room.id), JSON.stringify(nextTracks)]),
  ]);
}

export async function updateTrackCategory(
  roomId: string,
  trackId: string,
  category: Category | null,
  sortedBy: string
) {
  const [room, tracks] = await Promise.all([getRoom(roomId), getTracks(roomId)]);
  if (!room) throw new Error("Room was not found.");

  const timestamp = nowIso();
  let found = false;
  const nextTracks = tracks.map((track) => {
    if (track.id !== trackId) return track;
    found = true;
    return { ...track, category, sortedBy, updatedAt: timestamp };
  });

  if (!found) throw new Error("Track was not found.");

  await Promise.all([
    redisCommand(["SET", tracksKey(roomId), JSON.stringify(nextTracks)]),
    redisCommand(["SET", roomKey(roomId), JSON.stringify({ ...room, updatedAt: timestamp })]),
  ]);

  return nextTracks.find((track) => track.id === trackId)!;
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
