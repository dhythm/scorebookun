/** The app name as shown in headers, marked as a pre-release version. */
export function AppName() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span>スコアブッくん</span>
      {/* Regular weight and 12px: a smaller, bolder "α" reads as "a". */}
      <span className="rounded bg-primary-foreground/15 px-1.5 py-[3px] text-xs font-medium leading-none">
        α版
      </span>
    </span>
  );
}
