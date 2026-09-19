"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { AppGame } from "@/lib/app-state/types";
import {
  getEffectiveInningCount,
  getFieldingPositionHistory,
} from "@/lib/app-state/selectors";
import type { FieldingPosition, TeamSide } from "@/lib/domain/types";
import {
  formatBattingAverage,
  getPlayerBattingStats,
} from "@/lib/domain/stats";
import {
  formatEventNotation,
  formatFieldingPosition,
} from "@/lib/domain/notation";
import { ScorebookAtBatLine } from "@/components/scorebook-at-bat-line";
import { getPlayerInningEntries } from "@/lib/app-state/timeline-selectors";

interface BattingScorebookTableProps {
  game: AppGame;
  teamSide: TeamSide;
  printMode?: boolean;
}

/** A player who moved shows each position in order, for example 遊投. */
function positionsLabel(positions: readonly FieldingPosition[]): string {
  if (positions.length === 0) return "—";
  return positions.map(formatFieldingPosition).join("");
}

export function BattingScorebookTable({
  game,
  teamSide,
  printMode = false,
}: BattingScorebookTableProps) {
  const team = game.config.teams[teamSide];
  const innings = getEffectiveInningCount(game);
  const { timeline } = game;
  const appearedSubstituteIds = new Set(
    timeline.flatMap((entry) =>
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
        game.currentState.activeLineup[teamSide].includes(player.id) ||
        appearedSubstituteIds.has(player.id)
    ),
  ];

  const totals = players.reduce(
    (acc, p) => {
      const s = getPlayerBattingStats(timeline, p.id);
      return {
        atBats: acc.atBats + s.atBats,
        hits: acc.hits + s.hits,
        runs: acc.runs + s.runs,
        rbi: acc.rbi + s.rbi,
        walks: acc.walks + s.walks,
        hitByPitch: acc.hitByPitch + s.hitByPitch,
        strikeouts: acc.strikeouts + s.strikeouts,
        sacrifice: acc.sacrifice + s.sacrifice,
        sacrificeFlies: acc.sacrificeFlies + s.sacrificeFlies,
      };
    },
    {
      atBats: 0,
      hits: 0,
      runs: 0,
      rbi: 0,
      walks: 0,
      hitByPitch: 0,
      strikeouts: 0,
      sacrifice: 0,
      sacrificeFlies: 0,
    }
  );

  const thStat =
    "text-center text-[10px] font-semibold leading-tight text-muted-foreground px-0.5 py-2 min-w-[1.75rem] sm:min-w-[2rem] sm:text-xs";
  const tdStat =
    "text-center font-mono text-[11px] tabular-nums px-0.5 py-1.5 sm:text-xs";
  const tdInning =
    "text-center font-mono text-[10px] leading-tight tabular-nums px-1 py-1.5 align-top text-primary sm:text-xs max-w-[3.5rem]";

  return (
    <div
      className={cn(
        "isolate rounded-xl border border-border bg-card",
        printMode ? "overflow-visible" : "overflow-hidden"
      )}
    >
      <div
        className={cn(
          printMode ? "overflow-visible" : "overflow-x-auto touch-pan-x"
        )}
      >
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th
                className="sticky left-0 z-20 w-8 min-w-8 border-r border-border bg-muted px-1 py-2 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs"
                scope="col"
                title="打順"
              >
                #
              </th>
              <th
                className="sticky left-8 z-20 w-28 min-w-28 max-w-28 border-r border-border bg-muted px-1 py-2 text-left text-[10px] font-semibold text-muted-foreground sm:text-xs"
                scope="col"
                title="選手名"
              >
                選手
              </th>
              <th
                className="sticky left-36 z-20 w-8 min-w-8 border-r border-border bg-muted px-0 py-2 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs"
                scope="col"
                title="守備位置"
              >
                守
              </th>
              <th className={thStat} scope="col" title="打数">
                打
              </th>
              <th className={thStat} scope="col" title="安打">
                安
              </th>
              <th className={thStat} scope="col" title="得点">
                得
              </th>
              <th className={thStat} scope="col" title="打点">
                点
              </th>
              <th className={thStat} scope="col" title="四球">
                四
              </th>
              <th className={thStat} scope="col" title="死球">
                死
              </th>
              <th className={thStat} scope="col" title="三振">
                三
              </th>
              <th className={thStat} scope="col" title="犠打">
                犠
              </th>
              <th className={thStat} scope="col" title="犠飛">
                飛
              </th>
              <th
                className={cn(thStat, "border-r border-border")}
                scope="col"
                title="打率"
              >
                率
              </th>
              {Array.from({ length: innings }, (_, i) => (
                <th
                  key={i + 1}
                  className="min-w-8 border-b border-border bg-accent/15 px-0.5 py-2 text-center text-[10px] font-bold tabular-nums text-foreground sm:min-w-9 sm:text-xs"
                  scope="col"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => {
              const isStarter = index < team.players.length;
              const stats = getPlayerBattingStats(timeline, player.id);
              return (
                <tr
                  key={player.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="sticky left-0 z-10 w-8 min-w-8 border-r border-border bg-card px-1 py-1.5 text-center font-mono text-[11px] text-muted-foreground tabular-nums sm:text-xs">
                    {isStarter ? index + 1 : "↳"}
                  </td>
                  <td className="sticky left-8 z-10 w-28 min-w-28 max-w-28 border-r border-border bg-card px-1 py-1.5 font-medium leading-snug text-foreground">
                    <span className="line-clamp-2 text-xs sm:text-sm">
                      {player.name}
                    </span>
                  </td>
                  <td className="sticky left-36 z-10 w-8 min-w-8 border-r border-border bg-card px-0 py-1.5 text-center text-[11px] text-muted-foreground sm:text-xs">
                    {positionsLabel(
                      getFieldingPositionHistory(game, teamSide, player.id)
                    )}
                  </td>
                  <td className={tdStat}>{stats.atBats}</td>
                  <td className={tdStat}>{stats.hits}</td>
                  <td className={tdStat}>{stats.runs}</td>
                  <td className={tdStat}>{stats.rbi}</td>
                  <td className={tdStat}>{stats.walks}</td>
                  <td className={tdStat}>{stats.hitByPitch}</td>
                  <td className={tdStat}>{stats.strikeouts}</td>
                  <td className={tdStat}>{stats.sacrifice}</td>
                  <td className={tdStat}>{stats.sacrificeFlies}</td>
                  <td
                    className={cn(
                      tdStat,
                      "border-r border-border text-foreground"
                    )}
                  >
                    {formatBattingAverage(stats.hits, stats.atBats)}
                  </td>
                  {Array.from({ length: innings }, (_, i) => {
                    const inning = i + 1;
                    const segs = getPlayerInningEntries(
                      timeline,
                      player.id,
                      teamSide,
                      inning
                    );
                    return (
                      <td key={inning} className={tdInning}>
                        {segs.length === 0 ? (
                          " "
                        ) : (
                          <div className="flex flex-wrap items-end justify-center gap-x-0.5 gap-y-0.5">
                            {segs.map((entry, idx) => (
                              <Fragment key={entry.event.id}>
                                {idx > 0 && (
                                  <span
                                    className="self-center text-[9px] text-muted-foreground"
                                    aria-hidden
                                  >
                                    ・
                                  </span>
                                )}
                                {entry.event.kind === "atBat" ? (
                                  <ScorebookAtBatLine entry={entry} />
                                ) : (
                                  <span className="text-[10px] leading-tight text-primary">
                                    {formatEventNotation(entry.event)}
                                  </span>
                                )}
                              </Fragment>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-muted/40 font-semibold">
              <td className="sticky left-0 z-10 w-8 min-w-8 border-r border-border bg-muted px-1 py-2 text-center text-[10px] sm:text-xs">
                計
              </td>
              <td className="sticky left-8 z-10 w-28 min-w-28 border-r border-border bg-muted px-1 py-2 sm:text-xs" />
              <td className="sticky left-36 z-10 w-8 min-w-8 border-r border-border bg-muted px-0 py-2" />
              <td className={cn(tdStat, "text-foreground")}>{totals.atBats}</td>
              <td className={cn(tdStat, "text-foreground")}>{totals.hits}</td>
              <td className={cn(tdStat, "text-foreground")}>{totals.runs}</td>
              <td className={cn(tdStat, "text-foreground")}>{totals.rbi}</td>
              <td className={cn(tdStat, "text-foreground")}>{totals.walks}</td>
              <td className={cn(tdStat, "text-foreground")}>
                {totals.hitByPitch}
              </td>
              <td className={cn(tdStat, "text-foreground")}>
                {totals.strikeouts}
              </td>
              <td className={cn(tdStat, "text-foreground")}>
                {totals.sacrifice}
              </td>
              <td className={cn(tdStat, "text-foreground")}>
                {totals.sacrificeFlies}
              </td>
              <td
                className={cn(tdStat, "border-r border-border text-foreground")}
              >
                {formatBattingAverage(totals.hits, totals.atBats)}
              </td>
              {Array.from({ length: innings }, (_, i) => (
                <td key={`tot-${i + 1}`} className="bg-muted/20" />
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
