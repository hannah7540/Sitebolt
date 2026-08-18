import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Shield } from "lucide-react";
import SiteFooter from "@/components/layout/SiteFooter";
import { cardClass } from "@/lib/ui-classes";

export const metadata: Metadata = {
  title: "Privacy Policy — SiteBolt",
  description:
    "How SiteBolt collects, uses, stores, and protects personal information for construction safety and compliance.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/login" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
              <HardHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                SiteBolt
              </p>
              <p className="text-sm font-medium text-slate-900">Privacy Policy</p>
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className={`${cardClass} mb-6 flex items-start gap-3 p-5 sm:p-6`}>
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
            <p className="mt-2 text-sm text-slate-600">
              This policy explains how <strong>SiteBolt</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
              &ldquo;our&rdquo;) collects, uses, discloses, and protects personal information when
              you use our web and mobile applications for construction safety, Safe Work Method
              Statements (SWMS), Inspection and Test Plans (ITPs), site management, and related
              compliance workflows.
            </p>
            <p className="mt-2 text-xs text-slate-500">Last updated: August 2026</p>
          </div>
        </div>

        <div className={`${cardClass} space-y-8 p-5 sm:p-8`}>
          <Section title="1. About SiteBolt">
            <p>
              SiteBolt is operated to support construction and site-based teams with safety
              verification, digital sign-offs, compliance document management, worker onboarding,
              timesheets, and quality inspection workflows. This policy applies to administrators,
              project managers, workers, subcontractors, and other authorised users of the SiteBolt
              platform.
            </p>
            <p>
              We handle personal information in accordance with the Australian Privacy Act 1988
              (Cth) and the Australian Privacy Principles (APPs), as well as applicable Google Play
              Developer Program policies where our Android application is distributed.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p>Depending on your role and how you use SiteBolt, we may collect:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Identity &amp; contact details:</strong> name, email address, phone number,
                employer or subcontractor affiliation, and profile photo where provided.
              </li>
              <li>
                <strong>Employment &amp; compliance details:</strong> worker trade, licences,
                certifications, VOC records, induction completion status, and assigned projects or
                sites.
              </li>
              <li>
                <strong>Digital signatures &amp; acknowledgements:</strong> signature images,
                sign-off timestamps, SWMS acknowledgements, and inspection or checklist
                confirmations.
              </li>
              <li>
                <strong>Uploaded documents &amp; media:</strong> SWMS PDFs, insurance certificates,
                compliance documents, site photos, plant pre-start records, and other files you or
                your organisation upload to the platform.
              </li>
              <li>
                <strong>Location data:</strong> precise or approximate location when you perform
                site check-ins, clock-in/out, or other location-enabled safety workflows (with your
                device permission where required).
              </li>
              <li>
                <strong>Usage &amp; technical data:</strong> device type, browser or app version,
                IP address, authentication logs, and activity necessary to operate and secure the
                service.
              </li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use personal information to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Create and manage user accounts and role-based access.</li>
              <li>
                Verify job site safety participation, including SWMS assignment, reading, and
                digital sign-off.
              </li>
              <li>
                Maintain ITP/ITC inspection records, quality sign-offs, and compliance audit trails.
              </li>
              <li>
                Process timesheets, leave requests, onboarding, and workforce communications.
              </li>
              <li>Store and retrieve documents required for WHS and contractual compliance.</li>
              <li>
                Send service-related notifications, password resets, and compliance alerts
                authorised by your organisation.
              </li>
              <li>Improve platform reliability, security, and support.</li>
            </ul>
            <p>
              We do not sell your personal information. We use data only for legitimate business
              purposes related to operating SiteBolt and meeting legal and safety obligations.
            </p>
          </Section>

          <Section title="4. Third-Party Services">
            <p>
              SiteBolt relies on trusted service providers to host and operate the platform. These
              providers process data on our behalf under contractual safeguards:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Supabase</strong> — authentication, PostgreSQL database, and secure file
                storage for documents, signatures, and uploaded media.
              </li>
              <li>
                <strong>Vercel</strong> — hosting and delivery of the SiteBolt web application.
              </li>
              <li>
                <strong>Google Play Services</strong> — distribution, updates, and device-level
                services for the SiteBolt Android application where applicable.
              </li>
              <li>
                <strong>Email delivery providers</strong> — transactional email such as invites and
                password resets, where configured by your organisation.
              </li>
            </ul>
            <p>
              These providers may store or process data in Australia or other countries. Where
              overseas disclosure occurs, we take reasonable steps consistent with APP 8 to ensure
              appropriate protection.
            </p>
          </Section>

          <Section title="5. Data Retention &amp; Security">
            <p>
              We retain personal information for as long as your account is active, as required to
              provide the service, or as needed to meet legal, safety, and audit obligations
              (including signed SWMS and inspection records). Retention periods may vary by document
              type and your organisation&apos;s compliance requirements.
            </p>
            <p>We protect information using measures including:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Encryption in transit via TLS/HTTPS for all web and API communication.</li>
              <li>Encryption at rest provided by our cloud infrastructure providers.</li>
              <li>Strict role-based access controls and authentication for platform users.</li>
              <li>Audit logging of sensitive compliance actions where implemented.</li>
            </ul>
            <p>
              No method of transmission or storage is completely secure. If you believe your account
              has been compromised, contact us immediately at{" "}
              <a
                href="mailto:support@site-bolt.com.au"
                className="font-medium text-orange-600 hover:text-orange-700"
              >
                support@site-bolt.com.au
              </a>
              .
            </p>
          </Section>

          <Section title="6. Your Rights (Australian Privacy Principles)">
            <p>Subject to applicable law, you may have the right to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Request access to personal information we hold about you.</li>
              <li>Request correction of inaccurate, incomplete, or out-of-date information.</li>
              <li>
                Request deletion of your account and associated personal data, subject to legal and
                compliance retention requirements.
              </li>
              <li>Make a privacy complaint, which we will acknowledge and investigate promptly.</li>
            </ul>
            <p>
              To exercise these rights, contact{" "}
              <a
                href="mailto:support@site-bolt.com.au"
                className="font-medium text-orange-600 hover:text-orange-700"
              >
                support@site-bolt.com.au
              </a>
              . If you are not satisfied with our response, you may contact the Office of the
              Australian Information Commissioner (OAIC).
            </p>
          </Section>

          <Section title="7. Account &amp; Data Deletion">
            <p>You may request deletion of your SiteBolt account and associated personal data by:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Using account settings within the platform where deletion options are available, or
              </li>
              <li>
                Emailing{" "}
                <a
                  href="mailto:support@site-bolt.com.au"
                  className="font-medium text-orange-600 hover:text-orange-700"
                >
                  support@site-bolt.com.au
                </a>{" "}
                from the email address linked to your account with the subject line{" "}
                <strong>Account Deletion Request</strong>.
              </li>
            </ul>
            <p>
              We will verify your identity before processing deletion. Some records (for example,
              signed SWMS, safety inspections, or legally required audit logs) may be retained in
              de-identified or archived form where your employer or applicable law requires retention
              for WHS and compliance purposes.
            </p>
          </Section>

          <Section title="8. Children">
            <p>
              SiteBolt is intended for workplace use and is not directed at children under 16. We do
              not knowingly collect personal information from children. Contact us if you believe a
              child has provided personal information through the platform.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              reflected on this page with an updated &ldquo;Last updated&rdquo; date. Continued use
              of SiteBolt after changes take effect constitutes acceptance of the revised policy.
            </p>
          </Section>

          <Section title="10. Contact Us">
            <p>
              For privacy enquiries, access or correction requests, or account deletion, contact:
            </p>
            <p>
              <strong>SiteBolt Privacy &amp; Support</strong>
              <br />
              Email:{" "}
              <a
                href="mailto:support@site-bolt.com.au"
                className="font-medium text-orange-600 hover:text-orange-700"
              >
                support@site-bolt.com.au
              </a>
            </p>
          </Section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
