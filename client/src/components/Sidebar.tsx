import type { Conversation } from '../lib/api';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  open,
  onClose,
  onNewChat,
  onSelect,
  onDelete,
}: Props) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 bg-ink/30 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-outline/50 bg-white transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-5 pb-4 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <svg viewBox="0 0 64 64" className="h-6 w-6">
              <path
                d="M32 46s-14-8.2-14-18.2C18 22.4 22 19 26.2 19c2.6 0 4.6 1.3 5.8 3.2 1.2-1.9 3.2-3.2 5.8-3.2C42 19 46 22.4 46 27.8 46 37.8 32 46 32 46z"
                fill="#c4eae3"
              />
            </svg>
          </div>
          <span className="font-display text-xl font-extrabold text-primary">GraceAI</span>
        </div>

        <div className="px-4">
          <button
            type="button"
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-display text-sm font-semibold text-white transition hover:bg-primary-tint"
          >
            <span className="text-lg leading-none">+</span> New conversation
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-2" aria-label="Past conversations">
          {conversations.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-soft/70">Your conversations will appear here.</p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`w-full truncate rounded-lg py-2 pl-3 pr-9 text-left text-sm transition ${
                      conversation.id === activeId
                        ? 'bg-primary-soft font-medium text-primary-strong'
                        : 'text-ink hover:bg-surface-low'
                    }`}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this conversation?')) onDelete(conversation.id);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-soft/60 opacity-0 transition hover:bg-white hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
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

        <div className="m-4 rounded-xl bg-mint/60 p-3 text-xs leading-relaxed text-mint-strong">
          <p className="font-semibold">Private by default</p>
          <p className="mt-1">No sign-up needed. Your chats are tied to this browser only.</p>
        </div>
      </aside>
    </>
  );
}
