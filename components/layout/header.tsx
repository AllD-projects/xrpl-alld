"use client";

import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../icons/logo";

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "company",
      href: "/company"
    },
    {
      label: "designer",
      href: "/designer"
    }
  ];
  const currentPath = navItems.find((item) => pathname.includes(item.label));

  return (
    <header className="sticky top-0 z-50">
      <div className="inner relative flex h-24 items-center justify-between">
        <h1 className="absolute top-1/2 left-1/2 z-2 -translate-x-1/2 -translate-y-1/2">
          <Link href="/">
            <Logo className="size-22 fill-black" />
          </Link>
        </h1>
        <ul className="flex items-center gap-20">
          {navItems.map((item) => (
            <li
              key={item.label}
              className={cn(
                "text-xl font-extrabold text-gray-500 uppercase",
                currentPath?.label === item.label && "text-black"
              )}
            >
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
        <Link href="/login">
          <User className="size-5" />
        </Link>
      </div>
    </header>
  );
}
