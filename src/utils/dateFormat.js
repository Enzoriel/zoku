export const getLocalDayKey = (value) => {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatRelativeDate = (date) => {
  const now = new Date();
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diff = today - targetDate;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "HOY";
  if (days === 1) return "AYER";
  if (days < 7 && days > 1) return `HACE ${days} DIAS`;

  const isDifferentYear = today.getFullYear() !== targetDate.getFullYear();
  const options = { day: "numeric", month: "long" };
  if (isDifferentYear) options.year = "numeric";

  return d.toLocaleDateString("es", options).toUpperCase();
};
