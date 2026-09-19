"use client";

import { AlertTriangle, DatabaseZap, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EditingConflictAlert({ onReload }: { onReload: () => void }) {
  return (
    <>
      <div
        data-testid="editing-blocker"
        className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-[1px]"
        aria-hidden="true"
      />
      <div
        role="alert"
        aria-live="assertive"
        className="fixed inset-x-0 top-0 z-[70] flex flex-col items-center justify-center gap-2 border-b border-amber-700 bg-amber-400 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-sm font-semibold text-amber-950 shadow-md sm:flex-row"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          他の人がこの試合を更新しました
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 border-amber-900 bg-amber-50 text-amber-950 hover:bg-white"
          onClick={onReload}
        >
          最新の内容を読み込む
        </Button>
      </div>
    </>
  );
}

export function StorageFailureAlert({
  unsent,
  onRetry,
}: {
  /** The server has not received the latest change (it is retried). */
  unsent: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[65] flex flex-col items-center justify-center gap-2 border-b border-destructive bg-destructive px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-sm font-semibold text-destructive-foreground shadow-md sm:flex-row"
    >
      <span className="flex items-center gap-2">
        <DatabaseZap className="h-4 w-4 shrink-0" aria-hidden="true" />
        {unsent ? "未送信の変更があります" : "この端末に保存されていません"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 bg-background text-foreground"
        onClick={onRetry}
      >
        <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
        {unsent ? "今すぐ再送" : "保存を再試行"}
      </Button>
    </div>
  );
}
