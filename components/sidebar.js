import Link from "next/link";
import ThemeToggle from "./theme-toggle";
const links = [
  { href: "/", label: "Overview" },
  { href: "/inventory", label: "Inventory" },
  { href: "/manifests", label: "Manifests" },
  { href: "/vans", label: "Vans" },
  { href: "/transfers", label: "Transfers" },
  { href: "/templates", label: "Templates" },
  { href: "/reporting", label: "Reporting" },
  { href: "/labels", label: "QR Labels" },
  { href: "/settings", label: "Settings" },
];
export function Sidebar() {
  return (
    <aside className="h-dvh border-r bg-white dark:bg-neutral-900 dark:border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-6">
        <div className="font-bold text-xl">CPG</div>
        <ThemeToggle />
      </div>
      <nav className="space-y-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
