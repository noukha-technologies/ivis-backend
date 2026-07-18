export type DashboardKpiRaw = {
  vehicles_today: number;
  vehicles_yesterday: number;
  pass_today: number;
  pass_yesterday: number;
  fail_today: number;
  fail_yesterday: number;
  in_progress_today: number;
  in_progress_yesterday: number;
};

export type DashboardLineStatusRaw = {
  id: string;
  name: string;
  in_progress: number;
};

export type DashboardCameraStatusRaw = {
  active: number;
  total: number;
};

export type DashboardInProgressJobRaw = {
  job_id: string;
  plate_number: string;
  customer_name: string | null;
  line_name: string | null;
  started_at: Date | null;
};

export type DashboardSystemHealthRaw = {
  database_connected: boolean;
  last_anpr_capture_at: Date | null;
};

export type DashboardDayWindows = {
  todayStart: Date;
  todayEnd: Date;
  yesterdayStart: Date;
  yesterdayEnd: Date;
};

export interface IDashboardDao {
  getKpiCounts(
    centreId: string,
    windows: DashboardDayWindows,
  ): Promise<DashboardKpiRaw>;

  getLineInProgressCounts(centreId: string): Promise<DashboardLineStatusRaw[]>;

  getCameraStatus(centreId: string): Promise<DashboardCameraStatusRaw>;

  getInProgressJobs(
    centreId: string,
    limit: number,
  ): Promise<DashboardInProgressJobRaw[]>;

  getLastAnprCaptureAt(centreId: string): Promise<Date | null>;

  getLastAppointmentAt(centreId: string): Promise<Date | null>;

  getAppointmentsTodayCount(
    centreId: string,
    windows: DashboardDayWindows,
  ): Promise<number>;
}
