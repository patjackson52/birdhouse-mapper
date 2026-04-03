export const NOTIFICATION_TYPES = {
  TASK_REMINDER: 'task_reminder',
  TASK_ASSIGNED: 'task_assigned',
  TASK_COMPLETED: 'task_completed',
} as const;

export type NotificationTypeName = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  [NOTIFICATION_TYPES.TASK_REMINDER]: 'Task reminders',
  [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'Task assigned to me',
  [NOTIFICATION_TYPES.TASK_COMPLETED]: 'Task completed',
  '*': 'All notifications',
};

export const DEFAULT_CHANNEL_ENABLED: Record<string, boolean> = {
  in_app: true,
  email: true,
  sms: false,
};

export const CHANNELS = ['in_app', 'email', 'sms'] as const;
