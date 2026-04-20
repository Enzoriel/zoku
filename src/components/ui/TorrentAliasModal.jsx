import { useState, useEffect, useRef, useMemo } from "react";
import { useStore } from "../../hooks/useStore";
import {
  buildPersistedFansubConfig,
  getAllFansubs,
  getFansubDetail,
  getPrincipalFansub,
} from "../../utils/torrentConfig";
import Modal from "./Modal";
import styles from "./TorrentAliasModal.module.css";

function buildInitialMeta(name, settings) {
  const existing = getAllFansubs(settings).find((fansub) => fansub.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return {
      language: existing.language || "en",
      nyaaCategory: existing.nyaaCategory || "1_2",
      useResolutionFilter: existing.nyaaCategory === "1_3" ? false : Boolean(existing.useResolutionFilter),
    };
  }

  const detail = getFansubDetail(name);
  return {
    language: detail.defaultLang,
    nyaaCategory: detail.nyaaCategory,
    useResolutionFilter: detail.nyaaCategory === "1_3" ? false : Boolean(detail.useResolutionFilter),
  };
}

function TorrentAliasModal({ isOpen, onClose, initialValue, initialFansub, animeTitle, onSave, onError = null }) {
  const { data, setSettings } = useStore();
  const inputRef = useRef(null);
  const principalFansub = useMemo(() => getPrincipalFansub(data.settings), [data.settings]);
  const configuredFansubs = useMemo(() => {
    const fansubs = getAllFansubs(data.settings);
    if (initialFansub && !fansubs.some((fansub) => fansub.name.toLowerCase() === initialFansub.toLowerCase())) {
      return [...fansubs, buildPersistedFansubConfig(initialFansub)];
    }
    return fansubs;
  }, [data.settings, initialFansub]);

  const [alias, setAlias] = useState(initialValue || "");
  const [selectedFansub, setSelectedFansub] = useState(initialFansub || "__principal__");
  const [customFansubName, setCustomFansubName] = useState("");
  const [customMeta, setCustomMeta] = useState({ language: "es", nyaaCategory: "1_3", useResolutionFilter: false });
  const [saving, setSaving] = useState(false);

  const effectiveFansubName = selectedFansub === "__principal__" ? principalFansub : selectedFansub;
  const currentFansubName = customFansubName.trim() || effectiveFansubName;
  const prevFansubRef = useRef(initialFansub || principalFansub);

  useEffect(() => {
    if (!isOpen) return;

    setAlias(initialValue || "");
    setSelectedFansub(initialFansub || "__principal__");
    setCustomFansubName("");
    setCustomMeta({ language: "es", nyaaCategory: "1_3", useResolutionFilter: false });
    prevFansubRef.current = initialFansub || principalFansub;
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen, initialValue, initialFansub, principalFansub]);

  useEffect(() => {
    if (!isOpen || !currentFansubName || !prevFansubRef.current) return;
    
    if (currentFansubName !== prevFansubRef.current) {
      setAlias((currentAlias) => {
        if (!currentAlias) {
          if (animeTitle) return `[${currentFansubName}] ${animeTitle}`;
          return `[${currentFansubName}] `;
        }
        
        const bracketRegex = /^\[(.*?)\]/;
        const hasBracket = bracketRegex.test(currentAlias);
        
        if (hasBracket) {
          return currentAlias.replace(bracketRegex, `[${currentFansubName}]`);
        }
        
        return `[${currentFansubName}] ${currentAlias}`;
      });
      prevFansubRef.current = currentFansubName;
    }
  }, [currentFansubName, isOpen, animeTitle]);

  const handleSave = async () => {
    setSaving(true);

    try {
      let finalFansub = selectedFansub === "__principal__" ? null : selectedFansub;
      const trimmedCustomName = customFansubName.trim();
      const existingFansubs = getAllFansubs(data.settings);

      if (trimmedCustomName) {
        const duplicate = existingFansubs.find((fansub) => fansub.name.toLowerCase() === trimmedCustomName.toLowerCase());
        finalFansub = duplicate?.name || trimmedCustomName;

        if (!duplicate) {
          const nextFansubs = [
            ...existingFansubs,
            buildPersistedFansubConfig(trimmedCustomName, customMeta),
          ];

          await setSettings({
            ...data.settings,
            torrent: {
              ...(data.settings?.torrent || {}),
              fansubs: nextFansubs,
            },
          });
        }
      }

      await onSave({
        alias: alias.trim(),
        torrentSourceFansub: finalFansub,
      });
      onClose();
    } catch (error) {
      console.error("[TorrentAliasModal] Error guardando configuración:", error);
      onError?.("No se pudo guardar la configuracion de torrents.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      handleSave();
    }
  };

  const selectedFansubMeta = useMemo(() => {
    if (selectedFansub === "__principal__") return null;
    return buildInitialMeta(selectedFansub, data.settings);
  }, [selectedFansub, data.settings]);

  const showCustomEditor = customFansubName.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="CAMBIAR FANSUB"
      subtitle="Selecciona el feed que Zoku debe usar para detectar episodios en Recent. El alias manual sigue siendo opcional."
      footer={
        <>
          <button className={`${styles.btn} ${styles.cancelBtn}`} onClick={onClose}>
            CANCELAR
          </button>
          <button className={`${styles.btn} ${styles.saveBtn}`} onClick={handleSave} disabled={saving}>
            {saving ? "GUARDANDO..." : "GUARDAR"}
          </button>
        </>
      }
    >
      <div className={styles.inputGroup}>
        <label className={styles.label}>Fuente del feed</label>
        <select
          className={styles.select}
          value={selectedFansub}
          onChange={(event) => setSelectedFansub(event.target.value)}
        >
          <option value="__principal__">
            Usar fansub principal{principalFansub ? ` (${principalFansub})` : ""}
          </option>
          {configuredFansubs
            .filter((f) => !principalFansub || f.name.toLowerCase() !== principalFansub.toLowerCase())
            .map((fansub) => (
            <option key={fansub.name} value={fansub.name}>
              {fansub.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.label}>Agregar fansub nuevo</label>
        <input
          type="text"
          className={styles.input}
          value={customFansubName}
          onChange={(event) => setCustomFansubName(event.target.value)}
          placeholder="Ej: AniSubber"
        />
        <p className={styles.hint}>Si escribes uno nuevo, se agregará a tu configuración y se asignará a este anime.</p>
      </div>

      {showCustomEditor && (
        <div className={styles.metaBox}>
          <span className={styles.metaTitle}>Configuración del fansub nuevo</span>
          <div className={styles.metaRow}>
            <button
              className={`${styles.metaToggle} ${customMeta.language === "en" ? styles.metaToggleActive : ""}`}
              onClick={() => setCustomMeta((prev) => ({ ...prev, language: "en", nyaaCategory: prev.nyaaCategory || "1_2" }))}
              type="button"
            >
              Inglés
            </button>
            <button
              className={`${styles.metaToggle} ${customMeta.language === "es" ? styles.metaToggleActive : ""}`}
              onClick={() => setCustomMeta((prev) => ({ ...prev, language: "es", nyaaCategory: "1_3", useResolutionFilter: false }))}
              type="button"
            >
              Español
            </button>
          </div>
          <div className={styles.metaRow}>
            <button
              className={`${styles.metaToggle} ${customMeta.nyaaCategory === "1_2" ? styles.metaToggleActive : ""}`}
              onClick={() => setCustomMeta((prev) => ({ ...prev, nyaaCategory: "1_2" }))}
              type="button"
            >
              English-Translated
            </button>
            <button
              className={`${styles.metaToggle} ${customMeta.nyaaCategory === "1_3" ? styles.metaToggleActive : ""}`}
              onClick={() => setCustomMeta((prev) => ({ ...prev, nyaaCategory: "1_3", useResolutionFilter: false }))}
              type="button"
            >
              Non-English
            </button>
          </div>
          {customMeta.nyaaCategory === "1_2" ? (
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={customMeta.useResolutionFilter}
                onChange={(event) =>
                  setCustomMeta((prev) => ({ ...prev, useResolutionFilter: event.target.checked }))
                }
              />
              Filtrar por resolución preferida
            </label>
          ) : (
            <p className={styles.hint}>Los fansubs en categoría Non-English no se filtran por resolución.</p>
          )}
        </div>
      )}

      {selectedFansubMeta && !showCustomEditor && (
        <div className={styles.metaBox}>
          <span className={styles.metaTitle}>Fansub asignado actualmente</span>
          <p className={styles.hint}>
            Idioma: {selectedFansubMeta.language === "es" ? "Español" : "Inglés"} · Categoría: {selectedFansubMeta.nyaaCategory}
            {selectedFansubMeta.nyaaCategory === "1_2"
              ? ` · Resolución ${selectedFansubMeta.useResolutionFilter ? "activada" : "desactivada"}`
              : " · Sin filtro de resolución"}
          </p>
        </div>
      )}

      <div className={styles.inputGroup}>
        <label className={styles.label}>Alias manual opcional</label>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ej: [Erai-raws] Jujutsu Kaisen"
        />
        <p className={styles.hint}>
          Usa esto solo si el título publicado en Nyaa no coincide bien. El fansub y el alias son configuraciones independientes.
        </p>
      </div>
    </Modal>
  );
}

export default TorrentAliasModal;
