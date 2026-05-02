import { useState, useRef, useEffect } from "react";
import styles from "./SearchBar.module.css";

const SearchBar = ({ onSearch, isLoading, initialValue = "" }) => {
  const [query, setQuery] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  const handleClear = () => {
    setQuery("");
    onSearch("");
    inputRef.current?.focus();
  };

  return (
    <div className={styles.searchContainer}>
      <form onSubmit={handleSubmit} className={styles.searchForm}>
        <div className={styles.inputWrapper}>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="BUSCAR ANIME EN LA RED..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={handleClear}
              aria-label="Limpiar busqueda"
              title="Limpiar busqueda"
            >
              ×
            </button>
          )}
        </div>
        <button type="submit" className={styles.searchButton} disabled={isLoading}>
          {isLoading ? <div className={styles.spinner}></div> : "BUSCAR"}
        </button>
      </form>
    </div>
  );
};

export default SearchBar;
