import styles from "./Button.module.css";

function Button({ children, onClick, variant = "primary", className = "" }) {
  return (
    <button className={`${styles.button} ${styles[variant]} ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default Button;
