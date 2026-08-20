import type { ReservationStatus } from '@/types/db';

/** ₲ 85.000 — mismo formato que el prototipo. */
export function money(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '₲ 0';
  return '₲ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const dayShort = (dow: number) => DAYS_SHORT[dow] ?? '';
export const dayLong = (dow: number) => DAYS_LONG[dow] ?? '';

/**
 * Parsea 'YYYY-MM-DD' como fecha LOCAL.
 * `new Date('2026-08-20')` la interpretaría como UTC y en Paraguay (UTC-3)
 * mostraría el día anterior.
 */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Date -> 'YYYY-MM-DD' en hora local. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** '19:30:00' -> '19:30' */
export function shortTime(time: string | null | undefined): string {
  if (!time) return '';
  return time.slice(0, 5);
}

/** 'Hoy' · 'Mañana' · 'Vie 22 de agosto' */
export function friendlyDate(iso: string): string {
  const date = parseDate(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `${DAYS_SHORT[date.getDay()]} ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** 'Jue 21 ago' — compacto, para las listas. */
export function compactDate(iso: string): string {
  const date = parseDate(iso);
  return `${DAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)}`;
}

/** 'hace 2 días' */
export function timeAgo(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (secs < 60) return 'recién';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`;
  return `hace ${Math.floor(days / 365)} año(s)`;
}

/** Iniciales para el avatar: 'Andrea Villalba' -> 'AV' */
export function initials(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean) return '·';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Etiquetas en castellano; el estado interno siempre queda en inglés. */
const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  no_show: 'No asistió',
};

export const statusLabel = (status: ReservationStatus): string =>
  STATUS_LABEL[status] ?? status;

/** '0,8 km' / '350 m' — formato paraguayo, coma decimal. */
export function distanceLabel(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Distancia Haversine en km. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 'Buenas tardes' según la hora local. */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** 'La Cabaña' -> 'la-cabana' */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
