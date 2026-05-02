import { useRef, useState, useEffect } from "react";
import styles from "./SearchBar.module.css";

const SearchLocal = ({ onSearch, placeholder = "BUSCAR...", initialValue = "" }) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef(null);
  const isFocused = useRef(false);

  const debounceTimeout = useRef(null);

  useEffect(() => {
    if (isFocused.current) return;
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  const handleChange = (event) => {
    const newValue = event.target.value;
    setValue(newValue);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      onSearch(newValue);
    }, 300);
  };

  const handleClear = () => {
    setValue("");
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
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
          onFocus={() => {
            isFocused.current = true;
          }}
          onBlur={() => {
            isFocused.current = false;
          }}
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
