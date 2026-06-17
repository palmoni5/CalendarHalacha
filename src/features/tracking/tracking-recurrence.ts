/**
 * גנרטורים מחזוריים טהורים — היסוד החישובי של זמני הפרישה.
 *
 * מקור הלכתי: `יסוד הטהרה משוכתב.md` (פרקים י–יא) ו-`הלכות.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * עיקרון יסוד (חובה לשמור):
 *   1. כל הפונקציות כאן הן PURE — ללא DOM, ללא state גלובלי, ללא תאריך "עכשיו".
 *      קלט → פלט בלבד. כך הן ניתנות לבדיקה ולשחזור.
 *   2. אין כאן שום `if` הלכתי. הפונקציות הן *מתמטיקה של מחזוריות* בלבד. המיפוי
 *      בין הלכה לפונקציה חי ב-JSON (`halachic-rules.json`) וב-`הלכות.md`.
 *   3. מצבי-גבול (חודש חסר, גלישת דילוג) אינם מוכרעים כאן — הם מסומנים
 *      `needsDecision: true` + `decisionKey`, וההכרעה נעשית בדרגה הגבוהה
 *      (`setting_dependent` או `requires_user_decision`). ראה `DecisionTier`.
 *   4. ספירת ימים תמיד INCLUSIVE (כוללת יום התחלה ויום סיום) — `הלכות.md` ש' 153.
 *      מרווח של N ימים inclusive = פער של N-1 ימים גרגוריאניים.
 *   5. מודל הזמן עברי בלבד. כל הפונקציות מקבלות ומחזירות `HebrewDate` + `Onah`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * מיפוי תבניות הלכתיות → גנרטור (ראה ניתוח המחזוריות):
 *   • וסת החודש / סירוג        → `monthlyRecurrence`        (אותו יום-בחודש כל k חודשים)
 *   • וסת הפלגה (מרווח יחיד)    → `intervalRecurrence`
 *   • וסת הפלגה (ריבוי פעילות)  → `activeHaflagaPrishot`     (פרק י' ז-ט — קריטי)
 *   • וסת שבוע                  → `weeklyRecurrence`
 *   • דילוג הפלגה               → `arithmeticIntervalSeries`
 *   • דילוג יום בחודש           → `arithmeticMonthDaySeries`
 *
 * הערה: מודול זה אינו מחובר עדיין למנוע החי (`tracking-engine.ts`). חיבורו —
 * החלפת/הרחבת האופרטורים הגנריים — הוא צעד נפרד ומכוון, לאחר בדיקות.
 */

import {
  getHebrewMonthName,
  hebrewDaysInMonth,
  isHebrewLeapYear,
  nextHebrewMonth,
} from '../../shared/hebrew-calendar.js';
import type { HebrewDate, Onah } from './tracking-types.js';
import {
  addDaysToHebrew,
  daysBetweenInclusive,
  hydrateHebrewDate,
  shiftByHebrewMonth,
} from './tracking-utils.js';

// ─── טיפוסים מקומיים ─────────────────────────────────────────────────────────

/** עוגן: נקודת הזמן שממנה מתחילה המחזוריות (תאריך עברי + עונה). */
export interface Anchor {
  date: HebrewDate;
  onah: Onah;
}

/** ראיה לצורך חישוב — המינימום שהגנרטורים צריכים (מנותק מ-`UserEvent`). */
export interface Sighting {
  hebrewDate: HebrewDate;
  onah: Onah;
}

/**
 * מופע פרישה מחושב. `needsDecision` מסמן מצב-גבול שאסור להכריע בקוד:
 * השכבה הקוראת תפתח `PendingDecision` (`decisionKey`) או תקרא הגדרת משתמש.
 */
export interface RecurrenceOccurrence {
  date: HebrewDate;
  onah: Onah;
  /** מרווח/היסט שממנו נגזר המופע — לתצוגה ולנימוק (אינו לוגיקה). */
  intervalDays?: number;
  monthOffset?: number;
  warning?: string;
  needsDecision?: boolean;
  decisionKey?: string;
}

export type MissingDayFallback = 'next_month_first_day' | 'previous_existing_day' | 'skip';

// ─── 1. מחזוריות חודשית: וסת החודש / וסת סירוג ──────────────────────────────
//
// מקור: וסת החודש — `משוכתב` ש' 142-146; וסת סירוג — ש' 401-411.
// אותה מחזוריות בדיוק; ההבדל היחיד הוא `monthInterval` (1 לחודש, X לסירוג).
// העונה נשמרת כעונת העוגן ("פורשת בעונה שבה ראתה", ש' 148).

/**
 * מייצר `count` מופעים עתידיים באותו יום-בחודש העברי, כל `monthInterval` חודשים.
 *
 * @param anchor         יום הראיה + עונתה.
 * @param monthInterval  מרווח חודשים (1 = וסת חודש, X>1 = וסת סירוג).
 * @param count          כמה מופעים עתידיים לייצר (לפי הגדרת "חודשים קדימה").
 * @param fallback       טיפול ביום שאינו קיים בחודש היעד (ל' בחודש חסר).
 *                       זוהי **הגדרה** (`setting_dependent`) — ראה `הלכות.md` ש' 12-16.
 */
export function monthlyRecurrence(
  anchor: Anchor,
  monthInterval: number,
  count: number,
  fallback: MissingDayFallback,
): RecurrenceOccurrence[] {
  const out: RecurrenceOccurrence[] = [];
  for (let k = 1; k <= count; k++) {
    const r = shiftByHebrewMonth(anchor.date, monthInterval * k, fallback);
    if (!r.target) continue; // fallback === 'skip' ויום לא קיים
    out.push({
      date: r.target,
      onah: anchor.onah,
      monthOffset: monthInterval * k,
      warning: r.warning,
    });
  }
  return out;
}

// ─── 2. מחזוריות מרווח: וסת הפלגה (מרווח יחיד) ───────────────────────────────
//
// מקור: `משוכתב` ש' 86-103. המרווח inclusive (ש' 92). העונה = עונת הראיה
// שממנה מודדים קדימה (ש' 98).

/**
 * מייצר `count` מופעי פרישה בקצב מרווח קבוע (inclusive) מהעוגן.
 * מופע ראשון = העוגן + (intervalDays-1). כל מופע נוסף — מרווח זהה מקודמו.
 *
 * @param intervalDays  מרווח inclusive (לדוגמה 25 = פער 24 ימים).
 */
export function intervalRecurrence(
  anchor: Anchor,
  intervalDays: number,
  count: number,
): RecurrenceOccurrence[] {
  const out: RecurrenceOccurrence[] = [];
  let cursor = anchor.date;
  for (let k = 0; k < count; k++) {
    cursor = addDaysToHebrew(cursor, intervalDays - 1);
    out.push({ date: cursor, onah: anchor.onah, intervalDays });
  }
  return out;
}

// ─── 3. הפלגות פעילות מרובות: פרק י' ז-ט (קריטי) ────────────────────────────
//
// מקור: `משוכתב` ש' 113-131. בכל ראיה חדשה פורשים בכל ההפלגות ה"פעילות",
// כולן נמדדות מהראיה האחרונה. הפלגה X נעקרת רק אם הופיעה אחריה הפלגה ≥X
// (ש' 117-119). הפלגה קצרה אינה עוקרת ארוכה שקדמה לה (ש' 116).
//
// כל הפלגה נושאת את עונת הראיה ש"סגרה" אותה (ש' 101-103), אך נמדדת מהאחרונה.
//
// הערה על תנאי "עבר ולא ראתה" (ש' 106): זו עקירה *תלוית-זמן*, המתרחשת כשמועד
// הפרישה חולף בלי ראיה חדשה. היא אינה שייכת לפונקציה הטהורה הזו (שאין לה מושג
// "עכשיו") — היא מטופלת בשכבת ה-state כשמסמנים מופע כ-expired.

/** מרווח בין שתי ראיות עוקבות, נושא את עונת הראיה הסוגרת. */
export interface IntervalEntry {
  intervalDays: number; // inclusive
  onah: Onah;           // עונת הראיה הסוגרת (המאוחרת)
  closingIndex: number; // אינדקס הראיה הסוגרת ברשימה הממוינת
}

/** הפלגה בבדיקת פעילות. */
export interface HaflagaStatus extends IntervalEntry {
  isActive: boolean;
  /** אם נעקרה — ערך ההפלגה ה-≥ שהופיעה אחריה ועקרה אותה. */
  uprootedByIntervalDays?: number;
}

/** מחזיר את כל המרווחים inclusive בין ראיות עוקבות (ממוינות מהישן לחדש). */
export function inclusiveIntervals(sortedSightings: Sighting[]): IntervalEntry[] {
  const res: IntervalEntry[] = [];
  for (let i = 1; i < sortedSightings.length; i++) {
    const prev = sortedSightings[i - 1]!;
    const curr = sortedSightings[i]!;
    res.push({
      intervalDays: daysBetweenInclusive(prev.hebrewDate, curr.hebrewDate),
      onah: curr.onah,
      closingIndex: i,
    });
  }
  return res;
}

/**
 * מסווג כל הפלגה כפעילה/נעקרה לפי כלל פרק י' ז-ט.
 * הפלגה נעקרת אם מאוחר ממנה קיימת הפלגה ≥ ערכה (ש' 119).
 */
export function classifyHaflagot(sortedSightings: Sighting[]): HaflagaStatus[] {
  const intervals = inclusiveIntervals(sortedSightings);
  return intervals.map((entry, idx): HaflagaStatus => {
    let uprootedByIntervalDays: number | undefined;
    for (let j = idx + 1; j < intervals.length; j++) {
      if (intervals[j]!.intervalDays >= entry.intervalDays) {
        uprootedByIntervalDays = intervals[j]!.intervalDays;
        break;
      }
    }
    return {
      ...entry,
      isActive: uprootedByIntervalDays === undefined,
      uprootedByIntervalDays,
    };
  });
}

/**
 * ימי הפרישה של כל ההפלגות הפעילות — כולם נמדדים מהראיה האחרונה,
 * כל אחד בעונת ההפלגה שלו. זהו הפלט המרכזי לוסת הפלגה לא-קבוע.
 */
export function activeHaflagaPrishot(sortedSightings: Sighting[]): RecurrenceOccurrence[] {
  if (sortedSightings.length < 2) return [];
  const last = sortedSightings[sortedSightings.length - 1]!;
  return classifyHaflagot(sortedSightings)
    .filter((h) => h.isActive)
    .map((h): RecurrenceOccurrence => ({
      date: addDaysToHebrew(last.hebrewDate, h.intervalDays - 1),
      onah: h.onah,
      intervalDays: h.intervalDays,
    }));
}

// ─── 4. וסת שבוע ─────────────────────────────────────────────────────────────
//
// מקור: `משוכתב` ש' 422-438. מרווח של N שבועות. נקודה הלכתית (ש' 437):
// הפלגת 29 ימים inclusive = 4 שבועות (פער 28 = 4·7). לכן המרווח ה-inclusive
// של N שבועות = N·7 + 1. הפער (כפולת 7) מבטיח נחיתה על אותו יום בשבוע.

/** מרווח inclusive המתאים ל-`weeks` שבועות שלמים (N·7+1). */
export function weeksToInclusiveInterval(weeks: number): number {
  return weeks * 7 + 1;
}

/** מייצר `count` מופעי פרישה במרווח של `weeks` שבועות (אותו יום בשבוע ועונה). */
export function weeklyRecurrence(anchor: Anchor, weeks: number, count: number): RecurrenceOccurrence[] {
  return intervalRecurrence(anchor, weeksToInclusiveInterval(weeks), count);
}

// ─── 5. דילוג הפלגה (סדרה חשבונית של מרווחים) ───────────────────────────────
//
// מקור: `משוכתב` ש' 306-331. ההפלגות גדלות/קטנות ב`delta` קבוע בכל פעם.
// `firstInterval` = המרווח ה*צפוי הבא* בסדרה, נמדד מהראיה האחרונה (ש' 324-327).
// דוגמה: סדרה 30,31,32,33 → firstInterval=34, delta=+1.

/**
 * מייצר `count` מופעים בסדרה חשבונית של מרווחים. כל מופע נמדד מקודמו,
 * והמרווח גדל ב-`delta` בכל צעד. delta שלילי = דילוג יורד.
 */
export function arithmeticIntervalSeries(
  anchor: Anchor,
  firstInterval: number,
  delta: number,
  count: number,
): RecurrenceOccurrence[] {
  const out: RecurrenceOccurrence[] = [];
  let cursor = anchor.date;
  let interval = firstInterval;
  for (let k = 0; k < count; k++) {
    if (interval < 1) break; // סדרה יורדת שהגיעה לאפס — אין משמעות
    cursor = addDaysToHebrew(cursor, interval - 1);
    out.push({ date: cursor, onah: anchor.onah, intervalDays: interval });
    interval += delta;
  }
  return out;
}

// ─── 6. דילוג יום בחודש (סדרה חשבונית של יום-בחודש) ─────────────────────────
//
// מקור: `משוכתב` ש' 378-394; `הלכות.md` ש' 129-132. בכל חודש היום-בחודש מתקדם
// ב-`dayDelta`. גלישה מעבר לגבולות החודש (ש' 132, 394) היא **שאלה פתוחה** —
// מסומנת `needsDecision` ולא מוכרעת כאן.

/**
 * מייצר `count` מופעים: בחודש ה-k קדימה, ביום (anchorDay + k·dayDelta).
 * אם היום החדש חורג מגבולות החודש — המופע מסומן `needsDecision` (להכרעת משתמש:
 * עצירה / מעבר לחודש הבא), ולא מחושב יום קונקרטי.
 */
export function arithmeticMonthDaySeries(
  anchor: Anchor,
  dayDelta: number,
  count: number,
  decisionKey = 'dilug_chodesh_overflow',
): RecurrenceOccurrence[] {
  const out: RecurrenceOccurrence[] = [];
  let { year, month } = anchor.date;
  for (let k = 1; k <= count; k++) {
    const stepped = nextHebrewMonth(year, month);
    year = stepped.year;
    month = stepped.month;
    const targetDay = anchor.date.day + dayDelta * k;
    const monthLen = hebrewDaysInMonth(month, year);
    if (targetDay < 1 || targetDay > monthLen) {
      out.push({
        date: hydrateHebrewDate({ day: Math.min(Math.max(targetDay, 1), monthLen), month, year }),
        onah: anchor.onah,
        needsDecision: true,
        decisionKey,
        warning: `דילוג יום בחודש חורג מגבולות חודש ${getHebrewMonthName(
          month,
          isHebrewLeapYear(year),
        )} (יום ${targetDay}) — להכרעת המשתמש`,
      });
      continue;
    }
    out.push({
      date: hydrateHebrewDate({ day: targetDay, month, year }),
      onah: anchor.onah,
      monthOffset: k,
    });
  }
  return out;
}
