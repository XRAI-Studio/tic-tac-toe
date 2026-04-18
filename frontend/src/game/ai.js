import { emptyCells, cloneBoard } from "./logic";

// Heuristic evaluation for 2-player games:
// For each winning line, score based on how many of our/opponent's marks are on it.
function evaluateBoard(board, lines, me, opp) {
  let score = 0;
  for (const line of lines) {
    let mine = 0, other = 0;
    for (const i of line) {
      const v = board[i];
      if (v === me) mine++;
      else if (v === opp) other++;
    }
    if (mine > 0 && other > 0) continue; // blocked line
    if (mine > 0) {
      // exponential reward for more marks on same line
      score += Math.pow(10, mine);
    } else if (other > 0) {
      score -= Math.pow(10, other);
    }
  }
  return score;
}

function checkWinner(board, lines) {
  for (const line of lines) {
    const v0 = board[line[0]];
    if (v0 === null) continue;
    let ok = true;
    for (let i = 1; i < line.length; i++) if (board[line[i]] !== v0) { ok = false; break; }
    if (ok) return v0;
  }
  return null;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Find an immediate winning move for `player`, else null
function findWinningMove(board, lines, player) {
  const b = cloneBoard(board);
  for (const cell of emptyCells(b)) {
    b[cell] = player;
    if (checkWinner(b, lines) === player) { b[cell] = null; return cell; }
    b[cell] = null;
  }
  return null;
}

function centerBias(board, move, N) {
  // Prefer cells closer to the geometric center
  const N2 = N * N;
  const l = Math.floor(move / N2);
  const rest = move % N2;
  const r = Math.floor(rest / N);
  const c = rest % N;
  const mid = (N - 1) / 2;
  const d = Math.abs(l - mid) + Math.abs(r - mid) + Math.abs(c - mid);
  return -d; // bigger (less negative) = closer to center
}

// Easy: random, with 50% chance block when opponent has immediate win
export function pickEasyMove(board, lines, me, opp) {
  if (Math.random() < 0.5) {
    const block = findWinningMove(board, lines, opp);
    if (block !== null) return block;
  }
  return randomChoice(emptyCells(board));
}

// Medium: takes win if available, blocks immediate loss, else heuristic with 1-ply lookahead
export function pickMediumMove(board, lines, me, opp, N) {
  const win = findWinningMove(board, lines, me);
  if (win !== null) return win;
  const block = findWinningMove(board, lines, opp);
  if (block !== null) return block;

  let bestScore = -Infinity;
  let bestMoves = [];
  const b = cloneBoard(board);
  for (const cell of emptyCells(b)) {
    b[cell] = me;
    const s = evaluateBoard(b, lines, me, opp) + centerBias(b, cell, N) * 0.1;
    b[cell] = null;
    if (s > bestScore) { bestScore = s; bestMoves = [cell]; }
    else if (s === bestScore) bestMoves.push(cell);
  }
  return randomChoice(bestMoves);
}

// Hard: depth-limited alpha-beta with heuristic evaluation
export function pickHardMove(board, lines, me, opp, N) {
  // immediate tactics first (fast)
  const win = findWinningMove(board, lines, me);
  if (win !== null) return win;
  const block = findWinningMove(board, lines, opp);
  if (block !== null) return block;

  const maxDepth = N === 3 ? 4 : 2;

  const orderMoves = (b, moves) => {
    // order by heuristic value to help pruning
    return moves
      .map((m) => {
        b[m] = me;
        const s = evaluateBoard(b, lines, me, opp) + centerBias(b, m, N) * 0.05;
        b[m] = null;
        return { m, s };
      })
      .sort((a, z) => z.s - a.s)
      .map((x) => x.m);
  };

  const minimax = (b, depth, alpha, beta, maximizing) => {
    const w = checkWinner(b, lines);
    if (w === me) return 100000 - (maxDepth - depth);
    if (w === opp) return -100000 + (maxDepth - depth);
    const empty = emptyCells(b);
    if (depth === 0 || empty.length === 0) return evaluateBoard(b, lines, me, opp);

    const ordered = orderMoves(b, empty).slice(0, N === 3 ? empty.length : 10);
    if (maximizing) {
      let value = -Infinity;
      for (const m of ordered) {
        b[m] = me;
        value = Math.max(value, minimax(b, depth - 1, alpha, beta, false));
        b[m] = null;
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    } else {
      let value = Infinity;
      for (const m of ordered) {
        b[m] = opp;
        value = Math.min(value, minimax(b, depth - 1, alpha, beta, true));
        b[m] = null;
        beta = Math.min(beta, value);
        if (alpha >= beta) break;
      }
      return value;
    }
  };

  const b = cloneBoard(board);
  let bestScore = -Infinity;
  let bestMoves = [];
  const candidates = orderMoves(b, emptyCells(b)).slice(0, N === 3 ? 27 : 14);
  for (const m of candidates) {
    b[m] = me;
    const s = minimax(b, maxDepth - 1, -Infinity, Infinity, false);
    b[m] = null;
    if (s > bestScore) { bestScore = s; bestMoves = [m]; }
    else if (s === bestScore) bestMoves.push(m);
  }
  return randomChoice(bestMoves);
}

export function pickAIMove(difficulty, board, lines, me, opp, N) {
  if (difficulty === "easy") return pickEasyMove(board, lines, me, opp);
  if (difficulty === "medium") return pickMediumMove(board, lines, me, opp, N);
  return pickHardMove(board, lines, me, opp, N);
}
