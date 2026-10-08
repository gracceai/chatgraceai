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
    <div className="border-t border-outline/50 bg-white px-4 pb-4 pt-3 md:px-6">
      <form onSubmit={submit} className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Message Grace..."
          aria-label="Message Grace"
          className="flex-1 resize-none rounded-2xl border border-outline/70 bg-surface px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-primary-tint focus:ring-2 focus:ring-primary-soft"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-primary-soft/70"
            aria-label="Stop Grace's reply"
          >
            <span className="h-3.5 w-3.5 rounded-sm bg-primary" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" />
            </svg>
          </button>
        )}
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-ink-soft/80">
        Grace is an AI companion, not a replacement for professional care. If you are in danger,
        contact emergency services right away.
      </p>
    </div>
  );
}
