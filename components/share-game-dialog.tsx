"use client";

import { Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shareGameUrl, type ShareOutcome } from "@/lib/share-game-url";

interface ShareGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
}

function reportOutcome(outcome: ShareOutcome) {
  if (outcome === "copied") toast.success("試合のURLをコピーしました");
  if (outcome === "failed") {
    toast.error("共有できませんでした。表示されているURLを共有してください");
  }
}

export function ShareGameDialog({
  open,
  onOpenChange,
  title,
  url,
}: ShareGameDialogProps) {
  const content = { title, url };
  const canShareNatively =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const writeText =
    typeof navigator !== "undefined" && navigator.clipboard
      ? (text: string) => navigator.clipboard.writeText(text)
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>試合を共有</DialogTitle>
          <DialogDescription>
            URLを知っている人は、この試合を閲覧・記録できます。
          </DialogDescription>
        </DialogHeader>
        {/* Generated on the device: the URL grants edit access, so it is
            never sent to an external QR service. The white frame keeps the
            code scannable in dark mode. */}
        <div className="mx-auto rounded-xl border border-border bg-white p-4">
          <QRCodeSVG
            value={url}
            size={208}
            level="M"
            marginSize={0}
            role="img"
            aria-label="試合URLのQRコード"
            className="h-52 w-52"
          />
        </div>
        <p className="select-all break-all rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
          {url}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={async () =>
              reportOutcome(await shareGameUrl(content, { writeText }))
            }
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            URLをコピー
          </Button>
          {canShareNatively && (
            <Button
              type="button"
              className="min-h-11 flex-1"
              onClick={async () =>
                reportOutcome(
                  await shareGameUrl(content, {
                    share: (shared) => navigator.share(shared),
                    writeText,
                  })
                )
              }
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              アプリで共有
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
