import { donation_message_list } from "$/pg/queries/donation-message";

export const npo_donors = async (
  npo_id: string /** uuid or number id */,
  next?: string
) => {
  const { items: donors, next: n } = await donation_message_list(npo_id, {
    next,
    limit: 10,
  });

  if (donors.length === 0) {
    return { items: [], next: undefined };
  }

  const items = donors.map(({ avatar_url, ...x }) => ({
    ...x,
    photo: avatar_url ?? undefined,
  }));

  return { items, next: n };
};
