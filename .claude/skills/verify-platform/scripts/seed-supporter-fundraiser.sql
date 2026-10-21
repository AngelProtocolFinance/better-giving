-- supporter fundraiser both fixture admins can leave.
-- npo_owner stays null so isSelf is false: leave is hidden when the org owns the fund.
-- fund_members is the admin list. active stays true so leave is enabled.
-- inserts only, no returning: launch.sh takes the last line psql prints as VERIFY0001's id.
-- on conflict does nothing: where not exists loses when a second preview build
-- passes the check before this one commits.

insert into "user" (
  id, name, email, email_verified, first_name, last_name, updated_at
)
select
  'b0000000-0000-4000-8000-0000000000bb',
  'Supporter Neighbor',
  'verify-supporter@example.com',
  true,
  'Supporter',
  'Neighbor',
  now()
where not exists (
  select 1 from "user" where id = 'b0000000-0000-4000-8000-0000000000bb'
)
on conflict do nothing;

insert into funds (
  id, name, slug, description_pt, banner, logo, featured, active,
  npo_owner, creator_id
)
select
  'f0000000-0000-4000-8000-000000000002',
  'Neighborhood Drive',
  'neighborhood-drive',
  '[{"_key":"n1","_type":"block","style":"normal","markDefs":[],"children":[{"_key":"n2","_type":"span","text":"A neighborhood drive started by a supporter.","marks":[]}]}]',
  '/logo.png',
  '/logo.png',
  true,
  true,
  null,
  'b0000000-0000-4000-8000-0000000000bb'
where not exists (
  select 1 from funds where id = 'f0000000-0000-4000-8000-000000000002'
)
on conflict do nothing;

insert into fund_members (fund_id, npo_id)
select 'f0000000-0000-4000-8000-000000000002', n.id
from npos n
where n.registration_number in ('VERIFY0001', 'VERIFY0003')
  and not exists (
    select 1 from fund_members m
    where m.fund_id = 'f0000000-0000-4000-8000-000000000002'
      and m.npo_id = n.id
  )
on conflict do nothing;
