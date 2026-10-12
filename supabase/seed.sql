-- ============================================================================
--  Datos de ejemplo del schema `tesisreserva`
--  ---------------------------------------------------------------------------
--  Negocios demo repartidos por los cinco rubros y por los barrios de Ñemby,
--  que es la ciudad que delimita el trabajo. Cada uno está en un barrio y una
--  calle reales (tomados de OpenStreetMap), y separados entre sí a propósito:
--  sirve para ver funcionando el filtro de "cerca mío" del mapa, que con
--  todos los pines en la misma cuadra no se podría probar.
--
--  Está escrito con listas y bucles, no con un bloque por negocio: agregar
--  otro local es sumar una fila, y así el seed no se vuelve impagable a medida
--  que crece.
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
-- Categorías: son las cinco del producto y no dependen de ningún usuario.
-- ---------------------------------------------------------------------------
insert into tesisreserva.business_categories (name, slug, icon, sort_order, active) values
  ('Lavaderos',    'lavaderos',    'car',      1, true),
  ('Peluquerías',  'peluquerias',  'scissors', 2, true),
  ('Restaurantes', 'restaurantes', 'utensils', 3, true),
  ('Hospedajes',   'hospedajes',   'bed',      4, true),
  ('Spa de uñas',  'spa-de-unas',  'sparkles', 5, true)
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
  r        record;
  v_biz    uuid;
  v_hour   uuid;
  v_cat    uuid;
  v_tipo   text;
  v_dur    int;
  v_paso   int;
  d        int;
  v_slugs  text[];
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

  insert into tesisreserva.profiles (id, full_name, email, role, city, is_owner)
  values (v_owner, 'Dueño Demo', 'demo.owner@tesisreserva.py', 'owner', 'Ñemby', true)
  on conflict (id) do update set role = 'owner', is_owner = true;

  -- ======================= negocios =======================
  -- El rubro define solo cómo se reserva (turno, mesa, servicio o noches) y
  -- cuánto dura: es la misma tabla que usa la app en src/lib/rubros.ts, así
  -- que los datos de ejemplo no pueden quedar en otra cosa que el producto.
  for r in
    select * from (values
      -- slug, nombre, rubro, descripción, dirección, barrio, ciudad, lat, lng,
      -- teléfono, seña, monto, por persona, día cerrado (-1 = ninguno),
      -- abre, cierra, turno partido
      ('la-cabana', 'La Cabaña', 'restaurantes',
       'Parrilla y cocina paraguaya en un quincho de madera. Cortes premium, ambiente familiar y música en vivo los viernes.',
       '9 de Agosto 1240', 'Centro', 'Ñemby', -25.39336, -57.5464,
       '+595 21 600 100', true, 50000, true, 1, '11:30', '23:00', true),

      ('lupe-cafe', 'Lupe Café', 'restaurantes',
       'Café de especialidad, brunch de fin de semana y pastelería propia.',
       'Bernardino Caballero 856', 'San Carlos', 'Ñemby', -25.3878, -57.5421,
       '+595 21 600 200', false, 0, false, -1, '08:00', '20:00', false),

      ('bocatto-trattoria', 'Bocatto Trattoria', 'restaurantes',
       'Pastas caseras y pizza a la piedra. Carta de vinos y mesas en el patio.',
       'Moises Bertoni 780', 'Pa''i Ñu', 'Ñemby', -25.37742, -57.5442,
       '+595 21 600 500', true, 40000, false, 1, '11:30', '23:00', true),

      ('marisqueria-costanera', 'Marisquería del Sur', 'restaurantes',
       'Pescados de río y mariscos frescos, en un salón familiar con patio.',
       'Padre Trujillo 215', 'Pa''i Ñu', 'Ñemby', -25.3681, -57.5486,
       '+595 21 600 600', true, 60000, true, 1, '11:00', '22:30', false),

      ('sushi-nu', 'Sushi Ñu', 'restaurantes',
       'Barra de sushi y rolls de autor. Pedidos para llevar y salón chico.',
       'Toribio Pereira 340', 'Los Naranjos', 'Ñemby', -25.3985, -57.5406,
       '+595 21 600 700', false, 0, false, 0, '18:00', '23:30', false),

      ('barberia-el-prado', 'Barbería El Prado', 'peluquerias',
       'Cortes clásicos y modernos, afeitado a navaja y atención con turno puntual.',
       'Acceso Sur 450', 'Los Naranjos', 'Ñemby', -25.39498, -57.54411,
       '+595 21 600 300', false, 0, false, 0, '09:00', '19:00', false),

      ('studio-kuna', 'Studio Kuña', 'peluquerias',
       'Color, alisados y peinados para eventos. Turnos de mañana y tarde.',
       'Luis A. del Paraná 1120', 'Villa Anita', 'Ñemby', -25.37, -57.5643,
       '+595 21 600 800', true, 30000, false, 0, '09:00', '20:00', false),

      ('barberia-guarani', 'Barbería Guaraní', 'peluquerias',
       'Barbería de barrio, atención rápida y precios accesibles.',
       '16 de Agosto 640', '3 de Mayo', 'Ñemby', -25.4091, -57.5439,
       '+595 21 600 900', false, 0, false, 0, '08:30', '19:00', false),

      ('aqua-spa-wellness', 'Aqua Spa & Wellness', 'spa-de-unas',
       'Manicura, pedicura, esmaltado semipermanente y tratamientos de manos.',
       'Santa Cecilia 1500', 'Mbokajaty', 'Ñemby', -25.3838, -57.5615,
       '+595 21 600 400', true, 100000, false, 1, '10:00', '20:00', false),

      ('nails-ysapy', 'Nails Studio Ysapy', 'spa-de-unas',
       'Uñas esculpidas, kapping y nail art. Trabajamos con turno reservado.',
       'Teniente Zacarías Rivas 470', 'Vista Alegre', 'Ñemby', -25.4033, -57.5455,
       '+595 21 601 000', true, 40000, false, 0, '09:00', '19:00', false),

      ('bella-unas', 'Bella Uñas', 'spa-de-unas',
       'Semipermanente, pedicura spa y retirado de gel.',
       '1 de Mayo 1180', 'Pa''i Ñu', 'Ñemby', -25.37562, -57.54629,
       '+595 21 601 100', false, 0, false, 0, '09:00', '18:30', false),

      ('lavadero-autolimpio', 'Lavadero Autolimpio', 'lavaderos',
       'Lavado completo, encerado y limpieza de tapizados. Sala de espera con wifi.',
       'Coronel San Patricio 2300', 'Caaguazú', 'Ñemby', -25.4085, -57.5277,
       '+595 21 601 200', false, 0, false, 0, '07:30', '18:00', false),

      ('full-wash-luque', 'Full Wash', 'lavaderos',
       'Lavado a mano y pulido de faros. Atención mientras esperás.',
       'De la Victoria 410', 'Rincón', 'Ñemby', -25.3921, -57.5251,
       '+595 21 601 300', false, 0, false, -1, '07:00', '19:00', false),

      ('cabanas-del-lago', 'Cabañas Cañadita', 'hospedajes',
       'Cabañas de madera rodeadas de verde, con parrilla y desayuno incluido.',
       'Eusebio Pintos 950', 'Cañadita', 'Ñemby', -25.42825, -57.5283,
       '+595 21 601 400', true, 150000, false, -1, '08:00', '20:00', false),

      ('posada-del-rio', 'Posada del Río', 'hospedajes',
       'Posada familiar con pileta y estacionamiento. A diez minutos del centro.',
       'La Lomita 950', 'Rincón', 'Ñemby', -25.3939, -57.52759,
       '+595 21 601 500', true, 100000, false, -1, '08:00', '21:00', false),

      ('hotel-estacion-central', 'Hotel Ñemby Central', 'hospedajes',
       'Hotel céntrico a pocas cuadras de la plaza. Desayuno buffet y cochera.',
       'Capitán Juan Genaro Lafranconi 620', 'San Carlos', 'Ñemby', -25.39255, -57.54431,
       '+595 21 601 600', true, 120000, false, -1, '00:00', '23:59', false)
    ) as t(slug, nombre, rubro, descripcion, direccion, barrio, ciudad, lat, lng,
           tel, sena, monto, por_persona, cerrado, abre, cierra, partido)
  loop
    -- El rubro manda: mismos valores que rubroDe() en el frontend.
    select case r.rubro
             when 'restaurantes' then 'table'
             when 'hospedajes'   then 'stay'
             when 'spa-de-unas'  then 'service'
             else 'slot'
           end,
           case r.rubro
             when 'restaurantes' then 90
             when 'peluquerias'  then 45
             when 'spa-de-unas'  then 45
             else 60
           end,
           case r.rubro
             when 'restaurantes' then 30
             when 'hospedajes'   then 60
             else 15
           end
      into v_tipo, v_dur, v_paso;

    insert into tesisreserva.businesses
      (owner_id, category_id, name, slug, description, address, neighborhood, city,
       latitude, longitude, phone, whatsapp, active,
       deposit_enabled, deposit_amount, deposit_per_person,
       deposit_bank_name, deposit_account_holder, deposit_account_number,
       reservation_type, default_slot_duration_minutes, slot_step_minutes,
       max_concurrent_reservations)
    select v_owner,
           (select id from tesisreserva.business_categories where slug = r.rubro),
           r.nombre, r.slug, r.descripcion, r.direccion, r.barrio, r.ciudad,
           r.lat, r.lng, r.tel, r.tel, true,
           r.sena, r.monto, r.por_persona,
           -- Sin cuenta cargada el cliente ve el monto y no tiene dónde
           -- transferirlo, así que los que piden seña la traen completa.
           case when r.sena then 'Banco Continental' end,
           case when r.sena then r.nombre || ' SRL' end,
           case when r.sena then '44' || lpad((abs(hashtext(r.slug)) % 100000000)::text, 8, '0') end,
           v_tipo, v_dur, v_paso,
           case when v_tipo in ('slot', 'service') then 3 else 1 end
    on conflict (slug) do update set
      owner_id                      = excluded.owner_id,
      category_id                   = excluded.category_id,
      name                          = excluded.name,
      description                   = excluded.description,
      address                       = excluded.address,
      neighborhood                  = excluded.neighborhood,
      city                          = excluded.city,
      latitude                      = excluded.latitude,
      longitude                     = excluded.longitude,
      phone                         = excluded.phone,
      whatsapp                      = excluded.whatsapp,
      deposit_enabled               = excluded.deposit_enabled,
      deposit_amount                = excluded.deposit_amount,
      deposit_per_person            = excluded.deposit_per_person,
      deposit_bank_name             = excluded.deposit_bank_name,
      deposit_account_holder        = excluded.deposit_account_holder,
      deposit_account_number        = excluded.deposit_account_number,
      reservation_type              = excluded.reservation_type,
      default_slot_duration_minutes = excluded.default_slot_duration_minutes,
      slot_step_minutes             = excluded.slot_step_minutes,
      max_concurrent_reservations   = excluded.max_concurrent_reservations,
      active                        = true;

    select id into v_biz from tesisreserva.businesses where slug = r.slug;
    v_slugs := coalesce(v_slugs, '{}') || r.slug;

    -- ---- horarios ----
    foreach d in array array[0,1,2,3,4,5,6] loop
      insert into tesisreserva.business_hours (business_id, day_of_week, enabled)
      values (v_biz, d, d <> r.cerrado)
      on conflict (business_id, day_of_week) do update set enabled = excluded.enabled
      returning id into v_hour;

      delete from tesisreserva.business_hour_slots where business_hour_id = v_hour;
      if d = r.cerrado then
        continue;
      end if;

      if r.partido then
        -- Turno partido: el mediodía y la noche, como cualquier parrilla.
        insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
        values (v_hour, r.abre::time, '15:00', 1),
               (v_hour, '19:00', r.cierra::time, 2);
      else
        insert into tesisreserva.business_hour_slots (business_hour_id, opens_at, closes_at, sort_order)
        values (v_hour, r.abre::time, r.cierra::time, 1);
      end if;
    end loop;
  end loop;

  -- ======================= mesas =======================
  delete from tesisreserva.business_capacity
   where business_id in (select id from tesisreserva.businesses where slug = any(v_slugs));

  for r in
    select * from (values
      ('la-cabana', 2, 6), ('la-cabana', 4, 5), ('la-cabana', 6, 2), ('la-cabana', 8, 1),
      ('lupe-cafe', 2, 8), ('lupe-cafe', 4, 4), ('lupe-cafe', 6, 2),
      ('bocatto-trattoria', 2, 5), ('bocatto-trattoria', 4, 6), ('bocatto-trattoria', 6, 3),
      ('marisqueria-costanera', 2, 4), ('marisqueria-costanera', 4, 6), ('marisqueria-costanera', 8, 2),
      ('sushi-nu', 2, 6), ('sushi-nu', 4, 3)
    ) as t(negocio, tamano, cantidad)
  loop
    insert into tesisreserva.business_capacity (business_id, party_size, quantity, active)
    select id, r.tamano, r.cantidad, true
      from tesisreserva.businesses where slug = r.negocio
    on conflict (business_id, party_size) do update
      set quantity = excluded.quantity, active = true;
  end loop;

  -- ======================= carta, servicios y alojamientos =======================
  -- Lo que alguien ya reservó no se borra: se perdería con qué se hizo esa
  -- reserva. Se apaga, así tampoco aparece duplicado en la carta nueva.
  update tesisreserva.catalog_items i set active = false
   where i.business_id in (select id from tesisreserva.businesses where slug = any(v_slugs))
     and exists (select 1 from tesisreserva.reservations x where x.catalog_item_id = i.id);

  delete from tesisreserva.catalog_items i
   where i.business_id in (select id from tesisreserva.businesses where slug = any(v_slugs))
     and not exists (select 1 from tesisreserva.reservations x where x.catalog_item_id = i.id);

  delete from tesisreserva.catalog_categories c
   where c.business_id in (select id from tesisreserva.businesses where slug = any(v_slugs))
     and not exists (select 1 from tesisreserva.catalog_items i where i.category_id = c.id);

  for r in
    select * from (values
      -- negocio, grupo, nombre, precio, tipo, minutos, capacidad, unidades
      ('la-cabana', 'Entradas', 'Provoleta a las brasas', 45000, 'product', null, null, null),
      ('la-cabana', 'Parrilla', 'Bife de chorizo', 85000, 'product', null, null, null),
      ('la-cabana', 'Parrilla', 'Costilla al horno de barro', 95000, 'product', null, null, null),
      ('la-cabana', 'Pescados', 'Surubí a la parrilla', 95000, 'product', null, null, null),
      ('la-cabana', 'Postres', 'Flan casero con dulce', 25000, 'product', null, null, null),

      ('lupe-cafe', 'Café', 'Flat white', 22000, 'product', null, null, null),
      ('lupe-cafe', 'Café', 'Cold brew', 25000, 'product', null, null, null),
      ('lupe-cafe', 'Brunch', 'Brunch Lupe', 65000, 'product', null, null, null),
      ('lupe-cafe', 'Pastelería', 'Cheesecake de maracuyá', 28000, 'product', null, null, null),

      ('bocatto-trattoria', 'Pastas', 'Sorrentinos de jamón y queso', 72000, 'product', null, null, null),
      ('bocatto-trattoria', 'Pastas', 'Ñoquis con estofado', 65000, 'product', null, null, null),
      ('bocatto-trattoria', 'Pizzas', 'Pizza margarita a la piedra', 58000, 'product', null, null, null),
      ('bocatto-trattoria', 'Postres', 'Tiramisú', 32000, 'product', null, null, null),

      ('marisqueria-costanera', 'Entradas', 'Ceviche de surubí', 68000, 'product', null, null, null),
      ('marisqueria-costanera', 'Principales', 'Paella de mariscos', 145000, 'product', null, null, null),
      ('marisqueria-costanera', 'Principales', 'Dorado a la plancha', 98000, 'product', null, null, null),

      ('sushi-nu', 'Rolls', 'Roll Ñu (10 piezas)', 75000, 'product', null, null, null),
      ('sushi-nu', 'Rolls', 'Tabla mixta (24 piezas)', 165000, 'product', null, null, null),
      ('sushi-nu', 'Entradas', 'Gyozas de cerdo', 42000, 'product', null, null, null),

      ('barberia-el-prado', 'Servicios', 'Corte clásico', 60000, 'service', 45, null, null),
      ('barberia-el-prado', 'Servicios', 'Corte + barba', 90000, 'service', 60, null, null),
      ('barberia-el-prado', 'Servicios', 'Afeitado a navaja', 50000, 'service', 30, null, null),

      ('studio-kuna', 'Servicios', 'Corte y brushing', 90000, 'service', 60, null, null),
      ('studio-kuna', 'Servicios', 'Color completo', 250000, 'service', 120, null, null),
      ('studio-kuna', 'Servicios', 'Peinado para evento', 150000, 'service', 60, null, null),

      ('barberia-guarani', 'Servicios', 'Corte de pelo', 40000, 'service', 30, null, null),
      ('barberia-guarani', 'Servicios', 'Corte y barba', 60000, 'service', 45, null, null),

      ('aqua-spa-wellness', 'Servicios', 'Semipermanente en manos', 120000, 'service', 60, null, null),
      ('aqua-spa-wellness', 'Servicios', 'Pedicura spa', 140000, 'service', 60, null, null),
      ('aqua-spa-wellness', 'Servicios', 'Manicura rusa', 130000, 'service', 60, null, null),

      ('nails-ysapy', 'Servicios', 'Uñas esculpidas', 180000, 'service', 90, null, null),
      ('nails-ysapy', 'Servicios', 'Kapping en gel', 150000, 'service', 75, null, null),
      ('nails-ysapy', 'Servicios', 'Nail art por uña', 15000, 'service', 15, null, null),

      ('bella-unas', 'Servicios', 'Esmaltado semipermanente', 90000, 'service', 45, null, null),
      ('bella-unas', 'Servicios', 'Retirado de gel', 45000, 'service', 30, null, null),

      ('lavadero-autolimpio', 'Servicios', 'Lavado completo', 60000, 'service', 60, null, null),
      ('lavadero-autolimpio', 'Servicios', 'Lavado + encerado', 110000, 'service', 90, null, null),
      ('lavadero-autolimpio', 'Servicios', 'Limpieza de tapizados', 180000, 'service', 120, null, null),

      ('full-wash-luque', 'Servicios', 'Lavado a mano', 55000, 'service', 60, null, null),
      ('full-wash-luque', 'Servicios', 'Pulido de faros', 90000, 'service', 60, null, null),

      -- Los alojamientos llevan capacidad y cuántas unidades iguales hay.
      ('cabanas-del-lago', 'Alojamientos', 'Cabaña con galería', 350000, 'room', null, 4, 2),
      ('cabanas-del-lago', 'Alojamientos', 'Cabaña familiar', 500000, 'room', null, 6, 1),
      ('cabanas-del-lago', 'Alojamientos', 'Habitación doble', 220000, 'room', null, 2, 3),

      ('posada-del-rio', 'Alojamientos', 'Habitación matrimonial', 180000, 'room', null, 2, 4),
      ('posada-del-rio', 'Alojamientos', 'Habitación cuádruple', 280000, 'room', null, 4, 2),

      ('hotel-estacion-central', 'Alojamientos', 'Single ejecutiva', 210000, 'room', null, 1, 6),
      ('hotel-estacion-central', 'Alojamientos', 'Doble estándar', 280000, 'room', null, 2, 8),
      ('hotel-estacion-central', 'Alojamientos', 'Suite con living', 450000, 'room', null, 3, 2)
    ) as t(negocio, grupo, nombre, precio, tipo, minutos, capacidad, unidades)
  loop
    select id into v_biz from tesisreserva.businesses where slug = r.negocio;
    if v_biz is null then
      continue;
    end if;

    insert into tesisreserva.catalog_categories (business_id, name, sort_order)
    values (v_biz, r.grupo, 1)
    on conflict (business_id, name) do nothing;

    select id into v_cat
      from tesisreserva.catalog_categories
     where business_id = v_biz and name = r.grupo;

    insert into tesisreserva.catalog_items
      (business_id, category_id, name, price, item_type, duration_minutes,
       capacity, units, sort_order)
    values (v_biz, v_cat, r.nombre, r.precio, r.tipo, r.minutos,
            r.capacidad, coalesce(r.unidades, 1), coalesce(r.capacidad, 1));
  end loop;

  -- Descripciones de los alojamientos: son lo que decide al huésped, así que
  -- van cargadas y no en blanco.
  for r in
    select * from (values
      ('Cabaña del Lago', 'Dos dormitorios, parrilla propia y galería con vista al agua.'),
      ('Cabaña familiar', 'Tres dormitorios, cocina equipada y quincho para diez personas.'),
      ('Habitación doble', 'Cama matrimonial, aire acondicionado y desayuno incluido.'),
      ('Habitación matrimonial', 'Aire, frigobar y acceso a la pileta.'),
      ('Habitación cuádruple', 'Dos camas dobles, ideal para familias.'),
      ('Single ejecutiva', 'Escritorio, wifi de fibra y desayuno buffet.'),
      ('Doble estándar', 'Dos camas individuales o una matrimonial, a elección.'),
      ('Suite con living', 'Ambiente separado, bañera y cochera incluida.')
    ) as t(nombre, detalle)
  loop
    update tesisreserva.catalog_items
       set description = r.detalle
     where item_type = 'room' and name = r.nombre and description is null;
  end loop;

  -- ======================= promociones =======================
  delete from tesisreserva.promotions
   where business_id in (select id from tesisreserva.businesses where slug = any(v_slugs));

  for r in
    select * from (values
      ('la-cabana', '2x1 en cortes premium', 'Martes y miércoles, sólo en el salón.', 30),
      ('lupe-cafe', '−20% en brunch', 'Sábados de 9 a 12.', null),
      ('bocatto-trattoria', 'Pasta + copa de vino', 'De lunes a jueves al mediodía.', 20),
      ('aqua-spa-wellness', 'Semipermanente −15%', 'Reservando de martes a jueves.', 15),
      ('nails-ysapy', 'Segunda mano a mitad de precio', 'Para clientas nuevas.', 45),
      ('lavadero-autolimpio', 'Lavado + encerado por ₲ 90.000', 'Hasta fin de mes.', 25),
      ('posada-del-rio', '3 noches al precio de 2', 'De domingo a jueves.', 60),
      ('hotel-estacion-central', 'Desayuno gratis para dos', 'Reservando dos noches seguidas.', null)
    ) as t(negocio, titulo, detalle, dias)
  loop
    insert into tesisreserva.promotions
      (business_id, title, description, starts_at, ends_at, unlimited, active)
    select id, r.titulo, r.detalle,
           now() - interval '3 days',
           case when r.dias is not null then now() + (r.dias || ' days')::interval end,
           r.dias is null, true
      from tesisreserva.businesses where slug = r.negocio;
  end loop;

  -- ======================= perfil del cliente demo =======================
  if v_client is not null then
    insert into tesisreserva.profiles (id, full_name, email, role, city)
    values (v_client, 'Cliente Demo', 'demo.client@tesisreserva.py', 'client', 'Ñemby')
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

  raise notice 'Seed completo: % negocios con horarios, carta y promos.', array_length(v_slugs, 1);
  raise notice 'Faltan las imágenes (npm run db:images) y las reseñas (npm run db:reviewers).';
end;
$seed$;
