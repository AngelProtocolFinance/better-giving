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
select id from npos where registration_number = 'VERIFY-0001';
