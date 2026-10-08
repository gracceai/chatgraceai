import Markdown from 'react-markdown';
import type { Message } from '../lib/api';

interface Props {
  message: Message;
  typing: boolean;
}

export default function ChatMessage({ message, typing }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint font-display text-sm font-bold text-primary">
        G
      </div>
      <div className="prose-grace max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] leading-relaxed text-ink shadow-sm">
        {typing ? (
          <span className="flex gap-1 py-1.5" aria-label="Grace is typing">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-2 w-2 animate-bounce rounded-full bg-primary-tint/60"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        ) : (
          <Markdown
            components={{
              a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
            }}
          >
            {message.content}
          </Markdown>
        )}
      </div>
    </div>
  );
}
