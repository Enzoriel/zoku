import { useState, useRef, useEffect } from "react";
import styles from "./Header.module.css";
import CornerBrackets from "../ui/CornerBrackets";

function Header({ name }) {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Cerrar el buscador al clickear afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
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
          onClick={() => {
            setIsSearchActive(true);
            inputRef.current?.focus();
          }}
          ref={searchContainerRef}
        >
          <div className={`${styles.searchIconWrapper} ${isSearchActive ? styles.iconActive : ""}`}>
            <svg
              className={styles.searchIcon}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="square"
            >
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M21 21l-4.35-4.35"></path>
              <path className={styles.iconDecorator} d="M11 8v1M11 13v1M8 11h1M13 11h1"></path>
            </svg>
            <div className={styles.iconGlitch}></div>
          </div>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchBar}
            placeholder={isSearchActive ? "BUSCAR EN LA RED ZOKU..." : undefined}
          />
          <div className={styles.scanline}></div>
          <CornerBrackets size={10} />
        </div>

        <div className={styles.userProfile} title="Perfil">
          E
          <CornerBrackets size={10} />
        </div>
      </div>
    </header>
  );
}

export default Header;
