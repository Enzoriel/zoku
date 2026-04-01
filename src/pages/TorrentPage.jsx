import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { open } from "@tauri-apps/plugin-shell";
import { useStore } from "../hooks/useStore";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import { hasConfiguredFansubs, getAllFansubs, getPrincipalFansub, getPreferredResolution } from "../utils/torrentConfig";
import { fetchNyaaFeed } from "../services/nyaa";
import FansubOnboardingModal from "../components/ui/FansubOnboardingModal";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import styles from "./TorrentPage.module.css";

function TorrentPage() {
  const location = useLocation();
  const { data: storeData } = useStore();
  const {
    data: contextItems,
    isLoading: contextLoading,
    error: contextError,
    lastFetch: contextLastFetch,
    refresh: contextRefresh,
  } = useTorrent();

  const hasConfig = hasConfiguredFansubs(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings);
  const principalFansub = getPrincipalFansub(storeData.settings);
  const preferredRes = useMemo(() => getPreferredResolution(storeData.settings), [storeData.settings]);

  const [activeTab, setActiveTab] = useState(location.state?.activeTab || "general");
  const [searchInput, setSearchInput] = useState(location.state?.searchInput || "");
  const [activeQuery, setActiveQuery] = useState(() => {
    if (location.state?.activeQuery) return location.state.activeQuery;
    if (location.state?.animeTitle) {
      const episode = location.state?.epNumber;
      const baseQuery = episode ? `${location.state.animeTitle} ${episode}` : location.state.animeTitle;
      return baseQuery.toLowerCase().includes(preferredRes.toLowerCase()) ? baseQuery : `${baseQuery} ${preferredRes}`;
    }
    return "";
  });

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalItems, setModalItems] = useState([]);
  const [modalTitle, setModalTitle] = useState("");

  const { toast, showToast } = useToast();
  const requestIdRef = useRef(0);

  const targetAnimeId = location.state?.malId;
  const targetAnimeTitle = location.state?.animeTitle;
  const showSearchOptions = activeTab !== "general" && searchInput.trim() !== "";
  const isContextBackedTab = activeTab === principalFansub && activeQuery === "";

  const fetchTorrents = useCallback(async (tab, query, force = false) => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchNyaaFeed({
        fansub: tab === "general" ? "" : tab,
        query,
        force,
      });

      if (requestId !== requestIdRef.current) return;
      setItems(result.data);
      setLastFetchTime(result.timestamp);
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return;
      console.error("[TorrentPage] Fetch error:", fetchError);
      setError(typeof fetchError === "string" ? fetchError : "Error de conexion con Nyaa.");
      setItems([]);
    } finally {
      if (requestId !== requestIdRef.current) return;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasConfig) return;

    if (isContextBackedTab) {
      setItems(contextItems || []);
      setError(contextError);
      setLastFetchTime(contextLastFetch);
      setIsLoading(contextLoading);
      return;
    }

    fetchTorrents(activeTab, activeQuery);
  }, [
    activeTab,
    activeQuery,
    contextError,
    contextItems,
    contextLastFetch,
    contextLoading,
    fetchTorrents,
    hasConfig,
    isContextBackedTab,
  ]);

  const handleTabClick = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSearchInput("");
    setActiveQuery("");
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter" && !showSearchOptions) {
      setActiveQuery(searchInput.trim());
    }
  };

  const handleSearchCurrentTab = () => {
    setActiveQuery(searchInput.trim());
  };

  const handleSearchAll = () => {
    setActiveTab("general");
    setActiveQuery(searchInput.trim());
  };

  const handleRefresh = () => {
    if (isContextBackedTab) {
      contextRefresh();
      return;
    }
    fetchTorrents(activeTab, activeQuery, true);
  };

  const handleOpenLink = async (url) => {
    if (!url) return;
    try {
      await open(url);
    } catch (openError) {
      console.error("Error opening link:", openError);
    }
  };

  const handleDownloadClick = (item) => {
    setModalItems([item]);
    setModalTitle(item.title);
    setModalOpen(true);
  };

  const formattedTime = useMemo(() => {
    if (!lastFetchTime) return "Nunca";
    const date = new Date(lastFetchTime);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [lastFetchTime]);

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return dateString;
    }
  };

  if (!hasConfig) {
    return <FansubOnboardingModal onComplete={() => {}} />;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>TORRENTS</h1>
        <button className={styles.refreshBtn} onClick={handleRefresh} disabled={isLoading} title="Refrescar">
          <span className={isLoading ? styles.spin : ""}>↻</span>
          <span className={styles.refreshText}>Actualizado: {formattedTime}</span>
        </button>
      </header>

      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tabBtn} ${activeTab === "general" ? styles.tabActive : ""}`}
          onClick={() => handleTabClick("general")}
        >
          General
        </button>
        {allFansubs.map((fansub) => (
          <button
            key={fansub.name}
            className={`${styles.tabBtn} ${activeTab === fansub.name ? styles.tabActive : ""}`}
            onClick={() => handleTabClick(fansub.name)}
          >
            {fansub.name} {fansub.principal && <span className={styles.starIcon}>⭐</span>}
          </button>
        ))}
      </div>

      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={activeTab === "general" ? "Buscar en todo Nyaa..." : `Buscar en ${activeTab}...`}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {!showSearchOptions && (
            <button className={styles.searchBtn} onClick={handleSearchCurrentTab} disabled={!searchInput.trim() || isLoading}>
              Buscar
            </button>
          )}
        </div>

        {showSearchOptions && (
          <div className={styles.searchOptionsBox}>
            <button className={styles.searchOptionBtn} onClick={handleSearchCurrentTab} disabled={isLoading}>
              Buscar "{searchInput}" en <strong>{activeTab}</strong>
            </button>
            <button className={styles.searchOptionBtn} onClick={handleSearchAll} disabled={isLoading}>
              Buscar "{searchInput}" en <strong>todo Nyaa</strong>
            </button>
          </div>
        )}
      </div>

      <div className={styles.resultsContainer}>
        {isLoading ? (
          <div className={styles.skeletonContainer} aria-busy="true">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className={styles.skeletonRow} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.errorState} role="alert" aria-live="assertive">
            <p>{error}</p>
            <button className={styles.retryBtn} onClick={handleRefresh}>
              REINTENTAR
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No se encontraron resultados.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colTitle}>Titulo</th>
                  <th className={styles.colFansub}>Fansub</th>
                  <th className={styles.colSize}>Tamaño</th>
                  <th className={styles.colSeeders}>S / L</th>
                  <th className={styles.colDate}>Fecha</th>
                  <th className={styles.colAction}>Descarga</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index} className={styles.tableRow}>
                    <td className={styles.colTitle}>
                      <button
                        type="button"
                        className={styles.titleClickable}
                        title={item.title}
                        onClick={() => handleOpenLink(item.view_url)}
                      >
                        {item.title}
                      </button>
                    </td>
                    <td className={styles.colFansub}>
                      <span className={styles.badge}>{item.fansub}</span>
                    </td>
                    <td className={styles.colSize}>{item.size}</td>
                    <td className={styles.colSeeders}>
                      <span
                        className={
                          item.seeders >= 10 ? styles.seedersHigh : item.seeders > 0 ? styles.seedersMed : styles.seedersLow
                        }
                      >
                        {item.seeders}
                      </span>{" "}
                      / <span className={styles.leechers}>{item.leechers}</span>
                    </td>
                    <td className={styles.colDate}>{formatDate(item.date)}</td>
                    <td className={styles.colAction}>
                      <button
                        className={styles.downloadBtn}
                        onClick={() => handleDownloadClick(item)}
                        aria-label={`Descargar ${item.title}`}
                        title="Descargar torrent"
                      >
                        ↓
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TorrentDownloadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        animeTitle={targetAnimeTitle || modalTitle}
        items={modalItems}
        malId={targetAnimeId}
        showToast={showToast}
      />

      {toast && (
        <div className={styles.toast} data-type={toast.type} role="alert" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default TorrentPage;
