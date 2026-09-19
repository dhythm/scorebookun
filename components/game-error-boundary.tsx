"use client";

import { Component, type ReactNode } from "react";
import { Download, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadJsonFile, exportFileName } from "@/lib/export/download-file";
import { exportGameAsJson } from "@/lib/export/game-log";
import {
  createBrowserGameRepository,
  type PersistedGameV2,
} from "@/lib/storage/local-storage";

interface GameErrorBoundaryProps {
  children: ReactNode;
}

interface GameErrorBoundaryState {
  hasError: boolean;
}

function getActiveGame(): PersistedGameV2 | null {
  try {
    return createBrowserGameRepository().loadActive();
  } catch {
    return null;
  }
}

function downloadGame(game: PersistedGameV2): void {
  downloadJsonFile(exportFileName("game", game.date), exportGameAsJson(game));
}

function GameErrorFallback() {
  const activeGame = getActiveGame();

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <section
        role="alert"
        className="w-full max-w-md space-y-5 rounded-2xl border border-destructive/40 bg-card p-5 text-center shadow-lg"
      >
        <TriangleAlert
          className="mx-auto h-10 w-10 text-destructive"
          aria-hidden="true"
        />
        <div className="space-y-2">
          <h1 className="text-lg font-bold">画面を表示できませんでした</h1>
          <p className="text-sm font-semibold">
            最後に保存できた時点までの記録をエクスポートできます
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            記録をエクスポートしてから、画面を再読み込みしてください。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!activeGame}
            onClick={() => {
              if (activeGame) downloadGame(activeGame);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            記録をエクスポート
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            再読み込み
          </Button>
        </div>
      </section>
    </main>
  );
}

export class GameErrorBoundary extends Component<
  GameErrorBoundaryProps,
  GameErrorBoundaryState
> {
  state: GameErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): GameErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <GameErrorFallback />;
    return this.props.children;
  }
}
