"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import Image from "next/image";
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
  const [quantity, setQuantity] = useState(1);

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity >= 1) {
      setQuantity(newQuantity);
    }
  };

  const totalPrice = product ? dropsToKRW(product.priceDrops) * quantity : 0;

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
            <p className="font-classyvogue text-5xl">{product.title}</p>
            <p className="mt-4 text-2xl font-bold">₩ {dropsToKRW(product.priceDrops).toLocaleString()}</p>
          </div>

          <div className="my-15 space-y-2 text-center">
            <p className="text-2xl font-bold">Color: Off-white</p>
            <p className="text-2xl font-bold">Size: One size</p>
          </div>

          {/* 수량 조절 UI */}
          <div className="flex items-center justify-center space-x-4">
            <div className="flex items-center space-x-2 rounded-full border border-gray-300 bg-white px-3 py-2">
              <button
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MinusIcon />
              </button>
              <span className="min-w-[2rem] text-center text-lg font-medium">{quantity}</span>
              <button
                onClick={() => handleQuantityChange(quantity + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-gray-600 hover:bg-gray-100"
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="default" className="h-22 w-full rounded-full text-2xl">
                Buy Now
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full max-w-[calc(100vw-48rem)] sm:max-w-[calc(100vw-48rem)] [&>button]:hidden">
              <SheetTitle className="invisible">Your Cart</SheetTitle>
              <div className="relative h-full px-[95px] py-8">
                <SheetClose asChild>
                  <Button variant="ghost" className="absolute top-8 right-[95px]" size="icon">
                    <XIcon className="size-8" />
                  </Button>
                </SheetClose>
                <p className="font-classyvogue text-5xl">Your Cart</p>
                <p className="mt-4 text-2xl font-bold">{quantity} Items</p>
                <p className="mt-4 text-xl font-bold">Your order will be shipped with free delivery</p>
                <Separator className="mt-6 mb-8" />

                <div className="flex gap-[49px]">
                  <div className="h-[278px] w-[231px] overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <Image
                      src={product.images[0].path}
                      alt={product.title}
                      width={231}
                      height={278}
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold">{product.title}</p>
                    <div className="mt-5 space-y-1">
                      <p className="text-xl">Color: Off-white</p>
                      <p className="text-xl">Size: One size</p>
                    </div>
                    <div className="mt-15 flex">
                      <div className="flex items-center space-x-2 rounded-full border border-gray-300 bg-white px-2 py-1">
                        <button
                          onClick={() => handleQuantityChange(quantity - 1)}
                          disabled={quantity <= 1}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-lg font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <MinusIcon className="size-4" />
                        </button>
                        <span className="min-w-[1rem] text-center text-lg font-medium">{quantity}</span>
                        <button
                          onClick={() => handleQuantityChange(quantity + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-lg font-bold text-gray-600 hover:bg-gray-100"
                        >
                          <PlusIcon className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 w-full rounded-t-xl border border-gray-300 bg-white px-[95px] py-8">
                  <p className="text-2xl font-bold"></p>
                  <p className="text-2xl font-bold">Total: ₩ {totalPrice.toLocaleString()}</p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </section>
  );
}
