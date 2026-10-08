import { useEffect, useRef, useState } from 'react';
import { fetchCrisisContacts } from '../lib/api';
import { playSupport } from '../lib/sound';
import type { AvatarVariant } from './Avatar';

const FALLBACK_CONTACTS = 'your local emergency services or the nearest hospital';

export default function HelpDialog({ avatar }: { avatar: AvatarVariant }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [contacts, setContacts] = useState(FALLBACK_CONTACTS);

  useEffect(() => {
    fetchCrisisContacts()
      .then(setContacts)
      .catch(() => {});
  }, []);

  const open = () => {
    dialogRef.current?.showModal();
    playSupport(avatar);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="ml-auto flex h-11 items-center rounded-full bg-clay-soft px-4 text-sm font-semibold text-clay-ink transition hover:bg-clay/30"
      >
        <span className="sm:hidden">Help</span>
        <span className="hidden sm:inline">Need help now</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="help-title"
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-outline/50 bg-white p-6 text-ink backdrop:bg-primary-strong/25"
      >
        <h2 id="help-title" className="font-display text-xl font-bold text-primary-strong">
          You&apos;re not alone
        </h2>
        <p className="mt-3 text-[15px] leading-7 text-ink-soft">
          If you&apos;re in immediate danger or thinking about hurting yourself, please contact {contacts} right now.
        </p>
        <p className="mt-3 text-[15px] leading-7 text-ink-soft">
          If you can, tell someone you trust nearby where you are and how you feel. I&apos;m still here to talk
          with you.
        </p>
        <form method="dialog" className="mt-5 flex justify-end">
          <button
            type="submit"
            className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-tint"
          >
            Back to chat
          </button>
        </form>
      </dialog>
    </>
  );
}
