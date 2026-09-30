import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { to_text } from "#/components/rich-text/helpers";
import type { IProgram, IProgramDb } from "@/npo";
import type {
  IMilestoneNew,
  IMilestoneUpdate,
  IProgramNew,
  IProgramUpdate,
} from "@/npo/schema";
import { db } from "../db";
import { milestones, programs } from "../schema/program";
import type { DbOrTx } from "./helpers";

// -- programs --

export async function npo_programs(npo_id: number): Promise<IProgramDb[]> {
  const rows = await db
    .select()
    .from(programs)
    .where(eq(programs.npo_id, npo_id))
    .orderBy(desc(programs.created_at));
  // npo_id not in IProgramDb; nullable ≠ optional mismatch
  return rows as unknown as IProgramDb[];
}

/** with `npo_id`, undefined unless that npo owns the program */
export async function npo_program_get(
  id: string,
  npo_id?: number
): Promise<IProgram | undefined> {
  const [prog] = await db
    .select()
    .from(programs)
    .where(
      and(
        eq(programs.id, id),
        npo_id === undefined ? undefined : eq(programs.npo_id, npo_id)
      )
    );
  if (!prog) return undefined;

  const ms = await db
    .select()
    .from(milestones)
    .where(eq(milestones.program_id, id))
    .orderBy(asc(milestones.date));

  // npo_id not in IProgram; nullable ≠ optional mismatch
  return { ...prog, milestones: ms } as unknown as IProgram;
}

export async function npo_program_put(
  npo_id: number,
  content: IProgramNew
): Promise<string> {
  const pid = globalThis.crypto.randomUUID();
  const { milestones: ms, ...prog } = content;

  await db.transaction(async (tx) => {
    await tx.insert(programs).values({
      id: pid,
      npo_id,
      title: prog.title,
      description_pt: prog.description_pt,
      description_v2: to_text(prog.description_pt),
      banner: prog.banner,
      target_raise: prog.target_raise,
      total_donations: 0,
      created_at: new Date().toISOString(),
    });

    if (ms?.length) {
      await tx.insert(milestones).values(
        ms.map((m) => ({
          id: globalThis.crypto.randomUUID(),
          program_id: pid,
          date: new Date(m.date).toISOString(),
          title: m.title,
          description_pt: m.description_pt,
          description_v2: to_text(m.description_pt),
          media: m.media,
        }))
      );
    }
  });

  return pid;
}

/** deletes program + milestones (CASCADE) */
export async function npo_program_del(npo_id: number, prog_id: string) {
  await db
    .delete(programs)
    .where(sql`${programs.id} = ${prog_id} AND ${programs.npo_id} = ${npo_id}`);
}

export async function npo_program_update(
  npo_id: number,
  prog_id: string,
  update: IProgramUpdate
) {
  const { description_pt, ...rest } = update;
  const desc_cols = description_pt
    ? {
        description_pt,
        description_v2: to_text(description_pt),
      }
    : {};
  await db
    .update(programs)
    .set({ ...rest, ...desc_cols })
    .where(sql`${programs.id} = ${prog_id} AND ${programs.npo_id} = ${npo_id}`);
}

/** atomically increment total_donations */
export async function npo_prog_contrib(
  db: DbOrTx,
  prog_id: string,
  amount: number
) {
  await db
    .update(programs)
    .set({
      total_donations: sql`${programs.total_donations} + ${amount}`,
    })
    .where(eq(programs.id, prog_id));
}

// -- milestones --

export async function prog_milestones(
  prog_id: string
): Promise<(typeof milestones.$inferSelect)[]> {
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.program_id, prog_id))
    .orderBy(asc(milestones.date));
}

/** the program's id, as a subquery, only when `npo_id` owns it */
const owned_program = (conn: DbOrTx, npo_id: number, prog_id: string) =>
  conn
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, prog_id), eq(programs.npo_id, npo_id)));

/** the new milestone's id; undefined when `npo_id` owns no such program */
export async function milestone_put(
  npo_id: number,
  prog_id: string,
  content: IMilestoneNew
): Promise<string | undefined> {
  const mid = globalThis.crypto.randomUUID();
  return db.transaction(async (tx) => {
    // key share: the program can't be deleted between this check and the insert
    const [prog] = await owned_program(tx, npo_id, prog_id).for("key share");
    if (!prog) return undefined;
    await tx.insert(milestones).values({
      id: mid,
      program_id: prog_id,
      date: new Date(content.date).toISOString(),
      title: content.title,
      description_pt: content.description_pt,
      description_v2: to_text(content.description_pt),
      media: content.media,
    });
    return mid;
  });
}

/** false when `npo_id` owns no such milestone */
export async function milestone_update(
  npo_id: number,
  prog_id: string,
  mid: string,
  update: IMilestoneUpdate
): Promise<boolean> {
  const { description_pt, ...rest } = update;
  const desc_cols = description_pt
    ? {
        description_pt,
        description_v2: to_text(description_pt),
      }
    : {};
  const updated = await db
    .update(milestones)
    .set({ ...rest, ...desc_cols })
    .where(owned_milestone(npo_id, prog_id, mid))
    .returning({ id: milestones.id });
  return updated.length > 0;
}

/** false when `npo_id` owns no such milestone */
export async function milestone_delete(
  npo_id: number,
  prog_id: string,
  mid: string
): Promise<boolean> {
  const deleted = await db
    .delete(milestones)
    .where(owned_milestone(npo_id, prog_id, mid))
    .returning({ id: milestones.id });
  return deleted.length > 0;
}

function owned_milestone(npo_id: number, prog_id: string, mid: string) {
  return and(
    eq(milestones.id, mid),
    inArray(milestones.program_id, owned_program(db, npo_id, prog_id))
  );
}
