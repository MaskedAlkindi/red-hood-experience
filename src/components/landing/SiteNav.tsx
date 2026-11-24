"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Emblem } from "@/components/fx/Atmosphere";

const links = [
  { href: "/", label: "Home" },
  { href: "/endings", label: "Endings" },
  { href: "/story-map", label: "Story map" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-5 sm:px-10">
      <Link href="/" className="flex items-center gap-3">
        <Emblem className="h-8 w-8" />
        <span className="hidden font-display text-lg tracking-[0.4em] text-zinc-200 sm:inline">Red Hood</span>
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-full px-3 py-1.5 text-xs tracking-[0.25em] uppercase transition sm:text-[13px] ${
              path === l.href ? "text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            {l.label}
            {path === l.href && <span className="mx-auto mt-1 block h-px w-4 bg-ember" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}
