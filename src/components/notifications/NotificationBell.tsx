'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import NotificationItem from './NotificationItem';
import type { Notification } from '@/lib/notifications/types';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications', 'in_app'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('channel', 'in_app')
        .order('created_at', { ascending: false })
        .limit(20);
      return (data as Notification[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'in_app'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<Notification[]>(['notifications', 'in_app']) ?? [];
      const unreadIds = current.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'in_app'] });
    },
  });

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg transition-colors text-sage hover:text-forest-dark hover:bg-sage-light relative"
        title="Notifications"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-meadow text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-sage-light overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sage-light">
            <h3 className="text-sm font-semibold text-forest-dark">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-meadow hover:text-meadow/80 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-sage-light/50">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-sm text-sage text-center">
                No notifications yet
              </p>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
