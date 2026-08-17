; (function () {
    let st;
    let database;

    window.loadKillerStage = function (state, db) {
        st = state;
        database = db;

        if (state.host) setupKiller(state, db);

        db.ref('game/killer').on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            st.data = {
                phase: data.phase,
                roles: data.roles || {},
                alive: data.alive || {},
                actions: data.actions || {},
                votes: data.votes || {},
                logs: data.logs || [],
                winner: data.winner,
                ready: data.ready || {},
                revealedInfo: data.revealedInfo || null
            };

            renderKiller(st, db);
        });
    };

    function setupKiller(state, db) {
        const players = state.players;
        const ids = players.map(p => p.id).sort(() => Math.random() - 0.5);

        const roles = {};
        const alive = {};
        const ready = {};

        roles[ids[0]] = 'killer';
        roles[ids[1]] = 'rescuer';
        for (let i = 2; i < ids.length; i++) roles[ids[i]] = 'villager';

        ids.forEach(id => {
            alive[id] = true;
            ready[id] = false;
        });

        db.ref('game/killer').set({
            phase: 'role_reveal',
            roles: roles,
            alive: alive,
            actions: { killer: null, rescuer: null },
            votes: {},
            ready: ready,
            logs: ["THE GAME BEGINS. ROLES ASSIGNED."],
        });
    }

    function getConnectedAliveIds(data) {
        if (!st.players) return [];
        return Object.keys(data.alive).filter(id => data.alive[id] && st.players.some(p => p.id === id));
    }

    function checkPhaseComplete(db, data) {
        if (!st.host) return;

        const aliveConnected = getConnectedAliveIds(data);
        const winCheck = checkKillerWin(data.alive, data.roles);

        if (winCheck && data.phase !== 'over' && data.phase !== 'reveal') {
            if (data.phase !== 'role_reveal') {
                awardRewards(winCheck, data.alive, data.roles);
                db.ref('game/killer').update({ phase: 'over', winner: winCheck });
                return;
            }
        }

        if (data.phase === 'role_reveal') {
            if (aliveConnected.length > 0 && aliveConnected.every(id => data.ready[id])) {
                db.ref('game/killer').update({ phase: 'night', ready: resetReady(data.alive) });
            }
        }
        else if (data.phase === 'night') {
            const killerId = Object.keys(data.roles).find(id => data.roles[id] === 'killer');
            const killerActed = !data.alive[killerId] || !st.players.some(p => p.id === killerId) || data.actions.killer;
            if (killerActed) {
                db.ref('game/killer').update({ phase: 'day_vote', ready: resetReady(data.alive) });
            }
        }
        else if (data.phase === 'day_vote') {
            const killerId = Object.keys(data.roles).find(id => data.roles[id] === 'killer');
            const voters = aliveConnected.filter(id => id !== killerId);
            const allVoted = (voters.length === 0) || voters.every(id => data.votes && data.votes[id]);

            if (allVoted) {
                db.ref('game/killer').update({ phase: 'day_rescuer', ready: resetReady(data.alive) });
            }
        }
        else if (data.phase === 'day_rescuer') {
            const rescuerId = Object.keys(data.roles).find(id => data.roles[id] === 'rescuer');
            const rescuerActed = !data.alive[rescuerId] || !st.players.some(p => p.id === rescuerId) || data.actions.rescuer;
            if (rescuerActed) {
                processRoundResults(db, data);
            }
        }
        else if (data.phase === 'reveal') {
            if (aliveConnected.length === 0 || aliveConnected.every(id => data.ready[id])) {
                const win = checkKillerWin(data.alive, data.roles);
                if (win) {
                    awardRewards(win, data.alive, data.roles);
                    db.ref('game/killer').update({ phase: 'over', winner: win });
                } else {
                    db.ref('game/killer').update({
                        phase: 'night',
                        ready: resetReady(data.alive),
                        actions: { killer: null, rescuer: null },
                        votes: {},
                        revealedInfo: null
                    });
                }
            }
        }
    }

    window.forceSkipPhase = function () {
        if (!st.host || !st.data) return;
        const d = st.data;
        if (d.phase === 'night') {
            database.ref('game/killer').update({ phase: 'day_vote', ready: resetReady(d.alive) });
        } else if (d.phase === 'day_vote') {
            database.ref('game/killer').update({ phase: 'day_rescuer', ready: resetReady(d.alive) });
        } else if (d.phase === 'day_rescuer') {
            processRoundResults(database, d);
        } else if (d.phase === 'reveal' || d.phase === 'role_reveal') {
            const aliveConnected = getConnectedAliveIds(d);
            aliveConnected.forEach(id => database.ref(`game/killer/ready/${id}`).set(true));
        }
    };

    function resetReady(alive) {
        const obj = {};
        Object.keys(alive).forEach(id => { if (alive[id]) obj[id] = false; });
        return obj;
    }

    function processRoundResults(db, data) {
        const victim = data.actions.killer;
        const saved = data.actions.rescuer;
        const votes = data.votes || {};
        const alive = { ...data.alive };
        const logs = [...(data.logs || [])];

        const counts = {};
        Object.values(votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
        let max = 0; let exiled = null; let tie = false;
        Object.entries(counts).forEach(([id, c]) => {
            if (c > max) { max = c; exiled = id; tie = false; }
            else if (c === max) { tie = true; }
        });

        let exiledName = "NO ONE";
        if (exiled && !tie) {
            exiledName = st.players.find(p => p.id === exiled)?.name || "UNKNOWN";
            if (exiled === saved) {
                logs.push(`${exiledName.toUpperCase()} WAS VOTED OUT BUT RESCUED.`);
            } else {
                alive[exiled] = false;
                logs.push(`${exiledName.toUpperCase()} WAS VOTED OUT.`);
            }
        }

        let targetName = "NO ONE";
        let victimDied = false;

        if (victim) {
            targetName = st.players.find(p => p.id === victim)?.name || "UNKNOWN";
            if (victim === saved) {
                logs.push(`${targetName.toUpperCase()} WAS TARGETED BUT RESCUED.`);
            } else {
                if (alive[victim]) {
                    alive[victim] = false;
                    victimDied = true;
                    logs.push(`${targetName.toUpperCase()} WAS KILLED BY KILLER.`);
                }
            }
        }

        const revealedInfo = {
            exiled: exiled && !tie ? exiledName : null,
            target: victim ? targetName : null,
            saved: saved ? (st.players.find(p => p.id === saved)?.name || "UNKNOWN") : null,
            victimDied: victimDied
        };

        db.ref('game/killer').update({
            phase: 'reveal',
            alive: alive,
            logs: logs,
            ready: resetReady(alive),
            revealedInfo: revealedInfo
        });
    }

    function checkKillerWin(alive, roles) {
        const killerId = Object.keys(roles).find(id => roles[id] === 'killer');
        const killerAlive = alive[killerId];
        const othersAlive = Object.keys(alive).filter(id => roles[id] !== 'killer' && alive[id]).length;

        if (!killerAlive) return 'VILLAGERS';
        if (othersAlive <= 1) return 'KILLER';
        return null;
    }

    function awardRewards(winner, alive, roles) {
        if (!st.host) return;
        st.players.forEach(p => {
            const isKiller = roles[p.id] === 'killer';
            const survived = alive[p.id];
            let medal = null;
            if (winner === 'KILLER' && isKiller) medal = 'gold';
            else if (winner === 'VILLAGERS' && !isKiller && survived) medal = 'silver';
            if (medal) {
                const updatedMedals = { ...(p.medals || { gold: 0, silver: 0, bronze: 0 }) };
                updatedMedals[medal]++;
                database.ref(`game/players/${p.id}/medals`).set(updatedMedals);
            }
        });
    }

    function renderKiller(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;
        const myRole = d.roles[myId] || 'villager';
        const isAlive = d.alive[myId];

        if (state.host) checkPhaseComplete(db, d);

        if (d.phase === 'over') {
            const winColor = d.winner === 'KILLER' ? 'red' : 'gold';
            let html = `<div class="card" style="border-color:${winColor}; background:rgba(0,0,0,0.8); text-align:center;">
                <h1 style="font-size:3rem; margin:20px 0; color:${winColor}">${d.winner} WINS</h1>
                <p style="font-size:0.7rem; color:#888;">THE KILLER WAS: <b>${st.players.find(p => d.roles[p.id] === 'killer')?.name.toUpperCase()}</b></p>
                <div style="margin:20px 0; font-size:0.8rem;">
                    ${d.winner === 'KILLER' ? '<p style="color:gold;">KILLER EARNED GOLD MEDAL</p>' : '<p style="color:silver;">SURVIVING VILLAGERS EARNED SILVER</p>'}
                </div>
                <button class="btn btn-primary" style="margin-top:20px; width:100%;" onclick="nextStage()">CONTINUE TO MAIN MENU</button>`;
            if (state.host) {
                html += `<button class="btn" style="margin-top:10px; width:100%; border:1px solid #444;" onclick="setupKillerStage()">PLAY AGAIN (RE-INITIALIZE)</button>`;
            }
            html += `</div>`;
            carea.innerHTML = html;
            area.innerHTML = ''; return;
        }

        if (d.phase === 'role_reveal') {
            let roleDesc = ""; let roleColor = "white";
            if (myRole === 'killer') { roleDesc = "KILL EVERYONE WITHOUT BEING CAUGHT."; roleColor = "red"; }
            else if (myRole === 'rescuer') { roleDesc = "YOU CAN SAVE ONE PERSON EACH NIGHT."; roleColor = "var(--safe-green)"; }
            else { roleDesc = "SURVIVE AND VOTE OUT THE KILLER."; roleColor = "#fff"; }

            carea.innerHTML = `<div style="padding:40px 0; text-align:center;">
                <p style="font-size:0.6rem; color:#888; letter-spacing:4px;">YOUR SECRET ROLE</p>
                <h1 style="font-size:3.5rem; color:${roleColor}; text-shadow:0 0 15px ${roleColor}; margin:10px 0;">${myRole.toUpperCase()}</h1>
                <p style="font-size:0.7rem; font-style:italic; border-top:1px solid #222; padding-top:15px; margin-top:15px;">"${roleDesc}"</p>
            </div>`;
            area.innerHTML = `<button class="btn" style="width:100%; background:${d.ready[myId] ? '#222' : 'var(--safe-green)'}; color:${d.ready[myId] ? '#444' : '#000'}" onclick="setReady(true)">${d.ready[myId] ? 'WAITING...' : 'I AM READY'}</button>`;
            return;
        }

        let html = `<div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:15px; border-bottom:1px solid #222; padding-bottom:5px;">
            <div style="text-align:left;"><span style="font-size:0.5rem; color:#666;">ROLE</span><br/><b style="font-size:0.6rem; color:gold;">${myRole.toUpperCase()}</b></div>
            <div><button onclick="nextStage()" style="background:none; border:1px solid #444; color:#666; font-size:0.5rem; padding:2px 8px; cursor:pointer;">BACK TO MENU</button></div>
            <div style="text-align:right;"><span style="font-size:0.5rem; color:#666;">STATUS</span><br/><b style="font-size:0.6rem; color:${isAlive ? 'var(--safe-green)' : 'red'}">${isAlive ? 'ALIVE' : 'ELIMINATED'}</b></div>
        </div>`;

        if (!isAlive && d.phase !== 'reveal') {
            carea.innerHTML = html + `<div style="text-align:center;"><h2 style="color:red; margin-top:50px;">YOU WERE ELIMINATED</h2><p style="font-size:0.6rem; color:#444;">Dead men tell no tales. Observing the village...</p></div>`;
            area.innerHTML = `<button class="btn" onclick="nextStage()">EXIT TO MENU</button>`;
            if (state.host) area.innerHTML += `<button onclick="forceSkipPhase()" style="margin-top:10px; background:none; border:1px dashed #444; color:#444; font-size:0.5rem; width:100%;">HOST: FORCE SKIP PHASE</button>`;
            return;
        }

        if (d.phase === 'night') {
            if (myRole === 'killer') {
                html += `<h3>NIGHT ACTION</h3><p style="font-size:0.6rem; color:#888;">WHOM SHALL YOU ELIMINATE?</p>`;
                html += renderTargetList(state, (tid) => db.ref('game/killer/actions/killer').set(tid), d.actions.killer, true);
            } else {
                html += `<div style="padding:40px 0; text-align:center; opacity:0.3;"><h2 style="letter-spacing:10px;">NIGHT TIME</h2><p>Wait for the morning wake up call.</p></div>`;
            }
        } else if (d.phase === 'day_vote') {
            if (myRole === 'killer') {
                html += `<div style="padding:40px 0; text-align:center;"><h2>SABOTAGE</h2><p style="font-size:0.7rem; color:#888;">You cannot vote, but you can try to influence them.</p></div>`;
            } else {
                html += `<h3>THE VOTE</h3><p style="font-size:0.6rem; color:red;">Cast your vote for the suspect.</p>`;
                html += renderTargetList(state, (tid) => db.ref(`game/killer/votes/${myId}`).set(tid), d.votes[myId], true);
            }
        } else if (d.phase === 'day_rescuer') {
            if (myRole === 'rescuer') {
                html += `<h3>RESCUE</h3><p style="font-size:0.6rem; color:var(--safe-green);">WHO SHOULD BE SAVED FROM ATTACK?</p>`;
                html += renderTargetList(state, (tid) => db.ref('game/killer/actions/rescuer').set(tid), d.actions.rescuer, false);
            } else {
                html += `<div style="padding:40px 0; text-align:center; opacity:0.3;"><h2>WAITING</h2><p>The Rescuer is deciding whom to protect.</p></div>`;
            }
        } else if (d.phase === 'reveal') {
            const info = d.revealedInfo || {};
            const survivedNow = isAlive;
            html += `<div style="text-align:center; padding:20px; border:1px solid #333; background:rgba(255,255,255,0.05);">
                <h1 style="color:${survivedNow ? 'var(--safe-green)' : 'red'}; margin-bottom:10px; border-bottom:1px solid #222; padding-bottom:10px;">
                    ${survivedNow ? 'YOU SURVIVED' : 'YOU WERE KILLED'}
                </h1>
                <div style="text-align:left; font-size:0.7rem; color:#aaa; margin-top:15px; line-height:2;">
                    <p>• <b style="color:red;">${info.target || "NO ONE"}</b> was Targeted by Killer</p>
                    <p>• <b style="color:gold;">${info.exiled || "NO ONE"}</b> was Voted Out</p>
                    <p>• <b style="color:var(--safe-green);">${info.saved || "NO ONE"}</b> was Rescued</p>
                </div>
            </div>`;
            area.innerHTML = `<button class="btn" style="width:100%; border:1px solid ${d.ready[myId] ? '#222' : 'var(--safe-green)'}; background:${d.ready[myId] ? '#111' : '#222'}" onclick="setReady(true)">${d.ready[myId] ? 'WAITING FOR OTHERS...' : 'CONTINUE'}</button>`;
        }

        carea.innerHTML = html;
        if (d.phase !== 'reveal' && d.phase !== 'role_reveal') {
            area.innerHTML = `<p style="font-size:0.5rem; color:#444; text-align:center; margin-bottom:10px;">CURRENT PHASE: ${d.phase.toUpperCase()}</p>`;
            if (state.host) {
                area.innerHTML += `<button onclick="forceSkipPhase()" style="background:none; border:1px dashed #444; color:#444; font-size:0.5rem; width:100%; cursor:pointer;">HOST: FORCE SKIP PHASE (USE IF FREEZE)</button>`;
            }
        }
    }

    window.setReady = function (val) { database.ref(`game/killer/ready/${st.player.id}`).set(val); };
    window.setupKillerStage = function () { setupKiller(st, database); };

    function renderTargetList(state, onSelect, currentSub, excludeSelf) {
        const d = state.data;
        const myId = state.player.id;
        let list = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">`;
        state.players.forEach(p => {
            if (d.alive[p.id]) {
                if (excludeSelf && p.id === myId) return;
                const isActive = currentSub === p.id;
                list += `<button class="btn" style="padding:15px; font-size:0.7rem; border:${isActive ? '1px solid gold' : '1px solid #222'}; background:${isActive ? 'gold' : '#050505'}; color:${isActive ? '#000' : '#fff'}" onclick="handleTarget('${p.id}')">${p.name.toUpperCase()}</button>`;
            }
        });
        list += `</div>`;
        window.handleTarget = (tid) => onSelect(tid);
        return list;
    }
})();





