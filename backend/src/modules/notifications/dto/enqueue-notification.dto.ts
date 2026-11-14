import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export type NotificationChannelType = 'email' | 'sms';

/**
 * DTO for enqueueing a single notification.
 * Requirements: 13.1, 13.2
 */
export class EnqueueNotificationDto {
  @IsUUID()
  recipientId!: string;

  /** Notification type identifier, e.g. 'ENROLLMENT_CONFIRMATION' */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type!: string;

  @IsIn(['email', 'sms'])
  channel!: NotificationChannelType;

  /** The event that triggered this notification, e.g. 'student.enrolled' */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  triggerEvent!: string;

  /** Arbitrary key/value data needed by the notification template */
  @IsObject()
  payload!: Record<string, unknown>;
}
