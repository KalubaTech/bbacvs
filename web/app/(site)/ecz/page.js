import { redirect } from "next/navigation";

// The redesigned portal is the primary experience; the classic workbench lives at /ecz/classic.
export default function Page() {
  redirect("/ecz/dashboard");
}
