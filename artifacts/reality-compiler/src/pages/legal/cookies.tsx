import { Button } from "@/components/ui/button";
import { LegalPage } from "@/components/legal-page";
import { useCookieConsent } from "@/lib/cookie-consent";

export default function CookiesPage() {
  const { consent, reset } = useCookieConsent();

  return (
    <LegalPage
      title="Cookies"
      lastUpdated="May 3, 2026"
      intro={
        <p>
          We use a small number of cookies and equivalent storage. We do not
          embed third-party advertising or social-media pixels.
        </p>
      }
      sections={[
        {
          id: "categories",
          title: "Categories",
          body: (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">Essential</h3>
                <p className="text-sm text-muted-foreground">
                  Set by Clerk to keep you signed in. The Service does not
                  function without these and they cannot be disabled.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  Optional. Aggregated usage signals (e.g. which page is
                  visited) so we can prioritise improvements. Off by
                  default.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Observability
                </h3>
                <p className="text-sm text-muted-foreground">
                  Optional. Client error and performance traces so we can
                  fix bugs faster. Off by default.
                </p>
              </div>
            </div>
          ),
        },
        {
          id: "your-choice",
          title: "Your current preference",
          body: (
            <div className="space-y-4">
              {consent ? (
                <div
                  className="rounded-md border border-border/60 bg-card p-4 text-sm font-mono"
                  data-testid="cookies-current"
                >
                  <p>Choice: {consent.choice}</p>
                  <p>Analytics: {consent.analytics ? "on" : "off"}</p>
                  <p>
                    Observability: {consent.observability ? "on" : "off"}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Decided at {consent.decidedAt}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You have not made a choice yet.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                data-testid="button-cookies-reset"
              >
                Reset my choice
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
}
