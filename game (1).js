/**
 * ╔══════════════════════════════════════════════════════╗
 * ║  game.js — DEV 1 OWNS THIS FILE                      ║
 * ║  Pure game logic. Zero Firebase / DOM dependencies.  ║
 * ║  Exports a Game object consumed by networking.js     ║
 * ╚══════════════════════════════════════════════════════╝
 */

const Game = (() => {

  // ── WIN COMBINATIONS ──────────────────────────────────
  const WIN_LINES = [
    [0,1,2], [3,4,5], [6,7,8], // rows
    [0,3,6], [1,4,7], [2,5,8], // cols
    [0,4,8], [2,4,6]           // diagonals
  ];

  // ── STATE ─────────────────────────────────────────────
  // Blank 9-cell board. 'X', 'O', or null.
  let board       = Array(9).fill(null);
  let currentTurn = 'X';   // whose turn it is
  let gameOver    = false;
  let scores      = { X: 0, O: 0, draw: 0 };

  // ── PUBLIC API ────────────────────────────────────────

  /**
   * Reset the board for a new round.
   * Scores persist across rounds.
   * @param {string} startingTurn - 'X' or 'O' (default 'X')
   */
  function resetBoard(startingTurn = 'X') {
    board       = Array(9).fill(null);
    currentTurn = startingTurn;
    gameOver    = false;
  }

  /**
   * Attempt a move at position index (0–8).
   * Returns a result object; does NOT mutate Firebase.
   *
   * @param {number} index - cell index 0-8
   * @param {string} player - 'X' or 'O'
   * @returns {{ ok: boolean, board: array, winner: string|null,
   *             winLine: number[]|null, isDraw: boolean, nextTurn: string }}
   */
  function makeMove(index, player) {
    // Guard: invalid move
    if (gameOver || board[index] !== null || player !== currentTurn) {
      return { ok: false };
    }

    board[index] = player;

    const winLine = getWinLine(board);
    const winner  = winLine ? board[winLine[0]] : null;
    const isDraw  = !winner && board.every(c => c !== null);

    if (winner) {
      scores[winner]++;
      gameOver = true;
    } else if (isDraw) {
      scores.draw++;
      gameOver = true;
    } else {
      currentTurn = player === 'X' ? 'O' : 'X';
    }

    return {
      ok:       true,
      board:    [...board],
      winner,
      winLine,
      isDraw,
      nextTurn: currentTurn
    };
  }

  /**
   * Check a given board array for a winner.
   * Returns the winning [i,j,k] triple or null.
   * @param {Array} b
   * @returns {number[]|null}
   */
  function getWinLine(b) {
    for (const line of WIN_LINES) {
      const [a, i, j] = line;
      if (b[a] && b[a] === b[i] && b[a] === b[j]) return line;
    }
    return null;
  }

  /**
   * Rebuild local state from a Firebase snapshot.
   * Called by networking.js whenever remote state changes.
   * @param {object} snapshot - Firebase game data
   */
  function syncFromSnapshot(snapshot) {
    if (!snapshot) return;
    board       = snapshot.board       ?? Array(9).fill(null);
    currentTurn = snapshot.currentTurn ?? 'X';
    gameOver    = snapshot.gameOver    ?? false;
    scores      = snapshot.scores      ?? { X: 0, O: 0, draw: 0 };
  }

  /**
   * Serialize current state for Firebase write.
   * @returns {object}
   */
  function toSnapshot() {
    return {
      board:       [...board],
      currentTurn,
      gameOver,
      scores:      { ...scores }
    };
  }

  // Getters
  const getBoard       = () => [...board];
  const getCurrentTurn = () => currentTurn;
  const isGameOver     = () => gameOver;
  const getScores      = () => ({ ...scores });
  const getWinLines    = () => WIN_LINES;

  return {
    resetBoard,
    makeMove,
    getWinLine,
    syncFromSnapshot,
    toSnapshot,
    getBoard,
    getCurrentTurn,
    isGameOver,
    getScores,
    getWinLines
  };

})();
