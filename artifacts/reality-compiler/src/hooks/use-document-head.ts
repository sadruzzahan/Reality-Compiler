import { useEffect } from "react";

/**
 * Lightweight, dependency-free document <head> manager. We deliberately
 * avoid pulling in react-helmet to keep the bundle small — the trade-off
 * is that head changes happen client-side after hydration, which is fine
 * for an SPA whose marketing surfaces are also linkable from a static
 * sitemap.
 */
export interface DocumentHeadOptions {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  ogType?: "website" | "article" | "product" | "profile";
  /** When provided, an additional `<script type="application/ld+json">` is rendered (and cleaned up on unmount). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  /** When true, sets `<meta name="robots" content="noindex,nofollow">`. Use for private pages. */
  noIndex?: boolean;
}

const SITE_NAME = "Reality Compiler";
const DEFAULT_DESCRIPTION =
  "Describe a physical product in plain text. Reality Compiler turns it into a manufacturable spec, BOM, and concept render — and a marketplace where designers earn from every order.";
const SCRIPT_ID = "rc-jsonld";

function setMeta(
  selector: string,
  attr: "content" | "href",
  value: string | undefined,
  build: () => HTMLElement,
): void {
  let el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(
    selector,
  );
  if (value == null || value === "") {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = build() as HTMLMetaElement | HTMLLinkElement;
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function buildMeta(name: string): HTMLMetaElement {
  const el = document.createElement("meta");
  el.setAttribute("name", name);
  return el;
}

function buildProperty(property: string): HTMLMetaElement {
  const el = document.createElement("meta");
  el.setAttribute("property", property);
  return el;
}

function buildLink(rel: string): HTMLLinkElement {
  const el = document.createElement("link");
  el.setAttribute("rel", rel);
  return el;
}

export function useDocumentHead(opts: DocumentHeadOptions): void {
  useEffect(() => {
    const title = opts.title.includes(SITE_NAME)
      ? opts.title
      : `${opts.title} · ${SITE_NAME}`;
    const description = opts.description ?? DEFAULT_DESCRIPTION;
    const ogType = opts.ogType ?? "website";

    document.title = title;

    setMeta(
      'meta[name="description"]',
      "content",
      description,
      () => buildMeta("description"),
    );

    const robotsValue = opts.noIndex ? "noindex,nofollow" : "index,follow";
    setMeta('meta[name="robots"]', "content", robotsValue, () =>
      buildMeta("robots"),
    );

    const canonical = opts.canonical ?? window.location.href.split("#")[0];
    setMeta('link[rel="canonical"]', "href", canonical, () =>
      buildLink("canonical"),
    );

    setMeta('meta[property="og:site_name"]', "content", SITE_NAME, () =>
      buildProperty("og:site_name"),
    );
    setMeta('meta[property="og:title"]', "content", title, () =>
      buildProperty("og:title"),
    );
    setMeta('meta[property="og:description"]', "content", description, () =>
      buildProperty("og:description"),
    );
    setMeta('meta[property="og:type"]', "content", ogType, () =>
      buildProperty("og:type"),
    );
    setMeta('meta[property="og:url"]', "content", canonical, () =>
      buildProperty("og:url"),
    );

    // Always reconcile image tags — when a route doesn't supply an image
    // we must clear any stale `og:image` / `twitter:image` left over from
    // the previous SPA route, otherwise share previews show the wrong art.
    setMeta('meta[property="og:image"]', "content", opts.image, () =>
      buildProperty("og:image"),
    );
    setMeta(
      'meta[name="twitter:image"]',
      "content",
      opts.image,
      () => buildMeta("twitter:image"),
    );

    setMeta(
      'meta[name="twitter:card"]',
      "content",
      opts.image ? "summary_large_image" : "summary",
      () => buildMeta("twitter:card"),
    );
    setMeta('meta[name="twitter:title"]', "content", title, () =>
      buildMeta("twitter:title"),
    );
    setMeta(
      'meta[name="twitter:description"]',
      "content",
      description,
      () => buildMeta("twitter:description"),
    );

    let scriptEl: HTMLScriptElement | null = null;
    if (opts.jsonLd) {
      scriptEl = document.createElement("script");
      scriptEl.type = "application/ld+json";
      scriptEl.id = SCRIPT_ID;
      scriptEl.text = JSON.stringify(opts.jsonLd);
      document.head.appendChild(scriptEl);
    }

    return () => {
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
    };
  }, [
    opts.title,
    opts.description,
    opts.canonical,
    opts.image,
    opts.ogType,
    opts.noIndex,
    opts.jsonLd ? JSON.stringify(opts.jsonLd) : undefined,
  ]);
}
