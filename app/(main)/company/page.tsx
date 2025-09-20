import ProductsList from "../_components/ProductsList";

export default function CompanyPage() {
  return (
    <section className="pt-15">
      <div className="inner">
        <h2 className="font-classyvogue text-4xl">Product</h2>
        <article className="mt-10">
          <ProductsList />
        </article>
      </div>
    </section>
  );
}
