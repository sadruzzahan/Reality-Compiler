import { useState } from "react";
import { Link } from "wouter";
import {
  useAdminListReports,
  useAdminUpdateReport,
  getAdminListReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type StatusFilter = "all" | "open" | "investigating" | "resolved" | "dismissed";

function statusVariant(s: string) {
  if (s === "open") return "destructive" as const;
  if (s === "investigating") return "secondary" as const;
  return "default" as const;
}

function targetHref(t: string, id: string) {
  if (t === "listing") return `/marketplace/${id}`;
  if (t === "designer") return `/designers/${encodeURIComponent(id)}`;
  if (t === "order") return `/admin/orders/${id}`;
  return null;
}

export default function AdminReports() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const { data, isLoading } = useAdminListReports({ status, limit: 100 });
  const update = useAdminUpdateReport();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");

  const submit = async (
    id: number,
    next: "investigating" | "resolved" | "dismissed",
  ) => {
    try {
      await update.mutateAsync({
        id,
        data: {
          status: next,
          resolutionNotes: resolution.trim() || undefined,
        },
      });
      await qc.invalidateQueries({ queryKey: getAdminListReportsQueryKey() });
      setOpenId(null);
      setResolution("");
      toast({ title: `Report ${next}` });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminLayout title="Reports">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-[180px]" data-testid="select-reports-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No reports.</div>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => {
            const href = targetHref(r.targetType, r.targetId);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">
                        #{r.id} · {new Date(r.createdAt).toLocaleString()} ·{" "}
                        @{r.reporterHandle ?? r.reporterUserId.slice(0, 8)}
                      </div>
                      <div className="font-medium">
                        {r.reason} —{" "}
                        {href ? (
                          <Link
                            href={href}
                            className="text-primary hover:underline"
                            data-testid={`link-report-target-${r.id}`}
                          >
                            {r.targetType} {r.targetTitle ?? `#${r.targetId}`}
                          </Link>
                        ) : (
                          <span>
                            {r.targetType} #{r.targetId}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </div>
                  {r.notes && (
                    <p className="text-sm whitespace-pre-wrap text-foreground/90 bg-muted/30 p-3 rounded">
                      {r.notes}
                    </p>
                  )}
                  {r.resolutionNotes && (
                    <p className="text-xs text-muted-foreground">
                      Resolution: {r.resolutionNotes}
                      {r.resolvedByHandle && ` — @${r.resolvedByHandle}`}
                    </p>
                  )}

                  {openId === r.id ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="Resolution notes (audit log)"
                        data-testid={`textarea-resolution-${r.id}`}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => submit(r.id, "investigating")}
                          disabled={update.isPending}
                        >
                          Mark investigating
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => submit(r.id, "resolved")}
                          disabled={update.isPending}
                          data-testid={`button-resolve-${r.id}`}
                        >
                          Resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => submit(r.id, "dismissed")}
                          disabled={update.isPending}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOpenId(null);
                            setResolution("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    r.status === "open" || r.status === "investigating" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOpenId(r.id);
                          setResolution(r.resolutionNotes ?? "");
                        }}
                        data-testid={`button-actions-${r.id}`}
                      >
                        Take action
                      </Button>
                    ) : null
                  )}
                </CardContent>
              </Card>
            );
          })}
        </ul>
      )}
    </AdminLayout>
  );
}
