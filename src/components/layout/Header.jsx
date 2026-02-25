import styles from "./Header.module.css";

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <div className={styles.brand}>
          <h1 className={styles.brandTitle}>ZOKU</h1>
          <span className={styles.brandSubtitle}>続</span>
        </div>

        <div className={styles.apiStatus}>
          <span className={styles.statusDot}></span>
          <div className={styles.statusText}>
            <span>JIKAN</span>
            <span>API</span>
            <span>ONLINE</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
