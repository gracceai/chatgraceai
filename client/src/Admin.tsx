import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Avatar, { AVATARS, type AvatarVariant } from './components/Avatar';
import {
  adminLogin,
  adminLogout,
  fetchAdminSettings,
  fetchSiteConfig,
  removeSound,
  saveAdminSettings,
  uploadSound,
  type AdminSettings,
  type Suggestion,
} from './lib/api';
import { previewSound, setRecordedSources, type SoundEvent } from './lib/sound';

const SOUND_EVENTS: { id: SoundEvent; label: string }[] = [
  { id: 'send', label: 'When you send' },
  { id: 'reply', label: 'When Grace replies' },
  { id: 'thinking', label: 'While Grace thinks (loops)' },
  { id: 'support', label: 'Help dialog opens' },
];

const MAX_SUGGESTIONS = 8;

const inputClass =
  'w-full rounded-xl border border-outline/60 bg-surface px-3 py-2.5 text-[15px] text-ink outline-none transition focus:border-primary-tint';
const primaryButton =
  'h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-tint disabled:opacity-50';
const secondaryButton =
  'h-11 rounded-xl border border-outline/60 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-surface-low disabled:opacity-50';

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (action: () => Promise<void>, done = 'Saved') => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus({ ok: true, text: done });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  return { busy, status, run };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-outline/40 bg-white p-5">
      <h2 className="font-display text-lg font-bold text-primary-strong">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-6 text-ink-soft">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function SaveRow({
  busy,
  status,
  onSave,
  children,
}: {
  busy: boolean;
  status: { ok: boolean; text: string } | null;
  onSave: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onSave} disabled={busy} className={primaryButton}>
        Save
      </button>
      {children}
      {status && (
        <p role="status" className={`text-sm ${status.ok ? 'text-primary' : 'text-clay-ink'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const { busy, status, run } = useSaver();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await adminLogin(password);
      onSignedIn();
    }, '');
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-24 w-[min(92vw,22rem)] space-y-4 rounded-2xl border border-outline/40 bg-white p-6">
      <h1 className="font-display text-xl font-bold text-primary-strong">GraceAI admin</h1>
      <label className="block text-sm text-ink-soft">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className={`${inputClass} mt-1`}
        />
      </label>
      <button type="submit" disabled={busy || !password} className={`${primaryButton} w-full`}>
        Sign in
      </button>
      {status && !status.ok && (
        <p role="alert" className="text-sm text-clay-ink">
          {status.text}
        </p>
      )}
    </form>
  );
}

function ContactsSection({ settings }: { settings: AdminSettings }) {
  const [contacts, setContacts] = useState(settings.crisisContacts);
  const { busy, status, run } = useSaver();

  return (
    <Section
      title="Crisis contacts"
      hint="Shown in the Need help now dialog and given to Grace when someone may be in danger. Saved changes apply right away."
    >
      <textarea
        value={contacts}
        onChange={(e) => setContacts(e.target.value)}
        rows={3}
        maxLength={500}
        aria-label="Crisis contacts"
        className={inputClass}
      />
      <SaveRow busy={busy} status={status} onSave={() => run(() => saveAdminSettings({ crisisContacts: contacts }))} />
    </Section>
  );
}

function CompanionSection({ settings }: { settings: AdminSettings }) {
  const [companion, setCompanion] = useState(settings.defaultCompanion);
  const { busy, status, run } = useSaver();

  return (
    <Section title="Default companion" hint="Used for visitors who haven't picked one themselves.">
      <select value={companion} onChange={(e) => setCompanion(e.target.value)} aria-label="Default companion" className={inputClass}>
        {AVATARS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <SaveRow busy={busy} status={status} onSave={() => run(() => saveAdminSettings({ defaultCompanion: companion }))} />
    </Section>
  );
}

function SuggestionsSection({ settings }: { settings: AdminSettings }) {
  const [items, setItems] = useState<Suggestion[]>(settings.suggestions);
  const { busy, status, run } = useSaver();

  const update = (index: number, patch: Partial<Suggestion>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  return (
    <Section title="Suggestion chips" hint="The starter buttons on the empty chat screen. Up to 8. The message is sent as if the visitor typed it.">
      {items.map((item, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            value={item.label}
            onChange={(e) => update(index, { label: e.target.value })}
            maxLength={40}
            placeholder="Label"
            aria-label={`Label ${index + 1}`}
            className={inputClass}
          />
          <input
            value={item.message}
            onChange={(e) => update(index, { message: e.target.value })}
            maxLength={200}
            placeholder="Message"
            aria-label={`Message ${index + 1}`}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
            aria-label={`Remove chip ${index + 1}`}
            className={secondaryButton}
          >
            Remove
          </button>
        </div>
      ))}
      <SaveRow busy={busy} status={status} onSave={() => run(() => saveAdminSettings({ suggestions: items }))}>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { label: '', message: '' }])}
          disabled={items.length >= MAX_SUGGESTIONS}
          className={secondaryButton}
        >
          Add chip
        </button>
      </SaveRow>
    </Section>
  );
}

function PromptSection({ settings }: { settings: AdminSettings }) {
  const [prompt, setPrompt] = useState(settings.promptTemplate);
  const { busy, status, run } = useSaver();

  const reset = () => {
    if (!confirm("Reset Grace's instructions to the built-in version?")) return;
    void run(async () => {
      await saveAdminSettings({ promptTemplate: null });
      setPrompt(settings.defaultPromptTemplate);
    }, 'Reset to default');
  };

  return (
    <Section
      title="Grace's instructions"
      hint="The system prompt behind every reply. Keep {{crisisContacts}} in the text so the crisis contacts above reach Grace. Changes apply to the next message."
    >
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={18}
        maxLength={8000}
        aria-label="Grace's instructions"
        className={`${inputClass} font-mono text-sm leading-6`}
      />
      <SaveRow busy={busy} status={status} onSave={() => run(() => saveAdminSettings({ promptTemplate: prompt }))}>
        <button type="button" onClick={reset} disabled={busy} className={secondaryButton}>
          Reset to default
        </button>
      </SaveRow>
    </Section>
  );
}

function SoundsSection({ settings, onChanged }: { settings: AdminSettings; onChanged: () => Promise<void> }) {
  const { busy, status, run } = useSaver();
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ companion: AvatarVariant; event: SoundEvent } | null>(null);
  const isCustom = (companion: string, event: string) =>
    settings.sounds.some((sound) => sound.companion === companion && sound.event === event);

  const choose = (companion: AvatarVariant, event: SoundEvent) => {
    target.current = { companion, event };
    fileRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (!file || !target.current) return;
    const { companion, event } = target.current;
    void run(async () => {
      await uploadSound(companion, event, file);
      await onChanged();
    }, 'Uploaded');
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = (companion: AvatarVariant, event: SoundEvent) =>
    run(async () => {
      await removeSound(companion, event);
      await onChanged();
    }, 'Back to the built-in sound');

  return (
    <Section
      title="Sounds"
      hint="Upload a recording for any slot, or leave it on the built-in sound. MP3, OGG, WAV, M4A or WebM, up to 1 MB. Soft, short sounds work best; the thinking sound loops. Uploads apply to visitors' next page load."
    >
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Upload sound file" />
      {AVATARS.map(({ id, label }) => (
        <div key={id} className="rounded-xl border border-outline/40">
          <div className="flex items-center gap-3 border-b border-outline/30 px-4 py-3">
            <div className="flex w-10 justify-center">
              <Avatar variant={id} size="sm" />
            </div>
            <h3 className="font-display font-bold text-ink">{label}</h3>
          </div>
          <ul className="divide-y divide-outline/30">
            {SOUND_EVENTS.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {event.label}
                  <span className="ml-2 text-xs text-ink-soft">{isCustom(id, event.id) ? 'Custom' : 'Built-in'}</span>
                </span>
                <button type="button" onClick={() => void previewSound(id, event.id)} className={secondaryButton}>
                  Preview
                </button>
                <button type="button" onClick={() => choose(id, event.id)} disabled={busy} className={secondaryButton}>
                  Upload
                </button>
                {isCustom(id, event.id) && (
                  <button type="button" onClick={() => void remove(id, event.id)} disabled={busy} className={secondaryButton}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {status && (
        <p role="status" className={`text-sm ${status.ok ? 'text-primary' : 'text-clay-ink'}`}>
          {status.text}
        </p>
      )}
    </Section>
  );
}

export default function Admin() {
  const [settings, setSettings] = useState<AdminSettings | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSettings(await fetchAdminSettings());
      const siteConfig = await fetchSiteConfig();
      setRecordedSources(siteConfig.sounds);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load settings.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = async () => {
    await adminLogout();
    setSettings(null);
  };

  let content: ReactNode;
  if (loadError) {
    content = (
      <p role="alert" className="mx-auto mt-24 max-w-md px-4 text-center text-clay-ink">
        {loadError}
      </p>
    );
  } else if (settings === undefined) {
    content = null;
  } else if (settings === null) {
    content = <LoginForm onSignedIn={refresh} />;
  } else {
    content = (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-primary-strong">GraceAI admin</h1>
          <button type="button" onClick={signOut} className={secondaryButton}>
            Sign out
          </button>
        </div>
        <ContactsSection settings={settings} />
        <CompanionSection settings={settings} />
        <SuggestionsSection settings={settings} />
        <PromptSection settings={settings} />
        <SoundsSection settings={settings} onChanged={refresh} />
      </div>
    );
  }

  return <div className="grace-scrollbar h-[100dvh] overflow-y-auto bg-surface-low">{content}</div>;
}
