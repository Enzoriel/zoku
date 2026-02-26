import Header from "./Header";
import Sidebar from "./Sidebar";
import styles from "./Layout.module.css";
import { useLocation } from "react-router-dom";

const Layout = () => {
  const { pathname } = useLocation();
  const name = pathname === "/" ? "Dashboard" : pathname.substring(1);
  return (
    <div>
      <Header name={name} />
      <Sidebar />
    </div>
  );
};

export default Layout;
