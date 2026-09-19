type ShareContent = { title: string; url: string };

type ShareCapabilities = {
  share?: (content: ShareContent) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
};

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareGameUrl(
  content: ShareContent,
  { share, writeText }: ShareCapabilities
): Promise<ShareOutcome> {
  if (share) {
    try {
      await share(content);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      // Fall through to copying.
    }
  }
  if (!writeText) return "failed";
  try {
    await writeText(content.url);
    return "copied";
  } catch {
    return "failed";
  }
}
