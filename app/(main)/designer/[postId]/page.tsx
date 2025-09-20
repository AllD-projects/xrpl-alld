import type { Metadata } from "next";
import PostDetail from "../../_components/PostDetail";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: postId } = await params;

  if (!postId) {
    return {
      title: "FashionPoint",
      description: "삭제된 상품",
      openGraph: {
        title: "FashionPoint",
        description: "삭제된 상품"
        //url: `http://localhost:3000/display/cody/${params.id}`
      }
    };
  }

  return {
    title: "FashionPoint",
    description: "상품 상세페이지 입니다"
  };
}

export default async function PostDetailPage({ params }: Props) {
  const { id: postId } = await params;

  return (
    <main>
      <PostDetail postId={postId} />
    </main>
  );
}
