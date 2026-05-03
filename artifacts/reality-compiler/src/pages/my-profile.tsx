import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Loader2,
  User,
  ExternalLink,
  Upload,
  X,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import {
  useGetMe,
  useUpdateMyProfile,
  useGetConnectStatus,
  customFetch,
  getGetMeQueryKey,
  getGetDesignerProfileQueryKey,
  getListMarketplaceListingsQueryKey,
  type Me,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PrivacyDataCard } from "@/components/privacy-data-card";
import { usePrivatePageHead } from "@/lib/seo-defaults";

const BIO_MAX = 500;
const NAME_MAX = 80;
const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";
const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function PayoutsSetupCard() {
  // Surfaces the Stripe Connect onboarding state in the user's profile so
  // designers see at a glance whether payouts are wired up. The full
  // onboarding flow lives on /payouts; here we only show status + a deep
  // link, which keeps this page focused on profile concerns.
  const { data: status, isLoading } = useGetConnectStatus();

  let statusLine: { icon: ReactNode; text: string; tone: string };
  if (isLoading) {
    statusLine = {
      icon: <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />,
      text: "Checking payout status…",
      tone: "text-muted-foreground",
    };
  } else if (!status?.configured) {
    statusLine = {
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      text: "Stripe is not configured by the platform yet.",
      tone: "text-amber-700 dark:text-amber-400",
    };
  } else if (status.status === "enabled") {
    statusLine = {
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      text: "Connected — payouts enabled.",
      tone: "text-emerald-600 dark:text-emerald-400",
    };
  } else if (status.accountId) {
    statusLine = {
      icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
      text:
        status.status === "restricted"
          ? "Action required — Stripe needs more details before paying you out."
          : "Onboarding incomplete — finish Stripe to start receiving payouts.",
      tone: "text-amber-700 dark:text-amber-400",
    };
  } else {
    statusLine = {
      icon: <CreditCard className="w-4 h-4 text-muted-foreground" />,
      text: "No payout account connected — you'll earn but can't be paid out.",
      tone: "text-muted-foreground",
    };
  }

  return (
    <Card data-testid="card-profile-payouts-setup">
      <CardHeader>
        <CardTitle className="font-sans text-lg flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          Payouts setup
        </CardTitle>
        <CardDescription>
          Connect a Stripe account to receive 70% of every license sale on
          your published designs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4 flex-wrap">
        <div className={`text-sm flex items-center gap-2 ${statusLine.tone}`}>
          {statusLine.icon}
          <span data-testid="text-profile-payouts-status">
            {statusLine.text}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          asChild
          className="font-mono text-xs"
        >
          <Link href="/payouts" data-testid="link-profile-payouts">
            Manage payouts
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

async function uploadAvatarStreaming(file: File): Promise<Me> {
  return customFetch<Me>("/me/avatar", {
    method: "POST",
    body: file,
    headers: { "content-type": file.type },
  });
}

export default function MyProfile() {
  usePrivatePageHead(
    "Your profile",
    "Edit your public designer handle, bio, and avatar, and manage your account data.",
  );
  const { data: me, isLoading } = useGetMe();
  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useMutation({ mutationFn: uploadAvatarStreaming });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName ?? "");
      setBio(me.bio ?? "");
      setAvatarUrl(me.avatarUrl ?? null);
    }
  }, [me]);

  const invalidateProfileQueries = (userId: string) => {
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetDesignerProfileQueryKey(userId),
    });
    queryClient.invalidateQueries({
      queryKey: getListMarketplaceListingsQueryKey(),
    });
  };

  const handleAvatarFile = async (file: File) => {
    if (!me) return;
    if (!AVATAR_TYPES.has(file.type)) {
      toast({
        title: "Unsupported file",
        description: "Pick a PNG, JPEG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast({
        title: "Image too large",
        description: "Avatar must be under 4 MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      const updated = await uploadAvatar.mutateAsync(file);
      setAvatarUrl(updated.avatarUrl ?? null);
      invalidateProfileQueries(me.userId);
      toast({
        title: "Avatar updated",
        description: "Your new avatar is live across the marketplace.",
      });
    } catch (e) {
      toast({
        title: "Couldn't upload avatar",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClearAvatar = async () => {
    if (!me) return;
    try {
      await updateProfile.mutateAsync({ data: { avatarUrl: null } });
      setAvatarUrl(null);
      invalidateProfileQueries(me.userId);
      toast({ title: "Avatar removed" });
    } catch (e) {
      toast({
        title: "Couldn't remove avatar",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!me) return;
    try {
      await updateProfile.mutateAsync({
        data: {
          displayName: displayName.trim() ? displayName.trim() : null,
          bio: bio.trim() ? bio.trim() : null,
        },
      });
      invalidateProfileQueries(me.userId);
      toast({
        title: "Profile saved",
        description: "Your designer profile is updated across the marketplace.",
      });
    } catch (e) {
      toast({
        title: "Couldn't save profile",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  if (isLoading || !me) {
    return (
      <div className="container max-w-2xl mx-auto px-6 py-12">
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const previewAvatar = avatarUrl ?? me.imageUrl ?? undefined;
  const initial =
    (displayName.trim()[0] ??
      me.firstName?.[0] ??
      me.handle[0] ??
      "U").toUpperCase();

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      <div className="container max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-5 h-5 text-primary" />
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                My profile
              </span>
            </div>
            <h1 className="text-3xl font-bold font-sans">Designer profile</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              How buyers see you on the marketplace.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="font-mono text-xs"
          >
            <Link
              href={`/designers/${me.userId}`}
              data-testid="link-public-profile"
            >
              View public profile
              <ExternalLink className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg">Public details</CardTitle>
            <CardDescription>
              Shown on every listing card and on your designer page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={previewAvatar} />
                <AvatarFallback className="font-mono text-lg">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Handle
                </div>
                <div className="font-mono text-sm">@{me.handle}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="display-name"
                className="font-mono text-xs uppercase tracking-wider"
              >
                Display name
              </Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, NAME_MAX))}
                placeholder="e.g. Avery Chen"
                data-testid="input-display-name"
              />
              <div className="text-xs text-muted-foreground font-mono">
                {displayName.length}/{NAME_MAX} · Falls back to @{me.handle} if blank.
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="bio"
                className="font-mono text-xs uppercase tracking-wider"
              >
                Short bio
              </Label>
              <Textarea
                id="bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                placeholder="Tell buyers what you make and why."
                data-testid="input-bio"
              />
              <div className="text-xs text-muted-foreground font-mono">
                {bio.length}/{BIO_MAX}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wider">
                Avatar image
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={AVATAR_ACCEPT}
                className="hidden"
                data-testid="input-avatar-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAvatarFile(file);
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs"
                  disabled={uploadAvatar.isPending}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-upload-avatar"
                >
                  {uploadAvatar.isPending ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3 mr-2" />
                  )}
                  {avatarUrl ? "Replace avatar" : "Upload avatar"}
                </Button>
                {avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-mono text-xs"
                    disabled={updateProfile.isPending}
                    onClick={() => void handleClearAvatar()}
                    data-testid="button-clear-avatar"
                  >
                    <X className="w-3 h-3 mr-2" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                PNG, JPEG, or WebP · up to 4 MB. Public listing cards and
                your designer page show a generic placeholder if left blank.
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={updateProfile.isPending}
                className="font-mono text-xs"
                data-testid="button-save-profile"
              >
                {updateProfile.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Save profile
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <PayoutsSetupCard />
        </div>

        <div className="mt-6">
          <PrivacyDataCard />
        </div>
      </div>
    </div>
  );
}
