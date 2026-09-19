import type { Metadata } from "next";

// Anyone with the URL can edit the game, so keep it out of search engines and
// out of the Referer header sent to other sites.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function GameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
