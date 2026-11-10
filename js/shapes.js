// Fixed, contiguous row spans; right is exclusive. Selected once per run.
const shape = (id, label, spans) => Object.freeze({ id, label,
  rows: Object.freeze(spans.map(([left, right]) => Object.freeze({ left, right }))) });

export const SHAPES = Object.freeze([
  shape('funnel', 'FUNNEL', [
    [2, 7], [2, 7], [2, 7], [1, 8], [1, 8],
    [1, 8], [0, 9], [0, 9], [0, 9], [0, 9]
  ]),
  shape('hourglass', 'HOURGLASS', [
    [0, 9], [0, 9], [1, 8], [2, 7], [2, 7],
    [2, 7], [2, 7], [1, 8], [0, 9], [0, 9]
  ]),
  shape('diamond', 'DIAMOND', [
    [2, 7], [1, 8], [1, 8], [0, 9], [0, 9],
    [0, 9], [0, 9], [1, 8], [1, 8], [2, 7]
  ]),
  shape('corridor', 'WINDING CORRIDOR', [
    [0, 5], [0, 5], [1, 6], [2, 7], [3, 8],
    [4, 9], [3, 8], [2, 7], [1, 6], [0, 5]
  ])
]);

export function chooseShape(random) {
  return structuredClone(SHAPES[Math.floor(random() * SHAPES.length)]);
}
