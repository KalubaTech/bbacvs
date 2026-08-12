"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser, getToken } from "../../lib/auth";

// Client-side auth guard for portal pages. Redirects to /login unless the
// signed-in user's role is in `roles` (admin is always allowed).
export function usePortalGuard(roles) {
  const router = useRouter();
  const [state, setState] = useState({ ready: false, user: null, token: null });

  useEffect(() => {
    const u = getUser();
    const allowed = u && (u.role === "admin" || !roles || roles.includes(u.role));
    if (!allowed) {
      router.push("/login");
      return;
    }
    setState({ ready: true, user: u, token: getToken() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return state;
}

// Format an ISO date for table cells: "May 20, 2025".
export function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(d);
  }
}

// "May 20, 2025, 09:15"
export function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch {
    return String(d);
  }
}
