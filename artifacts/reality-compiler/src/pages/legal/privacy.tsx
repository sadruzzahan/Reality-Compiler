import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="May 3, 2026"
      intro={
        <p>
          This policy explains what data Reality Compiler collects, why we
          collect it, and how you can exercise your rights over it.
        </p>
      }
      sections={[
        {
          id: "data-we-collect",
          title: "1. Data we collect",
          body: (
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Account data</strong> — email, name, and avatar from
                Clerk.
              </li>
              <li>
                <strong>Design content</strong> — the prompts you submit, the
                conversations in your sessions, and the AI-generated specs,
                images, and bills of materials they produce.
              </li>
              <li>
                <strong>Marketplace &amp; orders</strong> — listings you
                publish and the shipping address you supply when you place
                an order.
              </li>
              <li>
                <strong>Operational logs</strong> — request IDs, IP
                addresses, user agent, and error traces, kept for security
                and debugging.
              </li>
            </ul>
          ),
        },
        {
          id: "how-we-use-it",
          title: "2. How we use it",
          body: (
            <p>
              We use your data to operate the Service: render your designs,
              fulfil your orders, route designer payouts, prevent abuse, and
              improve product quality. We do not sell your personal data.
            </p>
          ),
        },
        {
          id: "ai-processors",
          title: "3. AI sub-processors",
          body: (
            <p>
              Prompts and conversation history are sent to model providers
              (e.g. OpenAI) through Replit AI Integrations to generate
              specs and images. Generated images are stored in our managed
              object storage. Do not paste secrets, regulated data, or other
              people's personal data into prompts.
            </p>
          ),
        },
        {
          id: "retention",
          title: "4. Retention",
          body: (
            <p>
              Active account data is retained while your account is open.
              When you delete your account we soft-delete your sessions and
              listings immediately, anonymise past orders, and hard-delete
              the underlying objects after a 30-day grace window.
              Anonymised order records are retained for tax and audit
              purposes.
            </p>
          ),
        },
        {
          id: "your-rights",
          title: "5. Your rights",
          body: (
            <>
              <p>
                Depending on your jurisdiction (GDPR, CCPA, and similar) you
                may have the right to access, export, correct, or delete
                your personal data, and to object to certain processing.
              </p>
              <p>
                You can exercise these rights directly from{" "}
                <a href="/my-profile" className="text-primary underline">
                  My Profile → Privacy &amp; data
                </a>
                : download a JSON archive of your data, or delete your
                account. For anything else, write to us via{" "}
                <a href="/contact" className="text-primary underline">
                  the contact page
                </a>
                .
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "6. Cookies",
          body: (
            <p>
              See the{" "}
              <a href="/cookies" className="text-primary underline">
                Cookies page
              </a>{" "}
              for the categories we use and how to change your preferences.
            </p>
          ),
        },
        {
          id: "security",
          title: "7. Security",
          body: (
            <p>
              We use TLS in transit, scoped object-storage credentials, and
              short-lived session tokens. No system is perfectly secure;
              report vulnerabilities via the{" "}
              <a href="/contact" className="text-primary underline">
                contact page
              </a>
              .
            </p>
          ),
        },
        {
          id: "international",
          title: "8. International transfers",
          body: (
            <p>
              The Service is hosted in the United States. By using it, you
              consent to your data being processed there.
            </p>
          ),
        },
        {
          id: "changes",
          title: "9. Changes",
          body: (
            <p>
              We will announce material changes to this policy in the
              product. Continued use after a change means you accept the
              updated policy.
            </p>
          ),
        },
      ]}
    />
  );
}
