import type { Metadata } from "next";
import Link from "next/link";
import { Clock, HardHat, Mail } from "lucide-react";
import { cardClass } from "@/lib/ui-classes";

export const metadata: Metadata = {
  title: "Support — SiteBolt",
  description:
    "Customer and technical support for SiteBolt enterprise operations. Contact support@site-bolt.com.au.",
};

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className={`${cardClass} w-full max-w-lg p-6 sm:p-8`}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-500">
            <HardHat className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              SiteBolt
            </p>
            <p className="text-sm font-medium text-slate-500">Enterprise operations</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900">SiteBolt Support</h1>
        <p className="mt-1 text-sm font-medium text-slate-600">
          Customer &amp; Technical Support for Enterprise Operations
        </p>

        <p className="mt-5 text-sm leading-relaxed text-slate-700">
          For account provisioning, field device setup, bug reports, or general technical
          assistance with the SiteBolt platform, please reach out via email or speak to your
          organization&apos;s SiteBolt administrator.
        </p>

        <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-start gap-3 text-sm text-slate-800">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </span>
              <a
                href="mailto:support@site-bolt.com.au"
                className="font-semibold text-orange-600 hover:text-orange-700"
              >
                support@site-bolt.com.au
              </a>
            </span>
          </p>
          <p className="flex items-start gap-3 text-sm text-slate-800">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Support hours
              </span>
              Monday to Friday, 7:00 AM – 5:00 PM AEST
            </span>
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Sign in
          </Link>
          <Link
            href="/privacy"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
