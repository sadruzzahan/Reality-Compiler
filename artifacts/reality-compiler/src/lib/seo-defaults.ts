import { useDocumentHead, type DocumentHeadOptions } from "@/hooks/use-document-head";

/**
 * Sugar around `useDocumentHead` for pages that don't need OG/JSON-LD —
 * just a unique title and description. Always sets `noIndex: true` for
 * routes that live behind auth so we don't leak account URLs into search
 * results.
 */
export function usePrivatePageHead(title: string, description: string): void {
  useDocumentHead({
    title,
    description,
    noIndex: true,
  } satisfies DocumentHeadOptions);
}

export function usePublicPageHead(
  title: string,
  description: string,
  extra?: Partial<DocumentHeadOptions>,
): void {
  useDocumentHead({
    title,
    description,
    ...extra,
  } satisfies DocumentHeadOptions);
}
