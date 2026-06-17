/**
 * `<calendar-events-panel>` — חלונית האירועים של החודש המוצג.
 *
 * מקבילה לחלונית "אירועים" שבלוח השנה של Otzaria (calendar_events_panel.dart):
 * מציגה את כל אירועי המעקב (טומאה + פרישה) השייכים לחודש העברי המוצג כעת.
 *
 * עיצוב מודולרי (כמו `<day-tracking-layer>`):
 *   - מקבלת את החודש העברי המוצג כ-properties (`year`, `month`, `month-name`).
 *   - שואבת את האירועים ישירות מ-`trackingStore` ומתעדכנת ב-`subscribe`.
 *   - לא מבצעת חישוב הלכתי — רק מציגה את מה שכבר ב-store.
 *
 * לחיצה על פריט משדרת `calendar-jump-to-date` עם `gregorianDateKey` כדי
 * שה-`main.ts` יזיז את התצוגה ליום הזה.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { ComputedEvent, UserEvent } from '../tracking-types.js';
import { trackingStore } from '../tracking-store.js';
import { toHebrewNumber, formatHebrewYear } from '../../../shared/hebrew-calendar.js';

type PanelTab = 'month' | 'all';

interface PanelItem {
  id: string;
  year: number;
  month: number;
  day: number;
  kind: 'user' | 'pending' | 'confirmed';
  title: string;
  meta: string;
  /** תווית תאריך מלאה (לטאב "כל האירועים"). */
  dateLabel: string;
  /** מפתח מיון כרונולוגי מוחלט (YYYY-MM-DD). */
  sortKey: string;
  /** האם זה אירוע משתמש (ניתן לעריכה/מחיקה). אירוע מחושב הוא לקריאה בלבד. */
  editable: boolean;
}

@customElement('calendar-events-panel')
export class CalendarEventsPanel extends LitElement {
  /** החודש העברי המוצג כעת בלוח. */
  @property({ type: Number }) year = 0;
  @property({ type: Number }) month = 0;
  @property({ attribute: 'month-name' }) monthName = '';

  @state() private items: PanelItem[] = [];
  @state() private pendingDeleteId: string | null = null;
  @state() private activeTab: PanelTab = 'month';

  private unsubscribe: (() => void) | null = null;

  static styles = css`
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      direction: rtl;
      color: var(--on-surface, #302417);
      font-family: inherit;
    }

    .panel-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      padding: 0 4px 10px;
    }
    .panel-title {
      font-size: 1.02rem;
      font-weight: 700;
    }
    .panel-subtitle {
      font-size: 0.82rem;
      color: var(--on-surface-variant, rgba(48, 36, 23, 0.72));
    }

    /* טאבים: "החודש" / "כל האירועים" */
    .panel-tabs {
      display: flex;
      gap: 4px;
      padding: 4px;
      margin-bottom: 10px;
      border-radius: 999px;
      background: var(--surface-container, rgba(48, 36, 23, 0.04));
    }
    .panel-tab {
      flex: 1;
      padding: 7px 10px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--on-surface-variant, rgba(48, 36, 23, 0.72));
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .panel-tab:hover {
      color: var(--on-surface, #302417);
    }
    .panel-tab.active {
      background: var(--surface, #fdf8f1);
      color: var(--on-surface, #302417);
      box-shadow: var(--shadow, 0 2px 6px rgba(93, 70, 27, 0.12));
    }

    .event-date {
      font-size: 0.74rem;
      font-weight: 600;
      color: var(--primary, #9b6f12);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 2px;
    }

    .event-card {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--outline-variant, rgba(48, 36, 23, 0.14));
      border-radius: 12px;
      background: var(--surface, #fdf8f1);
      transition: border-color 120ms ease, background-color 120ms ease,
        box-shadow 120ms ease;
    }
    .event-card:hover {
      border-color: var(--outline, rgba(48, 36, 23, 0.24));
      background: var(--surface-container, rgba(48, 36, 23, 0.04));
      box-shadow: var(--shadow, 0 2px 6px rgba(93, 70, 27, 0.12));
    }

    .event-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 2px;
      border: none;
      background: transparent;
      color: inherit;
      text-align: start;
      cursor: pointer;
      font: inherit;
    }

    .event-actions {
      flex: none;
      display: flex;
      gap: 4px;
    }
    .text-action {
      border: 1px solid var(--outline-variant, rgba(48, 36, 23, 0.14));
      border-radius: 8px;
      background: transparent;
      color: var(--on-surface-variant, rgba(48, 36, 23, 0.72));
      cursor: pointer;
      font: inherit;
      font-size: 0.74rem;
      font-weight: 600;
      padding: 5px 9px;
      white-space: nowrap;
      transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
    }
    .text-action:hover {
      background: var(--surface-container-highest, rgba(48, 36, 23, 0.08));
      color: var(--on-surface, #302417);
    }
    .text-action.danger {
      color: #a43e1f;
      border-color: rgba(164, 62, 31, 0.4);
    }
    .text-action.danger:hover {
      background: rgba(164, 62, 31, 0.12);
    }
    .text-action.confirm {
      background: #a43e1f;
      color: #fff;
      border-color: #a43e1f;
    }

    .day-badge {
      flex: none;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      background: var(--secondary-container, #f5e5c8);
      color: var(--on-secondary-container, #372d1b);
    }
    .event-card.user .day-badge {
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
    }
    .event-card.pending .day-badge {
      background: transparent;
      border: 1px dashed var(--primary, #9b6f12);
      color: var(--primary, #9b6f12);
    }

    .event-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .event-title {
      font-size: 0.9rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .event-meta {
      font-size: 0.76rem;
      color: var(--on-surface-variant, rgba(48, 36, 23, 0.72));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 12px;
      text-align: center;
      color: var(--on-surface-variant, rgba(48, 36, 23, 0.72));
      font-size: 0.88rem;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.refreshFromStore();
    this.unsubscribe = trackingStore.subscribe(() => this.refreshFromStore());
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('year') || changed.has('month')) {
      this.refreshFromStore();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private refreshFromStore(): void {
    const users =
      this.activeTab === 'all'
        ? trackingStore.getAllUserEvents()
        : this.year && this.month
          ? trackingStore.getUserEventsForHebrewMonth(this.year, this.month)
          : [];
    const computed =
      this.activeTab === 'all'
        ? trackingStore.getAllComputedEvents()
        : this.year && this.month
          ? trackingStore.getComputedEventsForHebrewMonth(this.year, this.month)
          : [];

    const items: PanelItem[] = [
      ...users.map((e) => this.userItem(e)),
      ...computed.map((e) => this.computedItem(e)),
    ];
    // טאב "החודש" — מיון לפי יום; טאב "הכל" — מיון כרונולוגי מוחלט.
    if (this.activeTab === 'all') {
      items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    } else {
      items.sort((a, b) => a.day - b.day);
    }
    this.items = items;
  }

  private userItem(e: UserEvent): PanelItem {
    return {
      id: e.id,
      year: e.hebrewDate.year,
      month: e.hebrewDate.month,
      day: e.hebrewDate.day,
      kind: 'user',
      title: 'ראייה',
      meta: e.onah === 'night' ? 'עונת לילה' : 'עונת יום',
      dateLabel: formatHebrewDate(e.hebrewDate),
      sortKey: e.gregorianDateKey,
      editable: true,
    };
  }

  private computedItem(e: ComputedEvent): PanelItem {
    const onahLabel = e.onah === 'night' ? 'עונת לילה' : e.onah === 'day' ? 'עונת יום' : '';
    return {
      id: e.id,
      year: e.hebrewDate.year,
      month: e.hebrewDate.month,
      day: e.hebrewDate.day,
      kind: e.status === 'confirmed' ? 'confirmed' : 'pending',
      title: computedCategoryLabel(e),
      meta: [onahLabel, e.status === 'confirmed' ? '' : 'ממתין לאישור']
        .filter(Boolean)
        .join(' · '),
      dateLabel: formatHebrewDate(e.hebrewDate),
      sortKey: e.gregorianDateKey,
      editable: false,
    };
  }

  private setTab(tab: PanelTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.pendingDeleteId = null;
    this.refreshFromStore();
  }

  /** קפיצה ליום מתבצעת לפי התאריך העברי (לא הגרגוריאני) — כדי שהתא הנכון
   *  יודגש גם באירועי "לילה" שבהם היום הגרגוריאני של השקיעה שונה. */
  private onItemClick(item: PanelItem): void {
    this.dispatchEvent(
      new CustomEvent('calendar-jump-to-date', {
        detail: { year: item.year, month: item.month, day: item.day },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onEdit(item: PanelItem, ev: Event): void {
    ev.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('calendar-edit-event', {
        detail: { eventId: item.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onDeleteClick(item: PanelItem, ev: Event): void {
    ev.stopPropagation();
    // אישור דו-שלבי: לחיצה ראשונה מבקשת אישור, השנייה מוחקת.
    if (this.pendingDeleteId !== item.id) {
      this.pendingDeleteId = item.id;
      return;
    }
    this.pendingDeleteId = null;
    this.dispatchEvent(
      new CustomEvent('calendar-delete-event', {
        detail: { eventId: item.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onCancelDelete(ev: Event): void {
    ev.stopPropagation();
    this.pendingDeleteId = null;
  }

  render() {
    const emptyMsg =
      this.activeTab === 'all' ? 'אין אירועים שמורים' : 'אין אירועים בחודש זה';
    return html`
      <div class="panel-header">
        <span class="panel-title">אירועים</span>
        ${this.activeTab === 'month' && this.monthName
          ? html`<span class="panel-subtitle">${this.monthName}</span>`
          : nothing}
      </div>
      <div class="panel-tabs" role="tablist">
        <button
          class="panel-tab ${this.activeTab === 'month' ? 'active' : ''}"
          type="button"
          role="tab"
          aria-selected=${this.activeTab === 'month'}
          @click=${() => this.setTab('month')}
        >החודש</button>
        <button
          class="panel-tab ${this.activeTab === 'all' ? 'active' : ''}"
          type="button"
          role="tab"
          aria-selected=${this.activeTab === 'all'}
          @click=${() => this.setTab('all')}
        >כל האירועים</button>
      </div>
      ${this.items.length === 0
        ? html`<div class="panel-empty">${emptyMsg}</div>`
        : html`<div class="panel-list">
            ${repeat(
              this.items,
              (item) => item.id,
              (item) => this.renderCard(item),
            )}
          </div>`}
    `;
  }

  private renderCard(item: PanelItem) {
    const confirming = this.pendingDeleteId === item.id;
    return html`
      <div class="event-card ${item.kind}">
        <button
          class="event-main"
          type="button"
          @click=${() => this.onItemClick(item)}
        >
          <span class="day-badge">${toHebrewNumber(item.day)}</span>
          <span class="event-text">
            <span class="event-title">${item.title}</span>
            ${this.activeTab === 'all'
              ? html`<span class="event-date">${item.dateLabel}</span>`
              : nothing}
            ${item.meta ? html`<span class="event-meta">${item.meta}</span>` : nothing}
          </span>
        </button>
        ${item.editable
          ? html`<div class="event-actions">
              ${confirming
                ? html`
                    <button
                      class="text-action confirm"
                      type="button"
                      @click=${(e: Event) => this.onDeleteClick(item, e)}
                    >מחק?</button>
                    <button
                      class="text-action"
                      type="button"
                      @click=${(e: Event) => this.onCancelDelete(e)}
                    >ביטול</button>
                  `
                : html`
                    <button
                      class="text-action"
                      type="button"
                      @click=${(e: Event) => this.onEdit(item, e)}
                    >ערוך</button>
                    <button
                      class="text-action danger"
                      type="button"
                      @click=${(e: Event) => this.onDeleteClick(item, e)}
                    >מחק</button>
                  `}
            </div>`
          : nothing}
      </div>
    `;
  }
}

function formatHebrewDate(d: { day: number; monthName: string; year: number }): string {
  return `${toHebrewNumber(d.day)} ${d.monthName} ${formatHebrewYear(d.year)}`;
}

function computedCategoryLabel(e: ComputedEvent): string {
  switch (e.category) {
    case 'veset_hachodesh':
      return 'עונת החודש';
    case 'onah_beinonit':
      return 'עונה בינונית';
    case 'haflagah':
      return e.computedFromIntervalDays
        ? `הפלגה · ${e.computedFromIntervalDays} ימים`
        : 'הפלגה';
    case 'fixed_pattern':
      return 'וסת קבוע';
    default:
      return 'יום פרישה';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'calendar-events-panel': CalendarEventsPanel;
  }
}
