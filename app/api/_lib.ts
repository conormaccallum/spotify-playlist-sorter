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

type SupabaseRoomRow = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  external_url: string;
  spotify_playlist_id: string;
  created_at: string;
  updated_at: string;
};

type SupabaseTrackRow = {
  id: string;
  room_id: string;
  spotify_track_id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  image_url: string;
  duration_ms: number;
  position: number;
  category: Category | null;
  sorted_by: string;
  created_at: string;
  updated_at: string;
};

export const categories = new Set<Category>(["classic", "keep", "marginal", "gone"]);

function supabaseUrl() {
  return process.env.SUPABASE_URL?.replace(/\/$/, "");
}

function supabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
}

export function hasStorage() {
  return Boolean(supabaseUrl() && supabaseKey());
}

function requireStorageConfig() {
  if (!hasStorage()) {
    throw new Error(
      "Shared storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."
    );
  }
}

async function supabaseFetch<T>(path: string, init: RequestInit = {}) {
  requireStorageConfig();
  const url = `${supabaseUrl()}/rest/v1/${path}`;
  const key = supabaseKey()!;

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail || response.statusText}`);
  }

  if (response.status === 204) return null as T;

  const text = await response.text();
  if (!text.trim()) return null as T;

  return JSON.parse(text) as T;
}

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

function roomFromRow(row: SupabaseRoomRow): StoredRoom {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    externalUrl: row.external_url,
    spotifyPlaylistId: row.spotify_playlist_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trackFromRow(row: SupabaseTrackRow): StoredTrack {
  return {
    id: row.id,
    spotifyTrackId: row.spotify_track_id,
    uri: row.uri,
    name: row.name,
    artists: row.artists,
    album: row.album,
    imageUrl: row.image_url,
    durationMs: row.duration_ms,
    position: row.position,
    category: row.category,
    sortedBy: row.sorted_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function roomToRow(room: StoredRoom): SupabaseRoomRow {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    image_url: room.imageUrl,
    external_url: room.externalUrl,
    spotify_playlist_id: room.spotifyPlaylistId,
    created_at: room.createdAt,
    updated_at: room.updatedAt,
  };
}

function trackToRow(roomId: string, track: StoredTrack): SupabaseTrackRow {
  return {
    id: track.id,
    room_id: roomId,
    spotify_track_id: track.spotifyTrackId,
    uri: track.uri,
    name: track.name,
    artists: track.artists,
    album: track.album,
    image_url: track.imageUrl,
    duration_ms: track.durationMs,
    position: track.position,
    category: track.category,
    sorted_by: track.sortedBy,
    created_at: track.createdAt,
    updated_at: track.updatedAt,
  };
}

export async function getRoom(roomId: string) {
  const rows = await supabaseFetch<SupabaseRoomRow[]>(
    `rooms?id=eq.${encodeURIComponent(roomId)}&limit=1`
  );
  return rows[0] ? roomFromRow(rows[0]) : null;
}

export async function getTracks(roomId: string) {
  const rows = await supabaseFetch<SupabaseTrackRow[]>(
    `tracks?room_id=eq.${encodeURIComponent(roomId)}&order=position.asc`
  );
  return rows.map(trackFromRow);
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

  await supabaseFetch("rooms?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(roomToRow(room)),
  });

  await supabaseFetch("tracks?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(nextTracks.map((track) => trackToRow(room.id, track))),
  });
}

export async function updateTrackCategory(
  roomId: string,
  trackId: string,
  category: Category | null,
  sortedBy: string
) {
  const timestamp = nowIso();
  const rows = await supabaseFetch<SupabaseTrackRow[]>(
    `tracks?room_id=eq.${encodeURIComponent(roomId)}&id=eq.${encodeURIComponent(trackId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        category,
        sorted_by: sortedBy,
        updated_at: timestamp,
      }),
    }
  );

  if (!rows[0]) throw new Error("Track was not found.");

  await supabaseFetch(`rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: timestamp }),
  });

  return trackFromRow(rows[0]);
}

export async function reorderTracks(roomId: string, orderedTrackIds: string[]) {
  const [room, tracks] = await Promise.all([getRoom(roomId), getTracks(roomId)]);
  if (!room) throw new Error("Room was not found.");
  if (orderedTrackIds.length !== tracks.length) {
    throw new Error("Shuffle request did not include every track.");
  }

  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const uniqueIds = new Set(orderedTrackIds);
  if (uniqueIds.size !== tracks.length || orderedTrackIds.some((id) => !trackById.has(id))) {
    throw new Error("Shuffle request had unknown or duplicate tracks.");
  }

  const timestamp = nowIso();
  const reordered = orderedTrackIds.map((id, position) => ({
    ...trackById.get(id)!,
    position,
    updatedAt: timestamp,
  }));

  await supabaseFetch("tracks?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(reordered.map((track) => trackToRow(roomId, track))),
  });

  await supabaseFetch(`rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: timestamp }),
  });

  return reordered;
}

export async function resetTrackCategories(roomId: string) {
  const [room, tracks] = await Promise.all([getRoom(roomId), getTracks(roomId)]);
  if (!room) throw new Error("Room was not found.");

  const timestamp = nowIso();
  const resetTracks = tracks.map((track) => ({
    ...track,
    category: null,
    sortedBy: "",
    updatedAt: timestamp,
  }));

  await supabaseFetch("tracks?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(resetTracks.map((track) => trackToRow(roomId, track))),
  });

  await supabaseFetch(`rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: timestamp }),
  });

  return resetTracks;
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
