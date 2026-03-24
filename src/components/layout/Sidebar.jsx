import { NavLink } from "react-router-dom";
import { useState } from "react";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  {
    path: "/",
    end: true,
    label: "Inicio",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    path: "/my-animes",
    label: "Mis Animes",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
      </svg>
    ),
  },
  {
    path: "/library",
    label: "Biblioteca",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
      </svg>
    ),
  },
  {
    path: "/discover",
    label: "Descubrir",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z" />
      </svg>
    ),
  },
  {
    path: "/search",
    label: "Buscar",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
      </svg>
    ),
  },
  {
    path: "/stats",
    label: "Estadísticas",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" />
      </svg>
    ),
  },
];

const CONFIG_ITEM = {
  path: "/configuration",
  label: "Configuración",
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
    </svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Ripple hook                                                         */
/* ------------------------------------------------------------------ */
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
