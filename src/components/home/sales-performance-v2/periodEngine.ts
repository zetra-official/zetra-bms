export type SalesPerformanceMode =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY";

export type SalesPerformanceRange = {
  from: Date;
  to: Date;
};

export type SalesPerformanceBucket = {
  key: string;
  label: string;
  shortLabel: string;
  from: Date;
  to: Date;
};

export type SalesPerformancePeriods = {
  mode: SalesPerformanceMode;
  current: SalesPerformanceRange;
  previous: SalesPerformanceRange;
  currentBuckets: SalesPerformanceBucket[];
  previousBuckets: SalesPerformanceBucket[];
};

function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(value: Date, amount: number): Date {
  const d = new Date(value);
  d.setDate(d.getDate() + amount);
  return d;
}

function addHours(value: Date, amount: number): Date {
  const d = new Date(value);
  d.setHours(d.getHours() + amount);
  return d;
}

function startOfWeekMonday(value: Date): Date {
  const d = startOfDay(value);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

function startOfMonth(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    1,
    0,
    0,
    0,
    0
  );
}

function startOfNextMonth(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    1,
    0,
    0,
    0,
    0
  );
}

function formatDay(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function buildDailyBuckets(
  range: SalesPerformanceRange
): SalesPerformanceBucket[] {
  const labels = [
    "12 AM",
    "4 AM",
    "8 AM",
    "12 PM",
    "4 PM",
    "8 PM",
  ];

  return labels.map((label, index) => {
    const from = addHours(range.from, index * 4);
    const to = addHours(from, 4);

    return {
      key: `hour-${index}`,
      label,
      shortLabel: label,
      from,
      to,
    };
  });
}

function buildWeeklyBuckets(
  range: SalesPerformanceRange
): SalesPerformanceBucket[] {
  const labels = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ];

  return labels.map((label, index) => {
    const from = addDays(range.from, index);
    const to = addDays(from, 1);

    return {
      key: `day-${index}`,
      label,
      shortLabel: label,
      from,
      to,
    };
  });
}

function buildMonthlyBuckets(
  range: SalesPerformanceRange
): SalesPerformanceBucket[] {
  const buckets: SalesPerformanceBucket[] = [];

  let cursor = new Date(range.from);
  let index = 0;

  while (cursor < range.to) {
    const from = new Date(cursor);

    const candidateTo = addDays(from, 7);

    const to =
      candidateTo > range.to
        ? new Date(range.to)
        : candidateTo;

    buckets.push({
      key: `week-${index}`,
      label: `${formatDay(from)} - ${formatDay(
        addDays(to, -1)
      )}`,
      shortLabel: `W${index + 1}`,
      from,
      to,
    });

    cursor = to;
    index += 1;
  }

  return buckets;
}

function buildBuckets(
  mode: SalesPerformanceMode,
  range: SalesPerformanceRange
): SalesPerformanceBucket[] {
  if (mode === "DAILY") {
    return buildDailyBuckets(range);
  }

  if (mode === "WEEKLY") {
    return buildWeeklyBuckets(range);
  }

  return buildMonthlyBuckets(range);
}

export function resolveSalesPerformancePeriods(
  mode: SalesPerformanceMode,
  anchor: Date = new Date()
): SalesPerformancePeriods {
  let current: SalesPerformanceRange;
  let previous: SalesPerformanceRange;

  if (mode === "DAILY") {
    const from = startOfDay(anchor);
    const to = addDays(from, 1);

    current = { from, to };

    previous = {
      from: addDays(from, -1),
      to: from,
    };
  } else if (mode === "WEEKLY") {
    const from = startOfWeekMonday(anchor);
    const to = addDays(from, 7);

    current = { from, to };

    previous = {
      from: addDays(from, -7),
      to: from,
    };
  } else {
    const from = startOfMonth(anchor);
    const to = startOfNextMonth(anchor);

    const previousFrom = new Date(
      from.getFullYear(),
      from.getMonth() - 1,
      1,
      0,
      0,
      0,
      0
    );

    previous = {
      from: previousFrom,
      to: from,
    };

    current = { from, to };
  }

  return {
    mode,
    current,
    previous,
    currentBuckets: buildBuckets(mode, current),
    previousBuckets: buildBuckets(mode, previous),
  };
}

export function salesPerformanceToISO(
  value: Date
): string {
  return value.toISOString();
}

export function formatSalesPerformanceRange(
  range: SalesPerformanceRange
): string {
  const from = range.from.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const visibleTo = addDays(range.to, -1);

  const to = visibleTo.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${from} - ${to}`;
}
