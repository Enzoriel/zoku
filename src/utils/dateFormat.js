function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
    }

    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}

function shouldUseUtcCalendarDate(date) {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

  if (!isUtcMidnight) return false;

  return (
    date.getUTCFullYear() !== date.getFullYear() ||
    date.getUTCMonth() !== date.getMonth() ||
    date.getUTCDate() !== date.getDate()
  );
}

function toCalendarDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;

  if (shouldUseUtcCalendarDate(parsed)) {
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export const getLocalDayKey = (value) => {
  const date = toCalendarDate(value) || toCalendarDate(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatRelativeDate = (date) => {
  const today = toCalendarDate(new Date());
  const targetDate = toCalendarDate(date) || today;

  const diff = today - targetDate;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "HOY";
  if (days === 1) return "AYER";
  if (days < 7 && days > 1) return `HACE ${days} DIAS`;

  const isDifferentYear = today.getFullYear() !== targetDate.getFullYear();
  const options = { day: "numeric", month: "long" };
  if (isDifferentYear) options.year = "numeric";

  return targetDate.toLocaleDateString("es", options).toUpperCase();
};
