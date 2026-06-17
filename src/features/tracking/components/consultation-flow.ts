/**
 * <consultation-flow> — תצוגת ההתייעצות המונפשת (סעיף 28 במסמך התכנון).
 *
 * הלוח "מתייעץ" עם המשתמש לפני כל קביעת פרישה: מציג שני חודשים זה לצד זה
 * (RTL: המוקדם בימין, המאוחר בשמאל), מריץ ספירה מונפשת (היכן שרלוונטי),
 * ומבקש אישור על כל שלב לפני המעבר לבא.
 *
 * הקומפוננטה אינה מחשבת הלכה — היא מקבלת `steps` מוכנים מ-`consultation-steps.ts`
 * (שמבוסס על `tracking-recurrence.ts`), ומציגה אותם. בסיום משדרת
 * `consultation-complete` עם השלבים שאושרו, וה-orchestrator שומר אותם ב-store.
 */

import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { keyed } from 'lit/directives/keyed.js';
import {
  HEBREW_DAY_NAMES,
  addDaysHebrew,
  formatHebrewYear,
  getHebrewMonthName,
  hebrewDaysInMonth,
  hebrewToDate,
  isHebrewLeapYear,
  toHebrewNumber,
} from '../../../shared/hebrew-calendar.js';
import { hebrewDateKey } from '../tracking-types.js';
import type { HebrewDate } from '../tracking-types.js';
import type { ConsultationStep, MiniMonthRef, StepHighlight } from '../consultation-steps.js';
import { daysBetweenInclusive } from '../tracking-utils.js';

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

type Phase = 'reveal' | 'counting' | 'confirm';

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sameRef(a: MiniMonthRef, b: MiniMonthRef): boolean {
  return a.year === b.year && a.month === b.month;
}

@customElement('consultation-flow')
export class ConsultationFlow extends LitElement {
  /** שלבי ההתייעצות. נקבע ע"י ה-orchestrator לפני הוספה ל-DOM. */
  @property({ attribute: false }) steps: ConsultationStep[] = [];

  @state() private stepIndex = 0;
  @state() private phase: Phase = 'reveal';
  /** ערכי הספירה הנוכחיים: hebrewDateKey → מספר. */
  @state() private badges: Record<string, number> = {};

  private approved: ConsultationStep[] = [];
  private cancelled = false;

  static styles = css`
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :host {
      position: fixed;
      inset: 0;
      z-index: 1200;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, 0.42);
      direction: rtl;
      font-family: inherit;
      animation: fade-in 180ms ease;
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .panel {
      width: min(720px, 94vw);
      max-height: 92vh;
      overflow: auto;
      background: var(--surface, #fff);
      color: var(--on-surface, #1f1b16);
      border-radius: 20px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
      padding: 18px 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .progress {
      font-size: 12px;
      color: var(--on-surface-variant, #6f5e49);
    }
    .close-btn {
      border: none;
      background: transparent;
      color: var(--on-surface-variant, #6f5e49);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 4px 8px;
      border-radius: 8px;
    }
    .close-btn:hover { background: var(--surface-container-highest, #efe3cf); }

    .board {
      display: flex;
      gap: 14px;
      justify-content: center;
      align-items: flex-start;
    }
    .month { animation: month-in 300ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }
    .month:nth-child(2) { animation-delay: 70ms; }
    @keyframes month-in {
      from { opacity: 0; transform: translateY(10px) scale(0.97); }
      to { opacity: 1; transform: none; }
    }

    .month {
      flex: 1 1 0;
      min-width: 0;
      background: var(--surface-container, #f7efe2);
      border: 1px solid var(--outline-variant, #d8c7af);
      border-radius: 14px;
      padding: 10px;
    }
    .month.single { max-width: 360px; }
    .month-title {
      text-align: center;
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 3px;
    }
    .wd {
      text-align: center;
      font-size: 10px;
      color: var(--on-surface-variant, #6f5e49);
      padding-bottom: 2px;
    }
    .cell {
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      position: relative;
      border-radius: 8px;
      font-size: 13px;
    }
    .cell.empty { visibility: hidden; }
    .cell.counted {
      background: var(--secondary-container, #f5e5c8);
      color: var(--on-secondary-container, #382d18);
    }
    .cell.hl {
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
      font-weight: 700;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary, #9b6f12) 30%, transparent);
    }
    .badge {
      position: absolute;
      inset-block-start: 1px;
      inset-inline-end: 2px;
      font-size: 9px;
      font-weight: 700;
      color: var(--primary, #9b6f12);
    }
    .cell.hl .badge { color: var(--surface, #fff); }
    .onah-dot {
      position: absolute;
      inset-block-end: 2px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
    }
    .onah-dot.day { background: #f5b301; }
    .onah-dot.night { background: #3b4a8c; }

    .message {
      background: var(--surface-container-highest, #efe3cf);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 14px;
      line-height: 1.5;
      min-height: 1.5em;
    }
    .message.pending { color: var(--on-surface-variant, #6f5e49); }

    .actions {
      display: flex;
      gap: 10px;
      justify-content: flex-start;
    }
    button.act {
      border: none;
      border-radius: 999px;
      padding: 9px 22px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    button.act:disabled { opacity: 0.45; cursor: default; }
    .approve { background: var(--primary, #9b6f12); color: var(--surface, #fff); }
    .skip {
      background: transparent;
      color: var(--on-surface-variant, #6f5e49);
      box-shadow: inset 0 0 0 1px var(--outline, #8d7a63);
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    if (this.steps.length === 0) {
      this.finish();
      return;
    }
    void this.runStep();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.cancelled = true;
  }

  private get current(): ConsultationStep | undefined {
    return this.steps[this.stepIndex];
  }

  private async runStep(): Promise<void> {
    const step = this.current;
    if (!step) {
      this.finish();
      return;
    }
    this.badges = {};
    this.phase = 'reveal';
    await wait(REDUCED_MOTION ? 0 : 340); // הנפשת כניסת החודשים
    if (this.cancelled) return;

    if (step.count) {
      this.phase = 'counting';
      await this.runCount(step.count.from, step.count.to);
      if (this.cancelled) return;
    }
    this.phase = 'confirm';
  }

  /** ספירה inclusive מ-`from` עד `to`, ישירות על תאריכים עבריים. */
  private async runCount(from: HebrewDate, to: HebrewDate): Promise<void> {
    const total = daysBetweenInclusive(from, to);
    if (total <= 0) return;

    if (REDUCED_MOTION) {
      const all: Record<string, number> = {};
      for (let i = 0; i < total; i++) {
        all[hebrewDateKey(addDaysHebrew(from, i))] = i + 1;
      }
      this.badges = all;
      return;
    }

    for (let i = 0; i < total; i++) {
      if (this.cancelled) return;
      this.badges = { ...this.badges, [hebrewDateKey(addDaysHebrew(from, i))]: i + 1 };
      await wait(120);
    }
  }

  private onApprove(): void {
    const step = this.current;
    if (!step) return;
    if (step.commit.length > 0) this.approved.push(step);
    this.advance();
  }

  private onSkip(): void {
    this.advance();
  }

  private advance(): void {
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this.finish();
      return;
    }
    void this.runStep();
  }

  private finish(): void {
    this.dispatchEvent(
      new CustomEvent('consultation-complete', {
        detail: { approved: this.approved },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onClose(): void {
    // סגירה ידנית = סיום עם מה שאושר עד כה (אינו חוסם — סעיף 26.1).
    this.finish();
  }

  // ─── render ────────────────────────────────────────────────────────────────

  private renderCell(ref: MiniMonthRef, day: number, highlights: StepHighlight[]): unknown {
    const key = hebrewDateKey({ year: ref.year, month: ref.month, day });
    const badge = this.badges[key];
    const hl = highlights.find(
      (h) => h.date.year === ref.year && h.date.month === ref.month && h.date.day === day,
    );
    const classes = ['cell'];
    if (badge !== undefined) classes.push('counted');
    if (hl) classes.push('hl');
    return html`
      <div class=${classes.join(' ')}>
        ${badge !== undefined ? html`<span class="badge">${badge}</span>` : nothing}
        <span class="num">${toHebrewNumber(day)}</span>
        ${hl && hl.onah ? html`<span class="onah-dot ${hl.onah}"></span>` : nothing}
      </div>
    `;
  }

  private renderMonth(ref: MiniMonthRef, highlights: StepHighlight[], single = false): unknown {
    const len = hebrewDaysInMonth(ref.month, ref.year);
    const firstDay = hebrewToDate(ref.year, ref.month, 1)?.getDay() ?? 0;
    const name = getHebrewMonthName(ref.month, isHebrewLeapYear(ref.year));
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    const days = Array.from({ length: len }, (_, i) => i + 1);
    return html`
      <div class="month ${single ? 'single' : ''}">
        <div class="month-title">${name} ${formatHebrewYear(ref.year)}</div>
        <div class="grid">
          ${HEBREW_DAY_NAMES.map((n) => html`<div class="wd">${n.charAt(0)}</div>`)}
          ${blanks.map(() => html`<div class="cell empty"></div>`)}
          ${days.map((d) => this.renderCell(ref, d, highlights))}
        </div>
      </div>
    `;
  }

  render() {
    const step = this.current;
    if (!step) return nothing;
    const single = sameRef(step.rightMonth, step.leftMonth);
    // `keyed` לפי stepIndex מאלץ יצירת DOM מחדש בכל שלב → הנפשת כניסה חוזרת.
    return html`
      <div class="panel">
        <div class="header">
          <span class="progress">שלב ${this.stepIndex + 1} מתוך ${this.steps.length}</span>
          <button class="close-btn" @click=${this.onClose} aria-label="סגור">✕</button>
        </div>

        ${keyed(
          this.stepIndex,
          html`
            <div class="board">
              ${single
                ? this.renderMonth(step.rightMonth, step.highlights, true)
                : html`
                    ${this.renderMonth(step.rightMonth, step.highlights)}
                    ${this.renderMonth(step.leftMonth, step.highlights)}
                  `}
            </div>
          `,
        )}

        <div class="message ${this.phase !== 'confirm' ? 'pending' : ''}">
          ${this.phase === 'confirm' ? step.message : this.phase === 'counting' ? 'סופר…' : ''}
        </div>

        <div class="actions">
          <button class="act approve" ?disabled=${this.phase !== 'confirm'} @click=${this.onApprove}>
            אישור
          </button>
          <button class="act skip" ?disabled=${this.phase !== 'confirm'} @click=${this.onSkip}>
            דלג
          </button>
        </div>
      </div>
    `;
  }
}
