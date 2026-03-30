import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../hooks/useStore";
import ConfirmModal from "../components/ui/ConfirmModal";
import FansubOnboardingModal from "../components/ui/FansubOnboardingModal";
import { getPreferredResolution } from "../utils/torrentConfig";
import styles from "./Configuration.module.css";

const Configuration = () => {
  const { data, setSettings, clearAllData } = useStore();
  const navigate = useNavigate();
  const [player, setPlayer] = useState("mpv");
  const [customPlayer, setCustomPlayer] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showFansubModal, setShowFansubModal] = useState(false);
  const [localResolution, setLocalResolution] = useState("1080p");

  const KNOWN_PLAYERS = ["mpv", "vlc", "mpc-hc", "mpc-be", "potplayer"];

  React.useEffect(() => {
    const savedPlayer = data?.settings?.player || "mpv";
    if (KNOWN_PLAYERS.includes(savedPlayer)) {
      setPlayer(savedPlayer);
    } else {
      setPlayer("custom");
      setCustomPlayer(savedPlayer);
    }
    
    setLocalResolution(getPreferredResolution(data?.settings));
  }, [data?.settings]);

  const handleSaveTrigger = () => {
    setShowSaveModal(true);
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
          resolution: localResolution
        }
      });
      setShowSaveModal(false);
      setTimeout(() => setIsSaving(false), 500);
    } catch (err) {
      console.error("Error saving settings:", err);
      setIsSaving(false);
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await clearAllData();
      setShowClearModal(false);
      // Redirigir al dashboard para confirmar visualmente el reinicio
      navigate("/");
    } catch (error) {
      console.error("Error al eliminar datos:", error);
      alert("Error al eliminar los datos. Por favor, intenta de nuevo.");
    }
    setIsClearing(false);
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Configuración</h1>

      <section className={styles.section}>
        <h2>Reproductor de Video</h2>
        <div className={styles.settingItem}>
          <label htmlFor="player-select">Selecciona tu reproductor preferido:</label>
          <select
            id="player-select"
            className={styles.select}
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
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
              onChange={(e) => setCustomPlayer(e.target.value)}
              style={{ marginTop: "10px" }}
            />
          )}

          <p className={styles.hint}>
            <strong>Sistema de detección inteligente:</strong> Zoku intentará encontrar el proceso que elijas aquí,
            pero si el sistema abre un reproductor distinto (ej: el predeterminado del sistema), Zoku también 
            intentará detectarlo automáticamente para no perder el progreso.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Torrents y Fansubs</h2>
        <div className={styles.settingItem} style={{ marginBottom: "20px" }}>
          <label>Calidad de video preferida:</label>
          <div className={styles.resContainer}>
             {["2160p", "1080p", "720p", "480p"].map(res => {
               return (
                <button 
                  key={res} 
                  className={`${styles.resBtn} ${localResolution === res ? styles.resBtnActive : ""}`}
                  onClick={() => setLocalResolution(res)}
                >
                  {res}
                </button>
               )
             })}
          </div>
          <p className={styles.hint}>Los cambios de resolución se aplicarán después de guardar.</p>
        </div>

        <button className={styles.secondaryButton} onClick={() => setShowFansubModal(true)}>
          ADMINISTRAR FANSUBS
        </button>
      </section>

      <section className={styles.section}>
        <h2>Eliminar Datos</h2>
        <p className={styles.warningText}>
          Esta acción eliminará todos tus datos de la aplicación: biblioteca, historial y configuración.
          <strong> Tus archivos de video locales no serán eliminados del disco. </strong>
          Esta acción no se puede deshacer.
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
          message="¿Estás seguro de que quieres eliminar todos tus datos? Esta acción no se puede deshacer."
          onConfirm={handleClearAll}
          onCancel={() => setShowClearModal(false)}
          isLoading={isClearing}
          variant="danger"
          confirmLabel="ELIMINAR TODO"
        />
      )}

      {showSaveModal && (
        <ConfirmModal
          title="Guardar Configuración"
          message="¿Quieres aplicar los nuevos ajustes a Zoku? Esto podría reiniciar el feed de torrents."
          onConfirm={handleSaveExecute}
          onCancel={() => setShowSaveModal(false)}
          isLoading={isSaving}
          confirmLabel="GUARDAR CAMBIOS"
        />
      )}

      {showFansubModal && (
        <FansubOnboardingModal onComplete={() => setShowFansubModal(false)} />
      )}
    </div>
  );
};

export default Configuration;
