import { useEffect, useRef, useState } from "react";
import { Window } from "@tauri-apps/api/window";
import styles from "./TitleBar.module.css";

function PixelMinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 16h14v2H5z" />
    </svg>
  );
}

function PixelMaximizeIcon({ maximized }) {
  if (maximized) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M6 8h8v2H6zM6 10h2v6H6zm2 4h6v2H8zm4-4h2v4h-2zM10 6h8v2h-8zm6 2h2v6h-2zm-6 4h8v2h-8zm0-4h2v2h-2z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M5 6h14v2H5zM5 8h2v10H5zm2 8h12v2H7zm10-8h2v8h-2z" />
    </svg>
  );
}

function PixelCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 6h2v2H6zM16 6h2v2h-2zM8 8h2v2H8zM14 8h2v2h-2zM10 10h2v2h-2zM12 10h2v2h-2zM10 12h2v2h-2zM12 12h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2zM6 16h2v2H6zM16 16h2v2h-2z"
      />
    </svg>
  );
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeControl, setActiveControl] = useState(null);
  const [canHover, setCanHover] = useState(true);
  const windowRef = useRef(null);

  useEffect(() => {
    const appWindow = Window.getCurrent();
    windowRef.current = appWindow;

    let unlistenResize = null;
    let unlistenFocus = null;
    let mounted = true;

    const syncWindowState = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        if (mounted) {
          setIsMaximized(maximized);
        }
      } catch {}
    };

    syncWindowState();

    appWindow
      .onResized(() => {
        syncWindowState();
      })
      .then((dispose) => {
        unlistenResize = dispose;
      })
      .catch(() => {});

    appWindow
      .listen("tauri://focus", () => {
        setActiveControl(null);
        syncWindowState();
      })
      .then((dispose) => {
        unlistenFocus = dispose;
      })
      .catch(() => {});

    const clearPressedState = () => {
      setActiveControl(null);
    };

    const handleBlur = () => {
      setActiveControl(null);
      setCanHover(false);
    };

    const handleMouseMove = () => {
      setCanHover(true);
    };

    window.addEventListener("mouseup", clearPressedState);
    window.addEventListener("pointerup", clearPressedState);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", clearPressedState);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      mounted = false;
      windowRef.current = null;
      window.removeEventListener("mouseup", clearPressedState);
      window.removeEventListener("pointerup", clearPressedState);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", clearPressedState);
      window.removeEventListener("mousemove", handleMouseMove);
      if (typeof unlistenResize === "function") unlistenResize();
      if (typeof unlistenFocus === "function") unlistenFocus();
    };
  }, []);

  const withWindow = async (action) => {
    const appWindow = windowRef.current ?? Window.getCurrent();
    windowRef.current = appWindow;

    try {
      await action(appWindow);
    } catch (error) {
      console.error("[TitleBar] window action failed", error);
    }
  };

  const handleMinimize = async () => {
    setActiveControl(null);
    setCanHover(false);
    await withWindow((appWindow) => appWindow.minimize());
  };

  const handleToggleMaximize = async () => {
    await withWindow(async (appWindow) => {
      setActiveControl(null);
      setCanHover(false);
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    });
  };

  const handleClose = async () => {
    setActiveControl(null);
    setCanHover(false);
    await withWindow((appWindow) => appWindow.close());
  };

  const handleTitleBarDoubleClick = async () => {
    await handleToggleMaximize();
  };

  return (
    <header className={styles.titleBar}>
      <div className={styles.scanline} />

      <div className={styles.brandRail} data-tauri-drag-region onDoubleClick={handleTitleBarDoubleClick}>
        <div className={styles.brandBadge} aria-hidden="true">
          <span className={styles.badgePixelA} />
          <span className={styles.badgePixelB} />
          <span className={styles.badgePixelC} />
        </div>

        <div className={styles.brandCopy}>
          <strong className={styles.brandName}>ZOKU</strong>
        </div>
      </div>

      <div className={styles.controls} data-hoverable={canHover}>
        <button
          type="button"
          className={styles.controlButton}
          data-active={activeControl === "minimize"}
          onPointerDown={() => setActiveControl("minimize")}
          onPointerUp={() => setActiveControl(null)}
          onPointerLeave={() => setActiveControl(null)}
          onBlur={() => setActiveControl(null)}
          onClick={handleMinimize}
          aria-label="Minimizar"
        >
          <PixelMinimizeIcon />
        </button>
        <button
          type="button"
          className={styles.controlButton}
          data-active={activeControl === "maximize"}
          onPointerDown={() => setActiveControl("maximize")}
          onPointerUp={() => setActiveControl(null)}
          onPointerLeave={() => setActiveControl(null)}
          onBlur={() => setActiveControl(null)}
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? "Restaurar" : "Maximizar"}
        >
          <PixelMaximizeIcon maximized={isMaximized} />
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.closeButton}`}
          data-active={activeControl === "close"}
          onPointerDown={() => setActiveControl("close")}
          onPointerUp={() => setActiveControl(null)}
          onPointerLeave={() => setActiveControl(null)}
          onBlur={() => setActiveControl(null)}
          onClick={handleClose}
          aria-label="Cerrar"
        >
          <PixelCloseIcon />
        </button>
      </div>
    </header>
  );
}

export default TitleBar;
