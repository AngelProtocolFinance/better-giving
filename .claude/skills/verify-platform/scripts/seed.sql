-- verification fixture: one published nonprofit for the donate flows.
-- idempotent; registration_number 'VERIFY0001' marks it.
insert into npos (registration_number, name, endow_designation, hq_country, overview_pt, tagline, published, active)
select 'VERIFY0001', 'Verify Test Nonprofit', 'Charity', 'United States',
       'Fixture nonprofit for verify-platform.', 'Fixture nonprofit used by the verify skill', true, true
where not exists (select 1 from npos where registration_number = 'VERIFY0001');
-- logo so the organization form's required logo is already filled
update npos set logo = 'https://example.com/verify-logo.png'
where registration_number = 'VERIFY0001' and logo is null;
-- unpublished nonprofit that already has an org slug
insert into npos (
  registration_number, name, endow_designation, hq_country, overview_pt,
  tagline, published, active, slug
)
select 'VERIFY-0002', 'Verify Slug Fixture', 'Charity', 'United States',
       'Fixture nonprofit that already has an org slug.',
       'Unused by the public list', false, true, 'verify-slug-fixture'
where not exists (select 1 from npos where registration_number = 'VERIFY-0002');
-- npo admin for the organization page. email is verified. the published
-- nonprofit starts without a slug so the flow can set one.
insert into "user" (
  id, name, email, email_verified, first_name, last_name, referral_code,
  created_at, updated_at
)
select 'verify-npo-admin', 'Verify Npo Admin', 'verify-npo-admin@example.com',
       true, 'Verify', 'Admin', 'verify-npo-admin', now(), now()
where not exists (select 1 from "user" where id = 'verify-npo-admin');
insert into account (
  id, account_id, provider_id, user_id, password, created_at, updated_at
)
select 'verify-npo-admin-credential', 'verify-npo-admin', 'credential',
       'verify-npo-admin',
       '71f34cdc377803f9b28e619de3b5abc6:fd6f14b088f21a6b05aa1823b4029444430a68b4d214a4b62f4dc21baf26cb34f52fd41c3ab9b7f724f78db1699714320b46a9a702eaae4af3bc0ad2ac184ca8',
       now(), now()
where not exists (
  select 1 from account where id = 'verify-npo-admin-credential'
);
insert into user_npo_memberships (user_id, npo_id)
select 'verify-npo-admin', n.id
from npos n
where n.registration_number = 'VERIFY0001'
  and not exists (
    select 1 from user_npo_memberships m
    where m.user_id = 'verify-npo-admin' and m.npo_id = n.id
  );
-- usd rates for the currency picker (api/currencies); fixed fixture values
insert into currency_rates (base_currency, rates, updated_at)
values ('USD', '{"USD":1,"EUR":0.92,"GBP":0.79,"PHP":56.5,"AUD":1.52,"CAD":1.37}', now())
on conflict (base_currency) do nothing;
select id from npos where registration_number = 'VERIFY0001';
