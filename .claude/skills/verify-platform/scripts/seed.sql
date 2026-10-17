-- verification fixture: one published nonprofit for the donate flows.
-- idempotent; registration_number 'VERIFY-0001' marks it.
insert into npos (registration_number, name, endow_designation, hq_country, overview_pt, tagline, published, active)
select 'VERIFY-0001', 'Verify Test Nonprofit', 'Charity', 'United States',
       'Fixture nonprofit for verify-platform.', 'Fixture nonprofit used by the verify skill', true, true
where not exists (select 1 from npos where registration_number = 'VERIFY-0001');
-- usd rates for the currency picker (api/currencies); fixed fixture values
insert into currency_rates (base_currency, rates, updated_at)
values ('USD', '{"USD":1,"EUR":0.92,"GBP":0.79,"PHP":56.5,"AUD":1.52,"CAD":1.37}', now())
on conflict (base_currency) do nothing;

update npos
set slug = 'verify-test', image = '/logo.png', logo = '/logo.png'
where registration_number = 'VERIFY-0001';

-- npo admin. password is the local fixture Verify-password-123!
-- (better-auth scrypt, salt:hash). email_verified so sign-in does not mail a link.
-- the id is a uuid: the listing page accepts a creator id that is an email, a uuid, or a number.
insert into "user" (id, name, email, email_verified, first_name, last_name, updated_at)
values (
  'a0000000-0000-4000-8000-0000000000aa', 'Verify Admin', 'verify-admin@example.com', true,
  'Verify', 'Admin', now()
);
insert into account (id, account_id, provider_id, user_id, password, updated_at)
values (
  'verify-admin-credential', 'a0000000-0000-4000-8000-0000000000aa', 'credential', 'a0000000-0000-4000-8000-0000000000aa',
  '5f1bf4d4d2e746191078f7c4b3cffc4a:9b7510ab1ac1d2ccdf0dbf937d0454f0687aabf44e0fb2e1fb3d401c35f6f9920bfdf62636053bd885f29e5a4445a1b2cd4dbffe7f80ffa242867ee508e49de1',
  now()
);
insert into user_npo_memberships (user_id, npo_id)
select 'a0000000-0000-4000-8000-0000000000aa', id from npos where registration_number = 'VERIFY-0001';

-- an existing npo-owned fund. the campaigns list shows it as a campaign.
insert into funds (
  id, name, slug, description_pt, banner, logo, featured, active,
  expiration, npo_owner, creator_id
)
select
  'f0000000-0000-4000-8000-000000000001',
  'Harbor Listing',
  'harbor-listing',
  '[{"_key":"h1","_type":"block","style":"normal","markDefs":[],"children":[{"_key":"h2","_type":"span","text":"An existing listing for the harbor.","marks":[]}]}]',
  '/logo.png',
  '/logo.png',
  true,
  true,
  '9999-12-31T23:59:59Z',
  id,
  'a0000000-0000-4000-8000-0000000000aa'
from npos where registration_number = 'VERIFY-0001';
insert into fund_members (fund_id, npo_id)
select 'f0000000-0000-4000-8000-000000000001', id
from npos where registration_number = 'VERIFY-0001';

-- live campaign the public page and the donate flow use. increments are +100 USD.
insert into campaigns (
  id, owner_npo_id, creator_id, name, slug, description_pt, banner, logo,
  status, published_at, ends_at, donate_methods, donate_frequencies,
  increments, target_number
)
select
  'c0ffee00-0000-4000-8000-000000000001',
  id,
  'a0000000-0000-4000-8000-0000000000aa',
  'Winter Drive',
  'winter',
  '[{"_key":"w1","_type":"block","style":"normal","markDefs":[],"children":[{"_key":"w2","_type":"span","text":"A winter story for the seeded campaign.","marks":[]}]}]',
  '/logo.png',
  '/logo.png',
  'live',
  now(),
  '2027-12-31T23:59:59.999Z',
  array['stripe'],
  array['one-time','monthly'],
  '[{"value":"100","label":""}]'::jsonb,
  5000
from npos where registration_number = 'VERIFY-0001';
insert into campaign_members (campaign_id, npo_id)
select 'c0ffee00-0000-4000-8000-000000000001', id
from npos where registration_number = 'VERIFY-0001';

-- draft: the public page must 404 it.
insert into campaigns (
  id, owner_npo_id, creator_id, name, slug, description_pt, status
)
select
  'c0ffee00-0000-4000-8000-000000000002',
  id,
  'a0000000-0000-4000-8000-0000000000aa',
  'Hidden Draft',
  'draft-hidden',
  '[]',
  'draft'
from npos where registration_number = 'VERIFY-0001';
insert into campaign_members (campaign_id, npo_id)
select 'c0ffee00-0000-4000-8000-000000000002', id
from npos where registration_number = 'VERIFY-0001';

insert into donations (
  id, upusd, status, amount_base, amount_tip, amount_fee_allowance,
  currency, frequency, source, via, campaign_id
) values
(
  'd0000000-0000-4000-8000-000000000001', 25, 'settled', 25, 0, 0,
  'USD', 'one-time', 'bg-marketplace', 'stripe',
  'c0ffee00-0000-4000-8000-000000000001'
),
(
  'd0000000-0000-4000-8000-000000000002', 10, 'settled', 10, 0, 0,
  'USD', 'one-time', 'bg-marketplace', 'stripe',
  null
);
insert into donation_messages (id, donation_id, npo_id, donor_name, donor_message, date, amount)
select
  'verify-msg-campaign',
  'd0000000-0000-4000-8000-000000000001',
  id::text,
  'Campaign Donor',
  'Seeded campaign thanks',
  now(),
  25
from npos where registration_number = 'VERIFY-0001';
insert into donation_messages (id, donation_id, npo_id, donor_name, donor_message, date, amount)
select
  'verify-msg-profile',
  'd0000000-0000-4000-8000-000000000002',
  id::text,
  'Profile Donor',
  'Profile only gift note',
  now() - interval '1 minute',
  10
from npos where registration_number = 'VERIFY-0001';

select id from npos where registration_number = 'VERIFY-0001';
