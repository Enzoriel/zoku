import { useRef, useEffect } from "react";

const DEFAULT_COLOR = [200, 255, 0];
const VALID_ANIMATIONS = new Set(["middle", "left", "right", "top", "bottom", "none"]);

const normalizeAnimation = (animation) => (VALID_ANIMATIONS.has(animation) ? animation : "middle");

export const getPixelRevealTileDelay = ({
  animation = "middle",
  column,
  row,
  columns,
  rows,
  delayFactor,
  noiseStack = 0,
  random = Math.random,
}) => {
  const normalizedAnimation = normalizeAnimation(animation);
  let baseDelay = 0;

  switch (normalizedAnimation) {
    case "left":
      baseDelay = column * delayFactor;
      break;
    case "right":
      baseDelay = (columns - 1 - column) * delayFactor;
      break;
    case "top":
      baseDelay = row * delayFactor;
      break;
    case "bottom":
      baseDelay = (rows - 1 - row) * delayFactor;
      break;
    case "none":
      return random() * noiseStack;
    case "middle":
    default:
      baseDelay = Math.abs(column - columns / 2) * delayFactor;
      break;
  }

  return baseDelay + random() * noiseStack;
};

const PixelReveal = ({
  speed = 0.055,
  tileSize = 8,
  delayFactor = 2.5,
  noiseStack = 22,
  active = true,
  color = DEFAULT_COLOR,
  animation = "middle",
}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!active || !canvasRef.current || !canvasRef.current.parentElement) return;

    const canvas = canvasRef.current;

    // FIX: si ya hay una animación corriendo en este canvas físico, no arrancar otra
    if (canvas.dataset.running === "true") return;
    canvas.dataset.running = "true";

    const ctx = canvas.getContext("2d");
    const parent = canvas.parentElement;

    cancelledRef.current = false;
    canvas.style.display = "block";
    canvas.style.opacity = "1";
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;

    const W = canvas.width;
    const H = canvas.height;
    const cols = Math.ceil(W / tileSize);
    const rows = Math.ceil(H / tileSize);
    const [cr, cg, cb] = color;

    const tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tiles.push({
          x: c * tileSize,
          y: r * tileSize,
          w: Math.min(tileSize, W - c * tileSize),
          h: Math.min(tileSize, H - r * tileSize),
          delay: getPixelRevealTileDelay({
            animation,
            column: c,
            row: r,
            columns: cols,
            rows,
            delayFactor,
            noiseStack,
          }),
          progress: 0,
          done: false,
        });
      }
    }

    ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
    ctx.fillRect(0, 0, W, H);

    let frame = 0;

    const animate = () => {
      if (cancelledRef.current) {
        canvas.dataset.running = "false";
        return;
      }

      ctx.clearRect(0, 0, W, H);
      frame++;
      let allDone = true;

      tiles.forEach((tile) => {
        if (tile.done) return;

        if (frame < tile.delay) {
          ctx.fillStyle = `rgb(${cr}, ${cg}, ${cb})`;
          ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
          allDone = false;
          return;
        }

        tile.progress = Math.min(1, tile.progress + speed);
        const ease = 1 - Math.pow(1 - tile.progress, 3);

        if (tile.progress >= 1) {
          tile.done = true;
          return;
        }

        allDone = false;
        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${1 - ease})`;
        ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
      });

      if (!allDone) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        canvas.dataset.running = "false";
        canvas.style.opacity = "0";
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelledRef.current = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      canvas.dataset.running = "false";
    };
  }, [active, speed, tileSize, delayFactor, noiseStack, color, animation]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        imageRendering: "pixelated",
      }}
    />
  );
};

export default PixelReveal;
