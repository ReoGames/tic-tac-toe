
window.addEventListener("firebase-ready", () => {

  // ── Firebase helpers (set by index.html module) ───────
  const db       = window.__db;
  const ref      = window.__ref;
  const set      = window.__set;
  const get      = window.__get;
  const onValue  = window.__onValue;
  const update   = window.__update;

  // ── DOM refs ──────────────────────────────────────────
  const lobbyEl     = document.getElementById('lobby');
  const waitingEl   = document.getElementById('waiting');
  const gameEl      = document.getElementById('game');
  const cells       = document.querySelectorAll('.cell');
  const statusMsg   = document.getElementById('status-msg');
  const roomLabel   = document.getElementById('room-label');
  const displayCode = document.getElementById('display-room-code');
  const rematchBtn  = document.getElementById('rematch-btn');
  const xScoreEl    = document.getElementById('x-score');
  const oScoreEl    = document.getElementById('o-score');
  const drawScoreEl = document.getElementById('draw-score');
  const xLabel      = document.getElementById('x-label');
  const oLabel      = document.getElementById('o-label');

  // ── Session state ─────────────────────────────────────
  let myRole    = null;   // 'X' or 'O'
  let myName    = '';
  let roomCode  = null;
  let unsubscribe = null; // Firebase listener detach fn

  // ── LOBBY EVENTS ──────────────────────────────────────
  document.getElementById('create-btn').addEventListener('click', createRoom);
  document.getElementById('join-btn').addEventListener('click', joinRoom);
  document.getElementById('cancel-btn').addEventListener('click', cancelRoom);
  document.getElementById('leave-btn').addEventListener('click', leaveGame);
  rematchBtn.addEventListener('click', requestRematch);
  roomLabel.addEventListener('click', () => copyToClipboard(roomCode));

  // ── CREATE ROOM ───────────────────────────────────────
  async function createRoom() {
    const name = getNameInput();
    if (!name) return;

    // Generate a 6-char uppercase code
    roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    myRole   = 'X';
    myName   = name;

    Game.resetBoard('X');

    await set(ref(db, `rooms/${roomCode}`), {
      host:      name,
      guest:     null,
      status:    'waiting',   // waiting | playing | rematch
      xName:     name,
      oName:     null,
      ...Game.toSnapshot()
    });

    showWaiting();
    subscribeToRoom();
  }

  // ── JOIN ROOM ─────────────────────────────────────────
  async function joinRoom() {
    const name = getNameInput();
    const code = document.getElementById('room-input').value.trim().toUpperCase();
    if (!name) return;
    if (!code) { showToast('Enter a room code'); return; }

    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) { showToast('Room not found'); return; }

    const data = snap.val();
    if (data.guest) { showToast('Room is full'); return; }

    roomCode = code;
    myRole   = 'O';
    myName   = name;

    await update(ref(db, `rooms/${roomCode}`), {
      guest:   name,
      oName:   name,
      status: 'playing'
    });

    subscribeToRoom();
  }

  // ── FIREBASE LISTENER ────────────────────────────────
  function subscribeToRoom() {
    if (unsubscribe) unsubscribe();

    const roomRef = ref(db, `rooms/${roomCode}`);
    unsubscribe = onValue(roomRef, (snap) => {
      if (!snap.exists()) { leaveGame(); return; }
      const data = snap.val();
      handleRoomUpdate(data);
    });
  }

  function handleRoomUpdate(data) {
    // ── Waiting for guest ──
    if (data.status === 'waiting' && myRole === 'X') {
      showWaiting();
      return;
    }

    // ── Game in progress or rematch ──
    if (data.status === 'playing' || data.status === 'rematch') {
      Game.syncFromSnapshot(data);
      showGame(data);
    }
  }

  // ── CELL CLICK ────────────────────────────────────────
  cells.forEach(cell => {
    cell.addEventListener('click', async () => {
      const idx = parseInt(cell.dataset.index);

      if (Game.getCurrentTurn() !== myRole) return;
      if (Game.isGameOver()) return;
      if (cell.classList.contains('taken')) return;

      const result = Game.makeMove(idx, myRole);
      if (!result.ok) return;

      // Push new state to Firebase so both players see it
      await update(ref(db, `rooms/${roomCode}`), Game.toSnapshot());
    });
  });

  // ── REMATCH ───────────────────────────────────────────
  async function requestRematch() {
    const nextStart = myRole === 'X' ? 'O' : 'X'; // alternate who starts
    Game.resetBoard(nextStart);

    await update(ref(db, `rooms/${roomCode}`), {
      status: 'rematch',
      ...Game.toSnapshot()
    });
    rematchBtn.style.display = 'none';
  }

  // ── CANCEL / LEAVE ────────────────────────────────────
  async function cancelRoom() {
    if (roomCode) await set(ref(db, `rooms/${roomCode}`), null);
    resetSession();
  }

  async function leaveGame() {
    if (roomCode) await set(ref(db, `rooms/${roomCode}`), null);
    resetSession();
  }

  function resetSession() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    roomCode = null; myRole = null;
    Game.resetBoard();
    showLobby();
  }

  // ── RENDER GAME STATE ─────────────────────────────────
  function showGame(data) {
    lobbyEl.style.display   = 'none';
    waitingEl.style.display = 'none';
    gameEl.style.display    = 'flex';

    const board   = Game.getBoard();
    const scores  = Game.getScores();
    const winLine = Game.getWinLine(board);

    // Labels
    xLabel.textContent = data.xName || 'X';
    oLabel.textContent = data.oName || 'O';

    // Scores
    xScoreEl.textContent    = scores.X;
    oScoreEl.textContent    = scores.O;
    drawScoreEl.textContent = scores.draw;

    // Room label
    roomLabel.textContent = `⊞ ${roomCode}`;

    // Render cells
    cells.forEach((cell, i) => {
      cell.textContent = board[i] || '';
      cell.className   = 'cell';
      if (board[i]) {
        cell.classList.add(board[i].toLowerCase(), 'taken');
      }
      if (winLine && winLine.includes(i)) {
        cell.classList.add('win-cell');
      }
    });

    // Status message
    if (winLine) {
      const winner     = board[winLine[0]];
      const winnerName = winner === 'X' ? (data.xName || 'X') : (data.oName || 'O');
      const isMe       = winner === myRole;
      setStatus(isMe ? `🏆 You win!` : `${winnerName} wins!`, 'win');
      rematchBtn.style.display = 'block';
    } else if (Game.isGameOver()) {
      setStatus("It's a draw!", 'win');
      rematchBtn.style.display = 'block';
    } else {
      const turn     = Game.getCurrentTurn();
      const turnName = turn === 'X' ? (data.xName || 'X') : (data.oName || 'O');
      const isMyTurn = turn === myRole;
      setStatus(isMyTurn ? 'Your turn' : `${turnName}'s turn`, turn.toLowerCase());
      rematchBtn.style.display = 'none';
    }
  }

  // ── UI HELPERS ────────────────────────────────────────
  function showLobby() {
    lobbyEl.style.display   = 'flex';
    waitingEl.style.display = 'none';
    gameEl.style.display    = 'none';
  }

  function showWaiting() {
    lobbyEl.style.display   = 'none';
    waitingEl.style.display = 'flex';
    gameEl.style.display    = 'none';
    displayCode.textContent = roomCode;
  }

  function setStatus(msg, cls) {
    statusMsg.textContent = msg;
    statusMsg.className   = cls || '';
  }

  function getNameInput() {
    const v = document.getElementById('name-input').value.trim();
    if (!v) { showToast('Enter your name first'); return null; }
    return v;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Room code copied!'));
  }

  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ── INIT ──────────────────────────────────────────────
  showLobby();
});
