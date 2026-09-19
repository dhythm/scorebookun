"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { GameResult } from "@/components/game-result";
import { LiveScoring } from "@/components/live-scoring";
import { ScrollToTop } from "@/components/scroll-to-top";
import { Button } from "@/components/ui/button";
import { getGameViewKey } from "@/lib/app-state/view-key";
import { useGame } from "@/lib/game-context";

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { game, storageReady, loadGame } = useGame();
  const [failure, setFailure] = useState<{
    gameId: string;
    reason: "notFound" | "unavailable";
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loaded = game?.id === gameId;

  useEffect(() => {
    if (!storageReady || loaded) return;
    let cancelled = false;
    void loadGame(gameId).then((result) => {
      if (cancelled) return;
      setFailure(result === "loaded" ? null : { gameId, reason: result });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, gameId, loadGame, loaded, storageReady]);

  if (!loaded || !game) {
    if (failure?.gameId !== gameId) {
      return (
        <main
          className="grid min-h-screen place-items-center bg-background p-4"
          aria-busy="true"
        >
          <p className="text-sm text-muted-foreground">
            試合を読み込んでいます…
          </p>
        </main>
      );
    }

    const notFound = failure.reason === "notFound";
    return (
      <main className="grid min-h-screen place-items-center bg-background p-4">
        <section className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 text-center shadow-sm">
          <div className="space-y-1">
            <h1 className="text-lg font-bold">
              {notFound ? "試合が見つかりません" : "試合を読み込めません"}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {notFound
                ? "URLが正しいか、共有した人に確認してください。"
                : "通信環境を確認して、もう一度お試しください。"}
            </p>
          </div>
          {!notFound && (
            <Button
              className="h-11 w-full"
              onClick={() => {
                setFailure(null);
                setAttempt((count) => count + 1);
              }}
            >
              再読み込み
            </Button>
          )}
          <Button
            asChild
            variant={notFound ? "default" : "outline"}
            className="h-11 w-full"
          >
            <Link href="/">試合の作成へ戻る</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <>
      <ScrollToTop resetKey={getGameViewKey(game)} />
      {game.status === "finished" ? <GameResult /> : <LiveScoring />}
    </>
  );
}
