; (function () {
    let wolfTimer;

    window.loadWolfStage = function (state, db) {
        console.log("WOLF_SHEEP: STARTING...");

        if (state.host) {
            db.ref('game/timeLimit').once('value', (tSnap) => {
                const limit = tSnap.val() || 30;
                db.ref('game/wolf').set({
                    round: 1,
                    status: 'assigning',
                    limit: limit,
                    scores: {},
                    wolfHistory: []
                }).then(() => {
                    startWolfRound(state, db);
                });
            });
        }

        db.ref('game/wolf').on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            const myRole = data.roles ? data.roles[state.player.id] : 'sheep';
            state.data = {
                phase: data.status,
                round: data.round,
                role: myRole,
                requests: data.requests || {},
                accepts: data.accepts || {},
                scores: data.scores || {},
                wolfHistory: data.wolfHistory || [],
                endTime: data.endTime,
                results: data.results || {},
                medalsAwarded: data.medalsAwarded
            };

            if (data.status === 'play') {
                syncWolfTimer(data.endTime, db, state.host);
            } else {
                clearInterval(wolfTimer);
            }

            renderWolf(state, db);
        });
    };

    function startWolfRound(state, db) {
        db.ref('game/wolf').once('value', (snap) => {
            const data = snap.val();
            const players = state.players || [];
            if (players.length === 0) return;
            const history = data.wolfHistory || [];

            const lastWolf = history[history.length - 1];
            const pool = players.filter(p => p.id !== lastWolf);
            const neverBeenWolf = pool.filter(p => !history.includes(p.id));

            let wolfId;
            if (neverBeenWolf.length > 0) {
                wolfId = neverBeenWolf[Math.floor(Math.random() * neverBeenWolf.length)].id;
            } else {
                wolfId = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)].id : players[0].id;
            }

            const roles = {};
            players.forEach(p => roles[p.id] = (p.id === wolfId ? 'wolf' : 'sheep'));

            db.ref('game/wolf').update({
                roles: roles,
                wolfHistory: [...history, wolfId],
                status: 'play',
                requests: {},
                accepts: {},
                endTime: Date.now() + (data.limit * 1000),
                results: {}
            });
        });
    }

    function syncWolfTimer(end, db, isHost) {
        clearInterval(wolfTimer);
        const el = document.getElementById('game-timer');
        if (!el || !end) return;

        wolfTimer = setInterval(() => {
            const now = Date.now();
            const left = Math.max(0, Math.floor((end - now) / 1000));
            el.innerText = `ROUND TIME: ${left}s`;

            if (left <= 0) {
                clearInterval(wolfTimer);
                if (isHost) {
                    db.ref('game/wolf/status').once('value', (s) => {
                        if (s.val() === 'play') endWolfRound(db);
                    });
                }
            }
        }, 1000);
    }

    function endWolfRound(db) {
        db.ref('game/wolf/status').set('calculating').then(() => {
            // First get the ACTUAL online players
            db.ref('game/players').once('value', (pSnap) => {
                const onlinePlayers = Object.keys(pSnap.val() || {});

                db.ref('game/wolf').once('value', (snap) => {
                    const data = snap.val();
                    const roles = data.roles || {};
                    const reqs = data.requests || {};
                    const accs = data.accepts || {};
                    const scores = data.scores || {};
                    const results = {};

                    // Only process players who are both in the game AND online
                    const playersToScore = Object.keys(roles).filter(pid => onlinePlayers.includes(pid));

                    playersToScore.forEach(pid => {
                        if (!scores[pid]) scores[pid] = 0;

                        const pairedWith = [];
                        playersToScore.forEach(otherId => {
                            if (otherId === pid) return;
                            const bAcceptedA = (accs[otherId] && accs[otherId][pid]);
                            const aRequestedB = (reqs[pid] && reqs[pid][otherId]);
                            const aAcceptedB = (accs[pid] && accs[pid][otherId]);
                            const bRequestedA = (reqs[otherId] && reqs[otherId][pid]);

                            if ((aRequestedB && bAcceptedA) || (bRequestedA && aAcceptedB)) {
                                pairedWith.push(otherId);
                            }
                        });

                        let roundScore = 0;
                        let statusMsg = "";

                        if (roles[pid] === 'sheep') {
                            if (pairedWith.length === 0) {
                                roundScore = -10;
                                statusMsg = "NOT PAIRED (-10)";
                            } else {
                                const wolfPair = pairedWith.find(id => roles[id] === 'wolf');
                                if (wolfPair) {
                                    roundScore = -10;
                                    statusMsg = "PAIRED WITH WOLF (-10)";
                                } else {
                                    roundScore = 10;
                                    statusMsg = "SAFE (+10)";
                                }
                            }
                        } else { // WOLF
                            const sheepKilled = pairedWith.filter(id => roles[id] === 'sheep');
                            if (sheepKilled.length === 0) {
                                roundScore = -5;
                                statusMsg = "FAILED TO KILL (-5)";
                            } else {
                                roundScore = sheepKilled.length * 10;
                                statusMsg = `KILLED ${sheepKilled.length} SHEEP (+${roundScore})`;
                            }
                        }

                        scores[pid] += roundScore;
                        results[pid] = { score: roundScore, msg: statusMsg };
                    });

                    const finalStatus = data.round >= 10 ? 'finished' : 'results';
                    db.ref('game/wolf').update({
                        scores: scores,
                        results: results,
                        status: finalStatus
                    });
                });
            });
        });
    }

    window.wolfAction = function (type, targetId) {
        const db = firebase.database();
        const saved = localStorage.getItem('borderland_player');
        if (!saved) return;
        const myId = JSON.parse(saved).id;
        if (!myId) return;
        if (type === 'request') {
            db.ref(`game/wolf/requests/${myId}/${targetId}`).set(true);
        } else if (type === 'accept') {
            db.ref(`game/wolf/accepts/${myId}/${targetId}`).set(true);
        }
    };

    window.nextWolfRound = function () {
        const db = firebase.database();
        db.ref('game/wolf/round').transaction(r => (r || 0) + 1);
        db.ref('game/wolf/status').set('assigning').then(() => {
            db.ref('game/players').once('value', s => {
                const players = Object.values(s.val() || {});
                startWolfRound({ host: true, players }, db);
            });
        });
    };

    function renderWolf(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        if (!carea) return;

        const d = state.data;
        const myId = state.player.id;

        const backBtn = `<button class="btn" style="background:#1a1a1a; margin-top:15px; width:100%; border:1px solid #333; padding:12px; font-size:0.7rem;" onclick="nextStage()">BACK TO MENU</button>`;

        if (d.phase === 'assigning' || d.phase === 'calculating') {
            carea.innerHTML = `<h1>ROUND ${d.round}</h1><p style="letter-spacing:4px; color:#888;">${d.phase.toUpperCase()}...</p>`;
            area.innerHTML = backBtn;
            return;
        }

        if (d.phase === 'results') {
            const myRes = d.results[myId] || {};
            carea.innerHTML = `
                <div style="padding:20px;">
                    <h3 style="color:#666;">ROUND ${d.round} OVER</h3>
                    <h1 style="margin:20px 0; color:var(--primary-red); font-size:2rem;">${myRes.msg || "..."}</h1>
                    <div class="card" style="display:inline-block; padding:10px 30px;">
                        <span style="font-size:0.6rem; color:#888; display:block;">TOTAL SCORE</span>
                        <span style="font-size:2rem; font-weight:900; color:gold;">${d.scores[myId] || 0}</span>
                    </div>
                </div>`;
            area.innerHTML = (state.host ? `<button class="btn btn-primary" style="padding:15px; width:100%;" onclick="nextWolfRound()">START NEXT ROUND</button>` : `<p style="color:var(--safe-green);">Waiting for Host to advance...</p>`) + backBtn;
            return;
        }

        if (d.phase === 'finished') {
            const finalScores = d.scores || {};
            const players = state.players || [];
            const sorted = [...players].sort((a, b) => (finalScores[b.id] || 0) - (finalScores[a.id] || 0));

            if (state.host && !d.medalsAwarded) {
                awardFinalMedals(sorted, db);
                db.ref('game/wolf/medalsAwarded').set(true);
            }

            carea.innerHTML = `
                <h1 style="color:gold; font-size:2.5rem; margin-bottom:20px;">HALL OF VICTORY</h1>
                <div style="text-align:left; width:100%; max-height:250px; overflow-y:auto; font-family:'JetBrains Mono';">` +
                sorted.map((p, i) => `
                    <div style="display:flex; justify-content:space-between; padding:12px; background:rgba(255,255,255,0.05); margin-bottom:5px; border-radius:8px; ${i < 3 ? 'border-left:4px solid gold' : ''}">
                        <span>${i + 1}. ${p.name.toUpperCase()}</span>
                        <span style="color:gold; font-weight:bold;">${finalScores[p.id] || 0} pts</span>
                    </div>`).join('') + `</div>`;
            area.innerHTML = `<button class="btn btn-primary" style="width:100%; padding:15px;" onclick="nextStage()">EXIT TO MAP</button>`;
            return;
        }

        const roleColor = d.role === 'wolf' ? 'red' : 'var(--safe-green)';
        let html = `<h2 style="color:${roleColor}; font-weight:900; letter-spacing:2px; margin-bottom:10px;">ROUND ${d.round} : ${d.role.toUpperCase()}</h2>`;
        html += `<div style="margin-top:20px; text-align:left; max-height:280px; overflow-y:auto;">`;

        state.players.forEach(p => {
            if (p.id === myId) return;
            const hasRequested = d.requests[myId] && d.requests[myId][p.id];
            const hasAccepted = d.accepts[myId] && d.accepts[myId][p.id];
            const incomingRequest = d.requests[p.id] && d.requests[p.id][myId];
            const canAccept = incomingRequest && !hasAccepted;

            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #222; background:rgba(0,0,0,0.4); margin-bottom:8px; border-radius:12px;">
                    <div>
                        <span style="font-size:0.9rem; font-weight:bold;">${p.name.toUpperCase()}</span>
                        ${incomingRequest ? '<br><span style="color:gold; font-size:0.5rem; letter-spacing:1px;">● INCOMING REQUEST!</span>' : ''}
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn" style="padding:10px 15px; font-size:0.7rem; border-radius:8px; transition:all 0.2s; background:${hasRequested ? '#222' : 'var(--primary-red)'}; color:${hasRequested ? '#555' : '#fff'}; border:1px solid ${hasRequested ? '#333' : 'transparent'}" 
                            onclick="wolfAction('request', '${p.id}')" ${hasRequested ? 'disabled' : ''}>${hasRequested ? 'PENDING' : 'SEND REQ'}</button>
                        <button class="btn" style="padding:10px 15px; font-size:0.7rem; border-radius:8px; transition:all 0.2s; background:${!canAccept ? '#222' : 'var(--safe-green)'}; color:${!canAccept ? '#555' : '#fff'}; border:1px solid ${!canAccept ? '#333' : 'transparent'}" 
                            onclick="wolfAction('accept', '${p.id}')" ${!canAccept ? 'disabled' : ''}>${hasAccepted ? 'ACCEPTED' : 'ACCEPT'}</button>
                    </div>
                </div>`;
        });
        html += `</div>`;

        carea.innerHTML = html;
        area.innerHTML = `<p style="font-size:0.6rem; color:#666; margin:10px 0;">SHEEP + SHEEP = SAFE. SHEEP + WOLF = DEATH.</p>` + backBtn;
    }

    function awardFinalMedals(sorted, db) {
        if (sorted[0]) award(db, 'gold', sorted[0].id);
        if (sorted[1]) award(db, 'silver', sorted[1].id);
        if (sorted[2]) award(db, 'bronze', sorted[2].id);
    }

    function award(db, type, pid) {
        db.ref(`game/players/${pid}/medals`).once('value', (snap) => {
            const m = snap.val() || { gold: 0, silver: 0, bronze: 0 };
            m[type]++;
            db.ref(`game/players/${pid}/medals`).set(m);
        });
    }
})();
