import { useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useStore } from "../../hooks/useStore";
import { getPrincipalFansub, getAllFansubs } from "../../utils/torrentConfig";
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
    // 1. Resolución descendente
    const resA = RESOLUTION_ORDER[a.resolution] ?? 0;
    const resB = RESOLUTION_ORDER[b.resolution] ?? 0;
    if (resA !== resB) return resB - resA;

    // 2. No HEVC primero
    if (a.is_hevc !== b.is_hevc) {
      return a.is_hevc ? 1 : -1;
    }

    return 0;
  });
}

function TorrentDownloadModal({ isOpen, onClose, animeTitle, items = [], malId }) {
  const { data: storeData, setMyAnimes } = useStore();
  const modalRef = useRef(null);

  const principalFansub = getPrincipalFansub(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings).map((f) => f.name.toLowerCase());

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Trap focus (basic)
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  let groupedItems = [];
  let isPrincipalGrouped = false;

  if (principalFansub) {
    isPrincipalGrouped = true;
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

    const sortedPrincipal = sortItems(principalItems);

    // Identificar recomendado
    let recommendedSet = false;
    const finalPrincipal = sortedPrincipal.map((item) => {
      if (!recommendedSet && (item.resolution === "1080p" || item.resolution === "2160p")) {
        recommendedSet = true;
        return { ...item, isRecommended: true };
      }
      return item;
    });

    if (finalPrincipal.length > 0)
      groupedItems.push({ title: `${principalFansub}`, isPrincipal: true, items: finalPrincipal });

    // Agrupar secundarios por fansub
    const secGroups = {};
    secondaryItems.forEach((item) => {
      if (!secGroups[item.fansub]) secGroups[item.fansub] = [];
      secGroups[item.fansub].push(item);
    });
    Object.keys(secGroups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(secGroups[fansub]) });
    });

    // Agrupar otros por fansub
    const otherGroups = {};
    otherItems.forEach((item) => {
      if (!otherGroups[item.fansub]) otherGroups[item.fansub] = [];
      otherGroups[item.fansub].push(item);
    });
    Object.keys(otherGroups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(otherGroups[fansub]) });
    });
  } else {
    // Si no hay principal, mostrar todo en una sola lista agrupada por fansub pero sin orden especial de grupos
    const groups = {};
    items.forEach((item) => {
      if (!groups[item.fansub]) groups[item.fansub] = [];
      groups[item.fansub].push(item);
    });
    Object.keys(groups).forEach((fansub) => {
      groupedItems.push({ title: fansub, isPrincipal: false, items: sortItems(groups[fansub]) });
    });
  }

  const handleOpenLink = async (url) => {
    if (!url) return;
    try {
      if (url.startsWith("magnet:")) {
        window.location.href = url;
      } else {
        await open(url);
      }
    } catch (e) {
      console.error("Error opening link:", e);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleLinkAlias = async () => {
    if (!malId || items.length === 0) return;
    try {
      // Extraemos el nombre base del primer resultado (o del que el usuario elija)
      // Como heurística usamos el primer item del grupo principal si existe, sino el primero
      const firstItem = items[0];
      const rawTitle = firstItem.title;
      
      // Limpieza agresiva para obtener solo el nombre de la serie
      let cleanAlias = rawTitle
        .replace(/^\[[^\]]+\]\s*/, "") // Fansub
        .replace(/[ \-_.]+v?\u\d+.*$/i, "") // Versión y episodio
        .replace(/\b(2160p|1080p|720p|480p|360p)\b/gi, "")
        .replace(/\b(HEVC|x265|x264|h265|h264|10bit|8bit)\b/gi, "")
        .replace(/[[\(][a-f0-9]{8}[\]\)]/gi, "") // CRC
        .replace(/\s+/g, " ")
        .trim();

      // Quitamos el número de episodio si quedó suelto al final
      cleanAlias = cleanAlias.replace(/\s+\d+$/, "").trim();

      await setMyAnimes((prev) => {
        const updated = { ...prev };
        if (updated[malId]) {
          updated[malId] = {
            ...updated[malId],
            torrentAlias: cleanAlias,
            lastUpdated: new Date().toISOString(),
          };
        }
        return updated;
      });
      alert(`¡Vinculado! Zoku usará "${cleanAlias}" para buscar automáticamente esta serie en el futuro.`);
    } catch (e) {
      console.error("Error linking alias:", e);
    }
  };

  const currentAlias = malId ? storeData.myAnimes[malId]?.torrentAlias : null;

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal} tabIndex="-1" ref={modalRef}>
        <div className={styles.header}>
          <div className={styles.titleContainer}>
            <h2 className={styles.title}>DESCUBRIR EN NYAA</h2>
            <p className={styles.subtitle}>{animeTitle}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {malId && !currentAlias && items.length > 0 && (
          <div className={styles.aliasProposal}>
            <div className={styles.aliasInfo}>
              <span className={styles.aliasIcon}>💡</span>
              <div className={styles.aliasTexts}>
                <span className={styles.aliasTitle}>¿Vinculamos este nombre?</span>
                <p className={styles.aliasDesc}>
                  Si vinculás el nombre de Nyaa con esta serie, Zoku podrá encontrar y avisarte de nuevos episodios automáticamente en el futuro, sin que tengas que buscar a mano.
                </p>
              </div>
            </div>
            <button className={styles.linkBtn} onClick={handleLinkAlias}>
              VINCULAR NOMBRE DE SERIE
            </button>
          </div>
        )}

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
                      <div key={idx} className={`${styles.item} ${item.isRecommended ? styles.recommendedItem : ""}`}>
                        {item.isRecommended && <div className={styles.recommendedBadge}>RECOMENDADO</div>}

                        <div className={styles.itemTitle}>{item.title}</div>

                        <div className={styles.itemInfo}>
                          <span className={styles.itemRes}>{item.resolution}</span>
                          {item.is_hevc && <span className={styles.itemHevc}>HEVC</span>}
                          <span className={styles.itemSize}>• {item.size}</span>
                          <span className={styles.itemStats}>
                            • S:
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
                            onClick={() => handleOpenLink(item.magnet)}
                            title={!item.magnet ? "Sin magnet disponible" : "Abrir enlace Magnet"}
                          >
                            🧲 Magnet
                          </button>
                          <button
                            className={styles.actionBtn}
                            disabled={!item.download_url}
                            onClick={() => handleOpenLink(item.download_url)}
                            title={!item.download_url ? "Sin torrent disponible" : "Descargar archivo .torrent"}
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
      </div>
    </div>
  );
}

export default TorrentDownloadModal;
