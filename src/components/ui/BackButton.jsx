import { useNavigate, useLocation } from "react-router-dom";
import styles from "./BackButton.module.css";

const BackButton = ({ className = "" }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // Si estamos en la página inicial o por alguna razón no hay historial
    // React Router maneja bien el navigate(-1).
    if (location.key === "default" || window.history.length <= 1) {
      navigate("/", { replace: true });
    } else {
      navigate(-1);
    }
  };

  return (
    <button onClick={handleBack} className={`${styles.backButton} ${className}`} aria-label="Volver atrás">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <path
          fill="currentColor"
          d="M0 11v1h1v1h1v1h1v1h2v-1h1v-1h1v-1h1v-1H5V9h1V7h1V6h2V5h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H9v-1H6v2h2v1h6v-1h2v-1h1v-1h1v-2h1V8h-1V6h-1V5h-1V4h-2V3H8v1H6v1H5v1H4v2H3v3z"
        />
      </svg>
      <span className={styles.backText}>Volver</span>
    </button>
  );
};

export default BackButton;
