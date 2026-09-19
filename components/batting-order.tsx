"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { TeamSide } from "@/lib/domain/types";
import type { AppGame } from "@/lib/app-state/types";
import { getEffectiveInningCount } from "@/lib/app-state/selectors";
import { formatEventNotation } from "@/lib/domain/notation";
import { AtBatResultDialog } from "@/components/at-bat-result-dialog";
import { BaseRunningEditDialog } from "@/components/base-running-edit-dialog";
import { ScorebookAtBatLine } from "@/components/scorebook-at-bat-line";
import { getPlayerInningEntries } from "@/lib/app-state/timeline-selectors";
import { getInningColumnScrollLeft } from "@/components/batting-order-scroll";

interface BattingOrderPanelProps {
  game: AppGame;
}

const STICKY_ORDER_COLUMNS_WIDTH = 112;

function OrderList({
  game,
  teamSide,
  isBattingTeam,
  onEditAtBat,
}: {
  game: AppGame;
  teamSide: TeamSide;
  isBattingTeam: boolean;
  onEditAtBat: (eventId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const team = game.teams[teamSide];
  const batterIndex = game.currentState.currentBatterIndex[teamSide];
  const activePlayerIds = game.currentState.activeLineup[teamSide];
  const playerCount = activePlayerIds.length;
  const nextIndex = playerCount > 0 ? (batterIndex + 1) % playerCount : 0;
  const currentPlayerId = activePlayerIds[batterIndex];
  const nextPlayerId = activePlayerIds[nextIndex];
  const showNextBadge =
    isBattingTeam && playerCount > 1 && nextIndex !== batterIndex;
  const appearedSubstituteIds = new Set(
    game.timeline.flatMap((entry) =>
      entry.applied &&
      entry.event.kind === "substitution" &&
      entry.event.team === teamSide
        ? [entry.event.inPlayerId]
        : []
    )
  );
  const players = [
    ...team.players,
    ...(team.benchPlayers ?? []).filter(
      (player) =>
        activePlayerIds.includes(player.id) ||
        appearedSubstituteIds.has(player.id)
    ),
  ];

  const inningCount = getEffectiveInningCount(game);
  const currentInning = game.currentState.inning;
  const halfForTeam = teamSide === "away" ? "top" : "bottom";

  useEffect(() => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-inning-column="${currentInning}"]`
    );
    if (!container || !target) return;

    container.scrollLeft = getInningColumnScrollLeft({
      containerWidth: container.clientWidth,
      stickyWidth: STICKY_ORDER_COLUMNS_WIDTH,
      targetOffsetLeft: target.offsetLeft,
      targetWidth: target.offsetWidth,
      maxScrollLeft: container.scrollWidth - container.clientWidth,
    });
  }, [currentInning]);

  /** sticky 列に半透明の bg-* を使うと、横スクロールの下のセルが透けて見えるため不透明にする */
  const stickyThBg = "bg-muted";
  const stickyTdBg = "bg-card";
  const stickyTdCurrent =
    "bg-[color-mix(in_oklch,var(--card)_88%,var(--primary)_12%)]";
  const stickyTdNext =
    "bg-[color-mix(in_oklch,var(--card)_78%,var(--muted)_22%)]";

  const thInning =
    "min-w-[3.5rem] border-b border-border px-0.5 py-1.5 text-center text-[11px] font-bold tabular-nums sm:text-xs";
  const tdInning =
    "min-w-[3.5rem] border-b border-border px-0.5 py-1 align-middle text-center";

  return (
    <div
      ref={scrollRef}
      className="isolate overflow-x-auto rounded-xl border border-border bg-card touch-pan-x"
      aria-label={`${team.name || (teamSide === "away" ? "先攻" : "後攻")}の打順`}
    >
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th
              className={cn(
                "sticky left-0 z-30 w-8 min-w-8 border-r border-border px-1 py-1.5 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs",
                stickyThBg
              )}
              scope="col"
            >
              #
            </th>
            <th
              className={cn(
                "sticky left-8 z-40 w-20 min-w-20 max-w-20 border-r border-border px-0.5 py-1.5 text-left text-[10px] font-semibold text-muted-foreground sm:text-xs",
                stickyThBg
              )}
              scope="col"
            >
              選手
            </th>
            {Array.from({ length: inningCount }, (_, idx) => {
              const inningNum = idx + 1;
              const isLiveColumn =
                inningNum === game.currentState.inning &&
                game.currentState.half === halfForTeam;
              return (
                <th
                  key={inningNum}
                  scope="col"
                  data-inning-column={inningNum}
                  className={cn(
                    thInning,
                    isLiveColumn && "bg-accent/25 text-accent-foreground"
                  )}
                >
                  {inningNum}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {players.map((player, i) => {
            const isStarter = i < team.players.length;
            const isCurrent = isBattingTeam && player.id === currentPlayerId;
            const isNext =
              showNextBadge && player.id === nextPlayerId && !isCurrent;

            return (
              <tr
                key={player.id}
                data-current-batter={isCurrent ? "true" : undefined}
                className={cn(
                  isCurrent && "bg-primary/10",
                  !isCurrent && isNext && "bg-muted/50"
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-30 w-8 min-w-8 border-r border-border px-1 py-1.5 text-center font-mono text-xs tabular-nums text-muted-foreground",
                    isCurrent && stickyTdCurrent,
                    !isCurrent && isNext && stickyTdNext,
                    !isCurrent && !isNext && stickyTdBg
                  )}
                >
                  {isStarter ? i + 1 : "↳"}
                </td>
                <td
                  className={cn(
                    "sticky left-8 z-40 w-20 min-w-20 max-w-20 border-r border-border px-0.5 py-1.5 align-top",
                    isCurrent && stickyTdCurrent,
                    !isCurrent && isNext && stickyTdNext,
                    !isCurrent && !isNext && stickyTdBg
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={cn(
                        "line-clamp-2 text-xs leading-snug sm:text-sm",
                        isCurrent
                          ? "font-bold text-foreground"
                          : "text-foreground"
                      )}
                    >
                      {player.name}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {isCurrent && (
                        <span className="text-[10px] font-semibold text-primary">
                          打席
                        </span>
                      )}
                      {isNext && (
                        <span className="text-[10px] text-muted-foreground">
                          次
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                {Array.from({ length: inningCount }, (_, idx) => {
                  const inningNum = idx + 1;
                  const cellEntries = getPlayerInningEntries(
                    game.timeline,
                    player.id,
                    teamSide,
                    inningNum
                  );
                  const isLiveColumn =
                    inningNum === game.currentState.inning &&
                    game.currentState.half === halfForTeam;

                  return (
                    <td
                      key={inningNum}
                      className={cn(tdInning, isLiveColumn && "bg-accent/10")}
                    >
                      {cellEntries.length === 0 ? (
                        <span className="text-muted-foreground/40">·</span>
                      ) : (
                        <div className="flex min-h-10 flex-col items-center justify-center gap-0.5">
                          {cellEntries.map((entry) => {
                            const event = entry.event;
                            const label = formatEventNotation(event);
                            const editable =
                              event.kind === "atBat" ||
                              event.kind === "baseRunning";
                            return (
                              <button
                                key={event.id}
                                type="button"
                                className={cn(
                                  "min-h-11 w-full max-w-[3.5rem] rounded border bg-background px-0.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums shadow-sm",
                                  event.kind === "atBat"
                                    ? "border-border text-primary hover:border-primary/50 hover:bg-accent/40 active:bg-accent"
                                    : "border-dashed border-muted-foreground/40 text-primary hover:border-primary/50 hover:bg-accent/40 active:bg-accent"
                                )}
                                disabled={!editable}
                                onClick={() =>
                                  editable && onEditAtBat(event.id)
                                }
                                aria-label={`${inningNum}回の記録 ${label}${editable ? "を修正" : ""}`}
                              >
                                {event.kind === "atBat" ? (
                                  <ScorebookAtBatLine entry={entry} />
                                ) : (
                                  <span className="line-clamp-2 break-all px-0.5 text-[10px] leading-tight sm:text-[11px]">
                                    {label}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BattingOrderPanel({ game }: BattingOrderPanelProps) {
  const { half } = game.currentState;
  const battingTeamSide: TeamSide = half === "top" ? "away" : "home";
  const [activeTab, setActiveTab] = useState<TeamSide>(battingTeamSide);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const editingEvent = editingEventId
    ? game.events.find((e) => e.id === editingEventId)
    : undefined;

  useEffect(() => {
    setActiveTab(battingTeamSide);
  }, [battingTeamSide]);

  const awayName = game.teams.away.name || "先攻";
  const homeName = game.teams.home.name || "後攻";

  return (
    <Card className="border-border py-4 gap-3">
      <CardHeader className="px-4 py-0 sm:px-6">
        <CardTitle className="text-base">打順</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-0 pt-0 sm:px-6">
        <div className="hidden min-w-0 min-[1800px]:grid min-[1800px]:grid-cols-2 min-[1800px]:gap-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {awayName}
              </h3>
              {battingTeamSide === "away" && (
                <span className="shrink-0 text-xs font-medium text-primary">
                  攻撃中
                </span>
              )}
            </div>
            <OrderList
              game={game}
              teamSide="away"
              isBattingTeam={battingTeamSide === "away"}
              onEditAtBat={setEditingEventId}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {homeName}
              </h3>
              {battingTeamSide === "home" && (
                <span className="shrink-0 text-xs font-medium text-primary">
                  攻撃中
                </span>
              )}
            </div>
            <OrderList
              game={game}
              teamSide="home"
              isBattingTeam={battingTeamSide === "home"}
              onEditAtBat={setEditingEventId}
            />
          </div>
        </div>

        <div className="min-w-0 min-[1800px]:hidden">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TeamSide)}
            className="gap-3"
          >
            <TabsList className="grid h-11 w-full min-w-0 grid-cols-2 p-1 touch-manipulation">
              <TabsTrigger
                value="away"
                className="min-w-0 text-sm px-2 data-[state=active]:font-semibold"
              >
                <span className="truncate">{awayName}</span>
              </TabsTrigger>
              <TabsTrigger
                value="home"
                className="min-w-0 text-sm px-2 data-[state=active]:font-semibold"
              >
                <span className="truncate">{homeName}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="away" className="mt-0">
              <OrderList
                game={game}
                teamSide="away"
                isBattingTeam={battingTeamSide === "away"}
                onEditAtBat={setEditingEventId}
              />
            </TabsContent>
            <TabsContent value="home" className="mt-0">
              <OrderList
                game={game}
                teamSide="home"
                isBattingTeam={battingTeamSide === "home"}
                onEditAtBat={setEditingEventId}
              />
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>

      <AtBatResultDialog
        mode="edit"
        game={game}
        eventId={editingEvent?.kind === "atBat" ? editingEventId : null}
        open={editingEventId !== null && editingEvent?.kind === "atBat"}
        onOpenChange={(open) => {
          if (!open) setEditingEventId(null);
        }}
      />
      <BaseRunningEditDialog
        game={game}
        eventId={editingEvent?.kind === "baseRunning" ? editingEventId : null}
        open={editingEventId !== null && editingEvent?.kind === "baseRunning"}
        onOpenChange={(open) => {
          if (!open) setEditingEventId(null);
        }}
      />
    </Card>
  );
}
