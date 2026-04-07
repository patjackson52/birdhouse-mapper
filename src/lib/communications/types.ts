export interface CommunicationTopic {
  id: string;
  org_id: string;
  property_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  topic_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  property_id: string | null;
  topic_id: string | null;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export type NotificationChannel = 'email' | 'in_app';
export type NotificationSendStatus = 'pending' | 'sent' | 'failed';

export interface NotificationSend {
  id: string;
  notification_id: string | null;
  user_id: string;
  topic_id: string;
  channel: NotificationChannel;
  status: NotificationSendStatus;
  sent_at: string | null;
  error_message: string | null;
}

export interface TopicWithCount extends CommunicationTopic {
  subscriber_count: number;
}

export interface SubscriptionWithTopic extends UserSubscription {
  topic: CommunicationTopic;
}
