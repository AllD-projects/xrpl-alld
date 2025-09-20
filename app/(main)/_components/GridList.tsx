import Link from "next/link";

export default function GridList({}) {
  return (
    <ul className="grid grid-cols-4 gap-3">
      <li>
        <Link href="/designer/product-detail">
          <div className="aspect-[1/1.35] bg-gray-200"></div>
          <div className="mt-4 text-center text-xl">
            <p className="font-classyvogue">Product Name</p>
            <p className="font-bold">₩ 219,000</p>
          </div>
        </Link>
      </li> 
      <li>
        <Link href="/designer/product-detail">
          <div className="aspect-[1/1.35] bg-gray-200"></div>
          <div className="mt-4 text-center text-xl">
            <p className="font-classyvogue">Product Name</p>
            <p className="font-bold">₩ 219,000</p>
          </div>
        </Link>
      </li>
      <li>
        <Link href="/designer/product-detail">
          <div className="aspect-[1/1.35] bg-gray-200"></div>
          <div className="mt-4 text-center text-xl">
            <p className="font-classyvogue">Product Name</p>
            <p className="font-bold">₩ 219,000</p>
          </div>
        </Link>
      </li>
      <li>
        <Link href="/designer/product-detail">
          <div className="aspect-[1/1.35] bg-gray-200"></div>
          <div className="mt-4 text-center text-xl">
            <p className="font-classyvogue">Product Name</p>
            <p className="font-bold">₩ 219,000</p>
          </div>
        </Link>
      </li>
    </ul>
  );
}
