import type { CSSProperties, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { C, FONT } from '@/lib/theme';
import type { ReservationStatus } from '@/types/db';
import { statusLabel } from '@/lib/format';

/* ─────────────────────────────  Botones  ───────────────────────────── */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  block = true,
  loading = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isOff = disabled || loading;

  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: block ? '100%' : undefined,
    borderRadius: 14,
    padding: '15px 18px',
    fontSize: 16,
    fontWeight: 800,
    textAlign: 'center',
    /* 48px es el mínimo táctil recomendado en Android */
    minHeight: 48,
    transition: 'background .2s, opacity .2s',
    cursor: isOff ? 'default' : 'pointer',
  };

  const variants: Record<string, CSSProperties> = {
    primary: {
      background: isOff ? C.inactive : C.terracotta,
      color: '#fff',
      boxShadow: isOff ? 'none' : '0 6px 18px rgba(217,142,115,.35)',
    },
    outline: {
      background: 'transparent',
      color: C.terracottaDark,
      border: `1.5px solid ${C.line}`,
      fontWeight: 700,
    },
    ghost: {
      background: C.surface,
      color: C.terracottaDark,
      border: `1.5px solid ${C.line}`,
      fontWeight: 700,
    },
    danger: {
      background: C.surface,
      color: C.danger,
      border: `1.5px solid ${C.line}`,
      fontWeight: 700,
    },
  };

  return (
    <button
      {...rest}
      disabled={isOff}
      style={{ ...base, ...variants[variant], opacity: isOff && variant !== 'primary' ? 0.6 : 1, ...style }}
    >
      {loading && <Spinner size={16} color={variant === 'primary' ? '#fff' : C.terracottaDark} />}
      {children}
    </button>
  );
}

/* ─────────────────────────────  Card  ───────────────────────────── */

export function Card({
  children,
  style,
  onClick,
}: {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Título de sección en versalitas — el patrón "DESCRIPCIÓN" del prototipo. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 800,
        color: C.sub,
        letterSpacing: '.5px',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        margin: '22px 20px 10px',
      }}
    >
      <span style={{ fontSize: 16.5, fontWeight: 800 }}>{title}</span>
      {action && (
        <button
          onClick={onAction}
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: C.terracottaDark,
            // Área tocable cómoda sin agrandar el texto: el padding se come
            // el margen del contenedor para no descolocar la alineación.
            padding: '13px 8px',
            margin: '-13px -8px',
            minHeight: 44,
          }}
        >
          {action}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────  Chips  ───────────────────────────── */

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        borderRadius: 999,
        padding: '0 16px',
        // 44px es el mínimo táctil recomendado; con menos el dedo falla.
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 12.5,
        fontWeight: 700,
        background: active ? C.terracottaDark : C.surface,
        color: active ? '#fff' : C.sub,
        border: `1.5px solid ${active ? C.terracottaDark : C.line}`,
        scrollSnapAlign: 'start',
      }}
    >
      {label}
    </button>
  );
}

export function StatusChip({ status }: { status: ReservationStatus }) {
  const palette: Record<ReservationStatus, CSSProperties> = {
    confirmed: { background: C.cream, color: C.terracottaDark },
    pending: { background: C.warnBg, color: C.warn },
    cancelled: { background: C.dangerBg, color: C.danger },
    rejected: { background: C.dangerBg, color: C.danger },
    completed: { background: '#EDF3EC', color: '#4E6B4F' },
    no_show: { background: C.disabledBg, color: C.sub },
  };

  return (
    <span
      style={{
        borderRadius: 999,
        padding: '4px 10px',
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: 'nowrap',
        ...palette[status],
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

/* ─────────────────────────────  Estrellas  ───────────────────────────── */

export function Stars({ rating, size = 11.5 }: { rating: number; size?: number }) {
  return (
    <span style={{ fontSize: size, color: C.gold, letterSpacing: 1.5 }}>
      {'★'.repeat(Math.round(rating))}
      <span style={{ color: C.line }}>{'★'.repeat(Math.max(0, 5 - Math.round(rating)))}</span>
    </span>
  );
}

export function RatingBadge({
  rating,
  count,
}: {
  rating: number | null;
  count?: number;
}) {
  if (rating == null) {
    return (
      <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>Sin reseñas</span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: C.gold }}>★</span>
      {rating.toFixed(1)}
      {count != null && (
        <span style={{ color: C.sub, fontWeight: 500 }}>({count})</span>
      )}
    </span>
  );
}

/* ─────────────────────────────  Formularios  ───────────────────────────── */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  multiline?: boolean;
  rows?: number;
}

export function Field({ label, hint, error, multiline, rows = 3, style, ...rest }: FieldProps) {
  const inputStyle: CSSProperties = {
    width: '100%',
    // Sin esto, input[type=date] impone su ancho mínimo intrínseco (~176px)
    // y dos en fila desbordan la pantalla en celulares angostos.
    minWidth: 0,
    background: C.surface,
    border: `1.5px solid ${error ? C.danger : C.line}`,
    borderRadius: 12,
    padding: '13px 14px',
    fontSize: 16,
    fontFamily: FONT.sans,
    color: C.ink,
    resize: 'vertical',
    ...style,
  };

  return (
    <label style={{ display: 'block' }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: C.ink }}>
          {label}
        </div>
      )}
      {multiline ? (
        <textarea
          rows={rows}
          style={inputStyle}
          {...(rest as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input style={inputStyle} {...rest} />
      )}
      {error ? (
        <div style={{ fontSize: 12, color: C.danger, marginTop: 5 }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 12, color: C.sub, marginTop: 5 }}>{hint}</div>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        // El interruptor se ve de 24px pero el área tocable es de 44.
        height: 44,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 24,
          borderRadius: 12,
          background: checked ? C.terracotta : '#E5DCC9',
          padding: 2,
          boxSizing: 'border-box',
          transition: 'background .2s',
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: '#fff',
            transform: checked ? 'translateX(20px)' : 'none',
            transition: 'transform .2s',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          }}
        />
      </div>
    </button>
  );
}

/** Selector − / valor / + usado para las mesas. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const box: CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: `1.5px solid ${C.line}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 17,
    fontWeight: 700,
    color: C.terracottaDark,
    background: C.surface,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button
        aria-label="Restar"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{ ...box, opacity: disabled || value <= min ? 0.4 : 1 }}
      >
        −
      </button>
      <div style={{ width: 38, textAlign: 'center', fontSize: 15, fontWeight: 800 }}>
        {value}
      </div>
      <button
        aria-label="Sumar"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{ ...box, opacity: disabled || value >= max ? 0.4 : 1 }}
      >
        +
      </button>
    </div>
  );
}

/* ─────────────────────────  Estados de carga  ───────────────────────── */

export function Spinner({ size = 22, color = C.terracotta }: { size?: number; color?: string }) {
  return (
    <span
      aria-label="Cargando"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2.5px solid ${color}33`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin .7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '52px 20px',
        color: C.sub,
        fontSize: 13.5,
      }}
    >
      <Spinner />
      {label}
    </div>
  );
}

/** Estado vacío / error, con acción opcional de reintento. */
export function StateView({
  title,
  detail,
  actionLabel,
  onAction,
  tone = 'neutral',
}: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 8,
        padding: '46px 28px',
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: tone === 'error' ? C.dangerBg : C.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d={
              tone === 'error'
                ? 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2zm0-4h-2V7h2z'
                : 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14zM5 8V6h14v2z'
            }
            fill={tone === 'error' ? C.danger : C.terracottaDark}
          />
        </svg>
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 800 }}>{title}</div>
      {detail && (
        <div style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.5, maxWidth: 300 }}>
          {detail}
        </div>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: 10,
            border: `1.5px solid ${C.line}`,
            background: C.surface,
            borderRadius: 12,
            padding: '11px 20px',
            fontSize: 13.5,
            fontWeight: 700,
            color: C.terracottaDark,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────  Toast  ───────────────────────────── */

export function Toast({
  message,
  tone = 'success',
  onDismiss,
}: {
  message: string;
  tone?: 'success' | 'error';
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: `calc(84px + var(--safe-bottom))`,
        zIndex: 900,
        background: tone === 'error' ? C.danger : C.brown,
        color: '#fff',
        borderRadius: 14,
        padding: '13px 16px',
        fontSize: 13.5,
        fontWeight: 600,
        lineHeight: 1.45,
        boxShadow: '0 10px 30px rgba(61,50,43,.3)',
        animation: 'fadeUp .25s ease-out forwards',
      }}
    >
      {message}
    </div>
  );
}

/* ─────────────────────────  Hoja modal inferior  ───────────────────────── */

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(45,34,26,.45)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '88dvh',
          overflowY: 'auto',
          background: C.bg,
          borderRadius: '22px 22px 0 0',
          padding: `18px 20px calc(24px + var(--safe-bottom))`,
          animation: 'slideUp .25s cubic-bezier(.2,.9,.3,1) forwards',
        }}
      >
        <div
          style={{
            width: 42,
            height: 4,
            borderRadius: 2,
            background: C.line,
            margin: '0 auto 14px',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: '50%',
              background: C.surface,
              border: `1px solid ${C.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"
                fill={C.ink}
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────  Encabezado con volver  ───────────────────────── */

export function TopBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 20px 10px',
        background: C.bg,
      }}
    >
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Volver"
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: '50%',
            background: C.surface,
            border: `1px solid ${C.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" fill={C.ink} />
          </svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: C.sub }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

/** Título grande de pantalla ("Mis reservas", "Promociones"). */
export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 20px 10px',
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{children}</h1>
      {right}
    </div>
  );
}
