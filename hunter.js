; (function () {
    let timerInt;

    window.loadHunterStage = function (state, db) {
        console.log("HUNTER_STAGE: PHYSICAL_TAG MODE");
        state.data = { phase: 'initializing' };

        if (state.host) {
            db.ref('game/timeLimit').once('value', (tSnap) => {
                const limit = tSnap.val() || 60;
                const endTime = Date.now() + (limit * 1000);

                const players = state.players;
                const assignments = {};
                const hIdx = Math.floor(Math.random() * players.length);
                const dIdx = players.length > 1 ? (hIdx + 1) % players.length : -1;

                players.forEach((p, i) => {
                    let role = 'runner';
                    if (i === hIdx) role = 'hunter';
                    else if (i === dIdx) role = 'decoder';
                    assignments[p.id] = role;
                });

                db.ref('game/hunter').set({
                    roles: assignments,
                    status: 'revealing',
                    code: generateCipherCode(),
                    killed: {},
                    endTime: endTime
                });
            });
        }

        db.ref('game/hunter').on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            const myRole = data.roles[state.player.id] || 'spectator';
            state.data = {
                phase: data.status,
                role: myRole,
                code: data.code,
                killed: data.killed || {},
                roles: data.roles,
                status: data.status,
                endTime: data.endTime
            };

            syncTimer(data.endTime, db, state.host);
            renderHunter(state, db);
        });
    };

    function syncTimer(end, db, isHost) {
        clearInterval(timerInt);
        const el = document.getElementById('game-timer');
        if (!el) return;

        timerInt = setInterval(() => {
            const now = Date.now();
            const left = Math.max(0, Math.floor((end - now) / 1000));
            const m = Math.floor(left / 60);
            const s = left % 60;
            el.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            if (left <= 0) {
                clearInterval(timerInt);
                if (isHost) db.ref('game/hunter/status').set('everyone_lost');
            }
        }, 1000);
    }

    function generateCipherCode() {
        const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
        let solution = "";
        let puzzles = [];
        for (let i = 0; i < 6; i++) {
            const n = Math.floor(Math.random() * 10);
            const key = Math.floor(Math.random() * 5) + 1;
            solution += n;
            puzzles.push({ text: caesar(words[n], key), key: key });
        }
        return { puzzles, solution };
    }

    function caesar(s, k) {
        return s.replace(/[a-z]/gi, c => String.fromCharCode(((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) + k) % 26) + (c <= 'Z' ? 65 : 97)));
    }

    function renderHunter(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        if (!carea) return;

        const d = state.data;
        const myId = state.player.id;

        if (d.status === 'everyone_lost') {
            clearInterval(timerInt);
            carea.innerHTML = `<h1 style="color:red;">GAME OVER</h1><p>FACILITY PURGED.</p>`;
            area.innerHTML = `<button class="btn" onclick="nextStage()">EXIT</button>`;
            return;
        }

        if (d.phase === 'revealing') {
            const roleColor = (d.role === 'hunter' ? 'red' : (d.role === 'decoder' ? 'gold' : 'var(--safe-green)'));
            carea.innerHTML = `<p style="font-size:0.8rem;">IDENTITY ASSIGNED</p><h1 style="color:${roleColor}; font-size:3rem; margin-top:20px;">${d.role.toUpperCase()}</h1>`;
            area.innerHTML = `<p>Lock your phone and hide...</p>`;
            if (state.host) setTimeout(() => db.ref('game/hunter/status').set('play'), 4000);
            return;
        }

        if (d.status === 'survivors_win') {
            clearInterval(timerInt);
            carea.innerHTML = `<h1 style="color:var(--safe-green);">SURVIVORS WIN</h1><p>Hunter Neutralized.</p>`;
            area.innerHTML = `<button class="btn" onclick="nextStage()">EXIT</button>`;
            return;
        }

        if (d.status === 'hunter_wins') {
            clearInterval(timerInt);
            carea.innerHTML = `<h1 style="color:red;">HUNTER WINS</h1><p>All survivors marked.</p>`;
            area.innerHTML = `<button class="btn" onclick="nextStage()">EXIT</button>`;
            return;
        }

        // --- GAMEPLAY SCREENS ---
        if (d.role === 'hunter') {
            carea.innerHTML = `
                <h3 style="color:red;">HUNTER TERMINAL</h3>
                <div style="margin:20px 0; border:2px solid #500; padding:20px; border-radius:10px; background:rgba(255,0,0,0.05);">
                    <p style="font-size:0.6rem; color:#888; margin-bottom:10px;">DEACTIVATION CODE REQUIRED</p>
                    <input type="text" id="terminal-input" class="input-field" placeholder="6-DIGIT CODE" maxlength="6" style="text-align:center; font-size:1.5rem; letter-spacing:5px;">
                    <button class="btn btn-primary" style="margin-top:20px; width:100%;" onclick="checkTerminal()">DEACTIVE HUNTER</button>
                </div>
                <p style="font-size:0.7rem; color:#666;">HIDE YOUR PHONE. IF SURVIVORS ENTER THE CORRECT CODE HERE, YOU LOSE.</p>
            `;
            area.innerHTML = `<h4>MODE: PREDATOR</h4>`;
        }
        else {
            const isKilled = d.killed[myId];
            if (isKilled) {
                carea.innerHTML = `<h1 style="color:red; font-size:4rem;">KILLED</h1><p>Elimination Confirmed.</p>`;
                area.innerHTML = `<p>Waiting for others...</p>`;
            } else {
                let content = `<button class="btn" style="width:200px; height:200px; border-radius:50%; background:var(--primary-red); border:8px solid #500; font-weight:900; font-size:2rem; box-shadow:0 0 30px rgba(255,0,0,0.5);" onclick="selfKill()">KILLED</button>`;

                if (d.role === 'decoder') {
                    const pzs = d.code.puzzles.map((p, i) => `
                        <div style="padding:10px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center;">
                            <div>Q${i + 1}: <span style="color:#fff; font-weight:bold;">${p.text}</span></div>
                            <div style="color:gold; font-size:0.7rem;">KEY: ${p.key}</div>
                        </div>`).join('');
                    content += `<div style="margin-top:30px; background:rgba(0,0,0,0.3); border-radius:10px; overflow:hidden;">${pzs}</div>`;
                } else {
                    content += `<p style="margin-top:30px; color:#888;">Find the Decoder to get the code. Reach the Hunter's phone to enter it.</p>`;
                }

                carea.innerHTML = content;
                area.innerHTML = `<h4>ROLE: ${d.role.toUpperCase()}</h4>`;
            }
        }
    }

    window.selfKill = function () {
        const db = firebase.database();
        const myId = JSON.parse(localStorage.getItem('borderland_player')).id;
        db.ref(`game/hunter/killed/${myId}`).set(true).then(() => {
            db.ref('game/hunter').once('value', (snap) => {
                const d = snap.val();
                const totalSurvivors = Object.keys(d.roles).filter(id => d.roles[id] !== 'hunter').length;
                const killedCount = Object.keys(d.killed || {}).length;
                if (killedCount === totalSurvivors) {
                    db.ref('game/hunter/status').set('hunter_wins');
                    award('gold', Object.keys(d.roles).find(id => d.roles[id] === 'hunter'));
                }
            });
        });
    };

    window.checkTerminal = function () {
        const input = document.getElementById('terminal-input');
        if (input) checkCode(input.value);
    };

    function checkCode(code) {
        const db = firebase.database();
        db.ref('game/hunter/code/solution').once('value', (snap) => {
            if (code === snap.val()) {
                db.ref('game/hunter/status').set('survivors_win');
                db.ref('game/hunter/roles').once('value', (rSnap) => {
                    const rs = rSnap.val();
                    Object.keys(rs).forEach(pid => { if (rs[pid] !== 'hunter') award('silver', pid); });
                });
            } else { alert("ACCESS DENIED"); }
        });
    }

    function award(type, pid) {
        const db = firebase.database();
        db.ref(`game/players/${pid}/medals`).once('value', (snap) => {
            const m = snap.val() || { gold: 0, silver: 0, bronze: 0 };
            m[type]++;
            db.ref(`game/players/${pid}/medals`).set(m);
        });
    }
})();
