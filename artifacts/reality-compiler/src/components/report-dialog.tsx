import { useState } from "react";
import { useCreateReport } from "@workspace/api-client-react";
import { Show } from "@clerk/react";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type ReportTargetType = "listing" | "designer" | "order";

type Reason =
  | "spam"
  | "ip_violation"
  | "prohibited_content"
  | "fraud"
  | "harassment"
  | "other";

const REASONS: { value: Reason; label: string }[] = [
  { value: "spam", label: "Spam or misleading" },
  { value: "ip_violation", label: "Intellectual property violation" },
  {
    value: "prohibited_content",
    label: "Prohibited content (weapons, illegal, unsafe design, etc.)",
  },
  { value: "fraud", label: "Fraud or scam" },
  { value: "harassment", label: "Harassment or hateful content" },
  { value: "other", label: "Other" },
];

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  triggerLabel?: string;
  triggerVariant?: "ghost" | "outline" | "secondary";
}

export function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  triggerLabel = "Report",
  triggerVariant = "ghost",
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | "">("");
  const [notes, setNotes] = useState("");
  const create = useCreateReport();
  const { toast } = useToast();

  const submit = async () => {
    if (!reason) {
      toast({
        title: "Pick a reason",
        description: "Tell us why you're reporting this.",
        variant: "destructive",
      });
      return;
    }
    try {
      await create.mutateAsync({
        data: {
          targetType,
          targetId,
          reason: reason as Reason,
          notes: notes.trim() ? notes.trim() : undefined,
        },
      });
      toast({
        title: "Report submitted",
        description: "Our moderators will review it shortly. Thank you.",
      });
      setOpen(false);
      setReason("");
      setNotes("");
    } catch (e) {
      toast({
        title: "Couldn't submit report",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    }
  };

  return (
    <Show when="signed-in">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant={triggerVariant}
            size="sm"
            className="text-muted-foreground hover:text-destructive gap-2"
            data-testid={`button-report-${targetType}-${targetId}`}
          >
            <Flag className="w-4 h-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {targetLabel}</DialogTitle>
            <DialogDescription>
              Reports go to our moderation team. False reports can lead to
              account action — please be honest and specific.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger data-testid="select-report-reason">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any helpful context, links, or specifics."
                maxLength={2000}
                rows={4}
                data-testid="textarea-report-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={create.isPending || !reason}
              data-testid="button-submit-report"
            >
              {create.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit report"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Show>
  );
}
