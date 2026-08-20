-- ============================================================================
--  Reservá.  —  Datos demo del prototipo  (schema `tesisreserva`)
--
--  Migra a la base los 4 negocios que antes estaban hardcodeados en
--  `App Reservas.dc.html` (const BIZ, carta, revs, days, tables, promos y las
--  coordenadas de reserva-map.js).
--
--  ---------------------------------------------------------------------------
--  IMPORTANTE — usuarios de Auth
--  ---------------------------------------------------------------------------
--  `businesses.owner_id` y `reviews.client_id` apuntan a `auth.users`.
--  Crear usuarios escribiendo directamente en `auth.users` / `auth.identities`
--  es frágil e inseguro (hay que replicar el hashing y el esquema interno de
--  GoTrue). Por eso este seed NO inventa usuarios: los busca por email.
--
--  ANTES de correr el seed, registrá estas dos cuentas DESDE LA APP:
--
--      demo.owner@tesisreserva.py    -> tipo de cuenta: Dueño de negocio
--      demo.client@tesisreserva.py   -> tipo de cuenta: Cliente
--
--  Después:   npm run db:seed
--
--  Si las cuentas no existen todavía, el seed igual carga las categorías y
--  avisa por consola qué falta. Es idempotente: se puede correr varias veces.
-- ============================================================================

set local search_path = tesisreserva, public, extensions;

-- ---------------------------------------------------------------------------
-- Categorías de negocio (no dependen de ningún usuario)
-- ---------------------------------------------------------------------------
insert into tesisreserva.business_categories (name, slug, icon, sort_order, active) values
  ('Restaurante', 'restaurante', 'utensils', 1, true),
  ('Cafetería',   'cafeteria',   'coffee',   2, true),
  ('Barbería',    'barberia',    'scissors', 3, true),
  ('Spa',         'spa',         'sparkles', 4, true)
on conflict (slug) do update
  set name = excluded.name,
      icon = excluded.icon,
      sort_order = excluded.sort_order,
      active = true;

-- ---------------------------------------------------------------------------
-- Negocios demo
-- ---------------------------------------------------------------------------
do $seed$
declare
  v_owner  uuid;
  v_client uuid;

  v_cat_rest uuid;
  v_cat_cafe uuid;
  v_cat_barb uuid;
  v_cat_spa  uuid;

  v_cab   uuid;
  v_lupe  uuid;
  v_prado uuid;
  v_aqua  uuid;

  v_hour uuid;
  v_cat  uuid;
  v_biz  uuid;
  v_rev  uuid;
  d      int;
begin
  select id into v_owner  from auth.users where email = 'demo.owner@tesisreserva.py'  limit 1;
  select id into v_client from auth.users where email = 'demo.client@tesisreserva.py' limit 1;

  if v_owner is null then
    raise notice '--------------------------------------------------------------';
    raise notice ' SEED INCOMPLETO: falta la cuenta demo.owner@tesisreserva.py';
    raise notice ' Registrala desde la app como "Dueño de negocio" y volvé a';
    raise notice ' correr:  npm run db:seed';
    raise notice '--------------------------------------------------------------';
    return;
  end if;

  -- Aseguramos que el profile del owner exista y tenga el role correcto
  insert into tesisreserva.profiles (id, full_name, email, role, city)
  values (v_owner, 'Dueño Demo', 'demo.owner@tesisreserva.py', 'owner', 'Asunción')
  on conflict (id) do update set role = 'owner';

  select id into v_cat_rest from tesisreserva.business_categories where slug = 'restaurante';
  select id into v_cat_cafe from tesisreserva.business_categories where slug = 'cafeteria';
  select id into v_cat_barb from tesisreserva.business_categories where slug = 'barberia';
  select id into v_cat_spa  from tesisreserva.business_categories where slug = 'spa';

  -- ======================= negocios =======================
  insert into tesisreserva.businesses
    (owner_id, category_id, name, slug, description, address, neighborhood, city,
     latitude, longitude, phone, whatsapp, active,
     deposit_enabled, deposit_amount, deposit_per_person,
     reservation_type, default_slot_duration_minutes, slot_step_minutes, max_concurrent_reservations)
  values
    (v_owner, v_cat_rest, 'La Cabaña', 'la-cabana',
     'Parrilla y cocina paraguaya en un quincho de madera. Cortes premium, ambiente familiar y música en vivo los viernes.',
     'Av. Mcal. López 1234', 'Villa Morra', 'Asunción',
     -25.2967, -57.5762, '+595 21 600 100', '+595 981 600100', true,
     true, 50000, true, 'table', 90, 30, 1),

    (v_owner, v_cat_cafe, 'Lupe Café', 'lupe-cafe',
     'Café de especialidad, brunch de fin de semana y pastelería propia.',
     'Av. España 850', 'Carmelitas', 'Asunción',
     -25.2839, -57.5671, '+595 21 600 200', '+595 981 600200', true,
     false, 0, true, 'table', 60, 30, 1),

    (v_owner, v_cat_barb, 'Barbería El Prado', 'barberia-el-prado',
     'Cortes clásicos y modernos, afeitado a navaja y atención con turno puntual.',
     'Palma 450', 'Centro', 'Asunción',
     -25.2864, -57.6369, '+595 21 600 300', '+595 981 600300', true,
     false, 0, false, 'service', 45, 15, 3),

    (v_owner, v_cat_spa, 'Aqua Spa & Wellness', 'aqua-spa-wellness',
     'Masajes, circuito de aguas y tratamientos faciales. Ideal para regalar.',
     'Denis Roa 1500', 'Recoleta', 'Asunción',
     -25.3052, -57.5858, '+595 21 600 400', '+595 981 600400', true,
     true, 100000, false, 'service', 60, 30, 2)
  on conflict (slug) do update set
    owner_id                      = excluded.owner_id,
    category_id                   = excluded.category_id,
    description                   = excluded.description,
    address                       = excluded.address,
    neighborhood                  = excluded.neighborhood,
    latitude                      = excluded.latitude,
    longitude                     = excluded.longitude,
    phone                         = excluded.phone,
    whatsapp                      = excluded.whatsapp,
    deposit_enabled               = excluded.deposit_enabled,
    deposit_amount                = excluded.deposit_amount,
    deposit_per_person            = excluded.deposit_per_person,
    reservation_type              = excluded.reservation_type,
    default_slot_duration_minutes = excluded.default_slot_duration_minutes,
    slot_step_minutes             = excluded.slot_step_minutes,
    max_concurrent_reservations   = excluded.max_concurrent_reservations,
    active                        = true;

  select id into v_cab   from tesisreserva.businesses where slug = 'la-cabana';
  select id into v_lupe  from tesisreserva.businesses where slug = 'lupe-cafe';
  select id into v_prado from tesisreserva.businesses where slug = 'barberia-el-prado';
  select id into v_aqua  from tesisreserva.businesses where slug = 'aqua-spa-wellness';

  -- ======================= horarios =======================
  -- day_of_week: 0=Dom 1=Lun ... 6=Sáb   (igual que extract(dow))
  -- La Cabaña: Lunes cerrado, resto con horario partido (como el prototipo).
  foreach d in array array[0,1,2,3,4,5,6] loop
    insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
    values (v_cab, d, d <> 1)
    on conflict (business_id, day_of_week) do update set enabled = excluded.enabled
    returning id into v_hour;

    delete from tesisreserva.business_hour_slots where business_hour_id = v_hour;

    if d = 1 then
      null;                                     -- lunes cerrado
    elsif d = 0 then                            -- domingo: sólo mediodía
      insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
      values (v_hour, '11:30', '15:00', 1);
    elsif d = 6 then                            -- sábado: corrido
      insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
      values (v_hour, '11:30', '23:59', 1);
    elsif d = 5 then                            -- viernes: cierra más tarde
      insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
      values (v_hour, '11:30', '15:00', 1), (v_hour, '19:00', '23:59', 2);
    else                                        -- mar/mié/jue
      insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
      values (v_hour, '11:30', '15:00', 1), (v_hour, '19:00', '23:00', 2);
    end if;
  end loop;

  -- Lupe Café: todos los días de mañana/tarde
  foreach d in array array[0,1,2,3,4,5,6] loop
    insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
    values (v_lupe, d, true)
    on conflict (business_id, day_of_week) do update set enabled = true
    returning id into v_hour;
    delete from tesisreserva.business_hour_slots where business_hour_id = v_hour;
    insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
    values (v_hour, '08:00', '20:00', 1);
  end loop;

  -- Barbería El Prado: lunes a sábado
  foreach d in array array[0,1,2,3,4,5,6] loop
    insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
    values (v_prado, d, d <> 0)
    on conflict (business_id, day_of_week) do update set enabled = excluded.enabled
    returning id into v_hour;
    delete from tesisreserva.business_hour_slots where business_hour_id = v_hour;
    if d <> 0 then
      insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
      values (v_hour, '09:00', '19:00', 1);
    end if;
  end loop;

  -- Aqua Spa: martes a domingo
  foreach d in array array[0,1,2,3,4,5,6] loop
    insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
    values (v_aqua, d, d <> 1)
    on conflict (business_id, day_of_week) do update set enabled = excluded.enabled
    returning id into v_hour;
    delete from tesisreserva.business_hour_slots where business_hour_id = v_hour;
    if d <> 1 then
      insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
      values (v_hour, '10:00', '20:00', 1);
    end if;
  end loop;

  -- ======================= capacidad =======================
  -- Reemplaza el `tables` hardcodeado: 2->6, 4->5, 6->2, 8->1
  foreach d in array array[2,4,6,8] loop
    insert into tesisreserva.business_capacity (business_id, party_size, quantity, active)
    values (v_cab, d, case d when 2 then 6 when 4 then 5 when 6 then 2 else 1 end, true)
    on conflict (business_id, party_size) do update set quantity = excluded.quantity, active = true;

    insert into tesisreserva.business_capacity (business_id, party_size, quantity, active)
    values (v_lupe, d, case d when 2 then 8 when 4 then 4 when 6 then 2 else 0 end, true)
    on conflict (business_id, party_size) do update set quantity = excluded.quantity, active = true;
  end loop;

  -- ======================= carta / servicios =======================
  -- Se limpia y se vuelve a cargar para que el seed sea idempotente.
  delete from tesisreserva.catalog_items      where business_id in (v_cab, v_lupe, v_prado, v_aqua);
  delete from tesisreserva.catalog_categories where business_id in (v_cab, v_lupe, v_prado, v_aqua);

  -- La Cabaña
  foreach v_biz in array array[v_cab] loop
    insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_biz, 'Entradas', 1);
    insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_biz, 'Parrilla', 2);
    insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_biz, 'Pescados', 3);
    insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_biz, 'Postres',  4);

    select id into v_cat from tesisreserva.catalog_categories where business_id = v_biz and name = 'Parrilla';
    insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
    values (v_biz, v_cat, 'Bife de chorizo', 85000, 'product', 1);

    select id into v_cat from tesisreserva.catalog_categories where business_id = v_biz and name = 'Entradas';
    insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
    values (v_biz, v_cat, 'Provoleta a las brasas', 45000, 'product', 2);

    select id into v_cat from tesisreserva.catalog_categories where business_id = v_biz and name = 'Pescados';
    insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
    values (v_biz, v_cat, 'Surubí a la parrilla', 95000, 'product', 3);

    select id into v_cat from tesisreserva.catalog_categories where business_id = v_biz and name = 'Postres';
    insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
    values (v_biz, v_cat, 'Flan casero con dulce', 25000, 'product', 4);
  end loop;

  -- Lupe Café
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_lupe, 'Café', 1);
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_lupe, 'Brunch', 2);
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_lupe, 'Pastelería', 3);

  select id into v_cat from tesisreserva.catalog_categories where business_id = v_lupe and name = 'Café';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
  values (v_lupe, v_cat, 'Flat white', 22000, 'product', 1);

  select id into v_cat from tesisreserva.catalog_categories where business_id = v_lupe and name = 'Brunch';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
  values (v_lupe, v_cat, 'Brunch Lupe', 65000, 'product', 2);

  select id into v_cat from tesisreserva.catalog_categories where business_id = v_lupe and name = 'Pastelería';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, sort_order)
  values (v_lupe, v_cat, 'Cheesecake de maracuyá', 28000, 'product', 3);

  -- Barbería El Prado (servicios con duración -> definen el turno)
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_prado, 'Servicios', 1);
  select id into v_cat from tesisreserva.catalog_categories where business_id = v_prado and name = 'Servicios';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, duration_minutes, sort_order) values
    (v_prado, v_cat, 'Corte clásico',      60000, 'service', 45, 1),
    (v_prado, v_cat, 'Corte + barba',      90000, 'service', 60, 2),
    (v_prado, v_cat, 'Afeitado a navaja',  50000, 'service', 30, 3);

  -- Aqua Spa
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_aqua, 'Masajes',  1);
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_aqua, 'Spa',      2);
  insert into tesisreserva.catalog_categories (business_id, name, sort_order) values (v_aqua, 'Faciales', 3);

  select id into v_cat from tesisreserva.catalog_categories where business_id = v_aqua and name = 'Masajes';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, duration_minutes, sort_order)
  values (v_aqua, v_cat, 'Masaje relajante 60min', 180000, 'service', 60, 1);

  select id into v_cat from tesisreserva.catalog_categories where business_id = v_aqua and name = 'Spa';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, duration_minutes, sort_order)
  values (v_aqua, v_cat, 'Circuito de aguas', 150000, 'service', 90, 2);

  select id into v_cat from tesisreserva.catalog_categories where business_id = v_aqua and name = 'Faciales';
  insert into tesisreserva.catalog_items (business_id, category_id, name, price, item_type, duration_minutes, sort_order)
  values (v_aqua, v_cat, 'Facial hidratante', 140000, 'service', 60, 3);

  -- ======================= promociones =======================
  delete from tesisreserva.promotions where business_id in (v_cab, v_lupe, v_prado, v_aqua);

  insert into tesisreserva.promotions (business_id, title, description, starts_at, ends_at, unlimited, active) values
    (v_cab,  '2x1 en cortes premium', 'Martes y miércoles · La Cabaña',
     now() - interval '5 days', now() + interval '30 days', false, true),
    (v_lupe, '−20% en brunch', 'Sábados de 9 a 12 · Lupe Café',
     now() - interval '10 days', null, true, true),
    (v_aqua, 'Spa día completo −15%', 'Aqua Spa & Wellness',
     now() - interval '2 days', now() + interval '15 days', false, true);

  -- ======================= perfil del cliente demo =======================
  if v_client is not null then
    insert into tesisreserva.profiles (id, full_name, email, role, city)
    values (v_client, 'Cliente Demo', 'demo.client@tesisreserva.py', 'client', 'Asunción')
    on conflict (id) do nothing;
  end if;

  -- Las reseñas demo NO se cargan acá: cada una necesita su propio autor para
  -- que la pantalla no muestre siempre el mismo nombre, y esos usuarios se dan
  -- de alta con el API de Auth (no escribiendo en auth.users).
  --
  --     npm run db:reviewers
  --
  -- Las imágenes tampoco: van a Supabase Storage con
  --
  --     npm run db:images

  raise notice 'Seed completo: negocios, carta, horarios, capacidad y promos.';
  raise notice 'Faltan las imágenes (npm run db:images) y las reseñas (npm run db:reviewers).';
end;
$seed$;
