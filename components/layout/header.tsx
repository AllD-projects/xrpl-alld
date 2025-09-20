import { UserIcon } from "lucide-react";
import Link from "next/link";
import Logo from "../icons/logo";
import { Button } from "../ui/button";

export default function Header() {
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

  return (
    <header className="sticky top-0 z-50">
      <div className="inner relative flex items-center justify-between">
        <Logo className="absolute top-7 left-1/2 z-2 size-22 -translate-x-1/2 -translate-y-1/2 fill-white" />
        <div className="flex items-center gap-4">
          {navItems.map((item) => (
            <Button asChild key={item.label}>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
          <Button asChild>
            <UserIcon className="size-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
