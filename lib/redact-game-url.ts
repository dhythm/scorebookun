/** Game URLs act as access keys, so they must not reach third parties. */
export function redactGameUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/games/")) return url;
    return `${parsed.origin}/games/[gameId]`;
  } catch {
    return url;
  }
}
