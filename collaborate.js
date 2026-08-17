; (function () {
    let collabTimer;
    let st;
    let database;

    window.loadCollaborationStage = function (state, db) {
        console.log("COLLABORATION_MISSION: V5 (COLLECTIVE SURVIVAL)...");
        st = state;
        database = db;

        if (state.host) setupCollaboration(state, db);

        db.ref('game/collaborate').on('value', (snap) => {
            const data = snap.val();
            if (!data) return;

            const myId = state.player.id;
            const pState = data.playerStates ? data.playerStates[myId] : null;
            if (!pState) return;

            st.data = {
                phase: data.status,
                totalSolved: data.totalSolved || 0,
                target: data.target || 10,
                endTime: data.endTime,
                scores: data.scores || {},
                correctCounts: data.correctCounts || {},
                questions: data.questions || [],
                results: data.results || {},
                myQueue: pState.queue || [],
                myPointer: pState.ptr || 0
            };

            if (data.status === 'playing') syncCollabTimer(data.endTime, db, state.host);
            else clearInterval(collabTimer);

            renderCollaboration(st, db);
        });
    };

    function setupCollaboration(state, db) {
        db.ref('game/timeLimit').once('value', (tSnap) => {
            const limit = tSnap.val() || 600;
            db.ref('game/collabQuestions').once('value', (qSnap) => {
                const target = parseInt(qSnap.val()) || 10;
                const fullPool = getQuestionPool();
                const shuffledPool = fullPool.sort(() => Math.random() - 0.5);
                const scores = {};
                const correctCounts = {};
                const pStates = {};
                const players = state.players;
                const perPlayer = Math.floor(shuffledPool.length / players.length);

                players.forEach((p, i) => {
                    scores[p.id] = 0;
                    correctCounts[p.id] = 0;
                    const myStart = i * perPlayer;
                    pStates[p.id] = {
                        queue: shuffledPool.slice(myStart, myStart + perPlayer),
                        ptr: 0
                    };
                });

                db.ref('game/collaborate').set({
                    status: 'playing',
                    totalSolved: 0,
                    target: target,
                    endTime: Date.now() + (limit * 1000),
                    scores: scores,
                    correctCounts: correctCounts,
                    playerStates: pStates
                });
            });
        });
    }

    function syncCollabTimer(end, db, isHost) {
        clearInterval(collabTimer);
        const el = document.getElementById('game-timer');
        if (!el || !end) return;
        collabTimer = setInterval(() => {
            const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
            el.innerText = `LIFELINE: ${left}s`;
            if (left <= 0) {
                clearInterval(collabTimer);
                if (isHost) {
                    db.ref('game/collaborate').once('value', snap => {
                        const dat = snap.val();
                        if (dat.totalSolved < dat.target) {
                            // Collective Elimination
                            const res = {};
                            Object.keys(dat.scores || {}).forEach(pid => res[pid] = { survived: false, rankScore: dat.scores[pid] });
                            db.ref('game/collaborate').update({ status: 'failed', results: res });
                        } else {
                            finishCollab(db);
                        }
                    });
                }
            }
        }, 1000);
    }

    function finishCollab(db) {
        db.ref('game/collaborate').once('value', (snap) => {
            const data = snap.val();
            if (data.status === 'finished' && data.results) return; // Already processed

            const scores = data.scores || {};
            const results = {};
            const sorted = Object.keys(scores).map(id => ({
                id: id,
                score: scores[id]
            })).sort((a, b) => b.score - a.score);

            // Collective Survival
            sorted.forEach(p => results[p.id] = { survived: true, rankScore: p.score });

            db.ref('game/collaborate').update({ status: 'finished', results: results }).then(() => awardCollabMedals(sorted, db));
        });
    }

    function awardCollabMedals(sorted, db) {
        let rank = 1;
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i].score < sorted[i - 1].score) rank = i + 1;
            let type = (rank === 1 ? 'gold' : (rank === 2 ? 'silver' : (rank === 3 ? 'bronze' : '')));
            if (type) db.ref(`game/players/${sorted[i].id}/medals/${type}`).transaction(v => (v || 0) + 1);
        }
    }

    window.submitCollabAnswer = function (choice) {
        const d = st.data; const myId = st.player.id;
        const q = d.myQueue[d.myPointer];
        if (!q || d.phase !== 'playing') return;

        const isCorrect = (choice === q.answer);

        database.ref('game/collaborate').transaction(data => {
            if (!data || data.status !== 'playing') return data;

            if (isCorrect) {
                data.scores[myId] = (data.scores[myId] || 0) + 1;
                data.correctCounts[myId] = (data.correctCounts[myId] || 0) + 1;
                data.totalSolved = (data.totalSolved || 0) + 1;
            } else {
                data.scores[myId] = (data.scores[myId] || 0) - 0.5;
            }

            data.playerStates[myId].ptr++;

            if (data.totalSolved >= data.target) data.status = 'finished';
            return data;
        }).then(res => {
            if (res.snapshot && res.snapshot.val().status === 'finished') finishCollab(database);
        });
    };

    function renderCollaboration(state, db) {
        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');
        const d = state.data; const myId = state.player.id;

        const backBtn = `<button class="btn" style="width:100%; border:1px solid #333;" onclick="nextStage()">BACK TO MAP</button>`;

        if (d.phase === 'failed') {
            carea.innerHTML = `<h1 style="color:var(--primary-red); font-size:2rem;">ELIMINATED</h1><p>THE TEAM FAILED TO HIT THE TARGET.</p><p style="color:red; font-size:0.6rem; margin-top:10px;">LASER DEPLOYED.</p>`;
            area.innerHTML = backBtn; return;
        }

        if (d.phase === 'finished') {
            const res = d.results ? d.results[myId] : { survived: true };
            const myScore = d.scores[myId] || 0;
            carea.innerHTML = `<h1>MISSION CLEAR</h1><h2 style="color:var(--safe-green);">SURVIVED</h2><p>The team hit the goal in time!</p><p style="color:gold; font-size:1.2rem; margin-top:10px;">YOUR PTS: ${myScore}</p>`;
            area.innerHTML = backBtn; return;
        }

        const q = d.myQueue[d.myPointer];
        if (!q) {
            carea.innerHTML = `<h1>MAXED OUT</h1><p>You finished your queue. Waiting for team goal...</p>`;
            return;
        }

        carea.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.5rem; color:gold; margin-bottom:10px;">
                <span>GROUP TARGET: ${d.totalSolved} / ${d.target}</span>
                <span>TEAM SYNC ACTIVE</span>
            </div>
            <div class="card" style="min-height:100px; display:flex; align-items:center; justify-content:center; padding:20px; font-size:1.1rem; line-height:1.3;">
                ${q.text}
            </div>
            <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                ${q.options.map((opt, i) => `
                    <button class="btn" style="padding:15px; font-size:0.75rem; background:#111; border:1px solid #333; text-align:left; color:#fff;" onclick="submitCollabAnswer('${opt}')">
                        <span style="color:gold;">${String.fromCharCode(65 + i)})</span> ${opt}
                    </button>
                `).join('')}
            </div>
        `;

        area.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%; font-size:0.6rem; color:#666; margin-bottom:10px;">
                <span>INDIV SOLVED: ${d.correctCounts[myId] || 0}</span>
                <span>MY PTS: <b>${d.scores[myId] || 0}</b></span>
            </div>
        `;
    }

    function getQuestionPool() {
        const raw = [
            { q: "Gun is to soldier as needle is to ___.", o: ["Doctor", "Tailor", "Engineer", "Farmer"], a: "Tailor" },
            { q: "What is 10% of 90?", o: ["19", "1", "9", "90"], a: "9" },
            { q: "If yesterday was Friday, what day will it be tomorrow?", o: ["Saturday", "Sunday", "Monday", "Thursday"], a: "Sunday" },
            { q: "Find the odd one out: Cow, Goat, Horse, Lion.", o: ["Cow", "Goat", "Horse", "Lion"], a: "Lion" },
            { q: "If MAN is coded as NBO, then how is BOY coded?", o: ["CPZ", "AQX", "AMN", "DOZ"], a: "CPZ" },
            { q: "Car is to road as train is to ___.", o: ["Air", "Track", "Water", "Station"], a: "Track" },
            { q: "What comes next in the series: 5, 10, 15, 20, ___?", o: ["21", "30", "25", "35"], a: "25" },
            { q: "My mother is your mother's sister. What is my relationship to you?", o: ["Brother", "Cousin", "Uncle", "Nephew"], a: "Cousin" },
            { q: "Milk is to white as sky is to ___.", o: ["Blue", "Black", "Green", "Yellow"], a: "Blue" },
            { q: "If the 3rd day of a month is Friday, what day will the 5th day be?", o: ["Saturday", "Sunday", "Monday", "Thursday"], a: "Sunday" },
            { q: "Find the odd one out: Cricket, Football, Hockey, Chess.", o: ["Cricket", "Football", "Hockey", "Chess"], a: "Chess" },
            { q: "Parent is to child as tree is to ___.", o: ["Leaf", "Sapling", "Branch", "Root"], a: "Sapling" },
            { q: "A car travels 60 km in 1 hour. How far does it go in 30 minutes?", o: ["15 km", "20 km", "30 km", "45 km"], a: "30 km" },
            { q: "What comes next in the alphabet series: A, C, E, G, ___?", o: ["H", "I", "J", "K"], a: "I" },
            { q: "Page is to book as brick is to ___.", o: ["Wall", "Cement", "House", "Roof"], a: "Wall" },
            { q: "Out of 100 students, 10 are absent. What is the percentage of present students?", o: ["10%", "80%", "90%", "100%"], a: "90%" },
            { q: "Shoe is to foot as ring is to ___.", o: ["Hand", "Finger", "Arm", "Toe"], a: "Finger" },
            { q: "If 1st January is Monday, what day is 2nd January?", o: ["Sunday", "Tuesday", "Wednesday", "Saturday"], a: "Tuesday" },
            { q: "Find the odd one out: Apple, Mango, Potato, Orange.", o: ["Apple", "Mango", "Potato", "Orange"], a: "Potato" },
            { q: "Hot is to summer as cold is to ___.", o: ["Spring", "Autumn", "Winter", "Weather"], a: "Winter" },
            { q: "Ink is to pen as blood is to ___.", o: ["Bone", "Vein", "Heart", "Skin"], a: "Vein" },
            { q: "What is 20% of 60?", o: ["6", "12", "20", "15"], a: "12" },
            { q: "If the 4th day of a month is Sunday, what day will the 11th day be?", o: ["Monday", "Saturday", "Sunday", "Tuesday"], a: "Sunday" },
            { q: "Find the odd one out: Islamabad, Lahore, Kabul, Karachi.", o: ["Islamabad", "Lahore", "Kabul", "Karachi"], a: "Kabul" },
            { q: "If CAT is coded as DBU, then how is DOG coded?", o: ["EPH", "COF", "ENH", "FPH"], a: "EPH" },
            { q: "Ice is to cold as fire is to ___.", o: ["Smoke", "Hot", "Wood", "Ash"], a: "Hot" },
            { q: "What comes next in the series: 3, 6, 12, 24, ___?", o: ["30", "36", "48", "50"], a: "48" },
            { q: "I have no brother or sister, but that man's father is my father's son.", o: ["His own", "His son's", "His father's", "His nephew's"], a: "His son's" },
            { q: "Light is to eye as sound is to ___.", o: ["Ear", "Nose", "Tongue", "Voice"], a: "Ear" },
            { q: "If day before yesterday was Wednesday, what day will it be tomorrow?", o: ["Friday", "Saturday", "Sunday", "Thursday"], a: "Saturday" },
            { q: "Find the odd one out: Kilometer, Meter, Gram, Centimeter.", o: ["Kilometer", "Meter", "Gram", "Centimeter"], a: "Gram" },
            { q: "Cobbler is to leather as carpenter is to ___.", o: ["Iron", "Wood", "Brick", "Gold"], a: "Wood" },
            { q: "A runner covers 10 km in 30 minutes. What is his speed per hour?", o: ["15 km/h", "20 km/h", "30 km/h", "40 km/h"], a: "20 km/h" },
            { q: "What comes next in the alphabet series: Z, X, V, T, ___?", o: ["S", "R", "Q", "P"], a: "R" },
            { q: "Chapter is to book as room is to ___.", o: ["House", "Wall", "Rent", "Door"], a: "House" },
            { q: "A class has 50 students. If 40 passed, what is the % failed?", o: ["10%", "20%", "25%", "80%"], a: "20%" },
            { q: "Glove is to hand as sock is to ___.", o: ["Leg", "Foot", "Finger", "Shoe"], a: "Foot" },
            { q: "If 10 men build a wall in 4 days, how many days for 20 men?", o: ["8 days", "4 days", "2 days", "1 day"], a: "2 days" },
            { q: "Find the odd one out: Mars, Earth, Moon, Jupiter.", o: ["Mars", "Earth", "Moon", "Jupiter"], a: "Moon" },
            { q: "Water is to liquid as ice is to ___.", o: ["Gas", "Solid", "Vapor", "Cold"], a: "Solid" },
            { q: "Gun is to soldier as pen is to ___.", o: ["Reader", "Writer", "Publisher", "Book"], a: "Writer" },
            { q: "What is 50% of 80?", o: ["20", "30", "40", "50"], a: "40" },
            { q: "If the 2nd day of a month is Friday, what day will the 9th day be?", o: ["Friday", "Saturday", "Thursday", "Sunday"], a: "Friday" },
            { q: "Find the odd one out: Pakistan, India, China, Paris.", o: ["Pakistan", "India", "China", "Paris"], a: "Paris" },
            { q: "If KIT is coded as LJU, then how is MAP coded?", o: ["NZQ", "NBQ", "OCQ", "NAQ"], a: "NBQ" },
            { q: "Tree is to leaf as flower is to ___.", o: ["Root", "Petal", "Stem", "Thorn"], a: "Petal" },
            { q: "What comes next in the series: 10, 20, 40, 80, ___?", o: ["100", "120", "150", "160"], a: "160" },
            { q: "Look at this series: 2, 4, 7, 11, ___?", o: ["13", "14", "15", "16"], a: "16" },
            { q: "Heavy is to light as rough is to ___.", o: ["Hard", "Smooth", "Soft", "Tough"], a: "Smooth" },
            { q: "If day after tomorrow is Sunday, what day was yesterday?", o: ["Wednesday", "Thursday", "Friday", "Saturday"], a: "Thursday" },
            { q: "Find the odd one out: Circle, Square, Sphere, Triangle.", o: ["Circle", "Square", "Sphere", "Triangle"], a: "Sphere" },
            { q: "Fish is to water as bird is to ___.", o: ["Nest", "Sky", "Tree", "Cage"], a: "Sky" },
            { q: "A train travels 120 km in 2 hours. What is its speed?", o: ["40 km/h", "50 km/h", "60 km/h", "80 km/h"], a: "60 km/h" },
            { q: "What comes next in alphabet: B, D, F, H, ___?", o: ["I", "J", "K", "L"], a: "J" },
            { q: "Wheel is to bicycle as tire is to ___.", o: ["Driver", "Car", "Road", "Engine"], a: "Car" },
            { q: "A team played 20 matches and won 15. What is the % won?", o: ["60%", "70%", "75%", "80%"], a: "75%" },
            { q: "Finger is to hand as petal is to ___.", o: ["Tree", "Flower", "Fruit", "Leaf"], a: "Flower" },
            { q: "If 5 workers pack a box in 10 mins, how many for 10 workers?", o: ["20 mins", "10 mins", "5 mins", "2 mins"], a: "5 mins" },
            { q: "Find the odd one out: Laptop, Desktop, Smartphone, TV.", o: ["Laptop", "Desktop", "Smartphone", "Television"], a: "Television" },
            { q: "Day is to bright as night is to ___.", o: ["Cold", "Dark", "Stars", "Quiet"], a: "Dark" },
            { q: "Gun is to soldier as chisel is to ___.", o: ["Doctor", "Sculptor", "Pilot", "Tailor"], a: "Sculptor" },
            { q: "What is 25% of 80?", o: ["10", "20", "30", "40"], a: "20" },
            { q: "If 5th day is Tuesday, what is 26th day?", o: ["Tuesday", "Wednesday", "Monday", "Thursday"], a: "Tuesday" },
            { q: "Find the odd one out: Islamabad, Tehran, Beijing, Lahore.", o: ["Islamabad", "Tehran", "Beijing", "Lahore"], a: "Lahore" },
            { q: "If MANGO coded NZOHP, how is APPLE coded?", o: ["BQQMF", "BPPMF", "BQQNF", "ZKKOV"], a: "BQQMF" },
            { q: "Light is to lamp as heat is to ___.", o: ["Ice", "Heater", "Fan", "Window"], a: "Heater" },
            { q: "What comes next in series: 3, 5, 9, 17, ___?", o: ["25", "30", "33", "35"], a: "33" },
            { q: "Son of the daughter of the father of my uncle. Who?", o: ["Brother", "Nephew", "Uncle", "Son"], a: "Brother" },
            { q: "Sound is to ear as odor is to ___.", o: ["Eye", "Nose", "Tongue", "Hand"], a: "Nose" },
            { q: "If day before yesterday was Saturday, what is day after tomorrow?", o: ["Tuesday", "Wednesday", "Thursday", "Friday"], a: "Wednesday" },
            { q: "Find the odd one out: Hockey, Cricket, Football, Badminton.", o: ["Hockey", "Cricket", "Football", "Badminton"], a: "Badminton" },
            { q: "Mason is to wall as writer is to ___.", o: ["Book", "Pen", "Ink", "Paper"], a: "Book" },
            { q: "Plane flies 800 km / 2h. How far in 15 mins?", o: ["50 km", "100 km", "150 km", "200 km"], a: "100 km" },
            { q: "What comes next: A, Z, B, Y, C, ___?", o: ["X", "W", "D", "V"], a: "X" },
            { q: "Steering wheel is to car as rudder is to ___.", o: ["Airplane", "Bicycle", "Ship", "Train"], a: "Ship" },
            { q: "Out of 60 soldiers, 45 passed. What is the % failed?", o: ["15%", "20%", "25%", "30%"], a: "25%" },
            { q: "Helmet is to head as shield is to ___.", o: ["Body", "Hand", "Foot", "Face"], a: "Body" },
            { q: "6 machines do a batch in 8h. How many for 12 machines?", o: ["16h", "8h", "4h", "2h"], a: "4h" },
            { q: "Find the odd one out: Copper, Iron, Silver, Wood.", o: ["Copper", "Iron", "Silver", "Wood"], a: "Wood" },
            { q: "Ocean is to water as desert is to ___.", o: ["Cactus", "Sand", "Oasis", "Camel"], a: "Sand" }
        ];
        return raw.map(item => ({ text: item.q, options: item.o, answer: item.a }));
    }
})();
