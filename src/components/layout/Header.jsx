import { useState, useRef, useEffect } from "react";
import styles from "./Header.module.css";

function Header({ name }) {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef(null);

  // Cerrar el buscador al clickear afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setIsSearchActive(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <h1 className={styles.brandTitle} data-text={name}>
          {name}
        </h1>
        <div className={styles.brandShapeLeft}>
          <svg width="20" height="20" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="8,50 8,8 50,8" stroke="white" strokeWidth="6" fill="none" strokeLinecap="square" />
          </svg>
        </div>
        <div className={styles.brandShapeRight}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 30 30"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: "rotate(180deg)" }}
          >
            <polyline points="8,50 8,8 50,8" stroke="white" strokeWidth="6" fill="none" strokeLinecap="square" />
          </svg>
        </div>
      </div>

      <div className={styles.headerRight}>
        <div
          className={`${styles.searchContainer} ${isSearchActive ? styles.searchActive : ""}`}
          onClick={() => setIsSearchActive(true)}
          ref={searchInputRef}
        >
          <svg
            className={styles.searchIcon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className={styles.searchBar}
            placeholder={isSearchActive ? "" : undefined}
            autoFocus={isSearchActive}
          />
        </div>

        <div className={styles.userProfile} title="Perfil">
          E
        </div>
      </div>
    </header>
  );
}

export default Header;
