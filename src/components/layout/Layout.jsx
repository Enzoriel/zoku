import { Outlet, useLocation } from "react-router-dom";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import styles from "./Layout.module.css";

const Layout = () => {
  const { pathname, search } = useLocation();
  const contentRef = useRef(null);

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

  useEffect(() => {
    const scrollTarget = contentRef.current;
    if (scrollTarget?.scrollTo) {
      scrollTarget.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, search]);

  return (
    <div className={styles.layout}>
      <TitleBar />
      <div className={styles.ambient}>{ambientParticles}</div>
      <Sidebar />
      <div className={styles.main}>
        <main ref={contentRef} className={styles.content}>
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
