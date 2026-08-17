; (function () {
    let st;
    let database;

    window.loadMazeStage = function (state, db) {
        st = state;
        database = db;

        db.ref('game/maze').on('value', (snap) => {
            const data = snap.val() || {};
            st.data = {
                phase: data.phase || 'pairing',
                pairs: data.pairs || {},
                requests: data.requests || {},
                maze: data.maze || null,
                positions: data.positions || {},
                winner: data.winner || null
            };
            renderMaze(st, db);
        });
    };

    function generateMaze(width, height) {
        const maze = Array(height).fill().map(() => Array(width).fill(1));
        const stack = [[1, 1]];
        maze[1][1] = 0;

        while (stack.length > 0) {
            const [r, c] = stack[stack.length - 1];
            const neighbors = [];
            [[0, 2], [0, -2], [2, 0], [-2, 0]].forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                if (nr > 0 && nr < height - 1 && nc > 0 && nc < width - 1 && maze[nr][nc] === 1) {
                    neighbors.push([nr, nc, r + dr / 2, c + dc / 2]);
                }
            });

            if (neighbors.length > 0) {
                const [nr, nc, mr, mc] = neighbors[Math.floor(Math.random() * neighbors.length)];
                maze[nr][nc] = 0;
                maze[mr][mc] = 0;
                stack.push([nr, nc]);
            } else {
                stack.pop();
            }
        }
        maze[height - 2][width - 2] = 0;
        return maze;
    }

    function renderMaze(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;

        if (d.phase === 'pairing') { renderPairing(state, db); return; }

        if (d.phase === 'over') {
            const myPairId = findMyPairId(d.pairs, myId);
            const won = d.winner === myPairId;
            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <h1 style="color:${won ? 'gold' : 'red'}; font-size:3rem;">${won ? 'SURVIVED' : 'ELIMINATED'}</h1>
                    <p style="color:white;">${won ? 'TEAM ESCAPED THE LABYRINTH.' : 'THE LABYRINTH HAS CLAIMED YOU.'}</p>
                    <button class="btn btn-primary" style="margin-top:20px; color:white;" onclick="nextStage()">EXIT TO MENU</button>
                </div>`;
            area.innerHTML = ''; return;
        }

        const myPairId = findMyPairId(d.pairs, myId);
        if (!myPairId) {
            carea.innerHTML = `<h2 style="color:red;">ELIMINATED</h2><p style="color:white;">You failed to form a team in time.</p>`;
            area.innerHTML = `<button class="btn" style="color:white;" onclick="nextStage()">EXIT</button>`;
            return;
        }

        const myPair = d.pairs[myPairId];
        const myRole = (myPair.p1 === myId) ? 'watcher' : 'controller';
        const pos = d.positions[myPairId] || { r: 1, c: 1 };

        if (myRole === 'watcher') {
            let mazeHtml = `<div style="display:grid; grid-template-columns: repeat(${d.maze[0].length}, 1fr); gap:1px; width:100%; max-width:300px; margin:auto; background:#111; padding:2px; border:2px solid #333;">`;
            d.maze.forEach((row, ri) => row.forEach((v, ci) => {
                const isMe = (pos.r === ri && pos.c === ci);
                const isExit = (ri === d.maze.length - 2 && ci === d.maze[0].length - 2);
                let color = v ? '#222' : '#000';

                let content = "";
                if (isMe) { color = 'var(--safe-green)'; }
                else if (isExit) { content = "💡"; color = "rgba(255,255,0,0.1)"; }

                mazeHtml += `<div style="aspect-ratio:1; background:${color}; border-radius:${isMe ? '50%' : '0'}; display:flex; align-items:center; justify-content:center; font-size:12px;">${content}</div>`;
            }));
            mazeHtml += '</div>';

            carea.innerHTML = `
                <div style="width:100%; color:white;">
                    <p style="font-size:0.6rem; color:#888; margin-bottom:10px;">GUIDE PARTNER TO THE <span style="color:yellow">LIGHT BULB</span></p>
                    ${mazeHtml}
                    <div style="margin-top:15px; font-size:0.8rem; color:gold;">VOICE/CHAT COMMANDS ONLY!</div>
                </div>`;
            area.innerHTML = `<p style="font-size:0.5rem; color:white;">PARTNER: ${st.players.find(p => p.id === myPair.p2)?.name.toUpperCase()}</p>`;
        } else {
            carea.innerHTML = `
                <div style="padding:40px 0; color:white;">
                    <h1 style="color:var(--primary-red); letter-spacing:5px;">CONTROL</h1>
                    <p style="font-size:0.7rem; color:white;">LISTENING TO WATCHER...</p>
                    <div style="margin-top:20px; font-size:2rem; animation: pulse 2s infinite;">📻</div>
                </div>`;
            area.innerHTML = `
                <div style="display:grid; grid-template-areas: '. up .' 'left . right' '. down .'; gap:15px; width:150px; margin:auto;">
                    <button class="btn" style="grid-area:up; padding:20px; color:white;" onclick="moveMaze('up')">▲</button>
                    <button class="btn" style="grid-area:left; padding:20px; color:white;" onclick="moveMaze('left')">◀</button>
                    <button class="btn" style="grid-area:right; padding:20px; color:white;" onclick="moveMaze('right')">▶</button>
                    <button class="btn" style="grid-area:down; padding:20px; color:white;" onclick="moveMaze('down')">▼</button>
                </div>`;
        }

        if (pos.r === d.maze.length - 2 && pos.c === d.maze[0].length - 2 && !d.winner) {
            db.ref('game/maze/winner').set(myPairId);
            db.ref('game/maze/phase').set('over');
            awardMedal(myPair);
        }
    }

    function awardMedal(pair) {
        if (!st.host) return;
        [pair.p1, pair.p2].forEach(id => {
            const player = st.players.find(p => p.id === id);
            if (player) {
                const medals = player.medals || { gold: 0, silver: 0, bronze: 0 };
                medals.gold++;
                database.ref(`game/players/${id}/medals`).set(medals);
            }
        });
    }

    window.moveMaze = function (dir) {
        const d = st.data;
        const myPairId = findMyPairId(d.pairs, st.player.id);
        if (!myPairId || d.phase !== 'playing') return;

        const pos = { ...(d.positions[myPairId] || { r: 1, c: 1 }) };
        if (dir === 'up') pos.r--;
        if (dir === 'down') pos.r++;
        if (dir === 'left') pos.c--;
        if (dir === 'right') pos.c++;

        if (pos.r >= 0 && pos.r < d.maze.length && pos.c >= 0 && pos.c < d.maze[0].length && d.maze[pos.r][pos.c] === 0) {
            database.ref(`game/maze/positions/${myPairId}`).set(pos);
        }
    };

    function renderPairing(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;

        const myPairId = findMyPairId(d.pairs, myId);
        if (myPairId) {
            const p = d.pairs[myPairId];
            const partnerId = (p.p1 === myId) ? p.p2 : p.p1;
            const partnerName = state.players.find(pl => pl.id === partnerId)?.name || 'UNKNOWN';
            carea.innerHTML = `<div class="card" style="border-color:var(--safe-green); color:white;"><h3 style="color:var(--safe-green);">TEAM SECURED</h3><p style="font-size:1.2rem; margin:10px 0; color:white;">${partnerName.toUpperCase()}</p><p style="font-size:0.6rem; color:white;">Locked in.</p></div>`;
            if (state.host) {
                area.innerHTML = `<button class="btn btn-primary" style="color:white;" onclick="initMaze()">START MAZE RACE</button>`;
            } else {
                area.innerHTML = `<p style="color:white; font-size:0.7rem;">WAITING FOR START...</p>`;
            }
            return;
        }

        let html = `<h3 style="color:white;">TEAM SELECTION</h3><p style="font-size:0.6rem; color:white; opacity:0.6;">Select a partner to continue.</p><div style="margin-top:20px; display:grid; gap:10px;">`;
        state.players.forEach(p => {
            if (p.id === myId) return;
            if (findMyPairId(d.pairs, p.id)) return;

            const sentToHim = d.requests[myId] === p.id;
            html += `<button class="btn" style="background:${sentToHim ? '#222' : '#111'}; border:1px solid #333; color:white;" onclick="${sentToHim ? '' : `requestPair('${p.id}')`}">${sentToHim ? 'PENDING...' : `REQUEST: ${p.name.toUpperCase()}`}</button>`;
        });
        html += `</div>`;

        const myRequests = Object.keys(d.requests || {}).filter(rid => d.requests[rid] === myId);
        if (myRequests.length > 0) {
            html += `<div style="margin-top:20px; border-top:1px solid #222; padding-top:20px;"><h4 style="color:gold; font-size:0.7rem; letter-spacing:2px;">INBOUND REQUESTS</h4>`;
            myRequests.forEach(rid => {
                const requester = state.players.find(pl => pl.id === rid);
                if (requester) {
                    html += `<div class="card" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; color:white;">
                        <span style="color:white; font-size:0.8rem;">${requester.name.toUpperCase()}</span>
                        <button class="btn btn-primary" style="padding:10px 20px; font-size:0.6rem; background:var(--safe-green); color:black; font-weight:bold;" onclick="acceptPair('${rid}')">ACCEPT</button>
                    </div>`;
                }
            });
            html += `</div>`;
        }

        carea.innerHTML = html;
        area.innerHTML = '';
    }

    window.requestPair = function (toId) {
        if (findMyPairId(st.data.pairs, st.player.id)) return;
        database.ref(`game/maze/requests/${st.player.id}`).set(toId);
    };

    window.acceptPair = function (fromId) {
        if (findMyPairId(st.data.pairs, st.player.id)) return;

        // BUG FIX: Use stable string sorting for ID to prevent pair overwriting/leakage
        const sorted = [fromId, st.player.id].sort();
        const pairId = 'pair_' + sorted[0] + '_' + sorted[1];

        database.ref(`game/maze/pairs/${pairId}`).set({ p1: fromId, p2: st.player.id });

        database.ref(`game/maze/requests/${fromId}`).remove();
        database.ref(`game/maze/requests/${st.player.id}`).remove();
        Object.keys(st.data.requests).forEach(rid => {
            if (st.data.requests[rid] === fromId || st.data.requests[rid] === st.player.id) {
                database.ref(`game/maze/requests/${rid}`).remove();
            }
        });
    };

    window.initMaze = function () {
        if (!st.host) return;

        // FORCE PAIRING: Automatically pair any leftover players
        const unpaired = st.players.filter(p => !findMyPairId(st.data.pairs, p.id));
        unpaired.forEach((p, idx) => {
            if (idx % 2 === 0 && idx + 1 < unpaired.length) {
                const p1 = p.id;
                const p2 = unpaired[idx + 1].id;
                const sorted = [p1, p2].sort();
                const pairId = 'pair_' + sorted[0] + '_' + sorted[1];
                database.ref(`game/maze/pairs/${pairId}`).set({ p1: p1, p2: p2 });
            }
        });

        // Sync and start
        setTimeout(() => {
            const width = 17, height = 17;
            const maze = generateMaze(width, height);
            database.ref('game/maze/pairs').once('value', (snap) => {
                const currentPairs = snap.val() || st.data.pairs;
                const positions = {};
                Object.keys(currentPairs).forEach(pid => { positions[pid] = { r: 1, c: 1 }; });
                database.ref('game/maze').update({ phase: 'playing', maze: maze, positions: positions, winner: null });
            });
        }, 1000);
    };

    function findMyPairId(pairs, myId) {
        if (!pairs) return null;
        return Object.keys(pairs).find(pid => pairs[pid].p1 === myId || pairs[pid].p2 === myId);
    }
})();
