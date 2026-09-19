import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { NetworkStatus } from "@/components/network-status";
import { AppProviders } from "@/components/app-providers";
import { PrivateAnalytics } from "@/components/private-analytics";

export const metadata: Metadata = {
  title: "スコアブッくん - 野球スコアラー",
  description:
    "草野球対応のリアルタイム野球スコアリングアプリ。試合中にベンチからスマホでスコアをつけられます。",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#173f35",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
        <NetworkStatus />
        <Toaster position="bottom-center" richColors closeButton />
        <ServiceWorkerRegistration />
        <PrivateAnalytics />
      </body>
    </html>
  );
}
