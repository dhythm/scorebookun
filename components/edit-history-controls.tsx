"use client";

import { useState } from "react";
import { ArchiveRestore, History, Redo2, RotateCcw } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGame } from "@/lib/game-context";

function halfLabel(half: "top" | "bottom"): string {
  return half === "top" ? "表" : "裏";
}

export function EditHistoryControls() {
  const { game, dispatch, storageConflict } = useGame();
  const [trashOpen, setTrashOpen] = useState(false);
  const [restoreHalfOpen, setRestoreHalfOpen] = useState(false);

  if (!game) return null;

  const currentHalfLabel = `${game.currentState.inning}回${halfLabel(
    game.currentState.half
  )}`;
  const hasCurrentHalfEvents = game.timeline.some(
    (entry) =>
      entry.inning === game.currentState.inning &&
      entry.half === game.currentState.half
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          type="button"
          variant="outline"
          disabled={storageConflict || game.undoHistory.length === 0}
          onClick={() => dispatch({ type: "UNDO_LAST_EVENT" })}
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          戻す
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={storageConflict || game.redoHistory.length === 0}
          onClick={() => dispatch({ type: "REDO_LAST_EVENT" })}
        >
          <Redo2 className="mr-1 h-4 w-4" />
          やり直す
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={storageConflict || !hasCurrentHalfEvents}
          onClick={() => setRestoreHalfOpen(true)}
        >
          <History className="mr-1 h-4 w-4" />
          回の最初へ
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={game.deletedEvents.length === 0}
          onClick={() => setTrashOpen(true)}
        >
          <ArchiveRestore className="mr-1 h-4 w-4" />
          削除済み ({game.deletedEvents.length})
        </Button>
      </div>

      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除した記録</DialogTitle>
            <DialogDescription>
              削除した記録を元の位置へ復元できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {game.deletedEvents.map(({ event }) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="truncate text-sm">
                  {event.kind === "atBat"
                    ? `打席: ${event.result}`
                    : event.kind === "baseRunning"
                      ? `走塁: ${event.type}`
                      : event.kind === "substitution"
                        ? "選手交代"
                        : event.kind === "note"
                          ? `メモ: ${event.text}`
                          : "試合終了"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={storageConflict}
                  onClick={() =>
                    dispatch({
                      type: "RESTORE_DELETED_EVENT",
                      eventId: event.id,
                    })
                  }
                >
                  復元
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={restoreHalfOpen} onOpenChange={setRestoreHalfOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {currentHalfLabel}の開始時点に戻しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              この回の記録を取り消します。操作後も「戻す」で復元できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dispatch({ type: "RESTORE_HALF_INNING_START" })}
            >
              開始時点に戻す
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
