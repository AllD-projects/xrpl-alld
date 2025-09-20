"use client";

import { useEffect } from "react";

interface PostDetailProps {
  postId: string;
}

export default function PostDetail({ postId }: PostDetailProps) {
  useEffect(() => {
    console.log(postId);
  }, [postId]);

  return (
    <section className="flex min-h-screen">
      <div className="flex w-3xl items-center justify-center">
        <div className="w-full max-w-[492px]">
          <h2 className="font-classyvogue text-4xl">{postId}</h2>
        </div>
      </div>
      <div className="relative w-[calc(100vw-48rem)] overflow-hidden bg-black"></div>
    </section>
  );
}
