import use_swr from "swr/immutable";
import { json_ok } from "@/helpers/https";

const fetcher = async (path: string) =>
  fetch(path).then((res) => json_ok<{ name: string }>(res));
export function NpoName({ id }: { id: number | string }) {
  const { data, error } = use_swr(`/api/npos/${id}?fields=name`, fetcher);
  if (!data || error) return id;
  return `${id}: ${data.name}`;
}
