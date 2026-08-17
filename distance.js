; (function () {
    let distTimer;
    let st;
    let database;

    window.loadDistanceStage = function (state, db) {
        console.log("DISTANCE_MISSION: V4 (INPUT OVERHAUL)...");
        st = state;
        database = db;

        if (state.host) setupDistance(state, db);

        db.ref('game/distance').on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            const myId = state.player.id;
            const pData = data.players ? data.players[myId] : null;

            st.data = {
                phase: data.status,
                sequence: data.sequence || [],
                endTime: data.endTime,
                pData: pData,
                allPlayers: data.players || {},
                playerScores: data.scores || {}
            };

            if (data.status === 'won' || data.status === 'lost') clearInterval(distTimer);
            else syncDistanceTimer(data.endTime, db, state.host);

            renderDistance(st, db);
        });
    };

    function setupDistance(state, db) {
        db.ref('game/timeLimit').once('value', (tSnap) => {
            const limit = tSnap.val() || 300;
            const players = state.players;
            const seq = players.map(p => p.id).sort(() => Math.random() - 0.5);
            const playerTasks = {};
            const scores = {};

            const typePool = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
            const questionTrack = { 1: [0, 1, 2, 3, 4, 5], 2: [0, 1, 2, 3, 4, 5], 3: [0, 1, 2, 3, 4, 5], 4: [0, 1, 2, 3, 4, 5] };
            Object.keys(questionTrack).forEach(k => questionTrack[k].sort(() => Math.random() - 0.5));

            for (let i = 0; i < seq.length; i++) {
                const pid = seq[i];
                scores[pid] = 0;
                let type = (i === seq.length - 1) ? 5 : typePool[i % 4];
                const qIdx = (questionTrack[type] || [0]).pop();

                playerTasks[pid] = {
                    type: type,
                    taskData: generateTask(type, qIdx),
                    status: (i === 0) ? 'active' : 'locked',
                    solved: false,
                    skipped: false
                };
            }

            db.ref('game/distance').set({
                sequence: seq,
                status: 'playing',
                endTime: Date.now() + (limit * 1000),
                players: playerTasks,
                scores: scores
            });
        });
    }

    function generateTask(type, idx) {
        if (type === 1) {
            const puzzles = [
                { q: "E: Purple. A: !Red, !Blue. B: !Yellow, !Purple. C: !Blue, !Green. D: !Red, !Yellow.", a: { A: "Yellow", B: "Green", C: "Red", D: "Blue", E: "Purple" }, colors: ["Purple", "Red", "Blue", "Yellow", "Green"] },
                { q: "B: Pink. A: !Green, !Pink. C: !Blue, !Yellow. D: !Red, !Green. E: !Pink, !Yellow.", a: { A: "Yellow", B: "Pink", C: "Green", D: "Blue", E: "Red" }, colors: ["Pink", "Green", "Blue", "Yellow", "Red"] },
                { q: "C: Teal. A: !Red, !Black. B: !White, !Yellow. D: !Teal, !Blue. E: !Black, !Green.", a: { A: "White", B: "Red", C: "Teal", D: "Black", E: "Yellow" }, colors: ["Teal", "Red", "Black", "White", "Yellow"] }
            ];
            return puzzles[idx % puzzles.length];
        }
        if (type === 2) {
            const puzzles = [
                { q: "A -- c, e -- I, n -- t, x -- ___", a: { letter: "f", num: 4 } },
                { q: "B -- D, F -- H, J -- L, N -- ___", a: { letter: "P", num: 16 } },
                { q: "Z -- W, U -- R, P -- M, K -- ___", a: { letter: "H", num: 3 } }
            ];
            return puzzles[idx % puzzles.length];
        }
        if (type === 3) {
            const puzzles = [
                { q: "FIND GEAR I", a: { dir: "ACW", val: -5 }, nodes: [{ id: 'A', x: 50, y: 50, val: '+5', dir: 'CW', start: true }, { id: 'B', x: 100, y: 25 }, { id: 'C', x: 150, y: 25 }, { id: 'D', x: 50, y: 100 }, { id: 'E', x: 100, y: 100 }, { id: 'F', x: 150, y: 100 }, { id: 'G', x: 200, y: 100 }, { id: 'H', x: 100, y: 150 }, { id: 'I', x: 150, y: 150, target: true }], links: [['A', 'B'], ['B', 'C'], ['A', 'D'], ['D', 'E'], ['B', 'E'], ['E', 'F'], ['F', 'G'], ['E', 'H'], ['H', 'I']] },
                { q: "FIND GEAR Z", a: { dir: "CW", val: -3 }, nodes: [{ id: 'P', x: 50, y: 50, val: '-3', dir: 'ACW', start: true }, { id: 'Q', x: 100, y: 25 }, { id: 'R', x: 150, y: 25 }, { id: 'S', x: 200, y: 25 }, { id: 'T', x: 50, y: 100 }, { id: 'U', x: 100, y: 100 }, { id: 'V', x: 150, y: 100 }, { id: 'W', x: 200, y: 100 }, { id: 'X', x: 50, y: 150 }, { id: 'Y', x: 100, y: 150 }, { id: 'Z', x: 150, y: 150, target: true }], links: [['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['P', 'T'], ['T', 'U'], ['R', 'V'], ['V', 'W'], ['T', 'X'], ['X', 'Y'], ['V', 'Z']] }
            ];
            return puzzles[idx % puzzles.length];
        }
        if (type === 4) {
            const puzzles = [
                { s1: "ABCDEF", s2: "ACDF", a: "ACD" },
                { s1: "AGGTAB", s2: "GXTXAYB", a: "GTAB" },
                { s1: "ABCDGH", s2: "AEDFHR", a: "ADH" }
            ];
            return puzzles[idx % puzzles.length];
        }
        if (type === 5) {
            const nums = Array.from({ length: 25 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
            return { grid: nums };
        }
        return {};
    }

    function syncDistanceTimer(end, db, isHost) {
        clearInterval(distTimer);
        const el = document.getElementById('game-timer');
        if (!el || !end) return;
        distTimer = setInterval(() => {
            const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
            el.innerText = `LIFELINE: ${left}s`;
            if (left <= 0) {
                clearInterval(distTimer);
                if (isHost) db.ref('game/distance/status').set('lost');
            }
        }, 1000);
    }

    // --- RENDER LOGIC ---
    let pairingState = { letter: null, color: null, map: {} };
    let gearSelection = null;

    function renderDistance(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;
        const p = d.pData;

        const backBtn = `<button class="btn" style="background:#1a1a1a; margin-top:15px; width:100%; border:1px solid #333;" onclick="nextStage()">BACK TO MENU</button>`;

        if (d.phase === 'lost' || d.phase === 'won') {
            carea.innerHTML = `<h1>${d.phase === 'won' ? 'SYNCED' : 'CRITICAL ERROR'}</h1><p>${d.phase === 'won' ? 'MISSION CLEARED' : 'TIME EXPIRED'}</p>`;
            area.innerHTML = backBtn;
            return;
        }
        if (!p) return;

        const myIdx = d.sequence.indexOf(myId);
        const prevId = d.sequence[myIdx - 1];
        const nextId = d.sequence[myIdx + 1];
        const prevName = prevId ? (state.players.find(x => x.id === prevId)?.name || "ENTRY") : "START";
        const nextName = nextId ? (state.players.find(x => x.id === nextId)?.name || "FINALE") : "EXIT";

        let hud = `<div style="display:flex; justify-content:center; align-items:center; gap:8px; margin-bottom:15px; font-size:0.5rem; color:#444;">
                <div style="padding:4px 8px; background:rgba(255,255,255,0.05); border-radius:4px; ${!prevId ? 'border:1px solid gold;color:gold' : ''}">IN: ${prevName}</div>
                <div style="color:var(--safe-green);">▶</div>
                <div style="padding:4px 8px; background:rgba(255,255,255,0.15); border-radius:4px; font-weight:bold; color:#fff; border:1px solid #666;">YOU</div>
                <div style="color:var(--safe-green);">▶</div>
                <div style="padding:4px 8px; background:rgba(255,255,255,0.05); border-radius:4px;">OUT: ${nextName}</div>
            </div>`;

        if (p.skipped || p.transferred) {
            carea.innerHTML = hud + `<h2 style="color:#222; margin-top:50px; opacity:0.3;">SKIPPED</h2>`;
            area.innerHTML = backBtn;
            return;
        }

        if (p.status === 'locked') {
            carea.innerHTML = hud + `<h3 style="color:#555;">TASK LOCKED</h3><p style="margin:20px 0; font-size:0.7rem; color:#888;">Enter the <b>Master Code</b> from <b>${prevName}</b> to decrypt.</p>
                <div class="card" style="border:1px dashed #222; padding:30px;"><input type="text" id="unlock-code" class="input-field" placeholder="VERIFICATION CODE" style="text-align:center; font-size:1.4rem; letter-spacing:4px;">
                <button class="btn btn-primary" style="width:100%; margin-top:25px; padding:15px;" onclick="unlockTask()">DECRYPT DATA</button></div>`;
            area.innerHTML = backBtn;
            return;
        }

        if (p.solved) {
            let answerStr = "";
            if (p.type === 1) answerStr = Object.entries(p.taskData.a).map(([l, c]) => `${l}=${c}`).join(', ');
            else if (p.type === 2) answerStr = `${p.taskData.a.letter} (${p.taskData.a.num})`;
            else if (p.type === 3) answerStr = `${p.taskData.a.dir}, ${p.taskData.a.val}`;
            else if (p.type === 4 || p.type === 5) answerStr = p.taskData.a || "DONE";

            carea.innerHTML = hud + `<h2 style="color:var(--safe-green);">SOLVED!</h2><div class="card" style="background:rgba(0,100,0,0.1); border-color:var(--safe-green); margin-top:15px; padding:20px;">
                <p style="font-size:0.5rem; color:#bbb; margin-bottom:5px;">RELAY CODE TO <b>${nextName}</b>:</p><h1 style="letter-spacing:2px; font-size:1.2rem; color:#fff;">${answerStr.toUpperCase()}</h1></div>`;
            area.innerHTML = backBtn;
            return;
        }

        let content = hud + `<p style="font-size:0.6rem; color:gold; margin-bottom:15px;">[ TRANSMISSION CHANNEL ${myIdx + 1} ]</p>`;

        // --- TYPE 1: COLOR CLICK-PAIRING ---
        if (p.type === 1) {
            content += `<p style="font-size:0.7rem; margin-bottom:15px; font-family:monospace;">${p.taskData.q}</p>`;
            content += `<div style="display:flex; justify-content:space-between; gap:20px; align-items:flex-start;">`;
            content += `<div style="flex:1;">` + ["A", "B", "C", "D", "E"].map(l => `<button class="btn" style="width:100%; margin-bottom:5px; font-size:0.8rem; background:${pairingState.letter === l ? 'gold' : (pairingState.map[l] ? '#444' : '#222')}; color:${pairingState.letter === l ? '#000' : '#fff'}" onclick="handlePair('letter','${l}')">${l} ${pairingState.map[l] ? '➔' : ''}</button>`).join('') + `</div>`;
            content += `<div style="flex:1.5;">` + p.taskData.colors.map(c => `<button class="btn" style="width:100%; margin-bottom:5px; font-size:0.7rem; background:${pairingState.color === c ? 'gold' : '#222'}; color:${pairingState.color === c ? '#000' : '#fff'}" onclick="handlePair('color','${c}')">${c.toUpperCase()}</button>`).join('') + `</div>`;
            content += `</div>`;
        }
        // --- TYPE 2: ALPHABET + NUM BOXES ---
        else if (p.type === 2) {
            content += `<h2 style="margin:20px 0; letter-spacing:5px;">${p.taskData.q}</h2>`;
            content += `<div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                <div style="flex:1;"><p style="font-size:0.5rem; color:#666;">ALPHABET</p><input type="text" id="ans-letter" class="input-field" maxlength="1" style="text-align:center; font-size:2rem;"></div>
                <div style="flex:1.5;"><p style="font-size:0.5rem; color:#666;">SEQUENCE #</p><input type="number" id="ans-num" class="input-field" style="text-align:center; font-size:2rem;"></div>
            </div>`;
        }
        // --- TYPE 3: GEAR BUTTONS + NUM ---
        else if (p.type === 3) {
            content += renderGearSVG(p.taskData);
            content += `<div style="margin-top:20px;"><div style="display:flex; gap:10px; margin-bottom:10px;">
                <button class="btn" style="flex:1; background:${gearSelection === 'CW' ? 'var(--safe-green)' : '#222'}" onclick="gearSelection='CW'; renderDistance(st, database)">CW</button>
                <button class="btn" style="flex:1; background:${gearSelection === 'ACW' ? 'var(--primary-red)' : '#222'}" onclick="gearSelection='ACW'; renderDistance(st, database)">ACW</button>
            </div><input type="number" id="ans-gear-val" class="input-field" placeholder="FINAL VALUE" style="text-align:center; font-size:1.5rem;"></div>`;
        }
        // --- TYPE 4: LCS TEXT BOX ---
        else if (p.type === 4) {
            content += `<div style="background:#111; padding:20px; border-radius:10px; border:1px solid #333; margin-bottom:10px;"><p>S1: ${p.taskData.s1}</p><p>S2: ${p.taskData.s2}</p></div>
                <input type="text" id="ans-lcs" class="input-field" placeholder="ENTER LCS STRING" style="text-align:center; font-size:1.2rem; letter-spacing:2px;">`;
        }
        // --- TYPE 5: GRID ---
        else if (p.type === 5) {
            content += `<p style="font-size:0.6rem; color:gold; margin-bottom:10px;">SORT 1-25</p><div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:5px;">`;
            p.taskData.grid.forEach(n => content += `<div class="grid-cell" onclick="checkGrid(${n})" style="height:40px; line-height:40px; border:1px solid #333; cursor:pointer;" id="cell-${n}">${n}</div>`);
            content += `</div>`;
        }

        if (p.type !== 5) {
            content += `<button class="btn btn-primary" style="width:100%; margin-top:20px; padding:15px;" onclick="submitAnswer()">SUBMIT DATA</button>
                <button class="btn" style="width:100%; margin-top:10px; background:#400; border:1px solid #600; font-size:0.6rem; padding:10px;" onclick="skipTask()">SKIP MISSION (-10 PTS)</button>`;
        }
        carea.innerHTML = content;
        area.innerHTML = backBtn;
    }

    // --- ACTIONS ---
    window.handlePair = function (t, v) {
        if (t === 'letter') pairingState.letter = v;
        if (t === 'color') pairingState.color = v;
        if (pairingState.letter && pairingState.color) {
            pairingState.map[pairingState.letter] = pairingState.color;
            pairingState.letter = null; pairingState.color = null;
            renderDistance(st, database);
        } else { renderDistance(st, database); }
    };

    window.unlockTask = function () {
        const val = document.getElementById('unlock-code').value.trim().toUpperCase();
        const d = st.data; const myId = st.player.id;
        const idx = d.sequence.indexOf(myId); const prevId = d.sequence[idx - 1];
        const prevTask = d.allPlayers[prevId];
        // Special check: Solve was either solved OR skipped (skip also provides relay key technically in a simple way or we just allow unlock if prev skipped)
        if (prevId && database) {
            const path = `game/distance/players/${prevId}`;
            database.ref(path).once('value', s => {
                const pt = s.val();
                let verify = "";
                if (pt.type === 1) verify = Object.entries(pt.taskData.a).map(([l, c]) => `${l}=${c}`).join(', ');
                else if (pt.type === 2) verify = `${pt.taskData.a.letter} (${pt.taskData.a.num})`;
                else if (pt.type === 3) verify = `${pt.taskData.a.dir}, ${pt.taskData.a.val}`;
                else if (pt.type === 4) verify = pt.taskData.a;

                if (val === verify.toUpperCase()) database.ref(`game/distance/players/${myId}/status`).set('active');
                else alert("INCORRECT DECRYPTION KEY");
            });
        }
    };

    window.submitAnswer = function () {
        const p = st.data.pData; const myId = st.player.id; let correct = false;
        if (p.type === 1) {
            correct = Object.keys(p.taskData.a).every(l => pairingState.map[l] === p.taskData.a[l]);
        } else if (p.type === 2) {
            correct = (document.getElementById('ans-letter').value.toLowerCase() === p.taskData.a.letter.toLowerCase()) && (parseInt(document.getElementById('ans-num').value) === p.taskData.a.num);
        } else if (p.type === 3) {
            correct = (gearSelection === p.taskData.a.dir) && (parseInt(document.getElementById('ans-gear-val').value) === p.taskData.a.val);
        } else if (p.type === 4) {
            correct = document.getElementById('ans-lcs').value.trim().toUpperCase() === p.taskData.a.toUpperCase();
        }
        if (correct) {
            database.ref(`game/distance/players/${myId}/solved`).set(true);
            database.ref(`game/distance/scores/${myId}`).transaction(s => (s || 0) + 10);
        } else {
            alert("UPLOAD FAILED! (-10)");
            database.ref(`game/distance/scores/${myId}`).transaction(s => (s || 0) - 10);
        }
    };

    window.skipTask = function () {
        const myId = st.player.id; const d = st.data; const nextId = d.sequence[d.sequence.indexOf(myId) + 1];
        if (!nextId) return alert("FINAL STAGE CANNOT BE SKIPPED");
        if (confirm("SKIP THIS MISSION? -10 POINTS WILL BE DEDUCTED AUTOMATICALLY.")) {
            database.ref(`game/distance/players/${myId}/skipped`).set(true);
            database.ref(`game/distance/scores/${myId}`).transaction(s => (s || 0) - 10);
            database.ref(`game/distance/players/${nextId}/status`).set('active');
        }
    };

    let gridPtr = 1;
    window.checkGrid = function (n) {
        if (n === gridPtr) {
            document.getElementById(`cell-${n}`).style.background = "var(--safe-green)";
            gridPtr++;
            if (gridPtr > 25) {
                database.ref(`game/distance/status`).set('won');
                database.ref(`game/distance/scores/${st.player.id}`).transaction(s => (s || 0) + 10);
                awardDistanceMedals(st.data.playerScores, database);
            }
        } else { alert("SYNC ERROR: RESTART FROM 1"); gridPtr = 1; document.querySelectorAll('.grid-cell').forEach(c => c.style.background = "#222"); }
    };

    function renderGearSVG(data) {
        let svg = `<svg viewBox="0 0 250 200" style="width:100%; height:200px; background:rgba(0,0,0,0.3); border-radius:10px;">`;
        data.links.forEach(l => { const n1 = data.nodes.find(n => n.id === l[0]); const n2 = data.nodes.find(n => n.id === l[1]); svg += `<line x1="${n1.x}" y1="${n1.y}" x2="${n2.x}" y2="${n2.y}" stroke="#444" stroke-width="2" />`; });
        data.nodes.forEach(n => { const color = n.start ? 'gold' : (n.target ? 'var(--primary-red)' : '#888'); svg += `<g style="transform-origin: ${n.x}px ${n.y}px;"><circle cx="${n.x}" cy="${n.y}" r="15" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4,2" /><circle cx="${n.x}" cy="${n.y}" r="8" fill="${color}" fill-opacity="0.2" /><text x="${n.x}" y="${n.y + 4}" font-size="8" text-anchor="middle" fill="#fff" style="font-weight:bold;">${n.id}</text>${n.start ? `<text x="${n.x}" y="${n.y - 25}" font-size="6" text-anchor="middle" fill="gold">${n.val} ${n.dir}</text>` : ''}</g>`; });
        return svg + `</svg>`;
    }

    function awardDistanceMedals(scores, db) {
        const players = Object.keys(scores);
        const sorted = players.map(pid => ({ id: pid, score: scores[pid] })).sort((a, b) => b.score - a.score);
        let rank = 1;
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i].score < sorted[i - 1].score) rank = i + 1;
            let type = (rank === 1 ? 'gold' : (rank === 2 ? 'silver' : (rank === 3 ? 'bronze' : '')));
            if (type) db.ref(`game/players/${sorted[i].id}/medals/${type}`).transaction(v => (v || 0) + 1);
        }
    }
})();
