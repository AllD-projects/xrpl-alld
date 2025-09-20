"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

interface ProductImage {
  id: string;
  path: string;
  position: number;
}

interface Company {
  id: string;
  name: string;
  domain: string | null;
}

interface ProductCredential {
  id: string;
  type: string;
  issuedBy: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
}

interface Product {
  id: string;
  title: string;
  description: string | null;
  priceDrops: string;
  returnDays: number;
  active: boolean;
  createdAt: string;
  images: ProductImage[];
  company: Company;
  credential: ProductCredential | null;
}

interface ProductResponse {
  ok: boolean;
  product: Product;
  error?: string;
}

interface ProductPaymentProps {
  productId: string;
}

// XRP drops를 원화로 변환
const dropsToKRW = (drops: string): number => {
  const xrp = parseInt(drops) / 1000000; // drops를 XRP로 변환
  return Math.round(xrp * 1000); // 1 XRP = 1000원으로 가정
};

export default function ProductPayment({ productId }: ProductPaymentProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/products/${productId}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ProductResponse = await response.json();
        console.log("Fetched product:", data);

        if (!data.ok) {
          throw new Error(data.error || "Failed to fetch product");
        }

        setProduct(data.product);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch product");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productId]);

  if (loading) {
    return (
      <section className="flex min-h-screen">
        <div className="relative w-3xl overflow-hidden bg-black"></div>
        <div className="flex w-[calc(100vw-48rem)] items-center justify-center">
          <div className="w-full max-w-[492px]">
            <div className="text-center text-lg">Loading product...</div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex min-h-screen">
        <div className="relative w-3xl overflow-hidden bg-black"></div>
        <div className="flex w-[calc(100vw-48rem)] items-center justify-center">
          <div className="w-full max-w-[492px]">
            <div className="text-center text-red-500">Error: {error}</div>
          </div>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="flex min-h-screen">
        <div className="relative w-3xl overflow-hidden bg-black"></div>
        <div className="flex w-[calc(100vw-48rem)] items-center justify-center">
          <div className="w-full max-w-[492px]">
            <div className="text-center text-gray-500">Product not found</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen">
      <div className="relative w-3xl overflow-hidden bg-black">
        {product.images.length > 0 && (
          <img src={product.images[0].path} alt={product.title} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex w-[calc(100vw-48rem)] items-center justify-center">
        <div className="w-full max-w-[614px] space-y-6">
          <div className="text-center">
            <h1 className="font-classyvogue text-5xl">{product.title}</h1>
            <p className="mt-4 text-xl font-bold">₩ {dropsToKRW(product.priceDrops).toLocaleString()}</p>
          </div>

          <div className="flex items-center space-y-2"></div>

          <div className="space-y-4">
            <Button variant="default" className="h-22 w-full rounded-full text-2xl">
              Buy Now
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
