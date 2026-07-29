import { getRoom, getTracks, hasStorage, jsonError } from "../_lib";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("room") || "friday-sort";

    if (!hasStorage()) {
      return Response.json({
        room: null,
        tracks: [],
        counts: { unsorted: 0, classic: 0, keep: 0, marginal: 0, gone: 0 },
        setupNeeded: true,
      });
    }

    const room = await getRoom(roomId);

    if (!room) {
      return Response.json({
        room: null,
        tracks: [],
        counts: { unsorted: 0, classic: 0, keep: 0, marginal: 0, gone: 0 },
      });
    }

    const tracks = await getTracks(room.id);
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
        imageUrl: room.imageUrl,
        externalUrl: room.externalUrl,
        spotifyPlaylistId: room.spotifyPlaylistId,
        updatedAt: room.updatedAt,
      },
      tracks,
      counts,
    });
  } catch (error) {
    return jsonError(error);
  }
}
