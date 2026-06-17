/**
 * `<anchored-calculation-popover>` — פופ-אפ אישור מעוגן לתא (סעיף 11.3-11.5).
 *
 * מציג טקסט הסבר של הצעת חישוב ושני כפתורים: אשר / לא עכשיו.
 * הפופ-אפ ממקם את עצמו ביחס ל-DOMRect של תא יעד שמקבל ב-prop `anchorRect`.
 *
 * התנהגות מיקום (סעיף 11.3):
 *   - ברירת מחדל מעל התא; אם אין מקום, מתחת.
 *   - אם התא בקצה אופקי, מתבצעת הסטה אופקית כדי שהפופ-אפ יישאר בתוך ה-viewport.
 *
 * שכבה זו טהורה — לא מבצעת חישובים. רק מציגה טקסט שמועבר כ-`message`,
 * ומשדרת את ההחלטה כ-CustomEvent (`approve` / `dismiss`).
 */

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { loadUiCopy } from '../tracking-rules-loader.js';

@customElement('anchored-calculation-popover')
export class AnchoredCalculationPopover extends LitElement {
  /** הטקסט המלא להצגה (כבר עם placeholders מולאים). */
  @property({ type: String }) message = '';

  /** DOMRect של התא העוגן. אם null — הפופ-אפ ממוקם במרכז המסך. */
  @property({ attribute: false }) anchorRect: DOMRect | null = null;

  /** מזהה ההצעה — מועבר חזרה ב-event detail. */
  @property({ type: String }) proposalId = '';

  /** האם להציג גם כפתור "למה היום הזה?". */
  @property({ type: Boolean, attribute: 'show-why' }) showWhy = true;

  @state() private pos: { top: number; left: number; placement: 'top' | 'bottom' } = {
    top: 0,
    left: 0,
    placement: 'top',
  };

  static styles = css`
    *, *::before, *::after {
      box-sizing: border-box;
    }
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1000;
      direction: rtl;
    }
    .pop {
      position: absolute;
      pointer-events: auto;
      background: var(--surface, #fff);
      color: var(--on-surface, #1a1a1a);
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
      padding: 14px 16px;
      max-width: 320px;
      min-width: 220px;
      font-size: 14px;
      line-height: 1.45;
      animation: fade-in 140ms ease-out;
    }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .arrow {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--surface, #fff);
      transform: rotate(45deg);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 12px;
    }
    .btn {
      padding: 7px 14px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
    }
    .btn-secondary {
      background: transparent;
      color: var(--on-surface, #1a1a1a);
    }
    .btn-secondary:hover { background: var(--surface-container, rgba(0, 0, 0, 0.05)); }
    .btn-primary {
      background: var(--primary, #9b6f12);
      color: var(--surface, #fff);
    }
    .btn-primary:hover { filter: brightness(1.08); }
    .why-link {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      color: var(--primary, #9b6f12);
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      text-decoration: underline;
      font-family: inherit;
    }

    @media (prefers-reduced-motion: reduce) {
      .pop { animation: none; }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.computePosition();
    window.addEventListener('resize', this.onWindowChange);
    window.addEventListener('scroll', this.onWindowChange, true);
    document.addEventListener('keydown', this.onKeyDown);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.onWindowChange);
    window.removeEventListener('scroll', this.onWindowChange, true);
    document.removeEventListener('keydown', this.onKeyDown);
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('anchorRect') || changed.has('message')) {
      this.computePosition();
    }
  }

  private onWindowChange = () => this.computePosition();
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.dismiss();
  };

  private computePosition(): void {
    const rect = this.anchorRect;
    const popEl = this.shadowRoot?.querySelector<HTMLElement>('.pop');
    const popH = popEl?.offsetHeight ?? 120;
    const popW = popEl?.offsetWidth ?? 260;

    if (!rect) {
      this.pos = {
        top: window.innerHeight / 2 - popH / 2,
        left: window.innerWidth / 2 - popW / 2,
        placement: 'top',
      };
      return;
    }

    const margin = 8;
    const spaceAbove = rect.top;
    const placement: 'top' | 'bottom' =
      spaceAbove >= popH + margin ? 'top' : 'bottom';
    const top =
      placement === 'top' ? rect.top - popH - margin : rect.bottom + margin;

    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));

    this.pos = { top, left, placement };
  }

  private approve(): void {
    this.dispatchEvent(
      new CustomEvent('proposal-approved', {
        detail: { proposalId: this.proposalId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private dismiss(): void {
    this.dispatchEvent(
      new CustomEvent('proposal-dismissed', {
        detail: { proposalId: this.proposalId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private explain(): void {
    this.dispatchEvent(
      new CustomEvent('proposal-explain-requested', {
        detail: { proposalId: this.proposalId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const copy = loadUiCopy();
    const buttons = (copy.buttons as Record<string, string>) ?? {};
    return html`
      <div
        class="pop"
        role="dialog"
        aria-modal="false"
        style=${`top:${this.pos.top}px;left:${this.pos.left}px;`}
      >
        <div class="message">${this.message}</div>
        ${this.showWhy
          ? html`<button class="why-link" type="button" @click=${this.explain}>
              ${buttons.whyThisDay ?? 'למה היום הזה?'}
            </button>`
          : null}
        <div class="actions">
          <button class="btn btn-secondary" type="button" @click=${this.dismiss}>
            ${buttons.notNow ?? 'לא עכשיו'}
          </button>
          <button class="btn btn-primary" type="button" @click=${this.approve}>
            ${buttons.approve ?? 'אשר'}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'anchored-calculation-popover': AnchoredCalculationPopover;
  }
}
