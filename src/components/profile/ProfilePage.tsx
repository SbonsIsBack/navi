import { useEffect, useState } from 'preact/hooks';
import {
  currentProfile,
  authReady,
  restoreSession,
  signInLocal,
  signOut,
  signInWithProvider,
  updateProfile,
  deleteProfile,
} from '@/lib/auth';
import {
  liveSharing,
  setLiveSharing,
  restoreSharingPreference,
  queueStats,
  clearQueue,
  currentAdapterId,
  LIVE_INTERVAL_MS,
  type QueueStats,
} from '@/lib/sync';
import { themeId, applyThemeToDocument } from '@/lib/themes';
import { Avatar } from './Avatar';
import { url } from '@/lib/paths';
import { AvatarEditor } from './AvatarEditor';

/** Profilo, accesso e predisposizione al sync. Nessuna schermata è protetta. */
export default function ProfilePage() {
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);

  const refreshStats = async () => setStats(await queueStats());

  useEffect(() => {
    applyThemeToDocument(themeId.value);
    void restoreSession();
    void restoreSharingPreference();
    void refreshStats();
  }, []);

  const profile = currentProfile.value;

  const tryProvider = async (provider: 'apple' | 'google') => {
    try {
      await signInWithProvider(provider);
    } catch (err) {
      setNotice({ text: (err as Error).message, kind: 'err' });
    }
  };

  return (
    <div class="profile">
      <header class="profile__header">
        <a class="profile__back" href={url('/')} aria-label="Torna al tachimetro">‹</a>
        <h1>Profilo</h1>
      </header>

      {!authReady.value && <p class="profile__loading">Carico…</p>}

      {authReady.value && !profile && (
        <section class="profile__signin">
          <p class="profile__intro">
            L'accesso è <strong>facoltativo</strong>: tachimetro, varchi e storico
            funzionano già così. Serve solo a dare un'identità ai dati in vista di
            una futura sincronizzazione.
          </p>

          <button
            type="button"
            class="profile__primary"
            onClick={async () => {
              await signInLocal();
              setNotice({ text: 'Profilo di test creato su questo device.', kind: 'ok' });
            }}
          >
            USA L'UTENTE DI TEST
          </button>

          <div class="profile__providers">
            <button type="button" class="provider-btn" onClick={() => tryProvider('apple')}>
              <span class="provider-btn__mark"></span>
              Accedi con Apple
              <span class="provider-btn__soon">prossimamente</span>
            </button>
            <button type="button" class="provider-btn" onClick={() => tryProvider('google')}>
              <span class="provider-btn__mark">G</span>
              Accedi con Google
              <span class="provider-btn__soon">prossimamente</span>
            </button>
          </div>

          <a class="profile__skip" href={url('/')}>Continua senza account</a>
        </section>
      )}

      {authReady.value && profile && (
        <>
          <section class="profile__card">
            <Avatar profile={profile} size={64} />
            <div class="profile__id">
              <input
                class="profile__name"
                type="text"
                value={profile.displayName}
                aria-label="Nome visualizzato"
                onInput={(e) => updateProfile({ displayName: e.currentTarget.value })}
              />
              <span class="profile__provider">
                {profile.provider === 'local'
                  ? 'utente di test · solo su questo device'
                  : `${profile.provider} · ${profile.email ?? ''}`}
              </span>
            </div>
          </section>

          <section class="profile__section">
            <h2>Avatar</h2>
            <AvatarEditor profile={profile} />
          </section>

          <section class="profile__section">
            <h2>Posizione live</h2>
            <label class="profile__toggle">
              <input
                type="checkbox"
                checked={liveSharing.value}
                onChange={(e) => {
                  void setLiveSharing(e.currentTarget.checked);
                  void refreshStats();
                }}
              />
              <span>
                Accoda la posizione durante il tracking
                <small>
                  Un punto ogni {LIVE_INTERVAL_MS / 1000} secondi, salvato solo qui.
                  Nessun dato lascia il device: manca ancora un server a cui
                  inviarlo.
                </small>
              </span>
            </label>

            <div class="profile__queue">
              <span>
                Coda: <strong>{stats?.pending ?? '—'}</strong> in attesa ·{' '}
                {stats?.sent ?? 0} inviati · {stats?.failed ?? 0} falliti
              </span>
              <span class="profile__adapter">adattatore: {currentAdapterId()}</span>
              <span class="profile__queue-actions">
                <button type="button" onClick={refreshStats}>Aggiorna</button>
                <button
                  type="button"
                  onClick={async () => {
                    await clearQueue();
                    await refreshStats();
                  }}
                >
                  Svuota
                </button>
              </span>
            </div>
          </section>

          <section class="profile__section">
            <h2>Sessione</h2>
            <div class="profile__actions">
              <button type="button" onClick={() => void signOut()}>Esci</button>
              <button
                type="button"
                class="danger"
                onClick={async () => {
                  await deleteProfile();
                  setNotice({ text: 'Profilo eliminato.', kind: 'ok' });
                }}
              >
                Elimina profilo
              </button>
            </div>
            <p class="profile__hint">
              Uscire non tocca viaggi e varchi: restano sul device.
            </p>
          </section>
        </>
      )}

      {notice && (
        <p class="profile__msg" data-kind={notice.kind} role="status">
          {notice.text}
        </p>
      )}
    </div>
  );
}
