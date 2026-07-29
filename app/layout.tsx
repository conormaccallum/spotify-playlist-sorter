import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Playlist Sorter",
  description: "A live room for sorting a Spotify playlist into four categories.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
