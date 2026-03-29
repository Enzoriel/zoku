import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../hooks/useStore";
import { getAllFansubs, getPrincipalFansub } from "../../utils/torrentConfig";
import styles from "./FansubOnboardingModal.module.css"; // Reutilizamos estilos base

function TorrentSearchModal({ isOpen, onClose, animeTitle, epNumber }) {
  const { data: storeData } = useStore();
  const navigate = useNavigate();
  const modalRef = useRef(null);

  const principalFansub = getPrincipalFansub(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectFansub = (fansubName) => {
    // Formar la query exact para Nyaa.
    const query = `${animeTitle} ${epNumber}`;
    // Navegar y pasar el estado
    navigate("/torrents", {
      state: {
        activeTab: fansubName,
        activeQuery: query,
        searchInput: query,
      },
    });
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleBackdropClick} style={{ zIndex: 99999 }}>
      <div className={styles.modal} tabIndex="-1" ref={modalRef} style={{ maxWidth: "450px" }}>
        <div className={styles.header}>
          <h2 className={styles.title} style={{ color: "var(--px-yellow)" }}>BUSQUEDA MANUAL</h2>
          <p className={styles.subtitle}>
            ¿En qué grupo querés buscar el Episodio {epNumber} de <strong>{animeTitle}</strong>?
          </p>
        </div>

        <div className={styles.section}>
          <div className={styles.fansubGrid} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {principalFansub && (
              <button
                className={styles.fansubChip}
                style={{ justifyContent: "space-between", borderColor: "var(--px-cyan)", color: "var(--px-cyan)", background: "rgba(0, 245, 255, 0.05)" }}
                onClick={() => handleSelectFansub(principalFansub)}
              >
                <span>{principalFansub}</span>
                <span style={{ fontSize: "10px" }}>⭐ PRINCIPAL</span>
              </button>
            )}

            {allFansubs
              .filter((f) => f.name !== principalFansub)
              .map((f) => (
                <button
                  key={f.name}
                  className={styles.fansubChip}
                  style={{ justifyContent: "space-between" }}
                  onClick={() => handleSelectFansub(f.name)}
                >
                  <span>{f.name}</span>
                  <span style={{ fontSize: "10px", color: "var(--px-text-dim)" }}>ALTERNO</span>
                </button>
              ))}

            <button
              className={styles.fansubChip}
              style={{ justifyContent: "space-between", marginTop: "12px", borderStyle: "dashed" }}
              onClick={() => handleSelectFansub("general")}
            >
              <span>Buscar en todo Nyaa</span>
              <span>🌐</span>
            </button>
          </div>
        </div>

        <div className={styles.footer} style={{ marginTop: "10px" }}>
          <button className={styles.saveBtn} onClick={onClose} style={{ background: "transparent", color: "var(--px-text-dim)", border: "1px solid var(--px-border)", boxShadow: "none" }}>
            CANCELAR
          </button>
        </div>
      </div>
    </div>
  );
}

export default TorrentSearchModal;
