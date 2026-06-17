/**
 * `<create-event-dialog>` — דיאלוג יצירת אירוע משתמש (סעיף 11.2).
 *
 * שכבה מודאלית מרכזית. נפתחת בלחיצה על `+` בתא יום, ויוצרת `UserEvent`.
 * הבחירה של יום/לילה היא חובה (`save` מנוטרל עד שיש בחירה).
 *
 * שימוש:
 *   const dialog = document.createElement('create-event-dialog');
 *   dialog.hebrewDate = { year, month, day };
 *   dialog.gregorianDateKey = '2026-04-30';
 *   dialog.addEventListener('event-created', (e) => { ... });
 *   dialog.addEventListener('dialog-cancelled', () => dialog.remove());
 *   document.body.appendChild(dialog);
 *
 * הקופי מגיע מ-`ui-copy.he.json` דרך `getCopy('createEvent.*')`.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { HebrewDate, Onah, UserEvent } from '../tracking-types.js';
import { loadUiCopy } from '../tracking-rules-loader.js';
import { trackingStore } from '../tracking-store.js';
import { hebrewToGregKey, hydrateHebrewDate } from '../tracking-utils.js';
import {
  toHebrewNumber,
  formatHebrewYear,
  hebrewDaysInMonth,
  hebrewMonthsInYear,
  getHebrewMonthName,
  isHebrewLeapYear,
  hebrewToDate,
} from '../../../shared/hebrew-calendar.js';

@customElement('create-event-dialog')
export class CreateEventDialog extends LitElement {
  /** התאריך העברי שעליו נפתח הדיאלוג. חובה. */
  @property({ attribute: false }) hebrewDate: Pick<HebrewDate, 'year' | 'month' | 'day'> | null =
    null;

  /** מפתח גרגוריאני להצגה בלבד (YYYY-MM-DD). אם לא מסופק, מחושב. */
  @property({ type: String }) gregorianDateKey = '';

  /** במצב עריכה — אירוע המשתמש הקיים. אם null זהו מצב יצירה. */
  @property({ attribute: false }) existingEvent: UserEvent | null = null;

  @state() private onah: Onah | null = null;
  @state() private notes = '';
  @state() private weekday = 0;

  /** שדות עריכת התאריך העברי (זמינים גם ביצירה וגם בעריכה). */
  @state() private editYear = 0;
  @state() private editMonth = 0;
  @state() private editDay = 0;

  private get isEdit(): boolean {
    return this.existingEvent !== null;
  }

  @query('dialog') private dialogEl!: HTMLDialogElement;

  static styles = css`
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :host { direction: rtl; }

    dialog {
      border: none;
      border-radius: 14px;
      padding: 0;
      background: var(--surface, #fff);
      color: var(--on-surface, #1a1a1a);
      max-width: 420px;
      width: calc(100vw - 32px);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
      font-family: inherit;
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.35);
    }

    .header {
      padding: 18px 20px 6px;
      font-size: 18px;
      font-weight: 600;
      color: var(--on-surface, #1a1a1a);
    }
    .date-line {
      padding: 0 20px 14px;
      color: var(--on-surface-variant, #555);
      font-size: 14px;
    }
    .body {
      padding: 0 20px 8px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .question {
      font-size: 14px;
      font-weight: 500;
    }
    .date-editor {
      display: flex;
      gap: 8px;
    }
    .date-editor select,
    .date-editor input {
      flex: 1;
      min-width: 0;
      padding: 9px 10px;
      border-radius: 8px;
      border: 1px solid var(--outline-variant, #d8d2c1);
      background: var(--surface-container, rgba(0, 0, 0, 0.03));
      color: var(--on-surface, #1a1a1a);
      font-family: inherit;
      font-size: 14px;
    }
    .date-editor .field-day { flex: 0 0 72px; }
    .date-editor .field-year { flex: 0 0 96px; }
    .date-editor select:focus,
    .date-editor input:focus {
      outline: 2px solid var(--primary, #9b6f12);
      outline-offset: 0;
      border-color: transparent;
    }
    .onah-group {
      display: flex;
      gap: 8px;
    }
    .onah-btn {
      flex: 1;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1.5px solid var(--outline, #c7bfae);
      background: transparent;
      color: var(--on-surface, #1a1a1a);
      font-size: 15px;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
      font-family: inherit;
    }
    .onah-btn:hover {
      border-color: var(--primary, #9b6f12);
    }
    .onah-btn.selected {
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
      border-color: var(--primary, #9b6f12);
    }
    label.notes {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--on-surface-variant, #555);
    }
    textarea {
      resize: vertical;
      min-height: 60px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--outline-variant, #d8d2c1);
      background: var(--surface-container, rgba(0, 0, 0, 0.03));
      color: var(--on-surface, #1a1a1a);
      font-family: inherit;
      font-size: 14px;
    }
    textarea:focus {
      outline: 2px solid var(--primary, #9b6f12);
      outline-offset: 0;
      border-color: transparent;
    }

    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      padding: 14px 20px 18px;
    }
    .btn {
      padding: 9px 16px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-family: inherit;
      transition: filter 120ms ease, background 120ms ease;
    }
    .btn-cancel {
      background: transparent;
      color: var(--on-surface, #1a1a1a);
    }
    .btn-cancel:hover { background: var(--surface-container, rgba(0, 0, 0, 0.05)); }
    .btn-primary {
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
    }
    .btn-primary:hover { filter: brightness(1.08); }
    .btn-primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      filter: none;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    // מצב עריכה — טוענים את ערכי האירוע הקיים.
    if (this.existingEvent) {
      this.onah = this.existingEvent.onah;
      this.notes = this.existingEvent.notes ?? '';
      this.hebrewDate = {
        year: this.existingEvent.hebrewDate.year,
        month: this.existingEvent.hebrewDate.month,
        day: this.existingEvent.hebrewDate.day,
      };
    }
    // איתחול שדות עריכת התאריך מתוך התאריך הנתון.
    if (this.hebrewDate) {
      this.editYear = this.hebrewDate.year;
      this.editMonth = this.hebrewDate.month;
      this.editDay = this.hebrewDate.day;
    }
    this.recomputeFromEditFields();
  }

  /** מחשב מחדש את `hebrewDate`, `gregorianDateKey` ו-`weekday` משדות העריכה. */
  private recomputeFromEditFields(): void {
    if (!this.editYear || !this.editMonth || !this.editDay) return;
    const hd = hydrateHebrewDate({
      year: this.editYear,
      month: this.editMonth,
      day: this.editDay,
    });
    this.hebrewDate = { year: hd.year, month: hd.month, day: hd.day };
    try {
      this.gregorianDateKey = hebrewToGregKey(hd);
    } catch {
      this.gregorianDateKey = '';
    }
    const greg = hebrewToDate(hd.year, hd.month, hd.day);
    if (greg) this.weekday = greg.getDay();
  }

  private onChangeYear(value: string): void {
    let y = parseInt(value, 10);
    if (!Number.isFinite(y) || y <= 0) return;
    this.editYear = y;
    this.clampMonthAndDay();
    this.recomputeFromEditFields();
  }

  private onChangeMonth(value: string): void {
    this.editMonth = parseInt(value, 10);
    this.clampMonthAndDay();
    this.recomputeFromEditFields();
  }

  private onChangeDay(value: string): void {
    this.editDay = parseInt(value, 10);
    this.recomputeFromEditFields();
  }

  /** מוודא שהחודש והיום חוקיים אחרי שינוי שנה/חודש (שנה מעוברת, אורך חודש). */
  private clampMonthAndDay(): void {
    const months = hebrewMonthsInYear(this.editYear);
    if (this.editMonth > months) this.editMonth = months;
    const maxDay = hebrewDaysInMonth(this.editMonth, this.editYear);
    if (this.editDay > maxDay) this.editDay = maxDay;
  }

  protected firstUpdated(): void {
    this.dialogEl?.showModal?.();
    // פוקוס ראשוני על כפתור "יום" (סעיף 18.1)
    const firstBtn = this.shadowRoot?.querySelector<HTMLButtonElement>('.onah-btn');
    firstBtn?.focus();
  }

  private close(): void {
    this.dialogEl?.close?.();
    this.dispatchEvent(
      new CustomEvent('dialog-cancelled', { bubbles: true, composed: true }),
    );
  }

  private onSelectOnah(onah: Onah): void {
    this.onah = onah;
  }

  private onSave(): void {
    if (!this.hebrewDate || !this.onah) return;
    const hd = hydrateHebrewDate(this.hebrewDate);
    const fields = {
      hebrewDate: hd,
      onah: this.onah,
      weekday: this.weekday,
      gregorianDateKey: this.gregorianDateKey || hebrewToGregKey(hd),
      notes: this.notes || undefined,
    };

    if (this.existingEvent) {
      trackingStore.updateUserEvent(this.existingEvent.id, fields);
      const updated = trackingStore.getUserEventById(this.existingEvent.id)!;
      this.dialogEl?.close?.();
      this.dispatchEvent(
        new CustomEvent<UserEvent>('event-updated', {
          detail: updated,
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    const saved = trackingStore.addUserEvent(fields);
    this.dialogEl?.close?.();
    this.dispatchEvent(
      new CustomEvent<UserEvent>('event-created', {
        detail: saved,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private formatHebrewDateLine(): string {
    if (!this.hebrewDate) return '';
    const hd = hydrateHebrewDate(this.hebrewDate);
    return `${toHebrewNumber(hd.day)} ${hd.monthName} ${formatHebrewYear(hd.year)}`;
  }

  private formatGregLine(): string {
    if (!this.gregorianDateKey) return '';
    const [y, m, d] = this.gregorianDateKey.split('-');
    return `${d}.${m}.${y}`;
  }

  private renderDateEditor() {
    const leap = isHebrewLeapYear(this.editYear);
    const monthCount = hebrewMonthsInYear(this.editYear);
    const dayCount = hebrewDaysInMonth(this.editMonth, this.editYear) || 30;
    const months = Array.from({ length: monthCount }, (_, i) => i + 1);
    const days = Array.from({ length: dayCount }, (_, i) => i + 1);

    return html`
      <div class="question">תאריך</div>
      <div class="date-editor">
        <select
          class="field-day"
          aria-label="יום"
          .value=${String(this.editDay)}
          @change=${(e: Event) => this.onChangeDay((e.target as HTMLSelectElement).value)}
        >
          ${days.map(
            (d) => html`<option value=${d} ?selected=${d === this.editDay}>${toHebrewNumber(d)}</option>`,
          )}
        </select>
        <select
          aria-label="חודש"
          .value=${String(this.editMonth)}
          @change=${(e: Event) => this.onChangeMonth((e.target as HTMLSelectElement).value)}
        >
          ${months.map(
            (m) => html`<option value=${m} ?selected=${m === this.editMonth}>
              ${getHebrewMonthName(m, leap)}
            </option>`,
          )}
        </select>
        <input
          class="field-year"
          type="number"
          aria-label="שנה"
          .value=${String(this.editYear)}
          @change=${(e: Event) => this.onChangeYear((e.target as HTMLInputElement).value)}
        />
      </div>
    `;
  }

  render() {
    const copy = loadUiCopy().createEvent;
    const canSave = !!this.onah && !!this.hebrewDate;
    const title = this.isEdit ? 'עריכת אירוע' : copy.title;
    const saveLabel = this.isEdit ? 'שמור שינויים' : (copy.saveButton ?? 'שמור והתחל חישוב');

    return html`
      <dialog
        @cancel=${(e: Event) => {
          e.preventDefault();
          this.close();
        }}
        @close=${() => this.close()}
      >
        <div class="header">${title}</div>
        <div class="date-line">
          ${this.formatHebrewDateLine()}
          ${this.gregorianDateKey ? html` · ${this.formatGregLine()}` : nothing}
        </div>
        <div class="body">
          ${this.renderDateEditor()}
          <div class="question">${copy.onahLabel}</div>
          <div class="onah-group" role="radiogroup" aria-label=${copy.onahLabel}>
            <button
              type="button"
              role="radio"
              aria-checked=${this.onah === 'day'}
              class=${classMap({ 'onah-btn': true, selected: this.onah === 'day' })}
              @click=${() => this.onSelectOnah('day')}
            >${copy.dayOption ?? 'יום'}</button>
            <button
              type="button"
              role="radio"
              aria-checked=${this.onah === 'night'}
              class=${classMap({ 'onah-btn': true, selected: this.onah === 'night' })}
              @click=${() => this.onSelectOnah('night')}
            >${copy.nightOption ?? 'לילה'}</button>
          </div>

          <label class="notes">
            ${copy.notesLabel ?? 'הערה (אופציונלי)'}
            <textarea
              .value=${this.notes}
              @input=${(e: Event) => (this.notes = (e.target as HTMLTextAreaElement).value)}
            ></textarea>
          </label>
        </div>
        <div class="actions">
          <button class="btn btn-cancel" type="button" @click=${this.close}>
            ${copy.cancelButton ?? 'ביטול'}
          </button>
          <button
            class="btn btn-primary"
            type="button"
            ?disabled=${!canSave}
            @click=${this.onSave}
          >${saveLabel}</button>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'create-event-dialog': CreateEventDialog;
  }
}
