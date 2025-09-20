"use client";

import { ArrowLeftToLine, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "../icons/logo";
import { Button } from "../ui/button";

interface DetailPageHeaderProps {
  route: string;
}

export default function DetailPageHeader({ route }: DetailPageHeaderProps) {
  const router = useRouter();

  return (
    <header className="absolute top-0 z-50 w-full">
      <div className="relative flex h-24 items-center justify-between px-16 py-6">
        <Link href="/">
          <Logo className="size-22 fill-black" />
        </Link>

        <div className="flex items-center gap-10">
          <Button variant="ghost" size="icon">
            <User className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => router.push(route)}>
            <ArrowLeftToLine className="size-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
