"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppGame } from "@/lib/app-state/types";
import { getPlayerById } from "@/lib/app-state/selectors";
import type {
  Base,
  BaseRunningEvent,
  BaseRunningType,
  RunnerDestination,
  RunnerMovement,
  Snapshot,
  TeamSide,
} from "@/lib/domain/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getConventionalAdvanceDestination,
  getSafeRunnerDestinations,
} from "@/lib/app-state/runner-options";

export interface BaseRunningEventResult {
  type: BaseRunningType;
  movements: RunnerMovement[];
  rbiCreditBatterId?: string;
}

interface BaseRunningEventSheetProps {
  game: AppGame;
  onEvent: (payload: BaseRunningEventResult) => void;
  initialEvent?: BaseRunningEvent;
  initialRunnerId?: string;
  snapshot?: Snapshot;
  submitLabel?: string;
}

const EVENT_TYPES: { type: BaseRunningType; label: string; isOut: boolean }[] =
  [
    { type: "steal", label: "盗塁", isOut: false },
    { type: "caughtStealing", label: "盗塁死", isOut: true },
    { type: "wildPitch", label: "暴投", isOut: false },
    { type: "passedBall", label: "捕逸", isOut: false },
    { type: "pickOff", label: "牽制死", isOut: true },
    { type: "balk", label: "ボーク", isOut: false },
    { type: "otherAdvance", label: "その他の進塁", isOut: false },
    { type: "otherOut", label: "走塁死", isOut: true },
  ];

function destinationLabel(destination: RunnerDestination): string {
  if (destination === "out") return "アウト";
  if (destination === "home") return "ホーム";
  return destination === "second" ? "2塁" : "3塁";
}

export function BaseRunningEventSheet({
  game,
  onEvent,
  initialEvent,
  initialRunnerId,
  snapshot,
  submitLabel = "走塁を記録",
}: BaseRunningEventSheetProps) {
  const effectiveSnapshot = snapshot ?? game.currentState;
  const runners = effectiveSnapshot.runners;
  const teamSide: TeamSide = effectiveSnapshot.half === "top" ? "away" : "home";
  // Substitutes bat too, so credit goes to whoever is in the lineup now.
  const activeBatters = effectiveSnapshot.activeLineup[teamSide].flatMap(
    (playerId, index) => {
      const player = getPlayerById(game, playerId);
      return player
        ? [{ id: playerId, name: player.name, order: index + 1 }]
        : [];
    }
  );
  const [selectedType, setSelectedType] = useState<BaseRunningType>(
    initialEvent?.type ?? "steal"
  );
  const [selectedRunnerIds, setSelectedRunnerIds] = useState<string[]>(
    initialEvent?.movements.map((movement) => movement.playerId) ?? []
  );
  const [destinationByRunnerId, setDestinationByRunnerId] = useState<
    Record<string, RunnerDestination>
  >(
    Object.fromEntries(
      initialEvent?.movements.map((movement) => [
        movement.playerId,
        movement.to,
      ]) ?? []
    )
  );
  const [creditRbi, setCreditRbi] = useState(
    initialEvent?.movements.some((movement) => movement.isRBI) ?? false
  );
  const [rbiBatterId, setRbiBatterId] = useState(
    initialEvent?.rbiCreditBatterId ?? ""
  );
  const autoInitializedRunnerKey = useRef<string | null>(null);

  useEffect(() => {
    if (!initialEvent) return;
    setSelectedType(initialEvent.type);
    setSelectedRunnerIds(
      initialEvent.movements.map((movement) => movement.playerId)
    );
    setDestinationByRunnerId(
      Object.fromEntries(
        initialEvent.movements.map((movement) => [
          movement.playerId,
          movement.to,
        ])
      )
    );
    setCreditRbi(initialEvent.movements.some((movement) => movement.isRBI));
    setRbiBatterId(initialEvent.rbiCreditBatterId ?? "");
  }, [initialEvent]);

  const runnerOptions = useMemo(() => {
    const options: { id: string; name: string; base: Base }[] = [];
    (["first", "second", "third"] as const).forEach((base) => {
      const playerId = runners[base];
      if (!playerId) return;
      const player = getPlayerById(game, playerId);
      if (player) options.push({ id: playerId, name: player.name, base });
    });
    return options;
  }, [game, runners]);

  const eventType = EVENT_TYPES.find((option) => option.type === selectedType)!;
  const defaultDestination = (base: Base, isOut: boolean): RunnerDestination =>
    isOut ? "out" : getConventionalAdvanceDestination(base);
  const hasHomeDestination = selectedRunnerIds.some(
    (playerId) => destinationByRunnerId[playerId] === "home"
  );
  const allDestinationsSelected = selectedRunnerIds.every((playerId) =>
    Boolean(destinationByRunnerId[playerId])
  );
  const canSubmit =
    selectedRunnerIds.length > 0 &&
    allDestinationsSelected &&
    (!creditRbi || (hasHomeDestination && Boolean(rbiBatterId)));

  useEffect(() => {
    if (initialEvent) return;
    const runner = initialRunnerId
      ? runnerOptions.find((option) => option.id === initialRunnerId)
      : runnerOptions.length === 1
        ? runnerOptions[0]
        : undefined;
    if (!runner) return;
    const key = `${initialRunnerId ?? "only"}:${runner.id}:${runner.base}`;
    if (autoInitializedRunnerKey.current === key) return;
    autoInitializedRunnerKey.current = key;
    setSelectedRunnerIds([runner.id]);
    setDestinationByRunnerId({
      [runner.id]: getConventionalAdvanceDestination(runner.base),
    });
    // Only the first render picks a runner; the event type is still "steal".
  }, [initialEvent, initialRunnerId, runnerOptions]);

  const toggleRunner = (playerId: string, checked: boolean) => {
    setSelectedRunnerIds((current) =>
      checked ? [...current, playerId] : current.filter((id) => id !== playerId)
    );
    if (checked) {
      const runner = runnerOptions.find((option) => option.id === playerId);
      if (runner) {
        setDestinationByRunnerId((current) => ({
          ...current,
          [playerId]:
            current[playerId] ??
            defaultDestination(runner.base, eventType.isOut),
        }));
      }
    }
    if (!checked) {
      setDestinationByRunnerId((current) => {
        const next = { ...current };
        delete next[playerId];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const movements = selectedRunnerIds.flatMap((playerId) => {
      const runner = runnerOptions.find((option) => option.id === playerId);
      if (!runner) return [];
      const to = destinationByRunnerId[playerId];
      if (!to) return [];
      return [
        {
          playerId,
          from: runner.base,
          to,
          isRBI: to === "home" && creditRbi,
        },
      ];
    });
    onEvent({
      type: selectedType,
      movements,
      ...(creditRbi && rbiBatterId ? { rbiCreditBatterId: rbiBatterId } : {}),
    });
  };

  if (runnerOptions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        塁上に走者がいません。
      </p>
    );
  }

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5">
      <div className="space-y-2">
        <Label>イベント</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EVENT_TYPES.map((option) => (
            <Button
              key={option.type}
              type="button"
              variant={selectedType === option.type ? "default" : "outline"}
              className="h-11 touch-manipulation"
              onClick={() => {
                setSelectedType(option.type);
                setDestinationByRunnerId(
                  Object.fromEntries(
                    selectedRunnerIds.flatMap((playerId) => {
                      const runner = runnerOptions.find(
                        (candidate) => candidate.id === playerId
                      );
                      return runner
                        ? [
                            [
                              playerId,
                              defaultDestination(runner.base, option.isOut),
                            ],
                          ]
                        : [];
                    })
                  )
                );
                setCreditRbi(false);
                setRbiBatterId("");
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>対象走者（複数選択可）</Label>
        {runnerOptions.map((runner) => {
          const selected = selectedRunnerIds.includes(runner.id);
          return (
            <div
              key={runner.id}
              className="space-y-3 rounded-xl border border-border p-3"
            >
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) =>
                    toggleRunner(runner.id, checked === true)
                  }
                />
                <span className="font-medium">
                  {runner.base === "first"
                    ? "1塁"
                    : runner.base === "second"
                      ? "2塁"
                      : "3塁"}
                  ・{runner.name}
                </span>
              </label>
              {selected && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={destinationByRunnerId[runner.id] ?? ""}
                  onValueChange={(value) =>
                    value &&
                    setDestinationByRunnerId((current) => ({
                      ...current,
                      [runner.id]: value as RunnerDestination,
                    }))
                  }
                  className="grid w-full grid-cols-4 gap-2"
                >
                  {[
                    ...getSafeRunnerDestinations(runner.base).filter(
                      (destination) => destination !== runner.base
                    ),
                    "out" as const,
                  ].map((destination) => (
                    <ToggleGroupItem
                      key={destination}
                      value={destination}
                      className="min-h-11 data-[state=on]:font-bold"
                    >
                      {destinationLabel(destination)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>
          );
        })}
      </div>

      {hasHomeDestination && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              checked={creditRbi}
              onCheckedChange={(checked) => {
                setCreditRbi(checked === true);
                if (checked !== true) setRbiBatterId("");
              }}
            />
            <span className="text-sm font-medium">打点として記録する</span>
          </label>
          {creditRbi && (
            <Select value={rbiBatterId} onValueChange={setRbiBatterId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="打点を付ける打者" />
              </SelectTrigger>
              <SelectContent>
                {activeBatters.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    #{player.order} {player.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <Button
        type="button"
        className="h-12 w-full text-base font-semibold"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
