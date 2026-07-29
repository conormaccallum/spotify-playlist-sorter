import { categories, ensureSchema, getD1, jsonError } from "../../_lib";

export async function POST(request: Request) {
  try {
    await ensureSchema();
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

    const db = getD1();
    const result = await db
      .prepare(
        "UPDATE tracks SET category = ?, sorted_by = ?, updated_at = CURRENT_TIMESTAMP WHERE room_id = ? AND id = ? RETURNING id, category, sorted_by, updated_at"
      )
      .bind(category, sortedBy, roomId, trackId)
      .first();

    if (!result) return jsonError(new Error("Track was not found."), 404);

    await db.prepare("UPDATE rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(roomId).run();

    return Response.json({ track: result });
  } catch (error) {
    return jsonError(error);
  }
}
