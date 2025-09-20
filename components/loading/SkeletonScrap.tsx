import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

type SkeletonScrapProps = {
  effectNumber?: number;
  style?: CSSProperties;
  className?: string;
};

export default function SkeletonScrap({ effectNumber = 2, style, className }: SkeletonScrapProps) {
  return <div className={cn(`skeleton-effect${effectNumber} h-4 rounded-xs`, className)} style={style} />;
}
