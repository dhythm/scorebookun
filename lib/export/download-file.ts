/** Saves text the app produced as a file on the device. */
export function downloadJsonFile(fileName: string, json: string): void {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportFileName(kind: "game" | "history", date: string): string {
  const prefix = kind === "game" ? "scorebook" : "scorebook-history";
  return `${prefix}-${date.slice(0, 10)}.json`;
}
