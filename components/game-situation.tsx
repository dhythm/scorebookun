"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DiamondField } from "@/components/diamond-field";
import type { AppGame } from "@/lib/app-state/types";
import { getCurrentBatter, getNextBatter } from "@/lib/app-state/selectors";

interface GameSituationProps {
  game: AppGame;
  onRecordResult?: () => void;
  onOpenBaseRunning?: () => void;
  onRunnerSelect?: (runnerId: string) => void;
}

function OutIndicator({ outs }: { outs: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${outs}アウト`}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`h-3 w-3 rounded-full border-2 ${
            i < outs
              ? "border-primary bg-primary"
              : "border-muted-foreground/30 bg-card"
          }`}
        />
      ))}
    </div>
  );
}

export function GameSituation({
  game,
  onRecordResult,
  onOpenBaseRunning,
  onRunnerSelect,
}: GameSituationProps) {
  const { inning, half, outs, runners } = game.currentState;
  const currentBatter = getCurrentBatter(game);
  const nextBatter = getNextBatter(game);

  const teamSide = half === "top" ? "away" : "home";
  const batterIndex = game.currentState.currentBatterIndex[teamSide];

  return (
    <Card className="gap-0 overflow-hidden rounded-2xl border-border py-0 shadow-none">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-base font-extrabold text-foreground">
              {inning}回{half === "top" ? "表" : "裏"}
            </span>
            <OutIndicator outs={outs} />
            <span className="text-xs font-semibold text-muted-foreground">
              {outs}アウト
            </span>
          </div>
          <span className="ml-2 min-w-0 truncate rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-primary">
            {game.config.teams[teamSide].name}
          </span>
        </div>

        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-4 px-4 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:px-5">
          <div className="min-w-0">
            <DiamondField
              runners={runners}
              game={game}
              onRunnerSelect={onRunnerSelect}
            />
          </div>

          <div className="min-w-0">
            {currentBatter && (
              <div className="mb-4">
                <div className="mb-1 text-[10px] font-bold tracking-wide text-muted-foreground">
                  この打席
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-primary px-2 py-1 font-mono text-xs font-bold text-primary-foreground">
                    #{batterIndex + 1}
                  </span>
                  <span className="break-all text-xl font-extrabold tracking-tight text-foreground">
                    {currentBatter.name}
                  </span>
                </div>
              </div>
            )}

            {nextBatter && (
              <div className="border-t border-border pt-3">
                <div className="mb-1 text-[10px] font-bold tracking-wide text-muted-foreground">
                  次の打者
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    #
                    {((batterIndex + 1) % game.teams[teamSide].players.length) +
                      1}
                  </span>
                  <span className="break-all text-sm font-semibold text-muted-foreground">
                    {nextBatter.name}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {(onRecordResult || onOpenBaseRunning) && (
          <div className="hidden gap-2 border-t border-border bg-secondary/30 p-3 sm:flex">
            {onRecordResult && (
              <Button
                type="button"
                className="h-12 flex-1 touch-manipulation text-base font-bold"
                onClick={onRecordResult}
              >
                結果を入力
              </Button>
            )}
            {onOpenBaseRunning && (
              <Button
                type="button"
                variant="outline"
                className="h-12 min-w-[9rem] touch-manipulation bg-card"
                onClick={onOpenBaseRunning}
              >
                走塁・打席外
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
