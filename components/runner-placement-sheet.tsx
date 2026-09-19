"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import type { Base, Runners, TeamSide } from "@/lib/domain/types";

const BASES: readonly Base[] = ["first", "second", "third"];
const BASE_LABELS: Record<Base, string> = {
  first: "1塁",
  second: "2塁",
  third: "3塁",
};
const NO_RUNNER = "none";

const TIE_BREAK_PRESETS: { label: string; bases: readonly Base[] }[] = [
  { label: "タイブレーク（一・二塁）", bases: ["first", "second"] },
  { label: "タイブレーク（満塁）", bases: ["first", "second", "third"] },
  { label: "タイブレーク（二塁のみ）", bases: ["second"] },
];

/**
 * Tie-break runners are the batters who hit just before the leadoff batter:
 * the previous batter takes the lowest base, the one before them the next.
 */
function tieBreakRunners(
  lineup: readonly string[],
  leadoffIndex: number,
  bases: readonly Base[]
): Runners {
  const runners: Runners = { first: null, second: null, third: null };
  if (lineup.length <= bases.length) return runners;
  bases.forEach((base, offset) => {
    const index =
      (leadoffIndex - 1 - offset + lineup.length * 2) % lineup.length;
    runners[base] = lineup[index];
  });
  return runners;
}

export function RunnerPlacementSheet({
  game,
  onSubmit,
}: {
  game: AppGame;
  onSubmit: (runners: Runners) => void;
}) {
  const snapshot = game.currentState;
  const teamSide: TeamSide = snapshot.half === "top" ? "away" : "home";
  const lineup = snapshot.activeLineup[teamSide];
  const [runners, setRunners] = useState<Runners>({ ...snapshot.runners });

  const placedIds = BASES.flatMap((base) => runners[base] ?? []);
  const hasDuplicate = new Set(placedIds).size !== placedIds.length;
  const isUnchanged = BASES.every(
    (base) => runners[base] === snapshot.runners[base]
  );

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5">
      <p className="text-sm text-muted-foreground">
        打席を消費せずに塁上の走者を決めます。タイブレークの開始時や、審判の裁定で走者を戻すときに使います。
      </p>

      <div className="space-y-2">
        <Label>プリセット</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TIE_BREAK_PRESETS.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="secondary"
              className="h-11 touch-manipulation"
              disabled={lineup.length <= preset.bases.length}
              onClick={() =>
                setRunners(
                  tieBreakRunners(
                    lineup,
                    snapshot.currentBatterIndex[teamSide],
                    preset.bases
                  )
                )
              }
            >
              {preset.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-11 touch-manipulation"
            onClick={() =>
              setRunners({ first: null, second: null, third: null })
            }
          >
            走者なしにする
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {[...BASES].reverse().map((base) => (
          <div key={base} className="space-y-1.5">
            <Label htmlFor={`placed-${base}`}>{BASE_LABELS[base]}の走者</Label>
            <Select
              value={runners[base] ?? NO_RUNNER}
              onValueChange={(value) =>
                setRunners((current) => ({
                  ...current,
                  [base]: value === NO_RUNNER ? null : value,
                }))
              }
            >
              <SelectTrigger
                id={`placed-${base}`}
                className="h-12 w-full text-base"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RUNNER}>なし</SelectItem>
                {lineup.map((playerId, index) => (
                  <SelectItem key={playerId} value={playerId}>
                    {getPlayerById(game, playerId)?.name ?? `${index + 1}番`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {hasDuplicate && (
        <p className="text-sm font-medium text-destructive">
          同じ選手が複数の塁に入っています。
        </p>
      )}

      <Button
        type="button"
        className="h-12 w-full text-base font-semibold"
        disabled={hasDuplicate || isUnchanged}
        onClick={() => onSubmit(runners)}
      >
        走者を配置
      </Button>
    </div>
  );
}
