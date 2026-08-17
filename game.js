; (function () {
    console.log("ALICE_SYSTEM: UPGRADED v5.0");

    const hud = document.createElement('div');
    hud.id = "system-hud";
    hud.style.cssText = "position:fixed;top:0;left:0;width:100%;height:18px;background:#000;color:#0f8;font-size:10px;z-index:99999;display:flex;align-items:center;padding:0 10px;border-bottom:1px solid #222;";
    hud.innerText = "5x5 PROTOCOL | MEDAL SYSTEM ACTIVE";
    document.documentElement.appendChild(hud);

    window.onerror = (msg, url, line, col, error) => {
        hud.style.background = 'red';
        hud.innerText = "FATAL: " + msg + " at " + line + ":" + col;
        console.error(error);
    };

    const config = {
        apiKey: "AIzaSyB3frXMcrUnXambB8I7TeFrQrn5tUVzSo8",
        authDomain: "alice-in-borderland-ee905.firebaseapp.com",
        projectId: "alice-in-borderland-ee905",
        storageBucket: "alice-in-borderland-ee905.firebasestorage.app",
        messagingSenderId: "233262891041",
        appId: "1:233262891041:web:02aed1730163b950baa360",
        databaseURL: "https://alice-in-borderland-ee905-default-rtdb.firebaseio.com"
    };

    let db;
    try {
        firebase.initializeApp(config);
        db = firebase.database();
    } catch (err) { hud.innerText = "DATABASE ERROR"; }

    const state = {
        player: null,
        stage: 0,
        host: false,
        view: 'map',
        moveTimer: null,
        timeLeft: 10,
        data: { phase: 'off' },
        players: [],
        listenersActive: false
    };

    const missions = [
        { title: "Life and death", task: "Survival trial in the door corridor. Avoid the blast rooms." },
        { title: "Hide n seek", task: "The Hunter: Decode the cipher or hide from the seeker." },
        { title: "Sheep and wolf", task: "The Wolf and the Sheep: Social sabotage and survival." },
        { title: "The Bulb maze", task: "The Maze: Navigate the randomized labyrinth." },
        { title: "The distance", task: "Collaboration: Work together to reach the goal distance." },
        { title: "The Killer", task: "The Killer: Identity the target or eliminate the threat." },
        { title: "Trust me", task: "Trust: Your survival depends on the signals of others." },
        { title: "The Guess", task: "Beauty Contest: Pick a number closest to 0.8x of the average." },
        { title: "Dodge the Ball", task: "Physical Trial: Agile reflexes required to survive the arena." },
        { title: "The Conversion", task: "The Chase: Team deathmatch. Convert opponents by shooting them." },
        { title: "the big game", task: "TO BE ANNOUNCED." },
        { title: "the joker", task: "Physical Trial: Last man standing. Press ELIMINATION when you are out. order sets medals." },
        { title: "Train to graveyard", task: "Confinement Trial: 10 Rooms, 5 Poison. Analyze the 3s hint. Use masks wisely. 6 Masks total." }
    ];

    window.registerPlayer = function () {
        const input = document.getElementById('player-name-input');
        if (!input || !input.value.trim()) return alert("ENTER NAME.");

        const name = input.value.trim();
        // If we already have a session for this name, just use it
        const saved = localStorage.getItem('borderland_player');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.name.toUpperCase() === name.toUpperCase()) {
                state.player = parsed;
                window.restoreSession();
                return;
            }
        }

        state.player = {
            name: name,
            id: "PL_" + Date.now(),
            medals: { gold: 0, silver: 0, bronze: 0 }
        };
        localStorage.setItem('borderland_player', JSON.stringify(state.player));
        window.restoreSession();
    };

    window.restoreSession = function () {
        if (!state.player) return;
        document.getElementById('registration-form').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
        document.getElementById('display-name').innerText = state.player.name.toUpperCase();

        state.view = 'map';
        switchScreen('screen-welcome');
        renderTimeline();

        if (db && !state.listenersActive) {
            state.listenersActive = true;
            db.ref('game/players/' + state.player.id).set(state.player);
            db.ref('game/players/' + state.player.id).onDisconnect().remove();

            db.ref('.info/connected').on('value', (s) => {
                const statusDot = document.getElementById('status-dot');
                const statusText = document.getElementById('status-text');
                if (s.val() === true) {
                    if (statusDot) statusDot.style.background = 'var(--safe-green)';
                    if (statusText) statusText.innerText = 'ONLINE / SYNCED';
                } else {
                    if (statusDot) statusDot.style.background = '#444';
                    if (statusText) statusText.innerText = 'OFFLINE / RECONNECTING';
                }
            });

            db.ref('game/players').on('value', (s) => {
                const players = Object.values(s.val() || {}).filter(p => p && p.name);
                state.players = players;
                if (players.length > 0 && players[0].id === state.player.id) state.host = true;
                const syncEl = document.getElementById('player-count-sync');
                if (syncEl) syncEl.innerText = players.length;

                const startBtn = document.getElementById('start-game-btn');
                const resetBtn = document.getElementById('reset-lobby-btn');
                if (startBtn) startBtn.style.display = state.host ? 'block' : 'none';
                if (resetBtn) resetBtn.style.display = state.host ? 'block' : 'none';

                const me = players.find(p => p.id === state.player.id);
                if (me) {
                    state.player.medals = me.medals || { gold: 0, silver: 0, bronze: 0 };
                    localStorage.setItem('borderland_player', JSON.stringify(state.player));
                }
                renderLeaderboard(players);
            });

            db.ref('game/status').on('value', (s) => {
                const status = s.val();
                if (status === 'playing' && state.view === 'rules') {
                    state.view = 'game';
                    switchScreen('screen-game');
                    loadStage();
                } else if (status === 'waiting' && state.view === 'map') {
                    state.view = 'rules';
                    renderRules();
                    switchScreen('screen-rules');
                }
            });

            db.ref('game/currentStage').on('value', (s) => {
                if (s.val() !== null) {
                    state.stage = s.val();
                    renderTimeline();
                    if (state.view === 'rules') renderRules();
                }
            });
        } else if (db && state.player) {
            // If already active, just ensure our presence is updated
            db.ref('game/players/' + state.player.id).set(state.player);
        }
    };

    function renderLeaderboard(players) {
        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        const sorted = [...players].sort((a, b) => {
            const ama = a.medals || { gold: 0, silver: 0, bronze: 0 };
            const bma = b.medals || { gold: 0, silver: 0, bronze: 0 };
            if (bma.gold !== ama.gold) return bma.gold - ama.gold;
            if (bma.silver !== ama.silver) return bma.silver - ama.silver;
            return bma.bronze - ama.bronze;
        });
        list.innerHTML = sorted.map(p => {
            const m = p.medals || { gold: 0, silver: 0, bronze: 0 };
            const pName = (p.name || "UNKNOWN").toUpperCase();
            return `
                <div style="display:flex; justify-content:space-between; font-size:0.7rem; padding:8px; border-bottom:1px solid #222;">
                    <span>${pName}</span>
                    <div>
                        <span class="medal gold"></span>${m.gold}
                        <span class="medal silver"></span>${m.silver}
                        <span class="medal bronze"></span>${m.bronze}
                    </div>
                </div>
            `;
        }).join('');
    }

    window.switchScreen = function (id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const t = document.getElementById(id);
        if (t) t.classList.add('active');
    };

    function renderTimeline() {
        const list = document.getElementById('stage-timeline');
        if (!list) return;
        list.innerHTML = '';
        missions.forEach((m, i) => {
            const card = document.createElement('div');
            card.className = 'mission-card' + (i === state.stage ? ' active' : '');
            card.onclick = () => {
                if (!state.host) return;
                state.stage = i;
                state.view = 'rules';
                if (db) {
                    db.ref('game/currentStage').set(i);
                    db.ref('game/status').set('waiting');
                    db.ref('game/finishers').remove();
                    if (i === 1) db.ref('game/hunter').remove();
                    if (i === 2) db.ref('game/wolf').remove();
                    if (i === 3) db.ref('game/maze').remove();
                    if (i === 4) db.ref('game/collaborate').remove();
                    if (i === 5) db.ref('game/killer').remove();
                    if (i === 6) db.ref('game/trust').remove();
                    if (i === 7) db.ref('game/math').remove();
                    if (i === 8) db.ref('game/dodge').remove();
                    if (i === 9) db.ref('game/chase').remove();
                    if (i === 10) db.ref('game/big').remove();
                    if (i === 11) db.ref('game/joker').remove();
                    if (i === 12) db.ref('game/train').remove();
                }
                renderRules();
                switchScreen('screen-rules');
            };
            card.innerHTML = `<div class="mission-info"><h4>${m.title}</h4></div>`;
            list.appendChild(card);
        });
    }

    function renderRules() {
        const m = missions[state.stage];
        if (!m) return;
        document.getElementById('rules-content').innerHTML = `<h2 style="color:red;">${m.title}</h2><p>${m.task}</p>`;
        document.getElementById('final-start-btn').style.display = state.host ? 'block' : 'none';
    }

    function loadStage() {
        if (state.stage === 0) loadLifeOrDeath();
        else if (state.stage === 1) {
            if (window.loadHunterStage) window.loadHunterStage(state, db);
            else console.error("HUNTER.JS NOT LOADED");
        }
        else if (state.stage === 2) {
            if (window.loadWolfStage) window.loadWolfStage(state, db);
            else console.error("WOLF.JS NOT LOADED");
        }
        else if (state.stage === 3) {
            if (window.loadMazeStage) window.loadMazeStage(state, db);
            else console.error("MAZE.JS NOT LOADED");
        }
        else if (state.stage === 4) {
            if (window.loadCollaborationStage) window.loadCollaborationStage(state, db);
            else console.error("COLLABORATE.JS NOT LOADED");
        }
        else if (state.stage === 5) {
            if (window.loadKillerStage) window.loadKillerStage(state, db);
            else console.error("KILLER.JS NOT LOADED");
        }
        else if (state.stage === 6) {
            if (window.loadTrustStage) window.loadTrustStage(state, db);
            else console.error("TRUST.JS NOT LOADED");
        }
        else if (state.stage === 7) {
            if (window.loadMathStage) window.loadMathStage(state, db);
            else console.error("MATH.JS NOT LOADED");
        }
        else if (state.stage === 8) {
            if (window.loadDodgeStage) window.loadDodgeStage(state, db);
            else console.error("DODGE.JS NOT LOADED");
        }
        else if (state.stage === 9) {
            if (window.loadChaseStage) window.loadChaseStage(state, db);
            else console.error("CHASE.JS NOT LOADED");
        }
        else if (state.stage === 10) {
            if (window.loadBigStage) window.loadBigStage(state, db);
            else console.error("BIG.JS NOT LOADED");
        }
        else if (state.stage === 11) {
            if (window.loadJokerStage) window.loadJokerStage(state, db);
            else console.error("JOKER.JS NOT LOADED");
        }
        else if (state.stage === 12) {
            if (window.loadTrainStage) window.loadTrainStage(state, db);
            else console.error("TRAIN.JS NOT LOADED");
        }
    }

    function loadLifeOrDeath() {
        state.data = { phase: 'memorize', lives: 2, facing: 'N', grid: [], start: 0, end: 0, medalsEarned: null };
        let g = Array(5).fill().map(() => Array(5).fill(0));
        let r = 4, c = Math.floor(Math.random() * 5);
        state.data.start = c; g[r][c] = 1;
        while (r > 0) {
            let m = Math.random();
            if (m < 0.5) r--;
            else if (m < 0.75 && c > 0) c--;
            else if (m < 1.0 && c < 4) c++;
            g[r][c] = 1;
        }
        state.data.end = c; state.data.grid = g;
        renderGame();
        let mTime = 5;
        const it = setInterval(() => {
            mTime--;
            const el = document.getElementById('countdown-big');
            if (el) el.innerText = `MEMORIZE: ${mTime}s`;
            if (mTime <= 0) {
                clearInterval(it);
                state.data.phase = 'play';
                state.data.pos = { r: 4, c: state.data.start };
                startMoveTimer();
                renderGame();
            }
        }, 1000);
    }

    function startMoveTimer() {
        clearInterval(state.moveTimer);
        state.timeLeft = 10;
        state.moveTimer = setInterval(() => {
            state.timeLeft--;
            const fill = document.querySelector('.timer-fill');
            if (fill) fill.style.width = (state.timeLeft * 10) + "%";
            if (state.timeLeft <= 0) {
                clearInterval(state.moveTimer);
                state.data.lives--;
                showDeathFeedback();
                if (state.data.lives <= 0) state.data.phase = 'dead';
                else startMoveTimer();
                renderGame();
            }
        }, 1000);
    }

    window.makeMove = function (dir) {
        if (state.data.phase !== 'play') return;
        let { r, c } = JSON.parse(JSON.stringify(state.data.pos));
        let f = state.data.facing;
        const h = ['N', 'E', 'S', 'W'];
        let idx = h.indexOf(f);
        if (dir === 'L') f = h[(idx + 3) % 4];
        if (dir === 'R') f = h[(idx + 1) % 4];
        if (f === 'N') r--; else if (f === 'E') c++; else if (f === 'S') r++; else if (f === 'W') c--;
        state.data.facing = f;
        if (r < 0 || r > 4 || c < 0 || c > 4 || state.data.grid[r][c] === 0) {
            state.data.lives--;
            renderGame();
            showDeathFeedback();
            if (state.data.lives <= 0) state.data.phase = 'dead';
            else startMoveTimer();
        } else {
            state.data.pos = { r, c };
            if (r === 0 && c === state.data.end) {
                state.data.phase = 'finished';
                awardMedal();
            } else startMoveTimer();
            renderGame();
            showSafeFeedback();
        }
    };

    function awardMedal() {
        clearInterval(state.moveTimer);
        const finishTime = Date.now();
        db.ref('game/finishers').push({ id: state.player.id, name: state.player.name, time: finishTime });
        db.ref('game/finishers').once('value', (snap) => {
            const finishers = Object.values(snap.val() || {}).sort((a, b) => a.time - b.time);
            const rank = finishers.findIndex(f => f.id === state.player.id) + 1;
            let medalType = rank === 1 ? 'gold' : (rank === 2 ? 'silver' : (rank === 3 ? 'bronze' : null));
            if (medalType) {
                state.data.medalsEarned = medalType;
                state.player.medals[medalType]++;
                db.ref('game/players/' + state.player.id + '/medals').set(state.player.medals);
            }
            renderGame();
        });
    }

    function renderGame() {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        if (!carea) return;
        if (state.data.phase === 'memorize') {
            let grid = '<div class="memo-grid">';
            state.data.grid.forEach((row, ri) => row.forEach((v, ci) => {
                const isS = (ri === 4 && ci === state.data.start);
                const isE = (ri === 0 && ci === state.data.end);
                grid += `<div class="grid-cell ${v ? 'highlight' : ''}">${isS ? 'S' : (isE ? 'E' : v)}</div>`;
            }));
            carea.innerHTML = grid + '</div>';
            area.innerHTML = '<p id="countdown-big" style="font-size:2rem; color:red;">5</p>';
        } else if (state.data.phase === 'play') {
            carea.innerHTML = `<div style="text-align:center;"><div class="timer-bar"><div class="timer-fill" style="width:${state.timeLeft * 10}%"></div></div><div style="font-size:1.5rem; margin-bottom:10px;">${'❤️'.repeat(state.data.lives)}</div><div class="door-corridor"><div class="door-frame" onclick="makeMove('L')"><div class="door-label">L</div></div><div class="door-frame" onclick="makeMove('F')"><div class="door-label">F</div></div><div class="door-frame" onclick="makeMove('R')"><div class="door-label">R</div></div></div></div>`;
            area.innerHTML = `<p style="font-size:0.6rem; color:#666;">TURN: ${state.data.facing}</p>`;
        } else if (state.data.phase === 'dead') {
            clearInterval(state.moveTimer);
            carea.innerHTML = '<h1 style="color:red;">ELIMINATED</h1>';
            area.innerHTML = '<button class="btn" onclick="nextStage()">BACK TO MENU</button>';
        } else if (state.data.phase === 'finished') {
            const medal = state.data.medalsEarned ? `<div style="margin:20px;"><span class="medal ${state.data.medalsEarned}" style="width:40px; height:40px;"></span><p>${state.data.medalsEarned.toUpperCase()} MEDAL EARNED!</p></div>` : '<p>CALCULATING RANK...</p>';
            carea.innerHTML = `<h1 style="color:gold;">STAGE CLEAR</h1>${medal}`;
            area.innerHTML = '<button class="btn" onclick="nextStage()">EXIT GAME</button>';
        }
    }

    function showSafeFeedback() {
        const cor = document.querySelector('.door-corridor');
        if (cor) { cor.classList.remove('room-enter'); void cor.offsetWidth; cor.classList.add('room-enter'); }
        const s = document.createElement('div');
        s.className = 'safe-msg'; s.innerText = 'SAFE';
        document.documentElement.appendChild(s);
        setTimeout(() => s.remove(), 1000);
    }

    function showDeathFeedback() {
        const fl = document.createElement('div'); fl.className = 'death-flash';
        document.body.appendChild(fl); setTimeout(() => fl.remove(), 600);
    }

    window.startGame = function () { if (db) db.ref('game/status').set('waiting'); };
    window.showHostSettings = function () {
        document.getElementById('host-settings-modal').style.display = 'flex';
        const collabEl = document.getElementById('collab-setting');
        if (collabEl) collabEl.style.display = (state.stage === 4) ? 'block' : 'none';
    };
    window.confirmStart = function () {
        if (db) {
            const time = document.getElementById('setting-time').value || 60;
            const collabQ = document.getElementById('setting-collab-q').value || 80;
            db.ref('game/timeLimit').set(parseInt(time));
            db.ref('game/collabQuestions').set(parseInt(collabQ));
            db.ref('game/status').set('playing');
        }
        document.getElementById('host-settings-modal').style.display = 'none';
    };
    window.leaveGame = function () {
        if (db && state.player) db.ref('game/players/' + state.player.id).remove();
        localStorage.removeItem('borderland_player');
        location.reload();
    };
    window.nextStage = function () { location.reload(); };
    window.resetLobby = function () {
        if (!state.host || !db) return;
        if (confirm("RESET ALL PLAYER DATA AND GAME STATE?")) {
            db.ref('game').remove().then(() => location.reload());
        }
    };

    const saved = localStorage.getItem('borderland_player');
    if (saved) { state.player = JSON.parse(saved); window.restoreSession(); }
})();
