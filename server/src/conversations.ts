import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
}

export interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

const listStmt = db.prepare(
  'SELECT id, title, updated_at FROM conversations WHERE session_id = ? ORDER BY updated_at DESC LIMIT 100',
);
const ownedStmt = db.prepare('SELECT id FROM conversations WHERE id = ? AND session_id = ?');
const createStmt = db.prepare(
  'INSERT INTO conversations (id, session_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
);
const touchStmt = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM conversations WHERE id = ? AND session_id = ?');
const messagesStmt = db.prepare(
  'SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC',
);
const recentMessagesStmt = db.prepare(`
  SELECT role, content FROM (
    SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
  ) ORDER BY id ASC
`);
const addMessageStmt = db.prepare(
  'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)',
);

export function listConversations(sessionId: string): Conversation[] {
  return (listStmt.all(sessionId) as { id: string; title: string; updated_at: number }[]).map(
    (row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }),
  );
}

export function isOwnedBy(conversationId: string, sessionId: string): boolean {
  return ownedStmt.get(conversationId, sessionId) !== undefined;
}

export function createConversation(sessionId: string, firstMessage: string): string {
  const id = randomUUID();
  const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New conversation';
  const now = Date.now();
  createStmt.run(id, sessionId, title, now, now);
  return id;
}

export function deleteConversation(conversationId: string, sessionId: string): boolean {
  return Number(deleteStmt.run(conversationId, sessionId).changes) > 0;
}

export function getMessages(conversationId: string): StoredMessage[] {
  return (
    messagesStmt.all(conversationId) as {
      id: number;
      role: 'user' | 'assistant';
      content: string;
      created_at: number;
    }[]
  ).map((row) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.created_at }));
}

export function getRecentMessages(conversationId: string, limit: number) {
  return recentMessagesStmt.all(conversationId, limit) as {
    role: 'user' | 'assistant';
    content: string;
  }[];
}

export function addMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
  const now = Date.now();
  addMessageStmt.run(conversationId, role, content, now);
  touchStmt.run(now, conversationId);
}
