import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import ConfirmModal from "../components/ui/ConfirmModal";
import FansubOnboardingModal from "../components/ui/FansubOnboardingModal";
import {
  detectDefaultVideoPlayer,
  detectKnownPlayer,
  selectFolder,
  selectPlayerExecutable,
} from "../services/fileSystem";
import { getPreferredResolution } from "../utils/torrentConfig";
import { SUPPORTED_RESOLUTIONS } from "../utils/constants";
import {
  buildPlayerConfig,
  getInitialPlayerSelection,
  getPlayerLabel,
  GUIDED_PLAYER_OPTIONS,
  isValidPlayerConfig,
} from "../utils/playerDetection";
import styles from "./Configuration.module.css";

const Configuration = () => {
  const { data, setSettings, setFolderPath, clearAllData } = useStore();
  const navigate = useNavigate();
  const [playerKey, setPlayerKey] = useState("other");
  const [playerConfig, setPlayerConfig] = useState(null);
  const [playerHint, setPlayerHint] = useState("");
  const [isResolvingPlayer, setIsResolvingPlayer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showFansubModal, setShowFansubModal] = useState(false);
  const [localResolution, setLocalResolution] = useState("1080p");
  const [language, setLanguage] = useState("en");
  const [infoModal, setInfoModal] = useState(null);

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
      if (options.clearCurrent) {
        setPlayerConfig(null);
      }
      setIsResolvingPlayer(true);

      try {
        if (normalizedKey === "other") {
          const manualConfig = await handlePickManualExecutable("other");
          if (!manualConfig && !options.silentIfMissing) {
            setPlayerHint("Selecciona manualmente el .exe del reproductor.");
          }
          return manualConfig;
        }

        const detectedPlayer = await detectKnownPlayer(normalizedKey);
        if (detectedPlayer?.executablePath) {
          const nextPlayerConfig = applyResolvedPlayer(detectedPlayer, "detected");
          setPlayerHint(`Se detecto ${getPlayerLabel(nextPlayerConfig.key)} en ${nextPlayerConfig.executablePath}`);
          return nextPlayerConfig;
        }

        setPlayerHint(`No se detecto ${getPlayerLabel(normalizedKey)} automaticamente. Selecciona su .exe.`);
        return await handlePickManualExecutable(normalizedKey);
      } finally {
        setIsResolvingPlayer(false);
      }
    },
    [applyResolvedPlayer, handlePickManualExecutable],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydratePlayerState() {
      if (isValidPlayerConfig(data?.settings?.playerConfig)) {
        const currentPlayerConfig = buildPlayerConfig(data.settings.playerConfig);
        if (cancelled) return;
        setPlayerKey(currentPlayerConfig.key);
        setPlayerConfig(currentPlayerConfig);
        setPlayerHint(currentPlayerConfig.executablePath);
        return;
      }

      const detectedDefaultPlayer = await detectDefaultVideoPlayer();
      if (cancelled) return;

      if (detectedDefaultPlayer?.executablePath) {
        const nextPlayerConfig = applyResolvedPlayer(detectedDefaultPlayer, "detected");
        setPlayerHint(`Se detecto el reproductor predeterminado. Revisa la ruta antes de guardar.`);
        setPlayerKey(nextPlayerConfig.key);
        return;
      }

      setPlayerKey(getInitialPlayerSelection(data.settings));
      setPlayerConfig(null);
      setPlayerHint("No hay un reproductor confirmado. Debes configurarlo para que Zoku pueda reproducir episodios.");
    }

    void hydratePlayerState();
    setLocalResolution(getPreferredResolution(data?.settings));
    setLanguage(data?.settings?.torrent?.language || "en");

    return () => {
      cancelled = true;
    };
  }, [applyResolvedPlayer, data?.settings]);

  const canSavePlayerConfig = useMemo(() => isValidPlayerConfig(playerConfig), [playerConfig]);

  const handleSaveTrigger = () => {
    setShowSaveModal(true);
  };

  const handleChangeLibraryPath = async () => {
    const path = await selectFolder();
    if (!path) return;

    try {
      await setFolderPath(path);
      setInfoModal({
        title: "Directorio actualizado",
        message: "La biblioteca comenzara a resincronizarse automaticamente con la nueva ruta.",
      });
    } catch (error) {
      console.error("Error changing library path:", error);
      setInfoModal({
        title: "No se pudo cambiar la ruta",
        message: "Intenta seleccionar otra carpeta o reintenta en unos segundos.",
      });
    }
  };

  const handleSaveExecute = async () => {
    setIsSaving(true);

    try {
      await setSettings({
        ...data.settings,
        player: playerConfig?.key || "",
        playerConfig: canSavePlayerConfig ? playerConfig : null,
        onboardingComplete: Boolean(data.folderPath) && canSavePlayerConfig,
        torrent: {
          ...(data.settings?.torrent || {}),
          resolution: localResolution,
          language,
        },
      });
      setShowSaveModal(false);
    } catch (error) {
      console.error("Error saving settings:", error);
      setInfoModal({
        title: "No se pudo guardar la configuracion",
        message: "Intenta de nuevo en unos segundos.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearPlayerConfig = async () => {
    setIsSaving(true);

    try {
      await setSettings({
        ...data.settings,
        player: "",
        playerConfig: null,
        onboardingComplete: false,
      });
      setPlayerConfig(null);
      setPlayerKey("other");
      setPlayerHint("Se elimino la configuracion del reproductor. Debes volver a configurarlo.");
      setInfoModal({
        title: "Reproductor eliminado",
        message: "Zoku requerira una configuracion valida del reproductor para seguir funcionando.",
      });
    } catch (error) {
      console.error("Error clearing player settings:", error);
      setInfoModal({
        title: "No se pudo limpiar el reproductor",
        message: "Intenta de nuevo en unos segundos.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await clearAllData();
      setShowClearModal(false);
      navigate("/");
    } catch (error) {
      console.error("Error al eliminar datos:", error);
      setInfoModal({
        title: "No se pudieron eliminar los datos",
        message: "Intenta de nuevo en unos segundos.",
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Configuracion</h1>

      <section className={styles.section}>
        <h2>Biblioteca</h2>
        <div className={styles.settingItem}>
          <label>Directorio raiz actual:</label>
          <div className={styles.hint} style={{ marginBottom: "16px" }}>
            {data.folderPath || "No hay un directorio activo configurado."}
          </div>
          <button className={styles.secondaryButton} onClick={handleChangeLibraryPath}>
            {data.folderPath ? "CAMBIAR DIRECTORIO RAIZ" : "SELECCIONAR DIRECTORIO RAIZ"}
          </button>
          <p className={styles.hint}>
            La pagina Biblioteca se actualiza automaticamente cuando cambias esta ruta o cuando detecta cambios en disco.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Reproductor de Video</h2>
        <div className={styles.settingItem}>
          <label htmlFor="player-select">Selecciona el reproductor que Zoku debe controlar:</label>
          <select
            id="player-select"
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

          <div className={styles.buttonRow}>
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
              CAMBIAR EJECUTABLE
            </button>
            <button
              className={styles.secondaryButton}
              disabled={isResolvingPlayer}
              onClick={() => void handlePickManualExecutable("other")}
            >
              BUSCAR MANUALMENTE
            </button>
          </div>

          <div className={styles.pathBox}>
            {playerConfig?.executablePath || "No hay un ejecutable confirmado para reproducir episodios."}
          </div>
          <p className={styles.hint}>
            {playerHint ||
              "Zoku abre episodios con este ejecutable y solo seguira la reproduccion de ese reproductor."}
          </p>
          {playerConfig && (
            <p className={styles.hint}>
              {playerConfig.displayName} · proceso {playerConfig.processName} · origen{" "}
              {playerConfig.source === "detected" ? "detectado" : "manual"}
            </p>
          )}

          <button className={styles.dangerButton} onClick={handleClearPlayerConfig} disabled={isSaving}>
            QUITAR REPRODUCTOR CONFIGURADO
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Torrents y Fansubs</h2>
        <div className={styles.settingItem} style={{ marginBottom: "20px" }}>
          <label>Calidad de video preferida:</label>
          <div className={styles.resContainer}>
            {SUPPORTED_RESOLUTIONS.map((resolution) => (
              <button
                key={resolution}
                className={`${styles.resBtn} ${localResolution === resolution ? styles.resBtnActive : ""}`}
                onClick={() => setLocalResolution(resolution)}
              >
                {resolution}
              </button>
            ))}
          </div>
          <p className={styles.hint}>Los cambios de resolucion se aplicaran despues de guardar.</p>
        </div>

        <div className={styles.settingItem} style={{ marginBottom: "20px" }}>
          <label>Idioma de busqueda en Nyaa:</label>
          <div className={styles.langContainer}>
            <button
              className={`${styles.langBtn} ${language === "en" ? styles.langBtnActive : ""}`}
              onClick={() => setLanguage("en")}
            >
              Ingles (english-translated)
            </button>
            <button
              className={`${styles.langBtn} ${language === "es" ? styles.langBtnActive : ""}`}
              onClick={() => setLanguage("es")}
            >
              Espanol (non-english)
            </button>
          </div>
          <p className={styles.hint}>
            {language === "es"
              ? "Las busquedas se haran en la categoria Non-English. En Torrents podras alternar entre ingles y espanol con un toggle."
              : "Las busquedas se haran en la categoria English-Translated. Puedes configurar fansubs en espanol si lo necesitas."}
          </p>
        </div>

        {data?.settings?.torrent?.fansubs?.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <label>Fansubs configurados:</label>
            <div className={styles.fansubList}>
              {data.settings.torrent.fansubs.map((f) => {
                const lang = f.language || "en";
                const category = f.nyaaCategory || "1_2";
                const isPrincipal = f.principal;
                return (
                  <div key={f.name} className={styles.fansubListItem}>
                    <span className={styles.fansubListName}>
                      {f.name}
                      {isPrincipal && <span className={styles.fansubListPrincipal}>*</span>}
                    </span>
                    <span className={styles.fansubListMeta}>
                      <span className={lang === "es" ? styles.langEs : styles.langEn}>{lang === "es" ? "ES" : "EN"}</span>
                      <span className={styles.fansubListCategory}>
                        {category === "1_3" ? "Non-English" : "English-Translated"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button className={styles.secondaryButton} onClick={() => setShowFansubModal(true)}>
          ADMINISTRAR FANSUBS
        </button>
      </section>

      <section className={styles.section}>
        <h2>Eliminar Datos</h2>
        <p className={styles.warningText}>
          Esta accion eliminara todos tus datos de la aplicacion: biblioteca, historial y configuracion.
          <strong> Tus archivos de video locales no seran eliminados del disco. </strong>
          Esta accion no se puede deshacer.
        </p>
        <button className={styles.dangerButton} onClick={() => setShowClearModal(true)}>
          Eliminar Todos los Datos
        </button>
      </section>

      <button className={styles.saveButton} onClick={handleSaveTrigger} disabled={isSaving || isResolvingPlayer}>
        {isSaving ? "Guardando..." : "Guardar Cambios"}
      </button>

      {showClearModal && (
        <ConfirmModal
          title="Eliminar Todos los Datos"
          message="Estas seguro de que quieres eliminar todos tus datos? Esta accion no se puede deshacer."
          onConfirm={handleClearAll}
          onCancel={() => setShowClearModal(false)}
          isLoading={isClearing}
          variant="danger"
          confirmLabel="ELIMINAR TODO"
        />
      )}

      {showSaveModal && (
        <ConfirmModal
          title="Guardar Configuracion"
          message={
            canSavePlayerConfig
              ? "Quieres aplicar los nuevos ajustes a Zoku? Esto podria reiniciar el feed de torrents."
              : "No hay un reproductor valido configurado. Si guardas asi, Zoku volvera a pedir configuracion obligatoria."
          }
          onConfirm={handleSaveExecute}
          onCancel={() => setShowSaveModal(false)}
          isLoading={isSaving}
          confirmLabel="GUARDAR CAMBIOS"
        />
      )}

      {infoModal && (
        <ConfirmModal
          title={infoModal.title}
          message={infoModal.message}
          onConfirm={() => setInfoModal(null)}
          onCancel={() => setInfoModal(null)}
          confirmLabel="ENTENDIDO"
          hideCancel
        />
      )}

      {showFansubModal && <FansubOnboardingModal onComplete={() => setShowFansubModal(false)} />}
    </div>
  );
};

export default Configuration;
