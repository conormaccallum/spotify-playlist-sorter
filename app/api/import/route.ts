import { env } from "cloudflare:workers";
import { ensureSchema, getD1, jsonError, parsePlaylistId, slugify } from "../_lib";

type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  album?: {
    name?: string;
    images?: { url: string; width: number; height: number }[];
  };
  artists?: { name: string }[];
};

async function getSpotifyToken() {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Spotify import needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET. Until those are set, use the paste-a-track-list fallback."
    );
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) throw new Error("Spotify rejected the configured API credentials.");

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

async function fetchSpotifyPlaylist(playlistInput: string) {
  const playlistId = parsePlaylistId(playlistInput);
  if (!playlistId) throw new Error("That does not look like a Spotify playlist URL, URI, or ID.");

  const token = await getSpotifyToken();
  const playlistResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,external_urls.spotify,images,total,tracks.items(track(id,uri,name,duration_ms,artists(name),album(name,images))),tracks.next`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!playlistResponse.ok) {
    throw new Error("Spotify could not load that playlist. Make sure it is public or accessible to the API app.");
  }

  const playlist = (await playlistResponse.json()) as {
    id: string;
    name: string;
    description?: string;
    external_urls?: { spotify?: string };
    images?: { url: string; width: number; height: number }[];
    tracks: {
      items: { track: SpotifyTrack | null }[];
      next: string | null;
    };
  };

  let next = playlist.tracks.next;
  const items = [...playlist.tracks.items];

  while (next) {
    const pageResponse = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!pageResponse.ok) break;
    const page = (await pageResponse.json()) as {
      items: { track: SpotifyTrack | null }[];
      next: string | null;
    };
    items.push(...page.items);
    next = page.next;
  }

  return {
    id: playlist.id,
    name: playlist.name || "Spotify playlist",
    description: playlist.description ?? "",
    imageUrl: playlist.images?.[0]?.url ?? "",
    externalUrl: playlist.external_urls?.spotify ?? "",
    tracks: items
      .map((item, index) => ({ track: item.track, index }))
      .filter((item): item is { track: SpotifyTrack; index: number } => Boolean(item.track?.name))
      .map(({ track, index }) => ({
        id: track.id || `${playlist.id}-${index}`,
        spotifyTrackId: track.id || "",
        uri: track.uri || "",
        name: track.name,
        artists: track.artists?.map((artist) => artist.name).join(", ") ?? "",
        album: track.album?.name ?? "",
        imageUrl: track.album?.images?.[0]?.url ?? "",
        durationMs: track.duration_ms ?? 0,
        position: index,
      })),
  };
}

function parseManualTracks(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [left, right] = line.split(/\s+[-–—]\s+/, 2);
      const hasArtist = Boolean(right);
      return {
        id: `manual-${index}-${slugify(line, "track")}`,
        spotifyTrackId: "",
        uri: "",
        name: hasArtist ? right.trim() : line,
        artists: hasArtist ? left.trim() : "",
        album: "",
        imageUrl: "",
        durationMs: 0,
        position: index,
      };
    });
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as {
      playlistUrl?: string;
      manualTracks?: string;
      roomName?: string;
    };

    const manualTracks = body.manualTracks?.trim();
    const imported = body.playlistUrl?.trim()
      ? await fetchSpotifyPlaylist(body.playlistUrl)
      : {
          id: "manual",
          name: body.roomName?.trim() || "Friday playlist sort",
          description: "Manual track list",
          imageUrl: "",
          externalUrl: "",
          tracks: parseManualTracks(manualTracks ?? ""),
        };

    if (!imported.tracks.length) return jsonError(new Error("No tracks were found to import."), 400);

    const roomId = imported.id === "manual" ? slugify(imported.name) : slugify(imported.id);
    const db = getD1();

    await db
      .prepare(
        "INSERT INTO rooms (id, name, description, image_url, external_url, spotify_playlist_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, image_url = excluded.image_url, external_url = excluded.external_url, spotify_playlist_id = excluded.spotify_playlist_id, updated_at = CURRENT_TIMESTAMP"
      )
      .bind(
        roomId,
        imported.name,
        imported.description,
        imported.imageUrl,
        imported.externalUrl,
        imported.id === "manual" ? "" : imported.id
      )
      .run();

    await db.batch(
      imported.tracks.map((track) =>
        db
          .prepare(
            "INSERT INTO tracks (id, room_id, spotify_track_id, uri, name, artists, album, image_url, duration_ms, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, artists = excluded.artists, album = excluded.album, image_url = excluded.image_url, duration_ms = excluded.duration_ms, position = excluded.position, updated_at = CURRENT_TIMESTAMP"
          )
          .bind(
            `${roomId}-${track.id}`,
            roomId,
            track.spotifyTrackId,
            track.uri,
            track.name,
            track.artists,
            track.album,
            track.imageUrl,
            track.durationMs,
            track.position
          )
      )
    );

    return Response.json({
      room: {
        id: roomId,
        name: imported.name,
        description: imported.description,
        imageUrl: imported.imageUrl,
        externalUrl: imported.externalUrl,
        trackCount: imported.tracks.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
