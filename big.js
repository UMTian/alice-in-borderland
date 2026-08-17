; (function () {
    let st;
    let database;

    window.loadBigStage = function (state, db) {
        st = state;
        database = db;

        const carea = document.getElementById('game-content');
        const area = document.getElementById('player-action-area');

        carea.innerHTML = `
            <div style="text-align:center; color:white; padding:40px 0;">
                <h1 style="color:red; letter-spacing:5px; font-size:3rem;">THE BIG GAME</h1>
                <p style="font-size:0.8rem; color:#888; margin-top:20px;">SYSTEM STATUS: OFFLINE</p>
                <div class="card" style="border:1px dashed #444; margin-top:40px; padding:40px;">
                    <span style="font-size:0.6rem; color:#444;">DEVELOPMENT IN PROGRESS</span>
                </div>
            </div>`;

        area.innerHTML = `<button class="btn" onclick="nextStage()">BACK TO MENU</button>`;
    };
})();
