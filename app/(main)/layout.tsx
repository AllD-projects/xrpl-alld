import Header from "@/components/layout/header";
import type { ReactNode } from "react";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  );
}
