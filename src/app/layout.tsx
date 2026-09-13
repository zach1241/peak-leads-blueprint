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
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('peak-leads-theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch{}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
