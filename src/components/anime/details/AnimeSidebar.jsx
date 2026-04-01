import { useEffect, useRef, useState } from "react";
import styles from "../../../pages/AnimeDetails.module.css";

export function AnimeSidebar({ mainAnime, onAdd, onRemove, onLinkFolder, onEditAlias }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isLinked = !!mainAnime.folderName;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.posterWrapper}>
        {mainAnime.coverImage ? (
          <img src={mainAnime.coverImage} className={styles.poster} alt={mainAnime.title} />
        ) : (
          <div className={styles.posterFallback}>DESVINCULADO</div>
        )}
      </div>
      <div className={styles.mainActions} style={{ width: "100%", marginBottom: "16px" }}>
        {!mainAnime.isInLibrary ? (
          <button className={`${styles.actionBtn} ${styles.primaryBtn}`} style={{ width: "100%" }} onClick={onAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            AÑADIR A LISTA
          </button>
        ) : (
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <button className={`${styles.actionBtn} ${styles.secondaryBtn}`} style={{ flex: 1 }} disabled>
              ✓ EN BIBLIOTECA
            </button>
            <div className={styles.menuWrapper} ref={menuRef}>
              <button className={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>
              {menuOpen && (
                <div className={styles.menuDropdown}>
                  <button
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onLinkFolder();
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {isLinked ? "CAMBIAR CARPETA VINCULADA" : "VINCULAR CARPETA"}
                  </button>
                  <button
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onEditAlias();
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    CAMBIAR ALIAS NYAA
                  </button>
                  <button
                    className={`${styles.menuItem} ${styles.menuItemDanger}`}
                    onClick={() => {
                      setMenuOpen(false);
                      onRemove();
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    ELIMINAR DE MIS ANIMES
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className={styles.tagsList}>
        {mainAnime.genres?.map((g) => (
          <span key={g.mal_id || g.name} className={styles.tag}>
            {g.name || g}
          </span>
        ))}
      </div>
      <div className={styles.dataGrid}>
        <div className={styles.dataItem} data-label="ESTUDIO">
          <span className={styles.dataValue}>{mainAnime.studios?.map((s) => s.name).join(", ") || "N/A"}</span>
        </div>
        <div className={styles.dataItem} data-label="DURACIÓN">
          <span className={styles.dataValue}>{mainAnime.duration || "N/A"}</span>
        </div>
        <div className={styles.dataItem} data-label="ESTRENO">
          <span className={styles.dataValue}>{mainAnime.airedDate || "N/A"}</span>
        </div>
        <div className={styles.dataItem} data-label="TEMPORADA">
          <span className={styles.dataValue}>{mainAnime.season || "N/A"}</span>
        </div>
        <div className={styles.dataItem} data-label="PUNTUACIÓN">
          <span className={styles.dataValue} style={{ color: "var(--px-yellow)" }}>
            ★ {mainAnime.score || "0.0"}
          </span>
        </div>
        <div className={styles.dataItem} data-label="MIEMBROS">
          <span className={styles.dataValue}>{mainAnime.members?.toLocaleString() || "N/A"}</span>
        </div>
        <div className={styles.dataItem} data-label="FAVORITOS">
          <span className={styles.dataValue}>❤ {mainAnime.favorites?.toLocaleString() || "0"}</span>
        </div>
        <div className={styles.dataItem} data-label="ORIGEN">
          <span className={styles.dataValue}>{mainAnime.source || "N/A"}</span>
        </div>
      </div>
      <div className={styles.synopsisBox}>
        <p className={styles.synopsisText}>{mainAnime.synopsis || "Sinopsis no disponible."}</p>
      </div>
    </aside>
  );
}
