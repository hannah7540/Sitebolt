import type { Metadata } from "next";
import LegalDocumentLayout, {
  LegalSection,
} from "@/components/marketing/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Terms of Service — SiteBolt",
  description:
    "SaaS Terms of Service for SiteBolt, including Australian Consumer Law guarantees, data ownership, and WHS disclaimers.",
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

export default function TermsOfServicePage() {
  return (
    <LegalDocumentLayout
      eyebrow="Terms of Service"
      title="Terms of Service"
      intro="These Terms of Service govern access to and use of the SiteBolt software-as-a-service platform operated by Site-Bolt Software Solutions (ABN 21 852 687 427). By creating an account, inviting users, or otherwise using SiteBolt, you agree to these terms."
      lastUpdated="October 2026"
    >
      <LegalSection title="1. Agreement to Terms & Eligibility">
        <p>
          These terms form a binding agreement between Site-Bolt Software Solutions (“SiteBolt”,
          “we”, “us”) and the organisation or individual that subscribes to the platform (the
          “Customer”). If you accept these terms on behalf of an organisation, you represent that
          you have authority to bind that organisation.
        </p>
        <p>
          SiteBolt is intended for business and workplace use. Users must be authorised by the
          Customer and capable of entering a legally binding agreement. The Customer is responsible
          for all activity under its accounts, including activity by workers, subcontractors, and
          other invited users.
        </p>
      </LegalSection>

      <LegalSection title="2. License Grant & Permitted Use">
        <p>
          Subject to a current subscription and these terms, we grant the Customer a limited,
          non-exclusive, non-transferable, revocable licence to access and use SiteBolt as a hosted
          SaaS service for the Customer’s internal operational purposes.
        </p>
        <p>The Customer must not, and must not permit others to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>copy, modify, reverse engineer, or create derivative works of the platform;</li>
          <li>resell, sublicense, or provide SiteBolt as a service to unaffiliated third parties;</li>
          <li>interfere with security, availability, or access controls; or</li>
          <li>use the platform unlawfully or to store content the Customer is not entitled to use.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Customer Data & Intellectual Property">
        <p>
          The Customer retains full ownership of its operational data, including worker records,
          licences, timesheets, plant details, photos, SWMS, ITP/ITC records, and other content
          uploaded or entered into SiteBolt (“Customer Data”).
        </p>
        <p>
          Site-Bolt Software Solutions retains all ownership of the SiteBolt platform software,
          architecture, interfaces, documentation, trademarks, and all improvements or derivative
          works of those materials. No rights are granted except the limited SaaS licence in
          section 2.
        </p>
        <p>
          The Customer grants us a limited licence to host, process, and display Customer Data
          solely as needed to provide, secure, and support the service.
        </p>
      </LegalSection>

      <LegalSection title="4. WHS & Compliance Disclaimer">
        <p>
          SiteBolt provides digital management tools to help organisations record, organise, and
          retrieve operational and compliance information. SiteBolt does not supervise worksites,
          certify competence, approve SWMS, interpret industrial awards, or act as the Customer’s
          WHS, legal, or payroll adviser.
        </p>
        <p>
          Contractors and Customer organisations remain solely responsible for on-site safety,
          regulatory compliance, the accuracy and suitability of SWMS and other safety documents,
          worker supervision, and payroll award interpretation. Use of SiteBolt does not reduce or
          replace those obligations.
        </p>
      </LegalSection>

      <LegalSection title="5. Australian Consumer Law (ACL) Guarantees">
        <p>
          Nothing in these terms excludes, restricts, or modifies any consumer guarantees, rights,
          or remedies that cannot be excluded under the Australian Consumer Law, being Schedule 2
          of the Competition and Consumer Act 2010 (Cth).
        </p>
        <p>
          If the ACL applies and SiteBolt fails to comply with a consumer guarantee, the
          Customer’s remedy will be as required by the ACL. For services, that may include
          supplying the services again or paying the cost of having the services supplied again,
          except where a failure is a major failure as defined in the ACL, in which case the
          Customer may have additional rights.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitation of Liability">
        <p>
          To the maximum extent permitted by the ACL and other applicable law, SiteBolt is not
          liable for indirect, incidental, special, or consequential loss, including loss of
          profit, revenue, data, or business interruption, arising from use of the platform.
        </p>
        <p>
          Subject to the ACL, our aggregate liability arising out of or in connection with the
          service in any 12-month period is limited to the fees paid by the Customer to us for
          SiteBolt in that period. This limitation does not apply to liability that cannot be
          limited by law.
        </p>
      </LegalSection>

      <LegalSection title="7. Termination & Suspension">
        <p>
          Either party may terminate a subscription in accordance with the applicable order,
          proposal, or written agreement. We may suspend or terminate access immediately if the
          Customer materially breaches these terms, fails to pay amounts due, or uses the platform
          in a way that threatens security, other customers, or legal compliance.
        </p>
        <p>
          On termination, the Customer’s licence ends. We will, on written request within 30 days,
          provide a reasonable export of available Customer Data, subject to outstanding fees and
          legal retention requirements. After that period we may delete remaining Customer Data
          from live systems, except where we must retain records by law.
        </p>
      </LegalSection>

      <LegalSection title="8. Governing Law">
        <p>
          These terms are governed by the laws of New South Wales and the Australian Capital
          Territory, Australia. The parties submit to the non-exclusive jurisdiction of the courts
          of those places.
        </p>
        <p>
          Questions about these terms may be sent to <ContactLink />.
        </p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
