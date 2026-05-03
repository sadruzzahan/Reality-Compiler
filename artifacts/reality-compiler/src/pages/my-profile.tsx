import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2, User, ExternalLink } from "lucide-react";
import {
  useGetMe,
  useUpdateMyProfile,
  getGetMeQueryKey,
  getGetDesignerProfileQueryKey,
  getListMarketplaceListingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

const BIO_MAX = 500;
const NAME_MAX = 80;

export default function MyProfile() {
  const { data: me, isLoading } = useGetMe();
  const updateProfile = useUpdateMyProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (me) {
      setDisplayName(me.displayName ?? "");
      setBio(me.bio ?? "");
      setAvatarUrl(me.avatarUrl ?? "");
    }
  }, [me]);

  const handleSave = async () => {
    if (!me) return;
    try {
      await updateProfile.mutateAsync({
        data: {
          displayName: displayName.trim() ? displayName.trim() : null,
          bio: bio.trim() ? bio.trim() : null,
          avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetDesignerProfileQueryKey(me.userId),
      });
      queryClient.invalidateQueries({
        queryKey: getListMarketplaceListingsQueryKey(),
      });
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

  const previewAvatar = avatarUrl.trim() || me.imageUrl || undefined;
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
              <Label
                htmlFor="avatar-url"
                className="font-mono text-xs uppercase tracking-wider"
              >
                Avatar URL
              </Label>
              <Input
                id="avatar-url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
                data-testid="input-avatar-url"
              />
              <div className="text-xs text-muted-foreground font-mono">
                Optional. Public listing cards and your designer page show
                a generic placeholder if left blank.
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
      </div>
    </div>
  );
}
