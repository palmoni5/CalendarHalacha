/**
 * לוגיקת הלוח העברי המשותפת לכל הפרויקט.
 *
 * מקור אמת יחיד לכל החישובים העבריים: גם ה-UI של הלוח (`main.ts`)
 * וגם שכבת ה-tracking (`features/tracking/*`) חייבים לייבא מכאן —
 * אסור לשכפל את הלוגיקה הזו במקום אחר.
 *
 * הקובץ מספק:
 *   - חישוב פנימי של מבנה הלוח (אורך שנה/חודש, שנה מעוברת)
 *   - המרה דו־כיוונית בין תאריך עברי ל־`Date` גרגוריאני
 *   - פונקציה אסינכרונית `getHebrewDate(date)` שמשתמשת ב-Otzaria SDK
 *     עם fallback לחישוב הלוקאלי, ושומרת cache לפי dateKey
 *   - פעולות חשבון על תאריך עברי (חיבור ימים, מפתח לוגי)
 *   - ניסוח גימטריה (`toHebrewNumber`, `parseHebrewNumber`, `formatHebrewYear`)
 *
 * הערות חשובות:
 *   - "תאריך עברי" כאן הוא תאריך אזרחי במשמעות הלוח (יום מסוים בחודש מסוים).
 *     ההיממה ההלכתית מתחילה בשקיעה — `onah: 'night'` שייך לתאריך העברי
 *     שמתחיל באותו ערב. ההפרדה הזו נעשית בשכבת ה-tracking, לא כאן.
 *   - שדות שנגזרים מאירוע (חגים, שבת) מגיעים מה-host דרך `getHebrewDate`.
 *     ב-fallback הם תמיד ריקים.
 */

/// <reference path="../../types/otzaria_plugin.d.ts" />

export interface HolidayLabel {
  text: string;
  kind: 'yomTov' | 'roshChodesh' | 'taanit' | 'special';
}

export interface HebrewDate {
  day: number;
  month: number;
  year: number;
  monthName: string;
  isLeapYear: boolean;
  isShabbat: boolean;
  holidays: HolidayLabel[];
}

export const HEBREW_MONTH_NAMES = [
  'ניסן',
  'אייר',
  'סיון',
  'תמוז',
  'אב',
  'אלול',
  'תשרי',
  'חשון',
  'כסלו',
  'טבת',
  'שבט',
  'אדר',
];

export const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── חישובי לוח פנימיים (מבוססים על אלגוריתם ר.ד) ───────────────────────────

function _hIsLeap(y: number): boolean {
  return (7 * y + 1) % 19 < 7;
}

function _hElapsed(y: number): number {
  const mo = Math.floor((235 * y - 234) / 19);
  const p = 12084 + 13753 * mo;
  let d = mo * 29 + Math.floor(p / 25920);
  if ((3 * (d + 1)) % 7 < 3) d++;
  return d;
}

function _hYearLen(y: number): number {
  return _hElapsed(y + 1) - _hElapsed(y);
}

function _hDaysInMonth(m: number, y: number): number {
  if (m === 1 || m === 3 || m === 5 || m === 7 || m === 11) return 30;
  if (m === 2 || m === 4 || m === 6 || m === 10) return 29;
  if (m === 8) return _hYearLen(y) % 10 === 5 ? 30 : 29; // חשון
  if (m === 9) return _hYearLen(y) % 10 === 3 ? 29 : 30; // כסלו
  if (m === 12) return _hIsLeap(y) ? 30 : 29; // אדר א׳ / אדר
  if (m === 13) return 29; // אדר ב׳
  return 0;
}

function _hMonthsInYear(y: number): number {
  return _hIsLeap(y) ? 13 : 12;
}

function _hDaysBeforeMonth(y: number, m: number): number {
  let days = 0;
  if (m >= 7) {
    for (let i = 7; i < m; i++) days += _hDaysInMonth(i, y);
  } else {
    for (let i = 7; i <= _hMonthsInYear(y); i++) days += _hDaysInMonth(i, y);
    for (let i = 1; i < m; i++) days += _hDaysInMonth(i, y);
  }
  return days;
}

const HEBREW_EPOCH_RD = -1373428; // R.D. של א׳ תשרי שנה א
const UNIX_EPOCH_RD = 719163; // R.D. של 1/1/1970

/** ממיר תאריך עברי ל-Date גרגוריאני (חישוב מקומי, ללא host). */
export function hebrewToDate(y: number, m: number, d: number): Date | null {
  if (y < 1 || m < 1 || m > _hMonthsInYear(y) || d < 1 || d > _hDaysInMonth(m, y)) return null;
  const rd = HEBREW_EPOCH_RD + _hElapsed(y) + _hDaysBeforeMonth(y, m) + d - 1;
  return new Date((rd - UNIX_EPOCH_RD) * 86400000);
}

/** מספר הימים בחודש עברי. 30 או 29 בהתאם לחודש ולשנה. */
export function hebrewDaysInMonth(m: number, y: number): number {
  return _hDaysInMonth(m, y);
}

/** האם השנה העברית מעוברת (13 חודשים). */
export function isHebrewLeapYear(y: number): boolean {
  return _hIsLeap(y);
}

/** מספר החודשים בשנה (12 או 13). */
export function hebrewMonthsInYear(y: number): number {
  return _hMonthsInYear(y);
}

// ─── המרה הפוכה: Date → תאריך עברי (חישוב מקומי) ────────────────────────────

/**
 * חישוב מקומי של תאריך עברי מ-Date. משמש כ-fallback וכבסיס ל-`addDays`
 * וחישובים שלא דורשים host. החישוב מבוסס על חיפוש בינארי על R.D.
 */
function dateToHebrewLocal(date: Date): { day: number; month: number; year: number } {
  const rd = Math.floor(date.getTime() / 86400000) + UNIX_EPOCH_RD;
  const daysFromHebrewEpoch = rd - HEBREW_EPOCH_RD;

  // אומדן ראשוני לשנה: ~365.25 ימים בשנה גרגוריאנית, ~12.37 חודשים עבריים.
  // אפשר פשוט לחפש בינארית בטווח סביר.
  let lo = 1;
  let hi = Math.max(2, Math.floor(daysFromHebrewEpoch / 365) + 2);
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (_hElapsed(mid) <= daysFromHebrewEpoch) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const year = lo;
  const dayOfYear = daysFromHebrewEpoch - _hElapsed(year); // 0-based

  // איתור החודש על־ידי הצטברות אורכי חודשים בסדר תשרי..אלול
  const monthsCount = _hMonthsInYear(year);
  const monthOrder: number[] = [];
  for (let i = 7; i <= monthsCount; i++) monthOrder.push(i);
  for (let i = 1; i <= 6; i++) monthOrder.push(i);

  let acc = 0;
  for (const m of monthOrder) {
    const len = _hDaysInMonth(m, year);
    if (dayOfYear < acc + len) {
      return { day: dayOfYear - acc + 1, month: m, year };
    }
    acc += len;
  }

  // אמור להיות לא מגיע לכאן; כברירת מחדל מחזיר את היום האחרון של השנה.
  const lastMonth = monthOrder[monthOrder.length - 1]!;
  return { day: _hDaysInMonth(lastMonth, year), month: lastMonth, year };
}

/** ממיר Date גרגוריאני להגדרת תאריך עברי בסיסית, ללא נתוני חגים/שבת. */
export function dateToHebrew(date: Date): HebrewDate {
  const { day, month, year } = dateToHebrewLocal(date);
  const isLeapYear = _hIsLeap(year);
  return {
    day,
    month,
    year,
    monthName: getHebrewMonthName(month, isLeapYear),
    isLeapYear,
    isShabbat: date.getDay() === 6,
    holidays: [],
  };
}

export function getHebrewMonthName(month: number, isLeapYear: boolean): string {
  if (isLeapYear && month === 12) return 'אדר א׳';
  if (isLeapYear && month === 13) return 'אדר ב׳';
  return HEBREW_MONTH_NAMES[(month - 1) % HEBREW_MONTH_NAMES.length] ?? '';
}

// ─── פעולות חשבון על תאריך עברי ───────────────────────────────────────────

/** מחזיר מפתח לוגי ייחודי לתאריך עברי, מתאים לשימוש כ-Map key. */
export function hebrewDateKey(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/** האם שני תאריכים עבריים מתייחסים לאותו יום. */
export function isSameHebrewDate(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * מחבר מספר ימים לתאריך עברי. מחזיר תאריך עברי בסיסי
 * (ללא נתוני חגים/שבת — אלה דורשים את ה-host).
 */
export function addDaysHebrew(
  date: { year: number; month: number; day: number },
  days: number,
): { day: number; month: number; year: number } {
  const greg = hebrewToDate(date.year, date.month, date.day);
  if (!greg) {
    throw new Error(`addDaysHebrew: invalid hebrew date ${hebrewDateKey(date)}`);
  }
  const shifted = new Date(greg.getTime() + days * 86400000);
  return dateToHebrewLocal(shifted);
}

/**
 * מספר הימים בין שני תאריכים עבריים, **כולל** את יום ההתחלה ויום הסיום
 * (ספירה inclusive, כפי שדורשת ההלכה). דוגמה: מ-א' עד ג' → 3.
 */
export function hebrewDaysBetweenInclusive(
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): number {
  const a = hebrewToDate(from.year, from.month, from.day);
  const b = hebrewToDate(to.year, to.month, to.day);
  if (!a || !b) {
    throw new Error('hebrewDaysBetweenInclusive: invalid hebrew date');
  }
  const diffDays = Math.round((b.getTime() - a.getTime()) / 86400000);
  return diffDays + 1;
}

/**
 * מחזיר את החודש העברי הבא (מטפל במעבר שנה ובשנה מעוברת).
 */
export function nextHebrewMonth(year: number, month: number): { year: number; month: number } {
  const monthsCount = _hMonthsInYear(year);
  // סדר החודשים בשנה: ניסן(1)..אלול(6), תשרי(7)..אדר/אדר ב' (12 או 13).
  // המעבר השנתי הוא בין אלול (6) של שנה X לתשרי (7) של אותה שנה X.
  // בין אדר (12 רגילה / 13 מעוברת) של שנה X לניסן (1) של שנה X+1.
  if (month === 6) return { year, month: 7 };
  if (month === monthsCount) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

// ─── גישה ל-Otzaria עם cache + fallback ─────────────────────────────────────

const hebrewDateCache = new Map<string, Promise<HebrewDate>>();

function gregDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function fallbackHebrewDate(date: Date): HebrewDate {
  return dateToHebrew(date);
}

/**
 * תאריך עברי מלא (כולל חגים ושבת) דרך Otzaria SDK.
 * שומר cache לפי תאריך גרגוריאני. ב-fallback מחזיר חישוב לוקאלי
 * עם רשימת חגים ריקה.
 */
export async function getHebrewDate(date: Date): Promise<HebrewDate> {
  const key = gregDateKey(date);
  const cached = hebrewDateCache.get(key);
  if (cached) return cached;

  const request = (async (): Promise<HebrewDate> => {
    try {
      const response = await Otzaria.call<{
        year: number;
        month: number;
        day: number;
        isLeapYear?: boolean;
        monthName?: string;
        isShabbat?: boolean;
        holidays?: HolidayLabel[];
      }>('calendar.getJewishDate', { date: key });

      if (response.success && response.data) {
        const month = response.data.month;
        const isLeapYear = Boolean(response.data.isLeapYear);
        return {
          day: response.data.day,
          month,
          year: response.data.year,
          monthName: response.data.monthName ?? getHebrewMonthName(month, isLeapYear),
          isLeapYear,
          isShabbat: Boolean(response.data.isShabbat),
          holidays: response.data.holidays ?? [],
        };
      }
    } catch (error) {
      console.error('calendar.getJewishDate failed', error);
    }

    // הסרה מה-cache כדי שננסה שוב כש-host יענה
    hebrewDateCache.delete(key);
    return fallbackHebrewDate(date);
  })();

  hebrewDateCache.set(key, request);
  return request;
}

// ─── גימטריה ────────────────────────────────────────────────────────────────

const HEBREW_LETTER_VALUES: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90,
  'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
};

export function toHebrewNumber(value: number): string {
  if (value <= 0) return '';

  const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת'];

  if (value === 15) return 'טו';
  if (value === 16) return 'טז';

  let remaining = value;
  let output = '';

  while (remaining >= 400) {
    output += 'ת';
    remaining -= 400;
  }
  if (remaining >= 100) {
    output += hundreds[Math.floor(remaining / 100)];
    remaining %= 100;
  }
  if (remaining >= 10) {
    output += tens[Math.floor(remaining / 10)];
    remaining %= 10;
  }
  if (remaining > 0) {
    output += units[remaining];
  }
  return output;
}

/** קלט מספרי או גימטריה ("תשפז", "ה'תשפ"ז", "י"ג") → מספר. */
export function parseHebrewNumber(input: string): number {
  if (!input) return NaN;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  let cleaned = trimmed.replace(/["'״׳\s]/g, '');
  if (cleaned.startsWith('ה') && cleaned.length > 1) cleaned = cleaned.slice(1);
  let total = 0;
  for (const ch of cleaned) {
    const v = HEBREW_LETTER_VALUES[ch];
    if (v === undefined) return NaN;
    total += v;
  }
  return total > 0 ? total : NaN;
}

export function formatHebrewYear(year: number): string {
  const reduced = year % 1000;
  const text = toHebrewNumber(reduced);
  if (!text) return String(year);
  if (text.length === 1) return `ה׳${text}׳`;
  return `ה׳${text.slice(0, -1)}״${text.slice(-1)}`;
}
