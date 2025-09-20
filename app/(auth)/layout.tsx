import { ReactNode } from "react";
import LandingPage from "./_components/LandingPage";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <LandingPage />
      {children}
    </main>
  );
}
