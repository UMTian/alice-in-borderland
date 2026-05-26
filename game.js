// --- FIREBASE CONFIGURATION ---
// Replace the values below with your own Firebase Config from the console!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const state = {
    currentPlayer: null,
    players: [],
    currentStageIndex: 0,
    isHost: false, // First person to join acts as host
    stages: [
        { title: "PULSE CHECK", task: "Reaction timing test.", status: "active" },
        { title: "LIGHTS OUT", task: "Memory and darkness coordination.", status: "locked" },
        { title: "THE BRIDGE", task: "Balance and pressure.", status: "locked" },
        { title: "WITCH HUNT", task: "Deduction and survival.", status: "locked" }
    ]
};

// --- MULTIPLAYER LOGIC ---

function registerPlayer() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim();

    if (!name) {
        alert("Enter your name, recruit.");
        return;
    }

    // Save player to LocalState and Firebase
    state.currentPlayer = {
        name: name,
        badges: 0,
        status: "READY",
        id: Date.now() // Unique ID for this session
    };

    // Push player to Firebase "players" node
    const playerRef = database.ref('game/players/' + state.currentPlayer.id);
    playerRef.set(state.currentPlayer);

    // If game is empty, this player is the host
    database.ref('game/players').once('value', snapshot => {
        if (Object.keys(snapshot.val() || {}).length === 1) {
            state.isHost = true;
            database.ref('game/status').set('waiting');
        }
    });

    // Handle browser close - remove player automatically
    playerRef.onDisconnect().remove();

    // Update Menu UI
    document.getElementById('registration-form').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('display-name').innerText = name.toUpperCase();

    renderTimeline();
    listenToPlayers();
    listenToGameStatus();
}

function listenToPlayers() {
    database.ref('game/players').on('value', (snapshot) => {
        const playersData = snapshot.val() || {};
        state.players = Object.values(playersData);

        // Refresh local badge count if changed
        const me = state.players.find(p => p.id === state.currentPlayer.id);
        if (me) state.currentPlayer.badges = me.badges;

        renderLobby();
        document.getElementById('display-badges').innerText = state.currentPlayer.badges;
    });
}

function listenToGameStatus() {
    database.ref('game/status').on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'playing') {
            switchScreen('screen-game');
            loadStage(state.currentStageIndex);
        }
    });
}

function goToLobby() {
    switchScreen('screen-lobby');
    // Only host can see the "Start" button
    if (state.isHost) {
        document.getElementById('start-game-btn').style.display = 'block';
        document.getElementById('player-status-msg').innerText = "YOU ARE THE HOST. START WHEN READY.";
    } else {
        document.getElementById('player-status-msg').innerText = "WAITING FOR HOST TO START...";
    }
}

function renderLobby() {
    const list = document.getElementById('lobby-list');
    if (!list) return;
    list.innerHTML = '';

    state.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div style="display: flex; align-items: center;">
                <div class="status-indicator"></div>
                <span>${p.name} ${p.id === state.currentPlayer.id ? '(YOU)' : ''}</span>
            </div>
            <div>
                ${p.badges > 0 ? `<span class="badge">${p.badges}</span>` : '<span style="color:var(--safe-green); font-size:0.7rem;">READY</span>'}
            </div>
        `;
        list.appendChild(item);
    });
}

function startGame() {
    // Only host triggers this
    database.ref('game/status').set('playing');
}

// --- SCREEN & NAVIGATION ---

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function renderTimeline() {
    const timeline = document.getElementById('stage-timeline');
    timeline.innerHTML = '';

    state.stages.forEach((stage, index) => {
        const item = document.createElement('div');
        item.className = `timeline-item ${stage.status}`;
        item.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <h4>STAGE ${index + 1}: ${stage.title}</h4>
                <p>${stage.task}</p>
            </div>
        `;
        timeline.appendChild(item);
    });
}

// --- GAMEPLAY LOGIC ---

function loadStage(index) {
    const stage = state.stages[index];
    document.getElementById('stage-title').innerText = `STAGE ${index + 1}: ${stage.title}`;

    const content = document.getElementById('game-content');
    content.innerHTML = `
        <h3 style="color: var(--primary-red); margin-bottom: 20px;">TASK ASSIGNED</h3>
        <p style="font-size: 0.9rem; line-height: 1.5;">${stage.task}</p>
        <div id="game-visual" style="margin-top: 30px; width: 100%; height: 100px; background: #222; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--primary-red);">
             <span id="countdown-big" style="font-size: 3rem; font-weight: 900; color: white;">5.00</span>
        </div>
    `;

    const actionArea = document.getElementById('player-action-area');
    actionArea.innerHTML = `
        <button class="btn btn-primary" onclick="submitReaction()">PRESS NOW</button>
    `;

    startTimer(5.0);
}

let timerInterval;
let currentTime = 5.0;

function startTimer(seconds) {
    currentTime = seconds;
    const display = document.getElementById('countdown-big');
    const headerDisplay = document.getElementById('game-timer');

    timerInterval = setInterval(() => {
        currentTime -= 0.01;
        if (currentTime <= 0) {
            currentTime = 0;
            clearInterval(timerInterval);
            finishStage();
        }
        display.innerText = currentTime.toFixed(2);
        headerDisplay.innerText = `00:${Math.ceil(currentTime).toString().padStart(2, '0')}`;

        if (currentTime < 2) {
            display.style.color = 'var(--primary-red)';
        }
    }, 10);
}

function submitReaction() {
    clearInterval(timerInterval);
    const diff = Math.abs(currentTime - 0.5);
    const success = diff < 0.2;

    if (success) {
        state.currentPlayer.badges++;
        // Update badges in Firebase so everyone sees it
        database.ref('game/players/' + state.currentPlayer.id).update({
            badges: state.currentPlayer.badges
        });
        showResults(true);
    } else {
        showResults(false);
    }
}

function finishStage() {
    showResults(false);
}

function showResults(survived) {
    switchScreen('screen-results');
    const list = document.getElementById('results-list');

    list.innerHTML = `
        <div class="card" style="border-color: ${survived ? 'var(--safe-green)' : 'var(--danger-red)'}">
            <h2 style="color: ${survived ? 'var(--safe-green)' : 'var(--danger-red)'}">
                ${survived ? 'SURVIVED' : 'GAMEOVER'}
            </h2>
            <p style="margin-top: 10px;">${survived ? 'You earned a badge.' : 'Better luck in the next life.'}</p>
        </div>
        
        <h3 style="font-size: 0.8rem; margin: 20px 0 10px;">SURVIVOR LEADERBOARD</h3>
        <div class="card" id="leaderboard-live">
            <!-- Filled by Firebase listener -->
        </div>
    `;

    // Leaderboard listener inside results
    database.ref('game/players').on('value', (snapshot) => {
        const players = Object.values(snapshot.val() || {});
        const board = document.getElementById('leaderboard-live');
        if (board) {
            board.innerHTML = players.sort((a, b) => b.badges - a.badges).map(p => `
                <div class="player-item" style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #222;">
                    <span>${p.name}</span>
                    <span class="badge" style="background: ${p.badges > 0 ? 'gold' : '#333'}">${p.badges}</span>
                </div>
            `).join('');
        }
    });

    if (survived) {
        state.stages[state.currentStageIndex].status = 'completed';
        state.currentStageIndex++;
        if (state.currentStageIndex < state.stages.length) {
            state.stages[state.currentStageIndex].status = 'active';
        }
    }
}

function nextStage() {
    // Reset game status for everyone if host clicks next? 
    // For now just return to menu locally
    renderTimeline();
    document.getElementById('display-badges').innerText = state.currentPlayer.badges;
    switchScreen('screen-welcome');
}
