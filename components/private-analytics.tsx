"use client";

import { Analytics } from "@vercel/analytics/next";

import { redactGameUrl } from "@/lib/redact-game-url";

export function PrivateAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => ({ ...event, url: redactGameUrl(event.url) })}
    />
  );
}
