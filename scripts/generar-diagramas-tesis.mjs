/**
 * Diagramas del capítulo "Diseño y arquitectura del sistema" de la tesis.
 *
 *   node scripts/generar-diagramas-tesis.mjs   (desde PowerShell: usa Edge)
 *
 * Salen en docs/diagramas/tesis/ como PNG a 2x, en blanco y negro y con
 * Arial, igual que las figuras 1 a 5 del documento:
 *
 *   casos-de-uso        dibujado a mano (Mermaid no tiene casos de uso)
 *   secuencia-cu04      Mermaid
 *   secuencia-cu06      Mermaid
 *   clases              Mermaid
 *   estados             Mermaid
 *   despliegue          dibujado a mano
 *
 * El diagrama entidad-relación sale de `npm run docs:der`, que lee la base.
 *
 * Mermaid se carga desde un archivo local (MERMAID_JS) para no depender de
 * internet al regenerar. Edge primero ejecuta el JavaScript y devuelve el SVG
 * (--dump-dom); después se saca la captura de ese SVG a su tamaño exacto.
 */
import { writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const salida = join(__dirname, '..', 'docs', 'diagramas', 'tesis');
mkdirSync(salida, { recursive: true });

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) throw new Error('Hace falta Microsoft Edge para generar los PNG.');

const MERMAID_JS = process.env.MERMAID_JS;
if (!MERMAID_JS || !existsSync(MERMAID_JS)) {
  throw new Error('Definí MERMAID_JS con la ruta a mermaid.min.js (versión 10).');
}

const ESCALA = 2;
const F = 'Arial, Helvetica, sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ─────────────────────────  Edge  ───────────────────────── */

async function esperarArchivo(ruta) {
  let anterior = -1;
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (!existsSync(ruta)) continue;
    const t = statSync(ruta).size;
    if (t > 0 && t === anterior) return;
    anterior = t;
  }
  throw new Error(`Edge no generó ${ruta}`);
}

async function captura(svg, ancho, alto, nombre) {
  const temporal = mkdtempSync(join(tmpdir(), 'diag-'));
  try {
    const html = join(temporal, 'p.html');
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${svg}</body></html>`);
    const png = join(salida, `${nombre}.png`);
    rmSync(png, { force: true });
    execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', `--user-data-dir=${join(temporal, 'perfil')}`,
      `--force-device-scale-factor=${ESCALA}`, `--window-size=${Math.ceil(ancho)},${Math.ceil(alto)}`,
      `--screenshot=${png}`, pathToFileURL(html).href,
    ], { stdio: 'ignore', timeout: 90_000 });
    await esperarArchivo(png);
    console.log(`  ${nombre}.png  (${Math.ceil(ancho)}×${Math.ceil(alto)})`);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

const TEMA = {
  theme: 'base',
  // Las etiquetas llevan un borde blanco: así se leen aunque crucen una línea.
  themeCSS: '.messageText,.loopText,.labelText,.edgeLabel,.transition-label{paint-order:stroke;stroke:#fff;stroke-width:6px;stroke-linejoin:round} .edgeLabel,.edgeLabel p,.edgeLabel span,.labelBkg{background-color:#fff !important} .edgeLabel rect{opacity:1 !important;fill:#fff !important}',
  themeVariables: {
    fontFamily: F, fontSize: '16px',
    primaryColor: '#ffffff', primaryBorderColor: '#000000', primaryTextColor: '#000000',
    secondaryColor: '#ffffff', tertiaryColor: '#ffffff', lineColor: '#000000', textColor: '#000000',
    mainBkg: '#ffffff', nodeBorder: '#000000', clusterBkg: '#ffffff',
    actorBkg: '#ffffff', actorBorder: '#000000', actorTextColor: '#000000', actorLineColor: '#000000',
    signalColor: '#000000', signalTextColor: '#000000', labelBoxBkgColor: '#ffffff',
    labelBoxBorderColor: '#000000', labelTextColor: '#000000', loopTextColor: '#000000',
    noteBkgColor: '#ffffff', noteBorderColor: '#000000', noteTextColor: '#000000',
    activationBkgColor: '#ffffff', activationBorderColor: '#000000', sequenceNumberColor: '#ffffff',
    classText: '#000000', transitionColor: '#000000', transitionLabelColor: '#000000',
    stateLabelColor: '#000000', stateBkg: '#ffffff', compositeBackground: '#ffffff',
    altBackground: '#ffffff', specialStateColor: '#000000', innerEndBackground: '#000000',
    edgeLabelBackground: '#ffffff',
  },
};

async function mermaid(nombre, codigo, extraConfig = {}) {
  const temporal = mkdtempSync(join(tmpdir(), 'mmd-'));
  try {
    copyFileSync(MERMAID_JS, join(temporal, 'mermaid.min.js'));
    const html = join(temporal, 'm.html');
    const config = { startOnLoad: false, securityLevel: 'loose', ...TEMA, ...extraConfig };
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><script src="mermaid.min.js"></script></head><body><div id="out"></div><script>
      mermaid.initialize(${JSON.stringify(config)});
      mermaid.render('d', ${JSON.stringify(codigo)}).then(({ svg }) => {
        document.getElementById('out').innerHTML = svg;
        document.body.setAttribute('data-listo', '1');
      }).catch((e) => { document.getElementById('out').textContent = 'ERROR ' + e.message; });
    </script></body></html>`);
    const dom = execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${join(temporal, 'perfil')}`, '--allow-file-access-from-files',
      '--virtual-time-budget=20000', '--dump-dom', pathToFileURL(html).href,
    ], { encoding: 'utf8', timeout: 90_000, maxBuffer: 50 * 1024 * 1024 });
    const m = dom.match(/<svg[\s\S]*<\/svg>/);
    if (!m) throw new Error(`Mermaid no devolvió el SVG de ${nombre}: ${dom.slice(0, 400)}`);
    let svg = m[0];
    if (/Syntax error/.test(svg)) throw new Error(`Mermaid: error de sintaxis en ${nombre}`);
    const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
    const ancho = Number(vb[3]) + 0;
    const alto = Number(vb[4]) + 0;
    // Tamaño fijo en píxeles (Mermaid pone max-width y width=100%).
    svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/style="max-width:[^"]*"/, '')
      .replace('<svg', `<svg width="${ancho}" height="${alto}"`);
    writeFileSync(join(salida, `${nombre}.mmd`), codigo);
    await captura(svg, ancho, alto, nombre);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

/* ─────────────────────────  Casos de uso (a mano)  ───────────────────────── */

function casosDeUso() {
  const W = 1500, H = 1135;
  let s = '';
  const linea = (x1, y1, x2, y2, extra = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="2" ${extra}/>`;
  const texto = (x, y, lineas, { size = 17, bold = false, anchor = 'middle' } = {}) =>
    lineas.map((t, i) => `<text x="${x}" y="${y + i * (size + 4)}" font-family="${F}" font-size="${size}" ${bold ? 'font-weight="700"' : ''} text-anchor="${anchor}">${esc(t)}</text>`).join('');

  const RX = 128, RY = 42;
  const cu = {};
  const elipse = (id, x, y, lineas) => {
    cu[id] = { x, y };
    s += `<ellipse cx="${x}" cy="${y}" rx="${RX}" ry="${RY}" fill="#fff" stroke="#000" stroke-width="2"/>`;
    const y0 = y - ((lineas.length - 1) * 21) / 2 + 6;
    s += texto(x, y0, lineas, { size: 16 });
  };
  const actor = (x, y, lineas) => {
    s += `<circle cx="${x}" cy="${y - 62}" r="16" fill="#fff" stroke="#000" stroke-width="2"/>`;
    s += linea(x, y - 46, x, y + 4) + linea(x - 26, y - 30, x + 26, y - 30);
    s += linea(x, y + 4, x - 20, y + 36) + linea(x, y + 4, x + 20, y + 36);
    s += texto(x, y + 62, lineas, { size: 17, bold: true });
  };
  // Punto del borde de la elipse en dirección a (px, py).
  const borde = (id, px, py) => {
    const { x, y } = cu[id];
    const dx = px - x, dy = py - y;
    const k = 1 / Math.sqrt((dx * dx) / (RX * RX) + (dy * dy) / (RY * RY));
    return [x + dx * k, y + dy * k];
  };
  const asociar = (ax, ay, id) => {
    const [bx, by] = borde(id, ax, ay);
    s += linea(ax, ay, bx.toFixed(1), by.toFixed(1));
  };
  const flecha = (x1, y1, x2, y2) => {
    const a = Math.atan2(y2 - y1, x2 - x1), L = 14, an = 0.4;
    const p1 = [x2 - L * Math.cos(a - an), y2 - L * Math.sin(a - an)];
    const p2 = [x2 - L * Math.cos(a + an), y2 - L * Math.sin(a + an)];
    return `<polyline points="${p1.join(',')} ${x2},${y2} ${p2.join(',')}" fill="none" stroke="#000" stroke-width="2"/>`;
  };
  const dependencia = (de, a, etiqueta, { lx = 0, ly = 0 } = {}) => {
    const [x1, y1] = borde(de, cu[a].x, cu[a].y);
    const [x2, y2] = borde(a, cu[de].x, cu[de].y);
    s += linea(x1, y1, x2, y2, 'stroke-dasharray="9 6"') + flecha(x1, y1, x2, y2);
    s += texto((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, [etiqueta], { size: 14 });
  };

  // Límite del sistema
  s += `<rect x="300" y="30" width="920" height="880" rx="10" fill="#fff" stroke="#000" stroke-width="2"/>`;
  s += texto(760, 64, ['Aplicación móvil de reservas'], { size: 19, bold: true });

  // Cliente (columna izquierda). CU03 queda entre las dos reservas que la
  // incluyen y CU06 debajo de las dos que extiende: así las flechas son cortas.
  elipse('CU02', 540, 245, ['CU02 Buscar negocio', 'y consultar servicios']);
  elipse('CU04', 540, 360, ['CU04 Reservar turno']);
  elipse('CU03', 540, 475, ['CU03 Consultar', 'disponibilidad']);
  elipse('CU05', 540, 590, ['CU05 Reservar', 'alojamiento']);
  elipse('CU06', 540, 705, ['CU06 Adjuntar y verificar', 'comprobante de seña']);
  elipse('CU08', 540, 130, ['CU08 Consultar', 'historial y estado']);
  // Administrador y sistema (columna derecha)
  elipse('CU09', 1060, 150, ['CU09 Configurar negocio,', 'servicios y recursos']);
  elipse('CU10', 1060, 275, ['CU10 Gestionar', 'reservas']);
  elipse('CU11', 1080, 690, ['CU11 Vencer solicitudes', 'y liberar recursos']);
  // Compartidos (fila de abajo)
  elipse('CU01', 540, 830, ['CU01 Registrarse', 'e iniciar sesión']);
  elipse('CU07', 830, 830, ['CU07 Cancelar reserva']);
  elipse('CU12', 1080, 830, ['CU12 Consultar el', 'asistente de ayuda']);

  // include / extend
  dependencia('CU04', 'CU03', '«include»', { lx: 50, ly: 4 });
  dependencia('CU05', 'CU03', '«include»', { lx: 50, ly: 4 });
  dependencia('CU06', 'CU05', '«extend»', { lx: 48, ly: 4 });
  s += `<path d="M ${540 + RX - 6} 699 C 800 675, 800 385, ${540 + RX - 4} 367" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="9 6"/>`;
  s += flecha(700, 371, 540 + RX - 4, 367);
  s += texto(682, 540, ['«extend»'], { size: 14, anchor: 'start' });

  // Actores
  actor(140, 400, ['Cliente']);
  for (const id of ['CU02', 'CU04', 'CU03', 'CU05', 'CU08']) asociar(166, 370, id);
  actor(1370, 260, ['Administrador del', 'emprendimiento']);
  for (const id of ['CU09', 'CU10', 'CU06']) asociar(1344, 230, id);
  actor(1370, 660, ['Sistema', '(tarea programada)']);
  asociar(1344, 630, 'CU11');
  actor(1370, 870, ['Servicio de IA', 'externo']);
  asociar(1344, 840, 'CU12');

  // Usuario: generaliza a cliente y administrador; usa los casos compartidos.
  actor(830, 1040, ['Usuario']);
  for (const id of ['CU01', 'CU07', 'CU12']) asociar(830, 958, id);
  s += `<polyline points="140,495 140,1044 794,1044" fill="none" stroke="#000" stroke-width="2"/>`;
  s += `<polyline points="1396,230 1470,230 1470,1044 866,1044" fill="none" stroke="#000" stroke-width="2"/>`;
  s += `<polygon points="812,1044 794,1034 794,1054" fill="#fff" stroke="#000" stroke-width="2"/>`;
  s += `<polygon points="848,1044 866,1034 866,1054" fill="#fff" stroke="#000" stroke-width="2"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${s}</svg>`;
  return { svg, W, H };
}

/* ─────────────────────────  Despliegue (a mano)  ───────────────────────── */

function despliegue() {
  const W = 1500, H = 990;
  let s = '';
  const t = (x, y, lineas, { size = 18, bold = false, anchor = 'middle' } = {}) =>
    lineas.map((l, i) => `<text x="${x}" y="${y + i * (size + 6)}" font-family="${F}" font-size="${size}" ${bold ? 'font-weight="700"' : ''} text-anchor="${anchor}">${esc(l)}</text>`).join('');
  const grupo = (x, y, w, h, titulo) => {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="10 7"/>`;
    s += t(x + 18, y + 32, [titulo], { size: 18, bold: true, anchor: 'start' });
  };
  const caja = (x, y, w, h, lineas) => {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#fff" stroke="#000" stroke-width="2.5"/>`;
    const y0 = y + h / 2 - ((lineas.length - 1) * 23) / 2 + 6;
    s += lineas.map((l, i) => t(x + w / 2, y0 + i * 23, [l], { size: 17, bold: i === 0 })).join('');
  };
  const punta = (x, y, dir) => {
    const p = { up: [[-8, 14], [8, 14]], down: [[-8, -14], [8, -14]], left: [[14, -8], [14, 8]], right: [[-14, -8], [-14, 8]] }[dir];
    return `<polygon points="${x},${y} ${x + p[0][0]},${y + p[0][1]} ${x + p[1][0]},${y + p[1][1]}" fill="#000"/>`;
  };
  const via = (pts, a, b) => {
    s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="2.5"/>`;
    if (a) s += punta(...pts[0], a);
    if (b) s += punta(...pts[pts.length - 1], b);
  };

  // Dispositivo
  grupo(40, 60, 400, 540, 'Dispositivo Android del usuario');
  caja(70, 120, 340, 150, ['Aplicación móvil (APK)', 'React y Vite dentro de', 'Capacitor (WebView)']);
  caja(70, 310, 340, 100, ['Notificaciones locales', 'Recordatorios de reservas']);
  caja(70, 450, 340, 100, ['Mapa (Leaflet)', 'Negocios cercanos']);
  via([[240, 270], [240, 310]], 'up', 'down');
  via([[240, 410], [240, 450]], 'up', 'down');

  // Servidor
  grupo(540, 60, 540, 840, 'Servidor (VPS) · Coolify y Docker');
  caja(570, 120, 480, 110, ['Proxy inverso Traefik', 'Certificados y tráfico HTTPS']);
  caja(570, 300, 250, 190, ['Supabase', 'API REST (PostgREST)', 'Autenticación', 'Almacenamiento de', 'imágenes y comprobantes']);
  caja(850, 300, 200, 190, ['Asistente', 'Node.js y Express', 'Consulta Supabase', 'con el token', 'del usuario']);
  caja(570, 560, 250, 150, ['PostgreSQL', 'Funciones de reserva', 'Políticas RLS', 'Vencimiento (pg_cron)']);
  via([[695, 230], [695, 300]], 'up', 'down');
  via([[950, 230], [950, 300]], 'up', 'down');
  via([[695, 490], [695, 560]], 'up', 'down');
  via([[850, 400], [820, 400]], null, 'left');

  // Externos
  grupo(1140, 280, 320, 620, 'Servicios externos');
  caja(1170, 340, 260, 110, ['API de Claude', '(Anthropic)']);
  caja(1170, 560, 260, 110, ['Servidor de correo', '(SMTP)', 'Recuperar contraseña']);
  caja(1170, 760, 260, 110, ['Mosaicos de', 'OpenStreetMap']);

  // Conexiones entre nodos
  via([[410, 175], [570, 175]], 'left', 'right');
  s += t(490, 162, ['HTTPS'], { size: 15 });
  via([[1050, 395], [1170, 395]], null, 'right');
  via([[820, 470], [835, 470], [835, 615], [1170, 615]], null, 'right');
  via([[240, 550], [240, 950], [1300, 950], [1300, 870]], null, 'up');
  s += t(770, 940, ['HTTPS · mosaicos del mapa'], { size: 15 });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>${s}</svg>`;
  return { svg, W, H };
}

/* ─────────────────────────  Mermaid  ───────────────────────── */

const SECUENCIA_CU04 = `sequenceDiagram
  autonumber
  actor C as Cliente
  participant A as Aplicación móvil
  participant P as API (Supabase)
  participant B as Base de datos (PostgreSQL)
  actor D as Administrador
  C->>A: Elige negocio, servicio, fecha y profesional (opcional)
  A->>P: get_availability(negocio, fecha, servicio, profesional)
  P->>B: Consulta con el usuario autenticado
  B-->>P: Horarios con algún recurso libre
  P-->>A: Horarios disponibles
  A-->>C: Muestra los horarios libres
  C->>A: Elige un horario y confirma
  A->>P: create_reservation(negocio, fecha, hora, servicio, profesional)
  P->>B: Ejecuta la función transaccional
  Note over B: Bloquea negocio y fecha y vuelve a verificar la capacidad
  alt Hay un recurso libre
    Note over B: Asigna el recurso según el rubro y registra la reserva
    B-->>D: Notificación interna "Nueva reserva"
    B-->>P: Reserva pendiente o confirmada
    P-->>A: Datos de la reserva
    A-->>C: Muestra el código y el estado
  else El recurso se ocupó mientras elegía
    B-->>P: Error "Ese horario ya no está disponible"
    P-->>A: Error
    A-->>C: Informa y actualiza los horarios
  end`;

const SECUENCIA_CU06 = `sequenceDiagram
  autonumber
  actor C as Cliente
  participant A as Aplicación móvil
  participant S as Almacenamiento
  participant B as Base de datos
  actor D as Administrador
  C->>A: Transfiere la seña fuera de la app y elige la imagen del comprobante
  A->>S: Sube el comprobante a la carpeta del cliente
  S-->>A: Ruta del archivo
  A->>B: create_reservation(..., comprobante)
  Note over B: Exige el comprobante y verifica la capacidad
  B-->>A: Reserva pendiente, seña "a verificar"
  B-->>D: Notificación "Nueva reserva"
  D->>A: Abre la reserva y pide ver el comprobante
  A->>S: Solicita el archivo
  S-->>A: Imagen (sólo para el titular y el dueño del negocio)
  alt El administrador acepta
    D->>A: Aceptar
    A->>B: set_reservation_status(confirmada)
    B-->>C: Notificación "Reserva confirmada", seña verificada
  else El administrador rechaza
    D->>A: Rechazar con un motivo
    A->>B: set_reservation_status(rechazada, motivo)
    B-->>C: Notificación "Reserva rechazada", seña a devolver
  else Nadie responde dentro del plazo
    Note over B: La tarea programada la marca vencida y libera el recurso
    B-->>C: Notificación "Tu reserva venció", seña a devolver
  end`;

const CLASES = `classDiagram
  direction LR
  class Usuario {
    +nombreCompleto: texto
    +telefono: texto
    +rol: cliente | administrador
    +esDueno: booleano
    +registrarse()
    +iniciarSesion()
  }
  class Rubro {
    +nombre: texto
  }
  class Negocio {
    +nombre: texto
    +tipoReserva: turno | servicio | mesa | estadía
    +direccion: texto
    +latitud: decimal
    +longitud: decimal
    +exigeSena: booleano
    +montoSena: decimal
    +aceptaAutomaticamente: booleano
    +activo: booleano
    +consultarDisponibilidad(fecha, servicio, profesional)
    +estadisticas()
  }
  class HorarioAtencion {
    +diaSemana: entero
    +habilitado: booleano
  }
  class FranjaHoraria {
    +apertura: hora
    +cierre: hora
  }
  class ItemCatalogo {
    +nombre: texto
    +tipo: servicio | plato | alojamiento
    +precio: decimal
    +duracionMinutos: entero
    +capacidad: entero
    +unidades: entero
  }
  class Profesional {
    +nombre: texto
    +diasQueAtiende: entero[]
    +activo: booleano
  }
  class Mesas {
    +tamano: entero
    +cantidad: entero
  }
  class Promocion {
    +titulo: texto
    +desde: fecha
    +hasta: fecha
  }
  class Reserva {
    +codigo: texto
    +fecha: fecha
    +hora: hora
    +fechaSalida: fecha
    +personas: entero
    +mesaAsignada: entero
    +estado: EstadoReserva
    +estadoSena: EstadoSena
    +comprobante: texto
    +venceEl: fecha y hora
    +crear()
    +cambiarEstado(nuevo, motivo)
    +cancelar()
    +vencer()
  }
  class HistorialEstado {
    +estadoAnterior: texto
    +estadoNuevo: texto
    +fecha: fecha y hora
  }
  class PagoSena {
    +monto: decimal
    +estado: texto
  }
  class Resena {
    +puntaje: 1 a 5
    +comentario: texto
    +respuestaDueno: texto
    +responder(texto)
  }
  class Notificacion {
    +titulo: texto
    +cuerpo: texto
    +tipo: texto
    +leida: booleano
  }
  class EstadoReserva {
    <<enumeración>>
    pendiente
    confirmada
    rechazada
    cancelada
    vencida
    completada
    no asistió
  }
  class EstadoSena {
    <<enumeración>>
    sin seña
    a verificar
    verificada
    a devolver
    devuelta
  }
  Usuario "1" -- "0..*" Negocio : administra
  Rubro "1" -- "0..*" Negocio : clasifica
  Negocio "1" *-- "0..*" HorarioAtencion
  HorarioAtencion "1" *-- "1..*" FranjaHoraria
  Negocio "1" *-- "0..*" ItemCatalogo
  Negocio "1" *-- "0..*" Profesional
  Negocio "1" *-- "0..*" Mesas
  Negocio "1" *-- "0..*" Promocion
  Usuario "1" -- "0..*" Reserva : realiza
  Negocio "1" -- "0..*" Reserva : recibe
  ItemCatalogo "0..1" -- "0..*" Reserva : se reserva
  Profesional "0..1" -- "0..*" Reserva : atiende
  Reserva "1" *-- "1..*" HistorialEstado
  Reserva "1" *-- "0..1" PagoSena
  Reserva "1" -- "0..1" Resena : se califica
  Usuario "1" -- "0..*" Notificacion : recibe
  Reserva ..> EstadoReserva
  Reserva ..> EstadoSena`;

const ESTADOS = `stateDiagram-v2
  direction TB
  state "No asistió" as NoAsistio
  [*] --> Pendiente: requiere aprobación<br/>o el negocio pide seña
  [*] --> Confirmada: sin seña y con<br/>aceptación automática
  Pendiente --> Confirmada: el administrador acepta<br/>(seña verificada)
  Pendiente --> Rechazada: el administrador rechaza
  Pendiente --> Cancelada: el cliente cancela
  Pendiente --> Vencida: el sistema detecta que pasó<br/>el plazo de 24 h o la hora reservada
  Confirmada --> Cancelada: cancela el cliente<br/>o el administrador
  Confirmada --> Completada: el cliente asistió
  Confirmada --> NoAsistio: el cliente no se presentó
  Rechazada --> [*]
  Cancelada --> [*]
  Vencida --> [*]
  Completada --> [*]
  NoAsistio --> [*]`;

/* ─────────────────────────  Salida  ───────────────────────── */

{
  const { svg, W, H } = casosDeUso();
  writeFileSync(join(salida, 'casos-de-uso.svg'), svg);
  await captura(svg, W, H, 'casos-de-uso');
}
{
  const { svg, W, H } = despliegue();
  writeFileSync(join(salida, 'despliegue.svg'), svg);
  await captura(svg, W, H, 'despliegue');
}
await mermaid('secuencia-cu04', SECUENCIA_CU04, { sequence: { useMaxWidth: false, wrap: true, width: 210, actorMargin: 110, noteMargin: 14, boxMargin: 12, diagramMarginY: 24, messageFontSize: 15, actorFontSize: 16, noteFontSize: 15, mirrorActors: false } });
await mermaid('secuencia-cu06', SECUENCIA_CU06, { sequence: { useMaxWidth: false, wrap: true, width: 210, actorMargin: 110, noteMargin: 14, boxMargin: 12, diagramMarginY: 24, messageFontSize: 15, actorFontSize: 16, mirrorActors: false } });
await mermaid('clases', CLASES, { class: { useMaxWidth: false } });
await mermaid('estados', ESTADOS, { state: { useMaxWidth: false } });
