import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../hooks/useStore";
import { useTorrent } from "../context/TorrentContext";
import { useToast } from "../hooks/useToast";
import {
  hasConfiguredFansubs,
  getPrincipalFansub,
  getPreferredResolution,
  getFansubsByLanguage,
  isSpanishUser,
  getCategoryForTab,
} from "../utils/torrentConfig";
import { fetchNyaaFeed, getCachedNyaaFeed } from "../services/nyaa";
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
  const userIsSpanish = isSpanishUser(storeData.settings);
  const principalFansub = getPrincipalFansub(storeData.settings);
  const preferredRes = useMemo(() => getPreferredResolution(storeData.settings), [storeData.settings]);

  // English/Spanish mode
  const [langMode, setLangMode] = useState("en");

  // Spanish suffix toggle: "esp", "spa", or null
  const [spanishSuffix, setSpanishSuffix] = useState(null);

  // Visible fansubs filtered by language
  const visibleFansubs = useMemo(() => {
    return getFansubsByLanguage(storeData.settings, langMode);
  }, [storeData.settings, langMode]);

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

  const { toast } = useToast();
  const requestIdRef = useRef(0);
  const searchInputRef = useRef(null);

  const targetAnimeId = location.state?.malId;
  const targetAnimeTitle = location.state?.animeTitle;

  // Context tab: principal fansub + no query + english mode
  const isContextBackedTab = activeTab === principalFansub && activeQuery === "" && langMode === "en";

  // Strip resolution from query for Spanish searches
  const stripResolution = useCallback((query) => {
    return query
      .replace(/\b(?:2160p|1080p|720p|480p|360p)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const fetchTorrents = useCallback(
    async (tab, query, force = false) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);

      const category = getCategoryForTab(storeData.settings, tab, principalFansub, langMode);

      try {
        const result = await fetchNyaaFeed({
          fansub: tab === "general" ? "" : tab,
          query,
          category,
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
    },
    [langMode, principalFansub, storeData.settings],
  );

  // Build the full query for current mode/tab/suffix
  const buildFullQuery = useCallback(() => {
    const baseQuery = langMode === "es" ? stripResolution(activeQuery) : activeQuery;
    // Spanish mode: add suffix if active on General tab
    if (langMode === "es" && spanishSuffix && activeTab === "general") {
      return `${baseQuery} ${spanishSuffix}`.trim();
    }
    // English mode on principal tab: append resolution if user typed a custom query
    if (langMode === "en" && activeTab === principalFansub && baseQuery) {
      return `${baseQuery} ${preferredRes}`.trim();
    }
    return baseQuery;
  }, [langMode, spanishSuffix, activeTab, activeQuery, stripResolution, principalFansub, preferredRes]);

  // Check if there's cached data for a given fetch
  const checkCached = useCallback((fansub, query, category) => {
    const cached = getCachedNyaaFeed({ fansub, query, category });
    return cached ? cached.data : null;
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

    const fullQuery = buildFullQuery();
    const fansub = activeTab === "general" ? "" : activeTab;
    const category = getCategoryForTab(storeData.settings, activeTab, principalFansub, langMode);

    // Check cache first to avoid unnecessary fetches
    const cached = checkCached(fansub, fullQuery, category);
    if (cached) {
      setItems(cached);
      setError(null);
      setIsLoading(false);
      return;
    }

    fetchTorrents(activeTab, fullQuery, false);
  }, [
    activeTab,
    activeQuery,
    spanishSuffix,
    langMode,
    contextError,
    contextItems,
    contextLastFetch,
    contextLoading,
    fetchTorrents,
    hasConfig,
    isContextBackedTab,
    buildFullQuery,
    checkCached,
    principalFansub,
    storeData.settings,
  ]);

  useEffect(() => {
    if (location.state?.searchInput && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, []);

  const handleTabClick = (tab) => {
    // Coming from another tab to General in Spanish mode: reset suffix to esp
    if (tab === "general" && langMode === "es" && activeTab !== "general") {
      setSpanishSuffix((prev) => (prev === null ? "esp" : prev));
    }

    // Already on General and clicking again: toggle esp/spa
    if (tab === "general" && langMode === "es" && activeTab === "general") {
      setSpanishSuffix((prev) => {
        if (prev === null) return "esp";
        return prev === "esp" ? "spa" : "esp";
      });
    }

    // Switching tabs: if input is empty, clear activeQuery so tab shows fresh results
    if (tab !== activeTab && !searchInput.trim()) {
      setActiveQuery("");
    } else if (tab === activeTab && searchInput.trim()) {
      setActiveQuery(searchInput.trim());
    }

    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const trimmed = searchInput.trim();
      setActiveQuery(trimmed);
      // Custom user query: remove suffix so it searches as-is
      if (langMode === "es") {
        setSpanishSuffix(null);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSearchInput("");
      setActiveQuery("");
    }
  };

  const handleSearchCurrentTab = () => {
    const trimmed = searchInput.trim();
    setActiveQuery(trimmed);
    // Custom user query: remove suffix so it searches as-is
    if (langMode === "es") {
      setSpanishSuffix(null);
    }
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setActiveQuery("");
  };

  const handleRefresh = () => {
    if (isContextBackedTab) {
      contextRefresh();
      return;
    }
    const fullQuery = buildFullQuery();
    fetchTorrents(activeTab, fullQuery, true);
  };

  const handleOpenLink = async (url) => {
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      await openUrl(url);
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

  // Switch language mode with smart fetch/cache
  const switchLangMode = useCallback(
    (newMode) => {
      const committedQuery = activeQuery.trim() || searchInput.trim();
      const hasQuery = committedQuery.length > 0;
      const targetVisibleFansubs = getFansubsByLanguage(storeData.settings, newMode);
      const nextTab =
        activeTab === "general" || targetVisibleFansubs.some((fansub) => fansub.name === activeTab) ? activeTab : "general";

      setLangMode(newMode);

      if (hasQuery) {
        setActiveTab(nextTab);
        setActiveQuery(committedQuery);
        setSearchInput(committedQuery);
        setSpanishSuffix(null);
        return;
      }

      if (newMode !== "es") {
        setSpanishSuffix(null);
      }

      if (newMode === "en") {
        // English mode: go to principal fansub tab (or general) with empty query
        // Resolution is applied internally, not shown in the input
        setActiveTab(principalFansub || "general");
        setActiveQuery("");
        setSearchInput("");
      } else {
        // Spanish mode: go to General tab with "esp" suffix
        setActiveTab("general");
        setActiveQuery("");
        setSearchInput("");
        setSpanishSuffix("esp");
      }
    },
    [activeQuery, searchInput, storeData.settings, activeTab, principalFansub],
  );

  if (!hasConfig) {
    // El modal se cierra automáticamente porque hasConfig se vuelve true tras guardar settings
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

      {/* Language mode toggle (above tabs, only for Spanish users) */}
      {userIsSpanish && (
        <div className={styles.langModeContainer}>
          <button
            className={`${styles.langModeBtn} ${langMode === "en" ? styles.langModeBtnActive : ""}`}
            onClick={() => switchLangMode("en")}
          >
            🇬🇧 Inglés
          </button>
          <button
            className={`${styles.langModeBtn} ${langMode === "es" ? styles.langModeBtnActive : ""}`}
            onClick={() => switchLangMode("es")}
          >
            🇪🇸 Español
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        {/* General tab wrapper with suffix indicator */}
        <div className={styles.generalTabWrapper}>
          {/* Spanish suffix indicator — always visible in ES mode, above General button */}
          {langMode === "es" && (
            <span
              className={`${styles.suffixIndicator} ${!spanishSuffix ? styles.suffixIndicatorInactive : ""}`}
            >
              {spanishSuffix ? `[${spanishSuffix.toUpperCase()}]` : "[OFF]"}
            </span>
          )}
          <button
            className={`${styles.tabBtn} ${activeTab === "general" ? styles.tabActive : ""}`}
            onClick={() => handleTabClick("general")}
          >
            General
          </button>
        </div>

        {/* Fansub tabs */}
        {visibleFansubs.map((fansub) => (
          <button
            key={fansub.name}
            className={`${styles.tabBtn} ${activeTab === fansub.name ? styles.tabActive : ""}`}
            onClick={() => handleTabClick(fansub.name)}
          >
            {fansub.name}
            {fansub.principal && <span className={styles.starIcon}>⭐</span>}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            placeholder={
              langMode === "es" && activeTab === "general" && spanishSuffix
                ? `Buscar`
                : langMode === "es"
                  ? "Buscar en español..."
                  : activeTab === "general"
                    ? "Buscar en todo Nyaa..."
                    : `Buscar en ${activeTab}...`
            }
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          {searchInput.trim() && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClearSearch}
              title="Limpiar busqueda"
              aria-label="Limpiar busqueda"
            >
              ✕
            </button>
          )}
          <button
            className={styles.searchBtn}
            onClick={handleSearchCurrentTab}
            disabled={!searchInput.trim() || isLoading}
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Results */}
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
            <p>
              {activeQuery
                ? `No se encontraron resultados para "${activeQuery}" en ${activeTab}.`
                : langMode === "es" && spanishSuffix
                  ? `No se encontraron resultados con "${spanishSuffix}".`
                  : "No se encontraron resultados."}
            </p>
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
                  <tr
                    key={item.info_hash || item.download_url || item.magnet || `torrent-${index}`}
                    className={styles.tableRow}
                  >
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
                          item.seeders >= 10
                            ? styles.seedersHigh
                            : item.seeders > 0
                              ? styles.seedersMed
                              : styles.seedersLow
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
