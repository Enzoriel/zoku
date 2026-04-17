export const GUIDED_PLAYER_OPTIONS = [
  { key: "mpv", label: "MPV" },
  { key: "vlc", label: "VLC" },
  { key: "mpc", label: "MPC" },
  { key: "potplayer", label: "PotPlayer" },
  { key: "other", label: "Otro" },
];

export const PLAYER_PROCESS_ALIASES = {
  mpv: ["mpv"],
  vlc: ["vlc"],
  mpc: ["mpc-hc64", "mpc-hc", "mpc-be64", "mpc-be"],
  potplayer: ["potplayermini64", "potplayermini", "potplayer"],
};

export function normalizePlayerProcessName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "");
}

export function normalizePlayerExecutablePath(path) {
  return String(path || "").trim().replace(/\//g, "\\");
}

export function normalizePlayerKey(key) {
  const normalized = String(key || "")
    .trim()
    .toLowerCase();

  if (normalized === "mpc-hc" || normalized === "mpc-be") return "mpc";
  if (GUIDED_PLAYER_OPTIONS.some((option) => option.key === normalized)) return normalized;
  return "other";
}

export function getPlayerLabel(key) {
  return GUIDED_PLAYER_OPTIONS.find((option) => option.key === normalizePlayerKey(key))?.label || "Otro";
}

export function getPlayerKeyFromProcessName(processName) {
  const normalized = normalizePlayerProcessName(processName);
  if (!normalized) return "other";

  if (normalized === "mpv") return "mpv";
  if (normalized === "vlc") return "vlc";
  if (PLAYER_PROCESS_ALIASES.mpc.includes(normalized)) return "mpc";
  if (PLAYER_PROCESS_ALIASES.potplayer.includes(normalized)) return "potplayer";
  return "other";
}

export function getLegacyPlayerKey(player) {
  const normalized = normalizePlayerProcessName(player);
  if (!normalized) return "other";
  return getPlayerKeyFromProcessName(normalized);
}

export function buildPlayerConfig({ key, executablePath, processName, displayName, source }) {
  const normalizedPath = normalizePlayerExecutablePath(executablePath);
  const normalizedProcessName = normalizePlayerProcessName(processName || normalizedPath.split(/[\\/]/).pop());
  const normalizedKey =
    normalizePlayerKey(key === "mpc" && getPlayerKeyFromProcessName(normalizedProcessName) === "other" ? "other" : key) ||
    getPlayerKeyFromProcessName(normalizedProcessName);

  return {
    key: normalizedKey,
    executablePath: normalizedPath,
    processName: normalizedProcessName,
    displayName: displayName?.trim() || getPlayerLabel(normalizedKey),
    source: source || "manual",
  };
}

export function isValidPlayerExecutablePath(executablePath) {
  return /\.exe$/i.test(String(executablePath || "").trim());
}

export function isValidPlayerConfig(playerConfig) {
  return Boolean(
    playerConfig &&
      isValidPlayerExecutablePath(playerConfig.executablePath) &&
      normalizePlayerProcessName(playerConfig.processName || playerConfig.executablePath.split(/[\\/]/).pop()),
  );
}

export function getConfiguredPlayerProcessNames(playerConfig) {
  if (!isValidPlayerConfig(playerConfig)) return [];

  const normalizedKey = normalizePlayerKey(playerConfig.key);
  const explicitProcessName = normalizePlayerProcessName(playerConfig.processName);

  if (normalizedKey === "other") {
    return explicitProcessName ? [explicitProcessName] : [];
  }

  if (normalizedKey === "mpc") {
    return [...PLAYER_PROCESS_ALIASES.mpc];
  }

  const aliases = PLAYER_PROCESS_ALIASES[normalizedKey] || [];
  if (aliases.length === 0) {
    return explicitProcessName ? [explicitProcessName] : [];
  }

  return Array.from(new Set([...aliases, explicitProcessName].filter(Boolean)));
}

export function getInitialPlayerSelection(settings) {
  if (isValidPlayerConfig(settings?.playerConfig)) {
    return normalizePlayerKey(settings.playerConfig.key || getPlayerKeyFromProcessName(settings.playerConfig.processName));
  }

  return getLegacyPlayerKey(settings?.player);
}
