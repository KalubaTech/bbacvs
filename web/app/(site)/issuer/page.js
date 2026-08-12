import { redirect } from "next/navigation";

// The redesigned portal is the primary experience; the classic workbench lives at /issuer/classic.
export default function Page() {
  redirect("/institution");
}
