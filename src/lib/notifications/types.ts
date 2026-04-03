export type TaskStatus = 'pending' | 'completed' | 'cancelled';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Task {
  id: string;
  org_id: string;
  property_id: string | null;
  item_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskWatcher {
  id: string;
  task_id: string;
  user_id: string | null;
  role_id: string | null;
}

export interface TaskReminder {
  id: string;
  task_id: string;
  remind_before: string;
  sent_at: string | null;
}

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  reference_type: string;
  reference_id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  error: string | null;
  read_at: string | null;
  created_at: string;
}

export interface UserNotificationPreference {
  id: string;
  user_id: string;
  org_id: string;
  channel: NotificationChannel;
  notification_type: string;
  enabled: boolean;
}

export interface NotifyParams {
  orgId: string;
  type: string;
  title: string;
  body?: string;
  referenceType: string;
  referenceId: string;
  recipients: {
    userIds?: string[];
    roleIds?: string[];
  };
}

export interface NotificationAdapterPayload {
  to: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationAdapterResult {
  success: boolean;
  error?: string;
}

export interface NotificationAdapter {
  channel: 'email' | 'sms';
  send(payload: NotificationAdapterPayload): Promise<NotificationAdapterResult>;
}
