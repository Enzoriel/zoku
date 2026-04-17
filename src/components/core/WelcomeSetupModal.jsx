import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { useStore } from "../../hooks/useStore";
import {
  detectDefaultVideoPlayer,
  detectKnownPlayer,
  selectFolder,
  selectPlayerExecutable,
} from "../../services/fileSystem";
import { getPreferredResolution, getFansubDetail } from "../../utils/torrentConfig";
import { SUPPORTED_RESOLUTIONS, PRESET_FANSUBS } from "../../utils/constants";
import {
  buildPlayerConfig,
  getInitialPlayerSelection,
  getPlayerLabel,
  GUIDED_PLAYER_OPTIONS,
  isValidPlayerConfig,
} from "../../utils/playerDetection";
import styles from "./WelcomeSetupModal.module.css";

export function WelcomeSetupModal() {
  const { data, loading, setFolderPath, setSettings } = useStore();
  const [folderPath, setLocalFolderPath] = useState("");
  const [playerKey, setPlayerKey] = useState("other");
  const [playerConfig, setPlayerConfig] = useState(null);
  const [playerHint, setPlayerHint] = useState("");
  const [isResolvingPlayer, setIsResolvingPlayer] = useState(false);

  const [userLanguage, setUserLanguage] = useState(null);
  const [selectedFansubs, setSelectedFansubs] = useState([]);
  const [customFansubs, setCustomFansubs] = useState([]);
  const [customFansubInput, setCustomFansubInput] = useState("");
  const [customFansubMeta, setCustomFansubMeta] = useState({});
  const [principalFansub, setPrincipalFansub] = useState(null);
  const [resolution, setResolution] = useState("1080p");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const shouldShow = !loading && !data.settings?.onboardingComplete;

  const applyResolvedPlayer = useCallback((resolvedPlayer, source = "manual") => {
    if (!resolvedPlayer?.executablePath) {
      setPlayerConfig(null);
      return null;
    }

    const nextPlayerConfig = buildPlayerConfig({
      ...resolvedPlayer,
      source,
    });

    setPlayerKey(nextPlayerConfig.key);
    setPlayerConfig(nextPlayerConfig);
    return nextPlayerConfig;
  }, []);

  const handlePickManualExecutable = useCallback(
    async (preferredKey = playerKey) => {
      const selectedPath = await selectPlayerExecutable();
      if (!selectedPath) return null;

      const nextPlayerConfig = buildPlayerConfig({
        key: preferredKey,
        executablePath: selectedPath,
        source: preferredKey === "other" ? "manual" : "preset_manual",
      });

      setPlayerKey(nextPlayerConfig.key);
      setPlayerConfig(nextPlayerConfig);
      setPlayerHint(`Ejecutable seleccionado manualmente: ${nextPlayerConfig.executablePath}`);
      return nextPlayerConfig;
    },
    [playerKey],
  );

  const resolvePlayerSelection = useCallback(
    async (nextKey, options = {}) => {
      const normalizedKey = nextKey || "other";
      setPlayerKey(normalizedKey);
      setErrorMessage("");
      if (options.clearCurrent) {
        setPlayerConfig(null);
      }
      setIsResolvingPlayer(true);

      try {
        if (normalizedKey === "other") {
          const manualConfig = await handlePickManualExecutable("other");
          if (!manualConfig && !options.silentIfMissing) {
            setPlayerHint("Selecciona manualmente el .exe del reproductor que usas habitualmente.");
          }
          return manualConfig;
        }

        const detectedPlayer = await detectKnownPlayer(normalizedKey);
        if (detectedPlayer?.executablePath) {
          const nextPlayerConfig = applyResolvedPlayer(detectedPlayer, "detected");
          setPlayerHint(`Se detecto ${getPlayerLabel(nextPlayerConfig.key)} en ${nextPlayerConfig.executablePath}`);
          return nextPlayerConfig;
        }

        setPlayerHint(`No se detecto ${getPlayerLabel(normalizedKey)} automaticamente. Selecciona su ejecutable.`);
        return await handlePickManualExecutable(normalizedKey);
      } finally {
        setIsResolvingPlayer(false);
      }
    },
    [applyResolvedPlayer, handlePickManualExecutable],
  );

  useEffect(() => {
    if (!shouldShow) return;

    let cancelled = false;

    setLocalFolderPath(data.folderPath || "");
    setPlayerHint("");
    setErrorMessage("");

    const existingFansubs = data?.settings?.torrent?.fansubs || [];
    const names = existingFansubs.map((entry) => entry.name);
    setSelectedFansubs(names);
    setPrincipalFansub(existingFansubs.find((entry) => entry.principal)?.name || names[0] || null);
    setResolution(getPreferredResolution(data?.settings));
    setUserLanguage(data?.settings?.torrent?.language || null);
    setCustomFansubs(names.filter((name) => !PRESET_FANSUBS.some((preset) => preset.toLowerCase() === name.toLowerCase())));
    setCustomFansubMeta(
      existingFansubs.reduce((accumulator, entry) => {
        if (PRESET_FANSUBS.some((preset) => preset.toLowerCase() === entry.name.toLowerCase())) {
          return accumulator;
        }
        accumulator[entry.name] = {
          language: entry.language || "en",
          nyaaCategory: entry.nyaaCategory || "1_2",
        };
        return accumulator;
      }, {}),
    );

    async function preloadPlayer() {
      if (isValidPlayerConfig(data?.settings?.playerConfig)) {
        const currentPlayerConfig = buildPlayerConfig(data.settings.playerConfig);
        if (cancelled) return;
        setPlayerKey(currentPlayerConfig.key);
        setPlayerConfig(currentPlayerConfig);
        setPlayerHint(`Reproductor configurado: ${currentPlayerConfig.executablePath}`);
        return;
      }

      setPlayerConfig(null);
      const detectedDefaultPlayer = await detectDefaultVideoPlayer();
      if (cancelled) return;

      if (detectedDefaultPlayer?.executablePath) {
        const nextPlayerConfig = applyResolvedPlayer(detectedDefaultPlayer, "detected");
        setPlayerHint(`Se detecto tu reproductor predeterminado. Confirma o cambia esta ruta antes de continuar.`);
        setPlayerKey(nextPlayerConfig.key);
        return;
      }

      const suggestedKey = getInitialPlayerSelection(data.settings);
      setPlayerKey(suggestedKey);
      setPlayerHint("Selecciona el reproductor que Zoku debe usar y confirma su ejecutable.");
    }

    void preloadPlayer();

    return () => {
      cancelled = true;
    };
  }, [applyResolvedPlayer, data, shouldShow]);

  const allFansubOptions = useMemo(
    () => [...PRESET_FANSUBS, ...customFansubs.filter((name) => !PRESET_FANSUBS.some((preset) => preset.toLowerCase() === name.toLowerCase()))],
    [customFansubs],
  );

  const getFansubDisplayInfo = (name) => {
    const detail = getFansubDetail(name);
    const isSpanishCapable = detail.hasSpanishSubs;
    const lang = customFansubMeta[name]?.language || detail.defaultLang;
    const nyaaCategory = customFansubMeta[name]?.nyaaCategory || detail.nyaaCategory;
    return { ...detail, lang, nyaaCategory, isSpanishCapable };
  };

  const canContinue = Boolean(folderPath) && isValidPlayerConfig(playerConfig);

  const handlePickFolder = async () => {
    const selectedPath = await selectFolder();
    if (!selectedPath) return;
    setLocalFolderPath(selectedPath);
    setErrorMessage("");
  };

  const toggleFansub = (name) => {
    setSelectedFansubs((previous) => {
      const exists = previous.some((entry) => entry.toLowerCase() === name.toLowerCase());
      if (exists) {
        const next = previous.filter((entry) => entry.toLowerCase() !== name.toLowerCase());
        if (principalFansub?.toLowerCase() === name.toLowerCase()) {
          setPrincipalFansub(next[0] || null);
        }
        return next;
      }

      const next = [...previous, name];
      if (!principalFansub) {
        setPrincipalFansub(name);
      }
      return next;
    });
  };

  const handleAddCustomFansub = () => {
    const trimmed = customFansubInput.trim();
    if (!trimmed) return;
    if (allFansubOptions.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
      setCustomFansubInput("");
      return;
    }

    const defaultLang = userLanguage === "es" ? "es" : "en";
    const defaultCategory = userLanguage === "es" ? "1_3" : "1_2";
    setCustomFansubMeta((prev) => ({
      ...prev,
      [trimmed]: { language: defaultLang, nyaaCategory: defaultCategory },
    }));

    setCustomFansubs((previous) => [...previous, trimmed]);
    setSelectedFansubs((previous) => {
      const next = [...previous, trimmed];
      if (!principalFansub) {
        setPrincipalFansub(trimmed);
      }
      return next;
    });
    setCustomFansubInput("");
  };

  const handleRemoveCustomFansub = (name) => {
    setCustomFansubs((previous) => previous.filter((entry) => entry !== name));
    setCustomFansubMeta((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSelectedFansubs((previous) => {
      const next = previous.filter((entry) => entry.toLowerCase() !== name.toLowerCase());
      if (principalFansub?.toLowerCase() === name.toLowerCase()) {
        setPrincipalFansub(next[0] || null);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!canContinue) {
      setErrorMessage("Debes elegir una carpeta y confirmar un reproductor valido (.exe) para continuar.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await setFolderPath(folderPath);

      const fansubsData = selectedFansubs.map((name) => {
        const detail = getFansubDetail(name);
        const meta = customFansubMeta[name] || {};
        return {
          name,
          principal: principalFansub ? name.toLowerCase() === principalFansub.toLowerCase() : false,
          language: meta.language || detail.defaultLang,
          nyaaCategory: meta.nyaaCategory || detail.nyaaCategory,
        };
      });

      await setSettings({
        ...data.settings,
        player: playerConfig.key,
        playerConfig,
        onboardingComplete: true,
        torrent: {
          ...(data.settings?.torrent || {}),
          resolution,
          language: userLanguage || "en",
          fansubs: fansubsData,
        },
      });
    } catch (error) {
      console.error("[WelcomeSetup] Error guardando configuracion inicial:", error);
      setErrorMessage("No se pudo guardar la configuracion inicial. Intenta de nuevo.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={shouldShow}
      onClose={() => {}}
      hideClose
      size="lg"
      title="BIENVENIDO A ZOKU"
      subtitle="Configura la carpeta y el reproductor para comenzar. Estos pasos son obligatorios."
    >
      <div className={styles.layout}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>1. Directorio de biblioteca</h3>
          <p className={styles.sectionText}>
            Elige la carpeta raiz desde donde Zoku leera archivos y carpetas. Este paso es obligatorio para que la biblioteca funcione.
          </p>
          <button className={styles.primaryButton} onClick={handlePickFolder}>
            {folderPath ? "CAMBIAR DIRECTORIO" : "SELECCIONAR DIRECTORIO"}
          </button>
          <div className={styles.valueBox}>{folderPath || "No se ha seleccionado un directorio todavia."}</div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>2. Reproductor de video</h3>
          <p className={styles.sectionText}>
            Zoku necesita el ejecutable real de tu reproductor para abrir episodios y seguir correctamente los cambios de capitulo.
          </p>
          <select
            className={styles.select}
            value={playerKey}
            disabled={isResolvingPlayer}
            onChange={(event) => {
              void resolvePlayerSelection(event.target.value, { clearCurrent: true });
            }}
          >
            {GUIDED_PLAYER_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <div className={styles.inlineRow}>
            <button
              className={styles.secondaryButton}
              disabled={isResolvingPlayer}
              onClick={() => void resolvePlayerSelection(playerKey, { silentIfMissing: false })}
            >
              {isResolvingPlayer ? "BUSCANDO..." : "REDETECTAR"}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={isResolvingPlayer}
              onClick={() => void handlePickManualExecutable(playerKey)}
            >
              BUSCAR .EXE
            </button>
          </div>
          <div className={styles.valueBox}>
            {playerConfig?.executablePath || "Todavia no hay un ejecutable confirmado para este reproductor."}
          </div>
          {playerConfig && (
            <p className={styles.sectionText}>
              {playerConfig.displayName} · origen {playerConfig.source === "detected" ? "detectado" : "manual"} · proceso {playerConfig.processName}
            </p>
          )}
          {playerHint && <p className={styles.sectionText}>{playerHint}</p>}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>3. Idioma preferido</h3>
          <p className={styles.sectionText}>
            ¿En qué idioma quieres ver anime? Esto determina en qué categoría de Nyaa se buscan los torrents.
          </p>
          <div className={styles.langContainer}>
            <button
              className={`${styles.langBtn} ${userLanguage === "en" ? styles.langBtnActive : ""}`}
              onClick={() => setUserLanguage("en")}
            >
              Inglés (english-translated)
            </button>
            <button
              className={`${styles.langBtn} ${userLanguage === "es" ? styles.langBtnActive : ""}`}
              onClick={() => setUserLanguage("es")}
            >
              Español (non-english)
            </button>
          </div>
          {userLanguage === "es" && (
            <p className={styles.spanishHint}>
              Algunos grupos como <strong>Erai-raws</strong> y <strong>DKB</strong> suben en la categoría inglés pero incluyen subtítulos en español. Te los mostramos destacados.
            </p>
          )}
        </section>

        {userLanguage && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>4. Torrent y fansubs</h3>
            <p className={styles.sectionText}>
              Este paso es opcional, pero recomendable. Si eliges fansubs, Zoku podra detectar episodios disponibles mas facilmente.
            </p>
            <div className={styles.fansubGrid}>
              {allFansubOptions.map((name) => {
                const selected = selectedFansubs.some((entry) => entry.toLowerCase() === name.toLowerCase());
                const isCustom = customFansubs.some((entry) => entry.toLowerCase() === name.toLowerCase());
                const display = getFansubDisplayInfo(name);
                const spanishCapable = userLanguage === "es" && display.isSpanishCapable;
                return (
                  <button
                    key={name}
                    className={`${styles.fansubChip} ${selected ? styles.fansubChipActive : ""} ${spanishCapable ? styles.fansubChipSpanish : ""}`}
                    onClick={() => toggleFansub(name)}
                    title={spanishCapable ? "Tiene subtitulos en espanol internos" : undefined}
                  >
                    <span>{name}</span>
                    {spanishCapable && <span className={styles.spanishBadge}>ES</span>}
                    {isCustom && (
                      <span
                        className={styles.removeCustom}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveCustomFansub(name);
                        }}
                      >
                        X
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className={styles.inlineRow}>
              <input
                className={styles.input}
                value={customFansubInput}
                onChange={(event) => setCustomFansubInput(event.target.value)}
                placeholder="Agregar fansub personalizado"
              />
              <button className={styles.secondaryButton} onClick={handleAddCustomFansub}>
                AGREGAR
              </button>
            </div>
            {selectedFansubs.length > 0 && (
              <>
                <label className={styles.fieldLabel}>Fansub principal</label>
                <div className={styles.radioGrid}>
                  {selectedFansubs.map((name) => (
                    <label key={name} className={styles.radioItem}>
                      <input
                        type="radio"
                        checked={principalFansub === name}
                        onChange={() => setPrincipalFansub(name)}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <label className={styles.fieldLabel}>Resolucion preferida</label>
            <div className={styles.radioGrid}>
              {SUPPORTED_RESOLUTIONS.map((value) => (
                <label key={value} className={styles.radioItem}>
                  <input type="radio" checked={resolution === value} onChange={() => setResolution(value)} />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        {errorMessage && <div className={styles.errorBox}>{errorMessage}</div>}

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Podras cambiar estos valores mas adelante desde Configuracion, pero ahora debes confirmar carpeta y reproductor.
          </p>
          <button className={styles.primaryButton} disabled={!canContinue || isSaving || isResolvingPlayer} onClick={handleSave}>
            {isSaving ? "GUARDANDO..." : "GUARDAR Y CONTINUAR"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
