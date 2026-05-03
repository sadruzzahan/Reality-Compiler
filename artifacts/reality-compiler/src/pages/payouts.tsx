import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Banknote, Store, Sparkles, TrendingUp } from "lucide-react";
import {
  useListDesignerOrders,
  type OrderSummaryStatus,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusColorClass(status: OrderSummaryStatus) {
  switch (status) {
    case "queued":
      return "bg-muted text-muted-foreground";
    case "in_production":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "quality_check":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "shipped":
      return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30";
    case "delivered":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    default:
      return "";
  }
}

function payoutStatusLabel(status: OrderSummaryStatus): {
  label: string;
  className: string;
} {
  if (status === "delivered") {
    return {
      label: "Eligible",
      className:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    };
  }
  return {
    label: "Accruing",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  };
}

export default function Payouts() {
  const { data: orders, isLoading } = useListDesignerOrders();

  const totalEarned =
    orders?.reduce((sum, o) => sum + o.payoutAmount, 0) ?? 0;
  const paidOut =
    orders
      ?.filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + o.payoutAmount, 0) ?? 0;
  const pending = totalEarned - paidOut;

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-sans flex items-center gap-3">
              <Banknote className="w-7 h-7 text-primary" />
              Designer payouts
            </h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm">
              Royalties earned when buyers order your published designs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card data-testid="card-payouts-total">
            <CardContent className="pt-6">
              <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Total earned
              </div>
              <div className="text-3xl font-bold font-mono text-primary mt-1">
                ${totalEarned.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-payouts-paid">
            <CardContent className="pt-6">
              <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Eligible
              </div>
              <div className="text-3xl font-bold font-mono text-emerald-500 mt-1">
                ${paidOut.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-payouts-pending">
            <CardContent className="pt-6">
              <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Pending
              </div>
              <div className="text-3xl font-bold font-mono text-amber-500 mt-1">
                ${pending.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-0">
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-24 border border-dashed rounded-xl bg-card">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-30" />
            <h3 className="text-xl font-medium">No payouts yet</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto font-mono text-sm">
              Publish a design to the marketplace — you'll earn a payout
              every time a buyer orders it.
            </p>
            <Button asChild className="mt-6 font-mono">
              <Link
                href="/marketplace"
                data-testid="link-marketplace-from-payouts"
              >
                <Store className="w-4 h-4 mr-2" />
                Browse the marketplace
              </Link>
            </Button>
          </div>
        ) : (
          <Card className="overflow-hidden bg-card border-border shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs">ORDER #</TableHead>
                  <TableHead className="font-mono text-xs">LISTING</TableHead>
                  <TableHead className="font-mono text-xs">BUYER</TableHead>
                  <TableHead className="font-mono text-xs text-right">QTY</TableHead>
                  <TableHead className="font-mono text-xs">STATUS</TableHead>
                  <TableHead className="font-mono text-xs">PAYOUT</TableHead>
                  <TableHead className="font-mono text-xs text-right">AMOUNT</TableHead>
                  <TableHead className="font-mono text-xs text-right">PLACED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const ps = payoutStatusLabel(order.status);
                  return (
                    <TableRow
                      key={order.id}
                      data-testid={`row-payout-${order.id}`}
                    >
                      <TableCell className="font-mono text-xs font-medium text-primary">
                        #{order.id.toString().padStart(5, "0")}
                      </TableCell>
                      <TableCell>
                        {order.listingDeleted ? (
                          <span
                            className="font-medium text-muted-foreground line-clamp-1"
                            data-testid={`text-payout-listing-${order.id}`}
                          >
                            {order.listingTitle}
                            <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                              (unpublished)
                            </span>
                          </span>
                        ) : (
                          <Link
                            href={`/marketplace/${order.listingId}`}
                            className="font-medium hover:text-primary transition-colors line-clamp-1"
                            data-testid={`link-payout-listing-${order.id}`}
                          >
                            {order.listingTitle}
                          </Link>
                        )}
                        {order.productName ? (
                          <div className="text-xs text-muted-foreground font-mono line-clamp-1">
                            {order.productName}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.buyerHandle ? `@${order.buyerHandle}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {order.quantity}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] uppercase ${statusColorClass(order.status)}`}
                        >
                          {order.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] uppercase ${ps.className}`}
                          data-testid={`badge-payout-status-${order.id}`}
                        >
                          {ps.label}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="text-right font-mono text-sm font-medium text-emerald-500"
                        data-testid={`text-payout-amount-${order.id}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />$
                          {order.payoutAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {formatDistanceToNow(new Date(order.createdAt), {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
