import {
  jsonError,
  nowIso,
  parsePlaylistId,
  saveRoomWithTracks,
  slugify,
  type StoredTrack,
} from "../_lib";

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
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
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
    const timestamp = nowIso();
    const tracks: StoredTrack[] = imported.tracks.map((track) => ({
      id: `${roomId}-${track.id}`,
      spotifyTrackId: track.spotifyTrackId,
      uri: track.uri,
      name: track.name,
      artists: track.artists,
      album: track.album,
      imageUrl: track.imageUrl,
      durationMs: track.durationMs,
      position: track.position,
      category: null,
      sortedBy: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    await saveRoomWithTracks(
      {
        id: roomId,
        name: imported.name,
        description: imported.description,
        imageUrl: imported.imageUrl,
        externalUrl: imported.externalUrl,
        spotifyPlaylistId: imported.id === "manual" ? "" : imported.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      tracks
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
