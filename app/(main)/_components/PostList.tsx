"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Post {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    email: string;
  };
  images: Array<{
    id: string;
    imageUrl: string;
    position: number;
    alt: string | null;
  }>;
}

interface PostsResponse {
  posts: Post[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/posts");

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: PostsResponse = await response.json();
        console.log("Fetched posts:", data);
        setPosts(data.posts);
      } catch (err) {
        console.error("Error fetching posts:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch posts");
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-lg">Loading posts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">No posts found</div>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-4 gap-3">
      {posts.map((post) => (
        <li key={post.id}>
          <Link href={`/designer/product-detail/${post.id}`}>
            <div className="aspect-[1/1.35] bg-gray-200">
              {post.images.length > 0 && (
                <img
                  src={post.images[0].imageUrl}
                  alt={post.images[0].alt || post.title}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="mt-4 text-center text-xl">
              <p className="font-classyvogue">{post.title}</p>
              <p className="text-sm text-gray-500">by {post.author.displayName}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
