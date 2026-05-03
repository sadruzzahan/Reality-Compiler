import { useState } from "react";
import { useClerk } from "@clerk/react";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { deleteMyAccount } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

async function downloadExport(): Promise<void> {
  // Stream directly via fetch so the browser handles the file download. The
  // generated client would JSON-parse the body, defeating the purpose.
  const url = `${basePath}/api/me/export`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(cd);
  a.download = m?.[1] ?? "reality-compiler-export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

export function PrivacyDataCard() {
  const { signOut } = useClerk();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadExport();
      toast({ title: "Export downloaded" });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMyAccount();
      toast({
        title: "Account deletion requested",
        description:
          "Your data is now soft-deleted. We will fully remove it after 30 days.",
      });
      await signOut({ redirectUrl: `${basePath || "/"}` });
    } catch (e) {
      toast({
        title: "Couldn't delete account",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <Card data-testid="card-privacy-data">
      <CardHeader>
        <CardTitle className="font-sans text-lg flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" /> Privacy &amp; data
        </CardTitle>
        <CardDescription>
          Download a copy of everything tied to your account, or permanently
          delete your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-sm">Export my data</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              JSON archive of your profile, sessions, messages, designs,
              listings, and orders.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs shrink-0"
            disabled={exporting}
            onClick={() => void handleExport()}
            data-testid="button-export-data"
          >
            {exporting ? (
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
            ) : (
              <Download className="w-3 h-3 mr-2" />
            )}
            Download export
          </Button>
        </div>

        <div className="border-t border-border/50 pt-6 flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-sm text-destructive">
              Delete my account
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Soft-deletes your sessions and listings, anonymises past
              orders, and signs you out. Data is permanently purged after a
              30-day grace window.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="font-mono text-xs shrink-0"
                data-testid="button-delete-account"
              >
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent data-testid="dialog-delete-account">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone after the 30-day grace
                  window. Your sessions and listings will be soft-deleted
                  immediately, and you will be signed out.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2 py-2">
                <Label
                  htmlFor="confirm-delete"
                  className="font-mono text-xs uppercase tracking-wider"
                >
                  Type <span className="text-destructive">DELETE</span> to
                  confirm
                </Label>
                <Input
                  id="confirm-delete"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  data-testid="input-confirm-delete"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setConfirmText("")}
                  data-testid="button-cancel-delete"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirmText !== "DELETE" || deleting}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  {deleting ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : null}
                  Delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
