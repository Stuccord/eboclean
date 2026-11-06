// Draws the before/after share card (1080x1920, story format) on a canvas.
export interface ShareCardInput {
  beforeImage: string;
  afterImage: string;
  beforeScore: number;
  afterScore: number;
  minutes: number;
  zoneLabel: string;
}

const W = 1080;
const H = 1920;

export async function makeShareCard(input: ShareCardInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "800 72px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(`${input.zoneLabel} glow-up ✨`, W / 2, 150);
  ctx.font = "500 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#c7d2fe";
  ctx.fillText(`${input.minutes}-minute Eboclean mission`, W / 2, 215);

  const [before, after] = await Promise.all([
    loadImage(input.beforeImage),
    loadImage(input.afterImage),
  ]);

  drawPhoto(ctx, before, 60, 290, 960, 640, "BEFORE", input.beforeScore, "#ef4444");
  drawPhoto(ctx, after, 60, 990, 960, 640, "AFTER", input.afterScore, "#22c55e");

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(
    `Mess Score ${input.beforeScore} → ${input.afterScore}`,
    W / 2,
    1730,
  );
  ctx.font = "600 40px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#a5b4fc";
  ctx.fillText("Made with Eboclean ✨", W / 2, 1810);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  score: number,
  color: string,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 36);
  ctx.clip();
  // cover-fit
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();

  // Label pill
  ctx.fillStyle = "rgba(15,23,42,0.8)";
  roundRect(ctx, x + 24, y + 24, 230, 70, 35);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "800 38px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(label, x + 24 + 115, y + 72);

  // Score badge
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + w - 100, y + h - 100, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(String(score), x + w - 100, y + h - 78);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
