import { getDatabase } from "@/lib/db";
import { handleCreateGame, unavailable } from "@/lib/server/game-handlers";

export async function POST(request: Request): Promise<Response> {
  try {
    const { db } = await getDatabase();
    return await handleCreateGame(db, request);
  } catch {
    return unavailable();
  }
}
