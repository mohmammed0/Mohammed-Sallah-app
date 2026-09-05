-- Fresh databases load catalog seeds after migrations, while upgraded databases
-- already contain their city catalog. Ensure the three launch cities exist early
-- enough for location-authority triggers and local/demo seeding, without changing
-- an existing city's enabled state or an operator-managed boundary.
insert into public.cities(code,name_ar,name_en,country_code,timezone,enabled)
values
  ('riyadh','الرياض','Riyadh','SA','Asia/Riyadh',true),
  ('jeddah','جدة','Jeddah','SA','Asia/Riyadh',true),
  ('dammam','الدمام','Dammam','SA','Asia/Riyadh',true)
on conflict(code) do nothing;

with coverage(code,longitude,latitude,radius_m) as (
  values
    ('riyadh'::text,46.6753::double precision,24.7136::double precision,125000::double precision),
    ('jeddah'::text,39.1728::double precision,21.5433::double precision,100000::double precision),
    ('dammam'::text,50.0888::double precision,26.4207::double precision,90000::double precision)
)
update public.cities city
set boundary=extensions.st_multi(
  extensions.st_buffer(
    extensions.st_setsrid(
      extensions.st_makepoint(coverage.longitude,coverage.latitude),4326
    )::extensions.geography,
    coverage.radius_m
  )::extensions.geometry
)::extensions.geography
from coverage
where city.code=coverage.code
  and city.boundary is null;
