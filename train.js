; (function () {
    let st;
    let database;
    let timerInt;

    // Inject Gas Styles
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes gasFlow {
            0% { opacity: 0; transform: scale(0.8); }
            50% { opacity: 0.6; transform: scale(1.1); }
            100% { opacity: 0.4; transform: scale(1); }
        }
        .gas-cloud {
            position: absolute; top:0; left:0; width:100%; height:100%;
            pointer-events: none; z-index: 5;
            animation: gasFlow 2s infinite alternate ease-in-out;
        }
        .poison-gas { background: radial-gradient(circle, rgba(0,255,0,0.4) 0%, rgba(0,100,0,0.1) 70%, transparent 100%); }
        .oxygen-gas { background: radial-gradient(circle, rgba(192,192,192,0.4) 0%, rgba(100,100,100,0.1) 80%, transparent 100%); }
    `;
    document.head.appendChild(style);

    window.loadTrainStage = function (state, db) {
        st = state;
        database = db;

        if (timerInt) clearInterval(timerInt);
        database.ref('game/train').off();
        database.ref('game/train').on('value', (snap) => {
            const data = snap.val() || {};
            st.data = {
                phase: data.phase || 'lobby',
                round: data.round || 0,
                rooms: data.rooms || [],
                currentImage: data.currentImage || '',
                timer: data.timer || 0,
                lives: data.lives || {},
                masks: data.masks || {},
                choices: data.choices || {},
                readies: data.readies || {},
                eliminatedOrder: data.eliminatedOrder || [],
                winners: data.winners || []
            };

            // HOST LOGIC - Run this even if host is eliminated visually
            if (st.host) {
                handleHostLogic();
            }

            renderTrain(st, db);
        });
    };

    function handleHostLogic() {
        const d = st.data;
        if (d.phase === 'lobby' || d.phase === 'over') return;

        // Auto-advance on timer 0
        if (d.timer <= 0) {
            if (d.phase === 'hint') {
                startTrainChoicePhase();
            } else if (d.phase === 'choice') {
                processTrainResults();
            } else if (d.phase === 'reveal') {
                // If it's the reveal phase, we wait for survivors to be ready
                const alivePlayers = st.players.filter(p => d.lives[p.id] !== false);
                const allReady = alivePlayers.length === 0 || alivePlayers.every(p => d.readies[p.id]);
                if (allReady) {
                    nextTrainRound();
                }
            }
        }
    }

    function renderTrain(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;

        carea.style.backgroundImage = `url('train.png')`;
        carea.style.backgroundSize = 'cover';
        carea.style.backgroundPosition = 'center';
        carea.style.position = 'relative';
        carea.style.overflow = 'hidden';

        if (d.phase === 'lobby') {
            carea.innerHTML = `
                <div style="text-align:center; color:white; padding:20px; background:rgba(0,0,0,0.85); height:100%; display:flex; flex-direction:column; justify-content:center; border-radius:10px;">
                    <h1 style="color:red; font-size:1.8rem; margin-bottom:15px; letter-spacing:3px; text-shadow:0 0 15px red;">TRAIN TO GRAVEYARD</h1>
                    <div class="card" style="border-color:#444; background:rgba(0,0,0,0.9); padding:15px; font-size:0.7rem;">
                        <p>10 ROOMS | 5 OXY | 5 POISON</p>
                        <p style="margin:10px 0;">Analyze Hint: <b style="color:cyan;">9 SECONDS</b></p>
                        <p style="color:gold;">EQUIPMENT: 6 MASKS</p>
                        <p style="font-size:0.55rem; color:#666; margin-top:10px;">ALL SURVIVE = ALL GOLD</p>
                    </div>
                </div>`;
            if (state.host) area.innerHTML = `<button class="btn btn-primary" onclick="initTrain()">RELEASE TRAIN</button>`;
            else area.innerHTML = `<p style="text-align:center; color:#444; font-size:0.6rem;">WAITING FOR CONDUCTOR...</p>`;
            return;
        }

        if (d.phase === 'over') {
            const alivePlayers = st.players.filter(p => d.lives[p.id] !== false);
            let resHtml = `<h1 style="color:gold; font-size:2rem;">MISSION END</h1>`;
            if (alivePlayers.length === st.players.length && st.players.length > 0) resHtml += `<h2 style="color:var(--safe-green);">TEAM VICTORY: ALL GOLD</h2>`;
            else {
                const w = d.winners || [];
                resHtml += `
                    <div class="card" style="border-color:gold; background:black; padding:10px; font-size:0.8rem;">
                        <p style="color:gold;">🥇 ${getName(w[0])}</p>
                        <p style="color:silver;">🥈 ${getName(w[1])}</p>
                        <p style="color:#cd7f32;">🥉 ${getName(w[2])}</p>
                    </div>`;
            }
            carea.innerHTML = `<div style="text-align:center; color:white; padding:40px 0; background:rgba(0,0,0,0.9); height:100%; display:flex; flex-direction:column; justify-content:center;">${resHtml}</div>`;
            area.innerHTML = `<button class="btn btn-primary" onclick="nextStage()">EXIT</button>`;
            return;
        }

        const isAlive = d.lives[myId] !== false;
        const myMasks = d.masks[myId] || 0;
        const currentChoice = d.choices[myId];

        if (!isAlive) {
            carea.innerHTML = `
                <div style="text-align:center; color:white; padding:50px 0; background:rgba(255,0,0,0.2); height:100%; display:flex; flex-direction:column; justify-content:center;">
                    <div class="gas-cloud poison-gas"></div>
                    <h1 style="color:red; font-size:3rem; text-shadow:0 0 20px black;">ELIMINATED</h1>
                    <p style="background:black; border:1px solid red; display:inline-block; padding:5px 20px;">LUNGS COLLAPSED</p>
                    <p style="font-size:0.7rem; color:#888; margin-top:20px;">Watching other travelers...</p>
                </div>`;
            area.innerHTML = `<button class="btn" onclick="nextStage()">EXIT</button>`;
            return;
        }

        let header = `
            <div style="position:absolute; top:10px; width:94%; left:3%; display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.9); padding:8px; border-radius:5px; border:1px solid #333; z-index:10;">
                <div style="font-size:0.6rem; color:cyan;">${myMasks} MASKS</div>
                <div style="font-size:1.2rem; color:white; font-weight:bold;">${d.timer}s</div>
                <div style="font-size:0.6rem; color:#888;">RM ${d.round + 1}</div>
            </div>`;

        let body = '';
        if (d.phase === 'hint') {
            body = `
                <div style="text-align:center; padding:20px; margin-top:50px; background:rgba(0,0,0,0.4); border-radius:10px;">
                    <img src="${d.currentImage}" style="max-height:180px; border:3px solid cyan; border-radius:10px; box-shadow:0 0 30px cyan;">
                    <p style="color:cyan; font-size:0.6rem; margin-top:10px; letter-spacing:2px;">ANALYZING SENSORS...</p>
                </div>`;
            area.innerHTML = `<p style="text-align:center; color:#444; font-size:0.5rem;">9s HINT ACTIVE</p>`;
        } else if (d.phase === 'choice') {
            body = `
                <div style="text-align:center; padding:40px 20px; margin-top:50px; background:rgba(0,0,0,0.9); border-radius:10px; border:1px solid #444;">
                    <h2 style="color:white; font-size:1.2rem; margin-bottom:20px;">SEAL MASK?</h2>
                    <div style="display:inline-block; padding:15px 40px; border:2px solid ${currentChoice ? 'cyan' : '#333'}; background:black; color:white; font-size:1.1rem; font-weight:bold; border-radius:8px;">
                        ${currentChoice ? (currentChoice.mask ? 'MASK SEALED 🛡️' : 'NO MASK 🧪') : 'DECIDE NOW'}
                    </div>
                </div>`;
            if (currentChoice) area.innerHTML = `<p style="text-align:center; color:#666; font-size:0.6rem;">CHOICE RECORDED</p>`;
            else area.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button class="btn btn-primary" style="background:cyan; color:black; font-weight:bold;" onclick="submitTrainChoice(true)" ${myMasks <= 0 ? 'disabled' : ''}>USE MASK</button>
                    <button class="btn btn-primary" style="background:#1a1a1a; border-color:#444;" onclick="submitTrainChoice(false)">BREATHE</button>
                </div>`;
        } else if (d.phase === 'reveal') {
            const isPoison = d.rooms[d.round] === 'POISON';
            const iReady = d.readies[myId] === true;
            body = `
                <div class="gas-cloud ${isPoison ? 'poison-gas' : 'oxygen-gas'}"></div>
                <div style="text-align:center; padding:30px 20px; margin-top:50px; background:rgba(0,0,0,0.95); border-radius:10px; border:3px solid ${isPoison ? 'red' : 'silver'}; position:relative; z-index:10;">
                    <h1 style="color:${isPoison ? 'red' : 'silver'}; font-size:2.2rem; margin-bottom:5px; text-shadow:0 0 10px black;">
                        ${isPoison ? '☣️ POISON' : '🌬️ OXYGEN'}
                    </h1>
                    <div style="margin-top:20px; padding:15px; border-top:1px solid #333;">
                        <h2 style="color:${isAlive ? 'var(--safe-green)' : 'red'}; font-size:1.4rem;">
                            ${isAlive ? 'SURVIVED' : 'ELIMINATED'}
                        </h2>
                    </div>
                </div>`;
            if (iReady) area.innerHTML = `<p style="text-align:center; color:cyan; font-size:0.7rem;">WAITING FOR TEAM...</p>`;
            else area.innerHTML = `<button class="btn btn-primary" style="background:var(--safe-green); color:black;" onclick="readyNextTrainRoom()">NEXT ROOM</button>`;
        }
        carea.innerHTML = header + body;
    }

    function getName(id) { return st.players.find(p => p.id === id)?.name || 'NONE'; }

    window.initTrain = function () {
        if (!st.host) return;
        const rooms = []; let poisons = 0;
        for (let i = 0; i < 10; i++) {
            if (poisons < 5 && (Math.random() < 0.5 || (10 - i) === (5 - poisons))) { rooms.push('POISON'); poisons++; }
            else rooms.push('OXYGEN');
        }
        rooms.sort(() => Math.random() - 0.5);
        const lives = {}; const masks = {};
        st.players.forEach(p => { lives[p.id] = true; masks[p.id] = 6; });

        database.ref('game/train').set({
            phase: 'hint', round: 0, rooms: rooms, currentImage: getRandomTrainImage(rooms[0]), timer: 9, lives: lives, masks: masks,
            choices: {}, readies: {}, eliminatedOrder: [], winners: []
        });

        if (timerInt) clearInterval(timerInt);
        timerInt = setInterval(() => {
            database.ref('game/train/timer').transaction(t => {
                if (t === null) return 0;
                return t > 0 ? t - 1 : 0;
            });
        }, 1000);
    };

    function getRandomTrainImage(type) {
        const prefix = type === 'POISON' ? 'us' : 's';
        return `${prefix}${Math.floor(Math.random() * 5) + 1}.png`;
    }

    function startTrainChoicePhase() {
        if (!st.host) return;
        database.ref('game/train').update({ phase: 'choice', timer: 10, choices: {} });
    }

    window.submitTrainChoice = function (useMask) {
        if (st.data.phase !== 'choice' || st.data.choices[st.player.id]) return;
        database.ref(`game/train/choices/${st.player.id}`).set({ mask: useMask });
    };

    window.readyNextTrainRoom = function () {
        if (st.data.phase !== 'reveal') return;
        database.ref(`game/train/readies/${st.player.id}`).set(true);
    };

    function processTrainResults() {
        if (!st.host) return;
        const d = st.data; const isPoison = d.rooms[d.round] === 'POISON';
        const newLives = { ...d.lives }; const newMasks = { ...d.masks }; const newlyEliminated = [];

        st.players.forEach(p => {
            if (d.lives[p.id] === false) return;
            const c = d.choices[p.id] || { mask: false };
            if (c.mask) newMasks[p.id] = Math.max(0, newMasks[p.id] - 1);
            else if (isPoison) { newLives[p.id] = false; newlyEliminated.push(p.id); }
        });

        database.ref('game/train').update({
            phase: 'reveal',
            lives: newLives,
            masks: newMasks,
            eliminatedOrder: (d.eliminatedOrder || []).concat(newlyEliminated),
            readies: {}
        });
    }

    function nextTrainRound() {
        if (!st.host) return;
        const d = st.data; const alivePlayers = st.players.filter(p => d.lives[p.id] !== false);

        if (d.round >= 9 || alivePlayers.length <= 0) {
            const elimOrder = d.eliminatedOrder || []; const winners = [];
            if (alivePlayers.length === st.players.length && st.players.length > 0) {
                winners.push(...alivePlayers.map(p => p.id));
            } else {
                winners.push(...alivePlayers.map(p => p.id));
                winners.push(...[...elimOrder].reverse());
            }
            database.ref('game/train').update({ phase: 'over', winners: winners });
            awardTrainMedals(winners, alivePlayers.length === st.players.length && st.players.length > 0);
            if (timerInt) clearInterval(timerInt);
        } else {
            const nx = d.round + 1;
            database.ref('game/train').update({
                phase: 'hint',
                round: nx,
                timer: 9,
                currentImage: getRandomTrainImage(d.rooms[nx]),
                choices: {},
                readies: {}
            });
        }
    }

    function awardTrainMedals(winners, allSurvive) {
        if (allSurvive) winners.forEach(id => updateMedal(id, 'gold'));
        else {
            if (winners[0]) updateMedal(winners[0], 'gold');
            if (winners[1]) updateMedal(winners[1], 'silver');
            if (winners[2]) updateMedal(winners[2], 'bronze');
        }
    }

    function updateMedal(playerId, type) {
        const p = st.players.find(pl => pl.id === playerId);
        if (p) {
            const m = { ...(p.medals || { gold: 0, silver: 0, bronze: 0 }) };
            m[type]++;
            database.ref(`game/players/${playerId}/medals`).set(m);
        }
    }
})();
