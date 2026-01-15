// Game Configuration
const CONFIG = {
    LANES: 4,
    NOTE_SPEED: 0.3, // pixels per millisecond
    HIT_WINDOW: 150, // milliseconds
    PERFECT_WINDOW: 50, // milliseconds
    CANVAS_HEIGHT: 500,
    HIT_LINE_Y: 450, // Y position where notes should be hit
    NOTE_HEIGHT: 30,
    LANE_WIDTH: 0, // Will be calculated
};

// Game State
const gameState = {
    mode: 'idle', // 'idle', 'recording', 'playback'
    recordedNotes: [],
    playbackNotes: [],
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    totalNotes: 0,
    startTime: 0,
    currentTime: 0,
};

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = canvas.offsetWidth;
canvas.height = CONFIG.CANVAS_HEIGHT;
CONFIG.LANE_WIDTH = canvas.width / CONFIG.LANES;

// Key mapping
const KEY_MAP = {
    'ArrowLeft': 0,
    'ArrowDown': 1,
    'ArrowUp': 2,
    'ArrowRight': 3,
};

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const playbackBtn = document.getElementById('playbackBtn');
const resetBtn = document.getElementById('resetBtn');
const currentPlayerEl = document.getElementById('current-player');
const gameInstructionsEl = document.getElementById('game-instructions');
const scoreEl = document.getElementById('score');
const accuracyEl = document.getElementById('accuracy');
const comboEl = document.getElementById('combo');

// Initialize
function init() {
    setupEventListeners();
    gameLoop();
}

// Event Listeners
function setupEventListeners() {
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    playbackBtn.addEventListener('click', startPlayback);
    resetBtn.addEventListener('click', resetGame);
    
    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('keyup', handleKeyRelease);
    window.addEventListener('resize', handleResize);
}

function handleResize() {
    canvas.width = canvas.offsetWidth;
    CONFIG.LANE_WIDTH = canvas.width / CONFIG.LANES;
}

function handleKeyPress(e) {
    if (!KEY_MAP.hasOwnProperty(e.key)) return;
    
    const lane = KEY_MAP[e.key];
    const laneKey = document.querySelector(`.lane[data-lane="${lane}"] .lane-key`);
    if (laneKey) {
        laneKey.classList.add('active');
    }
    
    if (gameState.mode === 'recording') {
        recordNote(lane);
    } else if (gameState.mode === 'playback') {
        checkHit(lane);
    }
}

function handleKeyRelease(e) {
    if (!KEY_MAP.hasOwnProperty(e.key)) return;
    
    const lane = KEY_MAP[e.key];
    const laneKey = document.querySelector(`.lane[data-lane="${lane}"] .lane-key`);
    if (laneKey) {
        laneKey.classList.remove('active');
    }
}

// Recording Functions
function startRecording() {
    gameState.mode = 'recording';
    gameState.recordedNotes = [];
    gameState.startTime = Date.now();
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    playbackBtn.disabled = true;
    
    currentPlayerEl.textContent = 'Player 1: Recording...';
    gameInstructionsEl.textContent = 'Press arrow keys to create your rhythm!';
    
    updateUI();
}

function recordNote(lane) {
    const timestamp = Date.now() - gameState.startTime;
    gameState.recordedNotes.push({
        lane: lane,
        timestamp: timestamp,
        y: 0, // Will be calculated during playback
    });
}

function stopRecording() {
    if (gameState.mode !== 'recording') return;
    
    gameState.mode = 'idle';
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    playbackBtn.disabled = gameState.recordedNotes.length === 0;
    
    currentPlayerEl.textContent = 'Player 1: Finished Recording';
    gameInstructionsEl.textContent = `Recorded ${gameState.recordedNotes.length} notes! Click "Start Playback" for Player 2.`;
    
    // Prepare notes for playback
    preparePlaybackNotes();
}

function preparePlaybackNotes() {
    gameState.playbackNotes = gameState.recordedNotes.map(note => ({
        ...note,
        y: -CONFIG.NOTE_HEIGHT,
        hit: false,
        missed: false,
    }));
    gameState.totalNotes = gameState.playbackNotes.length;
}

// Playback Functions
function startPlayback() {
    if (gameState.playbackNotes.length === 0) {
        // Re-prepare notes if needed
        if (gameState.recordedNotes.length > 0) {
            preparePlaybackNotes();
        } else {
            return;
        }
    }
    
    // Reset all notes for playback
    gameState.playbackNotes.forEach(note => {
        note.hit = false;
        note.missed = false;
    });
    
    gameState.mode = 'playback';
    gameState.startTime = Date.now();
    gameState.score = 0;
    gameState.combo = 0;
    gameState.hits = 0;
    gameState.misses = 0;
    
    startBtn.disabled = true;
    stopBtn.disabled = true;
    playbackBtn.disabled = true;
    
    currentPlayerEl.textContent = 'Player 2: Playback Mode';
    gameInstructionsEl.textContent = 'Match the rhythm by pressing arrow keys when notes hit the bottom!';
    
    updateUI();
}

function checkHit(lane) {
    const currentTime = Date.now() - gameState.startTime;
    
    // Find the closest note in this lane that hasn't been hit
    let closestNote = null;
    let closestDistance = Infinity;
    
    for (const note of gameState.playbackNotes) {
        if (note.lane !== lane || note.hit || note.missed) continue;
        
        // Calculate expected time for note to reach hit line
        const noteTime = note.timestamp;
        const distance = Math.abs(currentTime - noteTime);
        
        // Only consider notes that are near the hit line
        if (distance < closestDistance && distance <= CONFIG.HIT_WINDOW) {
            closestDistance = distance;
            closestNote = note;
        }
    }
    
    if (closestNote) {
        hitNote(closestNote, closestDistance);
    }
}

function hitNote(note, timingOffset) {
    note.hit = true;
    gameState.hits++;
    gameState.combo++;
    
    if (gameState.combo > gameState.maxCombo) {
        gameState.maxCombo = gameState.combo;
    }
    
    // Scoring based on timing
    let points = 0;
    if (timingOffset <= CONFIG.PERFECT_WINDOW) {
        points = 100;
    } else if (timingOffset <= CONFIG.HIT_WINDOW) {
        points = 50;
    }
    
    gameState.score += points * (1 + gameState.combo * 0.1);
    
    // Visual feedback
    showHitEffect(note.lane);
    updateUI();
}

function showHitEffect(lane) {
    const hitIndicator = document.getElementById(`hit-${lane}`);
    hitIndicator.classList.add('show');
    setTimeout(() => {
        hitIndicator.classList.remove('show');
    }, 200);
}

// Rendering
function render() {
    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw lanes
    drawLanes();
    
    // Draw hit line
    drawHitLine();
    
    // Draw notes
    if (gameState.mode === 'playback') {
        drawPlaybackNotes();
    } else if (gameState.mode === 'recording') {
        drawRecordingNotes();
    }
}

function drawLanes() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    
    for (let i = 0; i <= CONFIG.LANES; i++) {
        const x = i * CONFIG.LANE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
}

function drawHitLine() {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.HIT_LINE_Y);
    ctx.lineTo(canvas.width, CONFIG.HIT_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawPlaybackNotes() {
    const currentTime = Date.now() - gameState.startTime;
    
    // Calculate time needed for note to travel from top to hit line
    const travelTime = CONFIG.HIT_LINE_Y / CONFIG.NOTE_SPEED;
    
    for (const note of gameState.playbackNotes) {
        if (note.hit || note.missed) continue;
        
        // Calculate when note should appear at top
        const noteAppearTime = note.timestamp - travelTime;
        
        // Check if note should be visible yet
        if (currentTime < noteAppearTime) continue;
        
        // Calculate note position (starts at top, moves down)
        const timeSinceAppear = currentTime - noteAppearTime;
        const y = timeSinceAppear * CONFIG.NOTE_SPEED;
        
        // Check if note is missed (passed hit line)
        if (y > CONFIG.HIT_LINE_Y + 50) {
            missNote(note);
            continue;
        }
        
        // Only draw if note is visible
        if (y > -CONFIG.NOTE_HEIGHT && y < canvas.height) {
            drawNote(note.lane, y, '#ff6b6b');
        }
    }
}

function drawRecordingNotes() {
    const currentTime = Date.now() - gameState.startTime;
    const travelTime = CONFIG.HIT_LINE_Y / CONFIG.NOTE_SPEED;
    
    for (const note of gameState.recordedNotes) {
        const noteAppearTime = note.timestamp - travelTime;
        
        if (currentTime < noteAppearTime) continue;
        
        const timeSinceAppear = currentTime - noteAppearTime;
        const y = timeSinceAppear * CONFIG.NOTE_SPEED;
        
        if (y > -CONFIG.NOTE_HEIGHT && y < canvas.height) {
            drawNote(note.lane, y, '#4ecdc4');
        }
    }
}

function drawNote(lane, y, color) {
    const x = lane * CONFIG.LANE_WIDTH;
    const width = CONFIG.LANE_WIDTH - 4;
    
    // Draw note rectangle
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y, width, CONFIG.NOTE_HEIGHT);
    
    // Draw note border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y, width, CONFIG.NOTE_HEIGHT);
    
    // Draw glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.fillRect(x + 2, y, width, CONFIG.NOTE_HEIGHT);
    ctx.shadowBlur = 0;
}

function missNote(note) {
    note.missed = true;
    gameState.misses++;
    gameState.combo = 0;
    updateUI();
}

// UI Updates
function updateUI() {
    scoreEl.textContent = Math.floor(gameState.score);
    
    const total = gameState.hits + gameState.misses;
    const accuracy = total > 0 ? ((gameState.hits / total) * 100).toFixed(1) : 100;
    accuracyEl.textContent = `${accuracy}%`;
    
    comboEl.textContent = gameState.combo;
    
    // Check if playback is finished
    if (gameState.mode === 'playback') {
        const allProcessed = gameState.playbackNotes.every(note => note.hit || note.missed);
        if (allProcessed) {
            finishPlayback();
        }
    }
}

function finishPlayback() {
    gameState.mode = 'idle';
    
    const accuracy = gameState.totalNotes > 0 
        ? ((gameState.hits / gameState.totalNotes) * 100).toFixed(1) 
        : 0;
    
    currentPlayerEl.textContent = 'Playback Complete!';
    gameInstructionsEl.textContent = 
        `Final Score: ${Math.floor(gameState.score)} | Accuracy: ${accuracy}% | Max Combo: ${gameState.maxCombo}`;
    
    startBtn.disabled = false;
    playbackBtn.disabled = false;
}

function resetGame() {
    gameState.mode = 'idle';
    gameState.recordedNotes = [];
    gameState.playbackNotes = [];
    gameState.score = 0;
    gameState.combo = 0;
    gameState.maxCombo = 0;
    gameState.hits = 0;
    gameState.misses = 0;
    gameState.totalNotes = 0;
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    playbackBtn.disabled = true;
    
    currentPlayerEl.textContent = 'Player 1: Record';
    gameInstructionsEl.textContent = 'Press arrow keys to create your rhythm pattern!';
    
    updateUI();
}

// Game Loop
function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
}

// Initialize game
init();
