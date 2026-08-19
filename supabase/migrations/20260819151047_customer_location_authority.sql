-- Server-authoritative customer service-location resolution.
-- Existing catalog boundaries remain authoritative. The fallback metro coverage
-- below is installed only when a seeded city has no boundary yet.
with coverage(code,longitude,latitude,radius_m) as (
  values
    ('riyadh'::text,46.6753::double precision,24.7136::double precision,125000::double precision),
    ('jeddah'::text,39.1728::double precision,21.5433::double precision,100000::double precision),
    ('dammam'::text,50.0888::double precision,26.4207::double precision,90000::double precision)
)
update public.cities c
set boundary=extensions.st_multi(
  extensions.st_buffer(
    extensions.st_setsrid(
      extensions.st_makepoint(coverage.longitude,coverage.latitude),4326
    )::extensions.geography,
    coverage.radius_m
  )::extensions.geometry
)::extensions.geography
from coverage
where c.code=coverage.code and c.boundary is null;

insert into public.service_regions(code,name_ar,name_en,boundary,enabled)
values(
  'sa-country-boundary',
  'المملكة العربية السعودية',
  'Saudi Arabia',
  extensions.st_geomfromtext(
    'MULTIPOLYGON(((34.5 29.5,37 31.5,39.5 32.2,42 31.1,44.7 29.2,47.7 29.4,48.5 28.6,49.9 27.6,50.2 26.3,50.1 25,51.5 24.2,55.7 22.7,55.3 20,52 18,49 18,46.5 17,43.2 16.3,41.6 17.5,40.4 19,39.2 21,38 23.5,36.8 25.5,35.5 27.5,34.5 29.5)))',
    4326
  )::extensions.geography,
  true
)
on conflict(code) do update set
  boundary=coalesce(public.service_regions.boundary,excluded.boundary),
  enabled=true;

create index if not exists cities_enabled_boundary_gix
  on public.cities using gist(boundary)
  where enabled and boundary is not null;

create or replace function private.resolve_service_location_coordinates(
  p_latitude double precision,
  p_longitude double precision
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  point_value extensions.geography;
  inside_country boolean:=false;
  resolved_city public.cities%rowtype;
begin
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180 then
    return jsonb_build_object(
      'status','location_unavailable',
      'countryCode',null,
      'city',null
    );
  end if;

  point_value:=extensions.st_setsrid(
    extensions.st_makepoint(p_longitude,p_latitude),4326
  )::extensions.geography;

  select exists(
    select 1
    from public.service_regions region
    where region.code='sa-country-boundary'
      and region.enabled
      and region.boundary is not null
      and extensions.st_covers(
        region.boundary::extensions.geometry,
        point_value::extensions.geometry
      )
  ) into inside_country;

  if not inside_country then
    return jsonb_build_object(
      'status','outside_saudi_arabia',
      'countryCode',null,
      'city',null
    );
  end if;

  select city.* into resolved_city
  from public.cities city
  where city.enabled
    and city.country_code='SA'
    and city.boundary is not null
    and extensions.st_covers(
      city.boundary::extensions.geometry,
      point_value::extensions.geometry
    )
  order by extensions.st_area(city.boundary::extensions.geometry),city.code
  limit 1;

  if resolved_city.id is null then
    return jsonb_build_object(
      'status','city_not_supported',
      'countryCode','SA',
      'city',null
    );
  end if;

  return jsonb_build_object(
    'status','supported',
    'countryCode','SA',
    'city',jsonb_build_object(
      'id',resolved_city.id,
      'code',resolved_city.code,
      'nameAr',resolved_city.name_ar,
      'nameEn',resolved_city.name_en
    )
  );
end
$$;
revoke all on function private.resolve_service_location_coordinates(double precision,double precision)
  from public,anon,authenticated;

create or replace function public.resolve_service_location(
  p_latitude double precision,
  p_longitude double precision
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return private.resolve_service_location_coordinates(p_latitude,p_longitude);
end
$$;
revoke all on function public.resolve_service_location(double precision,double precision)
  from public,anon;
grant execute on function public.resolve_service_location(double precision,double precision)
  to authenticated;

create or replace function private.assert_supported_location(
  p_city_id uuid,
  p_location extensions.geography
) returns void
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  resolution jsonb;
  status_value text;
begin
  if p_location is null then raise exception 'LOCATION_UNAVAILABLE'; end if;
  resolution:=private.resolve_service_location_coordinates(
    extensions.st_y(p_location::extensions.geometry),
    extensions.st_x(p_location::extensions.geometry)
  );
  status_value:=resolution->>'status';
  if status_value='outside_saudi_arabia' then
    raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA';
  elsif status_value='city_not_supported' then
    raise exception 'CITY_NOT_AVAILABLE';
  elsif status_value<>'supported' then
    raise exception 'LOCATION_UNAVAILABLE';
  end if;
  if (resolution->'city'->>'id')::uuid is distinct from p_city_id then
    raise exception 'LOCATION_CITY_MISMATCH';
  end if;
end
$$;
revoke all on function private.assert_supported_location(uuid,extensions.geography)
  from public,anon,authenticated;

create or replace function private.enforce_address_service_location()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.deleted_at is null then
    perform private.assert_supported_location(new.city_id,new.location);
  end if;
  return new;
end
$$;
revoke all on function private.enforce_address_service_location()
  from public,anon,authenticated;

drop trigger if exists addresses_service_location_authority on public.addresses;
create trigger addresses_service_location_authority
before insert or update of city_id,location,deleted_at on public.addresses
for each row execute function private.enforce_address_service_location();

create or replace function private.enforce_request_service_location()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  authoritative_location extensions.geography;
  authoritative_city_id uuid;
begin
  if new.exact_address_id is not null then
    select address.location,address.city_id
    into authoritative_location,authoritative_city_id
    from public.addresses address
    where address.id=new.exact_address_id;
    if authoritative_location is null then raise exception 'LOCATION_UNAVAILABLE'; end if;
    if authoritative_city_id is distinct from new.city_id then
      raise exception 'LOCATION_CITY_MISMATCH';
    end if;
  else
    authoritative_location:=new.approximate_location;
  end if;
  perform private.assert_supported_location(new.city_id,authoritative_location);
  return new;
end
$$;
revoke all on function private.enforce_request_service_location()
  from public,anon,authenticated;

drop trigger if exists service_requests_location_authority on public.service_requests;
create trigger service_requests_location_authority
before insert or update of city_id,exact_address_id,approximate_location
on public.service_requests
for each row execute function private.enforce_request_service_location();

create or replace function public.make_my_saved_address_default(
  p_address_id uuid
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(actor::text||':saved-addresses',0)
  );
  perform 1
  from public.addresses
  where id=p_address_id
    and user_id=actor
    and address_kind='saved'
    and deleted_at is null
  for update;
  if not found then raise exception 'SAVED_ADDRESS_NOT_AVAILABLE'; end if;

  update public.addresses
  set is_default=false,updated_at=now()
  where user_id=actor
    and address_kind='saved'
    and deleted_at is null
    and id<>p_address_id
    and is_default;

  update public.addresses
  set is_default=true,updated_at=now()
  where id=p_address_id;
end
$$;
revoke all on function public.make_my_saved_address_default(uuid)
  from public,anon;
grant execute on function public.make_my_saved_address_default(uuid)
  to authenticated;
