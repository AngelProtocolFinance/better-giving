import { EmptyState } from "@better-giving/ui";
import type { IProgramDb } from "@/npo";
import { Program } from "./program";

export function List({ programs }: { programs: IProgramDb[] }) {
  return (
    <div className="@container grid gap-3">
      {programs.length === 0 ? (
        <EmptyState heading="No programs yet">
          Programs you add will show up here.
        </EmptyState>
      ) : (
        programs.map((p) => <Program {...p} key={p.id} />)
      )}
    </div>
  );
}
