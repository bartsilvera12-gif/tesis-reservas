#!/usr/bin/env node
/**
 * Genera el manual de uso en PDF.
 *
 *   npm run docs:manual            -> docs/manual-de-uso.pdf
 *
 * El texto sale de `src/lib/ayuda.ts`, lo mismo que muestra la pantalla
 * "Cómo se usa" de la app, y las capturas de `public/ayuda/`. Así el papel y
 * la app dicen siempre lo mismo: para cambiar el manual se cambia ayuda.ts y
 * se vuelve a correr esto.
 *
 * Imprime con Microsoft Edge en modo sin ventana (viene con Windows).
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = process.argv[2] ?? join(raiz, 'docs', 'manual-de-uso.pdf');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
if (!EDGE) {
  console.error('No encontré Microsoft Edge para imprimir el PDF.');
  process.exit(1);
}

// ── Contenido: el mismo módulo que usa la app ─────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'manual-'));
await build({
  entryPoints: [join(raiz, 'src/lib/ayuda.ts')],
  outfile: join(tmp, 'ayuda.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
});
const { AYUDA_CLIENTE, AYUDA_DUENIO, PREGUNTAS } = await import(pathToFileURL(join(tmp, 'ayuda.mjs')));

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** **negrita** y *cursiva*, igual que en la app. */
const fmt = (t) =>
  esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>');
const img = (nombre) => {
  const f = join(raiz, 'public', 'ayuda', `${nombre}.jpg`);
  return existsSync(f) ? pathToFileURL(f).href : null;
};

function seccion(s, n) {
  const foto = s.imagen && img(s.imagen);
  return `
  <section class="tema">
    <div class="texto">
      <div class="num">${n}</div>
      <h3>${esc(s.titulo)}</h3>
      <p class="resumen">${fmt(s.resumen)}</p>
      ${s.pasos ? `<ol class="pasos">${s.pasos.map((p) => `<li>${fmt(p)}</li>`).join('')}</ol>` : ''}
      ${s.puntos ? `<ul class="puntos">${s.puntos.map((p) => `<li>${fmt(p)}</li>`).join('')}</ul>` : ''}
      ${s.nota ? `<div class="ojo">${fmt(s.nota)}</div>` : ''}
    </div>
    ${foto ? `<figure class="tel"><img src="${foto}" alt=""></figure>` : ''}
  </section>`;
}

function parte(clase, etiqueta, titulo, bajada, secciones) {
  return `
  <div class="parte ${clase}">
    <div class="cabecera">
      <div class="etiqueta">${etiqueta}</div>
      <h2>${titulo}</h2>
      <p class="bajada">${bajada}</p>
    </div>
    ${secciones.map((s, i) => seccion(s, i + 1)).join('')}
  </div>`;
}

const indice = (titulo, secciones) => `
  <div class="grupo">${titulo}</div>
  ${secciones.map((s, i) => `<div class="linea"><span class="n">${i + 1}</span><span>${esc(s.titulo)}</span><span class="r">${esc(s.resumen)}</span></div>`).join('')}`;

const portadaCliente = img('c03-inicio');
const portadaDuenio = img('d06-panel');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>AJ Spots · Manual de uso</title>
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Figtree:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --terracota: #D98E73; --terracota-osc: #A9674C; --tinta: #3D322B; --sub: #8C7C6D;
    --linea: #EAE0D0; --fondo: #FBF7EE; --crema: #F6ECDD; --aviso: #8A6A1F;
    --aviso-fondo: #FBF6EC; --aviso-linea: #EBD9B4; --marron: #4E4237;
  }
  @page {
    size: A4;
    margin: 15mm 16mm 17mm 16mm;
    @bottom-right { content: "AJ Spots · Manual de uso   " counter(page); font: 8.5pt Figtree, sans-serif; color: #8C7C6D; }
  }
  @page portada { margin: 0; @bottom-right { content: none; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: Figtree, system-ui, sans-serif; color: var(--tinta);
    font-size: 10.6pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3 { margin: 0; font-weight: 400; }
  h2 { font-family: Marcellus, Georgia, serif; font-size: 24pt; line-height: 1.15; }
  h3 { font-size: 13.5pt; font-weight: 800; margin-bottom: 1mm; }
  b { font-weight: 800; }

  /* Portada */
  .portada {
    page: portada; height: 297mm; padding: 26mm 22mm; break-after: page;
    display: flex; flex-direction: column; justify-content: space-between;
    background: radial-gradient(circle at 85% 12%, rgba(217,142,115,.35), transparent 45%),
                linear-gradient(160deg, #FBF7EE 0%, #F1E9DA 100%);
  }
  .marca { font-family: Marcellus, Georgia, serif; font-size: 50pt; line-height: 1; }
  .marca span { color: var(--terracota); }
  .lema { font-size: 13pt; color: var(--sub); margin-top: 3mm; }
  .portada h1 { font-family: Marcellus, Georgia, serif; font-size: 40pt; margin-top: 12mm; }
  .para { font-size: 13pt; margin-top: 4mm; max-width: 130mm; }
  .telefonos { display: flex; gap: 8mm; }
  .portada .tel { width: 58mm; }
  .pie { font-size: 10pt; color: var(--sub); }

  /* Índice y presentación */
  .intro { break-after: page; }
  .etiqueta { font-size: 8.5pt; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: var(--terracota-osc); margin-bottom: 2mm; }
  .bajada { font-size: 11.5pt; color: var(--sub); margin: 2mm 0 5mm; }
  .tarjeta { background: #fff; border: 1px solid var(--linea); border-radius: 4mm; padding: 4mm 5mm; margin-bottom: 6mm; }
  .indice .grupo { font-weight: 800; font-size: 11.5pt; margin: 4mm 0 .5mm; }
  .indice .linea { display: flex; gap: 3mm; padding: 1mm 0; border-bottom: 1px dashed var(--linea); font-size: 9.8pt; }
  .indice .n { width: 6mm; color: var(--terracota-osc); font-weight: 800; }
  .indice .r { margin-left: auto; color: var(--sub); font-size: 9.2pt; text-align: right; }

  /* Partes y temas */
  .parte { break-before: page; }
  .cabecera { border-left: 2.2mm solid var(--terracota); padding-left: 5mm; margin-bottom: 4mm; }
  .duenio .cabecera { border-color: var(--marron); }
  .duenio .etiqueta { color: var(--marron); }
  .tema {
    display: flex; gap: 8mm; align-items: flex-start;
    break-inside: avoid; page-break-inside: avoid;
    padding: 5mm 0; border-top: 1px solid var(--linea);
  }
  .tema .texto { flex: 1; min-width: 0; }
  .num {
    width: 7.5mm; height: 7.5mm; border-radius: 50%; background: var(--terracota); color: #fff;
    font-weight: 800; font-size: 10pt; display: flex; align-items: center; justify-content: center; margin-bottom: 2mm;
  }
  .duenio .num { background: var(--marron); }
  .resumen { color: var(--sub); margin: 0 0 3mm; }
  ol.pasos { list-style: none; padding: 0; margin: 0 0 2mm; counter-reset: paso; }
  ol.pasos li { counter-increment: paso; position: relative; padding-left: 8.5mm; margin-bottom: 2.2mm; }
  ol.pasos li::before {
    content: counter(paso); position: absolute; left: 0; top: .3mm; width: 5.6mm; height: 5.6mm; border-radius: 50%;
    border: 1.3px solid var(--terracota); color: var(--terracota-osc); font-weight: 800; font-size: 8.6pt;
    display: flex; align-items: center; justify-content: center;
  }
  .duenio ol.pasos li::before { border-color: var(--marron); color: var(--marron); }
  ul.puntos { margin: 0 0 2mm; padding-left: 5mm; }
  ul.puntos li { margin-bottom: 1.6mm; }
  ul.puntos li::marker { color: var(--terracota); }
  .ojo {
    background: var(--aviso-fondo); border: 1px solid var(--aviso-linea); border-radius: 3mm;
    padding: 2.6mm 3.6mm; font-size: 9.8pt; margin-top: 2mm;
  }
  .tel {
    margin: 0; width: 50mm; flex-shrink: 0; border: 1.8mm solid var(--tinta); border-radius: 6.5mm;
    overflow: hidden; background: #fff;
  }
  .tel img { display: block; width: 100%; }

  /* Preguntas */
  .preguntas { break-before: page; }
  .preg { break-inside: avoid; padding: 3.2mm 0; border-top: 1px solid var(--linea); }
  .preg .q { font-weight: 800; font-size: 11pt; margin-bottom: .8mm; }
</style>
</head>
<body>

<section class="portada">
  <div>
    <div class="marca">AJ Spots<span>.</span></div>
    <div class="lema">Tu mesa, tu turno, tu momento.</div>
    <h1>Manual de uso</h1>
    <div class="para">Cómo reservar en los negocios de Ñemby y cómo administrar tu negocio, paso a paso y con capturas de la aplicación.</div>
  </div>
  <div class="telefonos">
    ${portadaCliente ? `<figure class="tel"><img src="${portadaCliente}" alt=""></figure>` : ''}
    ${portadaDuenio ? `<figure class="tel"><img src="${portadaDuenio}" alt=""></figure>` : ''}
  </div>
  <div class="pie">Este mismo manual está dentro de la app: Perfil → <b>Cómo se usa la app</b>, o en el panel del negocio → <b>¿Cómo se usa?</b></div>
</section>

<section class="intro">
  <div class="etiqueta">Antes de empezar</div>
  <h2>Qué es AJ Spots</h2>
  <p class="bajada">Una app para reservar en restaurantes, peluquerías, spas de uñas, lavaderos y hospedajes de Ñemby, y para que esos negocios manejen sus reservas desde el celular.</p>
  <div class="tarjeta">
    Con <b>una sola cuenta</b> podés reservar como cliente y, si tenés un negocio, administrarlo. La primera parte del manual es para quien reserva; la segunda, para el dueño o encargado del negocio. Al final hay preguntas frecuentes.
  </div>
  <div class="indice">
    ${indice('Parte 1 · Para reservar', AYUDA_CLIENTE)}
    ${indice('Parte 2 · Para tu negocio', AYUDA_DUENIO)}
  </div>
</section>

${parte('cliente', 'Parte 1', 'Para reservar', 'Encontrar un lugar, reservar y seguir tus reservas.', AYUDA_CLIENTE)}
${parte('duenio', 'Parte 2', 'Para tu negocio', 'Cargar el negocio, responder reservas y hacerlo crecer.', AYUDA_DUENIO)}

<section class="preguntas">
  <div class="etiqueta">Dudas</div>
  <h2>Preguntas frecuentes</h2>
  <p class="bajada">Lo que más se consulta.</p>
  ${PREGUNTAS.map((p) => `<div class="preg"><div class="q">${esc(p.pregunta)}</div>${fmt(p.respuesta)}</div>`).join('')}
</section>

</body>
</html>`;

const archivoHtml = join(tmp, 'manual.html');
writeFileSync(archivoHtml, html);
// Edge a veces termina sin escribir el archivo (sobre todo si quedó otra
// instancia sin ventana abierta): se reintenta un par de veces.
if (existsSync(salida)) rmSync(salida);
for (let intento = 1; intento <= 3 && !existsSync(salida); intento++) {
  try {
    execFileSync(EDGE, [
      '--headless=new',
      // Perfil propio: con Edge abierto, sin esto la impresión se la queda la
      // ventana que ya está corriendo y no sale ningún archivo.
      `--user-data-dir=${join(tmp, `perfil-${Date.now()}`)}`,
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--virtual-time-budget=15000',
      `--print-to-pdf=${salida}`,
      pathToFileURL(archivoHtml).href,
    ], { stdio: 'ignore', timeout: 120000 });
  } catch {
    /* se reintenta */
  }
}

if (!existsSync(salida)) {
  console.error('Edge no generó el PDF.');
  process.exit(1);
}
const kb = Math.round(statSync(salida).size / 1024);
const faltan = [...AYUDA_CLIENTE, ...AYUDA_DUENIO].filter((s) => s.imagen && !img(s.imagen)).map((s) => s.imagen);
console.log(`  PDF: ${salida} (${kb} KB)`);
if (faltan.length) console.log(`  Faltan capturas: ${faltan.join(', ')}`);
console.log(`  HTML para revisar el diseño: ${archivoHtml}`);
