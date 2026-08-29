import { useFetcher } from "react-router";

export function Form() {
  const fetcher = useFetcher();

  return (
    <fetcher.Form className="contents" method="POST">
      <button
        type="submit"
        disabled={fetcher.state === "submitting"}
        className="btn btn-primary"
      >
        {fetcher.state === "submitting" ? "Generating..." : "Generate"}
      </button>
    </fetcher.Form>
  );
}
