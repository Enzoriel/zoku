import { Outlet } from "react-router-dom";
import { Suspense, useMemo } from "react";
import { Sidebar } from "./Sidebar";
import styles from "./Layout.module.css";

const Layout = () => {
  const ambientParticles = useMemo(() => {
    return Array.from({ length: 28 }).map((_, i) => {
      const colors = ["var(--px-pink)", "var(--px-cyan)", "var(--px-yellow)", "var(--px-purple)"];
      const style = {
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        backgroundColor: colors[i % colors.length],
        "--fx": `${(Math.random() - 0.5) * 60}px`,
        "--fy": `${-(Math.random() * 60 + 60)}px`,
        "--duration": `${Math.random() * 3 + 4}s`,
        "--delay": `${Math.random() * 4}s`,
      };
      return <span key={i} className={styles.particle} style={style} />;
    });
  }, []);

  return (
    <div className={styles.layout}>
      <div className={styles.ambient}>{ambientParticles}</div>
      <Sidebar />
      <div className={styles.main}>
        <main className={styles.content}>
          <Suspense
            fallback={
              <div className="spinner-container" aria-busy="true">
                <span className="loader">CARGANDO...</span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default Layout;
