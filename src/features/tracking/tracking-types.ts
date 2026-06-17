/**
 * טיפוסי ליבה לשכבת המעקב (tracking).
 *
 * מסמך התכנון: docs/tracking-ui-plan.md, סעיפים 7 ו-24.
 *
 * עקרון יסוד: הקובץ הזה הוא הגדרות בלבד. אסור שיהיה כאן תנאי הלכתי
 * או חישוב. כל ההלכה חיה ב-`הלכות.md` וב-JSON תחת `src/data/rules/`.
 */

import { hebrewDateKey as sharedHebrewDateKey } from '../../shared/hebrew-calendar.js';

// ─── תאריך עברי ──────────────────────────────────────────────────────────────

export interface HebrewDate {
  day: number;          // 1..30
  month: number;        // 1..13 (כולל אדר ב')
  year: number;
  monthName: string;
  isLeapYear: boolean;
}

export type Onah = 'day' | 'night';

export interface HebrewDateRange {
  start: HebrewDate;
  startOnah: Onah;
  end: HebrewDate;
  endOnah: Onah;
  totalOnahs: number;
  totalDays: number;
}

// ─── אירועי משתמש ואירועים מחושבים ───────────────────────────────────────────

export interface UserEvent {
  id: string;
  type: 'user_event';
  hebrewDate: HebrewDate;
  onah: Onah;
  weekday: number;                    // 0..6 (0=ראשון)
  gregorianDateKey: string;           // YYYY-MM-DD לתצוגה
  durationOnahs?: number;
  endHebrewDate?: HebrewDate;
  endOnah?: Onah;
  flowIntensity?: 'spotting' | 'normal' | 'heavy';
  isOngoing?: boolean;
  precededByOnahsClean?: number;
  triggeredBy?: 'spontaneous' | 'physical_cause' | 'medication' | 'other';
  causeNote?: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  ignoreForAllCalculations?: boolean;
  ignoreForPatternsOnly?: boolean;
  excludedRuleIds?: string[];
}

export type ComputedEventCategory =
  | 'veset_hachodesh'
  | 'onah_beinonit'
  | 'haflagah'
  | 'fixed_pattern';

export type ComputedEventStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'superseded'
  | 'expired'
  | 'frozen'; // ממתין להכרעת משתמש (ראה DecisionTier='requires_user_decision' ו-PendingDecision)

export type PatternKind = 'non_fixed' | 'fixed';

export interface ComputedEvent {
  id: string;
  type: 'computed_event';
  category: ComputedEventCategory;
  patternKind?: PatternKind;
  hebrewDate: HebrewDate;
  gregorianDateKey: string;
  onah?: Onah;
  weekday?: number;
  spanOnahs?: number;
  endHebrewDate?: HebrewDate;
  endOnah?: Onah;
  status: ComputedEventStatus;
  sourceUserEventIds: string[];
  relatedUserEventIds: string[];
  relatedComputedEventIds?: string[];
  reasonCode: string;
  reasonCodes?: string[];
  ruleId: string;
  ruleIds?: string[];
  explanation: string;
  computedFromIntervalDays?: number;
  computedFromMonthOffset?: number;
  matchStreak?: number;
  patternEstablishedAt?: string;
  priority: number;
  createdAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
  supersededAt?: string;
  supersededByEventId?: string;
  supersedesEventIds?: string[];
  expiredAt?: string;
  expiryReason?: 'newer_event' | 'pattern_broken' | 'manual' | 'rule_disabled';
}

// ─── שכבות תצוגה ─────────────────────────────────────────────────────────────

export interface CalendarMarker {
  id: string;
  hebrewDate: HebrewDate;
  markerType: 'user_event' | 'pending' | 'prisha_day' | 'count_step' | 'highlight';
  label: string;
  colorToken: string;
  priority: number;
}

export interface DayTrackingState {
  userEvents: UserEvent[];
  computedEvents: ComputedEvent[];
  countLabel?: string;
  isFlowFocused: boolean;
  isFlowTarget: boolean;
  showAddButton: boolean;
}

// ─── סשן חישוב ───────────────────────────────────────────────────────────────

export type CalculationSessionStep =
  | 'idle'
  | 'created'
  | 'month_target_preview'
  | 'month_target_confirmed'
  | 'onah_beinonit_counting'
  | 'onah_beinonit_confirm'
  | 'haflagah_distance_preview'
  | 'haflagah_future_preview'
  | 'done';

export interface CalculationSession {
  id: string;
  rootUserEventId: string;
  step: CalculationSessionStep;
  focusedDateKeys: string[];
  pendingReasonCodes: string[];
}

// ─── חלונות פרישה ורצפים נקיים ───────────────────────────────────────────────

export interface OnahWindow {
  id: string;
  computedEventId: string;
  startHebrewDate: HebrewDate;
  startOnah: Onah;
  durationOnahs: number;
  endHebrewDate: HebrewDate;
  endOnah: Onah;
  reasonCode: string;
  isExpired: boolean;
}

export interface CleanStreak {
  id: string;
  ruleId: string;
  startedAfterEventId: string;
  cleanOnahsCount: number;
  cleanEventsCount: number;
  lastCheckedAt: string;
  brokenByEventId?: string;
}

export interface PatternMatch {
  id: string;
  ruleId: string;
  userEventId: string;
  matchedAt: string;
  matchIndex: number;
  predictedComputedEventId?: string;
  deltaOnahs: number;
  isExactMatch: boolean;
}

export type RulePatternStatus =
  | 'inactive'
  | 'observing'
  | 'established'
  | 'breaking'
  | 'broken';

export interface RulePatternState {
  ruleId: string;
  status: RulePatternStatus;
  consecutiveMatches: number;
  consecutiveMisses: number;
  matchEventIds: string[];
  missEventIds: string[];
  establishedAt?: string;
  brokenAt?: string;
  lastEvaluatedAt: string;
  thresholds: {
    matchesToEstablish: number;
    missesToBreak: number;
  };
}

// ─── הצעות חישוב ─────────────────────────────────────────────────────────────

export type ProposalDisplayMode = 'anchored_popover' | 'counting_animation' | 'silent';

export interface CalculationProposal {
  id: string;
  ruleId: string;
  category: ComputedEventCategory;
  patternKind?: PatternKind;
  targetHebrewDates: HebrewDate[];
  targetOnah?: Onah;
  targetWindows: OnahWindow[];
  needsConfirmation: boolean;
  displayMode: ProposalDisplayMode;
  copyKey: string;
  reasonCode: string;
  sourceUserEventIds: string[];
  relatedComputedEventIds?: string[];
  supersedesEventIds?: string[];
  metadata: Record<string, string | number | boolean>;
  computedFromIntervalDays?: number;
  computedFromMonthOffset?: number;
  warnings?: string[];
}

export interface EngineRunResult {
  runId: string;
  triggeredByEventId: string;
  ranAt: string;
  proposals: CalculationProposal[];
  supersededComputedEventIds: string[];
  expiredComputedEventIds: string[];
  patternStateChanges: Array<{
    ruleId: string;
    from: RulePatternStatus;
    to: RulePatternStatus;
  }>;
  warnings: string[];
  errors: string[];
}

// ─── שלוש דרגות הכרעה הלכתית ─────────────────────────────────────────────────
//
// כל הלכה משתייכת לאחת משלוש דרגות. ההבחנה מבנית בלבד — היא קובעת מי מכריע
// ומתי, ולא מה ההלכה (ההלכה עצמה חיה ב-`הלכות.md` וב-JSON).
//
//   auto                  — דטרמיניסטי. המנוע מחשב מראש, אין הכרעת אדם.
//   setting_dependent     — תלוי בהגדרת משתמש שנקבעה *מראש* (טוגל). המנוע
//                           קורא את ההגדרה ומחשב, בלי לשאול בכל מופע.
//   requires_user_decision— "מצב קפוא": המנוע מתריע, האירוע נשאר `frozen` עד
//                           שהמשתמש יכריע פרטנית. ההכרעה רק *בוחרת כלל קיים*
//                           או מזינה ערך — לעולם אינה קובעת הלכה בקוד.

export type DecisionTier = 'auto' | 'setting_dependent' | 'requires_user_decision';

export type PendingDecisionStatus = 'open' | 'resolved' | 'dismissed';

/**
 * אפשרות בחירה בהכרעה קפואה. אינה מכריעה הלכה: היא מצביעה על כללים שיחולו
 * (`appliesRuleIds`) ו/או מזינה ערכים (`setsValues`) — שניהם נתונים, לא לוגיקה.
 */
export interface DecisionOption {
  id: string;
  copyKey: string;
  appliesRuleIds?: string[];
  setsValues?: Record<string, string | number | boolean>;
}

/**
 * הכרעה קפואה הממתינה למשתמש (דרגה `requires_user_decision`).
 *
 * זרימת התצוגה (לפי הבהרת המשתמש):
 *   - כל עוד `status === 'open'` — מסומן באזור התראות בלבד, אינו חוסם.
 *   - **צפייה ועריכה תמיד פתוחות** — גם אם ההכרעה פתוחה וגם אם הגיע מועדה.
 *     המשתמש עשוי לתקן תאריך שגוי שהזין, מה שעלול לבטל את השאלה עצמה.
 *   - אם הגיע `blocksNewEntryFromGregKey`/`blocksNewEntryFromOnah` (מועד אירוע
 *     תלוי) וההכרעה עדיין פתוחה — נחסמת רק **הזנת אירועי משתמש חדשים** עד הכרעה
 *     (או עד שתיקון נתונים קיימים ייתר את ההכרעה).
 */
export interface PendingDecision {
  id: string;
  decisionKey: string;            // מזהה לוגי של סוג ההכרעה (מרשם ההכרעות)
  tier: 'requires_user_decision';
  titleCopyKey: string;
  bodyCopyKey: string;            // הצגת הנתונים + השאלה למשתמש
  options: DecisionOption[];
  relatedUserEventIds: string[];
  relatedComputedEventIds: string[];
  status: PendingDecisionStatus;
  chosenOptionId?: string;
  createdAt: string;
  resolvedAt?: string;
  /** YYYY-MM-DD; אם הגיע ו-status==='open' → חוסם הזנת נתונים חדשים (לא צפייה/עריכה). */
  blocksNewEntryFromGregKey?: string;
  blocksNewEntryFromOnah?: Onah;
}

// ─── סכמת JSON של כללים ──────────────────────────────────────────────────────

export type RuleKind = 'absolute_date' | 'weekday' | 'interval_from_event';

export type RuleStage = 'phase_1' | 'phase_2' | 'phase_3';

export type MissingDayFallback = 'next_month_first_day' | 'previous_existing_day' | 'skip';

export interface RuleTrigger {
  input: 'latest_user_event' | 'all_user_events' | 'last_n_events';
  n?: number;
}

export type RuleOperationType =
  | 'shift_by_hebrew_month_same_day'
  | 'count_inclusive_days'
  | 'weekday_match'
  | 'fixed_interval';

export interface RuleOperation {
  type: RuleOperationType;
  params: {
    interval?: number;
    targets?: number[];                 // [30, 31] לעונה בינונית
    countFrom?: number;
    missingDayFallback?: MissingDayFallback;
    [key: string]: unknown;
  };
}

export type RuleRemovalConditionType =
  | 'newer_rule_of_same_category'
  | 'n_events_without_match'
  | 'manual_only';

export interface RuleRemovalCondition {
  type: RuleRemovalConditionType;
  n?: number;
}

export interface RuleScope {
  appliesToPatternKind: PatternKind | 'both';
  matchesToEstablish: number;
  missesToBreak: number;
  requiresEventOutsideWindow: boolean;
}

export interface RuleProduces {
  onahsToMark: number;
  targetOnah: 'same_as_source' | 'day' | 'night' | 'both';
}

export interface HalachicRule {
  id: string;
  name: string;
  category: ComputedEventCategory;
  kind: RuleKind;
  enabled: boolean;
  stage: RuleStage;
  trigger: RuleTrigger;
  operation: RuleOperation;
  scope: RuleScope;
  produces: RuleProduces;
  removalConditions: RuleRemovalCondition[];
  priority: number;
  requiresUserConfirmation: boolean;
  createsComputedEvent: boolean;
  reasonCode: string;
  copyKey: string;
  /** דרגת ההכרעה ההלכתית. ברירת מחדל (אם חסר): 'auto'. */
  resolutionTier?: DecisionTier;
  /** מפתח ההגדרה ב-settings — חובה כש-`resolutionTier === 'setting_dependent'`. */
  settingKey?: string;
  /** מזהה ההכרעה במרשם — חובה כש-`resolutionTier === 'requires_user_decision'`. */
  decisionKey?: string;
}

export interface HalachicRulesFile {
  version: number;
  principles: Record<string, boolean>;
  enabledGroups: Record<string, boolean>;
  rules: HalachicRule[];
}

export interface UiCopyFile {
  createEvent: {
    title: string;
    onahLabel: string;
    [key: string]: string;
  };
  confirmations: Record<string, string>;
  toasts?: Record<string, string>;
  [key: string]: unknown;
}

export interface CalculationFlowFile {
  flowId: string;
  steps: CalculationSessionStep[] | string[];
}

// ─── מצב גלובלי ──────────────────────────────────────────────────────────────

export interface TrackingState {
  schemaVersion: number;
  userEvents: UserEvent[];
  computedEvents: ComputedEvent[];
  patternMatches: PatternMatch[];
  rulePatternStates: RulePatternState[];
  cleanStreaks: CleanStreak[];
  onahWindows: OnahWindow[];
  activeSession: CalculationSession | null;
  lastEngineRunId?: string;
  hoveredDateKey: string | null;
  popover: {
    kind: 'none' | 'calculation_confirmation';
    anchorDateKey?: string;
    proposalId?: string;
  };
}

export interface TrackingStorageEnvelope {
  schemaVersion: number;
  trackingData: {
    userEvents: UserEvent[];
    computedEvents: ComputedEvent[];
    patternMatches?: PatternMatch[];
    rulePatternStates?: RulePatternState[];
    cleanStreaks?: CleanStreak[];
    onahWindows?: OnahWindow[];
    settings: {
      showDay31: boolean;
      [key: string]: unknown;
    };
  };
}

// ─── פונקציות עזר ────────────────────────────────────────────────────────────

/** מפתח לוגי לתאריך עברי. מאחד עם המפתח שב-`shared/hebrew-calendar.ts`. */
export function hebrewDateKey(d: Pick<HebrewDate, 'year' | 'month' | 'day'>): string {
  return sharedHebrewDateKey(d);
}

/**
 * הוספת מספר עונות (חצאי יממה) לתאריך עברי + onah.
 * עונת לילה קודמת לעונת היום של אותו תאריך עברי
 * (כי היממה ההלכתית מתחילה בשקיעה).
 *
 * המימוש בפועל מחייב שימוש ב-`addDaysHebrew` מ-shared. הוא לא מובא
 * לכאן כדי להימנע מתלות מעגלית של טיפוסים בלוגיקה — ראה
 * `tracking-utils.ts` למימוש בפועל.
 */
export interface AddOnahsResult {
  date: HebrewDate;
  onah: Onah;
}
