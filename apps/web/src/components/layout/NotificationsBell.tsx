import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime, type Notification } from '@sensads/core';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead, useUnreadCount } from '@/hooks/useNotifications';
import { cn } from '@/lib/cn';

export function NotificationsBell(): JSX.Element {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const { data: notifications } = useNotifications();
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleClick = (notif: Notification) => {
    if (!notif.isRead) void markRead.mutateAsync({ id: notif.id });
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-textSecondary hover:bg-card hover:text-textPrimary"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border p-3">
            <h3 className="text-sm font-semibold text-textPrimary">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <CheckCheck className="h-3 w-3" />Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-textSecondary">Aucune notification</p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={cn(
                    'w-full border-b border-border/40 p-3 text-left last:border-0 hover:bg-background/40',
                    !notif.isRead && 'bg-accent/5',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notif.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', !notif.isRead && 'font-semibold text-textPrimary')}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-textSecondary line-clamp-2">{notif.body}</p>
                      <p className="mt-1 text-[10px] text-textSecondary/60">
                        {formatRelativeTime(notif.createdAt, lang)}
                      </p>
                    </div>
                    {notif.isRead && <Check className="h-3 w-3 text-textSecondary/40 shrink-0" />}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="border-t border-border p-2">
            <button
              onClick={() => { setOpen(false); navigate('/account/notifications'); }}
              className="w-full rounded-md py-1.5 text-center text-xs text-accent hover:bg-accent/10"
            >
              Préférences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
