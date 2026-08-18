export const enum USER_ROLES {
  ADMIN = 'admin',
  SYSTEM_ADMIN = 'system_admin',
  CLIENT_ADMIN = 'client_admin',
}

export const enum DATABASE_SCHEMAS {
  CORE = 'core',
  MASTER = 'master',
  TRANSACTION = 'transaction',
}

export const enum CameraIntegrationMethods {
  FTP = 'ftp',
  HTTP = 'http',
}

export const enum ChargeCategory {
  BELOW3T_LT1500CC = 'Below3T_Lt1500cc',
  BELOW3T_1500TO3000CC = 'Below3T_1500To3000cc',
  BELOW3T_3000TO4500CC = 'Below3T_3000To4500cc',
  BELOW3T_ABOVE4500CC = 'Below3T_Above4500cc',
  BELOW3T_TRACTOR = 'Below3T_Tractor',
  THREE_TO_5_TONES = '3To5Tones',
  ABOVE5_TONES = 'Above5Tones',
}

export type FullHealthCheckResult = {
  camera: {
    id: string;
    code: string;
    camera_name: string;
    ip_address: string;
  };
  healthStatus: string;
  lastCheck: Date | null;
  checks: {
    ping: {
      status: 'PASS' | 'FAIL';
      message: string;
    };
  };
};

export enum WebhookResolveReason {
  ALIAS = 'alias',
  CAMERA_CODE = 'camera_code',
  CENTRE_CODE = 'centre_code',
  REQUEST_IP = 'request_ip',
}

export enum ProcessedStrategy {
  MOVE = 'move',
  DELETE = 'delete',
  NONE = 'none',
}

export enum AppointmentStatus {
  QUEUED = 'Queued',
  SCHEDULED = 'Scheduled',
  CANCELLED = 'Cancelled',
  CONVERTED = 'Converted',
}

export enum RopVerificationStatus {
  PENDING = 'Pending',
  VALIDATED = 'Fetched',
  FAILED = 'Failed',
}

/** The two event types the provider's POST /events accepts. */
export enum TajdeedEventType {
  INSPECTION_RESULT = 'INSPECTION_RESULT',
  LANE_STATUS = 'LANE_STATUS',
}

/**
 * Whether the event reached the provider — OUR side of the exchange.
 *
 * Deliberately separate from TajdeedEventStatus: delivery answers "did it
 * land", the provider's status answers "did it apply". A row can be Accepted
 * and still FAILED, which is exactly the case an operator must act on, and
 * collapsing the two would hide it.
 */
export enum TajdeedDeliveryStatus {
  /** Enqueued, not yet sent (or waiting on next_attempt_at). */
  PENDING = 'Pending',
  /** The provider returned 202, or E0007 meaning it already held the event. */
  ACCEPTED = 'Accepted',
  /** Accepted AND the provider confirmed it applied it. Terminal, success. */
  PROCESSED = 'Processed',
  /** The provider rejected it during processing. Terminal; needs a new event. */
  FAILED = 'Failed',
  /** Non-retryable 4xx on send — the payload or credential is wrong. Terminal. */
  ABANDONED = 'Abandoned',
}

/** The provider's own processing status, read back from /events/:id/status. */
export enum TajdeedEventStatus {
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  NOT_FOUND = 'NOT_FOUND',
}

export enum AppointmentTypes {
  PAID = 'Paid',
  UNPAID = 'Unpaid',
}

// Booking kind — how the appointment originated. Distinct from AppointmentTypes
// (Paid/Unpaid). Walk-in = created manually at the centre; Online = ANPR-queued
// or external online-booking API.
export enum BookingType {
  WALK_IN = 'Walk-in',
  ONLINE = 'Online',
}
