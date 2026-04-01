import { useNavigate } from "react-router-dom";
import { useStore } from "../../hooks/useStore";
import { extractBaseTitle } from "../../services/fileSystem";
import { getAllFansubs, getPrincipalFansub } from "../../utils/torrentConfig";
import Modal from "./Modal";
import styles from "./FansubOnboardingModal.module.css";

function TorrentSearchModal({ isOpen, onClose, animeTitle, epNumber, malId }) {
  const { data: storeData } = useStore();
  const navigate = useNavigate();

  const principalFansub = getPrincipalFansub(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings);

  const handleSelectFansub = (fansubName) => {
    const cleanTitle = extractBaseTitle(animeTitle || "");
    const query = `${cleanTitle || animeTitle} ${epNumber}`;
    navigate("/torrents", {
      state: {
        activeTab: fansubName,
        activeQuery: query,
        searchInput: query,
        malId: malId,
        animeTitle: animeTitle,
      },
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="BÚSQUEDA MANUAL"
      subtitle={`¿En qué grupo querés buscar el Episodio ${epNumber} de ${animeTitle}?`}
    >
      <div className={styles.section} style={{ padding: 0 }}>
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
    </Modal>
  );
}

export default TorrentSearchModal;
