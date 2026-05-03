import { useLocation, useParams } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft, AlertTriangle, MapPin, Factory, DollarSign,
  Clock, ListChecks, ChevronRight, Loader2, Package,
  Hammer, ShieldCheck, Truck, CheckCircle2, Inbox
} from "lucide-react";
import {
  useGetOrder,
  useAdvanceOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
  type OrderStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { usePrivatePageHead } from "@/lib/seo-defaults";

const STATUS_FLOW: OrderStatus[] = [
  "queued",
  "in_production",
  "quality_check",
  "shipped",
  "delivered",
];

function statusIcon(status: string) {
  switch (status) {
    case "queued":
      return Inbox;
    case "in_production":
      return Hammer;
    case "quality_check":
      return ShieldCheck;
    case "shipped":
      return Truck;
    case "delivered":
      return CheckCircle2;
    default:
      return ChevronRight;
  }
}

function statusColor(status: string) {
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

export default function OrderDetail() {
  usePrivatePageHead(
    "Order detail",
    "Track the fulfilment status of a marketplace order.",
  );
  const { id } = useParams();
  const orderId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: order, isLoading, isError } = useGetOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId) },
  });

  const advanceOrder = useAdvanceOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      },
    },
  });

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-muted/10">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Order Not Found</h2>
        <p className="text-muted-foreground mb-6">This order may have been deleted or never existed.</p>
        <Button onClick={() => setLocation("/orders")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Orders
        </Button>
      </div>
    );
  }

  if (isLoading || !order) {
    return (
      <div className="flex-1 overflow-auto bg-muted/10">
        <div className="container max-w-6xl mx-auto px-6 py-12 space-y-6">
          <Skeleton className="h-12 w-2/3" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 lg:col-span-2 rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDelivered = order.status === "delivered";

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-6xl mx-auto px-6 py-10">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 font-mono text-xs"
          onClick={() => setLocation("/orders")}
          data-testid="link-back-orders"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> All Orders
        </Button>

        <div className="flex items-start justify-between gap-6 mb-8 flex-wrap">
          <div>
            <div className="text-xs font-mono uppercase text-muted-foreground mb-1">
              Order #{order.id.toString().padStart(5, "0")}
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-sans flex items-center gap-3">
              <Package className="w-7 h-7 text-primary" />
              {order.productName || order.sessionTitle}
            </h1>
            <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground font-mono flex-wrap">
              <span className="flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5" /> {order.supplier.name}
              </span>
              <span>•</span>
              <span>{order.supplier.location}, {order.supplier.country}</span>
            </div>
          </div>
          <Badge
            className={`font-mono text-xs uppercase px-3 py-1.5 ${statusColor(order.status)}`}
            data-testid="badge-current-status"
          >
            {order.status.replace("_", " ")}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-card shadow-sm border-border/60">
            <CardHeader className="border-b border-border/40">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm font-mono uppercase flex items-center gap-2 text-foreground">
                  <ListChecks className="w-4 h-4" /> Status Timeline
                </CardTitle>
                {!isDelivered && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    disabled={advanceOrder.isPending}
                    onClick={() => advanceOrder.mutate({ id: orderId })}
                    data-testid="button-advance-order"
                  >
                    {advanceOrder.isPending ? (
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    ) : (
                      <ChevronRight className="w-3 h-3 mr-2" />
                    )}
                    Advance Status (Demo)
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <ol className="relative border-l border-border/60 ml-3 space-y-6">
                {order.statusHistory.map((event, i) => {
                  const Icon = statusIcon(event.status);
                  const isCurrent = event.status === order.status && i === order.statusHistory.length - 1;
                  return (
                    <li key={i} className="ml-6">
                      <span
                        className={`absolute -left-[14px] flex items-center justify-center w-7 h-7 rounded-full border ${
                          isCurrent
                            ? "bg-primary text-primary-foreground border-primary ring-4 ring-primary/20"
                            : "bg-card border-border text-muted-foreground"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`font-mono text-xs uppercase ${isCurrent ? "text-primary font-bold" : "text-foreground font-medium"}`}>
                          {event.status.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatDistanceToNow(new Date(event.at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 leading-snug">{event.note}</p>
                    </li>
                  );
                })}

                {STATUS_FLOW.filter((s) => !order.statusHistory.some((e) => e.status === s)).map((s) => {
                  const Icon = statusIcon(s);
                  return (
                    <li key={`pending-${s}`} className="ml-6 opacity-40">
                      <span className="absolute -left-[14px] flex items-center justify-center w-7 h-7 rounded-full border bg-card border-dashed border-border text-muted-foreground">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs uppercase text-muted-foreground">
                          {s.replace("_", " ")}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">pending</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-card shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono uppercase flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" /> Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1 leading-relaxed">
                <div className="font-medium">{order.shippingAddress.recipient}</div>
                <div className="text-muted-foreground">{order.shippingAddress.line1}</div>
                {order.shippingAddress.line2 && (
                  <div className="text-muted-foreground">{order.shippingAddress.line2}</div>
                )}
                <div className="text-muted-foreground">
                  {order.shippingAddress.city}, {order.shippingAddress.region} {order.shippingAddress.postalCode}
                </div>
                <div className="text-muted-foreground">{order.shippingAddress.country}</div>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono uppercase flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="w-4 h-4" /> Quote Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs">Supplier</span>
                  <span className="font-medium">{order.supplier.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs">Unit cost</span>
                  <span className="font-mono">${order.quote.unitCost.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs">Quantity</span>
                  <span className="font-mono">{order.quantity}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs">Setup fee</span>
                  <span className="font-mono">${order.quote.setupFee.toFixed(2)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase font-bold">Total</span>
                  <span className="font-mono font-bold text-primary text-base">
                    ${order.totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-muted-foreground font-mono text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Lead time
                  </span>
                  <span className="font-mono text-xs">{order.leadTimeDays} days</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card shadow-sm border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono uppercase flex items-center gap-2 text-muted-foreground">
                  <Hammer className="w-4 h-4" /> Process Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.quote.processBreakdown.map((p, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{p.process}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                    </div>
                    <div className="font-mono text-xs text-primary shrink-0">${p.cost.toFixed(2)}</div>
                  </div>
                ))}
                {order.quote.processBreakdown.length === 0 && (
                  <p className="text-xs text-muted-foreground font-mono">No process breakdown.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="text-xs font-mono text-muted-foreground mt-8 flex justify-between">
          <span>Placed {format(new Date(order.createdAt), "MMM d, yyyy 'at' HH:mm")}</span>
          <span>Last updated {formatDistanceToNow(new Date(order.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}
