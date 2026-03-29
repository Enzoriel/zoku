import { NavLink } from "react-router-dom";
import { useState } from "react";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  {
    path: "/",
    end: true,
    label: "Inicio",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    path: "/my-animes",
    label: "Mis Animes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <polyline points="17 2 12 7 7 2" />
      </svg>
    ),
  },
  {
    path: "/library",
    label: "Biblioteca",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    path: "/recent",
    label: "Recientes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="9" />
        <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </svg>
    ),
  },
  {
    path: "/history",
    label: "Historial",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v5h5" />
        <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
        <path d="M12 7v5l4 2" />
      </svg>
    ),
  },
  {
    path: "/discover",
    label: "Descubrir",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
  },
  {
    path: "/search",
    label: "Buscar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    path: "/torrents",
    label: "Torrents",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  {
    path: "/stats",
    label: "Estadísticas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

const CONFIG_ITEM = {
  path: "/configuration",
  label: "Configuración",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

function useRipple() {
  const [rippling, setRippling] = useState(null);
  const [mouseDown, setMouseDown] = useState(false);
  const [done, setDone] = useState(false);

  const onMouseDown = (path) => {
    setMouseDown(true);
    setDone(false);
    setRippling(path);
  };

  const onMouseUpOrLeave = () => {
    setMouseDown(false);
    if (done) setRippling(null);
  };

  const onAnimationEnd = () => {
    setDone(true);
    if (!mouseDown) setRippling(null);
  };

  return { rippling, onMouseDown, onMouseUpOrLeave, onAnimationEnd };
}

function NavItem({ item, rippling, onMouseDown, onMouseUpOrLeave, onAnimationEnd }) {
  const handleClick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <li>
      <NavLink
        to={item.path}
        end={item.end}
        className={({ isActive }) => (isActive ? styles.active : "")}
        onMouseDown={() => onMouseDown(item.path)}
        onMouseUp={onMouseUpOrLeave}
        onMouseLeave={onMouseUpOrLeave}
        onClick={handleClick}
        title={item.label}
      >
        <div className={styles.rippleContainer}>
          {rippling === item.path && <div className={styles.rippleAnim} onAnimationEnd={onAnimationEnd} />}
        </div>
        <div className={styles.iconWrap}>{item.icon}</div>
        <span className={styles.navLabel}>{item.label}</span>
      </NavLink>
    </li>
  );
}

export const Sidebar = () => {
  const { rippling, onMouseDown, onMouseUpOrLeave, onAnimationEnd } = useRipple();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.userProfile} title="Perfil">
        <div className={styles.avatarBox}>E</div>
        <span className={styles.avatarLabel}>Mi perfil</span>
      </div>

      <div className={styles.containerList}>
        <nav>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <NavItem
                key={item.path}
                item={item}
                rippling={rippling}
                onMouseDown={onMouseDown}
                onMouseUpOrLeave={onMouseUpOrLeave}
                onAnimationEnd={onAnimationEnd}
              />
            ))}
          </ul>
        </nav>

        <div className={styles.configuration}>
          <NavLink
            to={CONFIG_ITEM.path}
            className={({ isActive }) => (isActive ? styles.active : "")}
            onMouseDown={() => onMouseDown(CONFIG_ITEM.path)}
            onMouseUp={onMouseUpOrLeave}
            onMouseLeave={onMouseUpOrLeave}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title={CONFIG_ITEM.label}
          >
            <div className={styles.rippleContainer}>
              {rippling === CONFIG_ITEM.path && <div className={styles.rippleAnim} onAnimationEnd={onAnimationEnd} />}
            </div>
            <div className={styles.iconWrap}>{CONFIG_ITEM.icon}</div>
            <span className={styles.navLabel}>{CONFIG_ITEM.label}</span>
          </NavLink>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
