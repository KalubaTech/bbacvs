"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, clearAuth, getToken } from "../lib/auth";
import { api } from "../lib/api";
import { Logo } from "./ui";

// Compact in-app notification bell (spec §14).
function NotificationsBell() {
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.myNotifications(getToken()).then((d) => alive && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      try { await api.markNotificationsRead(getToken()); setData((d) => ({ ...d, unread: 0 })); } catch {}
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10" aria-label="Notifications">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {data.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-2 text-slate-800 shadow-lg">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {data.notifications.length === 0 && <p className="px-2 py-4 text-center text-sm text-slate-400">Nothing yet.</p>}
            {data.notifications.map((n) => (
              <div key={n.id} className={`rounded-md px-2 py-2 text-sm ${n.read ? "text-slate-500" : "bg-brand-50 text-slate-800"}`}>
                {n.message}
                <div className="mt-0.5 text-[11px] text-slate-400">{new Date(n.at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Role → the primary portal link shown in the nav.
// Each role sees only its own portal (strict, role-based). Verify is public.
const PORTAL_LINKS = [
  { href: "/verify", label: "Verify", roles: "*" },
  { href: "/qualifications", label: "Qualifications", roles: "*" },
  // Instructions & fees are relevant to graduates, institutions, and visitors — not regulators.
  { href: "/instructions", label: "Instructions", roles: ["holder", "issuer"], public: true },
  { href: "/admin", label: "Admin", roles: ["admin"] },
  { href: "/zaqa", label: "ZAQA", roles: ["zaqa"] },
  { href: "/hea", label: "HEA", roles: ["hea"] },
  { href: "/teveta", label: "TEVETA", roles: ["teveta"] },
  { href: "/ecz", label: "ECZ", roles: ["ecz"] },
  { href: "/issuer", label: "Issue", roles: ["issuer"] },
  { href: "/student", label: "My Credentials", roles: ["holder"] },
  // Billing — invoices & quotations, payments, receipts (individuals + institutions + ZAQA).
  { href: "/billing", label: "Billing", roles: ["holder", "issuer", "zaqa", "admin"] },
  // Account/profile settings — every signed-in role.
  { href: "/account", label: "Account", roles: ["admin", "zaqa", "hea", "teveta", "ecz", "issuer", "holder"] },
];

export default function Nav() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setUser(getUser());
    const sync = () => setUser(getUser());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [pathname]);

  // Close the mobile drawer on any navigation.
  useEffect(() => setOpen(false), [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function logout() {
    clearAuth();
    setUser(null);
    setOpen(false);
    router.push("/login");
  }

  const links = PORTAL_LINKS.filter((l) => {
    if (l.roles === "*") return true;
    if (!user) return !!l.public; // signed-out visitors see public links only
    return l.roles.includes(user.role);
  });

  const linkClass = (href) =>
    `rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
      pathname === href ? "bg-white/15 text-white" : "text-slate-300/80 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1b3a] text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Logo className="h-5 w-5 text-white" />
          </span>
          <span className="leading-tight">
            <span className="block text-[17px] font-extrabold tracking-tight">BBACVS</span>
            <span className="block text-[10px] font-bold tracking-widest text-emerald-400">CREDENTIAL VERIFICATION</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          ))}
          {user ? (
            <div className="ml-2 flex items-center gap-2">
              <NotificationsBell />
              <span className="hidden text-xs text-white/70 lg:inline">{user.email}</span>
              <button onClick={logout} className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25">
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="ml-2 rounded-md bg-white/15 px-3 py-1.5 hover:bg-white/25">
              Sign in
            </Link>
          )}
        </nav>

        {/* Mobile: bell + hamburger */}
        {user && <div className="ml-auto mr-1 md:hidden"><NotificationsBell /></div>}
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile sidebar drawer */}
      <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-slate-950/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        {/* Drawer panel */}
        <aside
          className={`absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-[#0d1b3a] text-white shadow-2xl transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-label="Navigation menu"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Logo className="h-7 w-7 text-white" />
              <span>BBACVS</span>
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
              aria-label="Close navigation"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3 text-sm">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-2.5 transition ${
                    pathname === l.href ? "bg-white/15 font-medium" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="border-t border-white/10 px-4 py-3 text-sm">
            {user ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-white/70">{user.email}</span>
                <button onClick={logout} className="shrink-0 rounded-md bg-white/15 px-3 py-1.5 hover:bg-white/25">
                  Sign out
                </button>
              </div>
            ) : (
              <Link href="/login" className="block rounded-md bg-white/15 px-3 py-1.5 text-center hover:bg-white/25">
                Sign in
              </Link>
            )}
          </div>
        </aside>
      </div>
    </header>
  );
}
