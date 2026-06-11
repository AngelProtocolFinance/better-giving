import { Info } from "#/components/status";
import type { IProgramDb } from "@/npo";
import { Program } from "./program";

export function List({ programs }: { programs: IProgramDb[] }) {
  return (
    <div className="@container grid gap-3">
      {programs.length === 0 ? (
        <Info>No programs</Info>
      ) : (
        programs.map((p) => <Program {...p} key={p.id} />)
      )}
    </div>
  );
}
