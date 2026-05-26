const state = {
    currentPlayer: null,
    players: [
        { name: "Arisu", badges: 0, status: "READY" },
        { name: "Usagi", badges: 0, status: "READY" },
        { name: "Chishiya", badges: 0, status: "READY" },
        { name: "Kuina", badges: 0, status: "READY" },
        { name: "Karube", badges: 0, status: "READY" }
    ],
    currentStageIndex: 0,
    stages: [
        { title: "PULSE CHECK", task: "Reaction timing test.", status: "active" },
        { title: "LIGHTS OUT", task: "Memory and darkness coordination.", status: "locked" },
        { title: "THE BRIDGE", task: "Balance and pressure.", status: "locked" },
        { title: "WITCH HUNT", task: "Deduction and survival.", status: "locked" }
    ]
};

function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function registerPlayer() {
    const nameInput = document.getElementById('player-name-input');
    const name = nameInput.value.trim();

    if (!name) {
        alert("Enter your name, recruit.");
        return;
    }

    state.currentPlayer = { name: name, badges: 0, status: "READY" };
    state.players.push(state.currentPlayer);

    // Update UI
    document.getElementById('registration-form').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('display-name').innerText = name.toUpperCase();

    renderTimeline();
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

function goToLobby() {
    switchScreen('screen-lobby');
    const list = document.getElementById('lobby-list');
    list.innerHTML = '';

    // Add CURRENT player first
    addPlayerToLobby(state.currentPlayer, true);

    // Simulate other players joining one by one
    const npcPlayers = state.players.filter(p => p.name !== state.currentPlayer.name);
    let joinedCount = 0;

    npcPlayers.forEach((player, index) => {
        setTimeout(() => {
            addPlayerToLobby(player, false);
            joinedCount++;

            if (joinedCount === npcPlayers.length) {
                document.getElementById('start-game-btn').style.display = 'block';
                document.getElementById('player-status-msg').innerText = "ALL PLAYERS PRESENT. READY TO BEGIN.";
                document.getElementById('player-status-msg').style.color = "var(--safe-green)";
            } else {
                document.getElementById('player-status-msg').innerText = `WAITING FOR PLAYERS (${joinedCount + 1}/6)...`;
            }
        }, 800 * (index + 1));
    });
}

function addPlayerToLobby(player, isYou) {
    const list = document.getElementById('lobby-list');
    const item = document.createElement('div');
    item.className = 'player-item';
    item.style.animation = 'fadeIn 0.3s ease forwards';
    item.innerHTML = `
        <div style="display: flex; align-items: center;">
            <div class="status-indicator"></div>
            <span>${player.name} ${isYou ? '(YOU)' : ''}</span>
        </div>
        <div>
            <span style="color:var(--text-muted); font-size: 0.7rem;">CONNECTING...</span>
        </div>
    `;
    list.appendChild(item);

    // After a short delay, show "READY"
    setTimeout(() => {
        item.querySelector('div:last-child').innerHTML =
            player.badges > 0 ? `<span class="badge">${player.badges}</span>` : '<span style="color:var(--safe-green); font-size:0.7rem;">READY</span>';
    }, 500);
}

function renderLobby() {
    const list = document.getElementById('lobby-list');
    list.innerHTML = '';

    state.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.innerHTML = `
            <div style="display: flex; align-items: center;">
                <div class="status-indicator"></div>
                <span>${p.name} ${p.name === state.currentPlayer.name ? '(YOU)' : ''}</span>
            </div>
            <div>
                ${p.badges > 0 ? `<span class="badge">${p.badges}</span>` : '<span style="color:#444">0 B</span>'}
            </div>
        `;
        list.appendChild(item);
    });
}

function startGame() {
    switchScreen('screen-game');
    loadStage(state.currentStageIndex);
}

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
    const success = diff < 0.2; // 0.2s margin of error

    if (success) {
        state.currentPlayer.badges++;
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

    // Simulate others
    const others = state.players.filter(p => p.name !== state.currentPlayer.name);
    others.forEach(p => {
        if (Math.random() > 0.3) p.badges++;
    });

    list.innerHTML = `
        <div class="card" style="border-color: ${survived ? 'var(--safe-green)' : 'var(--danger-red)'}">
            <h2 style="color: ${survived ? 'var(--safe-green)' : 'var(--danger-red)'}">
                ${survived ? 'SURVIVED' : 'GAMEOVER'}
            </h2>
            <p style="margin-top: 10px;">${survived ? 'You earned a badge.' : 'Better luck in the next life.'}</p>
        </div>
        
        <h3 style="font-size: 0.8rem; margin: 20px 0 10px;">SURVIVOR LEADERBOARD</h3>
        <div class="card">
            ${state.players.sort((a, b) => b.badges - a.badges).map(p => `
                <div class="player-item" style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #222;">
                    <span>${p.name}</span>
                    <span class="badge" style="background: ${p.badges > 0 ? 'gold' : '#333'}">${p.badges}</span>
                </div>
            `).join('')}
        </div>
    `;

    // Move to next stage logic
    if (survived) {
        state.stages[state.currentStageIndex].status = 'completed';
        state.currentStageIndex++;
        if (state.currentStageIndex < state.stages.length) {
            state.stages[state.currentStageIndex].status = 'active';
        }
    }
}

function nextStage() {
    renderTimeline();
    document.getElementById('display-badges').innerText = state.currentPlayer.badges;
    switchScreen('screen-welcome');
}
