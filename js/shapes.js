// Fixed, contiguous row spans; right is exclusive. Selected once per run.
const shape = (id, label, spans) => Object.freeze({ id, label,
  rows: Object.freeze(spans.map(([left, right]) => Object.freeze({ left, right }))) });

export const SHAPES = Object.freeze([
  shape('funnel', 'FUNNEL', [
    [2, 6], [2, 6], [2, 6], [1, 7], [1, 7],
    [1, 7], [0, 8], [0, 8], [0, 8], [0, 8]
  ]),
  shape('hourglass', 'HOURGLASS', [
    [0, 8], [0, 8], [1, 7], [2, 6], [2, 6],
    [2, 6], [2, 6], [1, 7], [0, 8], [0, 8]
  ]),
  shape('diamond', 'DIAMOND', [
    [2, 6], [1, 7], [1, 7], [0, 8], [0, 8],
    [0, 8], [0, 8], [1, 7], [1, 7], [2, 6]
  ]),
  shape('corridor', 'WINDING CORRIDOR', [
    [0, 5], [0, 5], [1, 6], [2, 7], [3, 8],
    [3, 8], [2, 7], [1, 6], [0, 5], [0, 5]
  ])
]);

export function chooseShape(random) {
  return structuredClone(SHAPES[Math.floor(random() * SHAPES.length)]);
}
