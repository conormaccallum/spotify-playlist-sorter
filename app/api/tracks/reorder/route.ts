import { jsonError, reorderTracks } from "../../_lib";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      orderedTrackIds?: string[];
    };

    const roomId = body.roomId?.trim();
    const orderedTrackIds = body.orderedTrackIds ?? [];

    if (!roomId) return jsonError(new Error("Missing room."), 400);
    if (!Array.isArray(orderedTrackIds) || orderedTrackIds.length === 0) {
      return jsonError(new Error("Missing shuffled track order."), 400);
    }

    const tracks = await reorderTracks(roomId, orderedTrackIds);
    return Response.json({ tracks });
  } catch (error) {
    return jsonError(error);
  }
}
