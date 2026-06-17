/// <reference path="../types/otzaria_plugin.d.ts" />

import {
  HEBREW_DAY_NAMES,
  formatHebrewYear,
  getHebrewDate,
  hebrewToDate,
  isHebrewLeapYear,
  parseHebrewNumber,
  toHebrewNumber,
} from './shared/hebrew-calendar.js';
import type { HebrewDate, HolidayLabel } from './shared/hebrew-calendar.js';
import { trackingStore } from './features/tracking/tracking-store.js';
import {
  mountTrackingLayers,
  attachTrackingEventListeners,
  type TrackingCellInput,
} from './features/tracking/tracking-renderers.js';
import './features/tracking/components/create-event-dialog.js';
import './features/tracking/components/events-panel.js';
import type { CreateEventDialog } from './features/tracking/components/create-event-dialog.js';
import type { CalendarEventsPanel } from './features/tracking/components/events-panel.js';
import { abortActiveFlow } from './features/tracking/tracking-confirmation-flow.js';
import {
  startConsultation,
  abortActiveConsultation,
} from './features/tracking/consultation-orchestrator.js';
import type { UserEvent as TrackingUserEvent } from './features/tracking/tracking-types.js';

type CalendarDisplay = 'hebrew' | 'gregorian' | 'combined';

interface CalendarCellData {
  date: Date;
  hebrew: HebrewDate;
  labels: HolidayLabel[];
  isToday: boolean;
  isSelected: boolean;
  isOutsidePrimaryRange: boolean;
  isShabbat: boolean;
}

interface ThemeColors {
  primary: string;
  onPrimary?: string;
  primaryContainer?: string;
  onPrimaryContainer?: string;
  secondary?: string;
  onSecondary?: string;
  secondaryContainer?: string;
  onSecondaryContainer?: string;
  tertiary?: string;
  onTertiary?: string;
  surface: string;
  onSurface: string;
  surfaceContainer?: string;
  surfaceContainerLow?: string;
  surfaceContainerHighest?: string;
  onSurfaceVariant?: string;
  outline?: string;
  outlineVariant?: string;
}

interface ThemeData {
  mode: 'light' | 'dark';
  colorScheme: ThemeColors;
}

interface AppState {
  calendarDisplay: CalendarDisplay;
  selectedDate: Date;
  anchorDate: Date;
  theme: ThemeData | null;
  eventsPanelOpen: boolean;
}

const state: AppState = {
  calendarDisplay: 'combined',
  selectedDate: stripTime(new Date()),
  anchorDate: startOfMonth(new Date()),
  theme: null,
  eventsPanelOpen: true,
};

const GREGORIAN_MONTH_FORMATTER = new Intl.DateTimeFormat('he', { month: 'long' });

let renderSequence = 0;
let shellRendered = false;
let listenersAttached = false;
let initStarted = false;
let pluginVersion = '1.0.0';
let isAuthenticated = false;

const STORAGE_KEY_PASSWORD = 'passwordHash';

// מצב פיתוח: כשהתוסף לא ארוז, Otzaria טוען אותו מהמערכת-קבצים (file:).
// בגרסה ארוזה (פרודקשן) משתמש ב-scheme פנימי ולא ב-file:.
const IS_DEV_MODE = location.protocol === 'file:';

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'otzaria-calendar-salt');
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSavedPasswordHash(): Promise<string | null> {
  try {
    const response = await Otzaria.call<string | null>('storage.get', { key: STORAGE_KEY_PASSWORD });
    return (response.success && response.data) ? response.data : null;
  } catch {
    return null;
  }
}

async function savePasswordHash(hash: string): Promise<void> {
  await Otzaria.call('storage.set', { key: STORAGE_KEY_PASSWORD, value: hash });
}

function renderPasswordScreen(mode: 'set' | 'verify'): void {
  const app = document.getElementById('app');
  if (!app) return;

  const title = mode === 'set' ? 'הגדרת סיסמא' : 'הזן סיסמא';
  const subtitle = mode === 'set'
    ? 'הגדר סיסמא לאבטחת המידע האישי שבתוסף'
    : 'הזן את הסיסמא כדי לצפות בתוסף';
  const btnLabel = mode === 'set' ? 'הגדר סיסמא' : 'כניסה';
  const confirmField = mode === 'set'
    ? `<input type="password" id="password-confirm" class="password-input" placeholder="אימות סיסמא" autocomplete="new-password" />`
    : '';

  app.innerHTML = `
    <div class="password-wall">
      <div class="password-card">
        <div class="password-icon">
          <span class="material-icons">lock</span>
        </div>
        <h2 class="password-title">${title}</h2>
        <p class="password-subtitle">${subtitle}</p>
        <div class="password-fields">
          <input type="password" id="password-input" class="password-input"
            placeholder="סיסמא"
            autocomplete="${mode === 'set' ? 'new-password' : 'current-password'}" />
          ${confirmField}
        </div>
        <div class="password-error" id="password-error" hidden></div>
        <button class="password-btn" id="password-submit" type="button">${btnLabel}</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    (document.getElementById('password-input') as HTMLInputElement | null)?.focus();
  }, 50);

  document.getElementById('password-submit')?.addEventListener('click', () => {
    void handlePasswordSubmit(mode);
  });

  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void handlePasswordSubmit(mode);
  });
}

function showPasswordError(msg: string): void {
  const el = document.getElementById('password-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

async function handlePasswordSubmit(mode: 'set' | 'verify'): Promise<void> {
  const input = document.getElementById('password-input') as HTMLInputElement | null;
  const password = input?.value ?? '';

  if (!password) {
    showPasswordError('יש להזין סיסמא');
    return;
  }

  if (mode === 'set') {
    const confirm = (document.getElementById('password-confirm') as HTMLInputElement | null)?.value ?? '';
    if (password !== confirm) {
      showPasswordError('הסיסמאות אינן תואמות');
      return;
    }
    if (password.length < 4) {
      showPasswordError('הסיסמא חייבת להכיל לפחות 4 תווים');
      return;
    }
    const hash = await hashPassword(password);
    await savePasswordHash(hash);
    isAuthenticated = true;
    launchMainApp();
  } else {
    const savedHash = await getSavedPasswordHash();
    const hash = await hashPassword(password);
    if (hash === savedHash) {
      isAuthenticated = true;
      launchMainApp();
    } else {
      showPasswordError('סיסמא שגויה');
      if (input) { input.value = ''; input.focus(); }
    }
  }
}

function openCreateEventDialog(date: { year: number; month: number; day: number }): void {
  // ביטול flow קודם אם פתוח (סעיף 12.2).
  abortActiveFlow();
  abortActiveConsultation();
  // אם כבר יש דיאלוג פתוח, להחליף אותו.
  document.querySelectorAll('create-event-dialog').forEach((el) => el.remove());

  const dialog = document.createElement('create-event-dialog') as CreateEventDialog;
  dialog.hebrewDate = date;
  dialog.addEventListener('event-created', (e: Event) => {
    const ce = e as CustomEvent<TrackingUserEvent>;
    dialog.remove();
    void startConsultation(ce.detail);
  });
  dialog.addEventListener('dialog-cancelled', () => dialog.remove());
  document.body.appendChild(dialog);
}

function openEditEventDialog(eventId: string): void {
  const existing = trackingStore.getUserEventById(eventId);
  if (!existing) return;

  abortActiveFlow();
  abortActiveConsultation();
  document.querySelectorAll('create-event-dialog').forEach((el) => el.remove());

  const dialog = document.createElement('create-event-dialog') as CreateEventDialog;
  dialog.existingEvent = existing;
  dialog.addEventListener('event-updated', (e: Event) => {
    const ce = e as CustomEvent<TrackingUserEvent>;
    dialog.remove();
    // האירועים המחושבים הישנים שנגזרו מאירוע זה אינם תקפים — מסירים ומחשבים מחדש.
    trackingStore.removeComputedEventsBySource(ce.detail.id);
    void startConsultation(ce.detail).then(() => renderCalendar());
  });
  dialog.addEventListener('dialog-cancelled', () => dialog.remove());
  document.body.appendChild(dialog);
}

function launchMainApp(): void {
  shellRendered = false;
  listenersAttached = false;
  renderShell();
  void initializeState().then(async () => {
    await trackingStore.load();
    if (IS_DEV_MODE) {
      // איפוס מהיר לבדיקות: בקונסול הריצו `__resetTracking()` וטענו מחדש.
      (window as unknown as { __resetTracking?: () => void }).__resetTracking = () => {
        trackingStore.clearAll();
        void renderCalendar();
        console.log('[tracking] נתוני המעקב אופסו');
      };
    }
    attachTrackingEventListeners({
      onAddRequested: (date) => openCreateEventDialog(date),
      onMarkerClicked: (detail) => {
        console.log('[tracking] marker clicked', detail);
      },
    });
    await renderCalendar();
  });
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
}

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatSelectedTitle(date: Date, hebrew: HebrewDate): string {
  const gregorianMonth = GREGORIAN_MONTH_FORMATTER.format(date);
  const hebrewYear = formatHebrewYear(hebrew.year);
  return `${toHebrewNumber(hebrew.day)} ${hebrew.monthName} ${hebrewYear} • ${date.getDate()} ${gregorianMonth} ${date.getFullYear()}`;
}

function getThemeColor(name: keyof ThemeColors, fallback: string): string {
  return state.theme?.colorScheme[name] ?? fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace('#', '');
  if (sanitized.length !== 6) return hex;

  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyTheme(theme: ThemeData): void {
  state.theme = theme;

  const root = document.documentElement;
  const surface = theme.colorScheme.surface;
  const onSurface = theme.colorScheme.onSurface;
  const primary = getThemeColor('primary', '#8b6a11');
  const primaryContainer = getThemeColor('primaryContainer', hexToRgba(primary, 0.14));
  const secondaryContainer = getThemeColor('secondaryContainer', '#f3e1bd');
  const surfaceContainer = getThemeColor('surfaceContainer', hexToRgba(onSurface, 0.04));
  const surfaceContainerHighest = getThemeColor('surfaceContainerHighest', hexToRgba(onSurface, 0.08));
  const outline = getThemeColor('outline', hexToRgba(onSurface, 0.24));
  const outlineVariant = getThemeColor('outlineVariant', hexToRgba(onSurface, 0.16));
  const onSurfaceVariant = getThemeColor('onSurfaceVariant', hexToRgba(onSurface, 0.74));
  const onPrimaryContainer = getThemeColor('onPrimaryContainer', onSurface);
  const onSecondaryContainer = getThemeColor('onSecondaryContainer', onSurface);

  root.style.setProperty('--surface', surface);
  root.style.setProperty('--on-surface', onSurface);
  root.style.setProperty('--on-surface-variant', onSurfaceVariant);
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-container', primaryContainer);
  root.style.setProperty('--on-primary-container', onPrimaryContainer);
  root.style.setProperty('--on-primary-container-muted', hexToRgba(onPrimaryContainer, 0.78));
  root.style.setProperty('--secondary-container', secondaryContainer);
  root.style.setProperty('--on-secondary-container', onSecondaryContainer);
  root.style.setProperty('--surface-container', surfaceContainer);
  root.style.setProperty('--surface-container-highest', surfaceContainerHighest);
  root.style.setProperty('--outline', outline);
  root.style.setProperty('--outline-variant', outlineVariant);
  root.style.setProperty('--today-fill', hexToRgba(primary, theme.mode === 'dark' ? 0.26 : 0.16));
  root.style.setProperty('--special-fill', hexToRgba(secondaryContainer, theme.mode === 'dark' ? 0.34 : 0.5));
  root.style.setProperty('--shadow', theme.mode === 'dark'
    ? '0 10px 30px rgba(0, 0, 0, 0.32)'
    : '0 8px 24px rgba(93, 70, 27, 0.10)');

  document.body.style.background = surface;
  document.body.style.color = onSurface;
}

async function getSelectedDateFromHost(): Promise<Date | null> {
  try {
    const response = await Otzaria.call<{ date?: string }>('calendar.getSelectedDate');
    const dateValue = response.success ? response.data?.date : undefined;

    if (!dateValue) return null;

    const date = stripTime(new Date(dateValue));
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.error('calendar.getSelectedDate failed', error);
    return null;
  }
}

// רשת קבועה של 6 שבועות (42 תאים) בכל חודש — גובה הלוח עקבי ולא קופץ
// בין חודשים. השורות העודפות מציגות ימי החודש הסמוך (מעומעמים).
const CALENDAR_WEEKS = 6;

function buildVisibleDates(hebrewMonthStart?: Date): Date[] {
  const monthStart = (state.calendarDisplay !== 'gregorian' && hebrewMonthStart)
    ? hebrewMonthStart
    : startOfMonth(state.anchorDate);

  const firstDay = monthStart.getDay(); // 0=Sunday
  const gridStart = addDays(monthStart, -firstDay);
  return Array.from({ length: CALENDAR_WEEKS * 7 }, (_, index) => addDays(gridStart, index));
}

async function buildCalendarCells(): Promise<CalendarCellData[]> {
  const today = stripTime(new Date());

  // בלוח עברי/משולב — מוצאים את ה-1 לחודש העברי שב-anchorDate
  let hebrewMonthStart: Date | undefined;
  let anchorHebrewMonth = -1;
  let anchorHebrewYear = -1;

  if (state.calendarDisplay !== 'gregorian') {
    const anchorHebrew = await getHebrewDate(state.anchorDate);
    anchorHebrewMonth = anchorHebrew.month;
    anchorHebrewYear = anchorHebrew.year;
    const first = hebrewToDate(anchorHebrew.year, anchorHebrew.month, 1);
    if (first) hebrewMonthStart = stripTime(first);
  }

  const visibleDates = buildVisibleDates(hebrewMonthStart);
  const primaryGregMonth = state.anchorDate.getMonth();

  const hebrewDates = await Promise.all(visibleDates.map((date) => getHebrewDate(date)));

  return visibleDates.map((date, index) => {
    let isOutside: boolean;
    if (state.calendarDisplay !== 'gregorian') {
      isOutside = hebrewDates[index].month !== anchorHebrewMonth ||
                  hebrewDates[index].year !== anchorHebrewYear;
    } else {
      isOutside = date.getMonth() !== primaryGregMonth;
    }
    return {
      date,
      hebrew: hebrewDates[index],
      labels: hebrewDates[index].holidays.slice(0, 2),
      isToday: isSameDay(date, today),
      isSelected: isSameDay(date, state.selectedDate),
      isOutsidePrimaryRange: isOutside,
      isShabbat: hebrewDates[index].isShabbat,
    };
  });
}

function renderShell(): void {
  if (shellRendered) return;

  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <section class="calendar-shell">
      <header class="calendar-toolbar">
        <div class="toolbar-side toolbar-side-start">
          <button class="icon-button subtle-button" id="events-toggle" type="button" aria-label="חלונית אירועים" aria-pressed="true">
            <span class="material-icons">event_note</span>
          </button>
        </div>

        <div class="toolbar-nav-group">
          <button class="icon-button" id="nav-prev" type="button" aria-label="הקודם">
            <span class="material-icons">chevron_right</span>
          </button>
          <div class="toolbar-title-wrap">
            <h1 class="toolbar-title" id="calendar-title">טוען…</h1>
          </div>
          <button class="icon-button" id="nav-next" type="button" aria-label="הבא">
            <span class="material-icons">chevron_left</span>
          </button>
        </div>

        <div class="toolbar-side toolbar-side-end">
          <button class="icon-button subtle-button" id="jump-today" type="button" aria-label="קפוץ לתאריך">
            <span class="material-icons">today</span>
          </button>
          <button class="pill-button is-active" id="today-button" type="button">היום</button>
          <div class="menu-anchor" id="settings-menu-anchor">
            <button class="icon-button subtle-button" id="settings-btn" type="button" aria-label="הגדרות ועוד" aria-haspopup="true" aria-expanded="false">
              <span class="material-icons">more_vert</span>
            </button>
            <div class="dropdown-menu" id="settings-menu" hidden>
              <div class="menu-section-label">תצוגת לוח</div>
              <div class="menu-switch-group">
                <button class="menu-display-btn" data-display="hebrew" type="button">עברי</button>
                <button class="menu-display-btn is-active" data-display="combined" type="button">משולב</button>
                <button class="menu-display-btn" data-display="gregorian" type="button">לועזי</button>
              </div>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-about" type="button">
                <span class="material-icons menu-item-icon">info_outline</span>
                אודות
              </button>
              <button class="menu-item" id="menu-feedback" type="button">
                <span class="material-icons menu-item-icon">feedback</span>
                שלח משוב
              </button>
            </div>
          </div>
        </div>
      </header>

      <div class="calendar-content" id="calendar-content">
        <div class="calendar-main">
          <div class="calendar-board" id="calendar-board">
            <div class="weekday-row" id="weekday-row"></div>
            <div class="calendar-grid" id="calendar-grid" aria-live="polite"></div>
          </div>
        </div>
        <calendar-events-panel class="events-panel" id="events-panel"></calendar-events-panel>
      </div>
    </section>

    <div class="dialog-backdrop" id="about-dialog" hidden>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="אודות">
        <h2 class="dialog-title">לוח שנה עברי</h2>
        <div class="about-body">
          <p class="about-version">גרסה <span id="about-version-text"></span></p>
          <p class="about-desc">תוסף ללוח שנה עברי-לועזי משולב לאפליקציית אוצריא.</p>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn dialog-btn-confirm" id="about-close" type="button">סגור</button>
        </div>
      </div>
    </div>

    <div class="dialog-backdrop" id="feedback-dialog" hidden>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="שלח משוב">
        <h2 class="dialog-title">שלח משוב</h2>
        <p class="feedback-email-display" id="feedback-email-display"></p>
        <div class="dialog-panel">
          <div class="feedback-msg-row">
            <label for="feedback-text" class="feedback-label">הודעה</label>
            <textarea id="feedback-text" class="feedback-textarea" rows="5" placeholder="כתוב את המשוב שלך כאן…"></textarea>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn dialog-btn-cancel" id="feedback-cancel" type="button">ביטול</button>
          <button class="dialog-btn dialog-btn-confirm" id="feedback-send" type="button">שלח</button>
        </div>
      </div>
    </div>

    <div class="dialog-backdrop" id="jump-dialog" hidden>
      <div class="dialog dialog-compact" role="dialog" aria-modal="true" aria-label="קפוץ לתאריך">
        <h2 class="dialog-title">קפוץ לתאריך</h2>
        <div class="dialog-tabs" role="tablist">
          <button class="dialog-tab is-active" data-tab="gregorian" type="button" role="tab">לועזי</button>
          <button class="dialog-tab" data-tab="hebrew" type="button" role="tab">עברי</button>
        </div>
        <div id="dialog-gregorian-panel" class="dialog-panel">
          <input type="date" id="gregorian-date-input" class="date-input" />
        </div>
        <div id="dialog-hebrew-panel" class="dialog-panel" hidden>
          <div class="hebrew-inputs">
            <div class="hebrew-field">
              <label for="hday-input">יום</label>
              <input type="text" id="hday-input" class="hnum-input" placeholder="יג" inputmode="text" />
            </div>
            <div class="hebrew-field">
              <label for="hmonth-select">חודש</label>
              <select id="hmonth-select" class="hselect"></select>
            </div>
            <div class="hebrew-field">
              <label for="hyear-input">שנה</label>
              <input type="text" id="hyear-input" class="hnum-input" placeholder="תשפז" inputmode="text" />
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn dialog-btn-cancel" id="dialog-cancel" type="button">ביטול</button>
          <button class="dialog-btn dialog-btn-confirm" id="dialog-confirm" type="button">קפוץ</button>
        </div>
      </div>
    </div>
  `;
  shellRendered = true;

  const weekdayRow = document.getElementById('weekday-row');
  if (weekdayRow) {
    weekdayRow.innerHTML = HEBREW_DAY_NAMES
      .map((dayName) => `<div class="weekday-cell">${dayName}</div>`)
      .join('');
  }

  attachShellListeners();
}

function attachShellListeners(): void {
  if (listenersAttached) return;

  document.getElementById('nav-prev')?.addEventListener('click', () => movePeriod(-1));
  document.getElementById('nav-next')?.addEventListener('click', () => movePeriod(1));
  document.addEventListener('keydown', handleArrowNavigation);
  document.getElementById('today-button')?.addEventListener('click', jumpToToday);
  document.getElementById('jump-today')?.addEventListener('click', openJumpDialog);
  document.getElementById('events-toggle')?.addEventListener('click', toggleEventsPanel);

  // קפיצה ליום לאחר לחיצה על פריט בחלונית האירועים — לפי תאריך עברי, כדי
  // שהתא הנכון יודגש (גם באירועי לילה, שבהם היום הגרגוריאני של השקיעה שונה).
  document.addEventListener('calendar-jump-to-date', (e) => {
    const d = (e as CustomEvent<{ year: number; month: number; day: number }>).detail;
    if (!d?.year || !d?.month || !d?.day) return;
    void jumpToHebrewDate(d.year, d.month, d.day);
  });

  // עריכת אירוע משתמש מחלונית האירועים
  document.addEventListener('calendar-edit-event', (e) => {
    const { eventId } = (e as CustomEvent<{ eventId: string }>).detail ?? {};
    if (eventId) openEditEventDialog(eventId);
  });

  // מחיקת אירוע משתמש מחלונית האירועים (כולל האירועים המחושבים שנגזרו ממנו)
  document.addEventListener('calendar-delete-event', (e) => {
    const { eventId } = (e as CustomEvent<{ eventId: string }>).detail ?? {};
    if (!eventId) return;
    trackingStore.removeComputedEventsBySource(eventId);
    trackingStore.deleteUserEvent(eventId);
    void renderCalendar();
  });

  // התאמת רוחב הלוח לפי גובה האזור (כדי שהתאים לא יימתחו על כל הרוחב)
  window.addEventListener('resize', updateCalendarSizing);

  document.querySelectorAll<HTMLButtonElement>('.menu-display-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const nextDisplay = button.dataset.display as CalendarDisplay;
      if (nextDisplay === state.calendarDisplay) return;
      state.calendarDisplay = nextDisplay;
      updateToolbarSelection();
      void renderCalendar();
    });
  });

  // ─── תפריט הגדרות (3 נקודות) ─────────────────────────────────────────────
  document.getElementById('settings-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsMenu();
  });

  // סגירת תפריט בלחיצה מחוץ אליו
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('settings-menu');
    const anchor = document.getElementById('settings-menu-anchor');
    if (menu && !menu.hidden && anchor && !anchor.contains(e.target as Node)) {
      closeSettingsMenu();
    }
  });

  document.getElementById('menu-about')?.addEventListener('click', () => {
    closeSettingsMenu();
    openAboutDialog();
  });

  document.getElementById('menu-feedback')?.addEventListener('click', () => {
    closeSettingsMenu();
    // בדיקת זמינות אימייל לפני פתיחת הדיאלוג
    Otzaria.call<{ email?: string }>('app.getUserEmail').then((response) => {
      const email = response.success ? (response.data?.email ?? '') : '';
      openFeedbackDialog(email);
    }).catch(() => openFeedbackDialog(''));
  });

  // ─── דיאלוג אודות ────────────────────────────────────────────────────────
  const aboutBackdrop = document.getElementById('about-dialog')!;
  aboutBackdrop.addEventListener('click', (e) => {
    if (e.target === aboutBackdrop) closeAboutDialog();
  });
  document.getElementById('about-close')?.addEventListener('click', closeAboutDialog);
  aboutBackdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAboutDialog();
  });

  // ─── דיאלוג משוב ─────────────────────────────────────────────────────────
  const feedbackBackdrop = document.getElementById('feedback-dialog')!;
  feedbackBackdrop.addEventListener('click', (e) => {
    if (e.target === feedbackBackdrop) closeFeedbackDialog();
  });
  document.getElementById('feedback-cancel')?.addEventListener('click', closeFeedbackDialog);
  document.getElementById('feedback-send')?.addEventListener('click', async () => {
    const textArea = document.getElementById('feedback-text') as HTMLTextAreaElement | null;
    const body = textArea?.value.trim() ?? '';
    if (!body) {
      await Otzaria.call('ui.showMessage', { message: 'יש למלא הודעה לפני השליחה' });
      return;
    }
    const response = await Otzaria.call('feedback.sendEmail', {
      to: 'click.go.script@gmail.com',
      subject: 'משוב - לוח הלכתי',
      body,
      includeSystemInfo: true,
    });
    if (response.success) {
      closeFeedbackDialog();
      await Otzaria.call('ui.showSuccess', { message: 'המשוב נשלח בהצלחה' });
    } else {
      await Otzaria.call('ui.showError', { message: 'שליחת המשוב נכשלה. נסה שנית.' });
    }
  });
  feedbackBackdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFeedbackDialog();
  });

  // ─── דיאלוג קפיצה לתאריך ───────────────────────────────────────────────
  const backdrop = document.getElementById('jump-dialog')!;

  // סגירה בלחיצה על הרקע
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeJumpDialog();
  });

  document.getElementById('dialog-cancel')?.addEventListener('click', closeJumpDialog);

  // מעבר בין כרטיסיות
  document.querySelectorAll<HTMLButtonElement>('.dialog-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dialog-tab').forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      const isHebrew = tab.dataset.tab === 'hebrew';
      const gregPanel = document.getElementById('dialog-gregorian-panel')!;
      const hebPanel = document.getElementById('dialog-hebrew-panel')!;
      gregPanel.hidden = isHebrew;
      hebPanel.hidden = !isHebrew;
    });
  });

  // עדכון מקסימום ימים כשמשנים חודש/שנה
  function updateHebrewDayMax() {
    let y = parseHebrewNumber((document.getElementById('hyear-input') as HTMLInputElement).value);
    if (y > 0 && y < 1000) y += 5000;
    const m = parseInt((document.getElementById('hmonth-select') as HTMLSelectElement).value, 10);
    if (y > 0) populateHebrewMonths(y);
  }

  document.getElementById('hyear-input')?.addEventListener('input', updateHebrewDayMax);
  document.getElementById('hmonth-select')?.addEventListener('change', updateHebrewDayMax);

  document.getElementById('dialog-confirm')?.addEventListener('click', () => {
    const activeTab = document.querySelector<HTMLButtonElement>('.dialog-tab.is-active');
    const tab = activeTab?.dataset.tab ?? 'gregorian';

    if (tab === 'gregorian') {
      const val = (document.getElementById('gregorian-date-input') as HTMLInputElement).value;
      if (val) {
        const parts = val.split('-').map(Number);
        if (parts.length === 3) {
          const targetDate = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
          if (!Number.isNaN(targetDate.getTime())) {
            state.selectedDate = stripTime(targetDate);
            state.anchorDate = stripTime(targetDate);
            void renderCalendar();
            closeJumpDialog();
          }
        }
      }
    } else {
      let y = parseHebrewNumber((document.getElementById('hyear-input') as HTMLInputElement).value);
      // אם הוזן רק חלק מהשנה (תשפז = 787) — מוסיפים את האלף החמישי
      if (y > 0 && y < 1000) y += 5000;
      const m = parseInt((document.getElementById('hmonth-select') as HTMLSelectElement).value, 10);
      const d = parseHebrewNumber((document.getElementById('hday-input') as HTMLInputElement).value);
      if (y > 0 && m > 0 && d > 0) {
        void jumpToHebrewDate(y, m, d);
        closeJumpDialog();
      }
    }
  });

  // Enter במקום לחיצה על אישור
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('dialog-confirm')?.click();
    if (e.key === 'Escape') closeJumpDialog();
  });

  listenersAttached = true;
}

function toggleSettingsMenu(): void {
  const menu = document.getElementById('settings-menu');
  const btn = document.getElementById('settings-btn');
  if (!menu) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  btn?.setAttribute('aria-expanded', String(willOpen));
}

function closeSettingsMenu(): void {
  const menu = document.getElementById('settings-menu');
  const btn = document.getElementById('settings-btn');
  if (menu) menu.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
}

function openAboutDialog(): void {
  const dialog = document.getElementById('about-dialog');
  if (!dialog) return;
  const versionEl = document.getElementById('about-version-text');
  if (versionEl) versionEl.textContent = pluginVersion;
  dialog.hidden = false;
}

function closeAboutDialog(): void {
  const dialog = document.getElementById('about-dialog');
  if (dialog) dialog.hidden = true;
}

function openFeedbackDialog(email: string): void {
  if (!email) {
    // אין אימייל — לא ניתן לשלוח משוב
    void Otzaria.call('ui.showMessage', {
      message: 'כדי לשלוח משוב, יש להגדיר כתובת אימייל בהגדרות אוצריא.',
      type: 'warning',
    });
    return;
  }

  const dialog = document.getElementById('feedback-dialog');
  if (!dialog) return;

  const emailDisplay = document.getElementById('feedback-email-display');
  if (emailDisplay) emailDisplay.textContent = `משוב יישלח מ: ${email}`;

  const textArea = document.getElementById('feedback-text') as HTMLTextAreaElement | null;
  if (textArea) textArea.value = '';

  dialog.hidden = false;
  textArea?.focus();
}

function closeFeedbackDialog(): void {
  const dialog = document.getElementById('feedback-dialog');
  if (dialog) dialog.hidden = true;
}

function movePeriod(direction: 1 | -1): void {
  if (state.calendarDisplay !== 'gregorian') {
    void moveByHebrewMonth(direction);
    return;
  }
  // ניווט לועזי: מעבירים גם את היום הנבחר לאותו יום בחודש הבא/הקודם
  const next = addMonths(state.selectedDate, direction);
  // שמירה על יום-בחודש; addMonths כבר מטפל בחפיפת ימים
  state.selectedDate = next;
  state.anchorDate = next;

  renderCalendar();
}

async function moveByHebrewMonth(direction: 1 | -1): Promise<void> {
  // מעבירים את היום הנבחר לאותו יום-בחודש בחודש העברי הבא/הקודם.
  // שיטה: קופצים ~35 ימים גרגוריאנים (מובטח לחצות חודש עברי אחד),
  // ואז מתקנים לפי ההפרש בין יום-בחודש הנוכחי ליום-בחודש אחרי הקפיצה.
  const selHebrew = await getHebrewDate(state.selectedDate);
  const probe = stripTime(addDays(state.selectedDate, direction * 35));
  const probeHebrew = await getHebrewDate(probe);

  const offset = selHebrew.day - probeHebrew.day;
  let newSelected = stripTime(addDays(probe, offset));

  // אם היום המקורי לא קיים בחודש היעד (למשל ל' בחודש של 29 יום),
  // נצמדים ליום האחרון של אותו חודש.
  let newHebrew = await getHebrewDate(newSelected);
  if (newHebrew.month !== probeHebrew.month || newHebrew.year !== probeHebrew.year) {
    // חצינו חודש — נחזור אחורה עד סוף חודש היעד
    while (newHebrew.month !== probeHebrew.month || newHebrew.year !== probeHebrew.year) {
      newSelected = stripTime(addDays(newSelected, -1));
      newHebrew = await getHebrewDate(newSelected);
    }
  }

  state.selectedDate = newSelected;
  state.anchorDate = newSelected;
  void renderCalendar();
}

async function jumpToHebrewDate(y: number, m: number, d: number): Promise<void> {
  // מתחילים מהחישוב הפנימי כקירוב, ואז מתקנים לפי המארח (עד ±3 ימים)
  const approx = hebrewToDate(y, m, d);
  if (!approx) return;

  let candidate = stripTime(approx);
  let candHebrew = await getHebrewDate(candidate);

  for (let attempts = 0; attempts < 6; attempts++) {
    if (candHebrew.year === y && candHebrew.month === m && candHebrew.day === d) break;
    // מחפשים בשני הכיוונים — בודקים ±1 יום
    const prev = stripTime(addDays(candidate, -1));
    const next = stripTime(addDays(candidate, 1));
    const [prevH, nextH] = await Promise.all([getHebrewDate(prev), getHebrewDate(next)]);
    if (prevH.year === y && prevH.month === m && prevH.day === d) {
      candidate = prev; candHebrew = prevH; break;
    }
    if (nextH.year === y && nextH.month === m && nextH.day === d) {
      candidate = next; candHebrew = nextH; break;
    }
    // אחרת מרחיבים את החיפוש ב-2 ימים לכיוון כלשהו
    candidate = stripTime(addDays(candidate, 2));
    candHebrew = await getHebrewDate(candidate);
  }

  state.selectedDate = candidate;
  state.anchorDate = candidate;
  void renderCalendar();
}

function jumpToToday(): void {
  const today = stripTime(new Date());
  state.selectedDate = today;
  state.anchorDate = today;
  renderCalendar();
}

/** מזיז את היום הנבחר ב-[days] ימים. התצוגה עוקבת כשחוצים חודש. */
function moveSelectedByDays(days: number): void {
  const next = stripTime(addDays(state.selectedDate, days));
  state.selectedDate = next;
  state.anchorDate = next;
  void renderCalendar();
}

/** האם פתוח כעת דיאלוג/overlay שצריך לבלוע את ניווט המקלדת. */
function isModalOpen(): boolean {
  const dialogIds = ['jump-dialog', 'about-dialog', 'feedback-dialog'];
  if (dialogIds.some((id) => {
    const el = document.getElementById(id);
    return el != null && !el.hidden;
  })) {
    return true;
  }
  return document.querySelector('create-event-dialog, consultation-flow') != null;
}

/** ניווט בחיצים: שמאל/ימין = יום קדימה/אחורה (RTL), מעלה/מטה = שבוע. */
function handleArrowNavigation(e: KeyboardEvent): void {
  if (isModalOpen()) return;
  const tag = (document.activeElement?.tagName ?? '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  let days: number;
  switch (e.key) {
    case 'ArrowLeft': days = 1; break;
    case 'ArrowRight': days = -1; break;
    case 'ArrowUp': days = -7; break;
    case 'ArrowDown': days = 7; break;
    default: return;
  }
  e.preventDefault();
  moveSelectedByDays(days);
}

const HEBREW_MONTH_LABELS = [
  { m: 7, name: 'תשרי' }, { m: 8, name: 'חשון' }, { m: 9, name: 'כסלו' },
  { m: 10, name: 'טבת' }, { m: 11, name: 'שבט' }, { m: 12, name: 'אדר א׳' },
  { m: 13, name: 'אדר ב׳' }, { m: 1, name: 'ניסן' }, { m: 2, name: 'אייר' },
  { m: 3, name: 'סיון' }, { m: 4, name: 'תמוז' }, { m: 5, name: 'אב' }, { m: 6, name: 'אלול' },
];

function populateHebrewMonths(year: number): void {
  const select = document.getElementById('hmonth-select') as HTMLSelectElement | null;
  if (!select) return;
  const currentVal = select.value;
  const leap = isHebrewLeapYear(year);
  select.innerHTML = HEBREW_MONTH_LABELS
    .filter(({ m }) => m !== 13 || leap) // חודש יג רק בשנה מעוברת
    .map(({ m, name }) => {
      // בשנה רגילה חודש 12 = אדר (לא אדר א׳)
      const label = (!leap && m === 12) ? 'אדר' : name;
      return `<option value="${m}">${label}</option>`;
    })
    .join('');
  if (currentVal) select.value = currentVal;
}

function openJumpDialog(): void {
  const dialog = document.getElementById('jump-dialog');
  if (!dialog) return;

  const d = state.selectedDate;
  const isoStr = toDateKey(d);
  const gregInput = document.getElementById('gregorian-date-input') as HTMLInputElement | null;
  if (gregInput) gregInput.value = isoStr;

  // מילוי ערכי ברירת-מחדל לפי התאריך העברי של היום הנבחר
  void (async () => {
    const h = await getHebrewDate(d);
    populateHebrewMonths(h.year);
    const hyearInput = document.getElementById('hyear-input') as HTMLInputElement | null;
    const hdayInput = document.getElementById('hday-input') as HTMLInputElement | null;
    const hmonthSelect = document.getElementById('hmonth-select') as HTMLSelectElement | null;
    if (hyearInput) hyearInput.value = formatHebrewYear(h.year);
    if (hdayInput) hdayInput.value = toHebrewNumber(h.day);
    if (hmonthSelect) hmonthSelect.value = String(h.month);
  })();

  dialog.hidden = false;
  gregInput?.focus();
}

function closeJumpDialog(): void {
  const dialog = document.getElementById('jump-dialog');
  if (dialog) dialog.hidden = true;
}

function updateToolbarSelection(): void {
  document.querySelectorAll<HTMLButtonElement>('.menu-display-btn').forEach((button) => {
    const active = button.dataset.display === state.calendarDisplay;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });

  const eventsToggle = document.getElementById('events-toggle');
  eventsToggle?.classList.toggle('is-active', state.eventsPanelOpen);
  eventsToggle?.setAttribute('aria-pressed', String(state.eventsPanelOpen));

  const content = document.getElementById('calendar-content');
  content?.classList.toggle('events-open', state.eventsPanelOpen);
}

function toggleEventsPanel(): void {
  state.eventsPanelOpen = !state.eventsPanelOpen;
  updateToolbarSelection();
  updateCalendarSizing();
}

/**
 * מגביל את רוחב לוח החודש ביחס לגובה האזור הזמין, כדי שהתאים לא יימתחו
 * לכל רוחב המסך (מקביל ל-`_resolveMaxCalendarWidth` בגרסת ה-Dart).
 */
function updateCalendarSizing(): void {
  const board = document.getElementById('calendar-board');
  const content = document.getElementById('calendar-content');
  if (!board || !content) return;
  const height = content.clientHeight;
  if (height <= 0) return;
  // יחס ~1.5 בין רוחב לגובה שומר על תאים בפרופורציה נעימה במסכים רחבים.
  board.style.maxWidth = `${Math.round(height * 1.5)}px`;
}

function updateTitle(text: string): void {
  const title = document.getElementById('calendar-title');
  if (title) {
    title.textContent = text;
  }
}

function createDayCell(cell: CalendarCellData): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'calendar-cell';

  if (cell.isOutsidePrimaryRange) button.classList.add('is-outside');
  if (cell.isSelected) button.classList.add('is-selected');
  if (cell.isToday) button.classList.add('is-today');
  if (cell.labels.length > 0 || cell.isShabbat) button.classList.add('is-special');

  const isGregorianOnly = state.calendarDisplay === 'gregorian';
  const primaryDay = isGregorianOnly ? String(cell.date.getDate()) : toHebrewNumber(cell.hebrew.day);
  const isFirstOfMonth = isGregorianOnly ? cell.date.getDate() === 1 : cell.hebrew.day === 1;
  const monthName = isGregorianOnly ? GREGORIAN_MONTH_FORMATTER.format(cell.date) : cell.hebrew.monthName;

  button.innerHTML = `
    <div class="cell-header">
      ${state.calendarDisplay === 'combined'
        ? `<span class="cell-greg-day">${cell.date.getDate()}</span>` : ''}
      <span class="cell-day-wrap">
        <span class="cell-hebrew-day">${primaryDay}</span>
        ${isFirstOfMonth ? `<span class="cell-month-name">${monthName}</span>` : ''}
      </span>
    </div>
    <div class="cell-body">
      ${cell.labels.map((label) => `<div class="cell-label cell-label-${label.kind}">${label.text}</div>`).join('')}
    </div>
  `;

  button.addEventListener('click', () => {
    state.selectedDate = stripTime(cell.date);
    // אם הלחיצה על יום מחוץ לחודש המוצג — מזיזים את התצוגה לחודש של היום הנלחץ.
    // אחרת לא משנים anchor, כדי שהתצוגה לא תקפוץ.
    if (cell.isOutsidePrimaryRange) {
      state.anchorDate = stripTime(cell.date);
    }
    renderCalendar();
  });

  return button;
}

async function renderCalendar(): Promise<void> {
  const currentRender = ++renderSequence;
  updateToolbarSelection();

  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  grid.className = 'calendar-grid calendar-grid-month';
  grid.innerHTML = '<div class="calendar-loading">טוען לוח…</div>';

  const selectedHebrew = await getHebrewDate(state.selectedDate);
  if (currentRender !== renderSequence) return;
  updateTitle(formatSelectedTitle(state.selectedDate, selectedHebrew));

  const cells = await buildCalendarCells();
  if (currentRender !== renderSequence) return;

  grid.innerHTML = '';
  const trackingInputs: TrackingCellInput[] = [];
  cells.forEach((cell) => {
    const cellEl = createDayCell(cell);
    grid.appendChild(cellEl);
    trackingInputs.push({
      cellEl,
      hebrewDate: { year: cell.hebrew.year, month: cell.hebrew.month, day: cell.hebrew.day },
      showAdd: !cell.isOutsidePrimaryRange,
    });
  });
  mountTrackingLayers(trackingInputs);
  updateEventsPanel(cells);
  updateCalendarSizing();
}

/** מעדכן את חלונית האירועים לחודש העברי המוצג (לפי תא ראשון בתוך הטווח). */
function updateEventsPanel(cells: CalendarCellData[]): void {
  const panel = document.getElementById('events-panel') as CalendarEventsPanel | null;
  if (!panel) return;
  const primary = cells.find((c) => !c.isOutsidePrimaryRange) ?? cells[0];
  if (!primary) return;
  panel.year = primary.hebrew.year;
  panel.month = primary.hebrew.month;
  panel.monthName = primary.hebrew.monthName;
}

async function initializeState(): Promise<void> {
  const hostDate = await getSelectedDateFromHost();
  if (hostDate) {
    state.selectedDate = hostDate;
    state.anchorDate = startOfMonth(hostDate);
  }
}

// ה-theme מגיע תמיד ב-`plugin.boot` (ראה ה-handler למטה) — אין לקרוא ל-`app.getTheme`
// ידנית בטעינה (וגם דורש הרשאת `app.info.read`). פונקציה זו רק מחילה theme ברירת-מחדל
// כרשת ביטחון לסביבות שבהן boot לא נשא theme (למשל stub בדפדפן).
function applyFallbackTheme(): void {
  if (!state.theme) {
    applyTheme({
      mode: 'light',
      colorScheme: {
        primary: '#9b6f12',
        surface: '#fcf8f1',
        onSurface: '#302417',
        primaryContainer: '#edd8aa',
        onPrimaryContainer: '#392600',
        secondaryContainer: '#f5e5c8',
        onSecondaryContainer: '#382d18',
        surfaceContainer: '#f7efe2',
        surfaceContainerHighest: '#efe3cf',
        outline: '#8d7a63',
        outlineVariant: '#d8c7af',
        onSurfaceVariant: '#6f5e49',
      },
    });
  }
}

async function initializeApp(bootTheme?: ThemeData): Promise<void> {
  if (initStarted) {
    if (bootTheme && isAuthenticated) {
      applyTheme(bootTheme);
      await initializeState();
      await renderCalendar();
    }
    return;
  }

  initStarted = true;

  if (bootTheme) {
    applyTheme(bootTheme);
  } else {
    applyFallbackTheme();
  }

  if (IS_DEV_MODE) {
    isAuthenticated = true;
    launchMainApp();
    return;
  }

  const savedHash = await getSavedPasswordHash();
  if (!savedHash) {
    renderPasswordScreen('set');
  } else {
    renderPasswordScreen('verify');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // ה-shell יוצג רק לאחר אימות סיסמא — כאן לא מציגים כלום
});

Otzaria.on('plugin.boot', async (bootData: { plugin?: { version?: string }; theme: ThemeData }) => {
  if (bootData.plugin?.version) pluginVersion = bootData.plugin.version;
  await initializeApp(bootData.theme);
});

Otzaria.on('theme.changed', (themeData: ThemeData) => {
  applyTheme(themeData);
  void renderCalendar();
});

Otzaria.on('calendar.date_changed', (payload: { date: string }) => {
  const nextDate = stripTime(new Date(payload.date));
  if (Number.isNaN(nextDate.getTime())) return;

  state.selectedDate = nextDate;
  state.anchorDate = startOfMonth(nextDate);
  void renderCalendar();
});
