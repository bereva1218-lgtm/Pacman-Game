/* P1 VALERIA — Punto de entrada: renderer, cámara, luces, loop y conexión de módulos.
 *
 * P2 y P3: busquen los bloques "P2 (LAURA)" y "P3 (SANTIAGO)" más abajo.
 * Todo lo que tenga update(dt) se agrega a `systems` y el loop lo llama solo en PLAYING,
 * EN EL ORDEN en que se agregó: jugador → fantasmas → jefe → choques → poderes → HUD.
 *
 * Mientras P2 termina sus archivos, se usan las piezas provisionales de ghostTest.js:
 *   PowerState     → se reemplaza por PowerManager.js (o se queda, si P2 lo adopta)
 *   TestWaveSource → se reemplaza por EnergyWave.js
 * Cada reemplazo es una sola línea en el bloque P2.
 */
import * as THREE from 'three';
import { CONFIG, EVENTS } from './config.js';
import { bus } from './core/EventBus.js';
import { GameState, STATES } from './core/GameState.js';
import { Input } from './core/Input.js';
import { assets } from './core/AssetLoader.js';
import { Maze } from './world/Maze.js';
import { MAZE, EXIT_TILE, PLAYER_START } from './world/mazeData.js';
import { Exit } from './world/Exit.js';
import { LevelManager } from './levels/LevelManager.js';
import { DebugTools } from './core/Debug.js';
import { HUD } from './ui/HUD.js';
import { Screens } from './ui/Screens.js';

// P2 (LAURA)
import { Pacman } from './player/Pacman.js';
// P2 — provisionales (hasta PowerManager.js y EnergyWave.js)
import { PowerState } from './systems/PowerState.js';
import { TestWaveSource } from './ghosts/GhostDebug.js';

// P3 (SANTIAGO)
import { GhostManager } from './ghosts/GhostManager.js';
import { BossStage } from './ghosts/Boss.js';
import { Collisions } from './systems/Collisions.js';

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.COLORS.BACKGROUND);

// ---------------------------------------------------------------- cámara inclinada
const camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.FOV, window.innerWidth / window.innerHeight, 0.1, 200);

/** Aleja la cámara lo justo para que el laberinto quepa en la pantalla (ancha o angosta). */
function fitCamera(maze) {
    const c = maze.center();
    const halfW = (maze.cols * maze.tile) / 2 + 1;
    const halfD = (maze.rows * maze.tile) / 2 + 1;
    const tanV = Math.tan(THREE.MathUtils.degToRad(CONFIG.CAMERA.FOV / 2));
    const dist = Math.max(halfD / tanV, halfW / (tanV * camera.aspect)) * 1.12; // margen por la perspectiva
    const dir = new THREE.Vector3(0, CONFIG.CAMERA.HEIGHT, CONFIG.CAMERA.TILT).normalize();
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.lookAt(c);
}

// ---------------------------------------------------------------- luces
scene.add(new THREE.HemisphereLight(0xbbccff, 0x202030, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);

function placeSun(maze) {
    const c = maze.center();
    const r = Math.max(maze.cols, maze.rows) * maze.tile * 0.75;
    sun.position.set(c.x - 8, 20, c.z + 6);
    sun.target.position.copy(c);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 60 });
    sun.shadow.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- juego
const gameState = new GameState(bus);
const input = new Input(bus);
const systems = []; // objetos con update(dt): Pacman, fantasmas, poderes...

async function init() {
    await assets.loadAll((p, key) => console.log(`[assets] ${Math.round(p * 100)}% ${key}`));

    const maze = new Maze(scene, MAZE, assets, [EXIT_TILE]);
    const exit = new Exit(scene, maze, assets, EXIT_TILE);
    const levelManager = new LevelManager({ scene, maze, exit, assets, bus, gameState });
    fitCamera(maze);
    placeSun(maze);

    const ctx = { scene, camera, renderer, maze, exit, levelManager, assets, bus, gameState, input };

    // ===== P2 (LAURA): Pacman, PowerManager, EnergyWave, HUD, Screens =====
    const player = new Pacman({ ...ctx, start: PLAYER_START });
    const powers = new PowerState(bus);                                       // → new PowerManager(ctx)
    const waveSource = new TestWaveSource({ scene, maze, player, bus, powers }); // → new EnergyWave(...)
    Object.assign(ctx, { player, powers, waveSource });

    const hud = new HUD(ctx);
    new Screens({ ...ctx, hud });            // tiene su propio reloj: no va en systems

    // ===== P3 (SANTIAGO): GhostManager, Collisions, jefe final =====
    // El jefe se crea cuando los cuatro fantasmas quedan encerrados ('boss:fusion').
    // Se destruye al empezar cada nivel para devolver el laberinto normal.
    // OJO: este listener va ANTES de crear GhostManager, para que el laberinto ya
    // esté restaurado cuando los fantasmas aparezcan en LEVEL_START.
    let boss = null;
    const startBoss = () => {
        boss?.dispose();
        boss = new BossStage({ scene, maze, player, bus, assets });
        boss.start();
    };
    const stopBoss = () => { boss?.dispose(); boss = null; };
    bus.on('boss:fusion', startBoss);
    bus.on(EVENTS.LEVEL_START, stopBoss);

    const ghosts = new GhostManager({ scene, maze, player, bus, assets, powers });
    const collisions = new Collisions({ player, ghosts, bus, powers, waveSource, maze });
    Object.assign(ctx, { ghosts, collisions });

    // ---------------------------------------------------------- orden del frame
    // Primero se mueve Pac-Man, después los fantasmas (que leen dónde quedó),
    // después los choques con todo en su sitio, y al final poderes y HUD.
    systems.push(
        player,
        ghosts,
        { update: (dt) => boss?.update(dt) },
        collisions,
        powers,
    );
    if (typeof waveSource.update === 'function') systems.push(waveSource);
    systems.push(hud);

    let debug = null;
    if (CONFIG.DEBUG) {
        debug = new DebugTools({ ...ctx, player });
    }

    // ---------------------------------------------------------- controles globales
    bus.on(EVENTS.INPUT_PAUSE, () => gameState.togglePause());
    bus.on(EVENTS.INPUT_START, () => {
        if ([STATES.MENU, STATES.GAME_OVER, STATES.WIN].includes(gameState.current)) levelManager.startGame();
    });
    bus.on(EVENTS.STATE_CHANGED, ({ from, to }) => console.log(`[estado] ${from} → ${to}`));

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        fitCamera(maze);
    });

    // ---------------------------------------------------------- loop
    // THREE.Clock está obsoleto desde r183; THREE.Timer es su reemplazo (mismo getDelta()).
    const clock = new THREE.Timer();
    clock.connect(document); // evita un dt gigante al volver de otra pestaña

    renderer.setAnimationLoop((timestamp) => {
        clock.update(timestamp);
        const dt = Math.min(clock.getDelta(), 0.05); // tope: evita saltos si hay un bajón de FPS
        const playing = gameState.is(STATES.PLAYING);

        if (playing) systems.forEach((s) => s.update(dt));
        if (!gameState.is(STATES.PAUSED)) levelManager.update(dt);
        debug?.update(playing ? dt : 0);

        renderer.render(scene, camera);
    });
}

// Si init() revienta (ruta mal, import que no existe, modelo roto), el error se ve
// encima del juego en vez de dejar la pantalla negra. (Idea tomada de ghostTest.js)
init().catch((err) => {
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:20px;color:#f88;' +
        'background:#05050f;font:13px/1.5 monospace;white-space:pre-wrap;z-index:99';
    pre.textContent = `Error al arrancar el juego:\n\n${err?.stack ?? err}`;
    document.body.appendChild(pre);
    console.error(err);
});