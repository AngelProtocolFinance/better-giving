import { asc, desc, eq, sql } from "drizzle-orm";
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

export async function npo_program_get(
  id: string
): Promise<IProgram | undefined> {
  const [prog] = await db.select().from(programs).where(eq(programs.id, id));
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
      description_rich: prog.description_rich,
      description_v2: to_text(prog.description_rich),
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
          description_rich: m.description_rich,
          description_v2: to_text(m.description_rich),
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
  const { description_rich, ...rest } = update;
  const desc_cols = description_rich
    ? {
        description_rich,
        description_v2: to_text(description_rich),
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

export async function milestone_put(
  prog_id: string,
  content: IMilestoneNew
): Promise<string> {
  const mid = globalThis.crypto.randomUUID();
  await db.insert(milestones).values({
    id: mid,
    program_id: prog_id,
    date: new Date(content.date).toISOString(),
    title: content.title,
    description_rich: content.description_rich,
    description_v2: to_text(content.description_rich),
    media: content.media,
  });
  return mid;
}

export async function milestone_update(
  prog_id: string,
  mid: string,
  update: IMilestoneUpdate
) {
  const { description_rich, ...rest } = update;
  const desc_cols = description_rich
    ? {
        description_rich,
        description_v2: to_text(description_rich),
      }
    : {};
  await db
    .update(milestones)
    .set({ ...rest, ...desc_cols })
    .where(
      sql`${milestones.id} = ${mid} AND ${milestones.program_id} = ${prog_id}`
    );
}

export async function milestone_delete(prog_id: string, mid: string) {
  await db
    .delete(milestones)
    .where(
      sql`${milestones.id} = ${mid} AND ${milestones.program_id} = ${prog_id}`
    );
}
