import { redirect } from "next/navigation";

// The redesigned portal is the primary experience; the classic workbench lives at /student/classic.
export default function Page() {
  redirect("/graduate");
}
