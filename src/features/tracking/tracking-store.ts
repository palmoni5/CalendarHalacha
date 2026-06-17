/**
 * מקור אמת למצב המעקב.
 *
 * - מחזיק את `TrackingState` בזיכרון.
 * - מסנכרן עם `Otzaria.storage` (קריאה בעת ה-init, שמירה אחרי כל שינוי).
 * - חושף API להוספה/עדכון/מחיקה של אירועי משתמש ואירועים מחושבים.
 * - מודיע ל-listeners בכל שינוי כך שהרינדור יתעדכן.
 *
 * שמירה: מאוחסן תחת המפתח `'tracking'` ב-storage. מבנה הקובץ — `TrackingStorageEnvelope`.
 * אירועים זמניים (sessions, popovers) **לא** נשמרים — רק נתונים עסקיים.
 */

/// <reference path="../../../types/otzaria_plugin.d.ts" />

import type {
  ComputedEvent,
  TrackingState,
  TrackingStorageEnvelope,
  UserEvent,
} from './tracking-types.js';
import { newId, nowIso } from './tracking-utils.js';

const STORAGE_KEY = 'tracking';
const CURRENT_SCHEMA_VERSION = 1;

type Listener = (state: TrackingState) => void;

function emptyState(): TrackingState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    userEvents: [],
    computedEvents: [],
    patternMatches: [],
    rulePatternStates: [],
    cleanStreaks: [],
    onahWindows: [],
    activeSession: null,
    hoveredDateKey: null,
    popover: { kind: 'none' },
  };
}

class TrackingStore {
  private state: TrackingState = emptyState();
  private listeners = new Set<Listener>();
  private loaded = false;

  getState(): TrackingState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }

  private update(patch: Partial<TrackingState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
    void this.persist();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const response = await Otzaria.call<TrackingStorageEnvelope | null>('storage.get', {
        key: STORAGE_KEY,
      });
      if (response.success && response.data) {
        const env = response.data;
        if (env.schemaVersion !== CURRENT_SCHEMA_VERSION) {
          console.warn(
            `[tracking] storage schemaVersion ${env.schemaVersion} !== ${CURRENT_SCHEMA_VERSION}; using empty state`,
          );
          return;
        }
        const td = env.trackingData;
        this.state = {
          ...emptyState(),
          userEvents: td.userEvents ?? [],
          computedEvents: td.computedEvents ?? [],
          patternMatches: td.patternMatches ?? [],
          rulePatternStates: td.rulePatternStates ?? [],
          cleanStreaks: td.cleanStreaks ?? [],
          onahWindows: td.onahWindows ?? [],
        };
        this.emit();
      }
    } catch (err) {
      console.error('[tracking] failed to load state', err);
    }
  }

  private async persist(): Promise<void> {
    const envelope: TrackingStorageEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      trackingData: {
        userEvents: this.state.userEvents,
        computedEvents: this.state.computedEvents,
        patternMatches: this.state.patternMatches,
        rulePatternStates: this.state.rulePatternStates,
        cleanStreaks: this.state.cleanStreaks,
        onahWindows: this.state.onahWindows,
        settings: { showDay31: true },
      },
    };
    try {
      await Otzaria.call('storage.set', { key: STORAGE_KEY, value: envelope });
    } catch (err) {
      console.error('[tracking] failed to persist state', err);
    }
  }

  // ─── UserEvent CRUD ───────────────────────────────────────────────────────

  addUserEvent(input: Omit<UserEvent, 'id' | 'type' | 'createdAt'>): UserEvent {
    const event: UserEvent = {
      ...input,
      id: newId(),
      type: 'user_event',
      createdAt: nowIso(),
    };
    this.update({ userEvents: [...this.state.userEvents, event] });
    return event;
  }

  updateUserEvent(id: string, patch: Partial<UserEvent>): void {
    this.update({
      userEvents: this.state.userEvents.map((e) =>
        e.id === id ? { ...e, ...patch, updatedAt: nowIso() } : e,
      ),
    });
  }

  deleteUserEvent(id: string): void {
    this.update({
      userEvents: this.state.userEvents.filter((e) => e.id !== id),
    });
  }

  /**
   * הסרה פיזית של אירועים מחושבים שנגזרו מאירוע משתמש מסוים — לשימוש בעת
   * עריכה/מחיקה של אירוע המשתמש, כשהאירועים המחושבים שלו אינם תקפים עוד
   * ויש לחשבם מחדש (להבדיל מ-supersession שמתרחש כשאירוע חדש גובר על ישן).
   */
  removeComputedEventsBySource(userEventId: string): void {
    this.update({
      computedEvents: this.state.computedEvents.filter(
        (e) => !e.sourceUserEventIds.includes(userEventId),
      ),
    });
  }

  getUserEventById(id: string): UserEvent | undefined {
    return this.state.userEvents.find((e) => e.id === id);
  }

  // ─── ComputedEvent CRUD ───────────────────────────────────────────────────

  addComputedEvent(event: ComputedEvent): void {
    this.update({ computedEvents: [...this.state.computedEvents, event] });
  }

  updateComputedEvent(id: string, patch: Partial<ComputedEvent>): void {
    this.update({
      computedEvents: this.state.computedEvents.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    });
  }

  /** סימון אירועים מחושבים כ-superseded במקום מחיקה (סעיף 24.4). */
  supersedeComputedEvents(ids: string[], bySourceEventId: string): void {
    if (ids.length === 0) return;
    const at = nowIso();
    this.update({
      computedEvents: this.state.computedEvents.map((e) =>
        ids.includes(e.id)
          ? {
              ...e,
              status: 'superseded',
              supersededAt: at,
              supersededByEventId: bySourceEventId,
              expiryReason: 'newer_event',
            }
          : e,
      ),
    });
  }

  /** מאפס את כל נתוני המעקב (אירועי משתמש + מחושבים). לשימוש בעיקר בבדיקות. */
  clearAll(): void {
    this.update({
      userEvents: [],
      computedEvents: [],
      patternMatches: [],
      rulePatternStates: [],
      cleanStreaks: [],
      onahWindows: [],
    });
  }

  // ─── שאילתות לפי יום ──────────────────────────────────────────────────────

  getUserEventsForHebrewDate(year: number, month: number, day: number): UserEvent[] {
    return this.state.userEvents.filter(
      (e) =>
        e.hebrewDate.year === year &&
        e.hebrewDate.month === month &&
        e.hebrewDate.day === day,
    );
  }

  getComputedEventsForHebrewDate(
    year: number,
    month: number,
    day: number,
  ): ComputedEvent[] {
    return this.state.computedEvents.filter(
      (e) =>
        e.status !== 'superseded' &&
        e.status !== 'expired' &&
        e.hebrewDate.year === year &&
        e.hebrewDate.month === month &&
        e.hebrewDate.day === day,
    );
  }

  // ─── שאילתות לפי חודש (לפאנל האירועים) ──────────────────────────────────────

  getUserEventsForHebrewMonth(year: number, month: number): UserEvent[] {
    return this.state.userEvents.filter(
      (e) => e.hebrewDate.year === year && e.hebrewDate.month === month,
    );
  }

  getComputedEventsForHebrewMonth(year: number, month: number): ComputedEvent[] {
    return this.state.computedEvents.filter(
      (e) =>
        e.status !== 'superseded' &&
        e.status !== 'expired' &&
        e.hebrewDate.year === year &&
        e.hebrewDate.month === month,
    );
  }

  /** כל אירועי המשתמש השמורים (לטאב "כל האירועים"). */
  getAllUserEvents(): UserEvent[] {
    return this.state.userEvents;
  }

  /** כל האירועים המחושבים הפעילים (ללא superseded/expired). */
  getAllComputedEvents(): ComputedEvent[] {
    return this.state.computedEvents.filter(
      (e) => e.status !== 'superseded' && e.status !== 'expired',
    );
  }

  // ─── סשן חישוב ────────────────────────────────────────────────────────────

  setActiveSession(session: TrackingState['activeSession']): void {
    this.update({ activeSession: session });
  }

  setPopover(popover: TrackingState['popover']): void {
    this.update({ popover });
  }
}

export const trackingStore = new TrackingStore();
