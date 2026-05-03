import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Store } from "lucide-react";
import {
  usePublishListing,
  getListMarketplaceListingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  "Mechanical",
  "Consumer",
  "Apparel",
  "Electronics",
  "Replacement Parts",
] as const;

interface Props {
  sessionId: number;
  defaultTitle: string;
  defaultCategory: string;
  defaultDescription: string;
}

export function PublishDialog({
  sessionId,
  defaultTitle,
  defaultCategory,
  defaultDescription,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [category, setCategory] = useState(defaultCategory);
  const [description, setDescription] = useState(defaultDescription);
  const [price, setPrice] = useState("49");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const publish = usePublishListing();

  const handlePublish = async () => {
    try {
      const result = await publish.mutateAsync({
        data: {
          sessionId,
          title,
          category,
          description,
          listingPrice: Number(price),
        },
      });
      queryClient.invalidateQueries({
        queryKey: getListMarketplaceListingsQueryKey(),
      });
      toast({
        title: "Published to marketplace",
        description: `Listing #${result.id} is live.`,
      });
      setOpen(false);
      setLocation(`/marketplace/${result.id}`);
    } catch (e) {
      toast({
        title: "Couldn't publish",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => setOpen(true)}
        className="font-mono text-xs"
        data-testid="button-publish-marketplace"
      >
        <Store className="w-4 h-4 mr-2" />
        Publish to marketplace
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish to marketplace</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              List this design for others to license & order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="font-mono text-xs uppercase">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-listing-title"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger
                  className="font-mono text-xs"
                  data-testid="input-listing-category"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem
                      key={c}
                      value={c}
                      className="font-mono text-xs"
                    >
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                data-testid="input-listing-description"
              />
            </div>
            <div>
              <Label className="font-mono text-xs uppercase">
                License price (USD)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                data-testid="input-listing-price"
              />
              <p
                className="text-xs text-muted-foreground font-mono mt-2"
                data-testid="text-revenue-split"
              >
                Revenue split: <span className="text-foreground">70%</span> to
                you · <span className="text-foreground">30%</span> platform
                {Number(price) > 0
                  ? ` · you earn $${(
                      Math.round(Number(price) * 0.7 * 100) / 100
                    ).toLocaleString()} per license`
                  : ""}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="font-mono text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={publish.isPending || !title || !category || !description}
              className="font-mono text-xs"
              data-testid="button-confirm-publish"
            >
              {publish.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
