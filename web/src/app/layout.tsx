import type { Metadata, Viewport } from "next";
// Self-hosted font from npm: bundled into the build, never fetched from the internet.
import "@fontsource-variable/vazirmatn";
import "./globals.css";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "آوا · استودیوی صدای فارسی",
  description: "تبدیل متن فارسی به گفتار طبیعی با Chatterbox Farsi؛ کاملاً آفلاین، روی دستگاه خودتان.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1324" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
