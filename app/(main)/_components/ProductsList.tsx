"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ProductImage {
  id: string;
  path: string;
  position: number;
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
  credential?: {
    id: string;
    type: string;
    issuedBy: string;
    status: string;
    issuedAt: string;
    expiresAt: string | null;
  } | null;
}

interface ProductsResponse {
  ok: boolean;
  products: Product[];
  error?: string;
}

// XRP drops를 원화로 변환하는 함수 (예시: 1 XRP = 1000원)
const dropsToKRW = (drops: string): number => {
  const xrp = parseInt(drops) / 1000000; // drops를 XRP로 변환
  return Math.round(xrp * 1000); // 1 XRP = 1000원으로 가정
};

export default function ProductsList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/products");

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ProductsResponse = await response.json();
        console.log("Fetched products:", data);

        if (!data.ok) {
          throw new Error(data.error || "Failed to fetch products");
        }

        setProducts(data.products);
      } catch (err) {
        console.error("Error fetching products:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch products");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-lg">Loading products...</div>
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

  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">No products found</div>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-4 gap-3">
      {products.map((product) => (
        <li key={product.id}>
          <Link href={`/designer/product-detail/${product.id}`}>
            <div className="aspect-[1/1.35] bg-gray-200">
              {product.images.length > 0 && (
                <img src={product.images[0].path} alt={product.title} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="mt-4 text-center text-xl">
              <p className="font-classyvogue">{product.title}</p>
              <p className="font-bold">₩ {dropsToKRW(product.priceDrops).toLocaleString()}</p>
              {product.credential && <p className="text-xs text-green-600">✓ Verified</p>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
