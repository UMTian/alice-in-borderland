; (function () {
    let st;
    let database;
    let timerInterval;
    let localChoice = null;

    window.loadMathStage = function (state, db) {
        st = state;
        database = db;

        db.ref('game/math').on('value', (snap) => {
            const data = snap.val() || {};
            st.data = {
                phase: data.phase || 'lobby',
                lives: data.lives || {},
                answers: data.answers || {},
                timer: data.timer || 0,
                targetTimer: data.targetTimer || 30,
                winner: data.winner || null,
                eliminatedOrder: data.eliminatedOrder || [],
                lastResult: data.lastResult || null,
                readies: data.readies || {}
            };
            if (st.data.phase === 'playing' && localChoice === null) {
                localChoice = st.data.answers[st.player.id] || 50;
            }
            renderMath(st, db);
        });
    };

    function setupMath() {
        if (!st.host) return;
        const lives = {};
        st.players.forEach(p => { lives[p.id] = 5; });
        database.ref('game/math').set({
            phase: 'playing',
            lives: lives,
            answers: {},
            timer: parseInt(st.data.targetTimer) || 30,
            targetTimer: parseInt(st.data.targetTimer) || 30,
            winner: null,
            eliminatedOrder: [],
            lastResult: null,
            readies: {}
        });
        startHostTimer();
    }

    function startHostTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            database.ref('game/math/timer').transaction(t => {
                if (t === null) return null;
                if (t > 0) return t - 1;
                return 0;
            });
        }, 1000);
    }

    function renderMath(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;

        if (d.phase === 'lobby') {
            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <h2 style="color:gold; margin-bottom:20px;">THE MATH</h2>
                    <p style="font-size:0.8rem; margin-bottom:20px;">80% of Average Beauty Contest.</p>
                    <div class="card" style="border-color:#333;">
                        <input id="math-timer-input" type="number" class="input-field" value="${d.targetTimer}" style="text-align:center; color:white;">
                    </div>
                </div>`;
            if (state.host) area.innerHTML = `<button class="btn btn-primary" onclick="initMath()">START EXPERIMENT</button>`;
            else area.innerHTML = `<p style="color:#666; font-size:0.7rem; text-align:center;">WAITING FOR HOST...</p>`;
            return;
        }

        if (d.phase === 'over') {
            const winner = st.players.find(p => p.id === d.winner);
            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <h1 style="color:gold; font-size:3rem;">FINISHED</h1>
                    <h2 style="color:gold;">WINNER: ${winner ? winner.name.toUpperCase() : 'NONE'}</h2>
                    <button class="btn btn-primary" style="margin-top:20px;" onclick="nextStage()">EXIT</button>
                </div>`;
            area.innerHTML = ''; return;
        }

        const myLives = d.lives[myId] || 0;
        if (myLives <= 0) {
            carea.innerHTML = `<div style="text-align:center; color:white; padding:40px 0;"><h1 style="color:red;">ELIMINATED</h1></div>`;
            area.innerHTML = `<button class="btn" style="color:white; border:1px solid #333;" onclick="nextStage()">EXIT</button>`;
            return;
        }

        let headerHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; border-bottom:1px solid #222; padding-bottom:5px; margin-bottom:10px;">
                <div style="text-align:left;"><b style="font-size:0.7rem; color:var(--safe-green)">❤️ ${myLives}</b></div>
                <div style="text-align:center;"><b style="font-size:1.4rem; color:white;">${d.timer}s</b></div>
                <div style="text-align:right;"><button onclick="nextStage()" style="background:none; border:1px solid #444; color:#666; font-size:0.6rem; padding:4px 8px;">EXIT</button></div>
            </div>`;

        if (d.phase === 'playing') {
            let playerStats = `<div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; margin-bottom:10px;">`;
            st.players.forEach(p => {
                const l = d.lives[p.id] || 0;
                if (l <= 0) return;
                const hasChosen = d.answers[p.id] !== undefined;
                playerStats += `<div style="border-bottom:1px solid #222; font-size:0.5rem; color:${hasChosen ? 'var(--safe-green)' : '#444'}; text-align:center; padding-bottom:2px;">${p.name.substring(0, 6)}${hasChosen ? '✓' : ''}</div>`;
            });
            playerStats += `</div>`;

            const finalAnswer = d.answers[myId];
            let gridHtml = `<div style="display:grid; grid-template-columns: repeat(10, 1fr); gap:2px; margin-top:5px; width:100%;">`;
            for (let i = 1; i <= 100; i++) {
                const isSelected = localChoice === i;
                const isSubmitted = finalAnswer === i;
                gridHtml += `<button onclick="setLocalMath(${i})" style="aspect-ratio:1; border:none; border-radius:3px; background:${isSubmitted ? 'var(--safe-green)' : (isSelected ? 'gold' : '#1a1a1a')}; color:${(isSubmitted || isSelected) ? 'black' : '#eee'}; font-size:0.85rem; font-weight:bold; padding:0; display:flex; align-items:center; justify-content:center;">${i}</button>`;
            }
            gridHtml += `</div>`;

            carea.innerHTML = headerHtml + playerStats + gridHtml;

            if (!finalAnswer) {
                area.innerHTML = `<button class="btn btn-primary" style="margin-top:10px;" onclick="confirmMath()">CONFIRM: ${localChoice}</button>`;
            } else {
                area.innerHTML = `<p style="text-align:center; color:#666; font-size:0.6rem; margin-top:10px;">LOCKED IN: ${finalAnswer}</p>`;
            }
        } else if (d.phase === 'reveal') {
            const res = d.lastResult || { average: 0, target: 0 };

            let revealList = `<div style="margin-top:10px; display:grid; gap:5px;">`;
            st.players.forEach(p => {
                const oldLife = (d.lives[p.id] || 0) + (d.answers[p.id] !== undefined ? 0 : 0); // Just visualization
                if (oldLife <= 0 && !d.answers[p.id]) return;

                const ans = d.answers[p.id] || 'N/A';
                const diff = Math.abs(ans - res.target);
                const survived = diff < 0.001 || !st.players.some(op => {
                    const od = Math.abs((d.answers[op.id] || 0) - res.target);
                    return (d.lives[op.id] > 0) && (od < diff - 0.0001);
                });

                // Better check: use the actual target logic
                const isWinner = Object.keys(d.answers).length > 0 && Array.from(Object.values(d.answers)).every(v => Math.abs(v - res.target) >= diff - 0.001);

                revealList += `
                    <div class="card" style="margin-bottom:0; padding:8px; display:flex; justify-content:space-between; align-items:center; border-color:${isWinner ? 'var(--safe-green)' : 'red'}">
                        <div style="text-align:left;">
                            <span style="font-size:0.7rem; display:block;">${p.name.toUpperCase()}</span>
                            <span style="font-size:0.6rem; color:var(--primary-red);">${'❤️'.repeat(d.lives[p.id] || 0)}</span>
                        </div>
                        <span style="font-size:0.7rem;">PICKED: <b>${ans}</b></span>
                        <span style="font-size:0.6rem; color:${isWinner ? 'var(--safe-green)' : 'red'}">${isWinner ? 'SURVIVED' : 'LOST LIFE'}</span>
                    </div>`;
            });
            revealList += `</div>`;

            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <div style="display:flex; justify-content:space-around; background:#111; padding:10px; border-radius:8px; border:1px solid cyan;">
                        <div style="text-align:center;"><small style="color:#666; font-size:0.5rem;">AVERAGE</small><br/><b style="color:white;">${res.average.toFixed(2)}</b></div>
                        <div style="text-align:center;"><small style="color:#666; font-size:0.5rem;">TARGET (0.8x)</small><br/><b style="color:gold; font-size:1.2rem;">${res.target.toFixed(2)}</b></div>
                    </div>
                    ${revealList}
                </div>`;

            const iAmReady = d.readies[myId] === true;
            if (!iAmReady) {
                area.innerHTML = `<button class="btn btn-primary" onclick="readyMath()">NEXT ROUND</button>`;
            } else {
                area.innerHTML = `<p style="text-align:center; color:#666; font-size:0.7rem;">WAITING FOR OTHERS (${Object.keys(d.readies).length}/${st.players.filter(p => d.lives[p.id] > 0).length})...</p>`;
            }
        }

        if (state.host && d.phase === 'playing' && d.timer === 0) {
            const aliveCount = st.players.filter(p => (d.lives[p.id] || 0) > 0).length;
            if (Object.keys(d.answers).length >= aliveCount && aliveCount > 0) processMathResults();
        }

        if (state.host && d.phase === 'reveal') {
            const aliveIds = st.players.filter(p => (d.lives[p.id] || 0) > 0).map(p => p.id);
            if (aliveIds.every(id => d.readies[id])) nextRoundMath();
        }
    }

    window.setLocalMath = function (val) {
        if (st.data.answers[st.player.id]) return;
        localChoice = val;
        renderMath(st, database);
    };

    window.confirmMath = function () {
        if (!localChoice || st.data.answers[st.player.id]) return;
        database.ref(`game/math/answers/${st.player.id}`).set(localChoice);
    };

    window.readyMath = function () {
        database.ref(`game/math/readies/${st.player.id}`).set(true);
    };

    function processMathResults() {
        if (!st.host) return;
        const d = st.data;
        const alivePlayers = st.players.filter(p => (d.lives[p.id] || 0) > 0);
        if (alivePlayers.length === 0) return;

        const nums = alivePlayers.map(p => parseInt(d.answers[p.id]) || 0);
        const average = nums.reduce((a, b) => a + b, 0) / nums.length;
        const target = average * 0.8;

        let minDiff = 1000;
        alivePlayers.forEach(p => {
            const diff = Math.abs((parseInt(d.answers[p.id]) || 0) - target);
            if (diff < minDiff) minDiff = diff;
        });

        const newLives = { ...d.lives };
        const newlyEliminated = [];
        alivePlayers.forEach(p => {
            const diff = Math.abs((parseInt(d.answers[p.id]) || 0) - target);
            if (diff > minDiff + 0.001) {
                newLives[p.id]--;
                if (newLives[p.id] <= 0) newlyEliminated.push(p.id);
            }
        });

        database.ref('game/math').update({
            phase: 'reveal',
            lives: newLives,
            eliminatedOrder: (d.eliminatedOrder || []).concat(newlyEliminated),
            lastResult: { average, target },
            readies: {}
        });
        if (timerInterval) clearInterval(timerInterval);
    }

    window.nextRoundMath = function () {
        if (!st.host) return;
        const d = st.data;
        const stillAlive = st.players.filter(p => d.lives[p.id] > 0);

        if (stillAlive.length <= 1) {
            database.ref('game/math').update({ phase: 'over', winner: stillAlive.length === 1 ? stillAlive[0].id : 'NONE' });
            if (stillAlive.length === 1) awardMathPool(stillAlive[0].id, d.eliminatedOrder);
        } else {
            localChoice = null;
            database.ref('game/math').update({ phase: 'playing', answers: {}, timer: d.targetTimer, readies: {} });
            startHostTimer();
        }
    }

    function awardMathPool(winnerId, elimOrder) {
        if (!st.host) return;
        giveMedal(winnerId, 'gold');
        if (elimOrder && elimOrder.length >= 1) giveMedal(elimOrder[elimOrder.length - 1], 'silver');
        if (elimOrder && elimOrder.length >= 2) giveMedal(elimOrder[elimOrder.length - 2], 'bronze');
    }

    function giveMedal(playerId, type) {
        const p = st.players.find(pl => pl.id === playerId);
        if (p) {
            const m = { ...(p.medals || { gold: 0, silver: 0, bronze: 0 }) };
            m[type]++;
            database.ref(`game/players/${playerId}/medals`).set(m);
        }
    }

    window.initMath = function () {
        const t = document.getElementById('math-timer-input').value;
        database.ref('game/math/targetTimer').set(parseInt(t) || 30);
        setupMath();
    };
})();
