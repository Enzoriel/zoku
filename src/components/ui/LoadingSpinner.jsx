export default function LoadingSpinner({ size = 30, color = "#ffffff" }) {
  return (
    <div className="spinner-container">
      <svg className="spinner-svg" viewBox="0 0 50 50" style={{ width: size, height: size }}>
        <rect className="boxes" x="0" y="0" width="50" height="50" stroke={color} />
      </svg>
    </div>
  );
}
