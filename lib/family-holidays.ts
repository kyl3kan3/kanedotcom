export const FAMILY_TIME_ZONE = "America/Chicago";

export type FamilyMemoryFact = {
  kind: "image" | "video";
  capturedAt: Date | string | null | undefined;
};

export type FamilyHoliday = {
  id: string;
  name: string;
  holidayName: string;
  chapterTitle: string;
  dateKey: string;
  matchKind: "exact" | "weekend";
  matchedCaptureDateKeys: string[];
};

export type FamilyChapterPresentation = {
  title: string;
  summary: string;
  holidays: FamilyHoliday[];
  startAt: Date | null;
  endAt: Date | null;
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
  dateKey: string;
};

type HolidayDefinition = {
  id: string;
  name: string;
  chapterTitle: string;
  month: number;
  day: number;
  weekendName?: string;
  weekendChapterTitle?: string;
  weekendOffsets?: number[];
};

const chicagoDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: FAMILY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthName = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
});

function validDate(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date &&
    !Number.isNaN(date.getTime()) &&
    Math.abs(date.getTime()) > 24 * 60 * 60 * 1000
    ? date
    : null;
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calendarDate(value: Date | string | null | undefined): CalendarDate | null {
  const date = validDate(value);
  if (!date) return null;

  const parts = Object.fromEntries(
    chicagoDateParts
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  if (!parts.year || !parts.month || !parts.day) return null;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    dateKey: dateKey(parts.year, parts.month, parts.day),
  };
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const finalDay = new Date(Date.UTC(year, month, 0));
  return finalDay.getUTCDate() - ((finalDay.getUTCDay() - weekday + 7) % 7);
}

// Gregorian computus. This is calendar math only; image contents never influence it.
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function fourthOfJulyWeekendOffsets(year: number) {
  const weekday = new Date(Date.UTC(year, 6, 4)).getUTCDay();
  if (weekday === 5) return [0, 1, 2];
  if (weekday === 6 || weekday === 0) return [-1, 0, 1];
  if (weekday === 1) return [-2, -1, 0];
  return [0];
}

function holidayDefinitions(year: number): HolidayDefinition[] {
  const easter = easterSunday(year);
  return [
    {
      id: "new-years-day",
      name: "New Year's Day",
      chapterTitle: "New Year's Day Memories",
      month: 1,
      day: 1,
    },
    {
      id: "valentines-day",
      name: "Valentine's Day",
      chapterTitle: "Valentine's Day Memories",
      month: 2,
      day: 14,
    },
    {
      id: "easter",
      name: "Easter",
      chapterTitle: "Easter Memories",
      ...easter,
    },
    {
      id: "mothers-day",
      name: "Mother's Day",
      chapterTitle: "Mother's Day Memories",
      month: 5,
      day: nthWeekdayOfMonth(year, 5, 0, 2),
    },
    {
      id: "memorial-day",
      name: "Memorial Day",
      chapterTitle: "Memorial Day Memories",
      month: 5,
      day: lastWeekdayOfMonth(year, 5, 1),
    },
    {
      id: "fathers-day",
      name: "Father's Day",
      chapterTitle: "Father's Day Memories",
      month: 6,
      day: nthWeekdayOfMonth(year, 6, 0, 3),
      weekendName: "Father's Day Weekend",
      weekendChapterTitle: "Father's Day Weekend",
      weekendOffsets: [-1, 0],
    },
    {
      id: "fourth-of-july",
      name: "Fourth of July",
      chapterTitle: "Fourth of July Memories",
      month: 7,
      day: 4,
      weekendName: "Fourth of July Weekend",
      weekendChapterTitle: "Fourth of July Weekend",
      weekendOffsets: fourthOfJulyWeekendOffsets(year),
    },
    {
      id: "labor-day",
      name: "Labor Day",
      chapterTitle: "Labor Day Memories",
      month: 9,
      day: nthWeekdayOfMonth(year, 9, 1, 1),
    },
    {
      id: "halloween",
      name: "Halloween",
      chapterTitle: "Halloween Memories",
      month: 10,
      day: 31,
    },
    {
      id: "thanksgiving",
      name: "Thanksgiving",
      chapterTitle: "Thanksgiving Memories",
      month: 11,
      day: nthWeekdayOfMonth(year, 11, 4, 4),
    },
    {
      id: "christmas-eve",
      name: "Christmas Eve",
      chapterTitle: "Christmas Eve Memories",
      month: 12,
      day: 24,
    },
    {
      id: "christmas-day",
      name: "Christmas Day",
      chapterTitle: "Christmas Memories",
      month: 12,
      day: 25,
    },
    {
      id: "new-years-eve",
      name: "New Year's Eve",
      chapterTitle: "New Year's Eve Memories",
      month: 12,
      day: 31,
    },
  ];
}

function offsetDateKey(year: number, month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatDateKeyForDisplay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const monthLabel = monthName.format(new Date(Date.UTC(2000, month - 1, 1)));
  return `${monthLabel} ${day}, ${year}`;
}

function formatDateKeyRangeForDisplay(values: string[]) {
  const sorted = [...values].sort();
  if (sorted.length <= 1) return formatDateKeyForDisplay(sorted[0]);

  const [firstYear, firstMonth, firstDay] = sorted[0].split("-").map(Number);
  const [lastYear, lastMonth, lastDay] = sorted.at(-1)!.split("-").map(Number);
  const firstMonthLabel = monthName.format(
    new Date(Date.UTC(2000, firstMonth - 1, 1)),
  );
  const lastMonthLabel = monthName.format(
    new Date(Date.UTC(2000, lastMonth - 1, 1)),
  );
  if (firstYear === lastYear && firstMonth === lastMonth) {
    return `${firstMonthLabel} ${firstDay}–${lastDay}, ${firstYear}`;
  }
  if (firstYear === lastYear) {
    return `${firstMonthLabel} ${firstDay}–${lastMonthLabel} ${lastDay}, ${firstYear}`;
  }
  return `${firstMonthLabel} ${firstDay}, ${firstYear}–${lastMonthLabel} ${lastDay}, ${lastYear}`;
}

export function familyHolidaysForCaptureDates(
  values: readonly (Date | string | null | undefined)[],
) {
  const calendarDates = [
    ...new Map(
      values
        .map(calendarDate)
        .filter((date): date is CalendarDate => Boolean(date))
        .map((date) => [date.dateKey, date]),
    ).values(),
  ];
  const captureDateKeys = new Set(calendarDates.map((date) => date.dateKey));
  const years = [...new Set(calendarDates.map((date) => date.year))];

  return years
    .flatMap((year) =>
      holidayDefinitions(year).flatMap((holiday) => {
        const holidayDateKey = dateKey(year, holiday.month, holiday.day);
        const candidateOffsets = holiday.weekendOffsets ?? [0];
        const matchedCaptureDateKeys = candidateOffsets
          .map((offset) =>
            offsetDateKey(year, holiday.month, holiday.day, offset),
          )
          .filter((key) => captureDateKeys.has(key))
          .sort();
        if (matchedCaptureDateKeys.length === 0) return [];

        const weekendMatch =
          Boolean(holiday.weekendName) &&
          matchedCaptureDateKeys.some((key) => key !== holidayDateKey);
        return [
          {
            id: holiday.id,
            name: weekendMatch ? holiday.weekendName! : holiday.name,
            holidayName: holiday.name,
            chapterTitle: weekendMatch
              ? holiday.weekendChapterTitle!
              : holiday.chapterTitle,
            dateKey: holidayDateKey,
            matchKind: weekendMatch ? ("weekend" as const) : ("exact" as const),
            matchedCaptureDateKeys,
          },
        ];
      }),
    )
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

export function familyHolidayForCaptureDate(
  value: Date | string | null | undefined,
) {
  return familyHolidaysForCaptureDates([value])[0] ?? null;
}

export function formatFamilyCaptureDateRange(
  values: readonly (Date | string | null | undefined)[],
) {
  const dates = [
    ...new Map(
      values
        .map(calendarDate)
        .filter((date): date is CalendarDate => Boolean(date))
        .map((date) => [date.dateKey, date]),
    ).values(),
  ].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  if (dates.length === 0) return null;

  const first = dates[0];
  const last = dates.at(-1)!;
  const firstMonth = monthName.format(new Date(Date.UTC(2000, first.month - 1, 1)));
  const lastMonth = monthName.format(new Date(Date.UTC(2000, last.month - 1, 1)));

  if (first.dateKey === last.dateKey) {
    return `${firstMonth} ${first.day}, ${first.year}`;
  }
  if (first.year === last.year && first.month === last.month) {
    return `${firstMonth} ${first.day}–${last.day}, ${first.year}`;
  }
  if (first.year === last.year) {
    return `${firstMonth} ${first.day}–${lastMonth} ${last.day}, ${first.year}`;
  }
  return `${firstMonth} ${first.day}, ${first.year}–${lastMonth} ${last.day}, ${last.year}`;
}

function joinedList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function mediaCountPhrase(memories: readonly FamilyMemoryFact[]) {
  const photos = memories.filter((memory) => memory.kind === "image").length;
  const videos = memories.length - photos;
  const counts = [
    photos > 0 ? `${photos} ${photos === 1 ? "photo" : "photos"}` : null,
    videos > 0 ? `${videos} ${videos === 1 ? "video" : "videos"}` : null,
  ].filter((value): value is string => Boolean(value));
  return joinedList(counts);
}

export function buildFactualFamilyChapter(
  memories: readonly FamilyMemoryFact[],
): FamilyChapterPresentation {
  const captureDates = memories.map((memory) => memory.capturedAt);
  const validCaptureDates = captureDates
    .map(validDate)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime());
  const holidays = familyHolidaysForCaptureDates(validCaptureDates);
  const range = formatFamilyCaptureDateRange(validCaptureDates);
  const localDates = validCaptureDates
    .map(calendarDate)
    .filter((date): date is CalendarDate => Boolean(date))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const firstLocalDate = localDates[0];
  const lastLocalDate = localDates.at(-1);
  const localDateSpanDays =
    firstLocalDate && lastLocalDate
      ? Math.round(
          (Date.UTC(lastLocalDate.year, lastLocalDate.month - 1, lastLocalDate.day) -
            Date.UTC(
              firstLocalDate.year,
              firstLocalDate.month - 1,
              firstLocalDate.day,
            )) /
            (24 * 60 * 60 * 1000),
        )
      : 0;
  const total = memories.length;
  const title =
    holidays.length > 0 && localDateSpanDays <= 4
      ? holidays[0].chapterTitle
      : range
        ? `${range} Memories`
        : "Family Memories";
  const summaryParts = [
    range
      ? `${total} family ${total === 1 ? "memory" : "memories"} captured ${range}: ${mediaCountPhrase(memories)}.`
      : `${total} family ${total === 1 ? "memory" : "memories"}: ${mediaCountPhrase(memories)}. Capture dates are not available for this chapter.`,
  ];

  const exactHolidays = holidays.filter((holiday) => holiday.matchKind === "exact");
  if (exactHolidays.length > 0) {
    summaryParts.push(
      `The capture dates include ${joinedList(exactHolidays.map((holiday) => holiday.name))}.`,
    );
  }
  for (const holiday of holidays.filter(
    (candidate) => candidate.matchKind === "weekend",
  )) {
    summaryParts.push(
      `Media captured on ${formatDateKeyRangeForDisplay(holiday.matchedCaptureDateKeys)} falls during ${holiday.name}; ${holiday.holidayName} was ${formatDateKeyForDisplay(holiday.dateKey)}.`,
    );
  }

  return {
    title,
    summary: summaryParts.join(" "),
    holidays,
    startAt: validCaptureDates[0] ?? null,
    endAt: validCaptureDates.at(-1) ?? null,
  };
}

// Use this for approved trips too, so older AI prose is replaced at render time
// by the same date/count/holiday facts used for new drafts.
export function normalizeFamilyTripPresentation(
  memories: readonly FamilyMemoryFact[],
) {
  return buildFactualFamilyChapter(memories);
}
