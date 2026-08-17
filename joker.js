; (function () {
    let st;
    let database;

    window.loadJokerStage = function (state, db) {
        st = state;
        database = db;

        database.ref('game/joker').off();
        database.ref('game/joker').on('value', (snap) => {
            const data = snap.val() || {};
            st.data = {
                phase: data.phase || 'lobby',
                eliminatedIds: data.eliminatedIds || [],
                winners: data.winners || []
            };
            renderJoker(st, db);
        });
    };

    function renderJoker(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data;
        const myId = state.player.id;

        if (d.phase === 'lobby') {
            carea.innerHTML = `
                <div style="text-align:center; color:white; padding:20px;">
                    <h1 class="glitch-text" style="color:var(--primary-red); font-size:2.5rem; margin-bottom:20px;">THE JOKER</h1>
                    <div class="card" style="border-color:var(--primary-red); background:rgba(255,0,0,0.05); padding:20px;">
                        <p style="font-size:0.8rem; line-height:1.6; color:#ccc;">
                            This is a <b style="color:red;">PHYSICAL SURVIVAL TRIAL</b>.<br/><br/>
                            Follow the rules announced by the Host. When you are eliminated, press the button on your screen immediately.
                        </p>
                    </div>
                </div>`;

            if (state.host) {
                area.innerHTML = `<button class="btn btn-primary" onclick="initJoker()">START TRIAL TRACKING</button>`;
            } else {
                area.innerHTML = `<p style="text-align:center; color:#444; font-size:0.6rem;">WAITING FOR HOST TO BEGIN...</p>`;
            }
            return;
        }

        if (d.phase === 'over') {
            const order = d.eliminatedIds || [];
            // Order is [first to die, second to die, ..., second last, winner]
            const gold = d.winners[0] || 'NONE';
            const silver = d.winners[1] || 'NONE';
            const bronze = d.winners[2] || 'NONE';

            carea.innerHTML = `
                <div style="text-align:center; color:white;">
                    <h1 style="color:gold; font-size:2rem; margin-bottom:20px;">TRIAL CONCLUDED</h1>
                    <div class="card" style="border-color:gold; padding:15px; margin-bottom:10px;">
                        <span style="color:gold; font-size:0.6rem;">GOLD MEDALIST</span><br/>
                        <b style="font-size:1.2rem;">${st.players.find(p => p.id === gold)?.name || 'NONE'}</b>
                    </div>
                    <div class="card" style="border-color:#ccc; padding:10px; margin-bottom:10px;">
                        <span style="color:#ccc; font-size:0.5rem;">SILVER</span><br/>
                        <b style="font-size:0.9rem;">${st.players.find(p => p.id === silver)?.name || 'NONE'}</b>
                    </div>
                    <div class="card" style="border-color:#cd7f32; padding:10px;">
                        <span style="color:#cd7f32; font-size:0.5rem;">BRONZE</span><br/>
                        <b style="font-size:0.9rem;">${st.players.find(p => p.id === bronze)?.name || 'NONE'}</b>
                    </div>
                    <button class="btn btn-primary" style="margin-top:20px;" onclick="nextStage()">RETURNING TO MENU</button>
                </div>`;
            area.innerHTML = '';
            return;
        }

        const isEliminated = d.eliminatedIds.includes(myId);
        if (isEliminated) {
            carea.innerHTML = `
                <div style="text-align:center; color:white; padding:50px 0;">
                    <h1 style="color:red; letter-spacing:5px;">ELIMINATED</h1>
                    <p style="font-size:0.7rem; color:#444; margin-top:10px;">WAITING FOR TRIAL END...</p>
                </div>`;
            area.innerHTML = '';
        } else {
            carea.innerHTML = `
                <div style="text-align:center; color:white; padding:40px 0;">
                    <h1 style="color:var(--safe-green); font-size:4rem; margin-bottom:10px;">ACTIVE</h1>
                    <div style="display:inline-block; border:2px solid var(--safe-green); padding:5px 20px; border-radius:20px;">
                        <span style="color:var(--safe-green); font-size:0.6rem; letter-spacing:3px;">IN GAME</span>
                    </div>
                </div>`;

            area.innerHTML = `
                <button class="btn btn-primary" 
                    style="background: #330000; border: 4px solid #ff0000; height: 120px; width: 100%; border-radius: 15px; font-size: 1.5rem; text-shadow: 0 0 10px red; box-shadow: 0 0 30px rgba(255,0,0,0.5);"
                    onclick="eliminateMe()">
                    ELIMINATION
                </button>`;
        }

        // Host monitoring
        if (state.host) {
            const aliveCount = st.players.filter(p => !d.eliminatedIds.includes(p.id)).length;
            if (aliveCount <= 1 && d.phase === 'playing') {
                // Potential auto-end
            }
        }
    }

    window.initJoker = function () {
        if (!st.host) return;
        database.ref('game/joker').set({
            phase: 'playing',
            eliminatedIds: [],
            winners: []
        });
    };

    window.eliminateMe = function () {
        const myId = st.player.id;
        const d = st.data;
        if (d.eliminatedIds.includes(myId)) return;

        database.ref('game/joker/eliminatedIds').once('value', (snap) => {
            const current = snap.val() || [];
            if (current.includes(myId)) return;
            const updated = [...current, myId];
            database.ref('game/joker/eliminatedIds').set(updated);

            // Check if only 1 person left
            const totalPlayers = st.players.filter(p => !p.host).length;
            const remaining = st.players.filter(p => !p.host && !updated.includes(p.id));

            if (remaining.length === 1) {
                const winnerId = remaining[0].id;
                const finalists = [winnerId, updated[updated.length - 1], updated[updated.length - 2] || null];
                endJokerGame(finalists);
            }
        });
    };

    function endJokerGame(finalists) {
        // finalists: [GOLD, SILVER, BRONZE]
        database.ref('game/joker').update({
            phase: 'over',
            winners: finalists.filter(id => id !== null)
        });

        // Award medals
        const medals = ['gold', 'silver', 'bronze'];
        finalists.forEach((pid, idx) => {
            if (!pid) return;
            const p = st.players.find(pl => pl.id === pid);
            if (p) {
                const m = { ...(p.medals || { gold: 0, silver: 0, bronze: 0 }) };
                m[medals[idx]]++;
                database.ref(`game/players/${pid}/medals`).set(m);
            }
        });
    }

})();
