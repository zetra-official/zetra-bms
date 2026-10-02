export type FinancialPeriodMode =
  | "THIS_MONTH"
  | "THREE_MONTHS"
  | "SIX_MONTHS"
  | "THIS_YEAR"
  | "CUSTOM";

export type FinancialDateRange = {
  fromYMD: string;
  toYMD: string;
};

export type FinancialPeriodBucket =
  FinancialDateRange & {
    key: string;
    label: string;
    shortLabel: string;
  };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toYMD(date: Date) {
  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1
  )}-${pad(date.getDate())}`;
}

export function parseYMD(
  value: string
): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  const [year, month, day] =
    value.split("-").map(Number);

  const date =
    new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfMonth(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}

function endOfMonth(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  );
}

function addMonths(
  date: Date,
  months: number
) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1
  );
}

function monthLabel(
  date: Date,
  short = false
) {
  return date.toLocaleDateString(
    "en-US",
    {
      month: short
        ? "short"
        : "long",
      year: "numeric",
    }
  );
}

export function resolveFinancialRange(
  mode: FinancialPeriodMode,
  anchorYMD: string,
  customRange?: FinancialDateRange
): FinancialDateRange {
  const anchor =
    parseYMD(anchorYMD);

  if (!anchor) {
    throw new Error(
      "Invalid financial anchor date."
    );
  }

  if (mode === "CUSTOM") {
    const from =
      parseYMD(
        customRange?.fromYMD ?? ""
      );

    const to =
      parseYMD(
        customRange?.toYMD ?? ""
      );

    if (!from || !to) {
      throw new Error(
        "Invalid custom financial range."
      );
    }

    if (
      from.getTime() >
      to.getTime()
    ) {
      throw new Error(
        "Custom range start date cannot be after end date."
      );
    }

    return {
      fromYMD: toYMD(from),
      toYMD: toYMD(to),
    };
  }

  if (mode === "THIS_YEAR") {
    return {
      fromYMD: toYMD(
        new Date(
          anchor.getFullYear(),
          0,
          1
        )
      ),
      toYMD: toYMD(
        new Date(
          anchor.getFullYear(),
          11,
          31
        )
      ),
    };
  }

  const months =
    mode === "THREE_MONTHS"
      ? 3
      : mode === "SIX_MONTHS"
        ? 6
        : 1;

  const finalMonth =
    startOfMonth(anchor);

  const firstMonth =
    addMonths(
      finalMonth,
      -(months - 1)
    );

  return {
    fromYMD: toYMD(firstMonth),
    toYMD: toYMD(
      endOfMonth(finalMonth)
    ),
  };
}

function addDaysYMD(
  ymd: string,
  days: number
) {
  const date = parseYMD(ymd);

  date.setDate(
    date.getDate() + days
  );

  return toYMD(date);
}

function dayOfMonthLabel(
  ymd: string
) {
  const date = parseYMD(ymd);

  return `${date.getDate()} ${date.toLocaleString(
    "en-US",
    {
      month: "short",
    }
  )}`;
}

export function buildFinancialTrendBuckets(
  mode: FinancialPeriodMode,
  range: FinancialDateRange
): FinancialPeriodBucket[] {
  /*
   * This Month needs multiple points so the chart can show
   * movement inside the month instead of one monthly point.
   *
   * Longer periods continue to use exact calendar-month
   * buckets from buildFinancialBuckets().
   */
  if (mode !== "THIS_MONTH") {
    return buildFinancialBuckets(
      range
    );
  }

  const result: FinancialPeriodBucket[] = [];

  let cursor =
    range.fromYMD;

  let index = 0;

  while (
    cursor <= range.toYMD
  ) {
    const proposedEnd =
      addDaysYMD(
        cursor,
        6
      );

    const bucketEnd =
      proposedEnd >
      range.toYMD
        ? range.toYMD
        : proposedEnd;

    result.push({
      key: `week-${index}-${cursor}`,
      fromYMD: cursor,
      toYMD: bucketEnd,
      label: `${dayOfMonthLabel(
        cursor
      )} - ${dayOfMonthLabel(
        bucketEnd
      )}`,
      shortLabel:
        dayOfMonthLabel(
          bucketEnd
        ),
    });

    cursor =
      addDaysYMD(
        bucketEnd,
        1
      );

    index += 1;
  }

  return result;
}
export function buildFinancialBuckets(
  range: FinancialDateRange
): FinancialPeriodBucket[] {
  const from =
    parseYMD(range.fromYMD);

  const to =
    parseYMD(range.toYMD);

  if (!from || !to) {
    throw new Error(
      "Invalid financial date range."
    );
  }

  if (
    from.getTime() >
    to.getTime()
  ) {
    throw new Error(
      "Financial range start date cannot be after end date."
    );
  }

  const buckets:
    FinancialPeriodBucket[] = [];

  let cursor =
    startOfMonth(from);

  const finalMonth =
    startOfMonth(to);

  while (
    cursor.getTime() <=
    finalMonth.getTime()
  ) {
    const naturalStart =
      startOfMonth(cursor);

    const naturalEnd =
      endOfMonth(cursor);

    const bucketStart =
      naturalStart.getTime() <
      from.getTime()
        ? from
        : naturalStart;

    const bucketEnd =
      naturalEnd.getTime() >
      to.getTime()
        ? to
        : naturalEnd;

    buckets.push({
      key: `${cursor.getFullYear()}-${pad(
        cursor.getMonth() + 1
      )}`,
      label: monthLabel(
        cursor,
        false
      ),
      shortLabel: cursor
        .toLocaleDateString(
          "en-US",
          {
            month: "short",
          }
        )
        .toUpperCase(),
      fromYMD:
        toYMD(bucketStart),
      toYMD:
        toYMD(bucketEnd),
    });

    cursor =
      addMonths(cursor, 1);
  }

  return buckets;
}

export function formatFinancialRange(
  range: FinancialDateRange
) {
  const from =
    parseYMD(range.fromYMD);

  const to =
    parseYMD(range.toYMD);

  if (!from || !to) {
    return "";
  }

  const format = (date: Date) =>
    date.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );

  return `${format(from)} - ${format(to)}`;
}

/*
 * ============================================================
 * PREVIOUS PERIOD ENGINE
 * ============================================================
 *
 * Produces an exact previous calendar range with the SAME
 * number of calendar days as the selected current range.
 *
 * Example:
 * Current : 01 Apr 2026 - 30 Jun 2026
 * Previous: 01 Jan 2026 - 31 Mar 2026
 *
 * Custom ranges follow the same rule:
 * the previous range ends one day before the current range
 * and preserves the exact duration.
 *
 * No finance arithmetic happens here.
 * This file only resolves calendar boundaries.
 */

function financialDayDiffInclusive(
  fromYMD: string,
  toYMDValue: string
) {
  const from = parseYMD(fromYMD);
  const to = parseYMD(toYMDValue);

  if (!from || !to) {
    throw new Error(
      "Invalid financial comparison range."
    );
  }

  const fromUtc = Date.UTC(
    from.getFullYear(),
    from.getMonth(),
    from.getDate()
  );

  const toUtc = Date.UTC(
    to.getFullYear(),
    to.getMonth(),
    to.getDate()
  );

  return (
    Math.floor(
      (toUtc - fromUtc) /
        86400000
    ) + 1
  );
}

export function resolvePreviousFinancialRange(
  currentRange: FinancialDateRange
): FinancialDateRange {
  const from = parseYMD(
    currentRange.fromYMD
  );

  const to = parseYMD(
    currentRange.toYMD
  );

  if (!from || !to) {
    throw new Error(
      "Invalid current financial range."
    );
  }

  if (
    from.getTime() >
    to.getTime()
  ) {
    throw new Error(
      "Financial range start date cannot be after end date."
    );
  }

  const days =
    financialDayDiffInclusive(
      currentRange.fromYMD,
      currentRange.toYMD
    );

  const previousTo =
    addDaysYMD(
      currentRange.fromYMD,
      -1
    );

  const previousFrom =
    addDaysYMD(
      previousTo,
      -(days - 1)
    );

  return {
    fromYMD: previousFrom,
    toYMD: previousTo,
  };
}

export function buildPreviousFinancialBuckets(
  mode: FinancialPeriodMode,
  currentBuckets: FinancialPeriodBucket[],
  previousRange: FinancialDateRange
): FinancialPeriodBucket[] {
  /*
   * For THIS_MONTH we preserve the same weekly-style
   * chart structure used by the current period.
   */
  if (mode === "THIS_MONTH") {
    return buildFinancialTrendBuckets(
      "THIS_MONTH",
      previousRange
    );
  }

  /*
   * For longer periods we intentionally build exact
   * calendar buckets from the resolved previous range.
   */
  const previousBuckets =
    buildFinancialBuckets(
      previousRange
    );

  /*
   * Align chart labels with the CURRENT period so a
   * comparison line can sit directly behind the current
   * line without replacing the visible X-axis labels.
   *
   * Financial date boundaries remain previous-period dates.
   */
  return previousBuckets.map(
    (bucket, index) => {
      const current =
        currentBuckets[index];

      return {
        ...bucket,
        shortLabel:
          current?.shortLabel ??
          bucket.shortLabel,
      };
    }
  );
}

