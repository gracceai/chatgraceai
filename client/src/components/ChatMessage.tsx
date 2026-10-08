import Markdown from 'react-markdown';
import type { Message } from '../lib/api';

interface Props {
  message: Message;
  typing: boolean;
}

export default function ChatMessage({ message, typing }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end pl-10 sm:pl-20">
        <div className="max-w-full whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[15px] leading-6 text-white sm:max-w-[82%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2.5 pr-5 sm:pr-16">
      <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint font-display text-sm font-bold text-primary">
        G
      </div>
      <div className="prose-grace max-w-full rounded-2xl rounded-bl-md border border-outline/35 bg-white px-4 py-3 text-[15px] leading-6 text-ink sm:max-w-[88%]">
        {typing ? (
          <span className="flex gap-1.5 px-0.5 py-1.5" aria-label="Grace is typing">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-tint/65"
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
