"use client";

import type { Runners } from "@/lib/domain/types";
import type { AppGame } from "@/lib/app-state/types";
import { getPlayerById } from "@/lib/app-state/selectors";

interface DiamondFieldProps {
  runners: Runners;
  game: AppGame;
  onRunnerSelect?: (runnerId: string) => void;
}

export function DiamondField({
  runners,
  game,
  onRunnerSelect,
}: DiamondFieldProps) {
  const firstRunner = runners.first ? getPlayerById(game, runners.first) : null;
  const secondRunner = runners.second
    ? getPlayerById(game, runners.second)
    : null;
  const thirdRunner = runners.third ? getPlayerById(game, runners.third) : null;

  return (
    <div className="field-surface relative mx-auto w-full max-w-[200px] rounded-2xl border border-border">
      <svg viewBox="0 0 100 100" className="w-full h-auto" aria-hidden="true">
        <line
          x1="50"
          y1="15"
          x2="85"
          y2="50"
          stroke="currentColor"
          strokeWidth="1"
          className="text-border"
        />
        <line
          x1="85"
          y1="50"
          x2="50"
          y2="85"
          stroke="currentColor"
          strokeWidth="1"
          className="text-border"
        />
        <line
          x1="50"
          y1="85"
          x2="15"
          y2="50"
          stroke="currentColor"
          strokeWidth="1"
          className="text-border"
        />
        <line
          x1="15"
          y1="50"
          x2="50"
          y2="15"
          stroke="currentColor"
          strokeWidth="1"
          className="text-border"
        />

        <rect
          x="45"
          y="10"
          width="10"
          height="10"
          transform="rotate(45 50 15)"
          className={runners.second ? "fill-accent" : "fill-card stroke-border"}
          strokeWidth="1.5"
        />

        <rect
          x="80"
          y="45"
          width="10"
          height="10"
          transform="rotate(45 85 50)"
          className={runners.first ? "fill-accent" : "fill-card stroke-border"}
          strokeWidth="1.5"
        />

        <rect
          x="10"
          y="45"
          width="10"
          height="10"
          transform="rotate(45 15 50)"
          className={runners.third ? "fill-accent" : "fill-card stroke-border"}
          strokeWidth="1.5"
        />

        <polygon
          points="50,80 45,88 50,92 55,88"
          className="fill-card stroke-border"
          strokeWidth="1.5"
        />
      </svg>

      <div className="absolute inset-0">
        {secondRunner && (
          <button
            type="button"
            className="absolute left-1/2 top-0 flex min-h-11 min-w-11 -translate-x-1/2 touch-manipulation items-center justify-center max-w-[48%] rounded-lg bg-accent px-1 text-[11px] font-bold text-accent-foreground shadow-sm"
            onClick={() => onRunnerSelect?.(secondRunner.id)}
            aria-label={`2塁走者 ${secondRunner.name} の走塁を入力`}
          >
            <span className="truncate">{secondRunner.name}</span>
          </button>
        )}
        {firstRunner && (
          <button
            type="button"
            className="absolute right-0 top-[35%] flex min-h-11 min-w-11 touch-manipulation items-center justify-center max-w-[48%] rounded-lg bg-accent px-1 text-[11px] font-bold text-accent-foreground shadow-sm"
            onClick={() => onRunnerSelect?.(firstRunner.id)}
            aria-label={`1塁走者 ${firstRunner.name} の走塁を入力`}
          >
            <span className="truncate">{firstRunner.name}</span>
          </button>
        )}
        {thirdRunner && (
          <button
            type="button"
            className="absolute left-0 top-[35%] flex min-h-11 min-w-11 touch-manipulation items-center justify-center max-w-[48%] rounded-lg bg-accent px-1 text-[11px] font-bold text-accent-foreground shadow-sm"
            onClick={() => onRunnerSelect?.(thirdRunner.id)}
            aria-label={`3塁走者 ${thirdRunner.name} の走塁を入力`}
          >
            <span className="truncate">{thirdRunner.name}</span>
          </button>
        )}
      </div>
    </div>
  );
}
