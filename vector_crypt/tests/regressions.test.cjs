// Run with: node --test vector_crypt/tests/regressions.test.cjs
// Uses the actual inline game code with a no-network Phaser/DOM test double.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadGame(random = () => 0.5) {
  const html = fs.readFileSync(process.env.BLOOD_CRYPT_HTML || path.join(__dirname, '../index.html'), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const objects = [];
  const listeners = new Map();
  function displayObject() {
    const object = new Proxy({ destroyed: false, destroyCount: 0 }, {
      get(target, name) {
        if (name in target) return target[name];
        if (name === 'destroy') return () => { target.destroyed = true; target.destroyCount++; };
        if (name === 'setPosition') return (x, y) => { target.x = x; target.y = y; return object; };
        return () => object;
      }
    });
    objects.push(object);
    return object;
  }
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        textContent: '', style: {}, classList: { add() {}, remove() {} },
        querySelector: () => null, appendChild() {}, getContext: () => ({ fillRect() {} })
      });
      return elements.get(id);
    },
    createElement: () => ({ style: {} })
  };
  const math = Object.create(Math);
  math.random = random;
  const context = vm.createContext({
    Math: math, document,
    window: { innerWidth: 1280, innerHeight: 720, addEventListener(name, fn) { listeners.set(name, fn); } },
    Phaser: {
      Scene: class {}, Game: class {}, AUTO: 0, Scale: { RESIZE: 0, CENTER_BOTH: 0 },
      Math: {
        Between: (min, max) => Math.floor(random() * (max - min + 1)) + min,
        Distance: { Between: (x, y, a, b) => Math.hypot(x - a, y - b) },
        RadToDeg: value => value * 180 / Math.PI
      },
      Input: { Keyboard: { JustDown(key) { const down = key.justDown; key.justDown = false; return !!down; } } }
    }
  });
  vm.runInContext(script + '\nthis.subject = { GameScene, get state() { return gameState; } };', context);
  const subject = context.subject;
  const scene = new subject.GameScene();
  scene.setupState();
  scene.add = new Proxy({}, { get: (_, name) => name === 'group' ? () => ({
    children: [],
    add(object) { this.children.push(object); },
    destroy(destroyChildren) { if (destroyChildren) this.children.forEach(child => child.destroy()); }
  }) : displayObject });
  scene.time = { delayedCall() {} };
  const tweenTargets = new Set();
  scene.tweens = {
    add({ targets }) { tweenTargets.add(targets); },
    killTweensOf(target) { tweenTargets.delete(target); }
  };
  scene.cameras = { main: {
    width: 1280, height: 720, scrollX: 0, scrollY: 0,
    flash() {}, setBounds() {}, startFollow() {}, setBackgroundColor() {}
  } };
  scene.player = {
    x: 100, y: 100, hp: 100, maxHp: 100,
    attackCd: 0, fireballCd: 0, healCd: 0,
    facing: { x: 1, y: 0 }, frame: 0, animTime: 0,
    sprite: displayObject()
  };
  scene.playerLight = displayObject();
  scene.fireEmitter = displayObject();
  scene.bloodEmitter = displayObject();
  scene.healEmitter = displayObject();
  scene.keys = Object.fromEntries(['w', 'a', 's', 'd', 'space', 'q', 'e', 'p', 'r'].map(key => [key, { isDown: false }]));
  scene.cursors = Object.fromEntries(['up', 'down', 'left', 'right'].map(key => [key, { isDown: false }]));
  scene.map = Array.from({ length: 30 }, () => Array(40).fill(scene.CELL_FLOOR));
  scene.input = {
    on() {},
    keyboard: {
      on() {},
      createCursorKeys: () => scene.cursors,
      addKey: name => scene.keys[name.toLowerCase()]
    }
  };
  scene.setupInputs();
  return { scene, subject, objects, elements, listeners, displayObject, tweenTargets };
}

function enemyAt(scene, x, y, { hp = 40, boss = false, dmg = 14 } = {}) {
  scene.createEnemy(x, y, boss);
  const enemy = scene.enemies.at(-1);
  enemy.hp = hp;
  enemy.dmg = dmg;
  return enemy;
}

function projectileAt(scene, x, y) {
  scene.useFireball();
  const projectile = scene.projectiles.at(-1);
  Object.assign(projectile, { x, y, vx: 0, vy: 0 });
  return projectile;
}

test('a lethal enemy hit ends the frame before a pending boss hit or potion pickup', () => {
  const { scene, subject } = loadGame();
  scene.player.hp = 25;
  const boss = enemyAt(scene, 125, 100, { boss: true, hp: 40, dmg: 28 });
  const projectile = projectileAt(scene, 125, 100);
  scene.createPickup(100, 100, 'hp', 30);
  scene.update(0, 16);
  assert.equal(subject.state.gameOver, true);
  assert.equal(subject.state.victory, false);
  assert.equal(subject.state.status, 'YOU HAVE DIED');
  assert.equal(scene.player.hp, 0);
  assert.equal(boss.hp, 40);
  assert.equal(projectile.ttl, 2000);
  assert.equal(scene.pickups.length, 1);
  assert.equal(subject.state.kills, 0);
  assert.equal(subject.state.gold, 0);
});

test('melee victory ends the frame before another enemy can kill the player', () => {
  const { scene, subject } = loadGame();
  scene.player.hp = 10;
  enemyAt(scene, 125, 100, { boss: true, hp: 20 });
  enemyAt(scene, 75, 100, { dmg: 14 });
  scene.keys.space.isDown = true;
  scene.update(0, 16);
  assert.equal(subject.state.victory, true);
  assert.equal(subject.state.status, 'VICTORY');
  assert.equal(scene.player.hp, 10);
  assert.equal(subject.state.kills, 1);
});

test('later enemies stop attacking after the first lethal hit', () => {
  const { scene } = loadGame();
  scene.player.hp = 10;
  enemyAt(scene, 125, 100);
  const laterEnemy = enemyAt(scene, 125, 100);
  scene.updateEnemies(16);
  assert.equal(scene.player.hp, 0);
  assert.equal(laterEnemy.attackCd, 0);
});

test('direct combat, healing, pickups and stairs cannot change a defeated run', () => {
  const { scene, subject } = loadGame();
  const boss = enemyAt(scene, 125, 100, { boss: true, hp: 300 });
  scene.createPickup(100, 100, 'hp', 30);
  scene.stairsPos = { x: 100, y: 100 };
  scene.damagePlayer(100);
  scene.useHeal();
  scene.useFireball();
  scene.playerMeleeAttack();
  scene.damageEnemy(boss, 1000);
  scene.updatePickups();
  scene.checkStairs();
  assert.equal(scene.player.hp, 0);
  assert.equal(scene.player.healCd, 0);
  assert.equal(scene.projectiles.length, 0);
  assert.equal(boss.hp, 300);
  assert.equal(scene.pickups.length, 1);
  assert.equal(subject.state.floor, 1);
  assert.equal(subject.state.victory, false);
});

test('a second projectile cannot add kills after the boss ends the run', () => {
  const { scene, subject } = loadGame();
  enemyAt(scene, 200, 100, { boss: true, hp: 40 });
  const otherEnemy = enemyAt(scene, 300, 100);
  projectileAt(scene, 200, 100);
  scene.player.fireballCd = 0;
  projectileAt(scene, 300, 100);
  scene.updateProjectiles(16);
  assert.equal(subject.state.victory, true);
  assert.equal(subject.state.kills, 1);
  assert.equal(otherEnemy.hp, 40);
});

test('potions remain at full health, heal a living player, and gold still collects', () => {
  const { scene, subject } = loadGame();
  scene.createPickup(100, 100, 'hp', 30);
  scene.createPickup(100, 100, 'gold', 15);
  scene.updatePickups();
  assert.equal(scene.pickups.length, 1);
  assert.equal(subject.state.gold, 15);
  scene.player.hp = 90;
  scene.updatePickups();
  assert.equal(scene.player.hp, 100);
  assert.equal(scene.pickups.length, 0);
});

test('melee follows the visible forward slash and respects range', () => {
  const { scene } = loadGame();
  const front = enemyAt(scene, 150, 100);
  const rear = enemyAt(scene, 50, 100);
  const side = enemyAt(scene, 100, 150);
  const distant = enemyAt(scene, 161, 100);
  const upperEdge = enemyAt(scene, 130, 70);
  const lowerEdge = enemyAt(scene, 130, 130);
  scene.playerMeleeAttack();
  assert.equal(front.hp, 20);
  assert.equal(rear.hp, 40);
  assert.equal(side.hp, 40);
  assert.equal(distant.hp, 40);
  assert.equal(upperEdge.hp, 20);
  assert.equal(lowerEdge.hp, 20);
});

test('pathological room rolls still give distinct connected spawn and exit rooms', () => {
  // Every candidate repeats the first room, exhausting the bounded random attempts.
  const { scene } = loadGame(() => 0);
  for (let floor = 1; floor <= 3; floor++) {
    scene.generateFloor(floor);
    scene.setupPlayer();
    assert.ok(scene.rooms.length >= 2);
    assert.ok(Math.hypot(scene.player.x - scene.stairsPos.x, scene.player.y - scene.stairsPos.y) >= 30);
    const start = [Math.floor(scene.player.x / 48), Math.floor(scene.player.y / 48)];
    const queue = [start];
    const seen = new Set([start.join(',')]);
    for (const [x, y] of queue) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
        if (scene.map[ny]?.[nx] > 0 && !seen.has(key)) { seen.add(key); queue.push([nx, ny]); }
      }
    }
    assert.ok(seen.has(`${Math.floor(scene.stairsPos.x / 48)},${Math.floor(scene.stairsPos.y / 48)}`));
    assert.equal(scene.enemies.filter(enemy => enemy.isBoss).length, floor === 3 ? 1 : 0);
  }
});

test('normal movement, fireball and heal retain their original tuning', () => {
  const { scene } = loadGame();
  scene.keys.d.isDown = true;
  scene.player.hp = 20;
  scene.keys.q.justDown = true;
  scene.keys.e.justDown = true;
  scene.updatePlayer(100);
  assert.equal(scene.player.x, 116);
  assert.equal(scene.player.hp, 65);
  assert.equal(scene.player.healCd, 12000);
  assert.equal(scene.projectiles[0].vx, 320);
  assert.equal(scene.projectiles[0].dmg, 45);
});

test('a completed run stays frozen on subsequent frames', () => {
  const { scene, subject } = loadGame();
  scene.damagePlayer(100);
  const state = JSON.stringify(subject.state);
  scene.keys.e.justDown = true;
  scene.keys.q.justDown = true;
  scene.keys.d.isDown = true;
  scene.update(16, 1000);
  assert.equal(JSON.stringify(subject.state), state);
  assert.equal(scene.player.x, 100);
  assert.equal(scene.player.hp, 0);
});


test('pause toggles once, freezes gameplay, and hides its overlay on resume', () => {
  const { scene, subject, listeners } = loadGame();
  scene.keys.d.isDown = true;
  listeners.get('keydown')?.({ code: 'KeyP', repeat: false });
  scene.keys.p.justDown = true;
  scene.update(0, 100);
  assert.equal(subject.state.paused, true);
  assert.equal(scene.player.x, 100);
  const overlay = scene.overlayBg;
  assert.equal(overlay.destroyed, false);
  scene.update(100, 100);
  assert.equal(subject.state.paused, true);
  listeners.get('keydown')?.({ code: 'KeyP', repeat: false });
  scene.keys.p.justDown = true;
  scene.update(200, 100);
  assert.equal(subject.state.paused, false);
  assert.equal(overlay.destroyed, true);
  assert.equal(scene.player.x, 116);
});

test('restart runs once while playing, paused, dead, or victorious', () => {
  for (const state of ['playing', 'paused', 'dead', 'victorious']) {
    const { scene, subject, listeners } = loadGame();
    if (state === 'paused') subject.state.paused = true;
    if (state === 'dead') scene.damagePlayer(100);
    if (state === 'victorious') {
      const boss = enemyAt(scene, 125, 100, { boss: true, hp: 20 });
      scene.damageEnemy(boss, 20);
    }
    let restarts = 0;
    const restart = scene.restartGame.bind(scene);
    scene.restartGame = () => { restarts++; restart(); };
    listeners.get('keydown')?.({ code: 'KeyR', repeat: false });
    scene.keys.r.justDown = true;
    scene.update(0, 16);
    scene.update(16, 16);
    assert.equal(restarts, 1, state);
    assert.equal(subject.state.paused, false, state);
    assert.equal(subject.state.gameOver, false, state);
    assert.equal(subject.state.victory, false, state);
    assert.equal(subject.state.floor, 1, state);
    assert.equal(scene.player.hp, 100, state);
  }
});

test('floor changes clean up old tiles, health bars, labels, lights and sprites', () => {
  const { scene, tweenTargets } = loadGame(() => 0);
  scene.generateFloor(3);
  scene.player.fireballCd = 0;
  projectileAt(scene, 200, 100);
  const oldGraphics = [
    ...scene.floorLayer.children, ...scene.wallLayer.children,
    ...scene.enemies.flatMap(enemy => [enemy.sprite, enemy.hpBarBg, enemy.hpBarFill, enemy.nameText].filter(Boolean)),
    ...scene.torches.flatMap(torch => [torch.sprite, torch.light]),
    ...scene.projectiles.flatMap(projectile => [projectile.sprite, projectile.light]),
    ...scene.pickups.map(pickup => pickup.sprite)
  ];
  scene.generateFloor(1);
  assert.ok(oldGraphics.every(object => !tweenTargets.has(object)));
  assert.ok(oldGraphics.length > 1200);
  assert.ok(oldGraphics.every(object => object.destroyed));
  assert.ok(scene.floorLayer.children.every(object => !object.destroyed));
  assert.ok(scene.torches.every(torch => !torch.light.destroyed));
});

test('a projectile hit creates a single impact and destroys its graphics once', () => {
  const { scene } = loadGame();
  const enemy = enemyAt(scene, 200, 100);
  const projectile = projectileAt(scene, 200, 100);
  scene.updateProjectiles(16);
  assert.equal(enemy.hp, 0);
  assert.equal(projectile.sprite.destroyCount, 1);
  assert.equal(projectile.light.destroyCount, 1);
  assert.equal(scene.projectiles.length, 0);
});

test('an expired projectile also cleans up once', () => {
  const { scene } = loadGame();
  const projectile = projectileAt(scene, 200, 100);
  projectile.ttl = 1;
  scene.updateProjectiles(16);
  assert.equal(projectile.sprite.destroyCount, 1);
  assert.equal(projectile.light.destroyCount, 1);
  assert.equal(scene.projectiles.length, 0);
});

test('diagonal melee includes its forward target and exact range boundary', () => {
  const { scene } = loadGame();
  scene.player.facing = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const front = enemyAt(scene, 130, 130);
  const rear = enemyAt(scene, 70, 70);
  scene.playerMeleeAttack();
  assert.equal(front.hp, 20);
  assert.equal(rear.hp, 40);
  scene.player.facing = { x: 1, y: 0 };
  const boundary = enemyAt(scene, 160, 100);
  scene.playerMeleeAttack();
  assert.equal(boundary.hp, 20);
});

test('150 seeded floors keep separate stairs and the boss on floor three', () => {
  for (let seed = 1; seed <= 50; seed++) {
    let state = seed;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const { scene } = loadGame(random);
    for (let floor = 1; floor <= 3; floor++) {
      scene.generateFloor(floor);
      scene.setupPlayer();
      assert.ok(scene.rooms.length >= 2, `seed ${seed}, floor ${floor}`);
      assert.ok(Math.hypot(scene.player.x - scene.stairsPos.x, scene.player.y - scene.stairsPos.y) >= 30);
      assert.equal(scene.enemies.filter(enemy => enemy.isBoss).length, floor === 3 ? 1 : 0);
    }
  }
});


test('full-health heal keeps its cooldown ready and paused inputs stay blocked', () => {
  const { scene, subject } = loadGame();
  scene.useHeal();
  assert.equal(scene.player.healCd, 0);
  subject.state.paused = true;
  scene.player.hp = 40;
  scene.useHeal();
  scene.useFireball();
  scene.playerMeleeAttack();
  assert.equal(scene.player.hp, 40);
  assert.equal(scene.player.healCd, 0);
  assert.equal(scene.player.attackCd, 0);
  assert.equal(scene.projectiles.length, 0);
});


test('collecting a pickup releases its infinite bobbing tween', () => {
  const { scene, tweenTargets } = loadGame();
  scene.createPickup(100, 100, 'gold', 10);
  const sprite = scene.pickups[0].sprite;
  assert.ok(tweenTargets.has(sprite));
  scene.updatePickups();
  assert.equal(tweenTargets.has(sprite), false);
  assert.equal(sprite.destroyed, true);
});
