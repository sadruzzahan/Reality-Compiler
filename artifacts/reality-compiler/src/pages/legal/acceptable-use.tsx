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
          id: "prohibited-products",
          title: "Prohibited products",
          body: (
            <>
              <p className="mb-3">
                You may not use the Service to design, list, sell, or have
                manufactured any product that falls into the following
                categories:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Weapons &amp; munitions.</strong> Firearms,
                  firearm parts (including unfinished receivers, suppressors,
                  auto-sears, conversion devices), ammunition, explosives,
                  pyrotechnics, or anything classed as a weapon under the
                  laws of the country of manufacture or shipment.
                </li>
                <li>
                  <strong>Drugs &amp; drug paraphernalia.</strong> Items
                  primarily intended to facilitate the use, manufacture, or
                  concealment of controlled substances.
                </li>
                <li>
                  <strong>Surveillance &amp; stalkerware.</strong> Hidden
                  cameras, audio bugs, GPS trackers, or covert recording
                  devices marketed for use without the target's knowledge.
                </li>
                <li>
                  <strong>Hate &amp; extremism.</strong> Symbols, flags, or
                  paraphernalia of designated terrorist organisations or
                  designed to incite violence against a protected group.
                </li>
                <li>
                  <strong>Sexual content involving minors.</strong> CSAM,
                  any depiction or facilitation of the sexual abuse of
                  minors, including AI-generated likenesses.
                </li>
                <li>
                  <strong>Counterfeits &amp; IP infringement.</strong>{" "}
                  Replicas of trademarked products, copyrighted works,
                  patented mechanisms, or trade-dress lookalikes; designs
                  scraped from another creator without licence.
                </li>
                <li>
                  <strong>Regulated medical, automotive, aerospace,
                  electrical, or food-contact goods</strong> that lack the
                  certification required in the destination market (FDA,
                  CE, UL, FCC, DOT, etc.).
                </li>
                <li>
                  <strong>Hazardous materials.</strong> Radioactive,
                  biohazardous, or strongly corrosive substances; lithium
                  cells outside UN 38.3 compliance.
                </li>
                <li>
                  <strong>Wildlife &amp; protected resources.</strong>{" "}
                  Items containing ivory, rhino horn, sea turtle shell, or
                  any CITES-listed species.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "prohibited-conduct",
          title: "Prohibited conduct",
          body: (
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Submitting prompts containing other people's personal data,
                secrets, or regulated data (PHI, payment details, etc.).
              </li>
              <li>
                Automated scraping, denial-of-service attempts, or
                circumventing rate limits and authentication.
              </li>
              <li>
                Using the Service to spam, harass, or impersonate other
                people or businesses.
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
