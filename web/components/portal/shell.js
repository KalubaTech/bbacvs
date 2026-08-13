"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./icons";
import { PORTALS, navIndex } from "./theme";
import { Avatar } from "./kit";
import { clearAuth, getToken, getUser } from "../../lib/auth";
import { api } from "../../lib/api";

// xl-only widths for the detail panel (base is a slide-over on small screens).
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

const ROLE_LABEL = {
  admin: "Platform Admin",
  zaqa: "ZAQA Officer",
  hea: "HEA Officer",
  teveta: "TEVETA Officer",
  ecz: "ECZ Officer",
  issuer: "Institution Officer",
  holder: "Graduate",
};

const NAV_STORE = "bbacvs_portal_nav";

// Full-bleed portal chrome: collapsible dark sidebar with grouped navigation,
// white topbar with quick-search / live notifications / user menu, content
// area and optional right-hand detail panel (slide-over below xl).
export default function PortalShell({
  portal,
  active,
  title,
  subtitle,
  actions,
  children,
  panel,
  panelKey,   // optional stable key for the selected record — auto-opens the small-screen slide-over when it changes
  panelWidth = "w-[400px]",
  contentClass = "",
  user,       // optional {name, sub} — overrides the logged-in user
  bellCount,  // optional live notification count override
}) {
  const router = useRouter();
  // Sidebar visibility: null = auto (hidden on mobile, shown on lg+); true/false = user override.
  const [nav, setNav] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [authUser, setAuthUser] = useState(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const searchRef = useRef(null);

  // Restore the user's sidebar preference so it survives navigation.
  useEffect(() => {
    const stored = sessionStorage.getItem(NAV_STORE);
    if (stored === "open") setNav(true);
    else if (stored === "closed") setNav(false);
  }, []);

  useEffect(() => {
    setAuthUser(getUser());
  }, []);

  // Live unread notification count, refreshed every 60s.
  useEffect(() => {
    if (bellCount != null) return;
    const token = getToken();
    if (!token) return;
    let stop = false;
    const load = () =>
      api
        .myNotifications(token)
        .then((d) => !stop && setUnread(d.unread ?? (d.notifications || []).filter((n) => !n.read).length))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [bellCount]);

  // Auto-open the small-screen details slide-over when a new record is selected.
  useEffect(() => {
    if (panelKey != null) setPanelOpen(true);
  }, [panelKey]);

  // ⌘K / Ctrl+K focuses the quick-search.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggleNav() {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    setNav((prev) => {
      const next = prev == null ? !desktop : !prev;
      sessionStorage.setItem(NAV_STORE, next ? "open" : "closed");
      return next;
    });
  }
  function closeMobileNav() {
    if (!window.matchMedia("(min-width: 1024px)").matches) setNav(false);
  }

  const t = PORTALS[portal];
  const displayUser =
    user ||
    (authUser
      ? { name: authUser.name || authUser.email, sub: ROLE_LABEL[authUser.role] || authUser.role }
      : { name: "…", sub: "" });
  const bell = bellCount == null ? unread : bellCount;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return navIndex(portal)
      .filter((it) => `${it.heading} ${it.label}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [portal, query]);

  function goTo(href) {
    setQuery("");
    setSearchOpen(false);
    router.push(href);
  }

  function signOut() {
    clearAuth();
    router.push("/login");
  }

  const panelBody = (
    <div className="p-4 sm:p-5 xl:sticky xl:top-16 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto [scrollbar-width:thin]">
      {panel}
    </div>
  );

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
        <nav className="flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
          {t.nav.map((group) => (
            <div key={group.heading} className="mb-3">
              <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400/80">
                {group.heading}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = item.id === active;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
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
              </div>
            </div>
          ))}
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
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) goTo(matches[0].href);
                if (e.key === "Escape") {
                  setQuery("");
                  setSearchOpen(false);
                  e.target.blur();
                }
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-14 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
              placeholder={t.search}
            />
            <span className="absolute right-3 top-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              ⌘ K
            </span>
            {searchOpen && matches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {matches.map((m) => (
                  <button
                    key={`${m.heading}-${m.id}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goTo(m.href);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    <Icon name={m.icon} className="h-4 w-4 text-slate-400" />
                    <span className="flex-1 truncate">{m.label}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{m.heading}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href={t.bellHref} className="relative text-slate-500 hover:text-slate-700" aria-label="Notifications">
              <Icon name="bell" className="h-5 w-5" />
              {bell ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {bell}
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
                <Avatar name={displayUser.name} size="h-8 w-8" />
                <span className="hidden text-left leading-tight lg:block">
                  <span className="block max-w-[180px] truncate text-[13px] font-semibold text-slate-800">{displayUser.name}</span>
                  {displayUser.sub && <span className="block max-w-[180px] truncate text-[11px] text-slate-400">{displayUser.sub}</span>}
                </span>
                <Icon name="chevronDown" className={`h-4 w-4 text-slate-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
                    <div className="border-b border-slate-100 px-4 py-2.5">
                      <div className="truncate text-[13px] font-semibold text-slate-800">{displayUser.name}</div>
                      {displayUser.sub && <div className="truncate text-[11px] text-slate-400">{displayUser.sub}</div>}
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

        {/* Content + optional detail panel: side column on xl, slide-over below */}
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
            <>
              {/* xl+: sticky side column */}
              <aside
                className={`hidden w-full shrink-0 border-l border-slate-200 bg-white xl:block ${
                  PANEL_XL[panelWidth] || "xl:w-[400px]"
                }`}
              >
                {panelBody}
              </aside>

              {/* below xl: floating trigger + right slide-over */}
              {!panelOpen && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg xl:hidden"
                >
                  <Icon name="chevronLeft" className="h-4 w-4" />
                  Details
                </button>
              )}
              {panelOpen && (
                <div className="fixed inset-0 z-40 xl:hidden">
                  <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPanelOpen(false)} />
                  <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white shadow-xl">
                    <div className="flex justify-end px-4 pt-3">
                      <button
                        type="button"
                        onClick={() => setPanelOpen(false)}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                        aria-label="Close details"
                      >
                        <Icon name="x" className="h-4 w-4" />
                      </button>
                    </div>
                    {panelBody}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
