import { LegalPage } from "@/components/legal-page";

export default function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Addendum"
      lastUpdated="May 3, 2026"
      intro={
        <p>
          This Data Processing Addendum ("DPA") supplements the Terms of
          Service when Reality Compiler processes personal data on behalf of
          a customer (the "Controller").
        </p>
      }
      sections={[
        {
          id: "scope",
          title: "1. Scope &amp; roles",
          body: (
            <p>
              The Controller determines the purposes and means of processing.
              Reality Compiler acts as Processor for personal data submitted
              through the Service (e.g. shipping addresses, prompts that
              contain personal data).
            </p>
          ),
        },
        {
          id: "subject-matter",
          title: "2. Subject matter, duration, nature, and purpose",
          body: (
            <p>
              We process personal data for as long as the Controller's
              account is active, for the purpose of operating the Service —
              generating designs, fulfilling orders, and routing payouts.
            </p>
          ),
        },
        {
          id: "subprocessors",
          title: "3. Sub-processors",
          body: (
            <ul className="list-disc pl-5 space-y-2">
              <li>Replit (hosting, object storage, AI Integrations proxy)</li>
              <li>Clerk (authentication, session management)</li>
              <li>OpenAI (model inference for specs and images)</li>
              <li>Neon (managed Postgres)</li>
            </ul>
          ),
        },
        {
          id: "security",
          title: "4. Security",
          body: (
            <p>
              We implement TLS in transit, encryption at rest via the
              underlying providers, scoped credentials for object storage,
              short-lived session tokens, audit logging of sensitive
              mutations, and rate limiting.
            </p>
          ),
        },
        {
          id: "data-subject-rights",
          title: "5. Data-subject rights",
          body: (
            <p>
              We provide tooling for export and deletion via My Profile. For
              other rights requests forwarded by the Controller, we will
              cooperate without undue delay and at no additional charge.
            </p>
          ),
        },
        {
          id: "breach",
          title: "6. Breach notification",
          body: (
            <p>
              We will notify the Controller without undue delay after
              becoming aware of a personal-data breach affecting their data.
            </p>
          ),
        },
        {
          id: "transfers",
          title: "7. International transfers",
          body: (
            <p>
              Where personal data leaves the EEA / UK / Switzerland, transfers
              rely on the EU Standard Contractual Clauses and the UK
              addendum, supplemented by the security measures above.
            </p>
          ),
        },
        {
          id: "deletion",
          title: "8. Return / deletion at termination",
          body: (
            <p>
              On termination of the Controller's account, personal data is
              soft-deleted immediately and hard-deleted after the 30-day
              grace window described in the Privacy Policy.
            </p>
          ),
        },
      ]}
    />
  );
}
