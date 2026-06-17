/**
 * `<day-tracking-layer>` — שכבת המעקב של תא יחיד בלוח.
 *
 * הקומפוננטה מוזרקת **בתוך** תא קיים (`.calendar-cell`) שנוצר ב-`main.ts`,
 * ומוסיפה מעליו: כפתור `+`, סימוני אירועים (chips), ו-overlay לספירה.
 *
 * עיצוב מודולרי:
 *   - מקבלת תאריך עברי כ-properties.
 *   - שואבת את האירועים ל-`hebrewDate` ישירות מ-`trackingStore`.
 *   - נרשמת ל-`subscribe` ומתעדכנת אוטומטית בכל שינוי state.
 *   - לא מבצעת חישובים הלכתיים — רק מציגה את מה שכבר קיים ב-store.
 *
 * אירועים שהיא משדרת (CustomEvent) למעלה כדי שהקוד הראשי יוכל להגיב:
 *   - `tracking-add-event-requested` עם `{ year, month, day }`
 *   - `tracking-marker-clicked`     עם `{ eventId, kind }`
 *
 * החלטות עיצוב מסעיף 10 ו-24.7:
 *   - z-index של שכבות מוגדר ב-CSS למטה.
 *   - הכפתור `+` הוא `<button>` אמיתי, לא תלוי ב-hover בלבד.
 */

import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { classMap } from 'lit/directives/class-map.js';

import type { ComputedEvent, UserEvent } from '../tracking-types.js';
import { trackingStore } from '../tracking-store.js';

@customElement('day-tracking-layer')
export class DayTrackingLayer extends LitElement {
  /** תאריך עברי של היום הזה — מקור האמת לשליפה מה-store. */
  @property({ type: Number }) year = 0;
  @property({ type: Number }) month = 0;
  @property({ type: Number }) day = 0;

  /** האם להציג את כפתור ההוספה (למשל לא להציג בימים מחוץ לטווח). */
  @property({ type: Boolean, attribute: 'show-add' }) showAdd = true;

  /** סימוני flow פעילים — נקבע מה-`activeSession` ב-store. */
  @state() private isFocused = false;
  @state() private isTarget = false;
  /** ניתן לקבוע מבחוץ ע"י אנימציית ספירה. */
  @property({ attribute: false }) countLabel: string | null = null;

  @state() private userEvents: UserEvent[] = [];
  @state() private computedEvents: ComputedEvent[] = [];

  private unsubscribe: (() => void) | null = null;

  static styles = css`
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: block;
      direction: rtl;
    }

    /* כל הילדים מקבלים pointer-events במידת הצורך */
    .add-btn,
    button,
    .marker {
      pointer-events: auto;
    }

    /* ─── כפתור + ─── */
    .add-btn {
      position: absolute;
      inset-block-start: 4px;
      inset-inline-start: 4px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      transform: scale(0.92);
      transition: opacity 120ms ease, transform 120ms ease, filter 120ms ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
      z-index: 4;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    /* ה-host מקבל hover מהאלמנט אב (.calendar-cell) דרך :host-context — נסמן ב-CSS המקומי */
    :host(.cell-hover) .add-btn,
    :host(.cell-selected) .add-btn,
    .add-btn:focus-visible {
      opacity: 1;
      transform: scale(1);
    }
    .add-btn:hover {
      filter: brightness(1.1);
    }

    /* ─── רצועת סימונים ─── */
    .markers {
      position: absolute;
      inset-block-end: 2px;
      inset-inline-start: 2px;
      inset-inline-end: 2px;
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      z-index: 1;
    }
    .marker {
      font-size: 10px;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: var(--surface-container, rgba(0, 0, 0, 0.05));
      color: var(--on-surface, #222);
      cursor: pointer;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .marker.user {
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
    }
    .marker.pending {
      background: transparent;
      border-style: dashed;
      border-color: var(--primary, #9b6f12);
      color: var(--primary, #9b6f12);
    }
    .marker.confirmed {
      background: var(--secondary-container, var(--primary-container, #edd8aa));
      color: var(--on-secondary-container, var(--on-primary-container, #2a1d04));
    }

    /* ─── overlay לספירה ─── */
    .count {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 50%;
      transform: translate(50%, -50%);
      font-size: 16px;
      font-weight: 700;
      color: var(--primary, #9b6f12);
      background: rgba(255, 255, 255, 0.85);
      border-radius: 50%;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      animation: count-pop 200ms ease-out;
      pointer-events: none;
    }
    @keyframes count-pop {
      from { opacity: 0; transform: translate(50%, -50%) scale(0.6); }
      to   { opacity: 1; transform: translate(50%, -50%) scale(1); }
    }

    /* ─── טבעת מיקוד (highlight) ─── */
    .focus-ring {
      position: absolute;
      inset: 1px;
      border-radius: 8px;
      box-shadow: 0 0 0 2px var(--primary, #9b6f12);
      z-index: 3;
      pointer-events: none;
      animation: focus-pulse 1.8s ease-in-out infinite;
    }
    @keyframes focus-pulse {
      0%, 100% { opacity: 0.45; }
      50%      { opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .add-btn,
      .count,
      .focus-ring {
        animation: none;
        transition: none;
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.refreshFromStore();
    this.unsubscribe = trackingStore.subscribe(() => this.refreshFromStore());
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    if (
      changedProperties.has('year') ||
      changedProperties.has('month') ||
      changedProperties.has('day')
    ) {
      this.refreshFromStore();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private refreshFromStore(): void {
    if (!this.year || !this.month || !this.day) return;
    this.userEvents = trackingStore.getUserEventsForHebrewDate(this.year, this.month, this.day);
    this.computedEvents = trackingStore.getComputedEventsForHebrewDate(
      this.year,
      this.month,
      this.day,
    );

    const session = trackingStore.getState().activeSession;
    const myKey = `${this.year}-${this.month}-${this.day}`;
    const focused = !!session?.focusedDateKeys.includes(myKey);
    this.isFocused = focused;
    this.isTarget = focused;
    void this.isFocused;
    // countLabel נקבע ע"י flow (עתידי). כברירת מחדל ריק.
  }

  private onAddClick(ev: Event): void {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('tracking-add-event-requested', {
        detail: { year: this.year, month: this.month, day: this.day },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onMarkerClick(ev: Event, eventId: string, kind: string): void {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('tracking-marker-clicked', {
        detail: { eventId, kind },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onAddKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onAddClick(ev);
  }

  private onMarkerKeydown(ev: KeyboardEvent, eventId: string, kind: string): void {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    this.onMarkerClick(ev, eventId, kind);
  }

  private renderMarker(label: string, kind: 'user' | 'pending' | 'confirmed', eventId: string) {
    return html`
      <div
        class=${classMap({ marker: true, [kind]: true })}
        role="button"
        tabindex="0"
        title=${label}
        aria-label=${label}
        @click=${(e: Event) => this.onMarkerClick(e, eventId, kind)}
        @keydown=${(e: KeyboardEvent) => this.onMarkerKeydown(e, eventId, kind)}
      >${label}</div>
    `;
  }

  render() {
    const userMarkers = this.userEvents.map((e) =>
      this.renderMarker(`אירוע · ${e.onah === 'night' ? 'לילה' : 'יום'}`, 'user', e.id),
    );
    const computedMarkers = this.computedEvents.map((e) => {
      const kind: 'pending' | 'confirmed' =
        e.status === 'confirmed' ? 'confirmed' : 'pending';
      const label = computedShortLabel(e);
      return this.renderMarker(label, kind, e.id);
    });

    return html`
      ${this.showAdd
        ? html`<div
            class="add-btn"
            role="button"
            tabindex="0"
            aria-label="הוסף אירוע"
            @click=${this.onAddClick}
            @keydown=${this.onAddKeydown}
          >+</div>`
        : nothing}

      ${userMarkers.length + computedMarkers.length > 0
        ? html`<div class="markers">
            ${repeat(
              [...userMarkers, ...computedMarkers],
              (_, i) => i,
              (m) => m,
            )}
          </div>`
        : nothing}

      ${this.countLabel ? html`<div class="count">${this.countLabel}</div>` : nothing}
      ${this.isTarget ? html`<div class="focus-ring"></div>` : nothing}
    `;
  }
}

function computedShortLabel(e: ComputedEvent): string {
  switch (e.category) {
    case 'veset_hachodesh':
      return 'עונת החודש';
    case 'onah_beinonit':
      return e.computedFromIntervalDays ? String(e.computedFromIntervalDays) : 'בינונית';
    case 'haflagah':
      return 'הפלגה';
    case 'fixed_pattern':
      return 'קבוע';
    default:
      return 'פרישה';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'day-tracking-layer': DayTrackingLayer;
  }
}
