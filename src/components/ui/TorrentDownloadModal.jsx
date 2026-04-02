import { openUrl } from "@tauri-apps/plugin-opener";
import { useLibrary } from "../../context/LibraryContext";
import { useTorrent } from "../../context/TorrentContext";
import { useStore } from "../../hooks/useStore";
import { extractBaseTitle } from "../../services/fileSystem";
import { extractAliasFromTitle } from "../../utils/torrentMatch";
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
    if (a.is_hevc !== b.is_hevc) return a.is_hevc ? -1 : 1;
    return 0;
  });
}

function TorrentDownloadModal({ isOpen, onClose, animeTitle, items = [], malId }) {
  const { data: storeData, setMyAnimes } = useStore();
  const { performSync } = useLibrary();
  const { refresh: refreshTorrentFeed } = useTorrent();

  const principalFansub = getPrincipalFansub(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings).map((f) => f.name.toLowerCase());

  let groupedItems = [];

  if (principalFansub) {
    const principalItems = [];
    const secondaryItems = [];
    const otherItems = [];

    items.forEach((item) => {
      const fansub = item.fansub.toLowerCase();
      if (fansub === principalFansub.toLowerCase()) {
        principalItems.push(item);
      } else if (allFansubs.includes(fansub)) {
        secondaryItems.push(item);
      } else {
        otherItems.push(item);
      }
    });

    if (principalItems.length > 0) {
      groupedItems.push({ title: principalFansub, isPrincipal: true, items: sortItems(principalItems) });
    }

    const secondaryGroups = {};
    secondaryItems.forEach((item) => {
      if (!secondaryGroups[item.fansub]) secondaryGroups[item.fansub] = [];
      secondaryGroups[item.fansub].push(item);
    });
    Object.keys(secondaryGroups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(secondaryGroups[fansub]) });
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

  const handleLinkAliasSilently = async (selectedItem) => {
    if (!malId || !selectedItem?.title) return;

    try {
      const cleanAlias = extractAliasFromTitle(selectedItem.title);
      const diskAlias = extractBaseTitle(selectedItem.title);
      if (!cleanAlias && !diskAlias) return;

      await setMyAnimes((prev) => {
        const updated = { ...prev };
        if (updated[malId]) {
          if (
            updated[malId].torrentAlias === cleanAlias &&
            updated[malId].torrentTitle === selectedItem.title &&
            updated[malId].diskAlias === diskAlias
          ) {
            return prev;
          }

          updated[malId] = {
            ...updated[malId],
            torrentAlias: cleanAlias,
            torrentTitle: selectedItem.title,
            diskAlias,
            lastUpdated: new Date().toISOString(),
          };
        }
        return updated;
      });
    } catch (e) {
      console.error("Error linking alias silently:", e);
    }
  };

  const persistDownloadIntent = async () => {
    if (!malId) return;

    try {
      await setMyAnimes((prev) => {
        const current = prev[malId];
        if (!current) return prev;

        return {
          ...prev,
          [malId]: {
            ...current,
            downloadIntentAt: new Date().toISOString(),
            downloadTrackingMode: null,
            lastUpdated: new Date().toISOString(),
          },
        };
      });
    } catch (e) {
      console.error("Error persisting download intent:", e);
    }
  };

  const handleDownloadAction = async (url, selectedItem) => {
    if (!url) return;

    await persistDownloadIntent();
    await handleLinkAliasSilently(selectedItem);
    await performSync();

    try {
      await openUrl(url);
    } catch (e) {
      console.error("[Download] openUrl failed, trying browser fallback:", e);
      if (url.startsWith("magnet:")) {
        window.location.href = url;
      } else {
        window.open(url, "_blank");
      }
    }

    try {
      await refreshTorrentFeed();
    } catch (refreshError) {
      console.error("[Download] torrent feed refresh failed:", refreshError);
    }

    setTimeout(() => {
      void performSync();
    }, 1500);

    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="DESCUBRIR EN NYAA" subtitle={animeTitle}>
      <div className={styles.content}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No hay opciones de descarga disponibles para este episodio.</p>
          </div>
        ) : (
          <>
            {!principalFansub && (
              <div className={styles.warningBox}>
                Configura un fansub principal en Ajustes para ver las opciones organizadas.
              </div>
            )}

            {groupedItems.map((group, gIdx) => (
              <div key={gIdx} className={`${styles.group} ${group.isPrincipal ? styles.principalGroup : ""}`}>
                <div className={styles.groupHeader}>
                  <span className={styles.groupTitle}>{group.title}</span>
                  {group.isPrincipal && <span className={styles.groupBadge}>PRINCIPAL</span>}
                </div>

                <div className={styles.itemList}>
                  {group.items.map((item, idx) => (
                    <div key={item.info_hash || item.download_url || item.magnet || `${item.title}-${idx}`} className={styles.item}>
                      <div className={styles.itemTitle}>{item.title !== animeTitle && item.title}</div>

                      <div className={styles.itemInfo}>
                        <span className={styles.itemRes}>{item.resolution}</span>
                        {item.is_hevc && <span className={styles.itemHevc}>HEVC</span>}
                        <span className={styles.itemSize}>- {item.size}</span>
                        <span className={styles.itemStats}>
                          - S:
                          <span
                            className={
                              item.seeders >= 10
                                ? styles.seedersHigh
                                : item.seeders > 0
                                  ? styles.seedersMed
                                  : styles.seedersLow
                            }
                          >
                            {item.seeders}
                          </span>{" "}
                          L:{item.leechers}
                        </span>
                      </div>

                      <div className={styles.itemActions}>
                        <button
                          className={styles.actionBtn}
                          disabled={!item.magnet}
                          onClick={() => handleDownloadAction(item.magnet, item)}
                        >
                          Magnet
                        </button>
                        <button
                          className={styles.actionBtn}
                          disabled={!item.download_url}
                          onClick={() => handleDownloadAction(item.download_url, item)}
                        >
                          .torrent
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
