import { useState } from "react";
import { Link } from "wouter";
import {
  useAdminListListings,
  useAdminUpdateListing,
  getAdminListListingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Status = "all" | "active" | "hidden" | "removed";

function statusVariant(status: string) {
  if (status === "active") return "default" as const;
  if (status === "hidden") return "secondary" as const;
  return "destructive" as const;
}

export default function AdminListings() {
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const { data, isLoading } = useAdminListListings({
    status,
    q: submittedQ || undefined,
    limit: 100,
  });
  const update = useAdminUpdateListing();
  const qc = useQueryClient();
  const { toast } = useToast();

  const act = async (id: number, action: "hide" | "restore" | "remove") => {
    let reason: string | undefined;
    if (action === "remove") {
      reason = window.prompt("Reason for removal (visible in audit log):") ?? undefined;
      if (!reason) return;
    }
    try {
      await update.mutateAsync({ id, data: { action, reason } });
      await qc.invalidateQueries({
        queryKey: getAdminListListingsQueryKey(),
      });
      toast({ title: `Listing ${action === "remove" ? "removed" : action + "d"}` });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminLayout title="Listings">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmittedQ(q.trim());
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search title / handle / category"
                  className="pl-8"
                  data-testid="input-admin-listings-search"
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
            <SelectTrigger className="w-[180px]" data-testid="select-admin-listings-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No listings found.</div>
      ) : (
        <div className="border border-border/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">Listing</th>
                <th className="text-left p-3">Creator</th>
                <th className="text-right p-3">Price</th>
                <th className="text-right p-3">Orders</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="p-3">
                    <Link
                      href={`/marketplace/${l.id}`}
                      className="text-primary hover:underline"
                      data-testid={`link-listing-${l.id}`}
                    >
                      {l.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      #{l.id} · {l.category}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs">@{l.creatorHandle}</td>
                  <td className="p-3 text-right">${l.listingPrice.toFixed(2)}</td>
                  <td className="p-3 text-right">{l.orderCount}</td>
                  <td className="p-3">
                    <Badge variant={statusVariant(l.status)}>{l.status}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      {l.status === "active" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => act(l.id, "hide")}
                          data-testid={`button-hide-${l.id}`}
                        >
                          Hide
                        </Button>
                      )}
                      {l.status === "hidden" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => act(l.id, "restore")}
                          data-testid={`button-restore-${l.id}`}
                        >
                          Restore
                        </Button>
                      )}
                      {l.status !== "removed" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => act(l.id, "remove")}
                          data-testid={`button-remove-${l.id}`}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
