import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Package, Truck, Factory, ListChecks } from "lucide-react";
import { useListOrders, type OrderSummaryStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePrivatePageHead } from "@/lib/seo-defaults";

function statusBadgeVariant(status: OrderSummaryStatus) {
  switch (status) {
    case "delivered":
      return "default";
    case "shipped":
      return "secondary";
    case "queued":
      return "outline";
    default:
      return "secondary";
  }
}

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
      return "bg-primary/15 text-primary border-primary/30";
    default:
      return "";
  }
}

export default function Orders() {
  usePrivatePageHead(
    "Your orders",
    "Track marketplace orders you've placed on Reality Compiler.",
  );
  const [, setLocation] = useLocation();
  const { data: orders, isLoading } = useListOrders();

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-sans flex items-center gap-3">
              <Truck className="w-7 h-7 text-primary" />
              Orders
            </h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm">
              Manufacturing orders across all sessions.
            </p>
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="p-0">
            <div className="space-y-2 p-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          </CardContent></Card>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-24 border border-dashed rounded-xl bg-card">
            <ListChecks className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-30" />
            <h3 className="text-xl font-medium">No orders yet</h3>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto font-mono text-sm">
              Place an order from one of your design sessions to get started.
            </p>
            <Button
              className="mt-6 font-mono"
              onClick={() => setLocation("/sessions")}
              data-testid="link-sessions-from-orders"
            >
              <Package className="w-4 h-4 mr-2" />
              Go to Sessions
            </Button>
          </div>
        ) : (
          <Card className="overflow-hidden bg-card border-border shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-mono text-xs">ORDER #</TableHead>
                  <TableHead className="font-mono text-xs">PRODUCT</TableHead>
                  <TableHead className="font-mono text-xs">SUPPLIER</TableHead>
                  <TableHead className="font-mono text-xs text-right">QTY</TableHead>
                  <TableHead className="font-mono text-xs text-right">TOTAL</TableHead>
                  <TableHead className="font-mono text-xs text-right">LEAD</TableHead>
                  <TableHead className="font-mono text-xs">STATUS</TableHead>
                  <TableHead className="font-mono text-xs text-right">CREATED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map(order => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer group hover:bg-muted/50 transition-colors"
                    onClick={() => setLocation(`/orders/${order.id}`)}
                    data-testid={`row-order-${order.id}`}
                  >
                    <TableCell className="font-mono text-xs font-medium text-primary">
                      #{order.id.toString().padStart(5, '0')}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium group-hover:text-primary transition-colors line-clamp-1">
                        {order.productName || order.sessionTitle}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-1.5">
                        <Factory className="w-3 h-3 text-muted-foreground" />
                        {order.supplierName}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{order.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-primary">
                      ${order.totalCost.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{order.leadTimeDays}d</TableCell>
                    <TableCell>
                      <Badge
                        variant={statusBadgeVariant(order.status)}
                        className={`font-mono text-[10px] uppercase ${statusColorClass(order.status)}`}
                      >
                        {order.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground font-mono">
                      {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
