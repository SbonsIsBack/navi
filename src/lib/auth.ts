import { signal } from '@preact/signals';
import { db, getSetting, setSetting, type AuthProvider, type Profile } from '@/lib/db';

/**
 * Autenticazione dell'app.
 *
 * L'accesso è **completamente opzionale**: nessuna schermata è protetta e
 * tutte le funzioni (tachimetro, varchi, storico) restano disponibili senza
 * profilo. Il login serve solo a dare un'identità ai dati in vista di un
 * futuro sync, non a sbloccare qualcosa.
 */

const SESSION_KEY = 'auth:profileId';

/** Profilo attivo, oppure `null` se si sta usando l'app senza account. */
export const currentProfile = signal<Profile | null>(null);
/** `false` finché non si è tentato di rileggere la sessione dal DB. */
export const authReady = signal(false);

export const AVATAR_EMOJI = ['🚗', '🏎️', '🚙', '🛻', '🚐', '🏍️', '🚕', '🦊', '🐺', '⚡'];
export const AVATAR_COLORS = [
  '#2ee6a6',
  '#3da5ff',
  '#ffc23d',
  '#ff7a59',
  '#c084fc',
  '#8fa3c4',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

/** Rilegge la sessione salvata. Da chiamare una volta all'avvio. */
export async function restoreSession(): Promise<Profile | null> {
  const id = await getSetting<number | null>(SESSION_KEY, null);
  currentProfile.value = id != null ? ((await db.profiles.get(id)) ?? null) : null;
  authReady.value = true;
  return currentProfile.value;
}

async function activate(profile: Profile): Promise<Profile> {
  await setSetting(SESSION_KEY, profile.id!);
  currentProfile.value = profile;
  return profile;
}

/**
 * Accesso con l'utente di test locale.
 *
 * Non c'è nessuna verifica di credenziali e non deve essercene: è un profilo
 * fittizio che vive solo su questo device, pensato per provare l'app e per
 * dare una forma ai dati prima che esista un backend.
 */
export async function signInLocal(displayName = 'Utente Test'): Promise<Profile> {
  const existing = await db.profiles.where('provider').equals('local').first();
  if (existing) return activate(existing);

  const now = Date.now();
  const profile: Profile = {
    displayName,
    provider: 'local',
    providerId: null,
    email: null,
    avatarEmoji: pick(AVATAR_EMOJI),
    avatarColor: pick(AVATAR_COLORS),
    avatarPhoto: null,
    createdAt: now,
    updatedAt: now,
  };
  const id = await db.profiles.add(profile);
  return activate({ ...profile, id });
}

/** Chiude la sessione. Il profilo resta nel DB, con i suoi dati. */
export async function signOut(): Promise<void> {
  await setSetting<number | null>(SESSION_KEY, null);
  currentProfile.value = null;
}

export async function updateProfile(
  patch: Partial<Pick<Profile, 'displayName' | 'avatarEmoji' | 'avatarColor' | 'avatarPhoto'>>,
): Promise<void> {
  const profile = currentProfile.peek();
  if (!profile?.id) return;
  const updated = { ...profile, ...patch, updatedAt: Date.now() };
  await db.profiles.put(updated);
  currentProfile.value = updated;
}

/** Elimina il profilo attivo e chiude la sessione. */
export async function deleteProfile(): Promise<void> {
  const profile = currentProfile.peek();
  if (!profile?.id) return;
  await db.profiles.delete(profile.id);
  await signOut();
}

export class ProviderNotAvailableError extends Error {
  constructor(public provider: AuthProvider) {
    super(
      `Accesso ${provider === 'apple' ? 'Apple' : 'Google'} non ancora disponibile: ` +
        `richiede un backend che validi il token del provider.`,
    );
    this.name = 'ProviderNotAvailableError';
  }
}

/**
 * Punto di innesto per i login federati.
 *
 * Il flusso è tracciato ma non implementato di proposito: Sign in with Apple
 * e Google restituiscono un token che **deve** essere verificato lato server
 * contro le chiavi pubbliche del provider. Farlo nel browser sarebbe teatro,
 * non autenticazione. Quando esisterà il backend, qui si sostituisce il lancio
 * dell'errore con la chiamata al provider e si crea il profilo con
 * `provider`/`providerId` valorizzati — il resto dell'app non cambia.
 */
export async function signInWithProvider(provider: 'apple' | 'google'): Promise<Profile> {
  throw new ProviderNotAvailableError(provider);
}
