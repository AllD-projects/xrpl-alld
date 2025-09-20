import { cn } from "@/lib/utils";

export default function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("border-foreground h-10 w-10 animate-spin rounded-full border-4 border-t-transparent", className)}
    />
  );
}
