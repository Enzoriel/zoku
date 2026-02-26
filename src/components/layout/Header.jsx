import styles from "./Header.module.css";

function Header({ name }) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <h1 className={styles.brandTitle}>{name}</h1>
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
        <div className={styles.searchContainer}>
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
          <input type="text" placeholder="Buscar anime..." className={styles.searchBar} />
        </div>

        <div className={styles.userProfile} title="Perfil">
          E
        </div>
      </div>
    </header>
  );
}

export default Header;
