import { useState } from 'preact/hooks';
import type { Profile } from '@/lib/db';
import { AVATAR_EMOJI, AVATAR_COLORS, updateProfile } from '@/lib/auth';
import { Avatar } from './Avatar';

/** Lato massimo della foto profilo salvata. */
const PHOTO_SIZE = 128;

/**
 * Ridimensiona l'immagine scelta a un quadrato di 128 px prima di salvarla.
 *
 * Una foto da fotocamera pesa qualche megabyte: infilarla intatta in
 * IndexedDB gonfierebbe il database per un'immagine che viene mostrata a 72
 * pixel. Il ritaglio è centrato sul lato corto.
 */
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato immagine non supportato.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = PHOTO_SIZE;
        canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas non disponibile.'));
          return;
        }
        const side = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          PHOTO_SIZE,
          PHOTO_SIZE,
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function AvatarEditor({ profile }: { profile: Profile }) {
  const [error, setError] = useState<string | null>(null);

  const onPhoto = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setError(null);
    try {
      await updateProfile({ avatarPhoto: await resizeToDataUrl(file) });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div class="avatar-editor">
      <div class="avatar-editor__preview">
        <Avatar profile={profile} size={96} />
      </div>

      <div class="avatar-editor__row">
        <label class="avatar-editor__upload">
          <input type="file" accept="image/*" onChange={onPhoto} />
          <span>Carica foto</span>
        </label>
        {profile.avatarPhoto && (
          <button type="button" onClick={() => updateProfile({ avatarPhoto: null })}>
            Rimuovi foto
          </button>
        )}
      </div>

      {!profile.avatarPhoto && (
        <>
          <div class="avatar-editor__group" role="group" aria-label="Emoji avatar">
            {AVATAR_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                class={
                  profile.avatarEmoji === emoji
                    ? 'avatar-chip avatar-chip--on'
                    : 'avatar-chip'
                }
                onClick={() => updateProfile({ avatarEmoji: emoji })}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div class="avatar-editor__group" role="group" aria-label="Colore avatar">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                class={
                  profile.avatarColor === color
                    ? 'avatar-swatch avatar-swatch--on'
                    : 'avatar-swatch'
                }
                style={{ background: color }}
                aria-label={`Colore ${color}`}
                onClick={() => updateProfile({ avatarColor: color })}
              />
            ))}
          </div>
        </>
      )}

      {error && <p class="profile__msg" data-kind="err">{error}</p>}
    </div>
  );
}
