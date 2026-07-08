/** Random pleasant color generation. Pure. */

/** Returns a hex color string like "#7dd3fc" with good saturation/lightness. */
export function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  const sat = 60 + Math.floor(Math.random() * 25); // 60-85%
  const light = 55 + Math.floor(Math.random() * 15); // 55-70%
  return hslToHex(hue, sat, light);
}

export function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const color = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Parse "#rrggbb" into a 0xRRGGBB number for Pixi. */
export function hexToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
