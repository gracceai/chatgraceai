import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

interface Props {
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

const MAX_LENGTH = 4000;

export default function Composer({ streaming, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="z-10 shrink-0 border-t border-outline/30 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 md:px-7 md:pb-4">
      <form
        onSubmit={submit}
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-outline/60 bg-surface p-1.5 transition focus-within:border-primary-tint"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Share what’s on your mind..."
          aria-label="Message Grace"
          className="max-h-[200px] min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-[15px] leading-5 text-ink outline-none placeholder:text-ink-soft/50"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition hover:bg-primary-soft/70"
            aria-label="Stop Grace's reply"
          >
            <span className="h-3 w-3 rounded-[3px] bg-primary" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" />
            </svg>
          </button>
        )}
      </form>
      <p className="mx-auto mt-2.5 max-w-3xl text-center text-xs leading-4 text-ink-soft/80">
        Grace can make mistakes and isn&apos;t a replacement for professional care.
        <span className="hidden sm:inline"> If you&apos;re in immediate danger, contact emergency services.</span>
      </p>
    </div>
  );
}
