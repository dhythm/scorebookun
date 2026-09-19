"use client";

import { useState } from "react";
import { Archive, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { downloadJsonFile, exportFileName } from "@/lib/export/download-file";
import { exportHistoryArchive } from "@/lib/export/history-archive";
import type { PersistedGameV2 } from "@/lib/storage/local-storage";

function downloadArchive(games: readonly PersistedGameV2[]): void {
  downloadJsonFile(
    exportFileName("history", new Date().toISOString()),
    exportHistoryArchive(games)
  );
}

export function HistoryBackupNotice({
  games,
  onRemove,
}: {
  games: readonly PersistedGameV2[];
  onRemove: (gameIds: string[]) => void;
}) {
  const [archiveDownloaded, setArchiveDownloaded] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  if (games.length === 0) return null;

  return (
    <>
      <aside
        role="alert"
        className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[55] mx-auto max-w-xl rounded-xl border border-amber-700 bg-amber-100 p-3 text-amber-950 shadow-lg sm:bottom-4"
      >
        <div className="flex items-start gap-3">
          <Archive className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-bold">
              試合履歴の保存容量が残りわずかです
            </p>
            <p className="text-xs leading-relaxed">
              保存容量を安全に保つため、古い{games.length}
              試合をエクスポートしてください。エクスポートするまで削除しません。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                onClick={() => {
                  downloadArchive(games);
                  setArchiveDownloaded(true);
                }}
              >
                <Download className="mr-1 h-4 w-4" />
                {games.length}試合をエクスポート
              </Button>
              {archiveDownloaded && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 border-amber-800 bg-white text-amber-950"
                  onClick={() => setConfirmRemoval(true)}
                >
                  エクスポート済みの履歴を削除
                </Button>
              )}
            </div>
          </div>
        </div>
      </aside>

      <AlertDialog open={confirmRemoval} onOpenChange={setConfirmRemoval}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              エクスポート済みの履歴を削除しますか？
            </AlertDialogTitle>
            <AlertDialogDescription>
              エクスポートした{games.length}試合を履歴から削除します。
              エクスポートしたファイルは「試合履歴」のインポートから戻せます。安全な場所に保管してください。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onRemove(games.map((game) => game.id));
                setConfirmRemoval(false);
                setArchiveDownloaded(false);
              }}
            >
              履歴から削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
