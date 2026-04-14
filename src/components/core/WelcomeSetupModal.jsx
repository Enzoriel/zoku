import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { useStore } from "../../hooks/useStore";
import { selectFolder } from "../../services/fileSystem";
import { getPreferredResolution, getFansubDetail } from "../../utils/torrentConfig";
import { KNOWN_PLAYERS, SUPPORTED_RESOLUTIONS, PRESET_FANSUBS } from "../../utils/constants";
import styles from "./WelcomeSetupModal.module.css";

export function WelcomeSetupModal() {
  const { data, loading, setFolderPath, setSettings } = useStore();
  const [folderPath, setLocalFolderPath] = useState("");
  const [player, setPlayer] = useState("mpv");
  const [customPlayer, setCustomPlayer] = useState("");

  // PASO 0: idioma del usuario
  const [userLanguage, setUserLanguage] = useState(null); // "en" | "es" | null

  // Fansub state
  const [selectedFansubs, setSelectedFansubs] = useState([]);
  const [customFansubs, setCustomFansubs] = useState([]);
  const [customFansubInput, setCustomFansubInput] = useState("");
  // Track language/category for each custom fansub: { name, language, nyaaCategory }
  const [customFansubMeta, setCustomFansubMeta] = useState({});
  const [principalFansub, setPrincipalFansub] = useState(null);
  const [resolution, setResolution] = useState("1080p");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const shouldShow = !loading && !data.settings?.onboardingComplete;

  useEffect(() => {
    if (!shouldShow) return;

    setLocalFolderPath(data.folderPath || "");

    const savedPlayer = data?.settings?.player || "mpv";
    if (KNOWN_PLAYERS.includes(savedPlayer)) {
      setPlayer(savedPlayer);
      setCustomPlayer("");
    } else {
      setPlayer("custom");
      setCustomPlayer(savedPlayer);
    }

    const existingFansubs = data?.settings?.torrent?.fansubs || [];
    const names = existingFansubs.map((entry) => entry.name);
    setSelectedFansubs(names);
    setPrincipalFansub(existingFansubs.find((entry) => entry.principal)?.name || names[0] || null);
    setResolution(getPreferredResolution(data?.settings));
    setCustomFansubs(names.filter((name) => !PRESET_FANSUBS.some((preset) => preset.toLowerCase() === name.toLowerCase())));
    setErrorMessage("");
  }, [shouldShow, data]);

  const allFansubOptions = useMemo(
    () => [...PRESET_FANSUBS, ...customFansubs.filter((name) => !PRESET_FANSUBS.some((preset) => preset.toLowerCase() === name.toLowerCase()))],
    [customFansubs],
  );

  /**
   * Devuelve info de display para cada fansub en el grid.
   * Si userLanguage === "es", los que tienen hasSpanishSubs se muestran destacados.
   */
  const getFansubDisplayInfo = (name) => {
    const detail = getFansubDetail(name);
    const isSpanishCapable = detail.hasSpanishSubs;
    // Para presets, usar su defaultLang. Para custom, usar metadata guardada.
    const lang = customFansubMeta[name]?.language || detail.defaultLang;
    const nyaaCategory = customFansubMeta[name]?.nyaaCategory || detail.nyaaCategory;
    return { ...detail, lang, nyaaCategory, isSpanishCapable };
  };

  const finalPlayer = player === "custom" ? customPlayer.trim() : player;
  const canContinue = Boolean(folderPath) && Boolean(finalPlayer);

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

    // Default metadata: idioma según elección del usuario, categoría por defecto
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
      setErrorMessage("Debes elegir una carpeta y un reproductor para continuar.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await setFolderPath(folderPath);

      // Construir fansubs con metadata de idioma y categoría
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
        player: finalPlayer,
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
      subtitle="Configura la app una sola vez para comenzar. Debes completar los campos obligatorios para continuar."
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
          <h3 className={styles.sectionTitle}>2. Reproductor preferido</h3>
          <p className={styles.sectionText}>
            Elige el reproductor que Zoku usara para detectar reproduccion y guardar progreso. Este paso tambien es obligatorio.
          </p>
          <select className={styles.select} value={player} onChange={(event) => setPlayer(event.target.value)}>
            <option value="mpv">MPV</option>
            <option value="vlc">VLC</option>
            <option value="mpc-hc">MPC-HC</option>
            <option value="mpc-be">MPC-BE</option>
            <option value="potplayer">PotPlayer</option>
            <option value="custom">Otro</option>
          </select>
          {player === "custom" && (
            <input
              className={styles.input}
              value={customPlayer}
              onChange={(event) => setCustomPlayer(event.target.value)}
              placeholder="Nombre del proceso, por ejemplo: vlc"
            />
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>3. Idioma preferido</h3>
          <p className={styles.sectionText}>
            ¿En qué idioma querés ver anime? Esto determina en qué categoría de Nyaa se buscan los torrents.
          </p>
          <div className={styles.langContainer}>
            <button
              className={`${styles.langBtn} ${userLanguage === "en" ? styles.langBtnActive : ""}`}
              onClick={() => setUserLanguage("en")}
            >
              🇬🇧 Inglés (english-translated)
            </button>
            <button
              className={`${styles.langBtn} ${userLanguage === "es" ? styles.langBtnActive : ""}`}
              onClick={() => setUserLanguage("es")}
            >
              🇪🇸 Español (non-english)
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
              Este paso es opcional, pero muy recomendable. Si elegis al menos un fansub, Zoku podra detectar episodios disponibles mas facilmente.
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
            Podras cambiar estos valores mas adelante desde Configuracion, pero ahora debes completar la configuracion inicial.
          </p>
          <button className={styles.primaryButton} disabled={!canContinue || isSaving} onClick={handleSave}>
            {isSaving ? "GUARDANDO..." : "GUARDAR Y CONTINUAR"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
