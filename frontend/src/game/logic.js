// 3D Tic-Tac-Toe game logic for NxNxN cubes
// Cell index = l*N*N + r*N + c  (level, row, col) in [0, N)

export const PLAYER_MARKS = ["X", "O", "TRI"];
export const PLAYER_COLORS = ["#00F0FF", "#FF5500", "#00FF66"];

export function idx(N, l, r, c) {
  return l * N * N + r * N + c;
}

export function emptyBoard(N) {
  return new Array(N * N * N).fill(null);
}

/** Returns array of winning lines; each line is an array of flat cell indices (length N). */
export function generateLines(N) {
  const lines = [];
  const push = (cells) => lines.push(cells);

  // 1. Horizontal rows within each level (vary c)
  for (let l = 0; l < N; l++)
    for (let r = 0; r < N; r++) {
      const line = [];
      for (let c = 0; c < N; c++) line.push(idx(N, l, r, c));
      push(line);
    }

  // 2. Vertical cols within each level (vary r)
  for (let l = 0; l < N; l++)
    for (let c = 0; c < N; c++) {
      const line = [];
      for (let r = 0; r < N; r++) line.push(idx(N, l, r, c));
      push(line);
    }

  // 3. Diagonals within each level
  for (let l = 0; l < N; l++) {
    const d1 = [], d2 = [];
    for (let k = 0; k < N; k++) {
      d1.push(idx(N, l, k, k));
      d2.push(idx(N, l, k, N - 1 - k));
    }
    push(d1); push(d2);
  }

  // 4. Vertical through levels (same r, c, vary l)
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const line = [];
      for (let l = 0; l < N; l++) line.push(idx(N, l, r, c));
      push(line);
    }

  // 5. Vertical plane diagonals (fix r, vary l and c)
  for (let r = 0; r < N; r++) {
    const d1 = [], d2 = [];
    for (let k = 0; k < N; k++) {
      d1.push(idx(N, k, r, k));
      d2.push(idx(N, k, r, N - 1 - k));
    }
    push(d1); push(d2);
  }

  // 6. Vertical plane diagonals (fix c, vary l and r)
  for (let c = 0; c < N; c++) {
    const d1 = [], d2 = [];
    for (let k = 0; k < N; k++) {
      d1.push(idx(N, k, k, c));
      d2.push(idx(N, k, N - 1 - k, c));
    }
    push(d1); push(d2);
  }

  // 7. Space diagonals through the cube (4)
  const s1 = [], s2 = [], s3 = [], s4 = [];
  for (let k = 0; k < N; k++) {
    s1.push(idx(N, k, k, k));
    s2.push(idx(N, k, k, N - 1 - k));
    s3.push(idx(N, k, N - 1 - k, k));
    s4.push(idx(N, k, N - 1 - k, N - 1 - k));
  }
  push(s1); push(s2); push(s3); push(s4);

  return lines;
}

export function cellKey(N, l, r, c) {
  return `${l}-${r}-${c}`;
}

export function cellNotation(N, flat) {
  const N2 = N * N;
  const l = Math.floor(flat / N2);
  const rest = flat % N2;
  const r = Math.floor(rest / N);
  const c = rest % N;
  return { l, r, c, label: `L${l + 1}·R${r + 1}·C${c + 1}` };
}

/** Checks board; returns { winner: playerId|null, line: number[]|null } */
export function checkWinner(board, lines) {
  for (const line of lines) {
    const v0 = board[line[0]];
    if (v0 === null || v0 === undefined) continue;
    let ok = true;
    for (let i = 1; i < line.length; i++) {
      if (board[line[i]] !== v0) { ok = false; break; }
    }
    if (ok) return { winner: v0, line };
  }
  return { winner: null, line: null };
}

/** True when no empty cells left or no winning line can be completed. */
export function isDraw(board, lines, numPlayers) {
  const hasEmpty = board.some((v) => v === null);
  if (!hasEmpty) return true;
  // fast check: if no line has all cells that are "still reachable by a single player", it's a draw
  for (const line of lines) {
    const players = new Set();
    let canWin = true;
    for (const idxc of line) {
      const v = board[idxc];
      if (v !== null) players.add(v);
      if (players.size > 1) { canWin = false; break; }
    }
    if (canWin) return false;
  }
  return true;
}

export function emptyCells(board) {
  const out = [];
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i);
  return out;
}

export function cloneBoard(board) {
  return board.slice();
}
