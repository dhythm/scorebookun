"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  History,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useGame } from "@/lib/game-context";
import { replay } from "@/lib/domain/replay";
import { gamePath } from "@/lib/app-state/routes";
import {
  createBrowserGameRepository,
  type PersistedGameV2,
} from "@/lib/storage/local-storage";
import { createBrowserSyncMetaStore } from "@/lib/storage/sync-meta";
import { MAX_DELETE_KEY_LENGTH, parseDeleteKey } from "@/lib/sync/delete-key";
import type { DeleteGameResult } from "@/lib/sync/game-api";
import { downloadJsonFile, exportFileName } from "@/lib/export/download-file";
import { exportHistoryArchive } from "@/lib/export/history-archive";
import { parseImportedGames } from "@/lib/export/import-games";
import { toast } from "sonner";

const DELETE_FAILURE_MESSAGES: Record<
  Exclude<DeleteGameResult["status"], "deleted" | "notFound">,
  string
> = {
  wrongKey: "削除キーが違います。",
  noKey: "この試合には削除キーが設定されていないため、削除できません。",
  unavailable: "削除できませんでした。通信環境を確認してください。",
  rejected: "削除キーが違います。",
};

export function GameHistory() {
  const {
    game,
    resetGame,
    importGames,
    deleteGame: deleteSharedGame,
  } = useGame();
  const router = useRouter();
  const [games, setGames] = useState<PersistedGameV2[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteGameId, setDeleteGameId] = useState<string | null>(null);
  const [deleteKeyInput, setDeleteKeyInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Only games known to the server are listed; they reopen by shared URL.
  const refresh = () => {
    const syncMeta = createBrowserSyncMetaStore();
    setGames(
      createBrowserGameRepository()
        .list()
        .filter((storedGame) => syncMeta.get(storedGame.id) !== null)
    );
  };

  useEffect(() => {
    refresh();
  }, []);

  const deleteGame = games.find((game) => game.id === deleteGameId);

  const handleDelete = () => {
    if (!deleteGameId) return;
    const isCurrentGame = game?.id === deleteGameId;
    createBrowserGameRepository().remove(deleteGameId);
    createBrowserSyncMetaStore().remove(deleteGameId);
    if (isCurrentGame) {
      resetGame();
      router.replace("/");
    }
    closeDeleteDialog();
    refresh();
  };

  const closeDeleteDialog = () => {
    setDeleteGameId(null);
    setDeleteKeyInput("");
    setDeleteError(null);
  };

  const deleteKey = parseDeleteKey(deleteKeyInput);
  const enteredDeleteKey = deleteKey.ok ? deleteKey.key : null;

  const handleDeleteFromServer = async () => {
    if (!deleteGameId || !enteredDeleteKey) return;
    const isCurrentGame = game?.id === deleteGameId;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const result = await deleteSharedGame(deleteGameId, enteredDeleteKey);
      if (result.status !== "deleted" && result.status !== "notFound") {
        setDeleteError(DELETE_FAILURE_MESSAGES[result.status]);
        return;
      }
      toast.success("試合をサーバーから削除しました");
      if (isCurrentGame) router.replace("/");
      closeDeleteDialog();
      refresh();
    } catch {
      setDeleteError(DELETE_FAILURE_MESSAGES.unavailable);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    downloadJsonFile(
      exportFileName("history", new Date().toISOString()),
      exportHistoryArchive(games)
    );
    toast.success(`${games.length}試合をエクスポートしました`);
  };

  const handleImport = async (file: File) => {
    try {
      const importedGames = parseImportedGames(await file.text());
      const importedCount = await importGames(importedGames);
      refresh();
      if (importedCount < importedGames.length) {
        toast.error(
          `${importedGames.length - importedCount}試合を登録できませんでした。通信環境を確認してください`
        );
      }
      if (importedCount > 0) {
        toast.success(`${importedCount}試合をインポートしました`);
      }
    } catch {
      toast.error(
        "インポートできませんでした。このアプリでエクスポートしたファイルを選んでください"
      );
    }
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden border-border py-0">
        <CardHeader className="px-3 py-2">
          <CardTitle>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 w-full justify-between px-2 text-base"
              aria-expanded={isExpanded}
              aria-controls="saved-game-list"
              onClick={() => setIsExpanded((expanded) => !expanded)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <History className="h-4 w-4 shrink-0" />
                <span>試合履歴</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">
                  {games.length}
                </span>
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        {isExpanded && (
          <CardContent
            id="saved-game-list"
            className="space-y-3 border-t border-border px-4 py-4"
          >
            {games.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                保存された試合はありません
              </p>
            )}
            {games.map((storedGame) => {
              const snapshot = replay(
                storedGame.events,
                storedGame.config
              ).snapshot;
              return (
                <div
                  key={storedGame.id}
                  className="flex items-center gap-1 rounded-xl bg-muted/60 pl-3 pr-1"
                >
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 touch-manipulation rounded-lg py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    aria-label={`${storedGame.config.teams.away.name} ${snapshot.score.away} - ${snapshot.score.home} ${storedGame.config.teams.home.name}、${storedGame.date.slice(0, 10)}、${storedGame.status === "finished" ? "試合終了" : "試合中"}`}
                    onClick={() => router.push(gamePath(storedGame.id))}
                  >
                    <span className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {storedGame.date.slice(0, 10).replaceAll("-", "/")}
                      </span>
                      <span
                        className={
                          storedGame.status === "finished"
                            ? "rounded bg-card px-1.5 py-0.5"
                            : "rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
                        }
                      >
                        {storedGame.status === "finished"
                          ? "試合終了"
                          : "試合中"}
                      </span>
                    </span>
                    <span className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-2 gap-y-1 text-sm">
                      <span className="truncate font-medium">
                        {storedGame.config.teams.away.name}
                      </span>
                      <span className="text-right text-lg font-bold leading-tight tabular-nums">
                        {snapshot.score.away}
                      </span>
                      <span className="truncate font-medium">
                        {storedGame.config.teams.home.name}
                      </span>
                      <span className="text-right text-lg font-bold leading-tight tabular-nums">
                        {snapshot.score.home}
                      </span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`${storedGame.config.teams.away.name}対${storedGame.config.teams.home.name}の試合を履歴から削除`}
                    onClick={() => setDeleteGameId(storedGame.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-secondary has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50">
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                インポート
                <input
                  type="file"
                  accept="application/json,.json"
                  aria-label="試合履歴をインポート"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void handleImport(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                disabled={games.length === 0}
                onClick={handleExport}
                aria-label="試合履歴をエクスポート"
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                エクスポート
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={deleteGameId !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              この試合を履歴から削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteGame
                ? `${deleteGame.config.teams.away.name} 対 ${deleteGame.config.teams.home.name}（${deleteGame.date.slice(0, 10)}）をこの端末の履歴から外します。`
                : "選択した試合をこの端末の履歴から外します。"}
              この端末の履歴から外すだけで、共有URLからは引き続き開けます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="history-delete-key" className="text-sm font-medium">
              削除キー
            </label>
            <Input
              id="history-delete-key"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={MAX_DELETE_KEY_LENGTH}
              value={deleteKeyInput}
              onChange={(event) => {
                setDeleteKeyInput(event.target.value);
                setDeleteError(null);
              }}
              aria-describedby="history-delete-key-help"
              className="h-11 text-base"
            />
            <p
              id="history-delete-key-help"
              className="text-xs text-muted-foreground"
            >
              試合の作成時に設定したキーを入力すると、サーバーからも削除できます。全員の画面から試合が消え、元に戻せません。
            </p>
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isDeleting}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              履歴から外す
            </AlertDialogAction>
            {/* Not an AlertDialogAction: the dialog stays open on failure. */}
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={!enteredDeleteKey || isDeleting}
              onClick={() => void handleDeleteFromServer()}
            >
              {isDeleting ? "削除中…" : "サーバーからも削除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
