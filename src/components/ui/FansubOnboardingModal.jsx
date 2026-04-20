import { useState, useEffect, useCallback } from "react";
import { useStore } from "../../hooks/useStore";
import { getPreferredResolution, getFansubDetail, buildPersistedFansubConfig } from "../../utils/torrentConfig";
import { PRESET_FANSUBS, SUPPORTED_RESOLUTIONS } from "../../utils/constants";
import styles from "./FansubOnboardingModal.module.css";

function FansubOnboardingModal({ onComplete }) {
  const { data, setSettings } = useStore();

  const [selected, setSelected] = useState([]);
  const [customFansubs, setCustomFansubs] = useState([]);
  const [customInput, setCustomInput] = useState("");
  const [principal, setPrincipal] = useState(null);
  const [resolution, setResolution] = useState("1080p");
  const [saving, setSaving] = useState(false);
  // Metadata por fansub: { [name]: { language, nyaaCategory, useResolutionFilter } }
  const [fansubMeta, setFansubMeta] = useState({});

  // Precargar si ya hay fansubs configurados (edición)
  useEffect(() => {
    const existing = data?.settings?.torrent?.fansubs || [];
    if (existing.length > 0) {
      const names = existing.map((f) => f.name);
      setSelected(names);
      const principalEntry = existing.find((f) => f.principal);
      if (principalEntry) setPrincipal(principalEntry.name);

      const savedRes = getPreferredResolution(data?.settings);
      setResolution(savedRes);

      // Detectar custom fansubs
      const customs = names.filter((n) => !PRESET_FANSUBS.some((p) => p.toLowerCase() === n.toLowerCase()));
      setCustomFansubs(customs);

      // Cargar metadata existente
      const meta = {};
      existing.forEach((f) => {
        meta[f.name] = {
          language: f.language || "en",
          nyaaCategory: f.nyaaCategory || "1_2",
          useResolutionFilter: f.nyaaCategory === "1_3" ? false : typeof f.useResolutionFilter === "boolean" ? f.useResolutionFilter : true,
        };
      });
      setFansubMeta(meta);
    }
  }, [data?.settings]);

  const allOptions = [...PRESET_FANSUBS, ...customFansubs.filter((c) => !PRESET_FANSUBS.some((p) => p.toLowerCase() === c.toLowerCase()))];

  const toggleFansub = (name) => {
    setSelected((prev) => {
      if (prev.some((s) => s.toLowerCase() === name.toLowerCase())) {
        const next = prev.filter((s) => s.toLowerCase() !== name.toLowerCase());
        if (principal?.toLowerCase() === name.toLowerCase()) setPrincipal(null);
        return next;
      }
      return [...prev, name];
    });
  };

  const handleAddCustom = () => {
    const name = customInput.trim();
    if (!name) return;
    const isDuplicate = allOptions.some((o) => o.toLowerCase() === name.toLowerCase());
    if (isDuplicate) return;
    setCustomFansubs((prev) => [...prev, name]);
    setSelected((prev) => [...prev, name]);
    // Inicializar metadata: default en español (custom fansubs suelen ser .es)
    setFansubMeta((prev) => ({
      ...prev,
      [name]: { language: "es", nyaaCategory: "1_3", useResolutionFilter: false },
    }));
    setCustomInput("");
  };

  const handleRemoveCustom = (name) => {
    setCustomFansubs((prev) => prev.filter((c) => c !== name));
    setSelected((prev) => prev.filter((s) => s.toLowerCase() !== name.toLowerCase()));
    setFansubMeta((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (principal?.toLowerCase() === name.toLowerCase()) setPrincipal(null);
  };

  /** Actualizar metadata de un fansub (language/nyaaCategory) */
  const updateFansubMeta = (name, field, value) => {
    setFansubMeta((prev) => ({
      ...prev,
      [name]: {
        ...(prev[name] || { language: "en", nyaaCategory: "1_2", useResolutionFilter: true }),
        [field]: value,
        ...(field === "nyaaCategory"
          ? value === "1_3"
            ? { useResolutionFilter: false }
            : { useResolutionFilter: true }
          : {}),
      },
    }));
  };

  const handleSave = useCallback(async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await setSettings({
        ...data.settings,
        torrent: {
          ...(data.settings?.torrent || {}),
          resolution,
          fansubs: selected.map((name) => {
            const meta = fansubMeta[name] || {};
            return buildPersistedFansubConfig(name, {
              ...meta,
              principal: principal ? name.toLowerCase() === principal.toLowerCase() : false,
            });
          }),
        },
      });
      onComplete?.();
    } catch (e) {
      console.error("[FansubOnboarding] Error guardando:", e);
    } finally {
      setSaving(false);
    }
  }, [selected, principal, resolution, fansubMeta, data.settings, setSettings, onComplete]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCustom();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>CONFIGURÁ TUS GRUPOS DE SUBTÍTULOS</h2>
          <p className={styles.subtitle}>Necesitás al menos un grupo para usar la sección de Torrents.</p>
        </div>

        {/* Sección 1: Elegir fansubs */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>SELECCIONAR GRUPOS</span>
          <div className={styles.fansubGrid}>
            {allOptions.map((name) => {
              const isSelected = selected.some((s) => s.toLowerCase() === name.toLowerCase());
              const isCustom = customFansubs.some((c) => c.toLowerCase() === name.toLowerCase());
              const meta = fansubMeta[name] || {};
              const lang = meta.language || (isCustom ? "es" : "en");
              const category = meta.nyaaCategory || "1_2";
              const useResolutionFilter = category === "1_3" ? false : meta.useResolutionFilter !== false;
              return (
                <div key={name}>
                  <div
                    className={`${styles.fansubChip} ${isSelected ? styles.chipSelected : ""}`}
                    onClick={() => toggleFansub(name)}
                  >
                    <span className={styles.chipCheck}>{isSelected ? "✓" : ""}</span>
                    <span>{name}</span>
                    {isCustom && (
                      <button
                        className={styles.chipRemove}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCustom(name);
                        }}
                        aria-label={`Eliminar ${name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {/* Inline editor para custom fansubs seleccionados */}
                  {isCustom && isSelected && (
                    <div className={styles.customMeta}>
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Idioma:</span>
                        <button
                          className={`${styles.metaToggle} ${lang === "en" ? styles.metaToggleActive : ""}`}
                          onClick={(e) => { e.stopPropagation(); updateFansubMeta(name, "language", "en"); }}
                        >
                          🇬🇧 EN
                        </button>
                        <button
                          className={`${styles.metaToggle} ${lang === "es" ? styles.metaToggleActive : ""}`}
                          onClick={(e) => { e.stopPropagation(); updateFansubMeta(name, "language", "es"); }}
                        >
                          🇪🇸 ES
                        </button>
                      </div>
                      {lang === "es" && (
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>Categoría Nyaa:</span>
                          <button
                            className={`${styles.metaToggle} ${category === "1_3" ? styles.metaToggleActive : ""}`}
                            onClick={(e) => { e.stopPropagation(); updateFansubMeta(name, "nyaaCategory", "1_3"); }}
                          >
                            Non-English (1_3)
                          </button>
                          <button
                            className={`${styles.metaToggle} ${category === "1_2" ? styles.metaToggleActive : ""}`}
                            onClick={(e) => { e.stopPropagation(); updateFansubMeta(name, "nyaaCategory", "1_2"); }}
                          >
                            English-Translated (1_2)
                          </button>
                        </div>
                      )}
                      {category === "1_2" && (
                        <div className={styles.metaRow}>
                          <span className={styles.metaLabel}>Resolución:</span>
                          <button
                            className={`${styles.metaToggle} ${useResolutionFilter ? styles.metaToggleActive : ""}`}
                            onClick={(e) => { e.stopPropagation(); updateFansubMeta(name, "useResolutionFilter", true); }}
                          >
                            Filtrar
                          </button>
                          <button
                            className={`${styles.metaToggle} ${!useResolutionFilter ? styles.metaToggleActive : ""}`}
                            onClick={(e) => { e.stopPropagation(); updateFansubMeta(name, "useResolutionFilter", false); }}
                          >
                            Sin filtro
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.addCustomRow}>
            <input
              type="text"
              className={styles.customInput}
              placeholder="Nombre exacto del grupo (ej: SubsPlease)"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className={styles.addBtn} onClick={handleAddCustom} disabled={!customInput.trim()}>
              AGREGAR
            </button>
          </div>
        </div>

        {/* Sección 2: Fansub principal */}
        {selected.length > 0 && (
          <div className={styles.principalSection}>
            <div className={styles.principalHeader}>
              <span className={styles.starIcon}>⭐</span>
              <span className={styles.principalLabel}>FANSUB PRINCIPAL</span>
            </div>
            <div className={styles.principalGrid}>
              {selected.map((name) => (
                <label key={name} className={`${styles.radioItem} ${principal === name ? styles.radioActive : ""}`}>
                  <input
                    type="radio"
                    name="principal-fansub"
                    checked={principal === name}
                    onChange={() => setPrincipal(name)}
                    className={styles.radioInput}
                  />
                  <span className={styles.radioLabel}>{name}</span>
                </label>
              ))}
            </div>
            <p className={styles.principalHint}>
              Es MUY RECOMENDABLE configurar un fansub principal. Sin él, la app no podrá detectar automáticamente
              nuevos episodios disponibles ni mostrar botones de descarga en tu lista de animes.
            </p>
          </div>
        )}

        {/* Sección 3: Resolución */}
        <div className={styles.section}>
          <div className={styles.principalHeader}>
            <span className={styles.starIcon}>📺</span>
            <span className={styles.principalLabel}>RESOLUCIÓN PREFERIDA</span>
          </div>
          <div className={styles.resolutionGrid}>
            {SUPPORTED_RESOLUTIONS.map((res) => (
              <label key={res} className={`${styles.radioItem} ${resolution === res ? styles.radioActive : ""}`}>
                <input
                  type="radio"
                  name="resolution-select"
                  checked={resolution === res}
                  onChange={() => setResolution(res)}
                  className={styles.radioInput}
                />
                <span className={styles.radioLabel}>{res}</span>
              </label>
            ))}
          </div>
          <p className={styles.principalHint}>
            Zoku usará esta calidad para que los resultados en <strong>Recent</strong> sean más precisos y puedas encontrar episodios de hace varios días fácilmente.
          </p>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {selected.length > 0 && !principal && (
            <p className={styles.warningText}>⚠ Sin fansub principal, la detección automática de episodios no funcionará</p>
          )}
          <button className={styles.saveBtn} onClick={handleSave} disabled={selected.length === 0 || saving}>
            {saving ? "GUARDANDO..." : "GUARDAR Y CONTINUAR"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default FansubOnboardingModal;
