import { categories, jsonError, updateTrackCategory } from "../../_lib";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      trackId?: string;
      category?: string | null;
      sortedBy?: string;
    };

    const roomId = body.roomId?.trim();
    const trackId = body.trackId?.trim();
    const sortedBy = body.sortedBy?.trim().slice(0, 40) ?? "";
    const category = body.category === "" ? null : body.category ?? null;

    if (!roomId || !trackId) return jsonError(new Error("Missing room or track."), 400);
    if (category !== null && !categories.has(category as never)) {
      return jsonError(new Error("Unknown category."), 400);
    }

    const result = await updateTrackCategory(roomId, trackId, category as never, sortedBy);

    return Response.json({ track: result });
  } catch (error) {
    return jsonError(error);
  }
}
