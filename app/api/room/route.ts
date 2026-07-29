import { ensureSchema, getD1, jsonError } from "../_lib";

type RoomRow = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  external_url: string;
  spotify_playlist_id: string;
  updated_at: string;
};

type TrackRow = {
  id: string;
  spotify_track_id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  image_url: string;
  duration_ms: number;
  position: number;
  category: string | null;
  sorted_by: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const db = getD1();
    const url = new URL(request.url);
    const roomId = url.searchParams.get("room") || "friday-sort";

    const room = await db.prepare("SELECT * FROM rooms WHERE id = ?").bind(roomId).first<RoomRow>();

    if (!room) {
      return Response.json({
        room: null,
        tracks: [],
        counts: { unsorted: 0, classic: 0, keep: 0, marginal: 0, gone: 0 },
      });
    }

    const result = await db
      .prepare("SELECT * FROM tracks WHERE room_id = ? ORDER BY position ASC")
      .bind(room.id)
      .all<TrackRow>();

    const tracks = result.results ?? [];
    const counts = tracks.reduce(
      (memo, track) => {
        const key = track.category ?? "unsorted";
        memo[key] = (memo[key] ?? 0) + 1;
        return memo;
      },
      { unsorted: 0, classic: 0, keep: 0, marginal: 0, gone: 0 } as Record<string, number>
    );

    return Response.json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        imageUrl: room.image_url,
        externalUrl: room.external_url,
        spotifyPlaylistId: room.spotify_playlist_id,
        updatedAt: room.updated_at,
      },
      tracks: tracks.map((track) => ({
        id: track.id,
        spotifyTrackId: track.spotify_track_id,
        uri: track.uri,
        name: track.name,
        artists: track.artists,
        album: track.album,
        imageUrl: track.image_url,
        durationMs: track.duration_ms,
        position: track.position,
        category: track.category,
        sortedBy: track.sorted_by,
        updatedAt: track.updated_at,
      })),
      counts,
    });
  } catch (error) {
    return jsonError(error);
  }
}
