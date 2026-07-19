import { CircleCheck } from "lucide-react";
import { href, Link, useSearchParams } from "react-router";

export default function Page() {
  const [params] = useSearchParams();
  const name = params.get("name") || "Your organization";
  const id = params.get("id");
  return (
    <div
      className={
        "grid xl:container xl:mx-auto px-5 max-w-lg justify-items-center"
      }
    >
      <CircleCheck className="text-success" size={92} />
      <h1 className="text-3xl mt-10 text-center">
        {name}’s account has been created!
      </h1>
      <Link
        className="mt-6 text-primary hover:text-primary underline decoration-1 hover:decoration-2 text-center text-lg transition ease-in-out duration-300"
        to={href("/admin/:id/edit-profile", { id: id ?? "invalid id" })}
      >
        Start filling out {name}’s profile and attract donors! Thank you!
      </Link>
    </div>
  );
}
