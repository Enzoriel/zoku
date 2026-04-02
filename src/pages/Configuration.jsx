import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import ConfirmModal from "../components/ui/ConfirmModal";
import FansubOnboardingModal from "../components/ui/FansubOnboardingModal";
import { selectFolder } from "../services/fileSystem";
import { getPreferredResolution } from "../utils/torrentConfig";
import styles from "./Configuration.module.css";

const KNOWN_PLAYERS = ["mpv", "vlc", "mpc-hc", "mpc-be", "potplayer"];

const Configuration = () => {
  const { data, setSettings, setFolderPath, clearAllData } = useStore();
  const navigate = useNavigate();
  const [player, setPlayer] = useState("mpv");
  const [customPlayer, setCustomPlayer] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showFansubModal, setShowFansubModal] = useState(false);
  const [localResolution, setLocalResolution] = useState("1080p");
  const [infoModal, setInfoModal] = useState(null);

  useEffect(() => {
    const savedPlayer = data?.settings?.player || "mpv";
    if (KNOWN_PLAYERS.includes(savedPlayer)) {
      setPlayer(savedPlayer);
      setCustomPlayer("");
    } else {
      setPlayer("custom");
      setCustomPlayer(savedPlayer);
    }

    setLocalResolution(getPreferredResolution(data?.settings));
  }, [data?.settings]);

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
    const finalPlayer = player === "custom" ? customPlayer : player;

    try {
      await setSettings({
        ...data.settings,
        player: finalPlayer,
        torrent: {
          ...(data.settings?.torrent || {}),
          resolution: localResolution,
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
          <label htmlFor="player-select">Selecciona tu reproductor preferido:</label>
          <select
            id="player-select"
            className={styles.select}
            value={player}
            onChange={(event) => setPlayer(event.target.value)}
          >
            <option value="mpv">MPV</option>
            <option value="vlc">VLC</option>
            <option value="mpc-hc">MPC-HC</option>
            <option value="mpc-be">MPC-BE</option>
            <option value="potplayer">PotPlayer</option>
            <option value="custom">Otro (nombre de proceso manual)</option>
          </select>

          {player === "custom" && (
            <input
              type="text"
              className={styles.select}
              placeholder="Nombre del ejecutable (sin .exe, ej: vlc)"
              value={customPlayer}
              onChange={(event) => setCustomPlayer(event.target.value)}
              style={{ marginTop: "10px" }}
            />
          )}

          <p className={styles.hint}>
            <strong>Sistema de deteccion inteligente:</strong> Zoku intentara encontrar el proceso que elijas aqui, pero si
            el sistema abre un reproductor distinto, Zoku tambien intentara detectarlo automaticamente para no perder el
            progreso.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Torrents y Fansubs</h2>
        <div className={styles.settingItem} style={{ marginBottom: "20px" }}>
          <label>Calidad de video preferida:</label>
          <div className={styles.resContainer}>
            {["2160p", "1080p", "720p", "480p"].map((resolution) => (
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

      <button className={styles.saveButton} onClick={handleSaveTrigger} disabled={isSaving}>
        {isSaving ? "Guardando..." : "Guardar Cambios"}
      </button>

      {showClearModal && (
        <ConfirmModal
          title="Eliminar Todos los Datos"
          message="¿Estas seguro de que quieres eliminar todos tus datos? Esta accion no se puede deshacer."
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
          message="¿Quieres aplicar los nuevos ajustes a Zoku? Esto podria reiniciar el feed de torrents."
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
