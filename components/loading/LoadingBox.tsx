import { cn } from "@/lib/utils";
import LoadingSpinner from "./LoadingSpinner";

type LoadingBoxProps = {
  className?: string;
};

export default function LoadingBox({ className }: LoadingBoxProps) {
  return (
    <div className={cn("bg-background/50 absolute inset-0 z-50 flex items-center justify-center", className)}>
      <LoadingSpinner />
    </div>
  );
}
