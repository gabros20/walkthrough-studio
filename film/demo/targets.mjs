// Stand-in element boxes for the demo, in capture CSS px (1440x810), shaped like what the
// recorder logs ({ x, y, w, h }). The placeholder footage draws these boxes so alignment of the
// pointer tip, spotlight outline and camera framing can be checked by eye.
export const TARGETS = {
  composer: { x: 300, y: 560, w: 840, h: 200 },
  picker: { x: 330, y: 704, w: 150, h: 40 },
  send: { x: 1068, y: 704, w: 48, h: 40 },
  worked: { x: 840, y: 196, w: 220, h: 30 },
  options: { x: 120, y: 120, w: 1200, h: 400 },
  exportBtn: { x: 1296, y: 14, w: 120, h: 38 },
};
export const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
