import Markdown from 'react-markdown';
import type { Message } from '../lib/api';
import Avatar, { type AvatarVariant } from './Avatar';

interface Props {
  message: Message;
  typing: boolean;
  avatar: AvatarVariant;
}

const TYPING_STYLE: Record<AvatarVariant, string> = {
  pebble: 'typing-ripple',
  sprout: 'typing-wave',
  orb: 'typing-glow',
};

export default function ChatMessage({ message, typing, avatar }: Props) {
  if (message.role === 'user') {
    return (
      <div className="msg-rise flex justify-end pl-10 sm:pl-20">
        <div className="min-w-0 max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[15px] leading-6 text-white sm:max-w-[82%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="msg-rise flex items-end gap-2.5 pr-5 sm:pr-16">
      <div className="mb-1 shrink-0">
        <Avatar variant={avatar} size="sm" />
      </div>
      <div className="prose-grace min-w-0 max-w-full break-words rounded-2xl rounded-bl-md border border-outline/35 bg-white px-4 py-3 text-[15px] leading-6 text-ink sm:max-w-[88%]">
        {typing ? (
          <span className={`typing ${TYPING_STYLE[avatar]}`} role="status" aria-label="Grace is typing">
            <i />
            <i />
            <i />
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
