import { Link } from "wouter";
import { Hexagon, ListTree, BookOpen, Factory, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Hexagon className="h-6 w-6 text-primary" />
            <span className="font-bold inline-block font-mono tracking-tight">Reality Compiler</span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link href="/sessions" className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2" data-testid="link-sessions">
              <ListTree className="w-4 h-4" />
              Sessions
            </Link>
            <Link href="/suppliers" className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2" data-testid="link-suppliers">
              <Factory className="w-4 h-4" />
              Suppliers
            </Link>
            <Link href="/orders" className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2" data-testid="link-orders">
              <Truck className="w-4 h-4" />
              Orders
            </Link>
            <Link href="/about" className="transition-colors hover:text-foreground/80 text-foreground/60 flex items-center gap-2" data-testid="link-about">
              <BookOpen className="w-4 h-4" />
              How It Works
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            {/* Search/Command palette could go here */}
          </div>
          <nav className="flex items-center space-x-2">
            <Button variant="outline" size="sm" asChild className="hidden md:flex font-mono text-xs">
              <Link href="/">Compile New</Link>
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
}