// Game Configuration
const CONFIG = {
    LANES: 4,
    NOTE_SPEED: 0.3, // pixels per millisecond
    HIT_WINDOW: 150, // milliseconds
    PERFECT_WINDOW: 50, // milliseconds
    HIT_LINE_Y: 0, // Will be calculated based on canvas height
    NOTE_HEIGHT: 40,
    NOTE_WIDTH_OFFSET: 4, // Amount to subtract from lane width for note width
    RECORDING_TIME_LIMIT: 10, // seconds
};

// Sound Manager
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.initialized = false;
        this.initAudio();
    }

    async initAudio() {
        if (this.initialized) {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                    console.log('Audio context resumed');
                } catch (e) {
                    console.warn('Could not resume audio:', e);
                }
            }
            return;
        }
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context created, state:', this.audioContext.state);
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('Audio context resumed');
            }
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    async ensureAudio() {
        if (!this.initialized) {
            await this.initAudio();
        }
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (e) {
                console.warn('Could not resume audio context:', e);
            }
        }
    }

    playTone(frequency, duration, type = 'sine', volume = 0.5) {
        this.ensureAudio().then(() => {
            if (!this.audioContext || this.audioContext.state === 'suspended') {
                return;
            }

            try {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);

                oscillator.frequency.value = frequency;
                oscillator.type = type;

                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + duration);
            } catch (e) {
                console.warn('Error playing tone:', e);
            }
        }).catch(e => {
            console.warn('Audio error:', e);
        });
    }

    playNote(lane) {
        const frequencies = [220, 247, 262, 294]; // A, B, C, D notes
        this.playTone(frequencies[lane], 0.15, 'square', 0.4);
    }

    playHit(lane) {
        this.playNote(lane);
    }

    playMiss() {
        this.playTone(150, 0.25, 'sawtooth', 0.3);
    }
}

const soundManager = new SoundManager();

// Key mapping - Both players use ASDF (since they take turns)
const KEY_MAP = {
    'KeyA': 0,  // A = Left
    'KeyS': 1,  // S = Down
    'KeyD': 2,  // D = Up
    'KeyF': 3,  // F = Right
};

// Turn-based game state
const gameState = {
    currentTurn: 'player1', // 'player1' or 'player2'
    round: 1,
    countdownActive: false,
    lastRecordingPlayer: null, // Track who recorded last to ensure alternation
};

// Shared state
const sharedState = {
    recordedNotes: [],
    recordedBy: null, // 'player1' or 'player2'
};

// Player 1 State
const player1State = {
    mode: 'idle', // 'idle', 'recording', 'playback'
    recordedNotes: [],
    playbackNotes: [],
    startTime: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    totalNotes: 0,
    health: 100,
};

// Player 2 State
const player2State = {
    mode: 'idle', // 'idle', 'recording', 'playback'
    recordedNotes: [],
    playbackNotes: [],
    startTime: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: 0,
    misses: 0,
    totalNotes: 0,
    health: 100,
};

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    CONFIG.HIT_LINE_Y = canvas.height - 100;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// UI Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const sendBtn = document.getElementById('sendBtn');
const playbackBtn = document.getElementById('playbackBtn');
const resetBtn = document.getElementById('resetBtn');

const header = document.getElementById('header');
const headerStatus = document.getElementById('header-status');
const playerInfo = document.getElementById('player-info');
const playerName = document.getElementById('player-name');
const status = document.getElementById('status');
const score = document.getElementById('score');
const accuracy = document.getElementById('accuracy');
const combo = document.getElementById('combo');
const health = document.getElementById('health');
const canvasContainer = document.getElementById('canvas-container');
const laneIndicators = document.getElementById('lane-indicators');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText = document.getElementById('countdown-text');
const recordingTimer = document.getElementById('recording-timer');

let recordingTimerInterval = null;

// Get current player state
function getCurrentPlayer() {
    return gameState.currentTurn === 'player1' ? player1State : player2State;
}

function getOtherPlayer() {
    return gameState.currentTurn === 'player1' ? player2State : player1State;
}

// Turn Management
function switchTurn() {
    gameState.currentTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';
    if (gameState.currentTurn === 'player1') {
        gameState.round++;
    }
    updateUIForTurn();
}

// Switch to next recording player (alternates)
function switchToNextRecordingPlayer() {
    // Clear the recorded state so the next player can record
    sharedState.recordedNotes = [];
    sharedState.recordedBy = null;
    
    // The player who just finished playback should record next
    // This ensures alternation: 
    // Round 1: P1 records → P2 plays → Round 2: P2 records → P1 plays → Round 3: P1 records → etc.
    const justPlayed = gameState.currentTurn; // The player who just finished playback
    
    // The player who just played back records next (this alternates recording)
    gameState.currentTurn = justPlayed;
    gameState.lastRecordingPlayer = null; // Will be set when they record
    
    // Increment round when we cycle back to player1
    if (gameState.currentTurn === 'player1') {
        gameState.round++;
    }
    
    updateUIForTurn();
}

function updateUIForTurn() {
    const currentPlayer = getCurrentPlayer();
    const isPlayer1 = gameState.currentTurn === 'player1';
    
    // Update player name and colors
    playerName.textContent = isPlayer1 ? 'Player 1' : 'Player 2';
    playerName.className = `player-name ${isPlayer1 ? 'player1' : 'player2'}`;
    
    // Update color classes for all elements
    header.classList.remove('player1-active', 'player2-active');
    playerInfo.classList.remove('player1-active', 'player2-active');
    canvasContainer.classList.remove('player1-active', 'player2-active');
    laneIndicators.classList.remove('player1-active', 'player2-active');
    document.body.classList.remove('player1-active', 'player2-active');
    
    if (isPlayer1) {
        header.classList.add('player1-active');
        playerInfo.classList.add('player1-active');
        canvasContainer.classList.add('player1-active');
        laneIndicators.classList.add('player1-active');
        document.body.classList.add('player1-active');
    } else {
        header.classList.add('player2-active');
        playerInfo.classList.add('player2-active');
        canvasContainer.classList.add('player2-active');
        laneIndicators.classList.add('player2-active');
        document.body.classList.add('player2-active');
    }
    
    // Update header
    if (currentPlayer.mode === 'idle' && gameState.currentTurn === gameState.currentTurn) {
        if (gameState.currentTurn === 'player1' && sharedState.recordedBy !== 'player2') {
            headerStatus.textContent = `Round ${gameState.round} - Player 1's turn to record!`;
            headerStatus.style.color = '#ff00ff';
            headerStatus.style.textShadow = '0 0 10px #ff00ff, 0 0 20px #ff00ff';
        } else if (gameState.currentTurn === 'player2' && sharedState.recordedBy !== 'player1') {
            headerStatus.textContent = `Round ${gameState.round} - Player 2's turn to record!`;
            headerStatus.style.color = '#00ffff';
            headerStatus.style.textShadow = '0 0 10px #00ffff, 0 0 20px #00ffff';
        } else if (sharedState.recordedBy === 'player2' && gameState.currentTurn === 'player1') {
            headerStatus.textContent = `Round ${gameState.round} - Player 1's turn to play!`;
            headerStatus.style.color = '#ff00ff';
            headerStatus.style.textShadow = '0 0 10px #ff00ff, 0 0 20px #ff00ff';
        } else if (sharedState.recordedBy === 'player1' && gameState.currentTurn === 'player2') {
            headerStatus.textContent = `Round ${gameState.round} - Player 2's turn to play!`;
            headerStatus.style.color = '#00ffff';
            headerStatus.style.textShadow = '0 0 10px #00ffff, 0 0 20px #00ffff';
        }
    }
    
    // Update active state
    if (currentPlayer.mode === 'recording' || currentPlayer.mode === 'playback') {
        playerInfo.classList.add('active');
    } else {
        playerInfo.classList.remove('active');
    }
    
    // Update buttons
    if (gameState.currentTurn === 'player1' && currentPlayer.mode === 'idle' && sharedState.recordedBy !== 'player2') {
        // Player 1's turn to record
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';
        sendBtn.style.display = 'inline-block';
        playbackBtn.style.display = 'none';
        startBtn.disabled = false;
        status.textContent = `Round ${gameState.round} - Your turn to record!`;
    } else if (gameState.currentTurn === 'player2' && currentPlayer.mode === 'idle' && sharedState.recordedBy !== 'player1') {
        // Player 2's turn to record
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';
        sendBtn.style.display = 'inline-block';
        playbackBtn.style.display = 'none';
        startBtn.disabled = false;
        status.textContent = `Round ${gameState.round} - Your turn to record!`;
    } else if (sharedState.recordedBy === 'player2' && gameState.currentTurn === 'player1' && currentPlayer.mode === 'idle') {
        // Player 1's turn to playback
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        sendBtn.style.display = 'none';
        playbackBtn.style.display = 'inline-block';
        playbackBtn.disabled = false;
        status.textContent = `Round ${gameState.round} - Your turn to play!`;
    } else if (sharedState.recordedBy === 'player1' && gameState.currentTurn === 'player2' && currentPlayer.mode === 'idle') {
        // Player 2's turn to playback
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        sendBtn.style.display = 'none';
        playbackBtn.style.display = 'inline-block';
        playbackBtn.disabled = false;
        status.textContent = `Round ${gameState.round} - Your turn to play!`;
    } else {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        sendBtn.style.display = 'none';
        playbackBtn.style.display = 'none';
    }
    
    updateUI();
}

// Game Functions
function startRecording() {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.mode !== 'idle') return;
    
    // Start recording immediately, but ignore notes in first second
    currentPlayer.mode = 'recording';
    currentPlayer.recordedNotes = [];
    currentPlayer.startTime = Date.now();
    currentPlayer.recordingEndTime = currentPlayer.startTime + (CONFIG.RECORDING_TIME_LIMIT * 1000);
    
    startBtn.disabled = true;
    stopBtn.disabled = false;
    sendBtn.disabled = true;
    
    // Show and start timer immediately
    recordingTimer.style.display = 'block';
    recordingTimer.classList.remove('warning');
    updateRecordingTimer();
    recordingTimerInterval = setInterval(updateRecordingTimer, 100);
    
    status.textContent = 'Recording... Press ASDF keys!';
    updateUI();
}

function updateRecordingTimer() {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.mode !== 'recording') {
        recordingTimer.style.display = 'none';
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }
        return;
    }
    
    const now = Date.now();
    const remaining = Math.max(0, currentPlayer.recordingEndTime - now);
    const remainingSeconds = (remaining / 1000).toFixed(1);
    
    recordingTimer.textContent = `Time: ${remainingSeconds}s`;
    
    // Add warning class when time is running out
    if (remaining <= 3000) { // 3 seconds or less
        recordingTimer.classList.add('warning');
    } else {
        recordingTimer.classList.remove('warning');
    }
    
    // Auto-stop when time runs out
    if (remaining <= 0) {
        stopRecording();
    }
}

function recordNote(lane) {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.mode !== 'recording') return;
    
    const timestamp = Date.now() - currentPlayer.startTime;
    
    // Ignore notes in the first second (1000ms) - this adds 1 second of zero notes at the start
    if (timestamp < 1000) return;
    
    currentPlayer.recordedNotes.push({
        lane: lane,
        timestamp: timestamp,
    });
    soundManager.playNote(lane);
    updateUI();
}

function stopRecording() {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.mode !== 'recording') return;
    
    // Clear timer
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
    recordingTimer.style.display = 'none';
    recordingTimer.classList.remove('warning');
    
    currentPlayer.mode = 'idle';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    sendBtn.disabled = currentPlayer.recordedNotes.length === 0;
    
    status.textContent = `Recorded ${currentPlayer.recordedNotes.length} notes!`;
    updateUI();
}

function sendNotes() {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.recordedNotes.length === 0) return;
    
    sharedState.recordedNotes = [...currentPlayer.recordedNotes];
    sharedState.recordedBy = gameState.currentTurn;
    
    // Track who just recorded
    gameState.lastRecordingPlayer = gameState.currentTurn;
    
    const otherPlayer = getOtherPlayer();
    preparePlaybackNotes(otherPlayer);
    
    sendBtn.disabled = true;
    status.textContent = 'Notes sent!';
    
    // Switch to other player's turn for playback
    switchTurn();
}

function startPlayback() {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.playbackNotes.length === 0) {
        if (sharedState.recordedNotes.length > 0) {
            preparePlaybackNotes(currentPlayer);
        } else {
            return;
        }
    }
    
    currentPlayer.playbackNotes.forEach(note => {
        note.hit = false;
        note.missed = false;
    });
    
    playbackBtn.disabled = true;
    status.textContent = 'Get ready...';
    
    // Reset health for new round
    currentPlayer.health = 100;
    
    // Two second delay before starting
    gameState.countdownActive = true;
    
    setTimeout(() => {
        currentPlayer.mode = 'playback';
        currentPlayer.startTime = Date.now();
        currentPlayer.combo = 0;
        currentPlayer.hits = 0;
        currentPlayer.misses = 0;
        gameState.countdownActive = false;
        
        status.textContent = 'Playback started! Press ASDF keys!';
        updateUI();
    }, 2000);
}

function checkHit(lane) {
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.mode !== 'playback' || gameState.countdownActive) return;
    
    const currentTime = Date.now() - currentPlayer.startTime;
    
    let closestNote = null;
    let closestDistance = Infinity;
    
    for (const note of currentPlayer.playbackNotes) {
        if (note.lane !== lane || note.hit || note.missed) continue;
        
        const noteTime = note.timestamp;
        const distance = Math.abs(currentTime - noteTime);
        
        if (distance < closestDistance && distance <= CONFIG.HIT_WINDOW) {
            closestDistance = distance;
            closestNote = note;
        }
    }
    
    if (closestNote) {
        hitNote(closestNote, closestDistance, lane);
    }
}

function hitNote(note, timingOffset, lane) {
    const currentPlayer = getCurrentPlayer();
    note.hit = true;
    currentPlayer.hits++;
    currentPlayer.combo++;
    
    if (currentPlayer.combo > currentPlayer.maxCombo) {
        currentPlayer.maxCombo = currentPlayer.combo;
    }
    
    let points = 0;
    if (timingOffset <= CONFIG.PERFECT_WINDOW) {
        points = 100;
    } else if (timingOffset <= CONFIG.HIT_WINDOW) {
        points = 50;
    }
    
    currentPlayer.score += Math.floor(points * (1 + currentPlayer.combo * 0.1));
    
    soundManager.playHit(note.lane);
    showHitEffect(lane);
    updateUI();
}

function showHitEffect(lane) {
    const hitIndicator = document.getElementById(`hit-${lane}`);
    hitIndicator.classList.add('show');
    setTimeout(() => {
        hitIndicator.classList.remove('show');
    }, 200);
}

function missNote(note) {
    const currentPlayer = getCurrentPlayer();
    if (note.missed) return; // Already processed
    
    note.missed = true;
    currentPlayer.misses++;
    currentPlayer.combo = 0;
    
    // Calculate health based on missed note percentage
    if (currentPlayer.totalNotes > 0) {
        const missPercentage = (currentPlayer.misses / currentPlayer.totalNotes) * 100;
        currentPlayer.health = Math.max(0, 100 - missPercentage);
    }
    
    soundManager.playMiss();
    updateUI();
}

function preparePlaybackNotes(player) {
    player.playbackNotes = sharedState.recordedNotes.map(note => ({
        ...note,
        hit: false,
        missed: false,
    }));
    player.totalNotes = player.playbackNotes.length;
}

function finishPlayback() {
    const currentPlayer = getCurrentPlayer();
    currentPlayer.mode = 'idle';
    const accuracy = currentPlayer.totalNotes > 0 
        ? ((currentPlayer.hits / currentPlayer.totalNotes) * 100).toFixed(1) 
        : 0;
    
    status.textContent = `Finished! Score: ${currentPlayer.score} | Accuracy: ${accuracy}% | Max Combo: ${currentPlayer.maxCombo}`;
    
    setTimeout(() => {
        // Switch to the next player who should record (alternating)
        switchToNextRecordingPlayer();
    }, 2000);
}

function resetGame() {
    gameState.currentTurn = 'player1';
    gameState.round = 1;
    gameState.lastRecordingPlayer = null;
    
    player1State.mode = 'idle';
    player1State.recordedNotes = [];
    player1State.playbackNotes = [];
    player1State.score = 0;
    player1State.combo = 0;
    player1State.hits = 0;
    player1State.misses = 0;
    player1State.totalNotes = 0;
    player1State.health = 100;
    
    player2State.mode = 'idle';
    player2State.recordedNotes = [];
    player2State.playbackNotes = [];
    player2State.score = 0;
    player2State.combo = 0;
    player2State.hits = 0;
    player2State.misses = 0;
    player2State.totalNotes = 0;
    player2State.health = 100;
    
    sharedState.recordedNotes = [];
    sharedState.recordedBy = null;
    
    updateUIForTurn();
    updateUI();
}

// Rendering
function drawLanes() {
    const laneWidth = canvas.width / CONFIG.LANES;
    const isPlayer1 = gameState.currentTurn === 'player1';
    ctx.strokeStyle = isPlayer1 ? 'rgba(255, 0, 255, 0.3)' : 'rgba(0, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    
    for (let i = 0; i <= CONFIG.LANES; i++) {
        const x = i * laneWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
}

function drawHitLine() {
    const isPlayer1 = gameState.currentTurn === 'player1';
    ctx.strokeStyle = isPlayer1 ? '#ff00ff' : '#00ffff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = isPlayer1 ? '#ff00ff' : '#00ffff';
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.HIT_LINE_Y);
    ctx.lineTo(canvas.width, CONFIG.HIT_LINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
}

function drawNote(lane, y, color) {
    const laneWidth = canvas.width / CONFIG.LANES;
    const x = lane * laneWidth;
    const width = laneWidth - CONFIG.NOTE_WIDTH_OFFSET;
    
    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.fillRect(x + 2, y, width, CONFIG.NOTE_HEIGHT);
    ctx.shadowBlur = 0;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y, width, CONFIG.NOTE_HEIGHT);
}

function render() {
    const currentPlayer = getCurrentPlayer();
    
    // Clear with dark background
    ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawLanes();
    drawHitLine();
    
    if (currentPlayer.mode === 'recording') {
        const currentTime = Date.now() - currentPlayer.startTime;
        const travelTime = CONFIG.HIT_LINE_Y / CONFIG.NOTE_SPEED;
        
        for (const note of currentPlayer.recordedNotes) {
            const noteAppearTime = note.timestamp - travelTime;
            if (currentTime < noteAppearTime) continue;
            
            const timeSinceAppear = currentTime - noteAppearTime;
            const y = timeSinceAppear * CONFIG.NOTE_SPEED;
            
            if (y > -CONFIG.NOTE_HEIGHT && y < canvas.height) {
                const isPlayer1 = gameState.currentTurn === 'player1';
                drawNote(note.lane, y, isPlayer1 ? '#ff00ff' : '#00ffff');
            }
        }
    } else if (currentPlayer.mode === 'playback') {
        const currentTime = Date.now() - currentPlayer.startTime;
        const travelTime = CONFIG.HIT_LINE_Y / CONFIG.NOTE_SPEED;
        
        for (const note of currentPlayer.playbackNotes) {
            if (note.hit || note.missed) continue;
            
            const noteAppearTime = note.timestamp - travelTime;
            if (currentTime < noteAppearTime) continue;
            
            const timeSinceAppear = currentTime - noteAppearTime;
            const y = timeSinceAppear * CONFIG.NOTE_SPEED;
            
            if (y > CONFIG.HIT_LINE_Y + 50) {
                missNote(note);
                continue;
            }
            
            if (y > -CONFIG.NOTE_HEIGHT && y < canvas.height) {
                const isPlayer1 = gameState.currentTurn === 'player1';
                const color = note.hit ? '#00ff00' : (isPlayer1 ? '#ff00ff' : '#00ffff');
                drawNote(note.lane, y, color);
            }
        }
        
        const allProcessed = currentPlayer.playbackNotes.every(note => note.hit || note.missed);
        if (allProcessed && currentPlayer.mode === 'playback') {
            finishPlayback();
        }
    }
}

// UI Updates
function updateUI() {
    const currentPlayer = getCurrentPlayer();
    
    score.textContent = Math.floor(currentPlayer.score);
    
    const total = currentPlayer.hits + currentPlayer.misses;
    const acc = total > 0 ? ((currentPlayer.hits / total) * 100).toFixed(1) : 100;
    accuracy.textContent = `${acc}%`;
    
    combo.textContent = currentPlayer.combo;
    
    // Update health percentage
    const healthValue = Math.max(0, Math.min(100, currentPlayer.health));
    health.textContent = `${Math.round(healthValue)}%`;
}

// Event Listeners
startBtn.addEventListener('click', () => {
    soundManager.initAudio();
    startRecording();
});
stopBtn.addEventListener('click', () => {
    soundManager.initAudio();
    stopRecording();
});
sendBtn.addEventListener('click', () => {
    soundManager.initAudio();
    sendNotes();
});
playbackBtn.addEventListener('click', () => {
    soundManager.initAudio();
    startPlayback();
});
resetBtn.addEventListener('click', () => {
    soundManager.initAudio();
    resetGame();
});

window.addEventListener('keydown', (e) => {
    soundManager.initAudio();
    
    // Handle Backtick (`) or Tilde (~) key: Toggle dev console
    if (e.code === 'Backquote' || e.key === '`' || e.key === '~' || e.keyCode === 192) {
        e.preventDefault();
        const devConsoleToggle = document.getElementById('dev-console-toggle');
        if (devConsoleToggle) {
            devConsoleToggle.click();
        }
        return;
    }
    
    // Handle Space key: Start recording / Start playback / Stop
    if (e.code === 'Space') {
        e.preventDefault(); // Prevent page scroll
        const currentPlayer = getCurrentPlayer();
        
        if (currentPlayer.mode === 'recording') {
            // Stop recording
            stopRecording();
        } else if (currentPlayer.mode === 'playback') {
            // Stop playback (if needed, or could be disabled during playback)
            // For now, space doesn't stop playback - only stops recording
        } else if (currentPlayer.mode === 'idle') {
            // Check if we should start recording or playback
            const startBtn = document.getElementById('startBtn');
            const playbackBtn = document.getElementById('playbackBtn');
            
            if (startBtn && startBtn.style.display !== 'none' && !startBtn.disabled) {
                startRecording();
            } else if (playbackBtn && playbackBtn.style.display !== 'none' && !playbackBtn.disabled) {
                startPlayback();
            }
        }
        return;
    }
    
    // Handle Enter key: Send notes
    if (e.code === 'Enter') {
        e.preventDefault();
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn && sendBtn.style.display !== 'none' && !sendBtn.disabled) {
            sendNotes();
        }
        return;
    }
    
    if (KEY_MAP.hasOwnProperty(e.code)) {
        const lane = KEY_MAP[e.code];
        const laneKey = document.getElementById(`key-${lane}`);
        if (laneKey) laneKey.classList.add('active');
        
        const currentPlayer = getCurrentPlayer();
        if (currentPlayer.mode === 'recording') {
            recordNote(lane);
        } else if (currentPlayer.mode === 'playback') {
            checkHit(lane);
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (KEY_MAP.hasOwnProperty(e.code)) {
        const lane = KEY_MAP[e.code];
        const laneKey = document.getElementById(`key-${lane}`);
        if (laneKey) laneKey.classList.remove('active');
    }
});

// Initialize audio on first user interaction
function initAudioOnInteraction() {
    soundManager.initAudio();
}

document.addEventListener('click', initAudioOnInteraction, { once: true });
document.addEventListener('keydown', initAudioOnInteraction, { once: true });
document.addEventListener('touchstart', initAudioOnInteraction, { once: true });

// Game Loop
function gameLoop() {
    render();
    requestAnimationFrame(gameLoop);
}

// Dev Console
function initDevConsole() {
    const devConsole = document.getElementById('dev-console');
    const devConsoleToggle = document.getElementById('dev-console-toggle');
    const devConsoleContent = document.getElementById('dev-console-content');
    const noteHeightInput = document.getElementById('note-height');
    const noteWidthOffsetInput = document.getElementById('note-width-offset');
    
    if (!devConsole) {
        console.warn('Dev console element not found');
        return;
    }
    
    // Ensure dev console is visible
    devConsole.style.display = 'block';
    
    // Toggle console visibility
    devConsoleToggle.addEventListener('click', () => {
        const isHidden = devConsoleContent.classList.contains('hidden');
        if (isHidden) {
            devConsoleContent.classList.remove('hidden');
            devConsoleToggle.textContent = 'Hide';
        } else {
            devConsoleContent.classList.add('hidden');
            devConsoleToggle.textContent = 'Show';
        }
    });
    
    // Update note height
    noteHeightInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value >= 10 && value <= 200) {
            CONFIG.NOTE_HEIGHT = value;
        }
    });
    
    // Update note width offset
    noteWidthOffsetInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value >= 0 && value <= 50) {
            CONFIG.NOTE_WIDTH_OFFSET = value;
        }
    });
    
    // Sync inputs with current CONFIG values
    noteHeightInput.value = CONFIG.NOTE_HEIGHT;
    noteWidthOffsetInput.value = CONFIG.NOTE_WIDTH_OFFSET;
}

// Initialize
resetGame();
initDevConsole();
gameLoop();
