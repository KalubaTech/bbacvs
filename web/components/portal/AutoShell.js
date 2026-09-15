"use client";

import { useEffect, useState } from "react";
import PortalShell from "./shell";
import { ROLE_PORTAL } from "./theme";
import { getUser } from "../../lib/auth";

// PortalShell for pages shared across portals (account, billing, verify, the public register,
// instructions, platform admin). Picks the chrome from the signed-in user's role so the page
// looks like part of *their* portal; signed-out visitors get the public chrome. `active` is
// the nav id to highlight (only highlights where that portal's nav has such an item).
export default function AutoShell({ active, children, ...rest }) {
  const [portal, setPortal] = useState(null);

  useEffect(() => {
    const u = getUser();
    setPortal((u && ROLE_PORTAL[u.role]) || "public");
    const sync = () => {
      const cur = getUser();
      setPortal((cur && ROLE_PORTAL[cur.role]) || "public");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Until the role is known, render the neutral public chrome so the layout does not jump.
  return (
    <PortalShell portal={portal || "public"} active={active} {...rest}>
      {children}
    </PortalShell>
  );
}
