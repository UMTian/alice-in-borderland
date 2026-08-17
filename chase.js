; (function () {
    let st;
    let database;
    let canvas, ctx;
    let gameLoop;
    let joystick = { active: false, x: 0, y: 0, dx: 0, dy: 0 };
    let playerPos = { x: 50, y: 90, angle: 0, powerTimer: 0 };
    let otherPlayers = {};
    let lerpPlayers = {};
    let localBullets = [];
    let obstacles = [];
    let field = { x: 0, y: 0, w: 0, h: 0 };
    let lastHandledShots = {};

    window.loadChaseStage = function (state, db) {
        st = state;
        database = db;
        localBullets = [];
        lerpPlayers = {};
        otherPlayers = {};
        lastHandledShots = {};

        stopGameLoop();
        database.ref('game/chase').off();
        database.ref('game/chase/positions').off();

        database.ref('game/chase').on('value', (snap) => {
            const data = snap.val() || {};
            st.data = {
                phase: data.phase || 'lobby',
                redLeader: data.redLeader || null,
                blueLeader: data.blueLeader || null,
                teams: data.teams || {},
                originals: data.originals || {},
                timer: data.timer || 0,
                targetTimer: data.targetTimer || 120,
                winner: data.winner || null,
                redKills: data.redKills || 0,
                blueKills: data.blueKills || 0,
                obstacles: data.obstacles || [],
                requests: data.requests || {}
            };
            obstacles = st.data.obstacles || [];
            // FIX: Removed the restrictive condition that was preventing the game from loading when phase shifted to 'playing'.
            renderChase(st, db);
        });

        db.ref('game/chase/positions').on('value', (snap) => {
            const posData = snap.val() || {};
            otherPlayers = posData;
            Object.keys(posData).forEach(id => {
                if (id === st.player.id) return;
                const p = posData[id];
                if (!lerpPlayers[id]) lerpPlayers[id] = { x: p.x, y: p.y, angle: p.angle };

                if (p.lastShot && p.lastShot !== lastHandledShots[id]) {
                    const team = st.data.teams[id];
                    if (team) {
                        spawnShotgun(p.x, p.y, p.angle, team, id);
                        lastHandledShots[id] = p.lastShot;
                    }
                }
            });
            Object.keys(lerpPlayers).forEach(id => {
                if (!posData[id] && id !== st.player.id) delete lerpPlayers[id];
            });
        });
    };

    function spawnShotgun(x, y, angle, team, owner) {
        const spread = [0, -0.22, 0.22];
        spread.forEach(offset => {
            localBullets.push({
                x, y,
                vx: Math.cos(angle + offset) * 3.8,
                vy: Math.sin(angle + offset) * 3.8,
                team, owner, life: 65
            });
        });
    }

    function initMap() {
        if (!st.host) return;
        const obs = [];
        for (let i = 0; i < 8; i++) {
            obs.push({ x: 15 + Math.random() * 70, y: 20 + Math.random() * 140, w: 5, h: 5 });
        }
        database.ref('game/chase/obstacles').set(obs);
    }

    function toggleGlobalUI(show) {
        const header = document.querySelector('header');
        const stageHeader = document.querySelector('#screen-game > div:first-child');
        if (header) header.style.display = show ? 'block' : 'none';
        if (stageHeader) stageHeader.style.display = show ? 'flex' : 'none';
    }

    function renderChase(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        if (!carea || !area) return;
        const d = state.data;
        const myId = state.player.id;
        const myTeam = d.teams[myId] || (state.host ? 'spectator' : null);

        if (d.phase === 'lobby') {
            stopGameLoop();
            toggleGlobalUI(true);
            let lobbyHtml = `
                <div style="text-align:center; color:white; padding:10px;">
                    <h2 style="color:red; letter-spacing:2px;">THE CHASE: SHOOTOUT</h2>
                    <div style="display:flex; justify-content:space-around; margin:15px 0;">
                        <div class="card" style="border-color:red; flex:1; margin-right:5px; padding:10px;">
                            <span style="font-size:0.5rem; color:red;">RED TEAM</span><br/>
                            <b style="font-size:0.7rem;">${d.redLeader ? (st.players.find(p => p.id === d.redLeader)?.name || 'UNKNOWN').toUpperCase() : 'OPEN'}</b>
                            ${!d.redLeader ? `<button class="btn btn-primary" onclick="becomeChaseLeader('red')">LEAD</button>` : ''}
                        </div>
                        <div class="card" style="border-color:cyan; flex:1; margin-left:5px; padding:10px;">
                            <span style="font-size:0.5rem; color:cyan;">BLUE TEAM</span><br/>
                            <b style="font-size:0.7rem;">${d.blueLeader ? (st.players.find(p => p.id === d.blueLeader)?.name || 'UNKNOWN').toUpperCase() : 'OPEN'}</b>
                            ${!d.blueLeader ? `<button class="btn btn-primary" onclick="becomeChaseLeader('blue')">LEAD</button>` : ''}
                        </div>
                    </div>`;

            if (d.redLeader === myId || d.blueLeader === myId) {
                lobbyHtml += `<p style="font-size:0.6rem; color:#666;">RECRUIT:</p><div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:5px;">`;
                st.players.forEach(p => { if (p.id !== myId && !d.teams[p.id]) lobbyHtml += `<button class="btn" style="padding:4px;" onclick="requestChaseMember('${p.id}')">${p.name.substring(0, 6)}</button>`; });
                lobbyHtml += `</div>`;
            } else if (myTeam && myTeam !== 'spectator') {
                lobbyHtml += `<div class="card" style="border-color:${myTeam === 'red' ? 'red' : 'cyan'};"><b style="color:white; font-size:0.7rem;">ENROLLED</b></div>`;
            } else if (myTeam !== 'spectator') {
                const f = d.requests[myId];
                if (f) lobbyHtml += `<button class="btn btn-primary" onclick="acceptChaseInvite()">JOIN SQUAD</button>`;
                else lobbyHtml += `<p style="font-size:0.6rem; color:#444;">WAITING FOR SQUAD ASSIGNMENT...</p>`;
            }

            if (state.host) {
                lobbyHtml += `<div style="margin-top:15px;"><input id="chase-time-input" type="number" class="input-field" value="${d.targetTimer}" style="padding:10px; width:60px; text-align:center;"></div>`;
                area.innerHTML = `<button class="btn btn-primary" onclick="initChaseGame()">INITIALIZE SYSTEM</button>`;
            } else {
                area.innerHTML = '';
            }
            carea.innerHTML = lobbyHtml;
            return;
        }

        if (d.phase === 'over') {
            stopGameLoop();
            toggleGlobalUI(true);
            const winColor = d.winner;
            const winnersNames = Object.keys(d.originals).filter(id => d.originals[id] === winColor).map(id => st.players.find(p => p.id === id)?.name || 'Unknown').join(', ');
            carea.innerHTML = `
                <div style="text-align:center; color:white; padding:40px 0;">
                    <h1 style="color:gold;">${winColor ? winColor.toUpperCase() + ' VICTORY' : 'DRAW'}</h1>
                    <div class="card" style="border-color:gold; margin:20px; padding:20px;">
                        <div style="display:flex; justify-content:space-around; margin-bottom:15px;">
                            <div style="color:red;">RED KILLS: ${d.redKills}</div>
                            <div style="color:cyan;">BLUE KILLS: ${d.blueKills}</div>
                        </div>
                        <span style="font-size:0.6rem; color:#666;">GOLD MEDALISTS:</span>
                        <p style="font-size:1.1rem; color:gold; font-weight:bold;">${winnersNames || 'None'}</p>
                    </div>
                    ${state.host ? `<button class="btn btn-primary" onclick="nextStage()">CONTINUE</button>` : `<p style="font-size:0.6rem; color:#666;">WAITING FOR HOST TO CONTINUE...</p>`}
                </div>`;
            area.innerHTML = ''; return;
        }

        if (!canvas) {
            toggleGlobalUI(false);
            carea.innerHTML = `
                <div id="chase-full-container" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#111; z-index:9999; overflow:hidden; touch-action:none;">
                    <canvas id="chase-canvas" style="touch-action:none;"></canvas>
                    <div style="position:absolute; top:30px; width:100%; text-align:center; pointer-events:none;">
                        <b style="color:white; font-size:1.8rem; background:rgba(0,0,0,0.8); padding:5px 30px; border-radius:20px; border:2px solid #333;" id="chase-timer-ui">${d.timer}s</b>
                    </div>
                    <div id="joystick-visual" style="position:absolute; display:none; width:90px; height:90px; background:rgba(255,255,255,0.05); border:2px solid blue; border-radius:50%; z-index:10000; pointer-events:none;">
                        <div id="joystick-knob" style="position:absolute; top:25px; left:25px; width:40px; height:40px; background:rgba(255,255,255,0.4); border-radius:50%;"></div>
                    </div>
                    ${myTeam !== 'spectator' ? `<div id="shoot-btn" style="position:absolute; bottom:160px; right:30px; width:90px; height:90px; background:rgba(255,0,0,0.3); border:4px solid red; border-radius:50%; z-index:10000; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:1.2rem; box-shadow:0 0 20px red;">FIRE</div>` : ''}
                </div>`;
            canvas = document.getElementById('chase-canvas');
            ctx = canvas.getContext('2d');
            resize();
            if (myTeam !== 'spectator') {
                playerPos.x = myTeam === 'red' ? 10 : 90;
                playerPos.y = myTeam === 'red' ? 10 : 170;
            } else { playerPos.x = 50; playerPos.y = 90; }
            startGameLoop();
            setupTouchEvents();
        } else {
            const timerEl = document.getElementById('chase-timer-ui');
            if (timerEl) timerEl.innerText = d.timer + 's';
        }
    }

    function resize() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const targetRatio = 1 / 1.8;
        let w = canvas.width, h = w / targetRatio;
        if (h > canvas.height) { h = canvas.height; w = h * targetRatio; }
        field.w = w; field.h = h;
        field.x = (canvas.width - field.w) / 2; field.y = (canvas.height - field.h) / 2;
    }
    window.addEventListener('resize', resize);

    function setupTouchEvents() {
        const container = document.getElementById('chase-full-container');
        if (!container) return;
        const start = (e) => {
            const fireBtn = document.getElementById('shoot-btn');
            if (fireBtn) {
                const r = fireBtn.getBoundingClientRect();
                for (let i = 0; i < e.touches.length; i++) {
                    const touch = e.touches[i];
                    if (touch.clientX > r.left && touch.clientX < r.right && touch.clientY > r.top && touch.clientY < r.bottom) {
                        shoot(); return;
                    }
                }
            }
            const t = e.touches ? e.touches[0] : e;
            joystick.active = true; joystick.startX = t.clientX; joystick.startY = t.clientY;
            const vis = document.getElementById('joystick-visual');
            if (vis) {
                vis.style.display = 'block'; vis.style.left = (joystick.startX - 45) + 'px'; vis.style.top = (joystick.startY - 45) + 'px';
            }
        };
        const move = (e) => {
            if (!joystick.active) return;
            const t = e.touches[0];
            const dx = t.clientX - joystick.startX, dy = t.clientY - joystick.startY;
            const dist = Math.min(45, Math.sqrt(dx * dx + dy * dy)), ang = Math.atan2(dy, dx);
            joystick.dx = Math.cos(ang) * (dist / 45); joystick.dy = Math.sin(ang) * (dist / 45);
            const knob = document.getElementById('joystick-knob');
            if (knob) knob.style.transform = `translate(${joystick.dx * 25}px, ${joystick.dy * 25}px)`;
            playerPos.angle = ang;
        };
        const stop = () => { joystick.active = false; joystick.dx = 0; joystick.dy = 0; const vis = document.getElementById('joystick-visual'); if (vis) vis.style.display = 'none'; };
        container.addEventListener('touchstart', start, { passive: false });
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', stop);
    }

    let lastShotTime = 0;
    function shoot() {
        if (Date.now() - lastShotTime < 450) return;
        const myTeam = st.data.teams[st.player.id];
        if (!myTeam || myTeam === 'spectator') return;
        const time = Date.now();
        lastShotTime = time;
        database.ref(`game/chase/positions/${st.player.id}`).update({ lastShot: time, x: playerPos.x, y: playerPos.y, angle: playerPos.angle });
        spawnShotgun(playerPos.x, playerPos.y, playerPos.angle, myTeam, st.player.id);
    }

    function startGameLoop() { if (!gameLoop) gameLoop = requestAnimationFrame(loop); }
    function stopGameLoop() { if (gameLoop) cancelAnimationFrame(gameLoop); gameLoop = null; canvas = null; }

    let lastSync = 0;
    function loop(time) {
        if (!st.data || st.data.phase !== 'playing') return;
        const myTeam = st.data.teams[st.player.id] || (st.host ? 'spectator' : null);

        if (myTeam && myTeam !== 'spectator') {
            const spd = 0.82;
            if (joystick.active) {
                const nx = playerPos.x + joystick.dx * spd, ny = playerPos.y + joystick.dy * spd;
                if (!isBlocked(nx, ny)) { playerPos.x = nx; playerPos.y = ny; }
            }
            playerPos.x = Math.max(2, Math.min(98, playerPos.x));
            playerPos.y = Math.max(2, Math.min(178, playerPos.y));
        }

        Object.keys(lerpPlayers).forEach(id => {
            const target = otherPlayers[id];
            if (!target) return;
            lerpPlayers[id].x += (target.x - lerpPlayers[id].x) * 0.28;
            lerpPlayers[id].y += (target.y - lerpPlayers[id].y) * 0.28;
            lerpPlayers[id].angle += (normalizeAngle(target.angle - lerpPlayers[id].angle)) * 0.28;
        });

        updateBullets();

        if (time - lastSync > 60) {
            if (myTeam && myTeam !== 'spectator') {
                database.ref(`game/chase/positions/${st.player.id}`).update({ x: playerPos.x, y: playerPos.y, angle: playerPos.angle });
            } else if (st.host) {
                database.ref(`game/chase/positions/host`).update({ x: 50, y: 90, angle: 0 });
            }
            lastSync = time;
        }

        draw();
        gameLoop = requestAnimationFrame(loop);
    }

    function updateBullets() {
        for (let i = localBullets.length - 1; i >= 0; i--) {
            const b = localBullets[i];
            b.x += b.vx; b.y += b.vy; b.life--;
            if (b.life <= 0 || b.x < 0 || b.x > 100 || b.y < 0 || b.y > 180 || isBlocked(b.x, b.y)) {
                localBullets.splice(i, 1); continue;
            }

            Object.keys(otherPlayers).forEach(oid => {
                if (oid === b.owner) return;
                const o = otherPlayers[oid]; const oTeam = st.data.teams[oid];
                if (oTeam && oTeam !== b.team) {
                    if (Math.sqrt((b.x - o.x) ** 2 + (b.y - o.y) ** 2) < 5) {
                        if (b.owner === st.player.id) {
                            database.ref(`game/chase/teams/${oid}`).set(b.team);
                            database.ref(`game/chase/${b.team}Kills`).once('value', sn => {
                                database.ref(`game/chase/${b.team}Kills`).set((sn.val() || 0) + 1);
                            });
                        }
                        localBullets.splice(i, 1);
                    }
                }
            });

            const myId = st.player.id;
            const myTeam = st.data.teams[myId];
            if (b.owner !== myId && myTeam && myTeam !== b.team) {
                if (Math.sqrt((b.x - playerPos.x) ** 2 + (b.y - playerPos.y) ** 2) < 5) localBullets.splice(i, 1);
            }
        }
    }

    function isBlocked(x, y) { return obstacles.some(o => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h); }
    function normalizeAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

    function draw() {
        if (!ctx || !canvas) return;
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const tX = (nx) => field.x + (nx * field.w / 100), tY = (ny) => field.y + (ny * field.h / 180);

        ctx.fillStyle = '#111'; ctx.strokeStyle = '#222';
        obstacles.forEach(o => { ctx.fillRect(tX(o.x), tY(o.y), o.w * field.w / 100, o.h * field.h / 180); ctx.strokeRect(tX(o.x), tY(o.y), o.w * field.w / 100, o.h * field.h / 180); });

        localBullets.forEach(b => {
            ctx.fillStyle = b.team === 'red' ? '#ff3b30' : '#00ffff';
            ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath(); ctx.arc(tX(b.x), tY(b.y), 4, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        });

        Object.keys(lerpPlayers).forEach(oid => {
            if (oid === 'host') return;
            const p = lerpPlayers[oid]; const t = st.data.teams[oid];
            if (t) {
                const playerObj = st.players.find(pl => pl.id === oid);
                const nameStr = playerObj ? playerObj.name : 'Unknown';
                drawPlayer(tX(p.x), tY(p.y), t, p.angle, nameStr);
            }
        });

        const myId = st.player.id;
        const myTeam = st.data.teams[myId];
        if (myTeam && myTeam !== 'spectator') drawPlayer(tX(playerPos.x), tY(playerPos.y), myTeam, playerPos.angle, st.player.name, true);
    }

    function drawPlayer(vx, vy, team, angle, name, isMe) {
        ctx.save(); ctx.translate(vx, vy); ctx.rotate(angle);
        ctx.fillStyle = team === 'red' ? '#ff3b30' : '#00ffff';
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-11, -11); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill();
        if (isMe) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = 'white'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.fillText((name || '').toUpperCase(), vx, vy - 26);
    }

    window.becomeChaseLeader = t => {
        database.ref(`game/chase/${t}Leader`).set(st.player.id);
        database.ref(`game/chase/teams/${st.player.id}`).set(t);
        database.ref(`game/chase/originals/${st.player.id}`).set(t);
    };
    window.requestChaseMember = pid => database.ref(`game/chase/requests/${pid}`).set(st.player.id);
    window.acceptChaseInvite = () => {
        const f = st.data.requests[st.player.id]; const t = (st.data.redLeader === f) ? 'red' : 'blue';
        database.ref(`game/chase/teams/${st.player.id}`).set(t);
        database.ref(`game/chase/originals/${st.player.id}`).set(t);
        database.ref(`game/chase/requests/${st.player.id}`).remove();
    };

    let timerInterval = null;
    window.initChaseGame = () => {
        if (!st.host) return;
        initMap();
        database.ref('game/chase').update({ phase: 'playing', timer: parseInt(document.getElementById('chase-time-input').value) || 120, nextSpawn: Date.now() + 60000, redKills: 0, blueKills: 0, winner: null });

        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            database.ref('game/chase').once('value', snap => {
                const d = snap.val() || {};
                if (d.phase !== 'playing') { clearInterval(timerInterval); return; }

                const tv = Object.values(d.teams || {});
                const rK = d.redKills || 0; const bK = d.blueKills || 0;

                if ((tv.length > 0 && tv.every(v => v === tv[0]) && tv.length >= st.players.filter(p => !p.host).length) || (d.timer <= 0)) {
                    database.ref('game/chase/phase').set('over');
                    const wColor = rK > bK ? 'red' : (bK > rK ? 'blue' : null);
                    database.ref('game/chase/winner').set(wColor);

                    if (wColor) {
                        const origs = d.originals || {};
                        Object.keys(origs).forEach(id => {
                            if (origs[id] === wColor) {
                                database.ref(`game/players/${id}/medals`).once('value', sn => {
                                    const m = sn.val() || { gold: 0, silver: 0, bronze: 0 };
                                    m.gold++;
                                    database.ref(`game/players/${id}/medals`).set(m);
                                });
                            }
                        });
                    }
                    clearInterval(timerInterval);
                } else {
                    database.ref('game/chase/timer').set(d.timer - 1);
                }
            });
        }, 1000);
    };
})();
