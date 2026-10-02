import type {
  Metadata,
  Viewport,
} from "next";

import "./globals.css";

export const metadata:
  Metadata = {
  title: {
    default:
      "Our Days",

    template:
      "%s · Our Days",
  },

  description:
    "一个安静记录计划、专注与日常的小空间",

  applicationName:
    "Our Days",

  manifest:
    "/manifest.webmanifest",

  icons: {
    icon:
      "/pwa-icon.svg",

    shortcut:
      "/pwa-icon.svg",

    apple:
      "/pwa-icon.svg",
  },

  appleWebApp: {
    capable:
      true,

    title:
      "Our Days",

    statusBarStyle:
      "default",
  },

  robots: {
    index:
      false,

    follow:
      false,

    nocache:
      true,

    googleBot: {
      index:
        false,

      follow:
        false,
    },
  },
};

export const viewport:
  Viewport = {
  width:
    "device-width",

  initialScale:
    1,

  themeColor:
    "#FBF7F1",
};

export default function RootLayout({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh">
        {children}
      </body>
    </html>
  );
}
