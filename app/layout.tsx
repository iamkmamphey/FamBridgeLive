import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FamBridge Live — Private family rooms",
  description: "Passwordless guest video rooms with chat, screen sharing, reactions, captions and collaborative tools.",
  icons: {
    icon: "/assets/famyank-logo.png",
    shortcut: "/assets/famyank-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
