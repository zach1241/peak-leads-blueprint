import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Peak Leads · Operations", template: "%s · Peak Leads" },
  description: "The internal task and operations workspace for Peak Leads.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
