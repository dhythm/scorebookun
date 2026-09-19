"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_NOTE_LENGTH = 120;
const NOTE_PRESETS = ["雨天中断", "時間中断", "確認中"] as const;

interface GameNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (text: string) => boolean;
}

export function GameNoteDialog({
  open,
  onOpenChange,
  onSubmit,
}: GameNoteDialogProps) {
  const [text, setText] = useState("");
  const normalizedText = text.trim();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setText("");
    onOpenChange(nextOpen);
  };

  const handleSubmit = () => {
    if (!normalizedText || !onSubmit(normalizedText)) return;
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>試合メモ</DialogTitle>
          <DialogDescription>
            中断理由や確認事項を、その時点の試合状況と一緒に記録します。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {NOTE_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                className="min-h-11 w-full px-2"
                onClick={() => setText(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="game-note">試合メモ</Label>
            <Input
              id="game-note"
              value={text}
              maxLength={MAX_NOTE_LENGTH}
              className="h-11"
              placeholder="例: 雨天のため20分中断"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSubmit();
              }}
            />
            <p className="text-right text-xs text-muted-foreground">
              {text.length}/{MAX_NOTE_LENGTH}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => handleOpenChange(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={!normalizedText}
            onClick={handleSubmit}
          >
            メモを記録
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
