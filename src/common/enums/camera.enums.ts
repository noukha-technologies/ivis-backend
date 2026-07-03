export enum CameraIntegrationMethod {
  PUSH = 'http',
  FTP = 'ftp',
}

export enum CameraStatus {
  NOT_REACHABLE = 'NOT_REACHABLE',
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
  DISCONNECTED = 'DISCONNECTED',
}

export enum AnprCaptureStatus {
  PENDING = 'Pending',
  VALIDATED = 'Validated',
  REJECTED = 'Rejected',
}
