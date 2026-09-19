/** The scorebook diamond is shared by every app header. */
export function AppName() {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <svg
        viewBox="0 0 28 28"
        className="size-7 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="5"
          y="5"
          width="18"
          height="18"
          rx="3"
          transform="rotate(45 14 14)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="m9 14 5-5 5 5-5 5Z" fill="currentColor" opacity=".2" />
        <path
          d="m11 17 3 3 3-3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[15px] font-bold tracking-tight">
        スコアブッくん
      </span>
      <span className="rounded bg-primary-foreground/15 px-1.5 py-[3px] text-xs font-medium leading-none">
        α版
      </span>
    </span>
  );
}
