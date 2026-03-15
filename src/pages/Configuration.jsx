import React, { useState } from "react";
import { useStore } from "../hooks/useStore";
import styles from "./Configuration.module.css";

const Configuration = () => {
  const { data, setSettings } = useStore();
  const [player, setPlayer] = useState("mpv");
  const [customPlayer, setCustomPlayer] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const KNOWN_PLAYERS = ["mpv", "vlc", "mpc-hc", "mpc-be", "potplayer"];

  React.useEffect(() => {
    const savedPlayer = data?.settings?.player || "mpv";
    if (KNOWN_PLAYERS.includes(savedPlayer)) {
      setPlayer(savedPlayer);
    } else {
      setPlayer("custom");
      setCustomPlayer(savedPlayer);
    }
  }, [data?.settings?.player]);

  const handleSave = async () => {
    setIsSaving(true);
    const finalPlayer = player === "custom" ? customPlayer : player;
    try {
      await setSettings({
        ...data.settings,
        player: finalPlayer
      });
      setTimeout(() => setIsSaving(false), 500);
    } catch (err) {
      console.error("Error saving settings:", err);
      setIsSaving(false);
    }
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
              style={{ marginTop: '10px' }}
            />
          )}

          <p className={styles.hint}>
            Zoku usará esto para detectar si el reproductor sigue abierto después de 1 minuto y marcar el episodio como visto automáticamente.
          </p>
        </div>
      </section>

      <button 
        className={styles.saveButton}
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? "Guardando..." : "Guardar Cambios"}
      </button>
    </div>
  );
};

export default Configuration;
