import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useAdminListUsers,
  useAdminGetUser,
  useAdminSuspendUser,
  useAdminUnsuspendUser,
  getAdminGetUserQueryKey,
  getAdminListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Status = "all" | "active" | "suspended" | "deleted";

export default function AdminUsersPage() {
  const params = useParams();
  if (params.userId) return <AdminUserDetail userId={params.userId} />;
  return <AdminUsersList />;
}

function AdminUsersList() {
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const { data, isLoading } = useAdminListUsers({
    status,
    q: submittedQ || undefined,
    limit: 50,
  });

  return (
    <AdminLayout title="Users">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedQ(q.trim());
            }}
            className="flex gap-2 flex-1 min-w-[200px]"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by email / name / handle"
                className="pl-8"
                data-testid="input-admin-users-search"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No users.</div>
      ) : (
        <div className="border border-border/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Email</th>
                <th className="text-right p-3">Listings</th>
                <th className="text-right p-3">Orders</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.userId} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="p-3">
                    <Link
                      href={`/admin/users/${encodeURIComponent(u.userId)}`}
                      className="text-primary hover:underline"
                      data-testid={`link-admin-user-${u.userId}`}
                    >
                      @{u.handle}
                    </Link>
                    {u.isAdmin && (
                      <Badge variant="default" className="ml-2 text-[10px]">
                        admin
                      </Badge>
                    )}
                    <div className="text-xs text-muted-foreground font-mono">
                      {u.userId.slice(0, 12)}…
                    </div>
                  </td>
                  <td className="p-3 text-xs">{u.email ?? "—"}</td>
                  <td className="p-3 text-right">{u.listingCount}</td>
                  <td className="p-3 text-right">{u.orderCount}</td>
                  <td className="p-3">
                    {u.deletedAt ? (
                      <Badge variant="destructive">deleted</Badge>
                    ) : u.suspendedAt ? (
                      <Badge variant="destructive">suspended</Badge>
                    ) : (
                      <Badge variant="secondary">active</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/users/${encodeURIComponent(u.userId)}`}>
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    </Link>
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

function AdminUserDetail({ userId }: { userId: string }) {
  const { data, isLoading } = useAdminGetUser(userId);
  const [, setLocation] = useLocation();
  const [reason, setReason] = useState("");
  const suspend = useAdminSuspendUser();
  const unsuspend = useAdminUnsuspendUser();
  const qc = useQueryClient();
  const { toast } = useToast();

  const doSuspend = async () => {
    if (!reason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Suspend @${data?.user.handle}?`)) return;
    try {
      await suspend.mutateAsync({ userId, data: { reason: reason.trim() } });
      await qc.invalidateQueries({ queryKey: getAdminGetUserQueryKey(userId) });
      await qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      setReason("");
      toast({ title: "User suspended" });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const doUnsuspend = async () => {
    if (!window.confirm("Unsuspend this user?")) return;
    try {
      await unsuspend.mutateAsync({ userId });
      await qc.invalidateQueries({ queryKey: getAdminGetUserQueryKey(userId) });
      await qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      toast({ title: "User unsuspended" });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminLayout title={`User ${userId.slice(0, 12)}…`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/admin/users")}
        className="gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back to users
      </Button>

      {isLoading || !data ? (
        <div className="text-muted-foreground py-8">Loading…</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                @{data.user.handle}{" "}
                {data.user.isAdmin && (
                  <Badge variant="default" className="ml-2">
                    admin
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>Email: {data.user.email ?? "—"}</div>
              <div className="font-mono text-xs">{data.user.userId}</div>
              <div>
                Listings: {data.user.listingCount} · Orders:{" "}
                {data.user.orderCount}
              </div>
              {data.user.suspendedAt && (
                <div className="text-destructive text-sm">
                  Suspended {new Date(data.user.suspendedAt).toLocaleString()}
                  {data.user.suspensionReason && ` — ${data.user.suspensionReason}`}
                </div>
              )}
              {data.user.deletedAt && (
                <div className="text-destructive text-sm">
                  Soft-deleted {new Date(data.user.deletedAt).toLocaleString()}
                </div>
              )}
              <div className="pt-2 flex gap-3">
                <Link href={`/designers/${encodeURIComponent(data.user.userId)}`}>
                  <Button size="sm" variant="ghost">
                    Public profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Moderation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.user.isAdmin ? (
                <p className="text-xs text-muted-foreground">
                  Admins cannot be suspended via this UI. Demote in Clerk first.
                </p>
              ) : data.user.suspendedAt ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={doUnsuspend}
                  disabled={unsuspend.isPending}
                  data-testid="button-unsuspend-user"
                >
                  Unsuspend
                </Button>
              ) : (
                <>
                  <Input
                    placeholder="Reason (visible in audit log)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    data-testid="input-suspend-reason"
                  />
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={doSuspend}
                    disabled={suspend.isPending}
                    data-testid="button-suspend-user"
                  >
                    Suspend user
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Recent listings
                </div>
                {data.recentListings.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1">
                    {data.recentListings.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/marketplace/${l.id}`}
                          className="text-primary hover:underline"
                        >
                          #{l.id} {l.title}
                        </Link>{" "}
                        <Badge
                          variant={l.status === "active" ? "secondary" : "destructive"}
                        >
                          {l.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Recent orders
                </div>
                {data.recentOrders.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1">
                    {data.recentOrders.map((o) => (
                      <li key={o.id}>
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="text-primary hover:underline"
                        >
                          #{o.id} {o.sessionTitle}
                        </Link>{" "}
                        — ${o.totalCost.toFixed(2)} · {o.status}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Audit log
                </div>
                {data.auditLog.length === 0 ? (
                  <p className="text-muted-foreground">None</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {data.auditLog.slice(0, 30).map((e) => (
                      <li key={e.id} className="font-mono">
                        {new Date(e.createdAt).toLocaleString()} · {e.action} ·{" "}
                        @{e.actorHandle ?? "system"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
