import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../../hooks/useStore";
import { getPrincipalFansub, getAllFansubs } from "../../utils/torrentConfig";
import Modal from "./Modal";
import styles from "./TorrentDownloadModal.module.css";

const RESOLUTION_ORDER = {
  "2160p": 5,
  "1080p": 4,
  "720p": 3,
  "480p": 2,
  "360p": 1,
  Unknown: 0,
};

function sortItems(items) {
  return [...items].sort((a, b) => {
    const resA = RESOLUTION_ORDER[a.resolution] ?? 0;
    const resB = RESOLUTION_ORDER[b.resolution] ?? 0;
    if (resA !== resB) return resB - resA;
    if (a.is_hevc !== b.is_hevc) return a.is_hevc ? 1 : -1;
    return 0;
  });
}

function TorrentDownloadModal({ isOpen, onClose, animeTitle, items = [], malId, showToast }) {
  const { data: storeData, setMyAnimes } = useStore();

  const principalFansub = getPrincipalFansub(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings).map((f) => f.name.toLowerCase());

  let groupedItems = [];
  
  if (principalFansub) {
    const principalItems = [];
    const secondaryItems = [];
    const otherItems = [];

    items.forEach((item) => {
      const f = item.fansub.toLowerCase();
      if (f === principalFansub.toLowerCase()) {
        principalItems.push(item);
      } else if (allFansubs.includes(f)) {
        secondaryItems.push(item);
      } else {
        otherItems.push(item);
      }
    });

    if (principalItems.length > 0)
      groupedItems.push({ title: `${principalFansub}`, isPrincipal: true, items: sortItems(principalItems) });

    const secGroups = {};
    secondaryItems.forEach((item) => {
      if (!secGroups[item.fansub]) secGroups[item.fansub] = [];
      secGroups[item.fansub].push(item);
    });
    Object.keys(secGroups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(secGroups[fansub]) });
    });

    const otherGroups = {};
    otherItems.forEach((item) => {
      if (!otherGroups[item.fansub]) otherGroups[item.fansub] = [];
      otherGroups[item.fansub].push(item);
    });
    Object.keys(otherGroups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(otherGroups[fansub]) });
    });
  } else {
    const groups = {};
    items.forEach((item) => {
      if (!groups[item.fansub]) groups[item.fansub] = [];
      groups[item.fansub].push(item);
    });
    Object.keys(groups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(groups[fansub]) });
    });
  }

  const handleLinkAliasSilently = async () => {
    if (!malId || items.length === 0) return;
    try {
      const firstItem = items[0];
      const rawTitle = firstItem.title;
      const fansubMatch = rawTitle.match(/^(\[[^\]]+\])/);
      const fansubPart = fansubMatch ? fansubMatch[1] : "";
      let titlePart = rawTitle
        .replace(/^\[[^\]]+\]\s*/, "")
        .replace(/\s*-\s*\d+.*$/, "")
        .replace(/\s*-\s*v\d+.*$/, "")
        .replace(/\s+\d+.*$/, "")
        .replace(/[\[\(].*$/, "")
        .trim();

      const cleanAlias = fansubPart ? `${fansubPart} ${titlePart}` : titlePart;

      await setMyAnimes((prev) => {
        const updated = { ...prev };
        if (updated[malId]) {
          if (updated[malId].torrentAlias === cleanAlias) return prev;
          updated[malId] = {
            ...updated[malId],
            torrentAlias: cleanAlias,
            lastUpdated: new Date().toISOString(),
          };
        }
        return updated;
      });
    } catch (e) {
      console.error("Error linking alias silently:", e);
    }
  };

  const handleDownloadAction = async (url) => {
    if (!url) return;
    
    // Vincular alias automáticamente antes de disparar
    handleLinkAliasSilently();

    try {
      // Usar openUrl del plugin opener de Tauri v2
      // El permiso 'opener:allow-open-url' ya está habilitado en default.json
      await openUrl(url);
    } catch (e) {
      console.error("[Download] Falló openUrl, intentando fallback nativo:", e);
      // Fallback a window.location.href para magnets o window.open para URLs
      if (url.startsWith("magnet:")) {
        window.location.href = url;
      } else {
        window.open(url, "_blank");
      }
    }

    // Delay para asegurar que el sistema operativo reciba la instrucción antes de cerrar el modal
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="DESCUBRIR EN NYAA"
      subtitle={animeTitle}
    >
      <div className={styles.content}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No hay opciones de descarga disponibles para este episodio.</p>
          </div>
        ) : (
          <>
            {!principalFansub && (
              <div className={styles.warningBox}>
                ⚠ Configurá un fansub principal en Ajustes para ver las opciones organizadas.
              </div>
            )}

            {groupedItems.map((group, gIdx) => (
              <div key={gIdx} className={`${styles.group} ${group.isPrincipal ? styles.principalGroup : ""}`}>
                <div className={styles.groupHeader}>
                  <span className={styles.groupTitle}>{group.title}</span>
                  {group.isPrincipal && <span className={styles.groupBadge}>⭐ PRINCIPAL</span>}
                </div>

                <div className={styles.itemList}>
                  {group.items.map((item, idx) => (
                    <div key={idx} className={styles.item}>
                      <div className={styles.itemTitle}>
                        {item.title !== animeTitle && item.title}
                      </div>

                      <div className={styles.itemInfo}>
                        <span className={styles.itemRes}>{item.resolution}</span>
                        {item.is_hevc && <span className={styles.itemHevc}>HEVC</span>}
                        <span className={styles.itemSize}>• {item.size}</span>
                        <span className={styles.itemStats}>
                          • S:
                          <span className={item.seeders >= 10 ? styles.seedersHigh : item.seeders > 0 ? styles.seedersMed : styles.seedersLow}>
                            {item.seeders}
                          </span>{" "}
                          L:{item.leechers}
                        </span>
                      </div>

                      <div className={styles.itemActions}>
                        <button
                          className={styles.actionBtn}
                          disabled={!item.magnet}
                          onClick={() => handleDownloadAction(item.magnet)}
                        >
                          🧲 Magnet
                        </button>
                        <button
                          className={styles.actionBtn}
                          disabled={!item.download_url}
                          onClick={() => handleDownloadAction(item.download_url)}
                        >
                          ⬇ .torrent
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

export default TorrentDownloadModal;
