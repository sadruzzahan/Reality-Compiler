import { useState } from "react";
import { Link } from "wouter";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCookieConsent } from "@/lib/cookie-consent";
import { Checkbox } from "@/components/ui/checkbox";

export function CookieBanner() {
  const { consent, setConsent } = useCookieConsent();
  const [customising, setCustomising] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [observability, setObservability] = useState(false);

  if (consent) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-4 shadow-2xl"
      data-testid="cookie-banner"
    >
      <div className="container mx-auto flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="text-foreground font-medium mb-1">
              We use cookies to make Reality Compiler work.
            </p>
            <p>
              Essential cookies keep you signed in. Analytics &amp;
              observability cookies help us improve the product. You can
              change this any time on the{" "}
              <Link
                href="/cookies"
                className="text-primary underline underline-offset-2"
              >
                cookies page
              </Link>
              .
            </p>
            {customising ? (
              <div className="mt-3 flex flex-col gap-2 text-foreground">
                <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                  <Checkbox
                    checked={analytics}
                    onCheckedChange={(v) => setAnalytics(v === true)}
                    data-testid="checkbox-analytics"
                  />
                  Analytics
                </label>
                <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
                  <Checkbox
                    checked={observability}
                    onCheckedChange={(v) => setObservability(v === true)}
                    data-testid="checkbox-observability"
                  />
                  Observability (error monitoring)
                </label>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-xs"
            onClick={() => setConsent("essential-only")}
            data-testid="button-cookies-reject"
          >
            Reject non-essential
          </Button>
          {customising ? (
            <Button
              size="sm"
              className="font-mono text-xs"
              onClick={() =>
                setConsent("custom", { analytics, observability })
              }
              data-testid="button-cookies-save"
            >
              Save choices
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => setCustomising(true)}
              data-testid="button-cookies-customize"
            >
              Customize
            </Button>
          )}
          <Button
            size="sm"
            className="font-mono text-xs"
            onClick={() => setConsent("accept-all")}
            data-testid="button-cookies-accept"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
