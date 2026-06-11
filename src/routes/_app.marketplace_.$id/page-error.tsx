import { TriangleAlert } from "lucide-react";
import { href, Link } from "react-router";

export default function PageError() {
  return (
    <section className="flex flex-col items-center justify-center w-full h-screen gap-2 bg-primary text-destructive">
      <TriangleAlert size={30} />
      <p className="text-center">Failed to load nonprofit profile</p>
      <Link
        to={href("/marketplace")}
        className="text-primary-fg hover:text-primary text-sm"
      >
        Back to Marketplace
      </Link>
    </section>
  );
}
