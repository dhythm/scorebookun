"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppGame } from "@/lib/app-state/types";
import { getEffectiveInningCount } from "@/lib/app-state/selectors";
import { getInningScores, getTeamStats } from "@/lib/domain/stats";

interface ScoreboardProps {
  game: AppGame;
  collapsibleOnMobile?: boolean;
  defaultMobileExpanded?: boolean;
}

export function Scoreboard({
  game,
  collapsibleOnMobile = false,
  defaultMobileExpanded = false,
}: ScoreboardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mobileExpanded, setMobileExpanded] = useState(defaultMobileExpanded);
  const inningCount = getEffectiveInningCount(game);
  const scores = getInningScores(game.timeline, inningCount);
  const awayStats = getTeamStats(game.timeline, "away");
  const homeStats = getTeamStats(game.timeline, "home");

  const currentInning = game.currentState.inning;
  const headerHeight = collapsibleOnMobile ? "h-11 sm:h-9" : "h-9";
  const scoreHeight = collapsibleOnMobile ? "h-8 sm:h-9" : "h-9";

  useEffect(() => {
    if (scrollRef.current) {
      const inningWidth = 32;
      const scrollPosition = Math.max(0, (currentInning - 3) * inningWidth);
      scrollRef.current.scrollLeft = scrollPosition;
    }
  }, [currentInning]);

  return (
    <div className="isolate mx-auto w-full max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-none">
      <div
        role="group"
        aria-label="現在のスコア"
        className="score-summary px-4 pb-4 pt-5"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-center">
          {(["away", "home"] as const).map((side, index) => (
            <div
              key={side}
              className={cn(
                "min-w-0",
                index === 0
                  ? "col-start-1 row-start-1"
                  : "col-start-3 row-start-1"
              )}
            >
              <p className="text-[11px] font-medium text-primary-foreground/75">
                {side === "away" ? "先攻" : "後攻"}
                {game.status !== "finished" &&
                  (game.currentState.half === "top" ? "away" : "home") ===
                    side &&
                  "・攻撃中"}
              </p>
              <p className="my-1 font-mono text-4xl font-semibold leading-tight tabular-nums sm:text-5xl">
                {side === "away" ? scores.awayTotal : scores.homeTotal}
              </p>
              <p className="break-all text-sm font-semibold leading-relaxed">
                {game.config.teams[side].name ||
                  (side === "away" ? "先攻" : "後攻")}
              </p>
            </div>
          ))}
          <span
            className="col-start-2 row-start-1 mt-8 text-xl text-primary-foreground/50"
            aria-hidden="true"
          >
            —
          </span>
        </div>
      </div>
      {collapsibleOnMobile && !mobileExpanded && (
        <button
          type="button"
          className="flex h-11 w-full items-center justify-center gap-2 px-3 text-xs font-medium text-muted-foreground touch-manipulation sm:hidden"
          aria-expanded={false}
          aria-label="スコアボードを展開"
          data-scoreboard-view="compact"
          onClick={() => setMobileExpanded(true)}
        >
          イニングスコア
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className={cn(
          "flex",
          collapsibleOnMobile && !mobileExpanded && "hidden sm:flex"
        )}
        data-scoreboard-view="full"
      >
        <div className="flex-shrink-0 bg-secondary/70">
          {collapsibleOnMobile ? (
            <>
              <button
                type="button"
                className="flex h-11 w-24 items-center justify-center gap-1 border-b border-border text-[11px] font-bold tracking-wide text-muted-foreground touch-manipulation sm:hidden"
                aria-expanded={true}
                aria-label="スコアボードを折りたたむ"
                onClick={() => setMobileExpanded(false)}
              >
                チーム
                <ChevronUp className="h-4 w-4" />
              </button>
              <div className="hidden h-9 w-24 items-center justify-center border-b border-border text-[11px] font-bold tracking-wide text-muted-foreground sm:flex">
                チーム
              </div>
            </>
          ) : (
            <div className="flex h-9 w-24 items-center justify-center border-b border-border text-[11px] font-bold tracking-wide text-muted-foreground">
              チーム
            </div>
          )}
          <div
            className={cn(
              "flex w-24 items-center truncate border-b border-border px-3 text-sm font-bold text-foreground",
              scoreHeight
            )}
          >
            {game.config.teams.away.name || "先攻"}
          </div>
          <div
            className={cn(
              "flex w-24 items-center truncate px-3 text-sm font-bold text-foreground",
              scoreHeight
            )}
          >
            {game.config.teams.home.name || "後攻"}
          </div>
        </div>

        <div ref={scrollRef} className="min-w-0 overflow-x-auto scrollbar-hide">
          <div className="inline-flex">
            {Array.from({ length: inningCount }, (_, i) => {
              const inning = i + 1;
              const isCurrentInning = inning === currentInning;

              return (
                <div key={inning} className="flex-shrink-0 w-8">
                  <div
                    className={cn(
                      "flex items-center justify-center border-b border-border text-xs font-bold",
                      headerHeight,
                      isCurrentInning
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {inning}
                  </div>
                  <div
                    className={cn(
                      "flex items-center justify-center border-b border-border font-mono text-sm tabular-nums",
                      scoreHeight,
                      isCurrentInning && game.currentState.half === "top"
                        ? "bg-accent/20"
                        : ""
                    )}
                  >
                    {scores.away[i] !== null ? scores.away[i] : "-"}
                  </div>
                  <div
                    className={cn(
                      "flex items-center justify-center font-mono text-sm tabular-nums",
                      scoreHeight,
                      isCurrentInning && game.currentState.half === "bottom"
                        ? "bg-accent/20"
                        : ""
                    )}
                  >
                    {scores.home[i] !== null ? scores.home[i] : "-"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-shrink-0 border-l border-border">
          <div className="flex">
            <div className="w-10">
              <div
                className={cn(
                  "flex items-center justify-center border-b border-border bg-secondary/70 text-xs font-bold text-muted-foreground",
                  headerHeight
                )}
              >
                R
              </div>
              <div
                className={cn(
                  "flex items-center justify-center border-b border-border font-mono text-sm font-bold text-primary tabular-nums",
                  scoreHeight
                )}
              >
                {scores.awayTotal}
              </div>
              <div
                className={cn(
                  "flex items-center justify-center font-mono text-sm font-bold text-primary tabular-nums",
                  scoreHeight
                )}
              >
                {scores.homeTotal}
              </div>
            </div>
            <div className="w-8 border-l border-border">
              <div
                className={cn(
                  "flex items-center justify-center border-b border-border bg-secondary/70 text-xs font-bold text-muted-foreground",
                  headerHeight
                )}
              >
                H
              </div>
              <div
                className={cn(
                  "flex items-center justify-center border-b border-border font-mono text-sm text-foreground tabular-nums",
                  scoreHeight
                )}
              >
                {awayStats.hits}
              </div>
              <div
                className={cn(
                  "flex items-center justify-center font-mono text-sm text-foreground tabular-nums",
                  scoreHeight
                )}
              >
                {homeStats.hits}
              </div>
            </div>
            <div className="w-8 border-l border-border">
              <div
                className={cn(
                  "flex items-center justify-center border-b border-border bg-secondary/70 text-xs font-bold text-muted-foreground",
                  headerHeight
                )}
              >
                E
              </div>
              <div
                className={cn(
                  "flex items-center justify-center border-b border-border font-mono text-sm text-foreground tabular-nums",
                  scoreHeight
                )}
              >
                {awayStats.errors}
              </div>
              <div
                className={cn(
                  "flex items-center justify-center font-mono text-sm text-foreground tabular-nums",
                  scoreHeight
                )}
              >
                {homeStats.errors}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
