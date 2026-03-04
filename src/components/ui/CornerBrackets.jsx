import styles from "./CornerBrackets.module.css";

/**
 * Brackets SVG decorativos para las 4 esquinas.
 * Se muestran con opacity via CSS del padre (:hover .cornerBracket).
 */
export default function CornerBrackets({ size = 10 }) {
  const svg = (className, rotation) => (
    <svg
      className={`${styles.corner} ${className}`}
      data-corner
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
    >
      <polyline points="8,50 8,8 50,8" stroke="white" strokeWidth="6" fill="none" strokeLinecap="square" />
    </svg>
  );

  return (
    <>
      {svg(styles.tl, 0)}
      {svg(styles.tr, 90)}
      {svg(styles.br, 180)}
      {svg(styles.bl, 270)}
    </>
  );
}
