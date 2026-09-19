import { getDatabase } from "@/lib/db";
import {
  handleGetGame,
  handleSaveGame,
  unavailable,
} from "@/lib/server/game-handlers";

type RouteContext = { params: Promise<{ gameId: string }> };

export async function GET(
  request: Request,
  { params }: RouteContext
): Promise<Response> {
  try {
    const [{ db }, { gameId }] = await Promise.all([getDatabase(), params]);
    return await handleGetGame(db, gameId, request);
  } catch {
    return unavailable();
  }
}

export async function PUT(
  request: Request,
  { params }: RouteContext
): Promise<Response> {
  try {
    const [{ db }, { gameId }] = await Promise.all([getDatabase(), params]);
    return await handleSaveGame(db, gameId, request);
  } catch {
    return unavailable();
  }
}
