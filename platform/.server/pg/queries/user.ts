import { and, eq, gt, sql } from "drizzle-orm";
import type { INpoAdmin, IUserBookmark, IUserNpo } from "@/users/interfaces";
import type { IInviteNew, IUserDb, IUserXNpoUpdate } from "@/users/schema";
import { db } from "../db";
import { user } from "../schema/auth";
import {
  user_bookmarks,
  user_fund_memberships,
  user_invites,
  user_npo_memberships,
} from "../schema/user";
import type { DbOrTx } from "./helpers";

export async function user_get(email: string): Promise<IUserDb | undefined> {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row as unknown as IUserDb | undefined;
}

export async function user_by_referral_code(
  code: string
): Promise<IUserDb | undefined> {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.referral_code, code));
  return row as unknown as IUserDb | undefined;
}

export async function user_update(email: string, update: Partial<IUserDb>) {
  await db
    .update(user)
    // drizzle: nullable/optional mismatch on additionalFields
    .set(update as any)
    .where(eq(user.email, email));
}

// single query replaces DDB's 2-step (query xnpos + batch get users)
export async function npo_admins(npo_id: number): Promise<INpoAdmin[]> {
  const members = db
    .select({
      id: sql<string | null>`${user.id}`.as("id"),
      email: user.email,
      first_name: sql<string | null>`${user.first_name}`.as("first_name"),
      last_name: sql<string | null>`${user.last_name}`.as("last_name"),
      pending: sql<boolean>`false`.as("pending"),
    })
    .from(user_npo_memberships)
    .innerJoin(user, eq(user_npo_memberships.user_id, user.id))
    .where(eq(user_npo_memberships.npo_id, npo_id));

  // pending invites whose invitee hasn't signed up yet — existing-user invites
  // already produced a membership row in npo_admin_tx, so left-join filters them out.
  const pending = db
    .select({
      id: sql<string | null>`null`.as("id"),
      email: user_invites.invitee,
      first_name: user_invites.invitee_first,
      last_name: sql<string | null>`null`.as("last_name"),
      pending: sql<boolean>`true`.as("pending"),
    })
    .from(user_invites)
    .leftJoin(user, eq(user.email, user_invites.invitee))
    .where(
      and(
        eq(user_invites.npo_id, npo_id),
        gt(user_invites.expire_at, new Date().toISOString()),
        sql`${user.id} is null`
      )
    );

  const rows = await members.union(pending);
  return rows as unknown as INpoAdmin[];
}

export async function npo_admin_tx(
  db: DbOrTx,
  npo_id: number,
  invite: IInviteNew,
  invitor_id: string
) {
  await db.transaction(async (tx) => {
    // only add membership if invitee already has an account
    const [invitee_user] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, invite.invitee))
      .limit(1);

    if (invitee_user) {
      // existing account: skip the invite row entirely — there's nothing for
      // the signup hook to consume, and a stale row would block re-invites of
      // this email until expire_at.
      await tx
        .insert(user_npo_memberships)
        .values({ user_id: invitee_user.id, npo_id })
        .onConflictDoNothing();
      return;
    }

    await tx.insert(user_invites).values({
      invitee: invite.invitee,
      invitee_first: invite.invitee_first_name,
      invitor_id,
      npo_name: invite.npo_name,
      npo_id,
      expire_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  });
}

export async function userxnpo_del(npo_id: number, user_id: string) {
  await db
    .delete(user_npo_memberships)
    .where(
      and(
        eq(user_npo_memberships.user_id, user_id),
        eq(user_npo_memberships.npo_id, npo_id)
      )
    );
}

export async function npo_invite_del(npo_id: number, invitee: string) {
  await db
    .delete(user_invites)
    .where(
      and(eq(user_invites.invitee, invitee), eq(user_invites.npo_id, npo_id))
    );
}

export async function userxnpo_put(
  db: DbOrTx,
  npo_id: number,
  user_id: string
) {
  await db
    .insert(user_npo_memberships)
    .values({ user_id, npo_id })
    .onConflictDoNothing();
}

export async function userxnpo_update(
  db: DbOrTx,
  npo_id: number,
  user_id: string,
  update: IUserXNpoUpdate
) {
  await db
    .update(user_npo_memberships)
    .set({
      alert_banking: update.alert_pref?.banking,
      alert_donation: update.alert_pref?.donation,
    })
    .where(
      and(
        eq(user_npo_memberships.user_id, user_id),
        eq(user_npo_memberships.npo_id, npo_id)
      )
    );
}

export async function userxfund_put(
  db: DbOrTx,
  fund_id: string,
  user_id: string
) {
  await db
    .insert(user_fund_memberships)
    .values({ user_id, fund_id })
    .onConflictDoNothing();
}

export async function user_npos(user_id: string): Promise<IUserNpo[]> {
  const rows = await db
    .select({
      id: user_npo_memberships.npo_id,
      alert_banking: user_npo_memberships.alert_banking,
      alert_donation: user_npo_memberships.alert_donation,
    })
    .from(user_npo_memberships)
    .where(eq(user_npo_memberships.user_id, user_id));
  return rows.map((r) => ({
    id: Number(r.id),
    alert_pref: { banking: r.alert_banking, donation: r.alert_donation },
  }));
}

export async function user_funds(user_id: string): Promise<string[]> {
  const rows = await db
    .select({ fund_id: user_fund_memberships.fund_id })
    .from(user_fund_memberships)
    .where(eq(user_fund_memberships.user_id, user_id));
  return rows.map((r) => r.fund_id);
}

export async function user_bookmarks_list(
  user_id: string
): Promise<IUserBookmark[]> {
  const rows = await db
    .select({
      user: user_bookmarks.user_id,
      npo: user_bookmarks.npo_id,
    })
    .from(user_bookmarks)
    .where(eq(user_bookmarks.user_id, user_id));
  return rows.map((r) => ({ user: r.user, npo: Number(r.npo) }));
}

export async function user_bookmark_put(user_id: string, npo_id: number) {
  await db
    .insert(user_bookmarks)
    .values({ user_id, npo_id })
    .onConflictDoNothing();
  return { id: npo_id };
}

export async function user_bookmark_del(user_id: string, npo_id: number) {
  await db
    .delete(user_bookmarks)
    .where(
      and(
        eq(user_bookmarks.user_id, user_id),
        eq(user_bookmarks.npo_id, npo_id)
      )
    );
}
