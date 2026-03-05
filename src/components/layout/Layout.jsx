import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import styles from "./Layout.module.css";

const Layout = () => {
  const { pathname } = useLocation();
  const name = pathname === "/" ? "Dashboard" : pathname.substring(1).charAt(0).toUpperCase() + pathname.slice(2);

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <Header name={name} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
