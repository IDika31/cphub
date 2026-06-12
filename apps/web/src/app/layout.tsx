import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import AuthInit from "@/components/auth/auth-init";
import "./globals.css";

export const metadata: Metadata = {
  title: "CPHub V4 — Competitive Programming Hub",
  description:
    "Platform terintegrasi untuk latihan competitive programming — Codeforces + TLX TOKI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head />
      <body className="bg-[#0f0f10] text-[#e4e4e7] font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthInit>{children}</AuthInit>
        </ThemeProvider>
      </body>
    </html>
  );
}
