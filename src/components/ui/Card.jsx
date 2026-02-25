import styles from "./Card.module.css";

function Card({ children, onClick, className = "" }) {
  return (
    <div className={`${styles.card} ${onClick ? styles.clickable : ""} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export default Card;
