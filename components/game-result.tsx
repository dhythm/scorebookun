"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Scoreboard } from "@/components/scoreboard";
import { BattingScorebookTable } from "@/components/batting-scorebook-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from "@/lib/game-context";
import type { Half, TimelineEntry } from "@/lib/domain/types";
import type { AppGame } from "@/lib/app-state/types";
import { getPlayerById } from "@/lib/app-state/selectors";
import { formatEventNotation } from "@/lib/domain/notation";
import { RotateCcw, Edit, Share2, Download } from "lucide-react";
import { toast } from "sonner";
import { toPersistedGame } from "@/lib/app-state/selectors";
import { downloadJsonFile, exportFileName } from "@/lib/export/download-file";
import { exportGameAsJson, exportGameAsText } from "@/lib/export/game-log";
import { getPitcherStats } from "@/lib/domain/pitching";
import { GameHistory } from "@/components/game-history";
import { ShareGameButton } from "@/components/share-game-button";
import { HomeLink } from "@/components/home-link";
import { AppName } from "@/components/app-name";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EventIntegrityAlert } from "@/components/event-integrity-alert";
import { PrintableScorebook } from "@/components/printable-scorebook";
import { PrintScorebookButton } from "@/components/print-scorebook-button";
import { DisplaySettingsDialog } from "@/components/display-settings-dialog";
import { getHalfInningLeftOnBase, getTeamSummary } from "@/lib/domain/stats";
import { formatFieldingPosition } from "@/lib/domain/notation";

function InningDetails({ game }: { game: AppGame }) {
  const groupedEntries: Record<string, TimelineEntry[]> = {};

  for (const entry of game.timeline) {
    if (!entry.applied) continue;
    const key = `${entry.inning}-${entry.half}`;
    if (!groupedEntries[key]) {
      groupedEntries[key] = [];
    }
    groupedEntries[key].push(entry);
  }

  const innings = Object.keys(groupedEntries).sort((a, b) => {
    const [aInning, aHalf] = a.split("-");
    const [bInning] = b.split("-");
    if (aInning !== bInning) return parseInt(aInning) - parseInt(bInning);
    return aHalf === "top" ? -1 : 1;
  });
  const leftOnBaseByHalf = new Map(
    getHalfInningLeftOnBase(game.timeline).map((summary) => [
      `${summary.inning}-${summary.half}`,
      summary.leftOnBase,
    ])
  );

  return (
    <Card className="gap-2 overflow-hidden border-border py-4">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-base font-semibold text-foreground">
          イニング詳細
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="single" collapsible className="w-full">
          {innings.map((key) => {
            const [inning, half] = key.split("-") as [string, Half];
            const entries = groupedEntries[key];
            const teamSide = half === "top" ? "away" : "home";
            const teamName = game.teams[teamSide].name;

            return (
              <AccordionItem key={key} value={key}>
                <AccordionTrigger className="min-h-12 px-4 text-sm hover:no-underline">
                  {inning}回{half === "top" ? "表" : "裏"} ({teamName})
                  {leftOnBaseByHalf.has(key)
                    ? `・残塁${leftOnBaseByHalf.get(key)}`
                    : ""}
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {entries.map((entry, index) => {
                      const event = entry.event;
                      if (event.kind === "atBat") {
                        const batter = getPlayerById(game, event.batterId);
                        return (
                          <div
                            key={event.id}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-muted/50 px-3 py-2.5 text-sm"
                          >
                            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                              #{index + 1}
                            </span>
                            <span className="font-medium">
                              {batter?.name ?? "不明"}
                            </span>
                            <span className="text-muted-foreground">:</span>
                            <span>{formatEventNotation(event)}</span>
                            {event.note && (
                              <span className="text-muted-foreground text-xs">
                                ({event.note})
                              </span>
                            )}
                            {entry.runsScored > 0 && (
                              <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                +{entry.runsScored}点
                              </span>
                            )}
                          </div>
                        );
                      }

                      if (event.kind === "baseRunning") {
                        return (
                          <div
                            key={event.id}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm text-muted-foreground"
                          >
                            <span className="w-6">#{index + 1}</span>
                            <span>{formatEventNotation(event)}</span>
                            {entry.runsScored > 0 && (
                              <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                +{entry.runsScored}点
                              </span>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={event.id}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-sm text-muted-foreground"
                        >
                          <span className="w-6">#{index + 1}</span>
                          <span>{formatEventNotation(event)}</span>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function TeamSummary({ game }: { game: AppGame }) {
  return (
    <Card className="gap-3 border-border py-4">
      <CardHeader className="px-4 py-0">
        <CardTitle className="text-base">チーム集計</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2">
        {(["away", "home"] as const).map((side) => {
          const summary = getTeamSummary(game.timeline, side);
          const errorDetail =
            summary.errorDetails.length === 0
              ? "なし"
              : summary.errorDetails
                  .map(({ position, count }) =>
                    position === "unknown"
                      ? `位置不明 ${count}`
                      : `${formatFieldingPosition(position)} ${count}`
                  )
                  .join("、");
          return (
            <div key={side} className="rounded-xl bg-muted/60 p-3">
              <p className="truncate text-sm font-semibold">
                {game.config.teams[side].name}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">盗塁</dt>
                  <dd className="mt-0.5 text-xl font-bold tabular-nums">
                    {summary.stolenBases}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">残塁</dt>
                  <dd className="mt-0.5 text-xl font-bold tabular-nums">
                    {summary.leftOnBase}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                失策内訳: {errorDetail}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PitchingSummary({ game }: { game: AppGame }) {
  return (
    <Card className="gap-3 border-border py-4">
      <CardHeader className="px-4 py-0">
        <CardTitle className="text-base">投手成績</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2">
        {(["away", "home"] as const).map((side) => {
          const team = game.config.teams[side];
          const roster = [...team.players, ...(team.benchPlayers ?? [])];
          const pitchingLines = getPitcherStats(
            game.timeline,
            side,
            team.startingPitcherId ?? null
          );
          return (
            <div key={side} className="space-y-3 rounded-xl bg-muted/60 p-3">
              <p className="truncate text-sm font-semibold">{team.name}</p>
              {pitchingLines.map((stats, index) => {
                const pitcherName =
                  stats.pitcherId === null
                    ? team.startingPitcherName || `${team.name} 先発`
                    : (roster.find((player) => player.id === stats.pitcherId)
                        ?.name ?? stats.pitcherId);
                return (
                  <div
                    key={`${stats.pitcherId ?? "starter"}-${index}`}
                    className="rounded-lg bg-card p-3"
                  >
                    <p className="truncate text-sm font-semibold">
                      {pitcherName}
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        {stats.role === "starter" ? "先発" : "救援"}
                      </span>
                    </p>
                    <dl className="mt-3 grid grid-cols-5 gap-1 text-center">
                      {[
                        { label: "投球回", value: stats.inningsPitched },
                        { label: "被安打", value: stats.hitsAllowed },
                        { label: "失点", value: stats.runsAllowed },
                        { label: "与四球", value: stats.walksAllowed },
                        { label: "奪三振", value: stats.strikeouts },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <dt className="text-[11px] text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="mt-1 text-base font-semibold tabular-nums">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function GameResult() {
  const { game, dispatch, resetGame } = useGame();
  const router = useRouter();
  const [showNewGameDialog, setShowNewGameDialog] = useState(false);

  if (!game) return null;

  const handleNewGame = () => {
    resetGame();
    setShowNewGameDialog(false);
    router.replace("/");
  };

  const handleContinueGame = () => {
    if (!dispatch({ type: "RESUME_GAME" })) return;
  };

  const handleShare = async () => {
    const text = exportGameAsText(toPersistedGame(game));
    try {
      if (navigator.share) {
        await navigator.share({ title: "試合結果", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("試合結果をコピーしました");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        toast.error("共有できませんでした");
      }
    }
  };

  const handleExport = () => {
    downloadJsonFile(
      exportFileName("game", game.date),
      exportGameAsJson(toPersistedGame(game))
    );
    toast.success("試合をエクスポートしました");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="app-header sticky top-0 z-40 flex items-center justify-between border-b border-primary-foreground/10 bg-primary px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-primary-foreground print:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <HomeLink />
          <div className="text-base font-bold">
            <AppName />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <ShareGameButton />
          <DisplaySettingsDialog />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-4 lg:px-6 print:hidden">
        <div className="flex items-end justify-between gap-3 px-1 pb-1 pt-2">
          <h1 className="text-2xl font-bold tracking-tight">試合終了</h1>
          <time
            dateTime={game.date}
            className="pb-0.5 text-sm tabular-nums text-muted-foreground"
          >
            {game.date.slice(0, 10).replaceAll("-", "/")}
          </time>
        </div>
        <EventIntegrityAlert game={game} />
        <Scoreboard game={game} />
        {game.currentState.gameEndReasonDetail && (
          <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
            終了理由: {game.currentState.gameEndReasonDetail}
          </p>
        )}
        <Card className="border-border py-4 gap-2">
          <CardHeader className="px-4 pb-0 pt-0 sm:px-6">
            <CardTitle className="text-base">打撃成績</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-0 pt-2 sm:px-6">
            <Tabs defaultValue="away" className="gap-3">
              <TabsList className="grid h-11 w-full grid-cols-2 p-1 touch-manipulation">
                <TabsTrigger
                  value="away"
                  className="min-w-0 truncate text-sm data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground"
                >
                  {game.teams.away.name || "先攻"}
                </TabsTrigger>
                <TabsTrigger
                  value="home"
                  className="min-w-0 truncate text-sm data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground"
                >
                  {game.teams.home.name || "後攻"}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="away" className="mt-0">
                <BattingScorebookTable game={game} teamSide="away" />
              </TabsContent>
              <TabsContent value="home" className="mt-0">
                <BattingScorebookTable game={game} teamSide="home" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <PitchingSummary game={game} />
        <TeamSummary game={game} />
        <InningDetails game={game} />
        <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">試合データ</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="secondary" className="h-11" onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              共有
            </Button>
            <Button variant="secondary" className="h-11" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              エクスポート
            </Button>
            <PrintScorebookButton />
            <Button
              variant="outline"
              className="h-11"
              onClick={handleContinueGame}
            >
              <Edit className="mr-2 h-4 w-4" />
              試合を続ける
            </Button>
            <Button
              className="col-span-2 h-11 font-bold sm:col-span-1"
              onClick={() => setShowNewGameDialog(true)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              新しい試合
            </Button>
          </div>
        </section>
        <GameHistory />
      </main>
      <PrintableScorebook game={game} />

      <AlertDialog open={showNewGameDialog} onOpenChange={setShowNewGameDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>新しい試合を開始しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              試合設定画面へ戻ります。現在の試合は履歴からもう一度開けます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleNewGame}>
              新しい試合を開始
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
