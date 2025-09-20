import "@/assets/css/globals.css";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { ReactNode } from "react";
import { Toaster } from "sonner";

const roboto = localFont({
  src: "../assets/fonts/RobotoVariable.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-roboto"
});

export const metadata: Metadata = {
  title: "AIID",
  description: "development in progress"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-screen">
      <body className={`${roboto.className}`}>
        {children}
        <ConfirmDialog />
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
