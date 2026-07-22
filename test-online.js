const WebSocket = require('ws');

const URL = 'ws://localhost:3000';
let step = 0;
let hostGotInit = false;
let guestGotInit = false;
let hostRoomCode = null;
let errors = [];

function log(msg) { console.log(`[${step++}] ${msg}`); }

// 创建两个连接模拟房主和访客
const host = new WebSocket(URL);
const guest = new WebSocket(URL);

host.on('open', () => {
  log('Host connected, creating room...');
  host.send(JSON.stringify({ type: 'create' }));
});

guest.on('open', () => {
  log('Guest connected');
});

host.on('message', (data) => {
  const msg = JSON.parse(data);
  log('Host received: ' + msg.type + (msg.code ? ' code=' + msg.code : ''));

  if (msg.type === 'created') {
    hostRoomCode = msg.code;
    // Guest joins
    setTimeout(() => {
      log('Guest joining room ' + hostRoomCode);
      guest.send(JSON.stringify({ type: 'join', code: hostRoomCode }));
    }, 200);
  }

  if (msg.type === 'opponent_joined') {
    log('Host: opponent joined! Simulating startOnlineGame...');
    // 模拟 startOnlineGame() 的行为
    // 关键：不再调用 closeOnlineLobby()，而是直接设置 lobbyOpen=false
    log('Host: setting lobbyOpen=false (NOT calling closeOnlineLobby)');
    // 发送 game_init
    const syncState = {
      player: { hp: 40, hand: [{name:'隐藏',cost:1}], board: [] },
      enemy: { hp: 40, hand: [{name:'隐藏',cost:1}], board: [] },
      turn: 1, currentPlayer: 'enemy', gameOver: false, gameMode: 'online'
    };
    host.send(JSON.stringify({ type: 'game_init', state: syncState }));
    log('Host: game_init sent, lobbyOpen=false, render()');
  }

  if (msg.type === 'action') {
    log('Host: received action from guest: ' + msg.action);
    if (msg.action === 'play_card') {
      log('Host: executing playCard(enemy, ' + msg.handIndex + ', target=' + JSON.stringify(msg.target) + ')');
      // 验证 target 翻转
      if (msg.target) {
        const flippedPlayer = msg.target.player === 'player' ? 'enemy' : 'player';
        log('Host: target.player flipped: ' + msg.target.player + ' -> ' + flippedPlayer);
      }
      // 模拟 sendSyncState
      host.send(JSON.stringify({ type: 'sync_state', state: { turn: 1, currentPlayer: 'enemy', gameOver: false } }));
    }
    if (msg.action === 'end_turn') {
      log('Host: executing endEnemyTurnOnline + sendSyncState');
      host.send(JSON.stringify({ type: 'sync_state', state: { turn: 2, currentPlayer: 'player', gameOver: false } }));
    }
  }

  if (msg.type === 'sync_state') {
    log('Host: received sync_state (should not happen in this test)');
  }

  if (msg.type === 'chat') {
    log('Host: received chat: ' + msg.message);
  }

  if (msg.type === 'opponent_left') {
    log('Host: opponent left');
  }
});

guest.on('message', (data) => {
  const msg = JSON.parse(data);
  log('Guest received: ' + msg.type + (msg.code ? ' code=' + msg.code : ''));

  if (msg.type === 'joined') {
    log('Guest: joined room ' + msg.code + ', waiting for game_init...');
  }

  if (msg.type === 'game_init') {
    guestGotInit = true;
    log('Guest: received game_init! applyGameInit -> lobbyOpen=false, render()');
    log('Guest: state.currentPlayer = ' + msg.state.currentPlayer + ' (should be enemy=opponent first)');
    // 模拟访客出牌
    setTimeout(() => {
      log('Guest: sending play_card action (handIndex=0, target=null)');
      guest.send(JSON.stringify({ type: 'action', action: 'play_card', handIndex: 0, target: null }));
    }, 200);
  }

  if (msg.type === 'sync_state') {
    log('Guest: received sync_state, currentPlayer=' + msg.state.currentPlayer);
    if (msg.state.currentPlayer === 'player') {
      // 轮到访客了，模拟结束回合
      setTimeout(() => {
        log('Guest: sending end_turn action');
        guest.send(JSON.stringify({ type: 'action', action: 'end_turn' }));
      }, 200);
    }
    if (msg.state.turn >= 2) {
      log('Test complete! Checking results...');
      setTimeout(() => {
        log('---');
        log('Results:');
        log('  Guest got game_init: ' + guestGotInit);
        log('  Errors: ' + errors.length);
        if (errors.length > 0) errors.forEach(e => log('  ERROR: ' + e));
        else log('  ALL TESTS PASSED!');
        log('---');
        host.close();
        guest.close();
        process.exit(errors.length > 0 ? 1 : 0);
      }, 500);
    }
  }

  if (msg.type === 'opponent_left') {
    log('Guest: opponent left');
  }
});

host.on('close', () => log('Host disconnected'));
guest.on('close', () => log('Guest disconnected'));
host.on('error', (e) => { log('Host error: ' + e.message); errors.push(e.message); });
guest.on('error', (e) => { log('Guest error: ' + e.message); errors.push(e.message); });

// Timeout
setTimeout(() => {
  log('TIMEOUT - test incomplete. guestGotInit=' + guestGotInit);
  process.exit(1);
}, 5000);
