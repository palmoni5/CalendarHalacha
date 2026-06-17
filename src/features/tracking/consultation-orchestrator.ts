/**
 * נקודת הכניסה ל"זרימת ההתייעצות" (סעיף 28): נקראת ע"י `main.ts` אחרי שדיאלוג
 * היצירה שמר `UserEvent`. בונה את השלבים מ-`consultation-steps.ts` (מבוסס
 * `tracking-recurrence.ts`), מציג את `<consultation-flow>`, ובסיום שומר ל-store
 * את האירועים המחושבים שאושרו.
 *
 * אינו מחשב הלכה בעצמו — רק מתאם בין בונה-השלבים, הקומפוננטה, וה-store.
 */

import './components/consultation-flow.js';
import type { ConsultationFlow } from './components/consultation-flow.js';
import type { ConsultationStep } from './consultation-steps.js';
import { buildConsultationSteps } from './consultation-steps.js';
import { trackingStore } from './tracking-store.js';
import type { UserEvent } from './tracking-types.js';

let activeFlow: ConsultationFlow | null = null;

export async function startConsultation(rootEvent: UserEvent): Promise<void> {
  abortActiveConsultation();

  const state = trackingStore.getState();
  const steps = buildConsultationSteps(rootEvent, state.userEvents);
  if (steps.length === 0) return;

  const el = document.createElement('consultation-flow') as ConsultationFlow;
  el.steps = steps;
  activeFlow = el;

  await new Promise<void>((resolve) => {
    el.addEventListener(
      'consultation-complete',
      (e) => {
        const detail = (e as CustomEvent<{ approved: ConsultationStep[] }>).detail;
        detail.approved.forEach((step) =>
          step.commit.forEach((ce) => trackingStore.addComputedEvent(ce)),
        );
        if (activeFlow === el) activeFlow = null;
        el.remove();
        resolve();
      },
      { once: true },
    );
    document.body.appendChild(el);
  });
}

/** ביטול התייעצות פעילה (אם המשתמש פותח אירוע חדש באמצע). */
export function abortActiveConsultation(): void {
  activeFlow?.remove();
  activeFlow = null;
}
