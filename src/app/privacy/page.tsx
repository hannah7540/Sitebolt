import type { Metadata } from "next";
import LegalDocumentLayout, {
  LegalSection,
} from "@/components/marketing/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — SiteBolt",
  description:
    "How Site-Bolt Software Solutions collects, uses, stores, and protects personal information under the Australian Privacy Principles.",
};

const MAILTO = "mailto:hannah@site-bolt.com.au";
const CONTACT = "hannah@site-bolt.com.au";

function ContactLink() {
  return (
    <a href={MAILTO} className="font-medium text-[#FF6B00] transition hover:text-[#FF8533]">
      {CONTACT}
    </a>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <LegalDocumentLayout
      eyebrow="Privacy Policy"
      title="Privacy Policy"
      intro="This Privacy Policy explains how Site-Bolt Software Solutions (ABN 21 852 687 427) (“we”, “us”, “our”, trading as SiteBolt) collects, uses, discloses, and protects personal information when you use our web and mobile applications for field operations, safety, compliance, timesheets, plant, and related workflows."
      lastUpdated="October 2026"
    >
      <LegalSection title="1. Overview & Commitment to Privacy">
        <p>
          We are committed to handling personal information in accordance with the Privacy Act 1988
          (Cth) and the Australian Privacy Principles (APPs). This policy applies to organisation
          administrators, project managers, workers, subcontractors, and other authorised users of
          the SiteBolt platform, as well as visitors to our public website.
        </p>
        <p>
          We collect only the information reasonably necessary to provide the SiteBolt service,
          support our customers, and meet legal and workplace health and safety record-keeping
          obligations. We do not sell personal information.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <p>Depending on your role and how you use SiteBolt, we may collect:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white">Account credentials:</strong> name, email address, phone
            number, authentication details, and role-based access information.
          </li>
          <li>
            <strong className="text-white">Worker profiles:</strong> trade, employer or
            subcontractor affiliation, assigned projects or sites, and induction or competency
            status.
          </li>
          <li>
            <strong className="text-white">Licences and certifications:</strong> licence numbers,
            expiry dates, VOC records, and related compliance documents.
          </li>
          <li>
            <strong className="text-white">Timesheet entries:</strong> hours worked, job or cost
            allocations, leave records, and related payroll inputs entered by authorised users.
          </li>
          <li>
            <strong className="text-white">Plant details:</strong> asset identifiers, pre-start
            records, tag-out status, and maintenance or inspection history.
          </li>
          <li>
            <strong className="text-white">Uploaded photos and documents:</strong> site photos,
            signatures, SWMS files, insurance certificates, ITP/ITC evidence, and other files your
            organisation uploads.
          </li>
        </ul>
        <p>
          We may also collect limited technical data (device type, browser or app version, IP
          address, and authentication logs) required to operate, secure, and support the service.
        </p>
      </LegalSection>

      <LegalSection title="3. How We Use Information">
        <p>We use personal information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white">Operate the platform:</strong> create and manage
            accounts, enforce role-based access, and deliver the features your organisation
            subscribes to.
          </li>
          <li>
            <strong className="text-white">Send notifications:</strong> service emails, compliance
            reminders, and other operational alerts authorised by your organisation.
          </li>
          <li>
            <strong className="text-white">Support safety auditing:</strong> retain SWMS
            acknowledgements, inspection records, plant pre-starts, and related evidence for
            customer audit trails.
          </li>
          <li>
            <strong className="text-white">Provide customer support:</strong> investigate issues,
            restore access, and respond to privacy or account requests.
          </li>
        </ul>
        <p>
          We use personal information only for these purposes, related legitimate business purposes,
          and where required or authorised by Australian law.
        </p>
      </LegalSection>

      <LegalSection title="4. Data Storage & Security">
        <p>
          SiteBolt is hosted on Australian cloud infrastructure. Personal information is stored
          with our infrastructure providers under contractual arrangements intended to keep customer
          operational data in Australia where reasonably practicable.
        </p>
        <p>We protect information using measures including:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Encryption in transit via TLS/HTTPS for web and API communication.</li>
          <li>Encryption at rest provided by our cloud infrastructure providers.</li>
          <li>Role-based access controls and authenticated sessions for platform users.</li>
          <li>Audit logging of sensitive compliance actions where implemented.</li>
        </ul>
        <p>
          No method of transmission or storage is completely secure. If you believe an account has
          been compromised, contact us immediately at <ContactLink />.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-Party Services">
        <p>
          We use trusted service providers to operate SiteBolt. These providers process information
          on our behalf under contractual safeguards:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-white">Transactional email</strong> — delivery of invitations,
            notifications, and support correspondence.
          </li>
          <li>
            <strong className="text-white">Authentication</strong> — secure sign-in, session
            management, and password handling.
          </li>
          <li>
            <strong className="text-white">Database hosting</strong> — storage of application data,
            documents, and uploaded media.
          </li>
        </ul>
        <p>
          Where a provider processes information outside Australia, we take reasonable steps
          consistent with APP 8 to ensure the information is protected.
        </p>
      </LegalSection>

      <LegalSection title="6. Access and Correction">
        <p>
          Organisation administrators can review and update much of their operational data directly
          in SiteBolt, including worker profiles, licences, timesheets, plant records, and uploaded
          files.
        </p>
        <p>Subject to the Privacy Act 1988, you may request that we:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Provide access to personal information we hold about you.</li>
          <li>Correct information that is inaccurate, incomplete, or out of date.</li>
          <li>
            Delete personal information, subject to legal, contractual, and WHS retention
            requirements that may apply to signed safety records and audit logs.
          </li>
        </ul>
        <p>
          Send access, correction, or deletion requests to <ContactLink /> from an authorised
          email address. We will verify your identity before acting. If you are not satisfied with
          our response, you may contact the Office of the Australian Information Commissioner
          (OAIC).
        </p>
      </LegalSection>

      <LegalSection title="7. Contact Details">
        <p>For privacy enquiries, access or correction requests, or complaints, contact:</p>
        <p>
          <strong className="text-white">Site-Bolt Software Solutions</strong>
          <br />
          ABN: 21 852 687 427
          <br />
          Email: <ContactLink />
        </p>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected
          on this page with an updated “Last updated” date.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
