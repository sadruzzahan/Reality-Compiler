import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "rc_cookie_consent_v1";
const EVENT = "rc-cookie-consent-changed";

export type ConsentChoice = "accept-all" | "essential-only" | "custom";

export interface CookieConsent {
  version: 1;
  choice: ConsentChoice;
  analytics: boolean;
  observability: boolean;
  decidedAt: string;
}

const DEFAULTS: Record<ConsentChoice, Pick<CookieConsent, "analytics" | "observability">> = {
  "accept-all": { analytics: true, observability: true },
  "essential-only": { analytics: false, observability: false },
  custom: { analytics: false, observability: false },
};

export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(
  choice: ConsentChoice,
  overrides?: Partial<Pick<CookieConsent, "analytics" | "observability">>,
): CookieConsent {
  const base = DEFAULTS[choice];
  const next: CookieConsent = {
    version: 1,
    choice,
    analytics: overrides?.analytics ?? base.analytics,
    observability: overrides?.observability ?? base.observability,
    decidedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }
  return next;
}

export function clearConsent(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

export function useCookieConsent(): {
  consent: CookieConsent | null;
  setConsent: (
    choice: ConsentChoice,
    overrides?: Partial<Pick<CookieConsent, "analytics" | "observability">>,
  ) => void;
  reset: () => void;
} {
  const [consent, set] = useState<CookieConsent | null>(() => readConsent());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CookieConsent | null>).detail;
      set(detail ?? null);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setConsent = useCallback(
    (
      choice: ConsentChoice,
      overrides?: Partial<Pick<CookieConsent, "analytics" | "observability">>,
    ) => {
      set(writeConsent(choice, overrides));
    },
    [],
  );

  const reset = useCallback(() => {
    clearConsent();
    set(null);
  }, []);

  return { consent, setConsent, reset };
}
