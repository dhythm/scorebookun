"use client";

import { useId } from "react";
import { Settings } from "lucide-react";

import { useUiPreferences } from "@/components/ui-preferences-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function DisplaySettingsDialog({ className }: { className?: string }) {
  const outdoorModeId = useId();
  const { outdoorMode, setOutdoorMode } = useUiPreferences();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-11 w-11 touch-manipulation text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
            className
          )}
          aria-label="表示の設定"
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>表示の設定</AlertDialogTitle>
          <AlertDialogDescription>
            試合中の見やすさを設定します。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <label
            htmlFor={outdoorModeId}
            className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-3"
          >
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold">屋外モード</span>
              <span className="block text-xs text-muted-foreground">
                配色のコントラストと文字サイズを上げます
              </span>
            </span>
            <Checkbox
              id={outdoorModeId}
              className="size-6"
              checked={outdoorMode}
              onCheckedChange={(checked) => setOutdoorMode(checked === true)}
            />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">閉じる</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
