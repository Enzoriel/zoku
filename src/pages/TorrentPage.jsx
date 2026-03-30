import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useStore } from "../hooks/useStore";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import { hasConfiguredFansubs, getAllFansubs, getPrincipalFansub, getPreferredResolution } from "../utils/torrentConfig";
import FansubOnboardingModal from "../components/ui/FansubOnboardingModal";
import TorrentDownloadModal from "../components/ui/TorrentDownloadModal";
import styles from "./TorrentPage.module.css";

// Simple in-memory cache
const resultCache = new Map();
const CACHE_DURATION = 10 * 60 * 1000;

function TorrentPage() {
  const location = useLocation();
  const { data: storeData } = useStore();
  const { refresh: contextRefresh } = useTorrent();

  // Fansub settings
  const hasConfig = hasConfiguredFansubs(storeData.settings);
  const allFansubs = getAllFansubs(storeData.settings);
  const principalFansub = getPrincipalFansub(storeData.settings);
  const preferredRes = useMemo(() => getPreferredResolution(storeData.settings), [storeData.settings]);

  // States
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || "general");
  const [searchInput, setSearchInput] = useState(location.state?.searchInput || "");
  const [activeQuery, setActiveQuery] = useState(() => {
    if (location.state?.activeQuery) return location.state.activeQuery;
    if (location.state?.animeTitle) {
      const ep = location.state?.epNumber;
      const q = ep ? `${location.state.animeTitle} ${ep}` : location.state.animeTitle;
      return q.toLowerCase().includes(preferredRes.toLowerCase()) ? q : `${q} ${preferredRes}`;
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

  const targetAnimeId = location.state?.malId;
  const targetAnimeTitle = location.state?.animeTitle;

  const showSearchOptions = activeTab !== "general" && searchInput.trim() !== "";

  const fetchTorrents = useCallback(async (tab, query, force = false) => {
    setIsLoading(true);
    setError(null);

    const isSearch = query !== "";
    const fansubParam = tab === "general" ? "" : tab;
    const cacheKey = `${tab}:${query}`;

    // Use cache if not forcing and not a search, or if recent
    if (!force && !isSearch && resultCache.has(cacheKey)) {
      const cached = resultCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        setItems(cached.data);
        setLastFetchTime(cached.timestamp);
        setIsLoading(false);
        return;
      }
    }

    try {
      const result = await invoke("fetch_nyaa", { query, fansub: fansubParam });
      setItems(result || []);
      const now = Date.now();
      setLastFetchTime(now);
      
      // Save to cache
      if (!isSearch) {
        resultCache.set(cacheKey, { data: result || [], timestamp: now });
      }
    } catch (e) {
      console.error("[TorrentPage] Fetch error:", e);
      setError(typeof e === "string" ? e : "Error de conexión con Nyaa.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when tab or query changes
  useEffect(() => {
    if (hasConfig) {
      fetchTorrents(activeTab, activeQuery);
    }
  }, [activeTab, activeQuery, hasConfig, fetchTorrents]);

  const handleTabClick = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSearchInput("");
    setActiveQuery("");
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      if (!showSearchOptions) {
        setActiveQuery(searchInput.trim());
      }
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
    fetchTorrents(activeTab, activeQuery, true);
    if (activeTab === principalFansub) {
      contextRefresh();
    }
  };


  const handleOpenLink = async (url) => {
    if (!url) return;
    try {
      await open(url);
    } catch (e) {
      console.error("Error opening link:", e);
    }
  };

  const handleDownloadClick = (item) => {
    setModalItems([item]);
    setModalTitle(item.title);
    setModalOpen(true);
  };

  const formattedTime = useMemo(() => {
    if (!lastFetchTime) return "Nunca";
    const d = new Date(lastFetchTime);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, [lastFetchTime]);

  const formatDate = (dateString) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateString;
    }
  };

  // Guard: Required Onboarding
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
        {allFansubs.map((f) => (
          <button
            key={f.name}
            className={`${styles.tabBtn} ${activeTab === f.name ? styles.tabActive : ""}`}
            onClick={() => handleTabClick(f.name)}
          >
            {f.name} {f.principal && <span className={styles.starIcon}>⭐</span>}
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
            onChange={(e) => setSearchInput(e.target.value)}
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
          <div className={styles.skeletonContainer}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.errorState}>
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
                  <th className={styles.colTitle}>Título</th>
                  <th className={styles.colFansub}>Fansub</th>
                  <th className={styles.colSize}>Tamaño</th>
                  <th className={styles.colSeeders}>S / L</th>
                  <th className={styles.colDate}>Fecha</th>
                  <th className={styles.colAction}>Descarga</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className={styles.tableRow}>
                    <td className={styles.colTitle}>
                      <span
                        className={styles.titleClickable}
                        title={item.title}
                        onClick={() => handleOpenLink(item.view_url)}
                      >
                        {item.title}
                      </span>
                    </td>
                    <td className={styles.colFansub}>
                      <span className={styles.badge}>{item.fansub}</span>
                    </td>
                    <td className={styles.colSize}>{item.size}</td>
                    <td className={styles.colSeeders}>
                      <span className={item.seeders >= 10 ? styles.seedersHigh : item.seeders > 0 ? styles.seedersMed : styles.seedersLow}>
                        {item.seeders}
                      </span>{" "}
                      / <span className={styles.leechers}>{item.leechers}</span>
                    </td>
                    <td className={styles.colDate}>{formatDate(item.date)}</td>
                    <td className={styles.colAction}>
                      <button className={styles.downloadBtn} onClick={() => handleDownloadClick(item)}>
                        ⬇
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
        <div className={styles.toast} data-type={toast.type}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default TorrentPage;
