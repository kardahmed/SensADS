import type { Notification, NotificationSeverity } from '../types';

export interface DbNotification {
  id: string;
  recipient_id: string;
  type: string;
  severity: NotificationSeverity;
  category: string;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export function dbNotificationToNotification(db: DbNotification): Notification {
  return {
    id: db.id,
    recipientId: db.recipient_id,
    type: db.type,
    severity: db.severity,
    category: db.category,
    title: db.title,
    body: db.body,
    link: db.link,
    metadata: db.metadata,
    isRead: db.is_read,
    readAt: db.read_at,
    createdAt: db.created_at,
  };
}
