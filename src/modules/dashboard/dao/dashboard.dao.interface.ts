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
}
