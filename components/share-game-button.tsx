"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

import { ShareGameDialog } from "@/components/share-game-dialog";
import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game-context";

export function ShareGameButton() {
  const { game } = useGame();
  const [open, setOpen] = useState(false);
  if (!game) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-primary-foreground hover:bg-primary-foreground/10"
        onClick={() => setOpen(true)}
        aria-label="試合のURLを共有"
      >
        <Share2 className="h-5 w-5" aria-hidden="true" />
      </Button>
      {open && (
        <ShareGameDialog
          open
          onOpenChange={setOpen}
          title={`${game.config.teams.away.name} 対 ${game.config.teams.home.name}`}
          url={window.location.href}
        />
      )}
    </>
  );
}
