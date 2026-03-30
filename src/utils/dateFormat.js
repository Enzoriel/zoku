export const formatRelativeDate = (date) => {
  const now = new Date();
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  
  // Resetear horas para comparar días exactos
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  
  const diff = today - targetDate;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "HOY";
  if (days === 1) return "AYER";
  if (days < 7 && days > 1) return `HACE ${days} DÍAS`;
  
  const isDifferentYear = today.getFullYear() !== targetDate.getFullYear();
  const options = { day: "numeric", month: "long" };
  if (isDifferentYear) options.year = "numeric";
  
  return d.toLocaleDateString("es", options).toUpperCase();
};
