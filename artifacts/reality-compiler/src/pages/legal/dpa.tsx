import { Download } from "lucide-react";
import { LegalPage } from "@/components/legal-page";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const PDF_HREF = `${basePath}/legal/reality-compiler-dpa.pdf`;

export default function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Addendum"
      lastUpdated="May 3, 2026"
      intro={
        <div className="space-y-4">
          <p>
            This Data Processing Addendum ("DPA") supplements the Terms of
            Service when Reality Compiler processes personal data on behalf
            of a customer (the "Controller").
          </p>
          <a
            href={PDF_HREF}
            download="reality-compiler-dpa.pdf"
            data-testid="link-dpa-download"
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-mono uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download signed DPA (PDF)
          </a>
          <p className="text-xs text-muted-foreground">
            Need a counter-signed copy or bespoke clauses (HIPAA, PCI-DSS,
            etc.)? Email{" "}
            <a
              href="mailto:privacy@reality-compiler.example"
              className="text-primary underline"
            >
              privacy@reality-compiler.example
            </a>
            .
          </p>
        </div>
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
