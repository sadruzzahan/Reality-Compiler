import { LegalPage } from "@/components/legal-page";

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      lastUpdated="May 3, 2026"
      intro={
        <p>
          Reality Compiler is a tool for indie hardware founders. Some uses
          are off-limits because they put people, IP holders, or the
          platform at risk.
        </p>
      }
      sections={[
        {
          id: "prohibited",
          title: "Prohibited uses",
          body: (
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Designing weapons, ammunition, or weapon components
                (including untraceable firearms).
              </li>
              <li>
                Generating products that infringe on third-party trademarks,
                trade dress, or patented mechanisms.
              </li>
              <li>
                Designing CSAM, content depicting real minors in sexualised
                contexts, or other content prohibited by law.
              </li>
              <li>
                Designs intended to evade safety regulations (medical,
                automotive, electrical, food-contact, etc.) without
                appropriate certification.
              </li>
              <li>
                Submitting prompts containing other people's personal data,
                secrets, or regulated data (PHI, payment details, etc.).
              </li>
              <li>
                Automated scraping, denial-of-service attempts, or
                circumventing rate limits and authentication.
              </li>
            </ul>
          ),
        },
        {
          id: "marketplace",
          title: "Marketplace listings",
          body: (
            <p>
              Public listings must accurately describe the design and
              comply with the rules above. We may unpublish listings that
              violate this policy at any time, with or without notice.
            </p>
          ),
        },
        {
          id: "enforcement",
          title: "Enforcement",
          body: (
            <p>
              Violations may result in removal of content, suspension, or
              permanent termination of the offending account, and we may
              cooperate with law enforcement when required. Report abuse
              via the{" "}
              <a href="/contact" className="text-primary underline">
                contact page
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
