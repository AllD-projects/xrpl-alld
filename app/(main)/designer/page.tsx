import PostList from "../_components/PostList";

export default function DesignerPage() {
  return (
    <section className="pt-15">
      <div className="inner">
        <h2 className="font-classyvogue text-4xl">Product</h2>
        <article className="mt-10">
          <PostList />
        </article>
      </div>
    </section>
  );
}
