import type { Metadata, Viewport } from "next";
import PwaBoot from "@/components/PwaBoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zonehunt",
  description: "A real-life manhunt for your phone. Chasers follow timed runner positions, runners watch a compass.",
  manifest: "/manifest.json",
  applicationName: "Zonehunt",
  appleWebApp: { capable: true, title: "Zonehunt", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1a2c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__zhPrompt=e;window.dispatchEvent(new Event('zh-install'))})",
          }}
        />
      </head>
      <body>
        {children}
        <PwaBoot />
      </body>
    </html>
  );
}
