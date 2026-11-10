// Local occupied cells are shared data geometry, independent of board rules.
export function cellsOf(block) {
  return block.cells ?? Array.from({ length: block.len * (block.height ?? 1) }, (_, i) =>
    ({ row: Math.floor(i / block.len), col: i % block.len }));
}

// Ordinary bars draw as one face; a Totem draws its individual occupied cells.
export function facesOf(block) {
  return block.kind === 'totem' ? cellsOf(block).map(cell => ({ ...cell, len: 1 }))
    : [{ row: 0, col: 0, len: block.len }];
}
