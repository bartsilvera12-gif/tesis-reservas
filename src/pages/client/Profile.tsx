import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { uploadAvatar } from '@/services/storage';
import { countUnread } from '@/services/notifications';
import { fetchMyReservations } from '@/services/reservations';
import { Button, Field, PageTitle, Sheet, Spinner } from '@/components/ui';
import { C } from '@/lib/theme';
import { initials } from '@/lib/format';
import { ICONS } from '@/components/BottomNav';

export function Profile() {
  const { profile, updateProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const unreadQuery = useAsync(
    () => countUnread(profile!.id),
    [profile?.id],
    { enabled: Boolean(profile?.id) },
  );

  const countQuery = useAsync(
    async () => {
      const rows = await fetchMyReservations(profile!.id);
      return rows.length;
    },
    [profile?.id],
    { enabled: Boolean(profile?.id) },
  );

  if (!profile) return null;

  async function onSave() {
    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        city: city.trim() || null,
      });
      toast.success('Datos guardados.');
      setEditing(false);
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos guardar tus datos.');
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file || !profile) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(profile.id, file);
      await updateProfile({ avatar_url: url });
      toast.success('Foto actualizada.');
    } catch (err) {
      toast.fail(err instanceof Error ? err.message : 'No pudimos subir tu foto.');
    } finally {
      setUploading(false);
    }
  }

  const rows: { label: string; onClick: () => void; badge?: number }[] = [
    { label: 'Mis datos', onClick: () => setEditing(true) },
    { label: 'Mis reseñas', onClick: () => navigate('/app/mis-resenas') },
    {
      label: 'Notificaciones',
      onClick: () => navigate('/app/notificaciones'),
      badge: unreadQuery.data ?? 0,
    },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageTitle>Perfil</PageTitle>

      <div
        style={{
          padding: '10px 20px 26px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: 82,
            height: 82,
            borderRadius: '50%',
            background: profile.avatar_url
              ? `url(${profile.avatar_url}) center/cover`
              : 'linear-gradient(135deg,#D98E73,#A9674C)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 27,
            fontWeight: 800,
            position: 'relative',
          }}
        >
          {uploading ? (
            <Spinner color="#fff" />
          ) : profile.avatar_url ? null : (
            initials(profile.full_name)
          )}
          <span
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: C.surface,
              border: `1px solid ${C.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path
                d="M12 15.2a3.2 3.2 0 1 0-3.2-3.2 3.2 3.2 0 0 0 3.2 3.2zM9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3z"
                fill={C.terracottaDark}
              />
            </svg>
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onPickAvatar(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div style={{ fontSize: 19, fontWeight: 800, textAlign: 'center' }}>
          {profile.full_name || 'Sin nombre'}
        </div>
        <div style={{ fontSize: 13, color: C.sub, textAlign: 'center' }}>
          {[profile.city, countQuery.data != null ? `${countQuery.data} reservas hechas` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <button
            key={row.label}
            onClick={row.onClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              background: C.surface,
              border: `1px solid ${C.line}`,
              borderRadius: 12,
              padding: '15px 16px',
              fontSize: 14,
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            <span>{row.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {row.badge ? (
                <span
                  style={{
                    background: C.terracotta,
                    color: '#fff',
                    borderRadius: 999,
                    minWidth: 20,
                    height: 20,
                    padding: '0 6px',
                    fontSize: 11,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {row.badge}
                </span>
              ) : null}
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M8.6 16.6 13.2 12 8.6 7.4 10 6l6 6-6 6z" fill={C.muted} />
              </svg>
            </span>
          </button>
        ))}

        <button
          onClick={() => void signOut()}
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            padding: '15px 16px',
            fontSize: 14,
            fontWeight: 700,
            color: C.danger,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24">
            <path
              d="M17 7l-1.4 1.4L18.2 11H8v2h10.2l-2.6 2.6L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z"
              fill={C.danger}
            />
          </svg>
          Cerrar sesión
        </button>
      </div>

      <div
        style={{
          textAlign: 'center',
          fontSize: 11.5,
          color: C.muted,
          marginTop: 20,
          padding: '0 20px',
        }}
      >
        {profile.email}
      </div>

      <Sheet open={editing} title="Mis datos" onClose={() => setEditing(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            label="Nombre y apellido"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Field
            label="Teléfono"
            type="tel"
            inputMode="tel"
            placeholder="+595 9xx xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Field
            label="Ciudad"
            placeholder="Asunción"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.cream,
              borderRadius: 12,
              padding: '11px 14px',
              fontSize: 12.5,
              color: C.sub,
              lineHeight: 1.45,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d={ICONS.person} fill={C.terracottaDark} />
            </svg>
            Tu cuenta es de tipo <strong style={{ margin: '0 3px' }}>cliente</strong> y no
            puede cambiarse.
          </div>

          <Button loading={saving} onClick={() => void onSave()}>
            Guardar cambios
          </Button>
        </div>
      </Sheet>

      {toast.node}
    </div>
  );
}
