(function () {
  'use strict';

  var PLAYERS = [
    { id: 'shark',    name: 'Shark',    avatar: 'assets/avatar-shark.png',    posClass: 'pos-shark' },
    { id: 'ash',      name: 'Ash',      avatar: 'assets/avatar-ash.png',      posClass: 'pos-ash' },
    { id: 'lamer',    name: 'Lamer',    avatar: 'assets/avatar-lamer.png',    posClass: 'pos-lamer' },
    { id: 'sega',     name: 'Sega',     avatar: 'assets/avatar-sega.png',     posClass: 'pos-sega' },
    { id: 'superfox', name: 'SuperFox', avatar: 'assets/avatar-superfox.png', posClass: 'pos-superfox' },
  ];

  var STORAGE_KEY = 'gamepair_data';
  var MAX_GAMES = 10;
  var CARD_TOP_START = 314;
  var CARD_SPACING = 205;

  var KEYS = {
    shark: 'Shark-2299',
    ash: 'Ash-7575',
    lamer: 'Lamer-3388',
    sega: 'Sega-2411',
    superfox: 'Kate-9999'
  };
  var SESSION_KEY = 'gamepair_user';
  var currentUser = null;

  var stage = document.getElementById('stage');
  var centerArea = document.getElementById('center-area');
  var state = {};

  // ---- Firebase ----

  var firebaseConfig = {
    apiKey: "AIzaSyDACjoCXC7dzdWC066sT6HNyos0CIn4stk",
    authDomain: "game-pair-c2ee6.firebaseapp.com",
    databaseURL: "https://game-pair-c2ee6-default-rtdb.firebaseio.com",
    projectId: "game-pair-c2ee6",
    storageBucket: "game-pair-c2ee6.firebasestorage.app",
    messagingSenderId: "107441826474",
    appId: "1:107441826474:web:4b4208879f2a4fd86cbed3"
  };

  firebase.initializeApp(firebaseConfig);
  var db = firebase.database();
  var gamesRef = db.ref('games');

  // ---- localStorage (fallback cache) ----

  function loadStateFromLocal() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) state = JSON.parse(saved);
    } catch (e) {}
  }

  function saveStateToLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) {}
  }

  function ensureDefaults() {
    PLAYERS.forEach(function (p) {
      if (!Array.isArray(state[p.id])) state[p.id] = [''];
      if (state[p.id].length === 0) state[p.id] = [''];
    });
  }

  // ---- Firebase sync ----

  var firebaseReady = false;
  var firebaseThrottleTimer = null;
  var pendingFirebaseData = null;
  var REMOTE_THROTTLE_MS = 3000;

  var syncSpinner = document.createElement('div');
  syncSpinner.className = 'sync-spinner';
  syncSpinner.innerHTML =
    '<div class="sync-spinner__ring"></div>' +
    '<div class="sync-spinner__label"><span>s</span><span>y</span><span>n</span><span>c</span><span>i</span><span>n</span><span>g</span></div>';
  var spinnerTimer = null;
  var SPINNER_MS = 3000;

  function showSyncSpinner() {
    clearTimeout(spinnerTimer);
    syncSpinner.classList.add('active');
    spinnerTimer = setTimeout(function () {
      syncSpinner.classList.remove('active');
      renderCenter();
    }, SPINNER_MS);
  }

  function savePlayerToFirebase(playerId) {
    showSyncSpinner();
    gamesRef.child(playerId).set(state[playerId]);
  }

  function applyFirebaseData(data, isInitial) {
    var changed = false;
    PLAYERS.forEach(function (p) {
      if (!Array.isArray(data[p.id])) return;
      if (!isInitial && p.id === currentUser) return;
      if (JSON.stringify(state[p.id]) !== JSON.stringify(data[p.id])) {
        state[p.id] = data[p.id];
        changed = true;
      }
    });

    if (!changed) return;
    ensureDefaults();
    saveStateToLocal();

    if (isInitial) {
      renderPlayers();
      renderCenter();
    } else {
      PLAYERS.forEach(function (p) {
        if (p.id === currentUser) return;
        var block = stage.querySelector('[data-player-id="' + p.id + '"]');
        if (block) renderGameList(p.id, block.querySelector('.game-list'));
      });
      repositionBlocks();
      renderCenter();
    }
  }

  function listenToFirebase() {
    gamesRef.on('value', function (snapshot) {
      var data = snapshot.val();
      if (!data) return;

      if (!firebaseReady) {
        firebaseReady = true;
        applyFirebaseData(data, true);
        return;
      }

      pendingFirebaseData = data;
      if (!firebaseThrottleTimer) {
        showSyncSpinner();
        firebaseThrottleTimer = setTimeout(function () {
          firebaseThrottleTimer = null;
          if (pendingFirebaseData) {
            applyFirebaseData(pendingFirebaseData, false);
            pendingFirebaseData = null;
          }
        }, REMOTE_THROTTLE_MS);
      }
    });
  }

  // ---- Auth ----

  function authenticate(key) {
    for (var i = 0; i < PLAYERS.length; i++) {
      if (KEYS[PLAYERS[i].id] === key) return PLAYERS[i].id;
    }
    return null;
  }

  function getLoggedInUser() {
    try { return sessionStorage.getItem(SESSION_KEY); }
    catch (e) { return null; }
  }

  function setLoggedInUser(id) {
    try { sessionStorage.setItem(SESSION_KEY, id); }
    catch (e) {}
  }

  function clearLoggedInUser() {
    try { sessionStorage.removeItem(SESSION_KEY); }
    catch (e) {}
  }

  // ---- Matching engine ----

  function normalize(name) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function findMatches() {
    var gameMap = {};

    PLAYERS.forEach(function (p) {
      var seen = {};
      state[p.id].forEach(function (game) {
        var n = normalize(game);
        if (!n) return;
        if (seen[n]) return;
        seen[n] = true;

        if (!gameMap[n]) {
          gameMap[n] = { displayName: game.trim(), players: [] };
        }
        gameMap[n].players.push(p);
      });
    });

    var matches = [];
    for (var key in gameMap) {
      if (gameMap[key].players.length >= 2) matches.push(gameMap[key]);
    }
    return matches;
  }

  // ---- Render: player blocks ----

  function renderPlayers() {
    stage.querySelectorAll('.player-block').forEach(function (el) { el.remove(); });

    PLAYERS.forEach(function (p) {
      var block = document.createElement('div');
      block.className = 'player-block ' + p.posClass;
      block.dataset.playerId = p.id;

      block.innerHTML =
        '<div class="player-avatar-row">' +
          '<img src="' + p.avatar + '" alt="' + p.name + '">' +
          '<span class="player-nickname">' + p.name + '</span>' +
        '</div>' +
        '<div class="game-list"></div>' +
        '<div class="player-actions">' +
          '<button class="btn-add" type="button">' +
            '<svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 1V13M1 7H13" stroke="#c0cede" stroke-width="1.8" stroke-linecap="round"/></svg>' +
            '<span>Add Game</span>' +
          '</button>' +
        '</div>';

      var gameList = block.querySelector('.game-list');
      renderGameList(p.id, gameList);

      block.querySelector('.btn-add').addEventListener('click', function () {
        if (state[p.id].length >= MAX_GAMES) return;
        state[p.id].push('');
        saveStateToLocal();
        savePlayerToFirebase(p.id);
        var row = createGameRow(p.id, state[p.id].length - 1, '');
        gameList.appendChild(row);
        row.querySelector('input').focus();
        repositionBlocks();
        renderCenter();
      });

      if (currentUser && p.id !== currentUser) {
        block.classList.add('player-block--readonly');
      }
      if (currentUser && p.id === currentUser) {
        block.classList.add('player-block--active');
      }

      stage.appendChild(block);
    });

    var oldLogout = stage.querySelector('.logout-btn');
    if (oldLogout) oldLogout.remove();
    if (currentUser) {
      var logoutBtn = document.createElement('button');
      logoutBtn.className = 'logout-btn';
      logoutBtn.innerHTML = '<span>Log out</span><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 14H3.333A1.333 1.333 0 0 1 2 12.667V3.333A1.333 1.333 0 0 1 3.333 2H6M10.667 11.333 14 8l-3.333-3.333M14 8H6" stroke="#c0cede" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      logoutBtn.addEventListener('click', function () {
        clearLoggedInUser();
        currentUser = null;
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('login-key').value = '';
        document.getElementById('login-error').textContent = '';
        renderPlayers();
      });
      stage.appendChild(logoutBtn);
    }

    repositionBlocks();
  }

  function renderGameList(playerId, container) {
    container.innerHTML = '';
    state[playerId].forEach(function (game, i) {
      container.appendChild(createGameRow(playerId, i, game));
    });
  }

  function createGameRow(playerId, index, value) {
    var row = document.createElement('div');
    row.className = 'game-row';

    var field = document.createElement('div');
    field.className = 'input-field';

    var input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = 'Type your game name';

    var debounceTimer;
    input.addEventListener('input', function () {
      state[playerId][index] = input.value;
      saveStateToLocal();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        savePlayerToFirebase(playerId);
      }, 400);
    });

    field.appendChild(input);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.setAttribute('aria-label', 'Remove game');
    deleteBtn.innerHTML = '<span class="bar"></span>';

    deleteBtn.addEventListener('click', function () {
      if (state[playerId].length <= 1) {
        state[playerId][0] = '';
        input.value = '';
        saveStateToLocal();
        savePlayerToFirebase(playerId);
        renderCenter();
        return;
      }
      state[playerId].splice(index, 1);
      saveStateToLocal();
      savePlayerToFirebase(playerId);
      var block = stage.querySelector('[data-player-id="' + playerId + '"]');
      renderGameList(playerId, block.querySelector('.game-list'));
      repositionBlocks();
      renderCenter();
    });

    row.appendChild(field);
    row.appendChild(deleteBtn);
    return row;
  }

  // ---- Reposition bottom blocks ----

  function repositionBlocks() {
    var GAP = 20;
    var MIN_TOP = 459;

    var sharkBlock = stage.querySelector('[data-player-id="shark"]');
    var lamerBlock = stage.querySelector('[data-player-id="lamer"]');
    var ashBlock = stage.querySelector('[data-player-id="ash"]');
    var segaBlock = stage.querySelector('[data-player-id="sega"]');
    var superfoxBlock = stage.querySelector('[data-player-id="superfox"]');

    if (!sharkBlock || !ashBlock || !lamerBlock || !segaBlock || !superfoxBlock) return;

    var ashTop = Math.max(MIN_TOP, sharkBlock.offsetTop + sharkBlock.offsetHeight + GAP);
    var segaTop = Math.max(MIN_TOP, lamerBlock.offsetTop + lamerBlock.offsetHeight + GAP);

    ashBlock.style.top = ashTop + 'px';
    segaBlock.style.top = segaTop + 'px';

    var bottomRowMax = Math.max(
      ashTop + ashBlock.offsetHeight,
      segaTop + segaBlock.offsetHeight
    );
    var superfoxTop = bottomRowMax + GAP;
    superfoxBlock.style.top = superfoxTop + 'px';

    var stageHeight = Math.max(863, superfoxTop + superfoxBlock.offsetHeight + 40);
    stage.style.height = stageHeight + 'px';
    outer.style.aspectRatio = '1440 / ' + stageHeight;
  }

  // ---- Render: center area ----

  function renderCenter() {
    var matches = findMatches();
    var hasAnyGames = PLAYERS.some(function (p) {
      return state[p.id].some(function (g) { return g.trim() !== ''; });
    });

    centerArea.innerHTML = '';

    if (!hasAnyGames) {
      centerArea.innerHTML =
        '<div class="center-empty">' +
          '<img src="assets/No games entered.png" alt="No games entered — Add some games to find matches with your friends!">' +
        '</div>';
      return;
    }

    if (matches.length === 0) {
      centerArea.innerHTML =
        '<div class="center-no-match">' +
          '<div class="glow"></div>' +
          '<img class="no-match-banner" src="assets/No matches found.png" alt="No Matches Found!">' +
          '<img class="center-swords" src="assets/swords.png" alt="">' +
        '</div>';
      return;
    }

    var html =
      '<div class="matches-wrap">' +
        '<div class="glow"></div>' +
        '<img src="assets/matches-found.png" alt="Matches Found!">' +
      '</div>';

    matches.forEach(function (match, i) {
      var avatarsHTML = match.players.map(function (p) {
        return '<div class="mini-avatar">' +
          '<img src="' + p.avatar + '" alt="' + p.name + '">' +
          '<span>' + p.name + '</span>' +
        '</div>';
      }).join('');

      html +=
        '<div class="match-card" style="top:' + (CARD_TOP_START + i * CARD_SPACING) + 'px;animation-delay:' + (i * 0.1) + 's">' +
          '<img class="card-frame" src="assets/score-frame.png" alt="">' +
          '<p class="card-title">' + escapeHTML(match.displayName) + '</p>' +
          '<div class="card-avatars">' + avatarsHTML + '</div>' +
        '</div>';
    });

    centerArea.innerHTML = html;
  }

  function escapeHTML(str) {
    var el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ---- Scaling ----

  var outer = document.querySelector('.stage-outer');

  function rescale() {
    var scale = outer.clientWidth / 1440;
    stage.style.transform = 'scale(' + scale + ')';
  }

  window.addEventListener('resize', rescale);
  window.addEventListener('orientationchange', rescale);

  // ---- Login screen ----

  var loginScreen = document.getElementById('login-screen');
  var loginKeyInput = document.getElementById('login-key');
  var loginBtn = document.getElementById('login-btn');
  var loginError = document.getElementById('login-error');

  loginBtn.addEventListener('click', function () {
    var key = loginKeyInput.value.trim();
    var userId = authenticate(key);
    if (userId) {
      currentUser = userId;
      setLoggedInUser(userId);
      loginError.textContent = '';
      loginScreen.classList.add('hidden');
      renderPlayers();
      renderCenter();
      rescale();
    } else {
      loginError.textContent = 'Invalid key. Try again.';
      loginKeyInput.focus();
    }
  });

  loginKeyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loginBtn.click();
  });

  // ---- Init ----

  loadStateFromLocal();
  ensureDefaults();

  currentUser = getLoggedInUser();
  if (currentUser) {
    loginScreen.classList.add('hidden');
  }

  renderPlayers();
  renderCenter();
  stage.appendChild(syncSpinner);
  rescale();

  listenToFirebase();
})();
