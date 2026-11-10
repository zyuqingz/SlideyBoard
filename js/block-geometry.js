// Local occupied cells are shared data geometry, independent of board rules.
export function cellsOf(block) {
  return block.cells ?? Array.from({ length: block.len * (block.height ?? 1) }, (_, i) =>
    ({ row: Math.floor(i / block.len), col: i % block.len }));
}

export function isCarved(block) {
  return block.kind === 'totem' || block.face === 'smile' || !!block.cells;
}

// Ordinary bars draw as one face; carved pieces draw each occupied cell.
export function facesOf(block) {
  return isCarved(block)
    ? cellsOf(block).map(cell => ({ ...cell, len: 1 }))
    : [{ row: 0, col: 0, len: block.len }];
}
