import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import styles from "./Layout.module.css";

const Layout = () => {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
