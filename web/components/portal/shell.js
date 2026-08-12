"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./icons";
import { PORTALS } from "./theme";
import { Avatar } from "./kit";
import { clearAuth } from "../../lib/auth";

// xl-only widths for the detail panel (base is w-full when stacked on small screens).
// Keys must stay literal so Tailwind's JIT generates the classes.
const PANEL_XL = {
  "w-[380px]": "xl:w-[380px]",
  "w-[400px]": "xl:w-[400px]",
  "w-[420px]": "xl:w-[420px]",
  "w-[440px]": "xl:w-[440px]",
  "w-[620px]": "xl:w-[620px]",
};

// Where each portal's classic (legacy functional) workbench lives.
const CLASSIC = {
  zaqa: "/zaqa/classic",
  hea: "/hea/classic",
  ecz: "/ecz/classic",
  teveta: "/teveta/classic",
  institution: "/issuer/classic",
  graduate: "/student/classic",
};

// Full-bleed portal chrome: collapsible dark sidebar, white topbar with user menu,
// content area and optional right-hand detail panel.
export default function PortalShell({
  portal,
  active,
  title,
  subtitle,
  actions,
  children,
  panel,
  panelWidth = "w-[400px]",
  contentClass = "",
  user,       // optional {name, sub} — overrides the theme's placeholder user
  bellCount,  // optional live notification count
}) {
  const router = useRouter();
  // Sidebar visibility: null = auto (hidden on mobile, shown on lg+); true/false = user override.
  const [nav, setNav] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleNav() {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    setNav((prev) => (prev == null ? !desktop : !prev));
  }
  function closeMobileNav() {
    if (!window.matchMedia("(min-width: 1024px)").matches) setNav(false);
  }
  const base = PORTALS[portal];
  const t = {
    ...base,
    user: user || base.user,
    bellCount: bellCount == null ? base.bellCount : bellCount,
  };

  function signOut() {
    clearAuth();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Mobile backdrop when the drawer is open */}
      {nav === true && (
        <div className="fixed inset-0 z-20 bg-slate-950/50 lg:hidden" onClick={() => setNav(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col ${t.sidebar} text-white transition-transform duration-200 ${
          nav === true ? "translate-x-0" : nav === false ? "-translate-x-full" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Icon name="shieldCheck" className="h-6 w-6" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-lg font-extrabold tracking-tight">{t.brand}</div>
            <div className={`text-[11px] font-bold tracking-widest ${t.subClass}`}>{t.brandSub}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
          {t.nav.map((item) => {
            const isActive = item.id === active;
            return (
              <Link
                key={item.label}
                href={item.href || "#"}
                onClick={closeMobileNav}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                  isActive ? t.active : "text-slate-300/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <Icon name="shieldCheck" className="h-4 w-4" />
              </span>
              <div className="min-w-0 text-[11px] leading-snug">
                <div className="font-semibold text-white">{t.org.title}</div>
                {t.org.sub && <div className="mt-0.5 text-slate-300/80">{t.org.sub}</div>}
                <div className="mt-1.5 border-t border-white/10 pt-1.5 text-slate-300/70">{t.org.tagline}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right of sidebar */}
      <div className={`transition-[padding] duration-200 ${nav === false ? "pl-0" : "pl-0 lg:pl-64"}`}>
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:gap-4 sm:px-5">
          <button
            className="text-slate-500 hover:text-slate-700"
            aria-label="Toggle menu"
            onClick={toggleNav}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <div className="relative hidden max-w-xl flex-1 md:block">
            <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-14 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
              placeholder={t.search}
              readOnly
            />
            <span className="absolute right-3 top-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              ⌘ K
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href={t.bellHref || "#"} className="relative text-slate-500 hover:text-slate-700" aria-label="Notifications">
              <Icon name="bell" className="h-5 w-5" />
              {t.bellCount ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {t.bellCount}
                </span>
              ) : null}
            </Link>
            {t.chip && (
              <span className={`hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold sm:inline-flex ${t.chip.cls}`}>
                <Icon name="shieldCheck" className="h-3.5 w-3.5" />
                {t.chip.label}
              </span>
            )}
            <div className="relative">
              <button className="flex items-center gap-2" onClick={() => setMenuOpen((o) => !o)}>
                <Avatar name={t.user.name} size="h-8 w-8" />
                <span className="hidden text-left leading-tight lg:block">
                  <span className="block max-w-[180px] truncate text-[13px] font-semibold text-slate-800">{t.user.name}</span>
                  {t.user.sub && <span className="block max-w-[180px] truncate text-[11px] text-slate-400">{t.user.sub}</span>}
                </span>
                <Icon name="chevronDown" className={`h-4 w-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
                    <div className="border-b border-slate-100 px-4 py-2.5">
                      <div className="truncate text-[13px] font-semibold text-slate-800">{t.user.name}</div>
                      {t.user.sub && <div className="truncate text-[11px] text-slate-400">{t.user.sub}</div>}
                    </div>
                    <Link
                      href="/account"
                      className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Icon name="user" className="h-4 w-4 text-slate-400" /> My account
                    </Link>
                    {CLASSIC[portal] && (
                      <Link
                        href={CLASSIC[portal]}
                        className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-50"
                        onClick={() => setMenuOpen(false)}
                      >
                        <Icon name="grid" className="h-4 w-4 text-slate-400" /> Classic portal
                      </Link>
                    )}
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50"
                    >
                      <Icon name="logout" className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content + optional detail panel: side-by-side on xl, stacked below on smaller screens */}
        <div className="flex flex-col xl:flex-row xl:items-stretch">
          <main className={`min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 ${contentClass}`}>
            {(title || actions) && (
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  {title && <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>}
                  {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500">{subtitle}</p>}
                </div>
                {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
              </div>
            )}
            {children}
          </main>
          {panel && (
            <aside
              className={`w-full shrink-0 border-t border-slate-200 bg-white xl:border-l xl:border-t-0 ${
                PANEL_XL[panelWidth] || "xl:w-[400px]"
              }`}
            >
              <div className="p-4 sm:p-5 xl:sticky xl:top-16 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto [scrollbar-width:thin]">
                {panel}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
