-- ============================================================================
--  Reservá.  —  Schema `tesisreserva`
--  App de reservas para Paraguay · Cliente + Dueño de negocio
--
--  IMPORTANTE (Supabase self-hosted / PostgREST):
--    Este schema NO se expone solo. Hay que agregar `tesisreserva` a la
--    variable de entorno PGRST_DB_SCHEMAS del servicio REST y reiniciarlo.
--    Ver docs/SUPABASE_SETUP.md
--
--  Esta migración es idempotente: se puede correr varias veces.
--  NO toca `public` ni ningún otro schema (la instancia es compartida).
-- ============================================================================

create schema if not exists tesisreserva;

-- `extensions` es necesario: en Supabase self-hosted pg_trgm/pgcrypto viven ahí.
set local search_path = tesisreserva, public, extensions;

-- ---------------------------------------------------------------------------
-- 0. Utilidades
-- ---------------------------------------------------------------------------

-- Zona horaria de la aplicación.
--
-- La instancia de Supabase es COMPARTIDA con otros proyectos y corre en UTC,
-- así que no se puede tocar el timezone del servidor. Pero los usuarios están
-- en Paraguay y `reservation_date`/`reservation_time` guardan la hora local
-- del negocio, no UTC. Sin estos helpers pasan dos cosas concretas:
--
--   · `current_date` cambia de día a las 20:00 hora paraguaya, así que a la
--     noche (el horario de más movimiento en un restaurante) el panel del
--     dueño mostraba las reservas de mañana como si fueran las de hoy.
--   · comparar `reservation_date + reservation_time` contra `now()` trata la
--     hora local como si fuera UTC: a las 17:00 de Paraguay el sistema decía
--     que una mesa para las 20:00 de esa misma noche "ya pasó".
--
-- Todo el schema usa estas dos funciones en lugar de `current_date` y `now()`
-- para cualquier cuenta que involucre la agenda.
create or replace function tesisreserva.zona_horaria()
returns text
language sql
immutable
as $$ select 'America/Asuncion'::text $$;

/** Fecha de hoy en Paraguay. */
create or replace function tesisreserva.hoy()
returns date
language sql
stable
as $$ select (now() at time zone tesisreserva.zona_horaria())::date $$;

/** Momento actual como hora de pared paraguaya, comparable con date + time. */
create or replace function tesisreserva.ahora_local()
returns timestamp
language sql
stable
as $$ select (now() at time zone tesisreserva.zona_horaria()) $$;

-- Trigger genérico para mantener updated_at
create or replace function tesisreserva.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Código corto legible para la reserva (ej. RSV-7K2M9Q)
create or replace function tesisreserva.gen_reservation_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin I/O/0/1
  code text;
  i int;
begin
  loop
    code := 'RSV-';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from tesisreserva.reservations r where r.reservation_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text        not null default '',
  email       text,
  phone       text,
  avatar_url  text,
  role        text        not null default 'client',
  city        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_role_check check (role in ('client', 'owner', 'admin'))
);

-- Capacidad de tener negocios, separada del rol.
--
-- Antes el rol hacía las dos cosas a la vez: decía qué es la cuenta Y qué
-- puede hacer, así que un correo servía para vender o para reservar, nunca
-- para las dos. Como el correo es único en `auth.users`, la única salida era
-- tener dos cuentas con dos correos distintos.
--
-- Ahora TODA cuenta puede reservar, y `is_owner` habilita además el panel de
-- negocio. `role` se conserva para distinguir a los admin y para saber con
-- qué intención se registró la persona.
alter table tesisreserva.profiles
  add column if not exists is_owner boolean not null default false;

-- Los dueños que ya existían conservan su capacidad.
update tesisreserva.profiles set is_owner = true
 where role in ('owner', 'admin') and not is_owner;

create index if not exists idx_profiles_role on tesisreserva.profiles (role);
create index if not exists idx_profiles_is_owner on tesisreserva.profiles (is_owner) where is_owner;

drop trigger if exists trg_profiles_updated_at on tesisreserva.profiles;
create trigger trg_profiles_updated_at
  before update on tesisreserva.profiles
  for each row execute function tesisreserva.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Helpers de seguridad (SECURITY DEFINER para evitar recursión de RLS)
-- ---------------------------------------------------------------------------

/**
 * ¿La cuenta actual puede tener negocios?
 *
 * SECURITY DEFINER igual que `current_profile_role()`: leer `profiles` desde
 * una política de `profiles` provocaría recursión infinita de RLS.
 */
create or replace function tesisreserva.is_owner_account()
returns boolean
language sql
stable
security definer
set search_path = tesisreserva, public
as $$
  select coalesce(
    (select p.is_owner from tesisreserva.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function tesisreserva.current_profile_role()
returns text
language sql
stable
security definer
set search_path = tesisreserva, public
as $$
  select coalesce(
    (select p.role from tesisreserva.profiles p where p.id = auth.uid()),
    'anon'
  );
$$;

create or replace function tesisreserva.is_admin()
returns boolean
language sql
stable
security definer
set search_path = tesisreserva, public
as $$
  select tesisreserva.current_profile_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- 3. business_categories
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.business_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text        not null,
  slug       text        not null unique,
  icon       text,
  sort_order int         not null default 0,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. businesses
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.businesses (
  id                            uuid primary key default gen_random_uuid(),
  owner_id                      uuid        not null references auth.users (id) on delete cascade,
  category_id                   uuid        references tesisreserva.business_categories (id) on delete set null,
  name                          text        not null,
  slug                          text        not null unique,
  description                   text,
  address                       text,
  neighborhood                  text,
  city                          text        not null default 'Asunción',
  latitude                      double precision,
  longitude                     double precision,
  phone                         text,
  whatsapp                      text,
  cover_url                     text,
  logo_url                      text,
  active                        boolean     not null default true,
  deposit_enabled               boolean     not null default false,
  deposit_amount                numeric(12,2) not null default 0,
  deposit_per_person            boolean     not null default true,
  -- A dónde transferir la seña. Se le muestra al cliente al reservar, así que
  -- son datos que el dueño publica a propósito, no información sensible suya.
  deposit_bank_name             text,
  deposit_account_holder        text,
  deposit_account_number        text,
  deposit_document_id           text,
  deposit_instructions          text,
  reservation_type              text        not null default 'table',
  default_slot_duration_minutes int         not null default 90,
  slot_step_minutes             int         not null default 30,
  max_concurrent_reservations   int         not null default 1,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  -- Cómo reserva la gente en este local:
  --   slot     turno y nada más           (lavaderos, peluquerías)
  --   table    mesa según cuántos son     (restaurantes)
  --   service  turno + el servicio        (spa de uñas)
  --   stay     por noches, entrada/salida (hospedajes)
  constraint businesses_reservation_type_check
    check (reservation_type in ('table', 'service', 'slot', 'stay')),
  constraint businesses_deposit_amount_check
    check (deposit_amount >= 0),
  constraint businesses_duration_check
    check (default_slot_duration_minutes between 15 and 480),
  constraint businesses_step_check
    check (slot_step_minutes between 5 and 240),
  constraint businesses_concurrent_check
    check (max_concurrent_reservations >= 1),
  constraint businesses_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint businesses_longitude_check
    check (longitude is null or longitude between -180 and 180)
);

-- La tabla ya existe en las instalaciones anteriores, asi que las columnas
-- nuevas van por ALTER: el `create table if not exists` de arriba no las
-- agrega. Es idempotente y se puede volver a correr sin efecto.
alter table tesisreserva.businesses
  add column if not exists deposit_bank_name      text,
  add column if not exists deposit_account_holder text,
  add column if not exists deposit_account_number text,
  add column if not exists deposit_document_id    text,
  add column if not exists deposit_instructions   text;

alter table tesisreserva.businesses
  drop constraint if exists businesses_reservation_type_check;
alter table tesisreserva.businesses
  add constraint businesses_reservation_type_check
  check (reservation_type in ('table', 'service', 'slot', 'stay'));

create index if not exists idx_businesses_owner    on tesisreserva.businesses (owner_id);
create index if not exists idx_businesses_category on tesisreserva.businesses (category_id);
create index if not exists idx_businesses_active   on tesisreserva.businesses (active);
create index if not exists idx_businesses_city     on tesisreserva.businesses (city);
create index if not exists idx_businesses_name_trgm
  on tesisreserva.businesses using gin (name gin_trgm_ops);

drop trigger if exists trg_businesses_updated_at on tesisreserva.businesses;
create trigger trg_businesses_updated_at
  before update on tesisreserva.businesses
  for each row execute function tesisreserva.set_updated_at();

-- Helper que depende de `businesses` (por eso va después de crearla).
create or replace function tesisreserva.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = tesisreserva, public
as $$
  select exists (
    select 1
    from tesisreserva.businesses b
    where b.id = p_business_id
      and b.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. business_hours  +  business_hour_slots  (permite horarios partidos)
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.business_hours (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid        not null references tesisreserva.businesses (id) on delete cascade,
  day_of_week int         not null,
  enabled     boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint business_hours_dow_check check (day_of_week between 0 and 6),
  constraint business_hours_unique unique (business_id, day_of_week)
);

create index if not exists idx_business_hours_business on tesisreserva.business_hours (business_id);

drop trigger if exists trg_business_hours_updated_at on tesisreserva.business_hours;
create trigger trg_business_hours_updated_at
  before update on tesisreserva.business_hours
  for each row execute function tesisreserva.set_updated_at();

create table if not exists tesisreserva.business_hour_slots (
  id               uuid primary key default gen_random_uuid(),
  business_hour_id uuid        not null references tesisreserva.business_hours (id) on delete cascade,
  opens_at         time        not null,
  closes_at        time        not null,
  sort_order       int         not null default 0,
  created_at       timestamptz not null default now(),
  constraint business_hour_slots_range_check check (closes_at > opens_at)
);

create index if not exists idx_business_hour_slots_hour
  on tesisreserva.business_hour_slots (business_hour_id);

-- ---------------------------------------------------------------------------
-- 6. business_capacity  (mesas por tamaño — restaurantes/cafeterías)
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.business_capacity (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid        not null references tesisreserva.businesses (id) on delete cascade,
  party_size  int         not null,
  quantity    int         not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint business_capacity_size_check     check (party_size between 1 and 50),
  constraint business_capacity_quantity_check check (quantity >= 0),
  constraint business_capacity_unique unique (business_id, party_size)
);

create index if not exists idx_business_capacity_business
  on tesisreserva.business_capacity (business_id);

drop trigger if exists trg_business_capacity_updated_at on tesisreserva.business_capacity;
create trigger trg_business_capacity_updated_at
  before update on tesisreserva.business_capacity
  for each row execute function tesisreserva.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. catalog_categories  +  catalog_items  (carta y servicios)
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.catalog_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid        not null references tesisreserva.businesses (id) on delete cascade,
  name        text        not null,
  sort_order  int         not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  constraint catalog_categories_unique unique (business_id, name)
);

create index if not exists idx_catalog_categories_business
  on tesisreserva.catalog_categories (business_id);

create table if not exists tesisreserva.catalog_items (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid        not null references tesisreserva.businesses (id) on delete cascade,
  category_id      uuid        references tesisreserva.catalog_categories (id) on delete set null,
  name             text        not null,
  description      text,
  price            numeric(12,2) not null default 0,
  item_type        text        not null default 'product',
  duration_minutes int,
  image_url        text,
  active           boolean     not null default true,
  sort_order       int         not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint catalog_items_type_check     check (item_type in ('product', 'service')),
  constraint catalog_items_price_check    check (price >= 0),
  constraint catalog_items_duration_check check (duration_minutes is null or duration_minutes between 5 and 480)
);

create index if not exists idx_catalog_items_business on tesisreserva.catalog_items (business_id);
create index if not exists idx_catalog_items_category on tesisreserva.catalog_items (category_id);
create index if not exists idx_catalog_items_active   on tesisreserva.catalog_items (business_id, active);

drop trigger if exists trg_catalog_items_updated_at on tesisreserva.catalog_items;
create trigger trg_catalog_items_updated_at
  before update on tesisreserva.catalog_items
  for each row execute function tesisreserva.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. promotions
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.promotions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid        not null references tesisreserva.businesses (id) on delete cascade,
  title       text        not null,
  description text,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  unlimited   boolean     not null default false,
  active      boolean     not null default true,
  image_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint promotions_range_check check (ends_at is null or ends_at > starts_at),
  constraint promotions_unlimited_check check (
    (unlimited and ends_at is null) or (not unlimited)
  )
);

create index if not exists idx_promotions_business on tesisreserva.promotions (business_id);
create index if not exists idx_promotions_active   on tesisreserva.promotions (active, starts_at, ends_at);

drop trigger if exists trg_promotions_updated_at on tesisreserva.promotions;
create trigger trg_promotions_updated_at
  before update on tesisreserva.promotions
  for each row execute function tesisreserva.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. reservations
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.reservations (
  id                  uuid primary key default gen_random_uuid(),
  reservation_code    text        not null unique,
  client_id           uuid        not null references auth.users (id) on delete cascade,
  business_id         uuid        not null references tesisreserva.businesses (id) on delete cascade,
  catalog_item_id     uuid        references tesisreserva.catalog_items (id) on delete set null,
  reservation_date    date        not null,
  reservation_time    time        not null,
  -- Sólo para hospedajes: el día que se va. La noche de salida NO se ocupa,
  -- por eso una estadía del 5 al 8 son 3 noches y el 8 ya se puede volver a
  -- reservar. En el resto de los rubros queda nulo.
  check_out_date      date,
  party_size          int,
  duration_minutes    int         not null default 90,
  status              text        not null default 'pending',
  notes               text,
  deposit_required    boolean     not null default false,
  deposit_amount      numeric(12,2) not null default 0,
  deposit_status      text        not null default 'none',
  -- Comprobante de la transferencia que sube el cliente.
  deposit_proof_url   text,
  deposit_proof_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  cancellation_reason text,
  constraint reservations_status_check check (
    status in ('pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show')
  ),
  constraint reservations_deposit_status_check check (
    deposit_status in ('none', 'pending', 'paid', 'refunded', 'failed')
  ),
  constraint reservations_party_size_check check (party_size is null or party_size between 1 and 50),
  constraint reservations_duration_check   check (duration_minutes between 15 and 480),
  -- La salida siempre después de la entrada; sin salida es una reserva normal.
  constraint reservations_stay_check check (
    check_out_date is null or check_out_date > reservation_date
  )
);

alter table tesisreserva.reservations
  add column if not exists check_out_date    date,
  add column if not exists deposit_proof_url text,
  add column if not exists deposit_proof_at  timestamptz;

alter table tesisreserva.reservations
  drop constraint if exists reservations_stay_check;
alter table tesisreserva.reservations
  add constraint reservations_stay_check
  check (check_out_date is null or check_out_date > reservation_date);

create index if not exists idx_reservations_client   on tesisreserva.reservations (client_id);
create index if not exists idx_reservations_business on tesisreserva.reservations (business_id);
create index if not exists idx_reservations_date     on tesisreserva.reservations (reservation_date);
create index if not exists idx_reservations_status   on tesisreserva.reservations (status);
create index if not exists idx_reservations_lookup
  on tesisreserva.reservations (business_id, reservation_date, status);

drop trigger if exists trg_reservations_updated_at on tesisreserva.reservations;
create trigger trg_reservations_updated_at
  before update on tesisreserva.reservations
  for each row execute function tesisreserva.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. reservation_status_history
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.reservation_status_history (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid        not null references tesisreserva.reservations (id) on delete cascade,
  previous_status text,
  new_status      text        not null,
  changed_by      uuid        references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_res_history_reservation
  on tesisreserva.reservation_status_history (reservation_id);

-- ---------------------------------------------------------------------------
-- 11. reviews
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.reviews (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid        references tesisreserva.reservations (id) on delete set null,
  business_id     uuid        not null references tesisreserva.businesses (id) on delete cascade,
  client_id       uuid        not null references auth.users (id) on delete cascade,
  rating          int         not null,
  comment         text,
  owner_reply     text,
  owner_replied_at timestamptz,
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_one_per_reservation unique (reservation_id)
);

create index if not exists idx_reviews_business on tesisreserva.reviews (business_id);
create index if not exists idx_reviews_client   on tesisreserva.reviews (client_id);
create index if not exists idx_reviews_active   on tesisreserva.reviews (business_id, active);

drop trigger if exists trg_reviews_updated_at on tesisreserva.reviews;
create trigger trg_reviews_updated_at
  before update on tesisreserva.reviews
  for each row execute function tesisreserva.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. reservation_payments  (estructura lista; sin pasarela todavía)
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.reservation_payments (
  id                 uuid primary key default gen_random_uuid(),
  reservation_id     uuid        not null references tesisreserva.reservations (id) on delete cascade,
  amount             numeric(12,2) not null,
  currency           text        not null default 'PYG',
  status             text        not null default 'pending',
  provider           text,
  provider_reference text,
  paid_at            timestamptz,
  refunded_at        timestamptz,
  created_at         timestamptz not null default now(),
  constraint reservation_payments_status_check
    check (status in ('pending', 'paid', 'refunded', 'failed')),
  constraint reservation_payments_amount_check check (amount >= 0)
);

create index if not exists idx_reservation_payments_reservation
  on tesisreserva.reservation_payments (reservation_id);

-- ---------------------------------------------------------------------------
-- 13. notifications
-- ---------------------------------------------------------------------------

create table if not exists tesisreserva.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  title        text        not null,
  body         text,
  type         text        not null default 'general',
  reference_id uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint notifications_type_check check (
    type in ('general', 'reservation_created', 'reservation_confirmed',
             'reservation_rejected', 'reservation_cancelled', 'review_reply')
  )
);

create index if not exists idx_notifications_user
  on tesisreserva.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread
  on tesisreserva.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- 13b. Claves foráneas hacia `profiles`
--
-- `client_id` / `owner_id` ya referencian auth.users, pero PostgREST resuelve
-- los embeds (`select=*,client:profiles(...)`) siguiendo las FK. Sin estas
-- restricciones, `reservations -> profiles` no existe para la Data API.
-- Son redundantes a nivel de integridad, pero necesarias para las consultas.
-- ---------------------------------------------------------------------------

do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_client_profile_fkey') then
    alter table tesisreserva.reservations
      add constraint reservations_client_profile_fkey
      foreign key (client_id) references tesisreserva.profiles (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reviews_client_profile_fkey') then
    alter table tesisreserva.reviews
      add constraint reviews_client_profile_fkey
      foreign key (client_id) references tesisreserva.profiles (id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'businesses_owner_profile_fkey') then
    alter table tesisreserva.businesses
      add constraint businesses_owner_profile_fkey
      foreign key (owner_id) references tesisreserva.profiles (id) on delete cascade;
  end if;
end;
$fk$;


-- ============================================================================
--  ROW LEVEL SECURITY
-- ============================================================================

alter table tesisreserva.profiles                   enable row level security;
alter table tesisreserva.business_categories        enable row level security;
alter table tesisreserva.businesses                 enable row level security;
alter table tesisreserva.business_hours             enable row level security;
alter table tesisreserva.business_hour_slots        enable row level security;
alter table tesisreserva.business_capacity          enable row level security;
alter table tesisreserva.catalog_categories         enable row level security;
alter table tesisreserva.catalog_items              enable row level security;
alter table tesisreserva.promotions                 enable row level security;
alter table tesisreserva.reservations               enable row level security;
alter table tesisreserva.reservation_status_history enable row level security;
alter table tesisreserva.reviews                    enable row level security;
alter table tesisreserva.reservation_payments       enable row level security;
alter table tesisreserva.notifications              enable row level security;

-- ---- profiles --------------------------------------------------------------
drop policy if exists profiles_select_own      on tesisreserva.profiles;
drop policy if exists profiles_update_own      on tesisreserva.profiles;
drop policy if exists profiles_insert_own      on tesisreserva.profiles;
drop policy if exists profiles_select_business on tesisreserva.profiles;

-- Cada quien lee su propio profile.
create policy profiles_select_own on tesisreserva.profiles
  for select to authenticated
  using (id = auth.uid() or tesisreserva.is_admin());

-- El dueño puede ver el nombre del cliente que le reservó / le dejó reseña.
create policy profiles_select_business on tesisreserva.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from tesisreserva.reservations r
      join tesisreserva.businesses b on b.id = r.business_id
      where r.client_id = tesisreserva.profiles.id
        and b.owner_id = auth.uid()
    )
    or exists (
      select 1
      from tesisreserva.reviews rv
      join tesisreserva.businesses b on b.id = rv.business_id
      where rv.client_id = tesisreserva.profiles.id
        and b.owner_id = auth.uid()
    )
  );

create policy profiles_insert_own on tesisreserva.profiles
  for insert to authenticated
  with check (id = auth.uid() and role in ('client', 'owner'));

-- El usuario edita sus datos pero NO puede cambiarse el role.
-- La comparación usa `current_profile_role()` (SECURITY DEFINER) a propósito:
-- un subselect sobre `profiles` acá provoca recursión infinita de RLS.
create policy profiles_update_own on tesisreserva.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = tesisreserva.current_profile_role()
    -- `is_owner` tampoco se toca por UPDATE directo: se activa por la RPC
    -- `become_owner()`, que es el único camino y queda auditable.
    and is_owner = tesisreserva.is_owner_account()
  );

-- ---- business_categories ---------------------------------------------------
drop policy if exists business_categories_read  on tesisreserva.business_categories;
drop policy if exists business_categories_admin on tesisreserva.business_categories;

create policy business_categories_read on tesisreserva.business_categories
  for select to anon, authenticated
  using (active);

create policy business_categories_admin on tesisreserva.business_categories
  for all to authenticated
  using (tesisreserva.is_admin())
  with check (tesisreserva.is_admin());

-- ---- businesses ------------------------------------------------------------
drop policy if exists businesses_read_public on tesisreserva.businesses;
drop policy if exists businesses_read_own    on tesisreserva.businesses;
drop policy if exists businesses_insert_own  on tesisreserva.businesses;
drop policy if exists businesses_update_own  on tesisreserva.businesses;
drop policy if exists businesses_delete_own  on tesisreserva.businesses;

create policy businesses_read_public on tesisreserva.businesses
  for select to anon, authenticated
  using (active);

create policy businesses_read_own on tesisreserva.businesses
  for select to authenticated
  using (owner_id = auth.uid() or tesisreserva.is_admin());

-- Solo una cuenta con el modo negocio activado, y siempre a su nombre.
create policy businesses_insert_own on tesisreserva.businesses
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (tesisreserva.is_owner_account() or tesisreserva.is_admin())
  );

create policy businesses_update_own on tesisreserva.businesses
  for update to authenticated
  using (owner_id = auth.uid() or tesisreserva.is_admin())
  with check (owner_id = auth.uid() or tesisreserva.is_admin());

create policy businesses_delete_own on tesisreserva.businesses
  for delete to authenticated
  using (owner_id = auth.uid() or tesisreserva.is_admin());

-- ---- business_hours --------------------------------------------------------
drop policy if exists business_hours_read   on tesisreserva.business_hours;
drop policy if exists business_hours_manage on tesisreserva.business_hours;

create policy business_hours_read on tesisreserva.business_hours
  for select to anon, authenticated
  using (
    exists (select 1 from tesisreserva.businesses b
            where b.id = business_id and (b.active or b.owner_id = auth.uid()))
  );

create policy business_hours_manage on tesisreserva.business_hours
  for all to authenticated
  using (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin())
  with check (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin());

-- ---- business_hour_slots ---------------------------------------------------
drop policy if exists business_hour_slots_read   on tesisreserva.business_hour_slots;
drop policy if exists business_hour_slots_manage on tesisreserva.business_hour_slots;

create policy business_hour_slots_read on tesisreserva.business_hour_slots
  for select to anon, authenticated
  using (
    exists (
      select 1
      from tesisreserva.business_hours h
      join tesisreserva.businesses b on b.id = h.business_id
      where h.id = business_hour_id and (b.active or b.owner_id = auth.uid())
    )
  );

create policy business_hour_slots_manage on tesisreserva.business_hour_slots
  for all to authenticated
  using (
    exists (select 1 from tesisreserva.business_hours h
            where h.id = business_hour_id
              and (tesisreserva.is_business_owner(h.business_id) or tesisreserva.is_admin()))
  )
  with check (
    exists (select 1 from tesisreserva.business_hours h
            where h.id = business_hour_id
              and (tesisreserva.is_business_owner(h.business_id) or tesisreserva.is_admin()))
  );

-- ---- business_capacity -----------------------------------------------------
drop policy if exists business_capacity_read   on tesisreserva.business_capacity;
drop policy if exists business_capacity_manage on tesisreserva.business_capacity;

create policy business_capacity_read on tesisreserva.business_capacity
  for select to anon, authenticated
  using (
    exists (select 1 from tesisreserva.businesses b
            where b.id = business_id and (b.active or b.owner_id = auth.uid()))
  );

create policy business_capacity_manage on tesisreserva.business_capacity
  for all to authenticated
  using (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin())
  with check (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin());

-- ---- catalog_categories ----------------------------------------------------
drop policy if exists catalog_categories_read   on tesisreserva.catalog_categories;
drop policy if exists catalog_categories_manage on tesisreserva.catalog_categories;

create policy catalog_categories_read on tesisreserva.catalog_categories
  for select to anon, authenticated
  using (
    exists (select 1 from tesisreserva.businesses b
            where b.id = business_id and (b.active or b.owner_id = auth.uid()))
  );

create policy catalog_categories_manage on tesisreserva.catalog_categories
  for all to authenticated
  using (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin())
  with check (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin());

-- ---- catalog_items ---------------------------------------------------------
drop policy if exists catalog_items_read   on tesisreserva.catalog_items;
drop policy if exists catalog_items_manage on tesisreserva.catalog_items;

create policy catalog_items_read on tesisreserva.catalog_items
  for select to anon, authenticated
  using (
    (active and exists (select 1 from tesisreserva.businesses b
                        where b.id = business_id and b.active))
    or tesisreserva.is_business_owner(business_id)
  );

create policy catalog_items_manage on tesisreserva.catalog_items
  for all to authenticated
  using (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin())
  with check (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin());

-- ---- promotions ------------------------------------------------------------
drop policy if exists promotions_read   on tesisreserva.promotions;
drop policy if exists promotions_manage on tesisreserva.promotions;

create policy promotions_read on tesisreserva.promotions
  for select to anon, authenticated
  using (
    (
      active
      and starts_at <= now()
      and (unlimited or ends_at is null or ends_at > now())
      and exists (select 1 from tesisreserva.businesses b
                  where b.id = business_id and b.active)
    )
    or tesisreserva.is_business_owner(business_id)
  );

create policy promotions_manage on tesisreserva.promotions
  for all to authenticated
  using (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin())
  with check (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin());

-- ---- reservations ----------------------------------------------------------
drop policy if exists reservations_select_own    on tesisreserva.reservations;
drop policy if exists reservations_select_owner  on tesisreserva.reservations;
drop policy if exists reservations_insert_own    on tesisreserva.reservations;
drop policy if exists reservations_update_client on tesisreserva.reservations;
drop policy if exists reservations_update_owner  on tesisreserva.reservations;

create policy reservations_select_own on tesisreserva.reservations
  for select to authenticated
  using (client_id = auth.uid() or tesisreserva.is_admin());

create policy reservations_select_owner on tesisreserva.reservations
  for select to authenticated
  using (tesisreserva.is_business_owner(business_id));

-- El alta normal va por el RPC create_reservation, pero dejamos la política
-- coherente: un cliente sólo puede insertar reservas a su propio nombre.
create policy reservations_insert_own on tesisreserva.reservations
  for insert to authenticated
  with check (client_id = auth.uid());

-- El cliente sólo puede cancelar (nunca confirmar) su propia reserva.
create policy reservations_update_client on tesisreserva.reservations
  for update to authenticated
  using (client_id = auth.uid() and status in ('pending', 'confirmed'))
  with check (client_id = auth.uid() and status = 'cancelled');

-- El dueño gestiona los estados de las reservas de sus negocios.
create policy reservations_update_owner on tesisreserva.reservations
  for update to authenticated
  using (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin())
  with check (tesisreserva.is_business_owner(business_id) or tesisreserva.is_admin());

-- ---- reservation_status_history --------------------------------------------
drop policy if exists res_history_read   on tesisreserva.reservation_status_history;
drop policy if exists res_history_insert on tesisreserva.reservation_status_history;

create policy res_history_read on tesisreserva.reservation_status_history
  for select to authenticated
  using (
    exists (
      select 1 from tesisreserva.reservations r
      where r.id = reservation_id
        and (r.client_id = auth.uid() or tesisreserva.is_business_owner(r.business_id))
    )
    or tesisreserva.is_admin()
  );

create policy res_history_insert on tesisreserva.reservation_status_history
  for insert to authenticated
  with check (
    exists (
      select 1 from tesisreserva.reservations r
      where r.id = reservation_id
        and (r.client_id = auth.uid() or tesisreserva.is_business_owner(r.business_id))
    )
  );

-- ---- reviews ---------------------------------------------------------------
drop policy if exists reviews_read          on tesisreserva.reviews;
drop policy if exists reviews_insert_client on tesisreserva.reviews;
drop policy if exists reviews_update_client on tesisreserva.reviews;
drop policy if exists reviews_update_owner  on tesisreserva.reviews;

create policy reviews_read on tesisreserva.reviews
  for select to anon, authenticated
  using (
    (active and exists (select 1 from tesisreserva.businesses b
                        where b.id = business_id and b.active))
    or client_id = auth.uid()
    or tesisreserva.is_business_owner(business_id)
  );

-- Sólo el cliente que hizo la reserva puede reseñar ese negocio.
create policy reviews_insert_client on tesisreserva.reviews
  for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from tesisreserva.reservations r
      where r.business_id = tesisreserva.reviews.business_id
        and r.client_id = auth.uid()
        and r.status in ('confirmed', 'completed')
    )
  );

create policy reviews_update_client on tesisreserva.reviews
  for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy reviews_update_owner on tesisreserva.reviews
  for update to authenticated
  using (tesisreserva.is_business_owner(business_id))
  with check (tesisreserva.is_business_owner(business_id));

-- Un WITH CHECK no puede comparar contra el valor anterior de la fila, así que
-- la separación de campos se hace acá: el cliente nunca escribe `owner_reply`
-- y el dueño nunca toca `rating` / `comment`.
create or replace function tesisreserva.guard_review_update()
returns trigger
language plpgsql
security definer
set search_path = tesisreserva, public
as $$
declare
  v_is_owner boolean;
begin
  select exists (
    select 1 from tesisreserva.businesses b
    where b.id = new.business_id and b.owner_id = auth.uid()
  ) into v_is_owner;

  if v_is_owner and new.client_id <> auth.uid() then
    -- Dueño respondiendo: se preservan los campos del cliente.
    new.rating         := old.rating;
    new.comment        := old.comment;
    new.client_id      := old.client_id;
    new.reservation_id := old.reservation_id;
  else
    -- Cliente editando su reseña: no puede inventar una respuesta del local.
    new.owner_reply      := old.owner_reply;
    new.owner_replied_at := old.owner_replied_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reviews_guard on tesisreserva.reviews;
create trigger trg_reviews_guard
  before update on tesisreserva.reviews
  for each row execute function tesisreserva.guard_review_update();

-- ---- reservation_payments --------------------------------------------------
drop policy if exists reservation_payments_read on tesisreserva.reservation_payments;

create policy reservation_payments_read on tesisreserva.reservation_payments
  for select to authenticated
  using (
    exists (
      select 1 from tesisreserva.reservations r
      where r.id = reservation_id
        and (r.client_id = auth.uid() or tesisreserva.is_business_owner(r.business_id))
    )
    or tesisreserva.is_admin()
  );

-- ---- notifications ---------------------------------------------------------
drop policy if exists notifications_read   on tesisreserva.notifications;
drop policy if exists notifications_update on tesisreserva.notifications;

create policy notifications_read on tesisreserva.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on tesisreserva.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
--  LÓGICA DE NEGOCIO  (RPC)
-- ============================================================================

-- ---------------------------------------------------------------------------
--  Disponibilidad de horarios para un negocio / fecha / tamaño de grupo
-- ---------------------------------------------------------------------------
create or replace function tesisreserva.get_availability(
  p_business_id uuid,
  p_date        date,
  p_party_size  int default null
)
returns table (
  slot_time time,
  remaining int,
  available boolean
)
language plpgsql
stable
security definer
set search_path = tesisreserva, public
as $$
declare
  v_biz      tesisreserva.businesses%rowtype;
  v_dow      int;
  v_capacity int;
begin
  select * into v_biz from tesisreserva.businesses where id = p_business_id and active;
  if not found then
    return;
  end if;

  v_dow := extract(dow from p_date)::int;   -- 0 = domingo

  -- Capacidad total del "cupo" según el tipo de negocio
  if v_biz.reservation_type = 'table' then
    if p_party_size is null then
      return;
    end if;
    select coalesce(c.quantity, 0) into v_capacity
    from tesisreserva.business_capacity c
    where c.business_id = p_business_id
      and c.party_size = p_party_size
      and c.active;
    v_capacity := coalesce(v_capacity, 0);
  else
    v_capacity := v_biz.max_concurrent_reservations;
  end if;

  if v_capacity <= 0 then
    return;
  end if;

  return query
  with slots as (
    select gs::time as t
    from tesisreserva.business_hours h
    join tesisreserva.business_hour_slots hs on hs.business_hour_id = h.id
    cross join lateral generate_series(
      (p_date + hs.opens_at),
      (p_date + hs.closes_at) - make_interval(mins => v_biz.default_slot_duration_minutes),
      make_interval(mins => v_biz.slot_step_minutes)
    ) as gs
    where h.business_id = p_business_id
      and h.day_of_week = v_dow
      and h.enabled
  ),
  taken as (
    select s.t, count(r.id)::int as used
    from slots s
    left join tesisreserva.reservations r
      on r.business_id = p_business_id
     and r.reservation_date = p_date
     and r.status in ('pending', 'confirmed')
     and (p_party_size is null or v_biz.reservation_type <> 'table' or r.party_size = p_party_size)
     -- solapamiento de intervalos [inicio, inicio + duración)
     and (p_date + s.t, (p_date + s.t) + make_interval(mins => v_biz.default_slot_duration_minutes))
         overlaps
         (p_date + r.reservation_time, (p_date + r.reservation_time) + make_interval(mins => r.duration_minutes))
    group by s.t
  )
  select
    tk.t                                as slot_time,
    greatest(v_capacity - tk.used, 0)   as remaining,
    (v_capacity - tk.used) > 0
      and (p_date + tk.t) > tesisreserva.ahora_local() as available
  from taken tk
  order by tk.t;
end;
$$;

-- ---------------------------------------------------------------------------
--  Disponibilidad de hospedajes (por noches, no por turno)
-- ---------------------------------------------------------------------------

/**
 * Cuántos alojamientos de cada tamaño quedan libres entre dos fechas.
 *
 * `get_availability` no sirve acá: devuelve turnos de un día, y un hospedaje
 * se ocupa por un rango completo. Se compara con `daterange`, que trata el
 * intervalo como [entrada, salida): la noche de salida queda libre, así que
 * alguien puede entrar el mismo día que otro se va.
 */
create or replace function tesisreserva.get_stay_availability(
  p_business_id uuid,
  p_check_in    date,
  p_check_out   date
)
returns table (party_size int, total int, remaining int)
language sql
stable
security definer
set search_path = tesisreserva, public
as $$
  select c.party_size,
         c.quantity as total,
         greatest(
           c.quantity - (
             select count(*)::int
               from tesisreserva.reservations r
              where r.business_id = p_business_id
                and r.status in ('pending', 'confirmed')
                and r.party_size = c.party_size
                and r.check_out_date is not null
                and daterange(p_check_in, p_check_out)
                    && daterange(r.reservation_date, r.check_out_date)
           ), 0) as remaining
    from tesisreserva.business_capacity c
   where c.business_id = p_business_id
     and c.active
     and p_check_out > p_check_in
   order by c.party_size;
$$;

-- ---------------------------------------------------------------------------
--  Creación transaccional de la reserva (valida capacidad server-side)
-- ---------------------------------------------------------------------------
-- La firma vieja se elimina: agregar un parametro con default crea una
-- sobrecarga nueva y PostgREST no sabria cual llamar.
drop function if exists tesisreserva.create_reservation(uuid, date, time, int, uuid, text);
drop function if exists tesisreserva.create_reservation(uuid, date, time, int, uuid, text, date);

create or replace function tesisreserva.create_reservation(
  p_business_id     uuid,
  p_date            date,
  p_time            time,
  p_party_size      int  default null,
  p_catalog_item_id uuid default null,
  p_notes           text default null,
  p_check_out       date default null,
  p_deposit_proof   text default null
)
returns tesisreserva.reservations
language plpgsql
security definer
set search_path = tesisreserva, public
as $$
declare
  v_uid      uuid := auth.uid();
  v_biz      tesisreserva.businesses%rowtype;
  v_item     tesisreserva.catalog_items%rowtype;
  v_dow      int;
  v_capacity int;
  v_used     int;
  v_duration int;
  v_deposit  numeric(12,2) := 0;
  v_res      tesisreserva.reservations%rowtype;
begin
  -- 1. usuario
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión para reservar.' using errcode = '28000';
  end if;

  -- Una cuenta con modo negocio SÍ puede reservar en otros locales: es el
  -- sentido de tener un solo correo para las dos cosas. Lo único sin sentido
  -- es reservarse una mesa a uno mismo.
  if tesisreserva.is_business_owner(p_business_id) then
    raise exception 'No podés reservar en tu propio negocio.' using errcode = '42501';
  end if;

  -- 2. negocio
  select * into v_biz from tesisreserva.businesses where id = p_business_id and active;
  if not found then
    raise exception 'El negocio no está disponible.' using errcode = 'P0002';
  end if;

  if p_date < tesisreserva.hoy() then
    raise exception 'No se puede reservar en una fecha pasada.' using errcode = '22007';
  end if;

  -- Si el local pide seña, sin comprobante no hay reserva. La validación vive
  -- acá y no sólo en la pantalla: cualquiera puede llamar a la API por afuera,
  -- y el dueño necesita el comprobante para decidir si acepta.
  if v_biz.deposit_enabled and v_biz.deposit_amount > 0
     and nullif(trim(coalesce(p_deposit_proof, '')), '') is null then
    raise exception 'Subí el comprobante de la seña para confirmar la reserva.'
      using errcode = '22023';
  end if;

  -- 3. item de carta / servicio (opcional)
  if p_catalog_item_id is not null then
    select * into v_item
    from tesisreserva.catalog_items
    where id = p_catalog_item_id and business_id = p_business_id and active;
    if not found then
      raise exception 'El servicio seleccionado ya no está disponible.' using errcode = 'P0002';
    end if;
  end if;

  -- En un spa de uñas (o similar) elegir el servicio es parte de la reserva:
  -- sin eso no se sabe cuánto dura ni qué se va a hacer.
  if v_biz.reservation_type = 'service' and p_catalog_item_id is null then
    raise exception 'Elegí el servicio que querés reservar.' using errcode = '22023';
  end if;

  v_duration := coalesce(v_item.duration_minutes, v_biz.default_slot_duration_minutes);

  -- ── Hospedaje: se reserva por noches, no por turno ────────────────────────
  if v_biz.reservation_type = 'stay' then
    if p_check_out is null then
      raise exception 'Elegí la fecha de salida.' using errcode = '22023';
    end if;
    if p_check_out <= p_date then
      raise exception 'La salida tiene que ser después de la entrada.' using errcode = '22023';
    end if;
    if p_party_size is null then
      raise exception 'Elegí para cuántas personas es.' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtext(p_business_id::text || '|stay'));

    select coalesce(c.quantity, 0) into v_capacity
      from tesisreserva.business_capacity c
     where c.business_id = p_business_id and c.party_size = p_party_size and c.active;
    v_capacity := coalesce(v_capacity, 0);

    if v_capacity <= 0 then
      raise exception 'No hay alojamientos para % personas.', p_party_size using errcode = '23514';
    end if;

    -- Se ocupa [entrada, salida): la noche de salida queda libre, por eso
    -- alguien puede entrar el mismo día que otro se va.
    select count(*)::int into v_used
      from tesisreserva.reservations r
     where r.business_id = p_business_id
       and r.status in ('pending', 'confirmed')
       and r.party_size = p_party_size
       and r.check_out_date is not null
       and daterange(p_date, p_check_out) && daterange(r.reservation_date, r.check_out_date);

    if v_used >= v_capacity then
      raise exception 'No quedan lugares para esas fechas.' using errcode = '23505';
    end if;

    if v_biz.deposit_enabled and v_biz.deposit_amount > 0 then
      v_deposit := v_biz.deposit_amount
                 * case when v_biz.deposit_per_person then coalesce(p_party_size, 1) else 1 end;
    end if;

    insert into tesisreserva.reservations (
      reservation_code, client_id, business_id, catalog_item_id,
      reservation_date, check_out_date, reservation_time, party_size, duration_minutes,
      status, notes, deposit_required, deposit_amount, deposit_status,
      deposit_proof_url, deposit_proof_at
    ) values (
      tesisreserva.gen_reservation_code(), v_uid, p_business_id, p_catalog_item_id,
      p_date, p_check_out, p_time, p_party_size, v_duration,
      'pending', nullif(trim(coalesce(p_notes, '')), ''),
      v_deposit > 0, v_deposit,
      case when v_deposit > 0 then 'pending' else 'none' end,
      nullif(trim(coalesce(p_deposit_proof, '')), ''),
      case when p_deposit_proof is not null then now() end
    ) returning * into v_res;

    insert into tesisreserva.reservation_status_history (reservation_id, previous_status, new_status, changed_by)
    values (v_res.id, null, 'pending', v_uid);

    if v_deposit > 0 then
      insert into tesisreserva.reservation_payments (reservation_id, amount, currency, status)
      values (v_res.id, v_deposit, 'PYG', 'pending');
    end if;

    insert into tesisreserva.notifications (user_id, title, body, type, reference_id)
    values (
      v_biz.owner_id, 'Nueva reserva',
      'Estadía del ' || to_char(p_date, 'DD/MM') || ' al ' || to_char(p_check_out, 'DD/MM') || '.',
      'reservation_created', v_res.id
    );

    return v_res;
  end if;

  -- 4. horario: el slot debe caer dentro de una franja habilitada
  v_dow := extract(dow from p_date)::int;

  if not exists (
    select 1
    from tesisreserva.business_hours h
    join tesisreserva.business_hour_slots hs on hs.business_hour_id = h.id
    where h.business_id = p_business_id
      and h.day_of_week = v_dow
      and h.enabled
      and p_time >= hs.opens_at
      and (p_time + make_interval(mins => v_duration))::time <= hs.closes_at
      and hs.closes_at > hs.opens_at
  ) then
    raise exception 'El horario elegido está fuera del horario de atención.' using errcode = '22023';
  end if;

  if (p_date + p_time) <= tesisreserva.ahora_local() then
    raise exception 'Ese horario ya pasó. Elegí otro.' using errcode = '22007';
  end if;

  -- 5. capacidad — serializamos por negocio+fecha para evitar carreras
  perform pg_advisory_xact_lock(
    hashtext(p_business_id::text || '|' || p_date::text)
  );

  -- 'slot' (lavadero, peluquería) y 'service' (spa de uñas) usan el mismo
  -- cupo simultáneo; sólo se diferencian en si hay que elegir un servicio.
  if v_biz.reservation_type = 'table' then
    if p_party_size is null then
      raise exception 'Elegí para cuántas personas es la reserva.' using errcode = '22023';
    end if;

    select coalesce(c.quantity, 0) into v_capacity
    from tesisreserva.business_capacity c
    where c.business_id = p_business_id and c.party_size = p_party_size and c.active;
    v_capacity := coalesce(v_capacity, 0);

    if v_capacity <= 0 then
      raise exception 'No hay mesas configuradas para % personas.', p_party_size using errcode = '23514';
    end if;

    select count(*)::int into v_used
    from tesisreserva.reservations r
    where r.business_id = p_business_id
      and r.reservation_date = p_date
      and r.status in ('pending', 'confirmed')
      and r.party_size = p_party_size
      and (p_date + p_time, (p_date + p_time) + make_interval(mins => v_duration))
          overlaps
          (p_date + r.reservation_time, (p_date + r.reservation_time) + make_interval(mins => r.duration_minutes));
  else
    v_capacity := v_biz.max_concurrent_reservations;

    select count(*)::int into v_used
    from tesisreserva.reservations r
    where r.business_id = p_business_id
      and r.reservation_date = p_date
      and r.status in ('pending', 'confirmed')
      and (p_date + p_time, (p_date + p_time) + make_interval(mins => v_duration))
          overlaps
          (p_date + r.reservation_time, (p_date + r.reservation_time) + make_interval(mins => r.duration_minutes));
  end if;

  if v_used >= v_capacity then
    raise exception 'Ese horario ya no está disponible.' using errcode = '23505';
  end if;

  -- 6. seña
  if v_biz.deposit_enabled and v_biz.deposit_amount > 0 then
    v_deposit := v_biz.deposit_amount
               * case when v_biz.deposit_per_person then coalesce(p_party_size, 1) else 1 end;
  end if;

  -- 7. alta
  insert into tesisreserva.reservations (
    reservation_code, client_id, business_id, catalog_item_id,
    reservation_date, reservation_time, party_size, duration_minutes,
    status, notes, deposit_required, deposit_amount, deposit_status,
    deposit_proof_url, deposit_proof_at
  ) values (
    tesisreserva.gen_reservation_code(), v_uid, p_business_id, p_catalog_item_id,
    p_date, p_time, p_party_size, v_duration,
    'pending', nullif(trim(coalesce(p_notes, '')), ''),
    v_deposit > 0, v_deposit,
    case when v_deposit > 0 then 'pending' else 'none' end,
    nullif(trim(coalesce(p_deposit_proof, '')), ''),
    case when p_deposit_proof is not null then now() end
  )
  returning * into v_res;

  insert into tesisreserva.reservation_status_history (reservation_id, previous_status, new_status, changed_by)
  values (v_res.id, null, 'pending', v_uid);

  if v_deposit > 0 then
    insert into tesisreserva.reservation_payments (reservation_id, amount, currency, status)
    values (v_res.id, v_deposit, 'PYG', 'pending');
  end if;

  -- Notificación para el dueño
  insert into tesisreserva.notifications (user_id, title, body, type, reference_id)
  values (
    v_biz.owner_id,
    'Nueva reserva',
    'Tenés una nueva reserva para el ' || to_char(p_date, 'DD/MM') || ' a las ' || to_char(p_time, 'HH24:MI') || '.',
    'reservation_created',
    v_res.id
  );

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
--  Cambio de estado (dueño acepta/rechaza · cliente cancela)
-- ---------------------------------------------------------------------------
create or replace function tesisreserva.set_reservation_status(
  p_reservation_id uuid,
  p_status         text,
  p_reason         text default null
)
returns tesisreserva.reservations
language plpgsql
security definer
set search_path = tesisreserva, public
as $$
declare
  v_uid      uuid := auth.uid();
  v_res      tesisreserva.reservations%rowtype;
  v_biz      tesisreserva.businesses%rowtype;
  v_prev     text;
  v_is_owner boolean;
  v_title    text;
  v_type     text;
begin
  if v_uid is null then
    raise exception 'Sesión no válida.' using errcode = '28000';
  end if;

  if p_status not in ('confirmed', 'rejected', 'cancelled', 'completed', 'no_show') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;

  select * into v_res from tesisreserva.reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'La reserva no existe.' using errcode = 'P0002';
  end if;

  select * into v_biz from tesisreserva.businesses where id = v_res.business_id;
  v_is_owner := v_biz.owner_id = v_uid;

  -- Permisos: el cliente sólo cancela; el dueño hace el resto.
  if not v_is_owner then
    if v_res.client_id <> v_uid then
      raise exception 'No tenés permiso sobre esta reserva.' using errcode = '42501';
    end if;
    if p_status <> 'cancelled' then
      raise exception 'Sólo podés cancelar tu reserva.' using errcode = '42501';
    end if;
  end if;

  if v_res.status in ('cancelled', 'rejected', 'completed', 'no_show') then
    raise exception 'La reserva ya está %.', v_res.status using errcode = '22023';
  end if;

  -- Marcar asistencia es registrar algo que ya ocurrió, así que tiene dos
  -- condiciones que el resto de los estados no tienen.
  if p_status in ('completed', 'no_show') then
    -- 1. Sólo desde 'confirmed'. Cerrar una reserva que nunca se confirmó
    --    deja al cliente con un "no asistió" a algo que el local nunca le
    --    aceptó, y además saltea el aviso de confirmación.
    if v_res.status <> 'confirmed' then
      raise exception 'Primero confirmá la reserva.' using errcode = '22023';
    end if;

    -- 2. Sólo una vez llegada la hora. La media hora de tolerancia es para
    --    quien llega antes: sin ella, marcar a un cliente puntual que se
    --    presenta 10 minutos temprano daría error.
    if (v_res.reservation_date + v_res.reservation_time)
         > tesisreserva.ahora_local() + interval '30 minutes' then
      raise exception 'Todavía no podés marcar la asistencia: esa reserva aún no ocurrió.'
        using errcode = '22023';
    end if;
  end if;

  v_prev := v_res.status;

  update tesisreserva.reservations
     set status              = p_status,
         cancelled_at        = case when p_status in ('cancelled', 'rejected') then now() else cancelled_at end,
         cancellation_reason = case when p_status in ('cancelled', 'rejected')
                                    then nullif(trim(coalesce(p_reason, '')), '') else cancellation_reason end
   where id = p_reservation_id
   returning * into v_res;

  insert into tesisreserva.reservation_status_history (reservation_id, previous_status, new_status, changed_by)
  values (v_res.id, v_prev, p_status, v_uid);

  -- Notificar a la contraparte
  if v_is_owner then
    v_title := case p_status
                 when 'confirmed' then 'Reserva confirmada'
                 when 'rejected'  then 'Reserva rechazada'
                 when 'cancelled' then 'Reserva cancelada'
                 when 'completed' then 'Gracias por tu visita'
                 else 'Actualización de tu reserva'
               end;
    v_type := case p_status
                when 'confirmed' then 'reservation_confirmed'
                when 'rejected'  then 'reservation_rejected'
                when 'cancelled' then 'reservation_cancelled'
                else 'general'
              end;

    -- El motivo va en el aviso. Sin esto el cliente se entera de que le
    -- rechazaron la reserva pero no de por qué, y el texto que escribió el
    -- dueño quedaba guardado sin que nadie lo leyera nunca.
    insert into tesisreserva.notifications (user_id, title, body, type, reference_id)
    values (
      v_res.client_id, v_title,
      v_biz.name || ' · ' || to_char(v_res.reservation_date, 'DD/MM') ||
        ' ' || to_char(v_res.reservation_time, 'HH24:MI') || ' h' ||
        coalesce(' — ' || v_res.cancellation_reason, ''),
      v_type, v_res.id
    );
  else
    insert into tesisreserva.notifications (user_id, title, body, type, reference_id)
    values (
      v_biz.owner_id, 'Reserva cancelada por el cliente',
      to_char(v_res.reservation_date, 'DD/MM') || ' ' || to_char(v_res.reservation_time, 'HH24:MI') || ' h' ||
        coalesce(' — ' || v_res.cancellation_reason, ''),
      'reservation_cancelled', v_res.id
    );
  end if;

  return v_res;
end;
$$;

-- ---------------------------------------------------------------------------
--  Activar el modo negocio en la cuenta propia
-- ---------------------------------------------------------------------------

/**
 * Habilita el panel de negocio en la cuenta que llama.
 *
 * Es el ÚNICO camino para cambiar `is_owner`: la política de `profiles`
 * bloquea el UPDATE directo. Así queda un solo punto de entrada, explícito y
 * fácil de auditar.
 *
 * Notar lo que NO hace: no toca `role`. Un cliente que activa su negocio
 * sigue siendo `role = 'client'`, así que nadie se auto-asciende a `admin`
 * por este camino, que era la garantía original del diseño.
 *
 * Tampoco se puede desactivar desde acá. Apagarlo con negocios publicados
 * los dejaría sin dueño efectivo: quedarían visibles para los clientes pero
 * sin nadie que pueda contestar sus reservas.
 */
create or replace function tesisreserva.become_owner()
returns tesisreserva.profiles
language plpgsql
security definer
set search_path = tesisreserva, public
as $$
declare
  v_uid uuid := auth.uid();
  v_row tesisreserva.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  update tesisreserva.profiles
     set is_owner = true
   where id = v_uid
   returning * into v_row;

  if not found then
    raise exception 'No encontramos tu perfil.' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
--  Respuesta del dueño a una reseña (+ notificación al cliente)
-- ---------------------------------------------------------------------------
create or replace function tesisreserva.reply_to_review(
  p_review_id uuid,
  p_reply     text
)
returns tesisreserva.reviews
language plpgsql
security definer
set search_path = tesisreserva, public
as $$
declare
  v_uid uuid := auth.uid();
  v_rev tesisreserva.reviews%rowtype;
  v_biz tesisreserva.businesses%rowtype;
begin
  if v_uid is null then
    raise exception 'Sesión no válida.' using errcode = '28000';
  end if;
  if nullif(trim(coalesce(p_reply, '')), '') is null then
    raise exception 'La respuesta no puede estar vacía.' using errcode = '22023';
  end if;

  select * into v_rev from tesisreserva.reviews where id = p_review_id;
  if not found then
    raise exception 'La reseña no existe.' using errcode = 'P0002';
  end if;

  select * into v_biz from tesisreserva.businesses where id = v_rev.business_id;
  if v_biz.owner_id <> v_uid then
    raise exception 'Sólo el dueño del negocio puede responder.' using errcode = '42501';
  end if;

  update tesisreserva.reviews
     set owner_reply = trim(p_reply), owner_replied_at = now()
   where id = p_review_id
   returning * into v_rev;

  insert into tesisreserva.notifications (user_id, title, body, type, reference_id)
  values (v_rev.client_id, 'Respondieron tu reseña',
          v_biz.name || ' respondió a tu reseña.', 'review_reply', v_rev.id);

  return v_rev;
end;
$$;

-- ---------------------------------------------------------------------------
--  Estadísticas del dashboard del dueño (calculadas, nada duplicado)
-- ---------------------------------------------------------------------------
create or replace function tesisreserva.business_stats(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = tesisreserva, public
as $$
declare
  v_result jsonb;
begin
  if not (tesisreserva.is_business_owner(p_business_id) or tesisreserva.is_admin()) then
    raise exception 'No tenés permiso sobre este negocio.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'today_count', (
      select count(*) from tesisreserva.reservations
      where business_id = p_business_id and reservation_date = tesisreserva.hoy()
        and status in ('pending', 'confirmed', 'completed')
    ),
    'pending_count', (
      select count(*) from tesisreserva.reservations
      where business_id = p_business_id and status = 'pending'
        and reservation_date >= tesisreserva.hoy()
    ),
    'confirmed_count', (
      select count(*) from tesisreserva.reservations
      where business_id = p_business_id and status = 'confirmed'
        and reservation_date >= tesisreserva.hoy()
    ),
    'active_promotions', (
      select count(*) from tesisreserva.promotions
      where business_id = p_business_id and active
        and starts_at <= now() and (unlimited or ends_at is null or ends_at > now())
    ),
    'rating_avg', (
      select round(avg(rating)::numeric, 1) from tesisreserva.reviews
      where business_id = p_business_id and active
    ),
    'reviews_count', (
      select count(*) from tesisreserva.reviews
      where business_id = p_business_id and active
    ),
    'rating_breakdown', (
      select coalesce(jsonb_object_agg(rating::text, c), '{}'::jsonb)
      from (
        select rating, count(*)::int as c
        from tesisreserva.reviews
        where business_id = p_business_id and active
        group by rating
      ) b
    ),
    'week_bars', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', d.dow, 'count', d.c) order by d.dow), '[]'::jsonb)
      from (
        select g.dow,
               (select count(*) from tesisreserva.reservations r
                 where r.business_id = p_business_id
                   and r.status in ('pending', 'confirmed', 'completed')
                   and r.reservation_date >= tesisreserva.hoy() - interval '28 days'
                   and extract(dow from r.reservation_date)::int = g.dow)::int as c
        from generate_series(0, 6) as g(dow)
      ) d
    ),
    'peak_hour', (
      select to_char(reservation_time, 'HH24:MI')
      from tesisreserva.reservations
      where business_id = p_business_id
        and status in ('pending', 'confirmed', 'completed')
        and reservation_date >= tesisreserva.hoy() - interval '60 days'
      group by reservation_time
      order by count(*) desc, reservation_time
      limit 1
    ),
    'total_reservations', (
      select count(*) from tesisreserva.reservations where business_id = p_business_id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
--  Recomendaciones para el cliente (reglas simples, sin IA externa)
--  1) categorías que el cliente ya reservó   2) mejor puntuados
-- ---------------------------------------------------------------------------
create or replace function tesisreserva.recommended_businesses(p_limit int default 4)
returns table (
  business_id uuid,
  reason      text
)
language sql
stable
security definer
set search_path = tesisreserva, public
as $$
  with fav as (
    select b.category_id, count(*) as n
    from tesisreserva.reservations r
    join tesisreserva.businesses b on b.id = r.business_id
    where r.client_id = auth.uid()
    group by b.category_id
  ),
  scored as (
    select
      b.id,
      case when f.category_id is not null
           then 'Porque ya reservaste en esta categoría'
           else 'Muy bien valorado cerca tuyo'
      end as reason,
      coalesce(f.n, 0)                                                   as fav_score,
      coalesce((select avg(rv.rating) from tesisreserva.reviews rv
                where rv.business_id = b.id and rv.active), 0)           as rating
    from tesisreserva.businesses b
    left join fav f on f.category_id = b.category_id
    where b.active
      and b.owner_id is distinct from auth.uid()
      and not exists (
        select 1 from tesisreserva.reservations r2
        where r2.business_id = b.id
          and r2.client_id = auth.uid()
          and r2.reservation_date >= tesisreserva.hoy()
          and r2.status in ('pending', 'confirmed')
      )
  )
  select id, reason
  from scored
  order by fav_score desc, rating desc, random()
  limit greatest(p_limit, 1);
$$;

-- ---------------------------------------------------------------------------
--  Alta automática del profile al registrarse (patrón de la instancia)
--  Sólo actúa para usuarios de ESTA app (metadata app = 'tesisreserva').
--  Nunca puede romper el signup de los otros proyectos del servidor.
-- ---------------------------------------------------------------------------
create or replace function tesisreserva.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = tesisreserva, public
as $$
declare
  v_role text;
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'tesisreserva' then
    return new;
  end if;

  v_role := coalesce(new.raw_user_meta_data ->> 'role', 'client');
  if v_role not in ('client', 'owner') then
    v_role := 'client';   -- nadie se auto-asigna admin desde el frontend
  end if;

  insert into tesisreserva.profiles (id, full_name, email, phone, city, role, is_owner)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    coalesce(nullif(new.raw_user_meta_data ->> 'city', ''), 'Asunción'),
    v_role,
    -- Quien se registra como dueño arranca con el modo negocio ya activado.
    -- Quien se registra como cliente puede activarlo después sin otra cuenta.
    v_role = 'owner'
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Defensivo: la instancia de auth es compartida, jamás debe fallar el signup.
    raise warning 'tesisreserva.handle_new_user: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_tesisreserva on auth.users;
create trigger on_auth_user_created_tesisreserva
  after insert on auth.users
  for each row execute function tesisreserva.handle_new_user();

-- ============================================================================
--  GRANTS  (mínimos necesarios · el filtrado real lo hace RLS)
-- ============================================================================

-- IMPORTANTE: Supabase trae ALTER DEFAULT PRIVILEGES globales que le dan ALL
-- (incluido DELETE y TRUNCATE) a anon/authenticated sobre cada tabla nueva.
-- TRUNCATE NO respeta RLS, así que primero revocamos todo y después
-- concedemos únicamente lo mínimo necesario.
revoke all on all tables    in schema tesisreserva from anon, authenticated;
revoke all on all sequences in schema tesisreserva from anon, authenticated;
revoke all on all functions in schema tesisreserva from anon, authenticated;

grant usage on schema tesisreserva to anon, authenticated;

-- Helpers usados dentro de las políticas: sin EXECUTE, cualquier consulta
-- sobre las tablas protegidas fallaría con "permission denied".
grant execute on function tesisreserva.current_profile_role()          to anon, authenticated;
grant execute on function tesisreserva.is_admin()                      to anon, authenticated;
grant execute on function tesisreserva.is_business_owner(uuid)         to anon, authenticated;
grant execute on function tesisreserva.is_owner_account()              to anon, authenticated;

-- Lectura pública (catálogo del marketplace)
grant select on tesisreserva.business_categories  to anon, authenticated;
grant select on tesisreserva.businesses           to anon, authenticated;
grant select on tesisreserva.business_hours       to anon, authenticated;
grant select on tesisreserva.business_hour_slots  to anon, authenticated;
grant select on tesisreserva.business_capacity    to anon, authenticated;
grant select on tesisreserva.catalog_categories   to anon, authenticated;
grant select on tesisreserva.catalog_items        to anon, authenticated;
grant select on tesisreserva.promotions           to anon, authenticated;
grant select on tesisreserva.reviews              to anon, authenticated;

-- `anon` NO ve profiles, reservas, pagos ni notificaciones.
grant select, insert, update on tesisreserva.profiles to authenticated;

grant insert, update, delete on tesisreserva.businesses          to authenticated;
grant insert, update, delete on tesisreserva.business_hours      to authenticated;
grant insert, update, delete on tesisreserva.business_hour_slots to authenticated;
grant insert, update, delete on tesisreserva.business_capacity   to authenticated;
grant insert, update, delete on tesisreserva.catalog_categories  to authenticated;
grant insert, update, delete on tesisreserva.catalog_items       to authenticated;
grant insert, update, delete on tesisreserva.promotions          to authenticated;

grant select, insert, update on tesisreserva.reservations               to authenticated;
grant select, insert         on tesisreserva.reservation_status_history to authenticated;
grant insert, update         on tesisreserva.reviews                    to authenticated;
grant select                 on tesisreserva.reservation_payments       to authenticated;
grant select, update         on tesisreserva.notifications              to authenticated;

-- RPC
grant execute on function tesisreserva.get_availability(uuid, date, int)                        to anon, authenticated;
grant execute on function tesisreserva.create_reservation(uuid, date, time, int, uuid, text, date, text) to authenticated;
grant execute on function tesisreserva.set_reservation_status(uuid, text, text)                 to authenticated;
grant execute on function tesisreserva.reply_to_review(uuid, text)                              to authenticated;
grant execute on function tesisreserva.become_owner()                                          to authenticated;
grant execute on function tesisreserva.business_stats(uuid)                                     to authenticated;
grant execute on function tesisreserva.get_stay_availability(uuid, date, date)                  to anon, authenticated;
grant execute on function tesisreserva.recommended_businesses(int)                              to authenticated;

-- Las secuencias las manejan los defaults de las tablas (gen_random_uuid),
-- así que anon/authenticated no necesitan permisos sobre ellas.

-- Nota: los ALTER DEFAULT PRIVILEGES globales de Supabase vuelven a dar ALL
-- sobre cualquier tabla NUEVA de este schema. Si agregás tablas más adelante,
-- volvé a correr esta migración (es idempotente) para reajustar los permisos.

-- ============================================================================
--  STORAGE  (buckets propios de la app + políticas por dueño)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('tesisreserva-businesses', 'tesisreserva-businesses', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('tesisreserva-avatars', 'tesisreserva-avatars', true)
on conflict (id) do nothing;

-- Comprobantes de seña. PRIVADO a propósito: un comprobante de transferencia
-- muestra número de cuenta, titular y monto. En un bucket público cualquiera
-- con la URL lo vería, y esas URLs viajan por notificaciones y capturas.
insert into storage.buckets (id, name, public)
values ('tesisreserva-comprobantes', 'tesisreserva-comprobantes', false)
on conflict (id) do nothing;

-- La carpeta es el id del CLIENTE, no el de la reserva. Es a propósito: el
-- comprobante se sube antes de crear la reserva (si no, habría que crearla
-- primero y después subir, y una subida fallida dejaría reservas sin
-- comprobante justo cuando el comprobante es obligatorio).
drop policy if exists tesisreserva_proof_read   on storage.objects;
drop policy if exists tesisreserva_proof_write  on storage.objects;
drop policy if exists tesisreserva_proof_update on storage.objects;

create policy tesisreserva_proof_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tesisreserva-comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy tesisreserva_proof_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tesisreserva-comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lo ve quien lo subió, y el dueño del local únicamente si ese archivo está
-- efectivamente adjuntado a una reserva suya.
create policy tesisreserva_proof_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tesisreserva-comprobantes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from tesisreserva.reservations r
        where r.deposit_proof_url = storage.objects.name
          and tesisreserva.is_business_owner(r.business_id)
      )
    )
  );

-- Lectura pública de los buckets de imágenes (los comprobantes NO entran acá)
drop policy if exists tesisreserva_public_read on storage.objects;
create policy tesisreserva_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('tesisreserva-businesses', 'tesisreserva-avatars'));

-- Negocios: la ruta debe ser  <business_id>/<archivo>  y el usuario ser su dueño.
drop policy if exists tesisreserva_business_write  on storage.objects;
drop policy if exists tesisreserva_business_update on storage.objects;
drop policy if exists tesisreserva_business_delete on storage.objects;

create policy tesisreserva_business_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tesisreserva-businesses'
    and tesisreserva.is_business_owner(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy tesisreserva_business_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tesisreserva-businesses'
    and tesisreserva.is_business_owner(nullif((storage.foldername(name))[1], '')::uuid)
  )
  with check (
    bucket_id = 'tesisreserva-businesses'
    and tesisreserva.is_business_owner(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy tesisreserva_business_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tesisreserva-businesses'
    and tesisreserva.is_business_owner(nullif((storage.foldername(name))[1], '')::uuid)
  );

-- Avatares: la ruta debe ser  <user_id>/<archivo>
drop policy if exists tesisreserva_avatar_write  on storage.objects;
drop policy if exists tesisreserva_avatar_update on storage.objects;
drop policy if exists tesisreserva_avatar_delete on storage.objects;

create policy tesisreserva_avatar_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tesisreserva-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy tesisreserva_avatar_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tesisreserva-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'tesisreserva-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy tesisreserva_avatar_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tesisreserva-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
--  VISTA PÚBLICA DE AUTORES DE RESEÑAS
--
--  Las reseñas son públicas, pero `profiles` no: la política sólo deja leer
--  el perfil propio (y el dueño, el de sus clientes). Sin esto, un cliente
--  que mira las reseñas de otro recibe null y la UI muestra "Cliente".
--
--  Exponer `profiles` entero filtraría email y teléfono, así que se publica
--  una vista con SÓLO nombre y avatar, y únicamente de quienes efectivamente
--  publicaron una reseña visible.
-- ============================================================================

create or replace view tesisreserva.review_authors as
select
  p.id,
  p.full_name,
  p.avatar_url
from tesisreserva.profiles p
where exists (
  select 1
  from tesisreserva.reviews r
  join tesisreserva.businesses b on b.id = r.business_id
  where r.client_id = p.id
    and r.active
    and b.active
);

-- La vista corre con los permisos de su dueño (security_invoker = false, el
-- default), que es justamente lo que la deja saltar la RLS de `profiles`
-- limitándose a las columnas de arriba.
alter view tesisreserva.review_authors set (security_invoker = false);

-- OJO: los ALTER DEFAULT PRIVILEGES globales de Supabase también alcanzan a
-- las vistas nuevas. Esta vista es auto-actualizable y corre con permisos de
-- su dueño, así que dejar INSERT/UPDATE/DELETE sería un camino para escribir
-- en `profiles` salteando RLS. Revocamos todo y damos sólo lectura.
revoke all on tesisreserva.review_authors from anon, authenticated;
grant select on tesisreserva.review_authors to anon, authenticated;

-- ============================================================================
--  RECARGA DEL CACHÉ DE POSTGREST
-- ============================================================================

-- PostgREST guarda en memoria las tablas, columnas, relaciones y funciones que
-- expone, y NO se entera solo de los cambios de esquema. Sin este aviso, una
-- función recién creada responde "Could not find the function ... in the schema
-- cache" aunque exista en la base, y una foreign key nueva rompe los embeds.
--
-- Va al final de la migración a propósito: así viaja con el SQL y lo recibe
-- cualquiera que lo aplique, sin depender de acordarse de hacerlo aparte.
-- ============================================================================
--  CATEGORIAS DEL CATALOGO
-- ============================================================================

-- Las categorías son globales (sólo un admin las administra) y definen con qué
-- lógica reserva cada rubro. `sugerido` es lo que el onboarding propone: el
-- dueño lo ve ya elegido y no tiene que entender los tipos internos.
insert into tesisreserva.business_categories (name, slug) values
  ('Lavaderos',     'lavaderos'),
  ('Peluquerías',   'peluquerias'),
  ('Restaurantes',  'restaurantes'),
  ('Hospedajes',    'hospedajes'),
  ('Spa de uñas',   'spa-de-unas')
on conflict (slug) do update set name = excluded.name;

notify pgrst, 'reload schema';
