import { useId } from "react";
import styles from "./ButtonSvg.module.css";

const ButtonSvg = ({
  text = "CLICK AQUÍ",
  onClick,
  edgeColor = "#bdf669",
  fillColor = "#f1f1f1",
  textColor = "#1a1a1a",
  outlineColor = "#010101",
  particleColor,
  width = 500,
  disabled = false,
  type = "button",
  ...props
}) => {
  const pColor = particleColor || edgeColor;
  const clipId = useId();
  const height = Math.round(width * (110 / 500));
  const fontSize = Math.round(width * 0.1);

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={styles.button}
      {...props}
      style={{
        position: "relative",
        display: "inline-block",
        background: "none",
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        width,
        height,
        opacity: disabled ? 0.6 : 1,
        transition: "opacity 0.2s",
        clipPath: `url(#${clipId})`,
        WebkitClipPath: `url(#${clipId})`,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox="0 0 500 110"
        width={width}
        height={height}
        style={{ display: "block", transition: "transform 0.15s" }}
        className={styles.svg}
      >
        <defs>
          <pattern
            xlinkHref="#a"
            id="b"
            x={-1}
            y={0}
            patternTransform="matrix(-8 0 0 -8 165 606)"
            preserveAspectRatio="none"
          />
          <pattern
            id="a"
            width={5}
            height={4}
            patternTransform="matrix(2 0 0 2 165 606)"
            patternUnits="userSpaceOnUse"
            style={{
              fill: "#ebebeb",
            }}
          >
            <path
              d="m0 4 2.5-4L5 4Z"
              style={{
                stroke: "none",
                strokeWidth: 4.8561,
                strokeLinecap: "square",
                paintOrder: "stroke markers fill",
                stopColor: "#000",
              }}
            />
          </pattern>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d="M0.02,0 h0.96 v0.091 h0.02 v0.818 h-0.02 v0.091 H0.02 v-0.091 H0 v-0.818 h0.02 z" />
          </clipPath>
        </defs>
        <g style={{ display: "inline" }}>
          {/* Borde Exterior (Outline) */}
          <path
            d="M10 100h480v10h10v90h-10v10H10v-10H0v-90h10z"
            style={{
              fill: outlineColor,
              fillOpacity: 1,
              strokeWidth: 1.00157,
              paintOrder: "stroke fill markers",
              transition: "fill 0.2s",
            }}
            transform="translate(0 -100)"
          />
          {/* Borde Interior */}
          <path
            d="M15 105h470v10h10v80h-10v10H15v-10H5v-80h10z"
            style={{
              fill: edgeColor,
              fillOpacity: 1,
              strokeWidth: 1.00157,
              paintOrder: "stroke fill markers",
              transition: "fill 0.2s",
            }}
            transform="translate(0 -100)"
          />
          {/* Relleno Interior */}
          <path
            d="M20 120v-10h460v10h10v70h-10v10H20v-10H10v-70z"
            style={{
              mixBlendMode: "normal",
              fill: fillColor,
              fillOpacity: 1,
              strokeWidth: 1.00157,
              paintOrder: "stroke fill markers",
              transition: "fill 0.2s",
            }}
            transform="translate(0 -100)"
          />
          {/* Textura */}
          <path
            d="M20 120v-10h460v10h10v70h-10v10H20v-10H10v-70z"
            style={{
              display: "inline",
              mixBlendMode: "normal",
              fill: "url(#b)",
              fillOpacity: 1,
              strokeWidth: 1.00157,
              paintOrder: "stroke fill markers",
            }}
            transform="translate(0 -100)"
          />
          <g style={{ display: "inline" }}>
            {/* Partículas Izquierda */}
            <g
              style={{
                fill: pColor,
                fillOpacity: 1,
                transition: "fill 0.2s",
              }}
              transform="translate(10 -100)"
            >
              <rect width={10} height={10} x={40} y={160} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={30} y={130} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <path d="M30 150h10v10H30z" style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={30} y={170} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={40} y={140} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={50} y={150} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={60} y={140} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={60} y={160} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={70} y={150} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
            </g>
            {/* Partículas Derecha */}
            <g
              style={{
                fill: pColor,
                fillOpacity: 1,
                transition: "fill 0.2s",
              }}
              transform="matrix(-1 0 0 1 95 -100)"
            >
              <rect width={10} height={10} x={-355} y={160} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-365} y={130} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <path d="M-365 150h10v10h-10z" style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-365} y={170} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-355} y={140} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-345} y={150} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-335} y={140} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-335} y={160} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
              <rect width={10} height={10} x={-325} y={150} ry={0} style={{ display: "inline", fill: pColor, fillOpacity: 1, strokeWidth: 1.00157, paintOrder: "stroke fill markers" }} />
            </g>
          </g>
        </g>
      </svg>

      <span
        className={styles.text}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize,
          color: textColor,
          letterSpacing: "2px",
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
          transition: "color 0.2s",
        }}
      >
        {text}
      </span>
    </button>
  );
};

export default ButtonSvg;
