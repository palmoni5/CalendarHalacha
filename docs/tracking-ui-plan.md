# מסמך תכנון: לוח מעקב לאירועים הלכתיים

## 1. מטרת המסמך

מסמך זה מגדיר תכנון מפורט לפיצ'ר חדש בתוך לוח השנה הקיים:

- יצירת אירועי משתמש על גבי ימי הלוח
- חישוב ראשוני של זמנים רלוונטיים
- הצגת ווידג'טים, פופ-אפים ואנימציות
- יצירת מבנה כללים שנקרא מקובצי JSON נפרדים

המטרה היא לא לממש כעת את כל ההלכות (הלכות.md), אלא לבנות בסיס UI/UX וארכיטקטורה נקיים, כך שניתן יהיה להוסיף את ההלכות בהמשך בלי לפרק את הממשק.

## 2. כלל היסוד של הפיצ'ר

התוכנה אינה פועלת במקום המשתמש.

התוכנה:

- מציעה תאריכים רלוונטיים
- סופרת מרווחים
- מסמנת ימים אפשריים
- מבקשת אישור מהמשתמש לפני יצירת יום פרישה מחושב

התוכנה אינה:

- מחליטה במקום המשתמש על משמעות הלכתית סופית
- מסתירה מהמשתמש את דרך החישוב
- מקשיחה הלכה בתוך קוד UI

## 3. עקרונות מחייבים

### 3.1 הפרדה בין סוגי נתונים

יש להפריד הפרדה מלאה בין:

- אירועי קלט של המשתמש
- אירועים מחושבים של התוכנה
- קביעויות
- הגדרות כללים

אסור לשמור את כולם באותה רשימה בלי שדה סוג ברור.

### 3.2 מקור אמת לכללים

כל כלל חישובי חייב להופיע ב-2 מקומות בלבד:

- `הלכות.md` כמסמך אנושי
- קובצי JSON כמסמך מכונה

הקוד עצמו לא יכיל תנאים הלכתיים קשיחים, אלא רק מנגנון כללי שקורא JSON ומיישם אותו.

### 3.3 הפרדה לוגית מחייבת

יש להפריד בין:

- זמני טומאה: מוזנים על ידי המשתמש בלבד
- זמני פרישה: מחושבים על ידי התוכנה בלבד

יש להפריד גם בין:

- וסת שאינו קבוע
- וסת קבוע

גם אם בשלב ראשון ניישם רק חלק מהכללים, המבנה חייב לאפשר את ההפרדה כבר מההתחלה.

### 3.4 שלב א' מול שלבים עתידיים

בשלב הראשון של ה-UI נתכנן תמיכה מלאה בזרימות הבאות:

- יצירת אירוע משתמש על יום בלוח
- בחירת יום או לילה
- חישוב עונת החודש
- חישוב עונה בינונית 30/31
- חישוב הפלגה כאשר יש אירוע קודם
- יצירת ימי פרישה מחושבים רק לאחר אישור משתמש

לא נדרשת כעת הטמעה מלאה של:

- כל סוגי הקביעויות
- כל הביטולים המורכבים
- כל המקרים החריגים של `הלכות.md`

אבל המבנה חייב להשאיר להם מקום ברור.

## 4. מצב קיים בפרויקט

כרגע יש לוח שנה פעיל ב-`src/main.ts` עם:

- תצוגת חודש
- תצוגת שבוע
- תאים מסוג `calendar-cell`
- דיאלוגים קיימים
- ערכת נושא דינמית
- RTL כברירת מחדל

כלומר:

- אין צורך לבנות לוח חדש מאפס
- כן צריך להוסיף שכבת "מעקב אירועים" מעל הלוח הקיים

## 5. תוצרי הפיצ'ר ברמת המשתמש

המשתמש יוכל:

- לרחף על תא יום ולראות כפתור `+`
- ללחוץ על `+` וליצור אירוע חדש
- לבחור האם האירוע חל ביום או בלילה
- לראות חישוב מודרך, שלב אחרי שלב
- לאשר או לדחות כל יום פרישה מחושב
- להבין למה יום סומן

## 6. עקרון UX מרכזי

יש להציג את החישוב כתהליך מודרך, לא כתוצאה "שנופלת" על המשתמש.

לכן הפיצ'ר יעבוד בסגנון הזה:

1. המשתמש יוצר אירוע.
2. התוכנה מתמקדת בתאריך הרלוונטי הבא.
3. התוכנה מסבירה מה היא מציעה.
4. המשתמש מאשר.
5. רק אז נשמר אירוע מחושב.

זה חשוב יותר ממהירות.

## 7. מבנה נתונים מומלץ

## 7.1 ישויות בסיס

### `UserEvent`

אירוע שהמשתמש הזין בפועל.

שדות מומלצים:

```ts
interface UserEvent {
  id: string;
  type: 'user_event';
  dateKey: string;          // YYYY-MM-DD
  hebrewDate: {
    day: number;
    month: number;
    year: number;
    monthName: string;
  };
  onah: 'day' | 'night';
  createdAt: string;
  notes?: string;
  ignoreForAllCalculations?: boolean;
  ignoreForPatternsOnly?: boolean;
}
```

### `ComputedEvent`

אירוע שהתוכנה מציעה או יצרה.

```ts
interface ComputedEvent {
  id: string;
  type: 'computed_event';
  category: 'veset_hachodesh' | 'onah_beinonit' | 'haflagah' | 'fixed_pattern';
  dateKey: string;
  onah?: 'day' | 'night';
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  sourceUserEventId: string;
  relatedUserEventIds: string[];
  reasonCode: string;
  explanation: string;
  createdAt: string;
}
```

### `CalendarMarker`

שכבת תצוגה בלבד. לא מקור אמת.

```ts
interface CalendarMarker {
  id: string;
  dateKey: string;
  markerType: 'user_event' | 'pending' | 'prisha_day' | 'count_step' | 'highlight';
  label: string;
  colorToken: string;
  priority: number;
}
```

### `CalculationSession`

אובייקט זמני לתהליך האנימציה והאישור.

```ts
interface CalculationSession {
  id: string;
  rootUserEventId: string;
  step:
    | 'idle'
    | 'created'
    | 'month_target_preview'
    | 'month_target_confirmed'
    | 'onah_beinonit_counting'
    | 'onah_beinonit_confirm'
    | 'haflagah_distance_preview'
    | 'haflagah_future_preview'
    | 'done';
  focusedDateKeys: string[];
  pendingReasonCodes: string[];
}
```

## 7.2 עיקרון חשוב

אסור להשתמש באותו אובייקט גם כנתון עסקי וגם כמצב אנימציה.

דוגמה לא נכונה:

- לשמור "יום 30 מהבהב" בתוך `UserEvent`

דוגמה נכונה:

- `ComputedEvent` ישמור את ההצעה
- `CalculationSession` ישמור שעכשיו התא מהבהב

## 8. מבנה קבצים מומלץ

כרגע רוב הלוגיקה מרוכזת ב-`src/main.ts`. כדי לא להפוך את הקובץ לבלתי ניתן לתחזוקה, מומלץ לפצל את הפיצ'ר החדש כך:

```text
src/
  main.ts
  styles.css
  features/
    tracking/
      tracking-types.ts
      tracking-store.ts
      tracking-selectors.ts
      tracking-controller.ts
      tracking-rules-loader.ts
      tracking-engine.ts
      tracking-confirmation-flow.ts
      tracking-animations.ts
      tracking-renderers.ts
      tracking-dialogs.ts
      tracking-utils.ts
  data/
    rules/
      halachic-rules.json
      ui-copy.he.json
      calculation-flow.json
```

### תפקיד כל קובץ

`tracking-types.ts`

- כל הטיפוסים

`tracking-store.ts`

- שמירת אירועי משתמש
- שמירת אירועים מחושבים
- שליפת אירועים לפי יום

`tracking-rules-loader.ts`

- טעינת JSON
- ולידציה בסיסית של מבנה הקובץ

`tracking-engine.ts`

- קבלת אירוע משתמש
- החזרת "הצעות חישוב"
- בלי DOM

`tracking-confirmation-flow.ts`

- ניהול שלבי האישור
- מעבר בין פופ-אפים ואנימציות

`tracking-animations.ts`

- גלילה
- הבהוב
- ספירה

`tracking-renderers.ts`

- הזרקת שכבות נוספות לתאי לוח
- יצירת badge, plus button, marker chip

`tracking-dialogs.ts`

- דיאלוג יצירת אירוע
- פופ-אפים מעוגנים לתא
- דיאלוגי אישור

## 9. מבנה קובצי JSON

## 9.1 למה JSON

הדרישה היא שכללים יהיו מחוץ לקוד.

לכן הקוד צריך לדעת לבצע פעולות כלליות בלבד:

- `count_inclusive_days`
- `shift_by_hebrew_month`
- `duplicate_marker_if_day_missing`
- `create_confirmation_step`

אבל ההחלטה איזה כלל מופעל, מתי, ומה הטקסט שמוצג, תבוא מ-JSON.

## 9.2 קובץ כללים ראשי

קובץ מוצע:

`src/data/rules/halachic-rules.json`

דוגמה:

```json
{
  "version": 1,
  "principles": {
    "userEventsOnlyCreateTumahTimes": true,
    "computedEventsOnlyCreatePrishaTimes": true,
    "allConditionsMustExistInHalachotDocument": true
  },
  "enabledGroups": {
    "nonFixedVeset": true,
    "fixedVeset": true,
    "displayRules": true
  },
  "rules": [
    {
      "id": "veset-hachodesh-basic",
      "category": "veset_hachodesh",
      "enabled": true,
      "stage": "phase_1",
      "input": "latest_user_event",
      "operation": "shift_by_hebrew_month_same_day",
      "requiresUserConfirmation": true,
      "createsComputedEvent": true,
      "reasonCode": "veset_hachodesh_basic"
    },
    {
      "id": "onah-beinonit-30-31",
      "category": "onah_beinonit",
      "enabled": true,
      "stage": "phase_1",
      "input": "latest_user_event",
      "operation": "count_inclusive_days",
      "countFrom": 1,
      "targets": [30, 31],
      "requiresUserConfirmation": true,
      "createsComputedEvent": true,
      "reasonCode": "onah_beinonit_basic"
    }
  ]
}
```

## 9.3 קובץ טקסטים למסכים

קובץ מוצע:

`src/data/rules/ui-copy.he.json`

מטרתו:

- שכל טקסטי ההנחיה יהיו במקום אחד
- שניתן יהיה לשנות ניסוח בלי לגעת בקוד

דוגמה:

```json
{
  "createEvent": {
    "title": "יצירת אירוע חדש",
    "onahLabel": "האם האירוע חל ביום או בלילה?"
  },
  "confirmations": {
    "vesetHachodesh": "האירוע חל ביום {eventDay} לחודש {eventMonth}, ב{onahLabel}. נראה כי עונת החודש תחול בתאריך {targetDay} בחודש {targetMonth}. האם אתה מאשר?",
    "onahBeinonit": "האם אתה מאשר לקבוע את ימים {firstTarget} ו-{secondTarget} כעונה בינונית?",
    "haflagahDistance": "האם אתה מאשר שההפלגה בין האירועים היא {distance} ימים?"
  }
}
```

## 9.4 קובץ זרימת UI

קובץ מוצע:

`src/data/rules/calculation-flow.json`

מטרתו:

- להגדיר סדר שלבים
- לאפשר שינוי עתידי בזרימה בלי לשנות הרבה קוד

דוגמה:

```json
{
  "flowId": "new-user-event-flow",
  "steps": [
    "create_event",
    "preview_month_target",
    "confirm_month_target",
    "count_onah_beinonit",
    "confirm_onah_beinonit",
    "preview_haflagah_if_possible",
    "confirm_haflagah_if_possible"
  ]
}
```

## 10. מה חייב להיות בלוח עצמו

## 10.1 שכבות בתא יום

כל תא יום צריך להיות בנוי כך שיוכל להכיל כמה שכבות במקביל:

1. נתוני היום הרגילים
2. כפתור `+`
3. סימון אירוע משתמש
4. סימון יום פרישה מחושב
5. מספר רץ בזמן אנימציית ספירה
6. מסגרת highlight
7. עוגן לפופ-אפ מעל התא

### מבנה DOM מומלץ לכל תא

```html
<button class="calendar-cell">
  <div class="cell-base"></div>
  <button class="cell-add-event-btn">+</button>
  <div class="cell-markers"></div>
  <div class="cell-count-overlay"></div>
  <div class="cell-focus-ring"></div>
  <div class="cell-popover-anchor"></div>
</button>
```

הערה חשובה:

- בתוך HTML תקני לא מומלץ לשים `button` בתוך `button`
- לכן בפועל עדיף להפוך את התא ל-`div role="button"` או להשתמש בכפתור פנימי רק אם מבנה התא ישתנה

המלצה מעשית:

- לשמור את התא כ-`div.calendar-cell`
- להגדיר אזור קליק ראשי נפרד עבור בחירת היום
- וכפתור `+` ככפתור אמיתי נפרד

## 10.2 כפתור הוספה `+`

התנהגות:

- בדסקטופ: יופיע בריחוף על התא
- במובייל או ללא hover: יופיע תמיד על התא הנבחר
- אם כבר יש אירוע באותו יום: הכפתור עדיין יופיע, אך מתחתיו תהיה גם רשימת סימונים קיימת

עיצוב:

- כפתור קטן עגול
- בפינה העליונה-שמאלית או העליונה-ימנית לפי האיזון עם התאריך
- אנימציית fade + scale
- לא להסתיר מידע חשוב

מפרט מומלץ:

- גודל: `28px`
- צל עדין
- רקע: `var(--primary)`
- טקסט/אייקון: `+`
- מצב hover: בהירות מעט גבוהה יותר

## 10.3 סמני אירועים בתוך התא

יש להבדיל ויזואלית בין:

- אירוע משתמש
- יום פרישה ממתין לאישור
- יום פרישה מאושר

מיפוי מוצע:

- אירוע משתמש: chip מלא כהה
- אירוע פרישה ממתין: chip עם מסגרת מקווקוות
- אירוע פרישה מאושר: chip בצבע משני מלא

טקסטים קצרים בתוך התא:

- `אירוע`
- `עונת החודש`
- `30`
- `31`
- `הפלגה`

אין להציג בתוך התא טקסטים ארוכים.

## 11. פופ-אפים ודיאלוגים

## 11.1 סוגי שכבות

יש 3 סוגי שכבות, ואין לערבב ביניהן:

### A. דיאלוג יצירת אירוע

שכבה מרכזית מלאה.

שימוש:

- יצירת אירוע חדש
- עריכת אירוע קיים

### B. פופ-אפ מעוגן לתא

שכבה קטנה שמחוברת לתא מסוים בלוח.

שימוש:

- בקשת אישור על יום מחושב
- הסבר על חישוב נקודתי

### C. Toast / הודעה קצרה

שימוש:

- "האירוע נשמר"
- "יום הפרישה נוסף"

לא להשתמש ב-toast לשאלות שדורשות החלטה.

## 11.2 דיאלוג יצירת אירוע

שם מומלץ:

`CreateEventDialog`

שדות:

- תאריך נבחר
- תאריך עברי
- בחירת עונה: יום / לילה
- הערה אופציונלית
- כפתור שמירה
- כפתור ביטול

מבנה:

```text
כותרת: יצירת אירוע חדש
שורת תאריך: י"ב אייר תשפ"ו | 30.04.2026
שאלה: האם האירוע חל ביום או בלילה?
[ יום ] [ לילה ]
הערה (אופציונלי)
[ ביטול ] [ שמור והתחל חישוב ]
```

כללי UX:

- אי אפשר להמשיך בלי לבחור יום או לילה
- ברירת מחדל: אין בחירה
- אחרי שמירה, הדיאלוג נסגר ומתחיל flow מודרך

## 11.3 פופ-אפ אישור לעונת החודש

שם מומלץ:

`AnchoredCalculationPopover`

מיקום:

- מעל התא של היום המחושב
- אם אין מקום למעלה, מתחת לתא
- אם התא בקצה המסך, הפופ-אפ יוסט אופקית

תוכן:

- אייקון קטן
- טקסט הסבר
- כפתור `אשר`
- כפתור `לא עכשיו`
- קישור קטן: `למה היום הזה?`

נוסח בסיסי:

`האירוע חל ביום X לחודש Y, ביום/לילה: נראה כי עונת החודש תחול בתאריך X בחודש הבא. האם אתה מאשר?`

## 11.4 פופ-אפ אישור לעונה בינונית

מיקום:

- מעל אזור 30/31
- אם שני הימים נראים על המסך, הפופ-אפ יעוגן לאמצע ביניהם
- אם רק אחד נראה, יבוצע scroll עד ששניהם נראים

נוסח:

`האם אתה מאשר לקבוע את ימים אלו כעונה בינונית?`

כפתורים:

- `אשר`
- `דלג`

הערה:

- הכפתור `דלג` אינו מוחק את האירוע המקורי
- הוא רק מונע יצירת אירוע מחושב עבור שלב זה

## 11.5 פופ-אפ אישור הפלגה

שלב א':

- קודם מציגים את המרחק בין האירוע הקודם לנוכחי

נוסח:

`האם אתה מאשר שההפלגה בין האירועים היא XX ימים?`

שלב ב':

- לאחר האישור מתחילה ספירה נוספת קדימה מאירוע נוכחי

שלב ג':

- כשהיעד מגיע, מסמנים אותו כיום פרישה מוצע

## 12. אנימציות

האנימציות כאן אינן קישוט. הן חלק מההסבר למשתמש.

לכן כל אנימציה צריכה לענות על שאלה:

- מאיפה החישוב התחיל
- לאן הוא הגיע
- למה היום הזה סומן

## 12.1 רשימת אנימציות נדרשות

### 1. הופעת כפתור `+`

- `opacity: 0 -> 1`
- `transform: scale(0.92) -> scale(1)`
- משך: `120ms`

### 2. גלילה ממוקדת ליום יעד

שימוש:

- אם יום האירוע נמצא בתחתית החודש
- אם יום 30/31 לא על המסך
- אם צריך לראות את האירוע הקודם והנוכחי יחד

מפרט:

- גלילה חלקה
- משך מומלץ: `280ms` עד `420ms`
- לאחר הגלילה: עצירה קצרה של `180ms`

### 3. הבהוב עדין של תא יעד

שימוש:

- עונת החודש
- יום 30
- יום 31
- יעד הפלגה

מפרט:

- פולס עדין ולא אגרסיבי
- טבעת חיצונית או רקע רך
- מחזור: `1.8s`
- עד 3 חזרות או עד אישור משתמש

### 4. אנימציית ספירת ימים

שימוש:

- עונה בינונית
- הפלגה

אופן פעולה:

- המספרים נכתבים על התאים בזה אחר זה
- יום האירוע מסומן כ-`1`
- ההמשך נספר באופן כולל

מפרט:

- קצב בסיסי: `40ms` עד `55ms` לכל יום
- כל תא שמקבל מספר יבצע fade-in קטן
- התא הנוכחי באנימציה יודגש רגעית

### 5. חיבור חזותי בין אירוע קודם לאירוע נוכחי

לא חובה בשלב ראשון, אך מומלץ בתכנון:

- קו דק או "מסלול ספירה"
- או highlight מתחלף בין שני הימים

אם לא מיושם בשלב א':

- מספיק להדגיש את שני התאים יחד

## 12.2 כללי איכות לאנימציות

- כל אנימציה חייבת להיות ניתנת לעצירה
- אם המשתמש לוחץ `דלג`, האנימציה נפסקת מיד
- אם המשתמש יוצר אירוע חדש בזמן flow קודם, flow קודם נסגר
- יש לתמוך ב-`prefers-reduced-motion`

במצב reduced motion:

- אין ספירה רצה
- יש קפיצה ישירה לתוצאה עם highlight קצר

## 13. זרימת משתמש מלאה

## 13.1 יצירת אירוע ראשון

### שלב 1

המשתמש מרחף על תא יום.

תוצאה:

- מופיע `+`

### שלב 2

המשתמש לוחץ `+`.

תוצאה:

- נפתח `CreateEventDialog`

### שלב 3

המשתמש בוחר יום או לילה ולוחץ שמירה.

תוצאה:

- נשמר `UserEvent`
- נוצר `CalculationSession`

### שלב 4

המנוע קורא את JSON ומריץ את כלל עונת החודש.

תוצאה:

- נמצא יום יעד
- הלוח גולל ליום היעד
- תא היעד מהבהב
- מופיע פופ-אפ אישור

### שלב 5

המשתמש מאשר.

תוצאה:

- נשמר `ComputedEvent` מסוג `veset_hachodesh`

### שלב 6

מתחילה אנימציית ספירה ל-30/31.

תוצאה:

- המספרים נכתבים על גבי התאים
- 30 ו-31 מודגשים
- מופיע פופ-אפ אישור

### שלב 7

המשתמש מאשר.

תוצאה:

- נשמרים `ComputedEvent` עבור 30 ו-31

### שלב 8

ה-flow מסתיים.

תוצאה:

- מוצגת הודעת הצלחה קצרה

## 13.2 יצירת אירוע שני

עד שלב 7 ההתנהגות זהה.

לאחר מכן:

### שלב 8

אם יש אירוע קודם רלוונטי:

- המנוע מחשב מרחק inclusive בין האירוע הקודם לנוכחי

### שלב 9

הלוח זז כך ששני האירועים ייראו באותו מסך.

אם אי אפשר באותו מסך:

- קודם מציגים את הקודם
- ואז מעבר רך לנוכחי

### שלב 10

אנימציית ספירה מהאירוע הקודם לנוכחי.

### שלב 11

מופיע פופ-אפ:

`האם אתה מאשר שההפלגה בין האירועים היא XX ימים?`

### שלב 12

לאחר אישור:

- מתחילה ספירה נוספת מהאירוע הנוכחי קדימה, באותו מספר ימים

### שלב 13

יום היעד מודגש.

### שלב 14

נשמר `ComputedEvent` מסוג `haflagah`

## 14. איך לחשוב על החישובים בשלב התכנון

הקוד צריך לעבוד בגישה הבאה:

### שלב א'

לקבל רשימת אירועי משתמש.

### שלב ב'

לחלץ "אירועים רלוונטיים לחישוב".

### שלב ג'

להריץ rules לפי JSON.

### שלב ד'

להחזיר רשימת `CalculationProposal`.

דוגמה:

```ts
interface CalculationProposal {
  id: string;
  category: 'veset_hachodesh' | 'onah_beinonit' | 'haflagah';
  targetDateKeys: string[];
  targetOnah?: 'day' | 'night';
  needsConfirmation: boolean;
  displayMode: 'anchored_popover' | 'counting_animation';
  copyKey: string;
  metadata: Record<string, string | number | boolean>;
}
```

ה-UI לא צריך לחשב הלכה.

ה-UI צריך רק:

- לבקש proposals
- להציג אותן
- לקבל אישור
- לשמור תוצאה

## 15. כללים שכדאי לתכנן כבר עכשיו, גם אם לא ניישם עדיין

כדי לא להיתקע אחר כך, יש להכין מבנה שתומך גם באלו:

- ביטול חישוב קודם על ידי אירוע חדש
- קביעות
- קביעות שמבטלת עונה בינונית
- התעלמות מלאה מאירוע
- התעלמות מאירוע רק לצורך קביעויות
- סימון כמה סיבות לאותו יום פרישה

לכן `ComputedEvent` צריך לתמוך בריבוי סיבות, או לחלופין מספר אירועים על אותו יום.

המלצה:

- לשמור כמה אירועים נפרדים
- ובשכבת התצוגה למזג אותם ל-chip אחד עם tooltip

## 16. ארכיטקטורת תצוגה מומלצת

## 16.1 רינדור התאים

כיום `createDayCell()` בונה תא עם HTML פשוט.

יש לשדרג אותו כך שיקבל גם:

- `dayEvents`
- `dayComputedEvents`
- `dayUiState`

חתימה מוצעת:

```ts
function createDayCell(
  cell: CalendarCellData,
  dayState: DayTrackingState
): HTMLElement
```

```ts
interface DayTrackingState {
  userEvents: UserEvent[];
  computedEvents: ComputedEvent[];
  countLabel?: string;
  isFlowFocused: boolean;
  isFlowTarget: boolean;
  showAddButton: boolean;
}
```

## 16.2 ניהול מצב גלובלי

מצב חדש מומלץ:

```ts
interface TrackingState {
  userEvents: UserEvent[];
  computedEvents: ComputedEvent[];
  activeSession: CalculationSession | null;
  hoveredDateKey: string | null;
  popover: {
    kind: 'none' | 'calculation_confirmation';
    anchorDateKey?: string;
    proposalId?: string;
  };
}
```

אין לשמור state כזה במשתני DOM.

ה-state צריך להיות מקור אמת, והרינדור נגזר ממנו.

## 17. שמירה ואחסון

מאחר שכבר קיימות הרשאות:

- `plugin.storage.read`
- `plugin.storage.write`

אפשר לשמור את הנתונים בתוך storage של התוסף.

מבנה מוצע:

```json
{
  "trackingData": {
    "userEvents": [],
    "computedEvents": [],
    "settings": {
      "showDay31": true
    }
  }
}
```

כלל חשוב:

- לא לשמור מצב אנימציה ב-storage
- רק נתונים עסקיים

## 18. נגישות ושימושיות

## 18.1 נגישות מקלדת

חובה:

- ניתן להגיע ליום בעזרת מקלדת
- ניתן לפתוח יצירת אירוע בלי עכבר
- ניתן לבחור יום/לילה בעזרת Tab ו-Enter
- פופ-אפ אישור צריך לקבל focus
- Escape יסגור פופ-אפ או דיאלוג

## 18.2 RTL

יש להניח RTL כברירת מחדל.

אבל עדיין:

- כל popover צריך לחשב היסטים נכון גם ב-RTL
- אנימציות גלילה צריכות לעבוד נכון גם אם הפריסה הפנימית משתנה

## 18.3 מובייל / מסכים קטנים

אין rely על hover בלבד.

לכן במסכים קטנים:

- כפתור `+` יופיע על היום הנבחר
- popover קטן מדי יוחלף ב-bottom sheet או dialog קטן

## 19. טקסטים מומלצים לממשק

## 19.1 יצירת אירוע

- כותרת: `יצירת אירוע חדש`
- שאלה: `האם האירוע חל ביום או בלילה?`
- כפתור ראשי: `שמור והתחל חישוב`
- כפתור משני: `ביטול`

## 19.2 אישור עונת החודש

- `האירוע חל ביום {eventDay} לחודש {eventMonth}, ב{onahLabel}. נראה כי עונת החודש תחול בתאריך {targetDay} בחודש {targetMonth}. האם אתה מאשר?`

## 19.3 אישור עונה בינונית

- `האם אתה מאשר לקבוע את ימים {day30} ו-{day31} כעונה בינונית?`

## 19.4 אישור הפלגה

- `האם אתה מאשר שההפלגה בין האירועים היא {distance} ימים?`

## 19.5 הודעות קצרות

- `האירוע נשמר`
- `יום הפרישה נוסף`
- `השלב נדחה`

## 20. מה לא לעשות

### אסור

- לכתוב תנאי הלכתי ישירות בתוך click handler
- ליצור DOM לא מנוהל שמחזיק לוגיקה עסקית
- לשמור "יום 30" כמחרוזת חופשית בלי `reasonCode`
- לערבב אירוע משתמש עם יום פרישה מחושב
- לחייב hover במסכים קטנים
- ליצור אנימציות שלא ניתן לבטל

### לא מומלץ

- להכניס הכל ל-`src/main.ts`
- להשתמש ב-innerHTML גדול לכל flow מורכב
- לקודד טקסטים קשיחים בתוך TypeScript

## 21. תוכנית יישום מומלצת לג'וניור

## שלב 1: תשתית נתונים

- ליצור טיפוסים
- ליצור storage בסיסי
- ליצור loaders ל-JSON
- ליצור mocks זמניים ל-rules

תוצר מצופה:

- ניתן לטעון כללים ולהדפיס proposals ל-console

## שלב 2: שכבת רינדור תאי יום

- להוסיף כפתור `+`
- להוסיף markers
- להוסיף שכבת count overlay

תוצר מצופה:

- ניתן להציג תא עם אירוע משתמש ותא עם יום פרישה

## שלב 3: דיאלוג יצירת אירוע

- פתיחה מתוך תא
- בחירת יום/לילה
- שמירה ל-store

תוצר מצופה:

- אפשר ליצור `UserEvent` אמיתי

## שלב 4: flow עונת החודש

- קריאת כלל JSON
- חישוב יעד
- גלילה
- highlight
- פופ-אפ אישור
- שמירת `ComputedEvent`

תוצר מצופה:

- מסלול ראשון עובד מקצה לקצה

## שלב 5: flow עונה בינונית 30/31

- אנימציית ספירה
- סימון 30/31
- אישור

## שלב 6: flow הפלגה

- רק אם יש אירוע קודם
- ספירה בין שני אירועים
- אישור מרחק
- ספירה קדימה

## שלב 7: polishing

- reduced motion
- RTL קצוות
- מסכים קטנים
- פוקוס מקלדת

## 22. Checklist קבלה

הפיצ'ר ייחשב מוכן לשלב א' רק אם כל הסעיפים הבאים מתקיימים:

- יש כפתור `+` על תאי יום
- ניתן ליצור אירוע עם יום/לילה
- נשמרת הפרדה בין אירוע משתמש לבין אירוע מחושב
- החישוב הראשון נקרא דרך JSON
- עונת החודש מוצגת עם פופ-אפ אישור
- עונה בינונית מוצגת עם אנימציית ספירה
- בהזנת אירוע שני יש תמיכה ב-flow הפלגה
- כל יום פרישה מחושב דורש אישור משתמש
- אין תנאי הלכתי קשיח בתוך רכיב UI
- יש תמיכה ב-RTL
- יש fallback למסכים ללא hover
- ניתן לכבות אנימציה למשתמשי reduced motion

## 23. החלטות פתוחות שצריך להשאיר מסומנות

המסמך הזה מתכנן את הממשק, אבל חייב להשאיר שדות פתוחים עבור ההלכה עצמה.

יש לשמור רשימה גלויה של החלטות פתוחות, למשל:

- האם יום 31 תמיד מופעל
- האם דין ט"ז מיושם
- האם עונה נגדית מוצגת
- האם אור זרוע מוצג
- אילו קביעויות ייושמו בשלב ב'

החלטות אלו צריכות לשבת ב-JSON, לא להיעלם לתוך הקוד.

## 24. נספח: החלטות יסוד לפני יישום

הסעיף הזה מתעד החלטות שסוגרות פערים מהותיים מהסעיפים הקודמים. אסור להתחיל קוד בלי שההחלטות האלו ברורות, כי הן משפיעות על מבני נתונים ועל מנוע החישוב.

### 24.1 מודל זמן: תאריך עברי מתחיל בשקיעה

**החלטה:**

- כל החישובים מתבצעים בלוח העברי בלבד.
- היממה ההלכתית מתחילה בשקיעה.
- `onah: 'night'` משמעותו הלילה שמתחיל בשקיעת היום הלועזי הקודם, אך שייך לתאריך העברי של היום שאחריו.

**השלכה על מבני נתונים:**

```ts
interface UserEvent {
  id: string;
  type: 'user_event';
  hebrewDate: {            // מקור האמת
    day: number;
    month: number;         // 1..13 (כולל אדר ב')
    year: number;
    monthName: string;
    isLeapYear: boolean;
  };
  onah: 'day' | 'night';
  weekday: number;                       // 0..6 (0=ראשון)
  gregorianDateKey: string;              // תצוגה בלבד
  durationOnahs?: number;                // מספר עונות שהאירוע נמשך
  endHebrewDate?: HebrewDate;            // תאריך סיום אם נמשך מעבר לעונה אחת
  endOnah?: 'day' | 'night';
  flowIntensity?: 'spotting' | 'normal' | 'heavy';   // סיווג חופשי, ללא משמעות חישובית קשיחה
  isOngoing?: boolean;                   // אירוע פעיל שטרם הסתיים
  precededByOnahsClean?: number;         // מספר עונות נקיות לפני האירוע
  triggeredBy?: 'spontaneous' | 'physical_cause' | 'medication' | 'other';
  causeNote?: string;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
  ignoreForAllCalculations?: boolean;
  ignoreForPatternsOnly?: boolean;
  excludedRuleIds?: string[];            // אירוע זה לא יזין כללים מסוימים
}
```

- שדה `dateKey` הקודם הוסר. במקומו: `hebrewDate` (מקור אמת לחישוב) + `gregorianDateKey` (לתצוגה).
- מפתח לוגי לאיתור אירועים לפי יום עברי: `${year}-${month}-${day}` (פונקציית עזר `hebrewDateKey()`).

**השלכה על תצוגה:**

- יום פרישה מחושב מוצג בתא של היום העברי עצמו.
- בעתיד: תזכורת אופציונלית בתא של היום שלפניו עם הערה "מתחיל מהשקיעה".

### 24.2 כלל תאריך לא קיים: ל' שאינו קיים בחודש היעד

**החלטה:**

- אם אירוע התרחש ב-ל' לחודש קודם, והחודש שאליו מחושבת עונת החודש הוא חסר (29 יום בלבד), היעד יקבע ל-א' בחודש שאחרי (=ר"ח של החודש הבא, שהוא היום השני של ראש החודש).

**השלכה על JSON:**

```json
{
  "id": "veset-hachodesh-basic",
  "operation": "shift_by_hebrew_month_same_day",
  "missingDayFallback": "next_month_first_day",
  "...": "..."
}
```

המנוע חייב לתמוך באופרטור `missingDayFallback` עם הערכים: `next_month_first_day`, `previous_existing_day`, `skip`.

### 24.3 ריבוי אירועים על אותו יום

**החלטה:**

- מותרים מספר אירועים נפרדים (גם `UserEvent` וגם `ComputedEvent`) על אותו יום עברי.
- כל אירוע נשמר בנפרד, עם `id` משלו.
- שכבת התצוגה (`tracking-renderers.ts`) ממזגת אותם ל-chip חזותי אחד עם tooltip שמפרט את כולם.

**שדה `sourceUserEventId` ב-`ComputedEvent`:**

- חייב להיות **רשימה** ולא מחרוזת יחידה — אירוע מחושב יכול להיגזר מכמה אירועי משתמש (למשל הפלגה שמסתמכת על שני אירועים).

```ts
interface ComputedEvent {
  id: string;
  type: 'computed_event';
  category: 'veset_hachodesh' | 'onah_beinonit' | 'haflagah' | 'fixed_pattern';
  patternKind?: 'non_fixed' | 'fixed';            // וסת קבוע או שאינו קבוע
  hebrewDate: { day: number; month: number; year: number; monthName: string; isLeapYear: boolean };
  gregorianDateKey: string;
  onah?: 'day' | 'night';
  weekday?: number;
  spanOnahs?: number;                              // כמה עונות תופסת תקופת הפרישה
  endHebrewDate?: HebrewDate;
  endOnah?: 'day' | 'night';
  status: 'pending_confirmation' | 'confirmed' | 'rejected' | 'superseded' | 'expired';
  sourceUserEventIds: string[];
  relatedUserEventIds: string[];
  relatedComputedEventIds?: string[];              // הצעות שמסתמכות על הצעה אחרת
  reasonCode: string;
  reasonCodes?: string[];                          // כשאותו יום נופל מכמה כללים שונים
  ruleId: string;
  ruleIds?: string[];                              // ריבוי כללים תורמים
  explanation: string;
  computedFromIntervalDays?: number;               // המרחק שחושב (להפלגה)
  computedFromMonthOffset?: number;                // הפרש חודשים (לעונת החודש)
  matchStreak?: number;                            // כמה פעמים רצופות הכלל הזה התקיים
  patternEstablishedAt?: string;                   // מתי הכלל הפך ל"קבוע"
  priority: number;                                // לקביעת חשיבות בתצוגה כשיש חפיפות
  createdAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
  supersededAt?: string;
  supersededByEventId?: string;
  supersedesEventIds?: string[];                   // קישור הפוך
  expiredAt?: string;
  expiryReason?: 'newer_event' | 'pattern_broken' | 'manual' | 'rule_disabled';
}
```

- הסעיף הקודם 7.1 (`sourceUserEventId: string`) מוחלף בהגדרה שכאן.

### 24.4 ביטול אירועים קודמים: בזמן חישוב, לא ב-storage

**החלטה:**

- כשנוצר אירוע משתמש חדש, מנוע החישוב רץ מחדש על כל הנתונים הרלוונטיים ומחזיר מערך מעודכן של הצעות.
- אירועים מחושבים ישנים שכבר אינם רלוונטיים מסומנים `status: 'superseded'` עם `supersededAt` ו-`supersededByEventId` — לא נמחקים פיזית.
- מחיקה פיזית רק במקרה שהמשתמש מבקש מפורשות.

**יתרון:** היסטוריית חישובים נשמרת, ניתן להבין למה יום מסוים סומן בעבר ולמה הוסר.

**השלכה על UI:**

- אירועים `superseded` לא מוצגים בלוח כברירת מחדל.
- מסך "היסטוריה" עתידי יוכל להציג אותם.

### 24.5 סכמת כלל ב-`halachic-rules.json` — שדות חובה

כל כלל ב-`rules[]` חייב להכיל את השדות הבאים:

```json
{
  "id": "string — מזהה ייחודי",
  "name": "string — שם קריא בעברית להצגה ב-debug",
  "category": "veset_hachodesh | onah_beinonit | haflagah | fixed_pattern",
  "kind": "absolute_date | weekday | interval_from_event",
  "enabled": true,
  "stage": "phase_1 | phase_2 | phase_3",

  "trigger": {
    "input": "latest_user_event | all_user_events | last_n_events",
    "n": 3
  },

  "operation": {
    "type": "shift_by_hebrew_month_same_day | count_inclusive_days | weekday_match | fixed_interval",
    "params": {
      "interval": 30,
      "missingDayFallback": "next_month_first_day"
    }
  },

  "removalConditions": [
    {
      "type": "newer_rule_of_same_category | n_events_without_match | manual_only",
      "n": 3
    }
  ],

  "requiresUserConfirmation": true,
  "createsComputedEvent": true,
  "reasonCode": "veset_hachodesh_basic",
  "copyKey": "vesetHachodesh"
}
```

**הבחנה בין `reasonCode` ל-`copyKey`:**

- `reasonCode` — מזהה לוגי של הסיבה לחישוב, נשמר ב-`ComputedEvent`, משמש לסינון, מבחנים, ולוגיקה.
- `copyKey` — מצביע למפתח טקסט ב-`ui-copy.he.json`. שני כללים שונים יכולים לחלוק `copyKey` (אותו ניסוח), אבל `reasonCode` שונה (סיבה לוגית שונה).

**שדה `kind`** מבחין בין שלושת סוגי הכללים שהוגדרו: כלל לפי תאריך מוחלט (כגון יום בחודש), כלל לפי יום בשבוע, וכלל לפי הפרשי זמן מאירוע קודם.

**שדה `removalConditions`** מגדיר מתי הכלל מפסיק להיות פעיל. אופציות:

- `newer_rule_of_same_category` — כלל חדש מאותה קטגוריה מחליף.
- `n_events_without_match` — לאחר n אירועים שלא תאמו לכלל הזה.
- `manual_only` — רק המשתמש יכול להסיר.

### 24.6 יצירת `id` ומיגרציית schema

**יצירת מזהים:** `crypto.randomUUID()` — זמין ב-WebView, אפס תלויות, אין התנגשויות.

**Storage schema versioning:**

```json
{
  "schemaVersion": 1,
  "trackingData": {
    "userEvents": [],
    "computedEvents": [],
    "settings": { "showDay31": true }
  }
}
```

לא נכתבת פונקציית מיגרציה עד שיש שינוי schema אמיתי. עד אז — לקרוא את `schemaVersion`, ואם אינו 1 — להציג שגיאה ידידותית.

### 24.7 z-index של שכבות בתא

סדר z-index קבוע בתוך `.calendar-cell`:

| שכבה | z-index |
|------|---------|
| `cell-base` | 0 |
| `cell-markers` | 1 |
| `cell-count-overlay` | 2 |
| `cell-focus-ring` | 3 |
| `cell-add-event-btn` | 4 |
| `cell-popover-anchor` | 5 |

הפופ-אפ עצמו (לא העוגן) מרונדר מחוץ לתא ומשתמש ב-z-index גבוה יותר ברמת המסמך (`1000+`).

### 24.8 מבני נתונים נוספים

מעבר ל-`UserEvent` ו-`ComputedEvent`, המערכת זקוקה לטיפוסים הבאים. כולם מוגדרים מבחינה חישובית בלבד — ללא הכרעה הלכתית, רק כמיכלים לערכים שהמנוע צריך כדי לחשב, להציג ולנמק.

#### 24.8.1 `HebrewDate` ו-`HebrewDateRange`

```ts
interface HebrewDate {
  day: number;          // 1..30
  month: number;        // 1..13
  year: number;
  monthName: string;
  isLeapYear: boolean;
}

interface HebrewDateRange {
  start: HebrewDate;
  startOnah: 'day' | 'night';
  end: HebrewDate;
  endOnah: 'day' | 'night';
  totalOnahs: number;        // סה"כ עונות בטווח (כולל)
  totalDays: number;         // סה"כ ימים בטווח
}
```

#### 24.8.2 `OnahWindow` — חלון פרישה

מייצג חלון זמן מסומן בלוח (יום פרישה אחד או רצף עונות):

```ts
interface OnahWindow {
  id: string;
  computedEventId: string;             // הצעה שיצרה את החלון
  startHebrewDate: HebrewDate;
  startOnah: 'day' | 'night';
  durationOnahs: number;               // 1 = עונה אחת, 2 = יממה שלמה, וכו'
  endHebrewDate: HebrewDate;
  endOnah: 'day' | 'night';
  reasonCode: string;
  isExpired: boolean;
}
```

#### 24.8.3 `CleanStreak` — רצף עונות נקיות

נדרש לחישוב התבססות/פקיעה של דפוס:

```ts
interface CleanStreak {
  id: string;
  ruleId: string;                      // לאיזה כלל הרצף הזה רלוונטי
  startedAfterEventId: string;         // אירוע משתמש שאחריו התחיל הרצף
  cleanOnahsCount: number;
  cleanEventsCount: number;            // כמה "מחזורים" עברו ללא התאמה לכלל
  lastCheckedAt: string;
  brokenByEventId?: string;            // אם הרצף נשבר
}
```

#### 24.8.4 `PatternMatch` — תיעוד התאמה של אירוע לכלל

המנוע יוצר רשומה כזו לכל אירוע משתמש שמתאים לכלל קיים. נדרש לזיהוי "וסת קבוע" (3 התאמות רצופות) ולהצגת היסטוריה:

```ts
interface PatternMatch {
  id: string;
  ruleId: string;
  userEventId: string;
  matchedAt: string;
  matchIndex: number;                  // המופע ה-N של הכלל
  predictedComputedEventId?: string;   // ההצעה שתאמה למציאות
  deltaOnahs: number;                  // 0 אם תאם בדיוק, אחרת הסטייה
  isExactMatch: boolean;
}
```

#### 24.8.5 `RulePatternState` — מצב כלל ביחס לאירועי המשתמש

לכל כלל פעיל המנוע מחזיק רשומת מצב מצטברת:

```ts
interface RulePatternState {
  ruleId: string;
  status: 'inactive' | 'observing' | 'established' | 'breaking' | 'broken';
  consecutiveMatches: number;
  consecutiveMisses: number;
  matchEventIds: string[];
  missEventIds: string[];
  establishedAt?: string;
  brokenAt?: string;
  lastEvaluatedAt: string;
  thresholds: {
    matchesToEstablish: number;        // נטען מה-JSON של הכלל
    missesToBreak: number;
  };
}
```

#### 24.8.6 `CalculationProposal` (עדכון)

```ts
interface CalculationProposal {
  id: string;
  ruleId: string;
  category: ComputedEvent['category'];
  patternKind?: 'non_fixed' | 'fixed';
  targetHebrewDates: HebrewDate[];     // יכול להיות ריק עד למספר יעדים
  targetOnah?: 'day' | 'night';
  targetWindows: OnahWindow[];         // החלונות שייווצרו אם המשתמש יאשר
  needsConfirmation: boolean;
  displayMode: 'anchored_popover' | 'counting_animation' | 'silent';
  copyKey: string;
  reasonCode: string;
  sourceUserEventIds: string[];
  relatedComputedEventIds?: string[];
  supersedesEventIds?: string[];       // אילו ComputedEvents יבוטלו אם יאושר
  metadata: Record<string, string | number | boolean>;
  computedFromIntervalDays?: number;
  computedFromMonthOffset?: number;
  warnings?: string[];                 // חריגות חישוביות (למשל "ל' לא קיים בחודש היעד")
}
```

#### 24.8.7 `EngineRunResult` — פלט הרצת מנוע

```ts
interface EngineRunResult {
  runId: string;
  triggeredByEventId: string;
  ranAt: string;
  proposals: CalculationProposal[];
  supersededComputedEventIds: string[];
  expiredComputedEventIds: string[];
  patternStateChanges: Array<{
    ruleId: string;
    from: RulePatternState['status'];
    to: RulePatternState['status'];
  }>;
  warnings: string[];
  errors: string[];
}
```

#### 24.8.8 `TrackingState` (עדכון)

```ts
interface TrackingState {
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
```

#### 24.8.9 `RuleSchedule` ו-`RuleScope` בתוך כלל

הרחבה לסכמת `halachic-rules.json` שתומכת בכל סוגי הכללים שהוזכרו (כולל וסת קבוע ופקיעה):

```ts
interface HalachicRule {
  id: string;
  name: string;
  category: ComputedEvent['category'];
  kind: 'absolute_date' | 'weekday' | 'interval_from_event';
  enabled: boolean;
  stage: 'phase_1' | 'phase_2' | 'phase_3';
  trigger: RuleTrigger;
  operation: RuleOperation;
  scope: {
    appliesToPatternKind: 'non_fixed' | 'fixed' | 'both';
    matchesToEstablish: number;            // ברירת מחדל 3
    missesToBreak: number;                 // ברירת מחדל 3
    requiresEventOutsideWindow: boolean;   // לפקיעה
  };
  produces: {
    onahsToMark: number;                   // כמה עונות בכל הצעה
    targetOnah: 'same_as_source' | 'day' | 'night' | 'both';
  };
  removalConditions: RuleRemovalCondition[];
  priority: number;
  requiresUserConfirmation: boolean;
  createsComputedEvent: boolean;
  reasonCode: string;
  copyKey: string;
}
```

### 24.9 רשימת טיפוסים ב-`tracking-types.ts`

הקובץ חייב לייצא לפחות:

- `HebrewDate`, `HebrewDateRange`
- `UserEvent`
- `ComputedEvent`
- `OnahWindow`
- `CleanStreak`
- `PatternMatch`
- `RulePatternState`
- `CalendarMarker`
- `CalculationSession`
- `CalculationProposal`
- `EngineRunResult`
- `DayTrackingState`
- `TrackingState`
- `HalachicRule` (סכמת JSON ב-TS)
- `RuleTrigger`, `RuleOperation`, `RuleRemovalCondition`, `RuleKind` (טיפוסי עזר)
- פונקציות עזר: `hebrewDateKey(d: HebrewDate): string`, `addOnahs(d: HebrewDate, onah: 'day'|'night', n: number): {date: HebrewDate, onah: 'day'|'night'}`

## 25. סיכום

הארכיטקטורה הנכונה לפיצ'ר הזה היא:

- לוח קיים נשאר בסיס התצוגה
- שכבת tracking נבנית מעליו
- המשתמש מזין רק אירועי מקור
- התוכנה מציעה רק אירועים מחושבים
- כל כלל נקרא מ-JSON
- כל חישוב מוצג כתהליך מאושר, לא כהחלטה סמויה

אם נשמור על המבנה הזה, יהיה אפשר להרחיב אחר כך את ההלכות בלי לשבור את ה-UI ובלי להכניס כאוס ל-`main.ts`.

---

> **כלל תיעוד:** כל דרישה או הבהרה חדשה מהמשתמש נכנסת תחילה למסמך זה, ורק אחר כך/בנוסף ממומשת בקוד. מסמך התכנון הוא מקור-האמת לדרישות.

## 26. שלוש דרגות הכרעה הלכתית

הלוח **אינו מחליף** את המשתמש — הוא פועל לצידו. כל הלכה משתייכת לאחת משלוש דרגות הכרעה (`DecisionTier` ב-`tracking-types.ts`). ההבחנה מבנית: היא קובעת מי מכריע ומתי, לא מה ההלכה (ההלכה חיה ב-`הלכות.md` וב-JSON).

| דרגה | מי מכריע | התנהגות |
|---|---|---|
| `auto` | אף אחד — דטרמיניסטי | מחושב מראש ומסומן בלוח |
| `setting_dependent` | המשתמש, **מראש** (טוגל בהגדרות) | המנוע קורא את ההגדרה ומחשב בלי לשאול בכל מופע. דוגמאות: יום 31, אור זרוע, דין ט"ז, ימי מבוכה 3/7 |
| `requires_user_decision` | המשתמש, **פרטנית לכל מופע** | "מצב קפוא": המנוע מתריע, האירוע נשאר `frozen`. דוגמאות: ראיה כפולה, וסת מספק, "סמוך" לימי מבוכה, ספק ר"ח/א' |

**עיקרון:** הכרעה בדרגה 3 לעולם אינה קובעת הלכה בקוד — היא רק **בוחרת כלל קיים** שיחול (`appliesRuleIds`) או מזינה ערך (`setsValues`). כל "לבדוק"/"שאלה פתוחה" במסמכי ההלכה הוא דרגה 2 או 3 — לעולם לא `if` הלכתי ב-TypeScript.

### 26.1 מצב קפוא (`PendingDecision`) וסמנטיקת חסימה

- כל עוד ההכרעה `open` — מסומנת ב**אזור התראות** בלבד; אינה מפריעה לעבודה.
- **צפייה ועריכה תמיד פתוחות**, גם כשההכרעה פתוחה וגם כשהגיע מועדה. הסיבה: המשתמש עשוי לתקן תאריך שהזין בטעות — ותיקון זה עלול לבטל את השאלה כולה.
- כשמגיע מועד אירוע תלוי (`blocksNewEntryFromGregKey`/`Onah`) וההכרעה עדיין פתוחה — נחסמת **רק הזנת אירועי משתמש חדשים**, עד הכרעה או עד שתיקון נתונים ייתר אותה. אין חסימת צפייה/עריכה.

טיפוסים רלוונטיים: `DecisionTier`, `PendingDecision`, `DecisionOption`, סטטוס `frozen` ב-`ComputedEvent`, ושדות `resolutionTier`/`settingKey`/`decisionKey` ב-`HalachicRule`.

### 26.2 רשימה רצה של הכרעות פתוחות (לא מרשם מראש)

**אין** לבנות "מרשם ספיקות" מלא מראש. במקום זה: בכל פעם שמימוש קטע הלכה נתקל בשאלה לא-מוכרעת או בנקודה שדורשת הכרעת משתמש — מוסיפים שורה ל-`docs/open-decisions.md` (הרשימה הרצה), ומפנים אליה בקוד דרך `decisionKey` + הערה. כך הרשימה גדלה אורגנית עם המימוש, ולא מנפחים אותה בספקות תיאורטיים.

## 27. גנרטורים מחזוריים (`tracking-recurrence.ts`)

המחזוריות ההלכתית מתמפה למספר מצומצם של גנרטורים מתמטיים טהורים (PURE — ללא DOM/state/"עכשיו"). מקור: `יסוד הטהרה משוכתב.md` פרקים י-יא.

| גנרטור | תבנית הלכתית |
|---|---|
| `monthlyRecurrence` | וסת החודש (interval=1), וסת סירוג (interval=X) |
| `intervalRecurrence` / `weeklyRecurrence` | וסת הפלגה (מרווח יחיד), וסת שבוע (N·7+1 inclusive) |
| `classifyHaflagot` + `activeHaflagaPrishot` | ריבוי הפלגות פעילות — פרק י' ז-ט (קריטי) |
| `arithmeticIntervalSeries` | דילוג הפלגה |
| `arithmeticMonthDaySeries` | דילוג יום בחודש (גלישה → `needsDecision`) |

**הערות מימוש:** ספירה תמיד inclusive (מרווח N = פער N-1). מצבי-גבול (חודש חסר, גלישת דילוג) מסומנים `needsDecision`/`warning` ולא מוכרעים במודול. המודול **אינו מחובר עדיין** למנוע החי — חיבורו צעד נפרד אחרי בדיקות. שים לב: האופרטור `fixed_interval` הקיים מחשב רק את המרווח האחרון, בניגוד לפרק י' ז-ט — תיקון זה ייעשה בחיבור.

## 28. זרימת התייעצות מונפשת (לפני כל קביעת-פרישה)

הלוח "מתייעץ" עם המשתמש לפני כל קביעת זמן פרישה — אף קביעה אינה סמויה. כל שלב מאושר ע"י המשתמש לפני המעבר לבא.

### 28.1 תצוגת שני חודשים
כשהמשתמש מוסיף אירוע ווסת, הלוח מציג שני חודשים זה לצד זה: **החודש הנוכחי הוא העוגן היציב**, והחודש המשני (תחילה הקודם, אחר כך הבא) **מתחלף בהנפשת החלקה** (slide-in/out).

**סדר RTL (קבוע):** החודש המוקדם כרונולוגית בימין, המאוחר בשמאל. בשלב ההפרש: [קודם=ימין][נוכחי=שמאל]; בשלב היעד: [נוכחי=ימין][הבא=שמאל]. בזרימת RTL, סדר ה-DOM הכרונולוגי (מוקדם→מאוחר) ממקם את המוקדם בימין אוטומטית. הסיבה לבחירה בשני כרטיסים נפרדים (ולא הוספת שורות לרשת אחת): הזרימה דורשת שהחודש המשני יתחלף שוב ושוב סביב עוגן קבוע — קל ונקי יותר עם כרטיסים בדידים, וגם נופל יפה ל-stack אנכי במסך צר.

### 28.2 רצף ההתייעצות (דוגמת הפלגה)
1. מוצגים [חודש קודם][חודש נוכחי] עם הנפשת כניסה.
2. **אנימציית ספירה** מהירה-אך-עקיבה: כל יום מקבל מספר רץ, מהראיה הקודמת עד הראיה הנוכחית.
3. הודעה: **"נמצא שההפרש בין תאריכי הראיה הוא xx — האם אתה מאשר?"**
4. באישור: החודש הקודם נעלם (הנפשה הפוכה), והחודש הבא נכנס → [חודש נוכחי][חודש הבא].
5. ספירה חדשה: מהראיה הנוכחית עד היום המיועד.
6. הודעה: **"בהתבסס על אישורך שההפרש הוא xx, יום ההפלגה הוא xx — האם אתה מאשר?"**

אותו דפוס לכל סוגי הפרישה (עונה בינונית וכו').

### 28.3 חריג: וסת החודש — ללא ספירה
ביום החודש אין משמעות לספירת ימים. מציגים את שני החודשים זה לצד זה ו**מסמנים את היום המיועד בצבע** (אותו יום-בחודש), ללא אנימציית ספירה — ואז הודעת אישור.

### 28.4 קצב ההנפשה
הספירה מהירה אך עקיבה — המשתמש חייב להצליח לעקוב אחר המספור יום-אחר-יום. ההנפשה ההפוכה (היעלמות החודש המשני) זהה להנפשת הכניסה, בכיוון הפוך.
