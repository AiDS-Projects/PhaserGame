/** 颜色工具集：十六进制 / RGB / Phaser 数值色互转与常用变换。 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;
const HEX_SHORT_RE = /^#?([0-9a-f]{3})$/i;

/** 归一化十六进制字符串为 #rrggbb（支持 3 位缩写与省略 #）。 */
export function normalizeHex(hex: string): string {
  let h = hex.trim();
  const short = h.match(HEX_SHORT_RE);
  if (short) {
    const [r, g, b] = short[1]!.split('');
    h = `#${r}${r}${g}${g}${b}${b}`;
  }
  const full = h.match(HEX_RE);
  if (!full) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return `#${full[1]!.toLowerCase()}`;
}

/** 十六进制 -> RGB 对象。 */
export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** RGB -> 十六进制字符串。 */
export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 十六进制 -> Phaser 数值色 (0xRRGGBB)。 */
export function hexToNumber(hex: string): number {
  return parseInt(normalizeHex(hex).slice(1), 16);
}

/** Phaser 数值色 -> 十六进制字符串。 */
export function numberToHex(color: number): string {
  const n = Math.max(0, Math.min(0xffffff, Math.floor(color)));
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** RGB -> Phaser 数值色。 */
export function rgbToNumber(r: number, g: number, b: number): number {
  const cr = Math.max(0, Math.min(255, r));
  const cg = Math.max(0, Math.min(255, g));
  const cb = Math.max(0, Math.min(255, b));
  return (cr << 16) | (cg << 8) | cb;
}

/** 混合两个 Phaser 数值色，t ∈ [0,1]。 */
export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const k = Math.max(0, Math.min(1, t));
  return rgbToNumber(
    Math.round(ar + (br - ar) * k),
    Math.round(ag + (bg - ag) * k),
    Math.round(ab + (bb - ab) * k),
  );
}

/** 调亮 / 调暗 Phaser 数值色。amount ∈ [-1,1]，正为变亮，负为变暗。 */
export function shade(color: number, amount: number): number {
  const k = Math.max(-1, Math.min(1, amount));
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = k < 0 ? 0 : 255;
  const t = Math.abs(k);
  return rgbToNumber(
    Math.round(r + (mix - r) * t),
    Math.round(g + (mix - g) * t),
    Math.round(b + (mix - b) * t),
  );
}

/** 生成 CSS rgba() 字符串，供 DOM / 文本样式使用。 */
export function toCssRgba(hex: string, alpha = 1): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 生成随机十六进制颜色。 */
export function randomHex(): string {
  return rgbToHex(
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  );
}