import { TriangleAlert } from "lucide-react";

/** Sets expectations while the server may still be wiped between releases. */
export function AlphaDisclaimer() {
  return (
    <aside
      role="note"
      className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-foreground"
    >
      <TriangleAlert
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
        aria-hidden="true"
      />
      <p>
        このアプリは現在アルファ版（開発段階）です。サーバーに保存されたデータは予告なく消去される可能性があります。残しておきたい試合は、「試合履歴」のエクスポートで手元に保存してください。
      </p>
    </aside>
  );
}
