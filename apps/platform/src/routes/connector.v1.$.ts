import { problem } from "$/connector/problem";

export function loader() {
  return problem(404, "unknown_action");
}

export function action() {
  return problem(404, "unknown_action");
}
