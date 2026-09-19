"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useGame } from "@/lib/game-context";
import { shareGameUrl } from "@/lib/share-game-url";

export function ShareGameButton() {
  const { game } = useGame();
  if (!game) return null;

  const handleShare = async () => {
    const outcome = await shareGameUrl(
      {
        title: `${game.config.teams.away.name} 対 ${game.config.teams.home.name}`,
        url: window.location.href,
      },
      {
        share: navigator.share?.bind(navigator),
        writeText: navigator.clipboard?.writeText.bind(navigator.clipboard),
      }
    );
    if (outcome === "copied") toast.success("試合のURLをコピーしました");
    if (outcome === "failed") {
      toast.error("共有できませんでした。アドレスバーのURLを共有してください");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-11 w-11 text-primary-foreground hover:bg-primary-foreground/10"
      onClick={handleShare}
      aria-label="試合のURLを共有"
    >
      <Share2 className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
