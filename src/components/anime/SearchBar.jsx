import { useState, useEffect } from "react";
import styles from "./SearchBar.module.css";

function SearchBar({ onSearch = () => {}, isLoading = false }) {
  const [query, setQuery] = useState("");

  // Debounce: esperar 500ms después de dejar de escribir
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 500);

    return () => clearTimeout(timer);
  }, [query, onSearch]);

  return (
    <div className={styles.searchContainer}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar anime por nombre..."
        className={styles.searchInput}
      />
      {isLoading && <span className={styles.spinner}>⏳</span>}
    </div>
  );
}

export default SearchBar;
