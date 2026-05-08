import { useState, useRef, useEffect } from "react";
import styles from "./SearchBar.module.css";
import ButtonSvg from "../ui/ButtonSvg";

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
        <ButtonSvg
          type="submit"
          text="BUSCAR"
          width={200}
          outlineColor="#ff6b6b"
          edgeColor="#000000"
          fillColor="#fff0f0"
          particleColor="#ff6b6b"
          textColor="#cc0000"
          disabled={isLoading}
        />
      </form>
    </div>
  );
};

export default SearchBar;
