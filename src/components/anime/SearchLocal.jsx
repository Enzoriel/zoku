import { useRef, useState, useEffect } from "react";
import styles from "./SearchBar.module.css";

const SearchLocal = ({ onSearch, placeholder = "BUSCAR..." }) => {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  const isFirstRender = useRef(true);
  const skipNextDebounce = useRef(false);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handler = setTimeout(() => {
      if (skipNextDebounce.current) {
        skipNextDebounce.current = false;
        return;
      }
      onSearch(value);
    }, 300);

    return () => clearTimeout(handler);
  }, [value, onSearch]);

  const handleChange = (event) => {
    setValue(event.target.value);
  };

  const handleClear = () => {
    skipNextDebounce.current = true;
    setValue("");
    onSearch(""); // Limpieza instantánea para UX inmediata
    inputRef.current?.focus();
  };

  return (
    <div className={styles.searchContainer} style={{ maxWidth: "400px" }}>
      <div className={styles.inputWrapper}>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
        />
        {value && (
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
    </div>
  );
};

export default SearchLocal;
