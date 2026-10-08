import type { Conversation } from '../lib/api';
import Avatar, { AVATARS, type AvatarVariant } from './Avatar';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  avatar: AvatarVariant;
  onAvatarChange: (avatar: AvatarVariant) => void;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  avatar,
  onAvatarChange,
  open,
  onClose,
  onNewChat,
  onSelect,
  onDelete,
}: Props) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-primary-strong/25 backdrop-blur-[2px] md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[288px] max-w-[88vw] flex-col border-r border-outline/40 bg-white shadow-xl transition-transform duration-300 md:static md:max-w-none md:translate-x-0 md:shadow-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[72px] shrink-0 items-center gap-2.5 px-5">
          <div className="flex w-10 shrink-0 justify-center">
            <Avatar variant={avatar} size="sm" />
          </div>
          <span className="font-display text-xl font-bold tracking-[-0.03em] text-primary">GraceAI</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition hover:bg-surface-low md:hidden"
            aria-label="Close conversations"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-4 pt-1">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-tint"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New conversation
          </button>
        </div>

        <nav className="grace-scrollbar mt-6 min-h-0 flex-1 overflow-y-auto px-3" aria-label="Past conversations">
          <p className="mb-2 px-2 text-xs font-medium text-ink-soft/70">Recent</p>
          {conversations.length === 0 ? (
            <p className="px-2 py-2 text-sm text-ink-soft/70">No conversations yet.</p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`w-full truncate rounded-lg py-2.5 pl-3 pr-9 text-left text-sm transition ${
                      conversation.id === activeId
                        ? 'bg-primary-soft/70 font-medium text-primary-strong'
                        : 'text-ink-soft hover:bg-surface-low hover:text-ink'
                    }`}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this conversation?')) onDelete(conversation.id);
                    }}
                    className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft/65 opacity-100 transition hover:bg-white hover:text-clay-ink focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label={`Delete conversation ${conversation.title}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="mx-5 mb-4 border-t border-outline/40 pt-4">
          <p id="companion-label" className="mb-2 text-xs font-medium text-ink-soft/70">Companion</p>
          <div role="radiogroup" aria-labelledby="companion-label" className="flex gap-2">
            {AVATARS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={option.id === avatar}
                aria-label={option.label}
                onClick={() => onAvatarChange(option.id)}
                className={`flex h-12 flex-1 items-center justify-center rounded-xl border transition ${
                  option.id === avatar
                    ? 'border-primary-tint bg-primary-soft/70'
                    : 'border-outline/50 hover:bg-surface-low'
                }`}
              >
                <Avatar variant={option.id} size="sm" />
              </button>
            ))}
          </div>
        </div>

        <div className="mx-5 mb-5 flex items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-primary">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          <p><span className="font-medium text-ink">Private by default.</span><br />Chats stay in this browser.</p>
        </div>
      </aside>
    </>
  );
}
