"use client";

import { FeedbackDialog } from "@/components/feedback-dialog";
import { DisplaySettingsDialog } from "@/components/display-settings-dialog";
import { AlphaDisclaimer } from "@/components/alpha-disclaimer";
import { AppName } from "@/components/app-name";
import { GameHistory } from "@/components/game-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGame } from "@/lib/game-context";
import { createStandardGamePreset } from "@/lib/game-preset";
import {
  generateId,
  getSelectableFieldingPositions,
  isTeamRosterValid,
  syncNonLineupStartingPitcher,
  syncStartingPitcher,
} from "@/lib/game-utils";
import type { FieldingPosition, Player, Team } from "@/lib/domain/types";
import { FIELDING_POSITION_LABELS } from "@/lib/domain/catalog";
import { cn } from "@/lib/utils";
import { gamePath } from "@/lib/app-state/routes";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  GripVertical,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  MAX_DELETE_KEY_LENGTH,
  MIN_DELETE_KEY_LENGTH,
  parseDeleteKey,
} from "@/lib/sync/delete-key";
import { useId, useState } from "react";
import { toast } from "sonner";

const emptyTeam = (): Team => ({
  name: "",
  players: [],
  benchPlayers: [],
  startingPitcherId: null,
  startingPitcherName: "",
});

function TeamSetupForm({
  label,
  team,
  onTeamChange,
}: {
  label: string;
  team: Team;
  onTeamChange: (team: Team) => void;
}) {
  const formId = useId();
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPosition, setNewPlayerPosition] =
    useState<FieldingPosition | null>(null);
  const [newBenchPlayerName, setNewBenchPlayerName] = useState("");
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const addPlayer = () => {
    if (!newPlayerName.trim() || !newPlayerPosition) return;
    const newPlayer: Player = {
      id: generateId(),
      name: newPlayerName.trim(),
      order: team.players.length + 1,
      position: newPlayerPosition,
    };
    const next: Team = {
      ...team,
      players: [...team.players, newPlayer],
    };
    onTeamChange(syncStartingPitcher(next));
    setNewPlayerName("");
    setNewPlayerPosition(null);
  };

  const removePlayer = (id: string) => {
    const newPlayers = team.players
      .filter((p) => p.id !== id)
      .map((p, index) => ({ ...p, order: index + 1 }));
    onTeamChange(syncStartingPitcher({ ...team, players: newPlayers }));
  };

  const addBenchPlayer = () => {
    const name = newBenchPlayerName.trim();
    if (!name) return;
    const benchPlayers = team.benchPlayers ?? [];
    onTeamChange({
      ...team,
      benchPlayers: [
        ...benchPlayers,
        {
          id: generateId(),
          name,
          order: team.players.length + benchPlayers.length + 1,
          position: null,
        },
      ],
    });
    setNewBenchPlayerName("");
  };

  const removeBenchPlayer = (id: string) => {
    onTeamChange({
      ...team,
      benchPlayers: (team.benchPlayers ?? []).filter(
        (player) => player.id !== id
      ),
    });
  };

  const movePlayer = (index: number, direction: "up" | "down") => {
    const newPlayers = [...team.players];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newPlayers.length) return;

    [newPlayers[index], newPlayers[targetIndex]] = [
      newPlayers[targetIndex],
      newPlayers[index],
    ];

    const reorderedPlayers = newPlayers.map((p, i) => ({ ...p, order: i + 1 }));
    onTeamChange(syncStartingPitcher({ ...team, players: reorderedPlayers }));
  };

  const reorderPlayersByDrag = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= team.players.length ||
      toIndex >= team.players.length
    ) {
      return;
    }
    const next = [...team.players];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    const reorderedPlayers = next.map((p, i) => ({ ...p, order: i + 1 }));
    onTeamChange(syncStartingPitcher({ ...team, players: reorderedPlayers }));
  };

  const updatePlayerPosition = (
    playerId: string,
    position: FieldingPosition
  ) => {
    const players = team.players.map((p) =>
      p.id === playerId ? { ...p, position } : p
    );
    onTeamChange(syncStartingPitcher({ ...team, players }));
  };

  const updatePlayerName = (playerId: string, name: string) => {
    const players = team.players.map((p) =>
      p.id === playerId ? { ...p, name } : p
    );
    let next: Team = { ...team, players };
    if (team.startingPitcherId === playerId) {
      next = { ...next, startingPitcherName: name };
    }
    onTeamChange(next);
  };

  /** Keeps lineup pitcher row in sync when the linked starting-pitcher name field is edited. */
  const updateStartingPitcherName = (value: string) => {
    if (
      team.startingPitcherId &&
      team.players.some(
        (p) => p.id === team.startingPitcherId && p.position === "pitcher"
      )
    ) {
      onTeamChange({
        ...team,
        startingPitcherName: value,
        players: team.players.map((p) =>
          p.id === team.startingPitcherId ? { ...p, name: value } : p
        ),
      });
      return;
    }
    onTeamChange(syncNonLineupStartingPitcher(team, value, generateId()));
  };

  const newRowSelectable = getSelectableFieldingPositions(
    team.players,
    null,
    newPlayerPosition
  );

  return (
    <Card className="gap-4 border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-foreground">
            <span
              className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground"
              aria-hidden="true"
            >
              {label === "先攻チーム" ? "先" : "後"}
            </span>
            {label}
          </CardTitle>
          <span className="font-mono text-xs text-muted-foreground">
            {team.players.length}人
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label
            htmlFor={`${formId}-team-name`}
            className="text-sm font-medium text-muted-foreground mb-1.5 block"
          >
            チーム名
          </label>
          <Input
            id={`${formId}-team-name`}
            placeholder="チーム名を入力"
            value={team.name}
            onChange={(e) => onTeamChange({ ...team, name: e.target.value })}
            className="h-11 bg-background text-base"
          />
        </div>

        <div>
          <label
            htmlFor={`${formId}-starting-pitcher`}
            className="text-sm font-medium text-muted-foreground mb-1.5 block"
          >
            先発投手
          </label>
          <Input
            id={`${formId}-starting-pitcher`}
            placeholder="先発投手の氏名"
            value={team.startingPitcherName ?? ""}
            onChange={(e) => updateStartingPitcherName(e.target.value)}
            className="h-11 bg-background text-base"
            autoComplete="off"
          />
        </div>

        <div>
          <label
            htmlFor={`${formId}-new-player`}
            className="text-sm font-medium text-muted-foreground mb-1.5 block"
          >
            打順
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id={`${formId}-new-player`}
              placeholder="選手名を入力"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPlayer();
                }
              }}
              className="h-11 w-full bg-background text-base sm:flex-1 sm:min-w-0"
            />
            <div className="flex items-center gap-2 sm:shrink-0">
              <Select
                value={newPlayerPosition ?? undefined}
                onValueChange={(v) =>
                  setNewPlayerPosition(v as FieldingPosition)
                }
              >
                <SelectTrigger
                  className="h-11 w-[7.5rem] shrink-0 bg-background text-xs"
                  aria-label="追加する選手の守備位置"
                >
                  <SelectValue placeholder="守備位置" />
                </SelectTrigger>
                <SelectContent>
                  {newRowSelectable.map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {FIELDING_POSITION_LABELS[pos]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={addPlayer}
                disabled={!newPlayerName.trim() || !newPlayerPosition}
                aria-label="打順に選手を追加"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {team.players.length > 0 && (
          <ul className="space-y-2 list-none p-0 m-0">
            {team.players.map((player, index) => {
              const rowSelectable = getSelectableFieldingPositions(
                team.players,
                player.id,
                player.position
              );
              return (
                <li
                  key={player.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw =
                      e.dataTransfer.getData("application/x-player-index") ||
                      e.dataTransfer.getData("text/plain");
                    const fromIndex = parseInt(raw, 10);
                    if (!Number.isNaN(fromIndex)) {
                      reorderPlayersByDrag(fromIndex, index);
                    }
                  }}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center bg-secondary/50 rounded-lg px-3 py-2 data-[dragging=true]:opacity-60"
                >
                  <div className="flex items-center gap-2 min-w-0 w-full sm:flex-1 sm:min-w-0">
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDraggingIndex(index);
                        e.dataTransfer.effectAllowed = "move";
                        const payload = String(index);
                        e.dataTransfer.setData(
                          "application/x-player-index",
                          payload
                        );
                        e.dataTransfer.setData("text/plain", payload);
                        e.currentTarget
                          .closest("li")
                          ?.setAttribute("data-dragging", "true");
                      }}
                      onDragEnd={(e) => {
                        setDraggingIndex(null);
                        e.currentTarget
                          .closest("li")
                          ?.removeAttribute("data-dragging");
                      }}
                      className="flex size-11 touch-none shrink-0 cursor-grab select-none items-center justify-center rounded-md text-muted-foreground hover:bg-background/80 hover:text-foreground active:cursor-grabbing"
                      role="button"
                      tabIndex={0}
                      aria-label={`打順${player.order}を移動。上下矢印キーでも並べ替えできます`}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          movePlayer(index, "up");
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          movePlayer(index, "down");
                        }
                      }}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground w-6 shrink-0 text-center">
                      {player.order}.
                    </span>
                    <Input
                      value={player.name}
                      onChange={(e) =>
                        updatePlayerName(player.id, e.target.value)
                      }
                      className="h-11 min-w-0 flex-1 bg-background text-base sm:text-sm"
                      aria-label={`打順${player.order}の選手名`}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                    <Select
                      value={player.position ?? undefined}
                      onValueChange={(v) =>
                        updatePlayerPosition(player.id, v as FieldingPosition)
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn(
                          "h-11 w-[7.5rem] shrink-0 bg-background px-2 text-xs",
                          draggingIndex !== null && "pointer-events-none"
                        )}
                        aria-label={`打順${player.order}の守備位置`}
                      >
                        <SelectValue placeholder="守備位置" />
                      </SelectTrigger>
                      <SelectContent>
                        {rowSelectable.map((pos) => (
                          <SelectItem key={pos} value={pos}>
                            {FIELDING_POSITION_LABELS[pos]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div
                      className={cn(
                        "flex gap-1 shrink-0",
                        draggingIndex !== null && "pointer-events-none"
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => movePlayer(index, "up")}
                        disabled={index === 0}
                        aria-label={`${player.name}を打順で1つ上へ移動`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        onClick={() => movePlayer(index, "down")}
                        disabled={index === team.players.length - 1}
                        aria-label={`${player.name}を打順で1つ下へ移動`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-destructive hover:text-destructive"
                        onClick={() => removePlayer(player.id)}
                        aria-label={`${player.name}を打順から削除`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <label className="text-sm font-medium text-muted-foreground">
            控え選手
          </label>
          <div className="flex gap-2">
            <Input
              value={newBenchPlayerName}
              onChange={(event) => setNewBenchPlayerName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addBenchPlayer();
                }
              }}
              className="h-11 flex-1 bg-background text-base"
              placeholder="控え選手名"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-11 w-11 shrink-0"
              disabled={!newBenchPlayerName.trim()}
              onClick={addBenchPlayer}
              aria-label="控え選手を追加"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          {(team.benchPlayers ?? []).length > 0 && (
            <ul className="space-y-2">
              {(team.benchPlayers ?? []).map((player) => (
                <li
                  key={player.id}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {player.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeBenchPlayer(player.id)}
                    aria-label={`${player.name}を控えから削除`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function GameSetup() {
  const { createGame } = useGame();
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();
  const [awayTeam, setAwayTeam] = useState<Team>(emptyTeam);
  const [homeTeam, setHomeTeam] = useState<Team>(emptyTeam);
  const [inningOption, setInningOption] = useState("7");
  const [customInnings, setCustomInnings] = useState("6");
  const totalInnings =
    inningOption === "custom" ? Number(customInnings) : Number(inningOption);
  const inningsValid =
    Number.isInteger(totalInnings) && totalInnings >= 1 && totalInnings <= 20;

  const [deleteKeyInput, setDeleteKeyInput] = useState("");
  const deleteKey = parseDeleteKey(deleteKeyInput);

  const canStartGame =
    deleteKey.ok &&
    awayTeam.name.trim() !== "" &&
    homeTeam.name.trim() !== "" &&
    isTeamRosterValid(awayTeam) &&
    isTeamRosterValid(homeTeam) &&
    inningsValid;

  const startGame = async () => {
    if (!deleteKey.ok) return;
    setIsCreating(true);
    try {
      const id = await createGame(
        {
          date: new Date().toISOString(),
          config: {
            regulationInnings: totalInnings,
            teams: { away: awayTeam, home: homeTeam },
          },
        },
        ...(deleteKey.key ? [deleteKey.key] : [])
      );
      if (!id) {
        toast.error("試合を作成できませんでした。通信環境を確認してください");
        return;
      }
      router.push(gamePath(id));
    } finally {
      setIsCreating(false);
    }
  };

  const applySamplePreset = () => {
    const preset = createStandardGamePreset(generateId);
    setAwayTeam(preset.away);
    setHomeTeam(preset.home);
    toast.success("チーム1・チーム2の選手を設定しました");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="app-header sticky top-0 z-40 flex items-center justify-between bg-primary px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-primary-foreground">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <AppName />
        </h1>
        <div className="flex items-center gap-0.5">
          <DisplaySettingsDialog />
          <FeedbackDialog />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 pb-36 pt-6 lg:max-w-4xl lg:px-6">
        <div className="flex items-end justify-between border-b border-border pb-5">
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-widest text-muted-foreground">
              試合の準備
            </p>
            <h2 className="text-[28px] font-bold tracking-tight text-foreground">
              試合を作成
            </h2>
          </div>
          <span className="mb-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-primary">
            野球スコアブック
          </span>
        </div>
        <GameHistory />
        <section
          aria-labelledby="setup-preset-title"
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <h2 id="setup-preset-title" className="text-sm font-bold">
            入力プリセット
          </h2>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full border-primary/20 bg-secondary text-primary"
            onClick={applySamplePreset}
          >
            チーム1・チーム2（各9人）を設定
          </Button>
        </section>

        <Card className="gap-3 border-border py-4">
          <CardHeader className="px-4 py-0">
            <CardTitle className="text-base">試合イニング</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <div className="grid grid-cols-4 gap-2">
              {["5", "7", "9", "custom"].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={inningOption === value ? "default" : "outline"}
                  className="h-12 touch-manipulation px-2 font-semibold"
                  aria-pressed={inningOption === value}
                  onClick={() => setInningOption(value)}
                >
                  {value === "custom" ? "任意" : `${value}回`}
                </Button>
              ))}
            </div>
            {inningOption === "custom" && (
              <div className="space-y-1.5">
                <label htmlFor="custom-innings" className="text-sm font-medium">
                  イニング数（1〜20）
                </label>
                <Input
                  id="custom-innings"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={customInnings}
                  onChange={(event) => setCustomInnings(event.target.value)}
                  className="h-11 text-base"
                />
                {!inningsValid && (
                  <p className="text-xs text-destructive">
                    1〜20の整数を入力してください。
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 lg:items-start">
          <TeamSetupForm
            label="先攻チーム"
            team={awayTeam}
            onTeamChange={setAwayTeam}
          />

          <TeamSetupForm
            label="後攻チーム"
            team={homeTeam}
            onTeamChange={setHomeTeam}
          />
        </div>

        <Card className="gap-3 border-border py-4">
          <CardHeader className="px-4 py-0">
            <CardTitle className="text-base">
              <label htmlFor="delete-key">削除キー（任意）</label>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 px-4">
            <Input
              id="delete-key"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_DELETE_KEY_LENGTH}
              value={deleteKeyInput}
              onChange={(event) => setDeleteKeyInput(event.target.value)}
              aria-describedby="delete-key-help"
              aria-invalid={!deleteKey.ok}
              className="h-11 text-base"
            />
            {!deleteKey.ok && (
              <p className="text-xs text-destructive">
                {MIN_DELETE_KEY_LENGTH}〜{MAX_DELETE_KEY_LENGTH}
                文字で入力してください。
              </p>
            )}
            <p id="delete-key-help" className="text-xs text-muted-foreground">
              設定すると、このキーを知っている人だけが試合をサーバーから削除できます。あとから設定・変更・確認はできません。未設定の試合は削除できません。
            </p>
          </CardContent>
        </Card>
        <AlphaDisclaimer />
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(23,63,53,0.06)]">
        <div className="mx-auto max-w-lg">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              先攻{" "}
              <span className="font-mono font-semibold text-foreground">
                {awayTeam.players.length}
              </span>
              人 / 後攻{" "}
              <span className="font-mono font-semibold text-foreground">
                {homeTeam.players.length}
              </span>
              人
            </span>
            <span>
              {canStartGame
                ? `${totalInnings}回制・準備完了`
                : "チーム名・打順・守備位置を登録"}
            </span>
          </div>
          <Button
            className="w-full h-12 text-base font-semibold"
            disabled={!canStartGame || isCreating}
            onClick={startGame}
          >
            {isCreating ? "作成中…" : "試合を作成して開始"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
