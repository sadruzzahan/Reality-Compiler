import { Link, useLocation } from "wouter";
import {
  Hexagon,
  ListTree,
  BookOpen,
  Factory,
  Truck,
  Store,
  Banknote,
  CircleDollarSign,
  LogOut,
} from "lucide-react";
import { Show, useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  if (!user) return null;
  const initial =
    user.firstName?.[0]?.toUpperCase() ??
    user.username?.[0]?.toUpperCase() ??
    user.primaryEmailAddress?.emailAddress?.[0]?.toUpperCase() ??
    "U";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          data-testid="button-user-menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.imageUrl} />
            <AvatarFallback className="font-mono text-xs">
              {initial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-mono text-xs">
          {user.username ??
            user.primaryEmailAddress?.emailAddress ??
            user.firstName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setLocation("/my-profile")}
          data-testid="link-edit-profile"
        >
          Edit my profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setLocation(`/designers/${user.id}`)}
          data-testid="link-my-profile"
        >
          My public profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocation("/sessions")}>
          My sessions
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocation("/orders")}>
          My orders
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setLocation("/payouts")}
          data-testid="link-menu-payouts"
        >
          Designer payouts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => signOut({ redirectUrl: "/" })}
          data-testid="button-sign-out"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Hexagon className="h-6 w-6 text-primary" />
            <span className="font-bold inline-block font-mono tracking-tight">
              Reality Compiler
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="/marketplace"
              className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
              data-testid="link-marketplace"
            >
              <Store className="w-4 h-4" />
              Marketplace
            </Link>
            <Show when="signed-in">
              <Link
                href="/sessions"
                className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
                data-testid="link-sessions"
              >
                <ListTree className="w-4 h-4" />
                Sessions
              </Link>
              <Link
                href="/orders"
                className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
                data-testid="link-orders"
              >
                <Truck className="w-4 h-4" />
                Orders
              </Link>
              <Link
                href="/payouts"
                className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
                data-testid="link-payouts"
              >
                <Banknote className="w-4 h-4" />
                Payouts
              </Link>
            </Show>
            <Link
              href="/suppliers"
              className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
              data-testid="link-suppliers"
            >
              <Factory className="w-4 h-4" />
              Suppliers
            </Link>
            <Link
              href="/about"
              className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
              data-testid="link-about"
            >
              <BookOpen className="w-4 h-4" />
              How It Works
            </Link>
            <Link
              href="/pricing"
              className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2"
              data-testid="link-pricing"
            >
              <CircleDollarSign className="w-4 h-4" />
              Pricing
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <Show when="signed-out">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="font-mono text-xs"
            >
              <Link href="/sign-in" data-testid="link-sign-in">
                Sign in
              </Link>
            </Button>
            <Button
              size="sm"
              asChild
              className="font-mono text-xs"
            >
              <Link href="/sign-up" data-testid="link-sign-up">
                Get started
              </Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden md:flex font-mono text-xs"
            >
              <Link href="/">Compile new</Link>
            </Button>
            <UserMenu />
          </Show>
        </div>
      </div>
    </header>
  );
}
