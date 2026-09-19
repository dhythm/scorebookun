"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppGame } from "@/lib/app-state/types";
import type {
  FieldingPosition,
  PositionChangeEvent,
  SubstitutionEvent,
  SubstitutionRole,
  TeamSide,
} from "@/lib/domain/types";
import {
  FIELDING_POSITION_LABELS,
  FIELDING_POSITIONS,
} from "@/lib/domain/catalog";
import { generateId } from "@/lib/game-utils";
import { getPitcherReplacementPlayerId } from "@/lib/domain/replay";
import {
  createPositionChangeEvent,
  createSubstitutionEvent,
} from "@/lib/app-state/event-factory";

type SheetMode = SubstitutionRole | "positionChange" | "rename";

const MODE_OPTIONS: { value: SheetMode; label: string }[] = [
  { value: "pinchHitter", label: "代打" },
  { value: "pinchRunner", label: "代走" },
  { value: "fielder", label: "守備交代" },
  { value: "pitcher", label: "投手交代" },
  { value: "positionChange", label: "守備位置変更" },
  { value: "rename", label: "選手名の修正" },
];

export function SubstitutionSheet({
  game,
  onSubmit,
  onAddBenchPlayer,
  onRenamePlayer,
}: {
  game: AppGame;
  onSubmit: (event: SubstitutionEvent | PositionChangeEvent) => void;
  /** Adds a player to the bench and returns their id, or null when refused. */
  onAddBenchPlayer?: (team: TeamSide, name: string) => string | null;
  onRenamePlayer?: (playerId: string, name: string) => void;
}) {
  const offense: TeamSide = game.currentState.half === "top" ? "away" : "home";
  const [team, setTeam] = useState<TeamSide>(offense);
  const [mode, setMode] = useState<SheetMode>("pinchHitter");
  const [outPlayerId, setOutPlayerId] = useState("");
  const [inPlayerId, setInPlayerId] = useState("");
  const [inPosition, setInPosition] = useState<FieldingPosition | "">("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [positionDraft, setPositionDraft] = useState<
    Record<string, FieldingPosition>
  >({});
  const [renamePlayerId, setRenamePlayerId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const isOffenseOnly = mode === "pinchHitter" || mode === "pinchRunner";

  useEffect(() => {
    if (isOffenseOnly) setTeam(offense);
    setOutPlayerId("");
    setInPlayerId("");
    setInPosition("");
    setPositionDraft({});
    setRenamePlayerId("");
    setRenameValue("");
  }, [offense, mode, isOffenseOnly]);

  const roster = useMemo(
    () => [
      ...game.config.teams[team].players,
      ...(game.config.teams[team].benchPlayers ?? []),
    ],
    [game.config.teams, team]
  );
  const activeIds = game.currentState.activeLineup[team];
  const activePitcherId = game.currentState.activePitcherId[team];
  const pitcherReplacementPlayerId = getPitcherReplacementPlayerId(
    game.currentState,
    game.timeline,
    team
  );
  const currentPositions = game.currentState.fieldingPositions[team];
  const runnerIds = Object.values(game.currentState.runners).filter(
    (playerId): playerId is string => playerId !== null
  );
  const outCandidates = roster.filter((player) => {
    if (mode === "pinchRunner") return runnerIds.includes(player.id);
    if (mode === "pitcher" && activePitcherId) {
      return player.id === pitcherReplacementPlayerId;
    }
    return activeIds.includes(player.id);
  });
  const inCandidates = roster.filter(
    (player) => !activeIds.includes(player.id) && player.id !== activePitcherId
  );
  // A pitcher outside the batting order (DH game) still fields a position.
  const playersInGame = roster.filter(
    (player) =>
      activeIds.includes(player.id) ||
      (player.id === activePitcherId &&
        pitcherReplacementPlayerId === activePitcherId)
  );
  const positionChanges = playersInGame.flatMap((player) => {
    const position = positionDraft[player.id];
    return position && position !== currentPositions[player.id]
      ? [{ playerId: player.id, position }]
      : [];
  });

  const resetSelections = (side: TeamSide) => {
    setTeam(side);
    setOutPlayerId("");
    setInPlayerId("");
    setInPosition("");
    setPositionDraft({});
    setRenamePlayerId("");
    setRenameValue("");
  };

  const handleOutPlayerChange = (playerId: string) => {
    setOutPlayerId(playerId);
    if (mode === "fielder") setInPosition(currentPositions[playerId] ?? "");
  };

  const handleAddPlayer = () => {
    const name = newPlayerName.trim();
    if (!name || !onAddBenchPlayer) return;
    const playerId = onAddBenchPlayer(team, name);
    if (!playerId) return;
    setNewPlayerName("");
    if (mode !== "positionChange" && mode !== "rename") {
      setInPlayerId(playerId);
    }
  };

  const handleSubmit = () => {
    if (mode === "rename") {
      const name = renameValue.trim();
      if (!renamePlayerId || !name) return;
      onRenamePlayer?.(renamePlayerId, name);
      setRenamePlayerId("");
      setRenameValue("");
      return;
    }
    if (mode === "positionChange") {
      if (positionChanges.length === 0) return;
      onSubmit(
        createPositionChangeEvent({
          id: generateId(),
          team,
          changes: positionChanges,
        })
      );
      return;
    }
    if (!outPlayerId || !inPlayerId) return;
    onSubmit(
      createSubstitutionEvent({
        id: generateId(),
        team,
        role: mode,
        outPlayerId,
        inPlayerId,
        ...(mode === "fielder" && inPosition ? { position: inPosition } : {}),
      })
    );
  };

  const canSubmit =
    mode === "rename"
      ? Boolean(renamePlayerId && renameValue.trim())
      : mode === "positionChange"
        ? positionChanges.length > 0
        : Boolean(outPlayerId && inPlayerId);

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5">
      <div className="space-y-2">
        <Label>交代種別</Label>
        <div className="grid grid-cols-2 gap-2">
          {MODE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={mode === option.value ? "default" : "outline"}
              className="h-11 touch-manipulation"
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>チーム</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["away", "home"] as const).map((side) => (
            <Button
              key={side}
              type="button"
              variant={team === side ? "secondary" : "outline"}
              className="h-11"
              disabled={isOffenseOnly && side !== offense}
              onClick={() => resetSelections(side)}
            >
              {side === "away" ? "先攻" : "後攻"}・
              {game.config.teams[side].name}
            </Button>
          ))}
        </div>
      </div>

      {mode === "rename" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="rename-player">修正する選手</Label>
            <Select
              value={renamePlayerId}
              onValueChange={(playerId) => {
                setRenamePlayerId(playerId);
                setRenameValue(
                  roster.find((player) => player.id === playerId)?.name ?? ""
                );
              }}
            >
              <SelectTrigger
                id="rename-player"
                className="h-12 w-full text-base"
              >
                <SelectValue placeholder="選手を選択" />
              </SelectTrigger>
              <SelectContent>
                {roster.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rename-value">正しい選手名</Label>
            <Input
              id="rename-value"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="h-12 bg-background text-base"
              autoComplete="off"
            />
          </div>
        </>
      )}

      {mode === "positionChange" && (
        <div className="space-y-2">
          <Label>出場中の選手の守備位置</Label>
          <p className="text-xs text-muted-foreground">
            変わる選手だけ選び直してください。野手が登板する場合は「投手」を選びます。
          </p>
          <ul className="space-y-2">
            {playersInGame.map((player) => (
              <li
                key={player.id}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-1.5"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {player.name}
                </span>
                <Select
                  value={
                    positionDraft[player.id] ??
                    currentPositions[player.id] ??
                    ""
                  }
                  onValueChange={(position) =>
                    setPositionDraft((current) => ({
                      ...current,
                      [player.id]: position as FieldingPosition,
                    }))
                  }
                >
                  <SelectTrigger
                    className="h-11 w-[8.5rem] shrink-0 bg-background text-sm"
                    aria-label={`${player.name}の守備位置`}
                  >
                    <SelectValue placeholder="未設定" />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELDING_POSITIONS.map((position) => (
                      <SelectItem key={position} value={position}>
                        {FIELDING_POSITION_LABELS[position]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode !== "rename" && mode !== "positionChange" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="out-player">退く選手</Label>
            <Select value={outPlayerId} onValueChange={handleOutPlayerChange}>
              <SelectTrigger id="out-player" className="h-12 w-full text-base">
                <SelectValue placeholder="選手を選択" />
              </SelectTrigger>
              <SelectContent>
                {outCandidates.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="in-player">入る選手</Label>
            <Select value={inPlayerId} onValueChange={setInPlayerId}>
              <SelectTrigger id="in-player" className="h-12 w-full text-base">
                <SelectValue
                  placeholder={
                    inCandidates.length === 0
                      ? "下の欄から選手を追加してください"
                      : "選手を選択"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {inCandidates.map((player) => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "fielder" && (
            <div className="space-y-2">
              <Label htmlFor="in-position">入る選手の守備位置</Label>
              <Select
                value={inPosition}
                onValueChange={(position) =>
                  setInPosition(position as FieldingPosition)
                }
              >
                <SelectTrigger
                  id="in-position"
                  className="h-12 w-full text-base"
                >
                  <SelectValue placeholder="退く選手と同じ" />
                </SelectTrigger>
                <SelectContent>
                  {FIELDING_POSITIONS.map((position) => (
                    <SelectItem key={position} value={position}>
                      {FIELDING_POSITION_LABELS[position]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {mode !== "rename" && mode !== "positionChange" && onAddBenchPlayer && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <Label htmlFor="new-bench-player">新しい選手を追加</Label>
          <p className="text-xs text-muted-foreground">
            試合前に登録していない選手も、ここで追加すれば交代に使えます。
          </p>
          <div className="flex gap-2">
            <Input
              id="new-bench-player"
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddPlayer();
                }
              }}
              placeholder="選手名"
              className="h-11 flex-1 bg-background text-base"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-11 shrink-0"
              disabled={!newPlayerName.trim()}
              onClick={handleAddPlayer}
            >
              選手を追加
            </Button>
          </div>
        </div>
      )}

      <Button
        type="button"
        className="h-12 w-full text-base font-semibold"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {mode === "rename"
          ? "選手名を保存"
          : mode === "positionChange"
            ? "守備位置を記録"
            : "交代を記録"}
      </Button>
    </div>
  );
}
