import { Link } from "wouter";
import { useGetAdminDashboard } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function Stat({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  href?: string;
  tone?: "default" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-400"
        : "text-foreground";
  const inner = (
    <Card className="hover:border-primary/40 transition-colors">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminDashboard() {
  const { data, isLoading } = useGetAdminDashboard();
  return (
    <AdminLayout title="Dashboard">
      {isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <Stat
            label="Open reports"
            value={data.openReports}
            href="/admin/reports"
            tone={data.openReports > 0 ? "warn" : "default"}
          />
          <Stat
            label="Suspended users"
            value={data.suspendedUsers}
            href="/admin/users"
            tone={data.suspendedUsers > 0 ? "danger" : "default"}
          />
          <Stat
            label="Active listings"
            value={data.activeListings}
            href="/admin/listings"
          />
          <Stat label="Hidden listings" value={data.hiddenListings} href="/admin/listings" />
          <Stat label="Removed listings" value={data.removedListings} href="/admin/listings" />
          <Stat
            label="Orders awaiting payment"
            value={data.ordersAwaitingPayment}
            href="/admin/orders"
          />
          <Stat
            label="Orders in progress"
            value={data.ordersInProgress}
            href="/admin/orders"
          />
          <Stat label="Last 24h orders" value={data.last24hOrders} />
          <Stat label="Last 24h reports" value={data.last24hReports} />
        </div>
      )}
    </AdminLayout>
  );
}
