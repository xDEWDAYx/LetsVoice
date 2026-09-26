/**
 * 相对时间不直接拼接文案，只描述“今天 / 昨天 / 绝对日期”，
 * 由组件通过 i18n 渲染，保证跟随设置里的界面语言。
 */
export interface RelativeUpdatedTime {
  labelKey: 'dashboard.time.today' | 'dashboard.time.yesterday' | null;
  time: string;
  absoluteText: string;
}

export class DashboardTimeUtil {
  /**
   * Converts raw duration in seconds to formatted "Xh Ym" or "Ym" string
   */
  public static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Formats year, month (1-indexed), and day into standard YYYY-MM-DD string
   */
  public static formatYYYYMMDD(
    year: number,
    month: number,
    day: number,
  ): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * Formats Date instance to standard YYYY-MM-DD HH:MM string
   */
  public static formatDateTime(date: Date): string {
    const ymd = this.formatYYYYMMDD(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    );
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${ymd} ${hours}:${mins}`;
  }

  /**
   * Describes a Date relative to current time (today / yesterday / MM-DD HH:MM)
   */
  public static describeRelativeUpdatedTime(
    date: Date,
    referenceNow: Date = new Date(),
  ): RelativeUpdatedTime {
    const diffMs = referenceNow.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    const time = `${hours}:${mins}`;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const absoluteText = `${month}-${day} ${time}`;

    if (diffHours < 24 && referenceNow.getDate() === date.getDate()) {
      return { labelKey: 'dashboard.time.today', time, absoluteText };
    }
    if (diffHours < 48) {
      return { labelKey: 'dashboard.time.yesterday', time, absoluteText };
    }
    return { labelKey: null, time, absoluteText };
  }

  /**
   * Retrieves current computer system year, month (1-indexed), and day of the month
   */
  public static getCurrentYearMonth(): {
    year: number;
    month: number;
    currentDay: number;
  } {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      currentDay: now.getDate(),
    };
  }

  /**
   * Calculates days in month and starting day of week (0=Sun, 6=Sat) for a given year and month
   */
  public static getMonthCalendarInfo(
    year: number,
    month: number,
  ): { daysInMonth: number; startDayOfWeek: number } {
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDayOfWeek = new Date(year, month - 1, 1).getDay();
    return { daysInMonth, startDayOfWeek };
  }

  /**
   * Formats display string for Calendar Header in the given UI language
   * (e.g., "2026年8月" for zh, "August 2026" for en)
   */
  public static formatYearMonthDisplay(
    year: number,
    month: number,
    locale: string = 'zh',
  ): string {
    try {
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
      }).format(new Date(year, month - 1, 1));
    } catch {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }

  /**
   * Returns standard YYYY-MM-DD string for a given day in the current system month
   */
  public static getSystemMonthDayString(day: number): string {
    const { year, month } = this.getCurrentYearMonth();
    const maxDays = new Date(year, month, 0).getDate();
    const validDay = Math.min(Math.max(1, day), maxDays);
    return this.formatYYYYMMDD(year, month, validDay);
  }
}
