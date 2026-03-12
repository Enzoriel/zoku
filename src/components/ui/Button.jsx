import styles from "./Button.module.css";

function Button({ children, onClick, color = "", hoverColor = "", className = "", disabled = false }) {
  const customStyles = {
    "--bg-color": color,
    "--hover-color": hoverColor,
  };

  return (
    <button className={`${styles.btn} ${className}`} onClick={onClick} style={customStyles} disabled={disabled}>
      {children}
    </button>
  );
}

export default Button;
