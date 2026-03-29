import styles from "./Button.module.css";

function Button({ children, onClick, className = "", disabled = false }) {
  return (
    <div className={`${styles.wrap} ${className}`}>
      <button className={styles.btn} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    </div>
  );
}

export default Button;
