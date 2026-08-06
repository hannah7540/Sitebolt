// Temporarily disabled — restore AccountsRatesAndRules when re-enabling this route.
import { redirect } from "next/navigation";

export default function AccountsRatesAndRulesPage() {
  redirect("/accounts/timesheets");
}
