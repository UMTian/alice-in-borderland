; (function () {
    let st;
    let database;
    let timerInterval;

    const SHAPES = ['CIRCLE', 'SQUARE', 'TRIANGLE', 'RECTANGLE'];
    const SHAPE_ICONS = {
        'CIRCLE': '◯',
        'SQUARE': '☐',
        'TRIANGLE': '△',
        'RECTANGLE': '▭'
    };

    window.loadTrustStage = function (state, db) {
        st = state;
        database = db;

        db.ref('game/trust').on('value', (snap) => {
            const data = snap.val() || {};
            st.data = {
                phase: data.phase || 'lobby',
                shapes: data.shapes || {},
                lives: data.lives || {},
                answers: data.answers || {},
                timer: data.timer || 0,
                targetTimer: data.targetTimer || 60,
                winner: data.winner || null,
                eliminatedOrder: data.eliminatedOrder || []
            };
            renderTrust(st, db);
        });
    };

    function setupTrust() {
        if (!st.host) return;
        const lives = {};
        const shapes = {};
        st.players.forEach(p => {
            lives[p.id] = 3;
            shapes[p.id] = SHAPES[Math.floor(Math.random() * SHAPES.length)];
        });
        database.ref('game/trust').set({
            phase: 'playing',
            lives: lives,
            shapes: shapes,
            answers: {},
            timer: parseInt(st.data.targetTimer) || 60,
            targetTimer: parseInt(st.data.targetTimer) || 60,
            winner: null,
            eliminatedOrder: []
        });
        startHostTimer();
    }

    function startHostTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            database.ref('game/trust/timer').transaction(t => {
                if (t === null) return null;
                if (t > 0) return t - 1;
                return 0;
            });
        }, 1000);
    }

    function renderTrust(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;

        if (d.phase === 'lobby') {
            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <h2 style="color:var(--primary-red); margin-bottom:20px;">TRUST ME</h2>
                    <p style="font-size:0.8rem; margin-bottom:20px;">Secret symbols assigned. See others, not yours.</p>
                    <div class="card" style="border-color:#333;">
                        <input id="trust-timer-input" type="number" class="input-field" value="${d.targetTimer}" style="text-align:center; color:white;">
                    </div>
                </div>`;
            if (state.host) area.innerHTML = `<button class="btn btn-primary" onclick="initTrust()">START GAME</button>`;
            else area.innerHTML = `<p style="color:#666; font-size:0.7rem; text-align:center;">WAITING FOR HOST...</p>`;
            return;
        }

        if (d.phase === 'over') {
            const winner = st.players.find(p => p.id === d.winner);
            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <h1 style="color:gold; font-size:3rem;">FINISHED</h1>
                    <h3 style="color:gold;">GOLD: ${winner ? winner.name.toUpperCase() : 'NONE'}</h3>
                    <div style="margin-top:20px; font-size:0.8rem; color:#888;">
                        <p>Results processed for top survivors.</p>
                    </div>
                    <button class="btn btn-primary" style="margin-top:20px;" onclick="nextStage()">EXIT</button>
                </div>`;
            area.innerHTML = ''; return;
        }

        const myLives = d.lives[myId] || 0;
        if (myLives <= 0) {
            carea.innerHTML = `<div style="text-align:center; color:white; padding:40px 0;"><h1 style="color:red;">ELIMINATED</h1><p>Symbol: <b style="color:gold;">${d.shapes[myId]}</b></p></div>`;
            area.innerHTML = `<button class="btn" style="color:white; border:1px solid #333;" onclick="nextStage()">EXIT</button>`;
            return;
        }

        let headerHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:15px; border-bottom:1px solid #222; padding-bottom:5px;">
                <div style="text-align:left;">
                    <span style="font-size:0.5rem; color:#666;">STATUS</span><br/>
                    <b style="font-size:0.6rem; color:${myLives === 1 ? 'red' : 'var(--safe-green)'}">${myLives === 1 ? '❤️ 🖤 🖤' : 'SURVIVING'}</b>
                </div>
                <div style="text-align:center;">
                    <span style="font-size:0.5rem; color:#666;">TIMER</span><br/>
                    <b style="font-size:1.2rem; white;">${d.timer}s</b>
                </div>
                <div style="text-align:right;"><button onclick="nextStage()" style="background:none; border:1px solid #444; color:#666; font-size:0.5rem; padding:2px 8px;">EXIT</button></div>
            </div>`;

        let playerList = `<div style="display:grid; gap:10px; margin-top:10px;">`;
        st.players.forEach(p => {
            if ((d.lives[p.id] || 0) <= 0) return;
            const isMe = p.id === myId;
            playerList += `
                <div class="card" style="padding:10px 15px; margin-bottom:0; display:flex; justify-content:space-between; align-items:center; border-color:${isMe ? 'var(--primary-red)' : '#222'}">
                    <span style="font-size:0.8rem; color:white;">${p.name.toUpperCase()}</span>
                    <div style="font-size:1.5rem; color:cyan;">${isMe ? '<span style="font-size:0.6rem; color:#444;">?</span>' : SHAPE_ICONS[d.shapes[p.id]]}</div>
                </div>`;
        });

        carea.innerHTML = headerHtml + `<div style="width:100%;">${playerList}</div>`;

        if (d.timer === 0) {
            const myAnswer = d.answers[myId];
            let guessHtml = `<div style="text-align:center; padding:10px;"><p style="font-size:0.7rem; color:white;">GUESS YOUR SYMBOL</p><div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px; margin-top:10px;">`;
            SHAPES.forEach(s => {
                const active = myAnswer === s;
                guessHtml += `<button class="btn" style="background:${active ? 'var(--safe-green)' : '#111'}; color:${active ? 'black' : 'white'}; padding:10px; font-size:0.7rem;" onclick="submitGuess('${s}')">${s}</button>`;
            });
            area.innerHTML = guessHtml + `</div></div>`;
        } else {
            area.innerHTML = `<p style="text-align:center; color:#555; font-size:0.6rem;">CONSULT WITH OTHERS...</p>`;
        }

        if (state.host && d.timer === 0) {
            const aliveIds = st.players.filter(p => (d.lives[p.id] || 0) > 0).map(p => p.id);
            if (aliveIds.every(id => d.answers[id]) && aliveIds.length > 0) processTrustResults();
        }
    }

    function processTrustResults() {
        if (!st.host) return;
        const d = st.data;
        const newLives = { ...d.lives };
        const newlyEliminated = [];

        st.players.forEach(p => {
            const oldLife = d.lives[p.id] || 0;
            if (oldLife <= 0) return;
            if (d.answers[p.id] !== d.shapes[p.id]) {
                newLives[p.id]--;
                if (newLives[p.id] <= 0) newlyEliminated.push(p.id);
            }
        });

        const updatedElimOrder = (d.eliminatedOrder || []).concat(newlyEliminated);
        const stillAlive = st.players.filter(p => newLives[p.id] > 0);

        if (stillAlive.length <= 1) {
            const winnerId = stillAlive.length === 1 ? stillAlive[0].id : null;
            database.ref('game/trust').update({
                phase: 'over',
                lives: newLives,
                winner: winnerId,
                eliminatedOrder: updatedElimOrder
            });
            awardTrustPool(winnerId, updatedElimOrder);
            if (timerInterval) clearInterval(timerInterval);
        } else {
            const newShapes = {};
            st.players.forEach(p => { newShapes[p.id] = SHAPES[Math.floor(Math.random() * SHAPES.length)]; });
            database.ref('game/trust').update({
                phase: 'playing',
                shapes: newShapes,
                answers: {},
                lives: newLives,
                timer: parseInt(st.data.targetTimer) || 60,
                eliminatedOrder: updatedElimOrder
            });
        }
    }

    function awardTrustPool(winnerId, elimOrder) {
        if (!st.host) return;

        // Winner (1st) -> Gold
        if (winnerId) giveMedal(winnerId, 'gold');

        // Last Eliminated (2nd) -> Silver
        if (elimOrder.length >= 1) {
            const secondId = elimOrder[elimOrder.length - 1];
            if (secondId !== winnerId) giveMedal(secondId, 'silver');
        }

        // Second-to-last Eliminated (3rd) -> Bronze
        if (elimOrder.length >= 2) {
            const thirdId = elimOrder[elimOrder.length - 2];
            if (thirdId !== winnerId) giveMedal(thirdId, 'bronze');
        }
    }

    function giveMedal(playerId, type) {
        const player = st.players.find(p => p.id === playerId);
        if (player) {
            const medals = { ...(player.medals || { gold: 0, silver: 0, bronze: 0 }) };
            medals[type]++;
            database.ref(`game/players/${playerId}/medals`).set(medals);
        }
    }

    window.submitGuess = function (guess) { database.ref(`game/trust/answers/${st.player.id}`).set(guess); };
    window.initTrust = function () {
        const t = document.getElementById('trust-timer-input').value;
        database.ref('game/trust/targetTimer').set(parseInt(t) || 60);
        setupTrust();
    };
})();

