/**
 * בונה את שלבי ההתייעצות (סעיף 28 במסמך התכנון) מתוך אירועי המשתמש.
 *
 * עיקרון: הקובץ טהור (ללא DOM). הוא **המקור** למספרים שיוצגו בהתייעצות, ומבוסס
 * על הגנרטורים המחזוריים ב-`tracking-recurrence.ts` — כך מתחבר הקוד המחזורי
 * שכתבנו אל ה-UI. כל שלב נושא: אילו שני חודשים להציג, ספירה אופציונלית, ימים
 * לסימון, הודעת אישור, ורשימת `ComputedEvent` לשמירה אם המשתמש יאשר.
 *
 * הערה: כרגע מכוסות שלוש קטגוריות לא-קבועות (הפלגה, וסת חודש, עונה בינונית).
 * ריבוי הפלגות פעילות (פרק י' ז-ט) ווסת קבוע — שלב הרחבה נפרד.
 */

import type {
  ComputedEvent,
  ComputedEventCategory,
  HebrewDate,
  Onah,
  UserEvent,
} from './tracking-types.js';
import { intervalRecurrence, monthlyRecurrence } from './tracking-recurrence.js';
import { getCopy } from './tracking-rules-loader.js';
import {
  addDaysToHebrew,
  daysBetweenInclusive,
  hebrewToGregKey,
  hydrateHebrewDate,
  newId,
  nowIso,
} from './tracking-utils.js';
import { toHebrewNumber } from '../../shared/hebrew-calendar.js';

export interface MiniMonthRef {
  year: number;
  month: number;
}

export interface StepHighlight {
  date: HebrewDate;
  onah?: Onah; // undefined = יממה שלמה (עונה בינונית)
}

export type ConsultationStepKind =
  | 'haflagah_distance'
  | 'haflagah_target'
  | 'month_target'
  | 'onah_beinonit';

export interface ConsultationStep {
  id: string;
  kind: ConsultationStepKind;
  /** החודש המוקדם כרונולוגית — מוצג בימין (RTL). */
  rightMonth: MiniMonthRef;
  /** החודש המאוחר — מוצג בשמאל (RTL). */
  leftMonth: MiniMonthRef;
  /** אם קיים — אנימציית ספירה inclusive מ-`from` עד `to`. */
  count?: { from: HebrewDate; to: HebrewDate };
  highlights: StepHighlight[];
  message: string;
  /** אירועים מחושבים לשמירה (status confirmed) אם המשתמש מאשר. */
  commit: ComputedEvent[];
}

function onahLabel(onah: Onah): string {
  return onah === 'night' ? 'לילה' : 'יום';
}

function sortAsc(events: UserEvent[]): UserEvent[] {
  return [...events]
    .filter((e) => !e.ignoreForAllCalculations)
    .sort((a, b) => {
      if (a.hebrewDate.year !== b.hebrewDate.year) return a.hebrewDate.year - b.hebrewDate.year;
      if (a.hebrewDate.month !== b.hebrewDate.month) return a.hebrewDate.month - b.hebrewDate.month;
      if (a.hebrewDate.day !== b.hebrewDate.day) return a.hebrewDate.day - b.hebrewDate.day;
      const oa = a.onah === 'night' ? 0 : 1;
      const ob = b.onah === 'night' ? 0 : 1;
      return oa - ob;
    });
}

interface MakeComputedInput {
  category: ComputedEventCategory;
  date: HebrewDate;
  onah?: Onah;
  sourceIds: string[];
  reasonCode: string;
  ruleId: string;
  explanation: string;
  intervalDays?: number;
  monthOffset?: number;
}

function makeComputed(input: MakeComputedInput): ComputedEvent {
  const at = nowIso();
  return {
    id: newId(),
    type: 'computed_event',
    category: input.category,
    patternKind: 'non_fixed',
    hebrewDate: input.date,
    gregorianDateKey: hebrewToGregKey(input.date),
    onah: input.onah,
    status: 'confirmed',
    sourceUserEventIds: input.sourceIds,
    relatedUserEventIds: input.sourceIds,
    reasonCode: input.reasonCode,
    ruleId: input.ruleId,
    explanation: input.explanation,
    computedFromIntervalDays: input.intervalDays,
    computedFromMonthOffset: input.monthOffset,
    priority: 0,
    createdAt: at,
    confirmedAt: at,
  };
}

const toRef = (d: HebrewDate): MiniMonthRef => ({ year: d.year, month: d.month });

/**
 * בונה את רצף השלבים עבור הראיה החדשה (`rootEvent`), בהקשר כל הראיות.
 * סדר השלבים: הפלגה (הפרש→יעד), וסת חודש, עונה בינונית — תואם סעיף 13.
 */
export function buildConsultationSteps(
  rootEvent: UserEvent,
  allEvents: UserEvent[],
): ConsultationStep[] {
  const steps: ConsultationStep[] = [];
  const sorted = sortAsc(allEvents);
  const idx = sorted.findIndex((e) => e.id === rootEvent.id);
  const curr = idx >= 0 ? sorted[idx]! : rootEvent;
  const prev = idx > 0 ? sorted[idx - 1] : undefined;
  const anchorRef = toRef(curr.hebrewDate);
  const currMonthName = hydrateHebrewDate(curr.hebrewDate).monthName;

  // ── 1. הפלגה: שני שלבים. נדרשת ראיה קודמת ממשית במרחק ≥2 ימים inclusive.
  //    (distance<2 = אותו יום עברי = כפילות/המשך, לא מחזור חדש — אין הפלגה.)
  const distance = prev ? daysBetweenInclusive(prev.hebrewDate, curr.hebrewDate) : 0;
  if (prev && distance >= 2) {

    // שלב א': ספירת ההפרש בין הראיות.
    steps.push({
      id: newId(),
      kind: 'haflagah_distance',
      rightMonth: toRef(prev.hebrewDate),
      leftMonth: anchorRef,
      count: { from: prev.hebrewDate, to: curr.hebrewDate },
      highlights: [
        { date: prev.hebrewDate, onah: prev.onah },
        { date: curr.hebrewDate, onah: curr.onah },
      ],
      message: getCopy('haflagahDistance', 'confirmations', { distance }),
      commit: [],
    });

    // שלב ב': ספירה קדימה אל יום ההפלגה.
    const target = intervalRecurrence({ date: curr.hebrewDate, onah: curr.onah }, distance, 1)[0]!;
    const targetVars = {
      distance,
      targetDay: toHebrewNumber(target.date.day),
      targetMonth: target.date.monthName,
    };
    const explanation = getCopy('haflagahFuture', 'confirmations', targetVars);
    steps.push({
      id: newId(),
      kind: 'haflagah_target',
      rightMonth: anchorRef,
      leftMonth: toRef(target.date),
      count: { from: curr.hebrewDate, to: target.date },
      highlights: [{ date: target.date, onah: curr.onah }],
      message: explanation,
      commit: [
        makeComputed({
          category: 'haflagah',
          date: target.date,
          onah: curr.onah,
          sourceIds: [prev.id, curr.id],
          reasonCode: 'haflagah_basic',
          ruleId: 'haflagah-basic',
          explanation,
          intervalDays: distance,
        }),
      ],
    });
  }

  // ── 2. וסת החודש: שלב יחיד, ללא ספירה ──────────────────────────────────────
  const monthOcc = monthlyRecurrence(
    { date: curr.hebrewDate, onah: curr.onah },
    1,
    1,
    'next_month_first_day',
  )[0];
  if (monthOcc) {
    const vars = {
      eventDay: toHebrewNumber(curr.hebrewDate.day),
      eventMonth: currMonthName,
      onahLabel: onahLabel(curr.onah),
      targetDay: toHebrewNumber(monthOcc.date.day),
      targetMonth: monthOcc.date.monthName,
    };
    const explanation = getCopy('vesetHachodesh', 'confirmations', vars);
    steps.push({
      id: newId(),
      kind: 'month_target',
      rightMonth: anchorRef,
      leftMonth: toRef(monthOcc.date),
      highlights: [{ date: monthOcc.date, onah: curr.onah }],
      message: explanation,
      commit: [
        makeComputed({
          category: 'veset_hachodesh',
          date: monthOcc.date,
          onah: curr.onah,
          sourceIds: [curr.id],
          reasonCode: 'veset_hachodesh_basic',
          ruleId: 'veset-hachodesh-basic',
          explanation,
          monthOffset: 1,
        }),
      ],
    });
  }

  // ── 3. עונה בינונית: ספירה ל-30, סימון 30+31, יממה שלמה ────────────────────
  const ob30 = addDaysToHebrew(curr.hebrewDate, 29); // יום ה-30 inclusive
  const ob31 = addDaysToHebrew(curr.hebrewDate, 30); // יום ה-31 inclusive
  const obVars = {
    distance: 30,
    firstTarget: toHebrewNumber(ob30.day),
    secondTarget: toHebrewNumber(ob31.day),
  };
  const obExplanation = getCopy('onahBeinonit', 'confirmations', obVars);
  steps.push({
    id: newId(),
    kind: 'onah_beinonit',
    rightMonth: anchorRef,
    leftMonth: toRef(ob30),
    count: { from: curr.hebrewDate, to: ob30 },
    highlights: [{ date: ob30 }, { date: ob31 }], // onah undefined = יממה שלמה
    message: obExplanation,
    commit: [
      makeComputed({
        category: 'onah_beinonit',
        date: ob30,
        sourceIds: [curr.id],
        reasonCode: 'onah_beinonit_basic',
        ruleId: 'onah-beinonit-30-31',
        explanation: obExplanation,
        intervalDays: 30,
      }),
      makeComputed({
        category: 'onah_beinonit',
        date: ob31,
        sourceIds: [curr.id],
        reasonCode: 'onah_beinonit_basic',
        ruleId: 'onah-beinonit-30-31',
        explanation: obExplanation,
        intervalDays: 31,
      }),
    ],
  });

  return steps;
}
