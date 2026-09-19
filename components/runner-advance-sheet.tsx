"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  AtBatResult,
  Base,
  BattedBall,
  RunnerMovement,
  Snapshot,
} from "@/lib/domain/types";
import type { AppGame } from "@/lib/app-state/types";
import { getCurrentBatter, getPlayerById } from "@/lib/app-state/selectors";
import { getDefaultMovementsForSelection } from "@/lib/app-state/event-factory";
import { RESULT_LABELS } from "@/lib/domain/catalog";
import {
  evaluateMovementOutcome,
  initializeRbiByPlayerId,
  limitWalkOffScoringMovements,
} from "@/lib/domain/runner-advance";
import { SituationMiniHeader } from "@/components/situation-mini-header";
import { getSafeRunnerDestinations } from "@/lib/app-state/runner-options";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";

type Destination = Base | "home" | "out";

function defaultRbiWhenScoring(
  result: AtBatResult,
  from: "batter" | Base,
  to: Destination
): boolean {
  if (to !== "home") return false;
  if (from === "batter" && result === "homerun") return true;
  if (from === "batter") return false;
  return [
    "single",
    "double",
    "triple",
    "homerun",
    "sacrifice",
    "walk",
    "hitByPitch",
  ].includes(result);
}

interface RunnerAdvanceSheetProps {
  game: AppGame;
  result: AtBatResult;
  detail?: string;
  battedBall?: BattedBall;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    movements: RunnerMovement[],
    outsInPlay: number,
    runsScored: number
  ) => void;
  context?: {
    snapshot: Snapshot;
    batterId: string;
  };
  initialMovementsOverride?: RunnerMovement[];
  onReselectResult?: () => void;
}

interface RunnerState {
  playerId: string;
  name: string;
  from: "batter" | Base;
  to: Destination;
  outType?: RunnerMovement["outType"];
}

export function RunnerAdvanceSheet({
  game,
  result,
  detail,
  battedBall,
  open,
  onOpenChange,
  onConfirm,
  context,
  initialMovementsOverride,
  onReselectResult,
}: RunnerAdvanceSheetProps) {
  const snapshot = context?.snapshot ?? game.currentState;
  const runners = snapshot.runners;
  const outs = snapshot.outs;
  const currentBatter = context
    ? getPlayerById(game, context.batterId)
    : getCurrentBatter(game);

  const initialMovements = useMemo(() => {
    if (initialMovementsOverride) return initialMovementsOverride;
    if (!currentBatter) return [];
    return getDefaultMovementsForSelection(
      result,
      detail,
      runners,
      currentBatter.id,
      outs,
      battedBall
    );
  }, [
    result,
    detail,
    runners,
    currentBatter,
    outs,
    battedBall,
    initialMovementsOverride,
  ]);

  const [runnerStates, setRunnerStates] = useState<RunnerState[]>([]);
  const [rbiByPlayerId, setRbiByPlayerId] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    if (!open || !currentBatter) return;

    const stateBySource = new Map<RunnerState["from"], RunnerState>();
    for (const base of ["third", "second", "first"] as const) {
      const playerId = runners[base];
      if (!playerId) continue;
      const player = getPlayerById(game, playerId);
      const defaultMovement = initialMovements.find(
        (movement) => movement.from === base
      );
      stateBySource.set(base, {
        playerId,
        name: player?.name ?? "不明",
        from: base,
        to: defaultMovement?.to ?? base,
        outType: defaultMovement?.outType,
      });
    }
    const batterMovement = initialMovements.find(
      (movement) => movement.from === "batter"
    );
    stateBySource.set("batter", {
      playerId: currentBatter.id,
      name: currentBatter.name,
      from: "batter",
      to: batterMovement?.to ?? "first",
      outType: batterMovement?.outType,
    });

    const orderedSources = [
      ...initialMovements.map((movement) => movement.from),
      "third",
      "second",
      "first",
      "batter",
    ].filter(
      (source, index, sources): source is RunnerState["from"] =>
        sources.indexOf(source) === index &&
        stateBySource.has(source as RunnerState["from"])
    );
    const states = orderedSources.map((source) => stateBySource.get(source)!);

    setRunnerStates(states);
    setRbiByPlayerId(
      initializeRbiByPlayerId(
        result,
        states,
        initialMovements,
        defaultRbiWhenScoring
      )
    );
  }, [open, game, runners, currentBatter, initialMovements, result]);

  const updateRunnerDestination = (playerId: string, to: Destination) => {
    setRunnerStates((prev) => {
      const old = prev.find((r) => r.playerId === playerId);
      if (old) {
        setRbiByPlayerId((prevRbi) => {
          const next = { ...prevRbi };
          if (to === "home") {
            next[playerId] = defaultRbiWhenScoring(result, old.from, to);
          } else {
            delete next[playerId];
          }
          return next;
        });
      }
      return prev.map((r) =>
        r.playerId === playerId
          ? {
              ...r,
              to,
              ...(to === "out" && r.from !== "batter"
                ? {
                    outType:
                      r.outType ??
                      (result === "fieldersChoice" || result === "doublePlay"
                        ? "force"
                        : "tag"),
                  }
                : { outType: undefined }),
            }
          : r
      );
    });
  };

  const setRunnerOutType = (
    playerId: string,
    outType: NonNullable<RunnerMovement["outType"]>
  ) => {
    setRunnerStates((current) =>
      current.map((runner) =>
        runner.playerId === playerId ? { ...runner, outType } : runner
      )
    );
  };

  const moveRunnerState = (index: number, direction: -1 | 1) => {
    setRunnerStates((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const setRbiForRunner = (playerId: string, value: boolean) => {
    setRbiByPlayerId((prev) => ({ ...prev, [playerId]: value }));
  };

  const buildMovements = (): RunnerMovement[] =>
    runnerStates.map((runner) => {
      const isRBI =
        runner.to === "home"
          ? runner.from === "batter" && result === "homerun"
            ? true
            : (rbiByPlayerId[runner.playerId] ??
              defaultRbiWhenScoring(result, runner.from, runner.to))
          : false;
      return {
        playerId: runner.playerId,
        from: runner.from,
        to: runner.to,
        isRBI,
        ...(runner.to === "out" && runner.outType
          ? { outType: runner.outType }
          : {}),
      };
    });

  const calculatePreview = () => {
    const movements = buildMovements();
    const outcome = evaluateMovementOutcome({
      currentOuts: outs,
      movements,
      batterId: currentBatter?.id,
      result,
    });
    const scoringMovements = limitWalkOffScoringMovements({
      scoringMovements: outcome.scoringMovements,
      result,
      snapshot,
      regulationInnings: game.config.regulationInnings,
    });
    const scorerIds = new Set(
      scoringMovements.map((movement) => movement.playerId)
    );
    return {
      runsScored: scoringMovements.length,
      outsAdded: outcome.outsRecorded,
      totalOuts: Math.min(outs + outcome.outsRecorded, 3),
      scorers: runnerStates
        .filter((runner) => scorerIds.has(runner.playerId))
        .map((runner) => runner.name),
    };
  };

  const checkDuplicateBases = () => {
    const occupiedBases: Record<Base, string[]> = {
      first: [],
      second: [],
      third: [],
    };

    for (const runner of runnerStates) {
      if (
        runner.to === "first" ||
        runner.to === "second" ||
        runner.to === "third"
      ) {
        occupiedBases[runner.to].push(runner.name);
      }
    }

    const duplicates: string[] = [];
    for (const [base, names] of Object.entries(occupiedBases)) {
      if (names.length > 1) {
        const baseLabel =
          base === "first" ? "1塁" : base === "second" ? "2塁" : "3塁";
        duplicates.push(`${baseLabel}に${names.join("と")}が重複`);
      }
    }

    return duplicates;
  };

  const preview = calculatePreview();
  const duplicates = checkDuplicateBases();
  const hasErrors = duplicates.length > 0;

  const handleConfirm = () => {
    const movements = buildMovements();
    onConfirm(movements, preview.outsAdded, preview.runsScored);
  };

  const getFromLabel = (from: "batter" | Base) => {
    switch (from) {
      case "batter":
        return "打者";
      case "first":
        return "1塁";
      case "second":
        return "2塁";
      case "third":
        return "3塁";
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="left-1/2 right-auto flex max-h-[88dvh] w-[min(100%,42rem)] -translate-x-1/2 flex-col gap-0 overflow-hidden rounded-t-[1.75rem] border-x border-t bg-card p-0 shadow-[0_-20px_60px_rgba(0,0,0,0.18)]"
      >
        <SheetHeader className="shrink-0 border-b border-border bg-card px-5 py-4">
          <SheetTitle className="text-lg font-extrabold">
            ランナー進塁確認
          </SheetTitle>
          <SituationMiniHeader
            game={game}
            snapshot={snapshot}
            batterId={currentBatter?.id}
          />
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          <div className="rounded-xl bg-secondary/70 px-4 py-3">
            <div>
              <span className="text-sm text-muted-foreground">打席結果: </span>
              <span className="text-sm font-semibold text-foreground">
                {RESULT_LABELS[result]}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {runnerStates.map((runner, runnerIndex) => (
              <div key={runner.playerId} className="space-y-2">
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <Label className="text-sm font-medium">
                    {getFromLabel(runner.from)}: {runner.name}
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={runnerIndex === 0}
                      onClick={() => moveRunnerState(runnerIndex, -1)}
                      aria-label={`${runner.name}のプレー順を前へ`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={runnerIndex === runnerStates.length - 1}
                      onClick={() => moveRunnerState(runnerIndex, 1)}
                      aria-label={`${runner.name}のプレー順を後へ`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                </div>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="lg"
                  value={runner.to}
                  onValueChange={(value) => {
                    if (value)
                      updateRunnerDestination(
                        runner.playerId,
                        value as Destination
                      );
                  }}
                  className="grid w-full grid-cols-4 gap-2"
                >
                  {getSafeRunnerDestinations(runner.from).map((value) => {
                    const label =
                      value === "first"
                        ? "1塁"
                        : value === "second"
                          ? "2塁"
                          : value === "third"
                            ? "3塁"
                            : "ホーム";
                    return (
                      <ToggleGroupItem
                        key={value}
                        value={value}
                        className="min-h-11 text-sm font-semibold"
                      >
                        {label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
                <Button
                  type="button"
                  variant={runner.to === "out" ? "destructive" : "outline"}
                  className="min-h-11 w-full border-destructive/40 text-sm font-semibold"
                  onClick={() =>
                    updateRunnerDestination(runner.playerId, "out")
                  }
                >
                  アウト
                </Button>
                {runner.to === "out" && runner.from !== "batter" && (
                  <div className="grid grid-cols-2 gap-2">
                    {(["force", "tag"] as const).map((outType) => (
                      <Button
                        key={outType}
                        type="button"
                        variant={
                          runner.outType === outType ? "secondary" : "outline"
                        }
                        className="min-h-11"
                        onClick={() =>
                          setRunnerOutType(runner.playerId, outType)
                        }
                      >
                        {outType === "force"
                          ? "フォースアウト"
                          : "タッチアウト"}
                      </Button>
                    ))}
                  </div>
                )}
                {runner.to === "home" &&
                  !(runner.from === "batter" && result === "homerun") && (
                    <div className="flex items-start gap-2 pt-1">
                      <Checkbox
                        id={`rbi-${runner.playerId}`}
                        checked={rbiByPlayerId[runner.playerId] ?? false}
                        onCheckedChange={(v) =>
                          setRbiForRunner(runner.playerId, !!v)
                        }
                      />
                      <Label
                        htmlFor={`rbi-${runner.playerId}`}
                        className="cursor-pointer text-xs font-normal leading-snug text-muted-foreground"
                      >
                        この得点を打者の打点に含める
                      </Label>
                    </div>
                  )}
              </div>
            ))}
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
              <p className="text-sm text-destructive font-medium">警告</p>
              {duplicates.map((d, i) => (
                <p key={i} className="text-sm text-destructive">
                  {d}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-1 rounded-xl bg-secondary px-4 py-3">
            <p className="text-sm font-medium text-foreground">プレビュー</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">得点:</span>
              <span className="font-mono font-semibold text-primary">
                +{preview.runsScored}
                {preview.scorers.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({preview.scorers.join(", ")})
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">アウト:</span>
              <span className="font-mono">
                +{preview.outsAdded} → 合計{preview.totalOuts}アウト
              </span>
            </div>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-[1fr_1.35fr] gap-2 border-t border-border bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className="h-12"
            disabled={!onReselectResult}
            onClick={onReselectResult}
          >
            <RotateCcw className="size-4" />
            結果を選び直す
          </Button>
          <Button
            className="h-12 text-base font-bold"
            onClick={handleConfirm}
            disabled={hasErrors}
          >
            確定
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
