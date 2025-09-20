"use client";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";

export default function LoadingProgress() {
  const [progress, setProgress] = useState(13);

  useEffect(() => {
    const timer = setTimeout(() => setProgress(80), 300);
    return () => clearTimeout(timer);
  }, []);

  return <Progress value={progress} className="absolute top-0 right-0 left-0 z-50 w-full rounded-none" />;
}
