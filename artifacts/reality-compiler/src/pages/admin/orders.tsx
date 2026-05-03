import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useAdminListOrders,
  useAdminGetOrder,
  useAdminAddOrderNote,
  useAdminRefundOrder,
  getAdminGetOrderQueryKey,
  getAdminListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Search } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type StatusFilter =
  | "all"
  | "queued"
  | "in_production"
  | "quality_check"
  | "shipped"
  | "delivered";
type PayFilter =
  | "all"
  | "pending_payment"
  | "paid"
  | "refunded"
  | "partially_refunded"
  | "failed";
type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer";

function statusVariant(s: string) {
  if (s === "delivered" || s === "paid") return "default" as const;
  if (s === "cancelled" || s === "failed" || s === "refunded")
    return "destructive" as const;
  return "secondary" as const;
}

export default function AdminOrdersPage() {
  const params = useParams();
  if (params.id) return <AdminOrderDetail id={Number(params.id)} />;
  return <AdminOrdersList />;
}

function AdminOrdersList() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PayFilter>("all");
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const { data, isLoading } = useAdminListOrders({
    status,
    paymentStatus,
    q: submittedQ || undefined,
    limit: 100,
  });

  return (
    <AdminLayout title="Orders">
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
                placeholder="Search session / supplier / id / userId"
                className="pl-8"
                data-testid="input-admin-orders-search"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="in_production">In production</SelectItem>
              <SelectItem value="quality_check">Quality check</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={paymentStatus}
            onValueChange={(v) => setPaymentStatus(v as PayFilter)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="pending_payment">Awaiting payment</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">No orders.</div>
      ) : (
        <div className="border border-border/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">Order</th>
                <th className="text-left p-3">Buyer / Designer</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Payment</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Refunded</th>
                <th className="text-right p-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="p-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="text-primary hover:underline"
                      data-testid={`link-admin-order-${o.id}`}
                    >
                      #{o.id} {o.sessionTitle}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {o.supplierName}
                      {o.adminNoteCount > 0 && ` · ${o.adminNoteCount} notes`}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <div>buyer: {o.buyerHandle ? `@${o.buyerHandle}` : o.userId.slice(0, 8)}</div>
                    {o.designerHandle && <div>designer: @{o.designerHandle}</div>}
                  </td>
                  <td className="p-3">
                    <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={statusVariant(o.paymentStatus)}>{o.paymentStatus}</Badge>
                  </td>
                  <td className="p-3 text-right">${o.totalCost.toFixed(2)}</td>
                  <td className="p-3 text-right">${o.refundedAmount.toFixed(2)}</td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/orders/${o.id}`}>
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

function AdminOrderDetail({ id }: { id: number }) {
  const { data, isLoading } = useAdminGetOrder(id);
  const [, setLocation] = useLocation();
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const addNote = useAdminAddOrderNote();
  const refund = useAdminRefundOrder();
  const qc = useQueryClient();
  const { toast } = useToast();

  const submitNote = async () => {
    if (!note.trim()) return;
    try {
      await addNote.mutateAsync({ id, data: { text: note.trim() } });
      await qc.invalidateQueries({ queryKey: getAdminGetOrderQueryKey(id) });
      setNote("");
      toast({ title: "Note added" });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const submitRefund = async () => {
    const amt = refundAmount.trim() ? Number(refundAmount) : undefined;
    if (refundAmount.trim() && (!Number.isFinite(amt!) || amt! <= 0)) {
      toast({ title: "Invalid refund amount", variant: "destructive" });
      return;
    }
    if (!window.confirm("Issue refund? This is permanent.")) return;
    try {
      await refund.mutateAsync({
        id,
        data: { amount: amt, reason: refundReason.trim() || undefined },
      });
      await qc.invalidateQueries({ queryKey: getAdminGetOrderQueryKey(id) });
      await qc.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
      setRefundAmount("");
      setRefundReason("");
      toast({ title: "Refund initiated" });
    } catch (e) {
      toast({
        title: "Refund failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AdminLayout title={`Order #${id}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/admin/orders")}
        className="gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </Button>

      {isLoading || !data ? (
        <div className="text-muted-foreground py-8">Loading…</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Order details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Session: {data.order.sessionTitle}</div>
              <div>Supplier: {data.order.supplier.name}</div>
              <div>
                Buyer: {data.buyerHandle ? `@${data.buyerHandle}` : data.userId} ·{" "}
                <Link
                  href={`/admin/users/${encodeURIComponent(data.userId)}`}
                  className="text-primary hover:underline"
                >
                  open profile
                </Link>
              </div>
              {data.order.designerUserId && (
                <div>
                  Designer: @{data.designerHandle ?? "—"} ·{" "}
                  <Link
                    href={`/admin/users/${encodeURIComponent(data.order.designerUserId)}`}
                    className="text-primary hover:underline"
                  >
                    open profile
                  </Link>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant={statusVariant(data.order.status)}>{data.order.status}</Badge>
                <Badge variant={statusVariant(data.order.paymentStatus)}>
                  {data.order.paymentStatus}
                </Badge>
              </div>
              <div className="pt-2 grid grid-cols-2 gap-2">
                <div>Quantity: {data.order.quantity}</div>
                <div>Total: ${data.order.totalCost.toFixed(2)}</div>
                <div>Refunded: ${data.order.refundedAmount.toFixed(2)}</div>
                <div>Lead time: {data.order.leadTimeDays} days</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issue refund</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Amount (USD) — blank = remaining"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                inputMode="decimal"
                data-testid="input-refund-amount"
              />
              <Input
                placeholder="Reason (audit log)"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                data-testid="input-refund-reason"
              />
              <Button
                variant="destructive"
                className="w-full"
                onClick={submitRefund}
                disabled={refund.isPending}
                data-testid="button-submit-refund"
              >
                {refund.isPending ? "Refunding…" : "Refund"}
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Internal notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.adminNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.adminNotes.map((n, i) => (
                    <li key={i} className="border-l-2 border-primary/40 pl-3 py-1">
                      <div className="text-xs font-mono text-muted-foreground">
                        @{n.byHandle ?? n.by.slice(0, 8)} ·{" "}
                        {new Date(n.at).toLocaleString()}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add an internal note (visible to admins only)"
                  data-testid="textarea-admin-note"
                />
                <Button
                  size="sm"
                  onClick={submitNote}
                  disabled={!note.trim() || addNote.isPending}
                  data-testid="button-add-admin-note"
                >
                  Add note
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit log</CardTitle>
            </CardHeader>
            <CardContent>
              {data.auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entries.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {data.auditLog.slice(0, 20).map((e) => (
                    <li key={e.id} className="border-b border-border/30 pb-1">
                      <div className="font-mono">{e.action}</div>
                      <div className="text-muted-foreground">
                        @{e.actorHandle ?? "system"} ·{" "}
                        {new Date(e.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
