import { cn } from "@/lib/utils";
import SkeletonScrap from "./SkeletonScrap";

type SkeletonListProps = {
  length?: number;
  className?: string;
};

export default function SkeletonList({ length = 3, className }: SkeletonListProps) {
  // 고정된 width 값들
  const widthOptions = [80, 60, 70, 40, 60];

  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length }, (_, index) => (
        <SkeletonScrap key={index} style={{ width: `${widthOptions[index % widthOptions.length]}%` }} />
      ))}
    </div>
  );
}
