import type { Metadata } from "next";
import ProductPayment from "../../_components/ProductPayment";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: productId } = await params;

  if (!productId) {
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

export default async function ProductPaymentPage({ params }: Props) {
  const { id: productId } = await params;

  return (
    <main>
      <ProductPayment productId={productId} />
    </main>
  );
}
