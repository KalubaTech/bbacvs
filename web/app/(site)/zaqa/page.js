import { redirect } from "next/navigation";

// Legacy entry point — the portal lives in the redesigned UI.
export default function Page() {
  redirect("/zaqa/dashboard");
}
