import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@workspace/api-client-react";

interface ErrorFallbackProps {
  error: unknown;
  resetError?: () => void;
  eventId?: string;
}

function getRequestId(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    return (error as ApiError).headers?.get("x-request-id") ?? undefined;
  }
  return undefined;
}

export function ErrorFallback({
  error,
  resetError,
  eventId,
}: ErrorFallbackProps) {
  const requestId = getRequestId(error);
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-12 text-center"
      data-testid="error-fallback"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground">
          We hit an unexpected error. The team has been notified — try
          refreshing this page or returning home.
        </p>
        <p className="text-xs text-muted-foreground/80 break-all font-mono">
          {message}
        </p>
        {(requestId || eventId) && (
          <p
            className="text-[11px] text-muted-foreground/60 font-mono pt-1"
            data-testid="error-fallback-ids"
          >
            {requestId ? <>request {requestId}</> : null}
            {requestId && eventId ? " · " : null}
            {eventId ? <>event {eventId}</> : null}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {resetError ? (
          <Button
            onClick={resetError}
            size="sm"
            className="font-mono text-xs"
            data-testid="button-error-retry"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Try again
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs"
          onClick={() => {
            window.location.href = import.meta.env.BASE_URL || "/";
          }}
          data-testid="button-error-home"
        >
          Go home
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="font-mono text-xs"
          onClick={() => {
            const subject = encodeURIComponent(
              "Reality Compiler error report",
            );
            const body = encodeURIComponent(
              [
                `Message: ${message}`,
                requestId ? `Request: ${requestId}` : "",
                eventId ? `Event: ${eventId}` : "",
                `URL: ${window.location.href}`,
              ]
                .filter(Boolean)
                .join("\n"),
            );
            window.location.href = `${
              import.meta.env.BASE_URL || "/"
            }contact?subject=${subject}&body=${body}`;
          }}
          data-testid="button-error-report"
        >
          Report this
        </Button>
      </div>
    </div>
  );
}
