'use client';

import Link from 'next/link';
import type { Notification } from '@/lib/notifications/types';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getNotificationHref(notification: Notification): string {
  if (notification.reference_type === 'task') {
    return `/manage?task=${notification.reference_id}`;
  }
  if (notification.reference_type === 'item') {
    return `/manage/edit?id=${notification.reference_id}`;
  }
  return '/manage';
}

export default function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const isUnread = !notification.read_at;

  return (
    <Link
      href={getNotificationHref(notification)}
      onClick={() => { if (isUnread) onMarkRead(notification.id); }}
      className={`block px-4 py-3 hover:bg-sage-light/50 transition-colors ${
        isUnread ? 'bg-meadow/5' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {isUnread && (
          <span className="mt-1.5 w-2 h-2 rounded-full bg-meadow flex-shrink-0" />
        )}
        <div className={`flex-1 min-w-0 ${isUnread ? '' : 'ml-4'}`}>
          <p className="text-sm font-medium text-forest-dark truncate">
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs text-sage mt-0.5 truncate">
              {notification.body}
            </p>
          )}
          <p className="text-xs text-sage/70 mt-1">
            {timeAgo(notification.created_at)}
          </p>
        </div>
      </div>
    </Link>
  );
}
