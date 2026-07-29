import { jsonError, resetTrackCategories } from "../../_lib";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
    };

    const roomId = body.roomId?.trim();
    if (!roomId) return jsonError(new Error("Missing room."), 400);

    const tracks = await resetTrackCategories(roomId);
    return Response.json({ tracks });
  } catch (error) {
    return jsonError(error);
  }
}
