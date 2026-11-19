/* P3 — Página de prueba de los fantasmas (ghost-test.html).
 *
 * Monta escena + laberinto de P1 + un Pac-Man provisional y deja probar cada
 * fantasma por separado. NO toca main.js ni el juego real: es un punto de
 * entrada aparte, para poder trabajar sin esperar a que P2 termine Pacman.js.
 *
 * CÓMO ESTÁ ORGANIZADO EL ARCHIVO
 *   1. Los mapas y la recarga del laberinto al cambiar de nivel
 *   2. TestPlayer, el Pac-Man provisional
 *   3. main(), que monta la escena y conecta todo
 *   4. El bucle principal y el aviso de errores
 *
 * Si en el repo alguna ruta es distinta, se arregla solo aquí arriba.
 */
import * as THREE from 'three';
import { CONFIG, EVENTS } from './config.js';
import { bus } from './core/EventBus.js';
import { assets } from './core/AssetLoader.js';
import { Input } from './core/Input.js';
import { Maze } from './world/Maze.js';
// Import de espacio de nombres: funciona con el mazeData viejo (un solo MAZE)
// y con el nuevo (LEVEL_MAPS, un mapa por nivel).
import * as mazeData from './world/mazeData.js';
import { GhostManager } from './ghosts/GhostManager.js';
import { PLAYER_TELEPORT } from './ghosts/Clyde.js';
import { BossStage } from './ghosts/Boss.js';
import { GhostDebug, TestWaveSource } from './ghosts/GhostDebug.js';
import { Collisions } from './systems/Collisions.js';
import { PowerState } from './systems/PowerState.js';

/* ---------------------------------------------------------------------
 * ---------------------------- LOS MAPAS ------------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Cada nivel tiene su propio laberinto. Al cambiar de nivel hay que
 * reconstruirlo, pero NO se puede crear otro objeto Maze: los fantasmas, las
 * colisiones y Pac-Man guardaron la referencia al que ya existe y se
 * quedarían apuntando al laberinto viejo. Por eso se reconstruye el mismo
 * objeto por dentro. El archivo también funciona con el mazeData antiguo, el
 * de un solo mapa: entonces MAPS tiene un elemento y no se recarga nada.
 *
 * QUÉ USA
 * - MAPS lee mazeData.LEVEL_MAPS y, si no existe, se arma una lista de uno
 *   solo con el MAZE de siempre. El ?? es lo que hace que sirvan las dos
 *   versiones del archivo de P1.
 * - reloadMaze() es provisional. Llama a los métodos internos de Maze.js
 *   (_buildFloor y _buildWalls) después de vaciar el grupo anterior. En
 *   cuanto Valeria añada Maze.load(matrix, skipTiles) esta función se borra
 *   y se llama a maze.load() directamente.
 * - Quien la llama es loadMap(), dentro de main(), y a su vez GhostDebug la
 *   dispara al pulsar las teclas 1 a 4. El orden importa: primero el mapa,
 *   después los fantasmas, o nacerían sobre el laberinto anterior.
 * ------------------------------------------------------------------- */

/** Los mapas disponibles, con o sin LEVEL_MAPS en mazeData.js */
const MAPS = mazeData.LEVEL_MAPS ?? [{
    matrix: mazeData.MAZE,
    playerStart: mazeData.PLAYER_START,
}];
const mapForLevel = (i) => MAPS[i] ?? MAPS[0];

function reloadMaze(maze, matrix, assets, skipTiles = []) {
    maze.scene.remove(maze.group);
    maze.walls?.geometry.dispose();
    maze.walls?.material.dispose();
    maze.walls2?.geometry.dispose();
    maze.walls2?.material.dispose();
    maze.walls3?.geometry.dispose();
    maze.walls3?.material.dispose();
    maze.walls4?.geometry.dispose();
    maze.walls4?.material.dispose();
    maze.walls5?.geometry.dispose();
    maze.walls5?.material.dispose();

    maze.group = new THREE.Group();
    maze.group.name = 'Maze';
    maze.grid = matrix.map((r) => [...r]);
    maze.rows = maze.grid.length;
    maze.cols = maze.grid[0].length;

    maze._buildFloor();
    maze._buildWalls(assets, skipTiles);
    maze.scene.add(maze.group);
}

/* ---------------------------------------------------------------------
 * --------------------- PAC-MAN PROVISIONAL ---------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Un Pac-Man mínimo para poder probar a los fantasmas sin esperar al de P2.
 * Se mueve casilla a casilla: solo avanza mientras mantengas una flecha
 * pulsada y, al llegar al centro de la casilla siguiente, decide si sigue.
 * Expone exactamente lo que los fantasmas necesitan leer — mesh.position,
 * tile, dir y speed — así que el día que entre el Pacman real basta con
 * cambiar esta clase por la suya.
 *
 * QUÉ USA
 * - update(dt) la llama el bucle principal una vez por frame. Si no hay
 *   casilla destino (this.target) pregunta a Input.getMoveDirection() y
 *   comprueba con maze.isWalkable() que no haya pared; si la hay, se queda
 *   quieto. Si ya tiene destino, avanza hacia él con addScaledVector y, al
 *   llegar, emite EVENTS.PLAYER_TILE, que es lo que escucha el LevelManager
 *   de P1.
 * - teleport() lo usan tres cosas distintas: EVENTS.PLAYER_RESPAWN cuando
 *   pierdes una vida, PLAYER_TELEPORT para el intercambio de Clyde y el
 *   arranque de la etapa 2 del jefe, y loadMap() al cambiar de nivel.
 * - El parpadeo tras recibir daño es un contador, this.hurtTime, que se
 *   activa al oír EVENTS.PLAYER_HIT y alterna visible con un Math.floor
 *   sobre el tiempo restante.
 * - this.boost lo cambia el evento 'power:changed' de PowerState: es lo que
 *   hace que la poción de velocidad se note, y lo que lee Clyde para
 *   igualar la velocidad de Pac-Man.
 * ------------------------------------------------------------------- */

class TestPlayer {
    constructor({ scene, maze, input, bus, start }) {
        Object.assign(this, { maze, input, bus });
        this.mesh = assets.get('pacman', { size: 0.8 * maze.tile });
        scene.add(this.mesh);
        this.speed = 5;      // casillas por segundo
        this.boost = 1;
        this.dir = null;
        this.target = null;
        this.teleport(start);

        bus.on(EVENTS.PLAYER_RESPAWN, (t) => this.teleport(t));
        bus.on(PLAYER_TELEPORT, (t) => this.teleport(t));   // intercambio de Clyde
        bus.on(EVENTS.PLAYER_HIT, () => {          // parpadeo al recibir daño
            this.hurtTime = 1.5;
        });
        bus.on('power:changed', ({ power }) => { this.boost = power === 'speed' ? 1.8 : 1; });
    }

    teleport({ col, row }) {
        this.tile = { col, row };
        this.target = null;
        this.input.clearDirection();
        this.maze.tileToWorld(col, row, this.mesh.position);
        this.bus.emit(EVENTS.PLAYER_TILE, { ...this.tile });
    }

    update(dt) {
        if (this.hurtTime > 0) {
            this.hurtTime -= dt;
            this.mesh.visible = Math.floor(this.hurtTime * 12) % 2 === 0;
            if (this.hurtTime <= 0) this.mesh.visible = true;
        }

        if (!this.target) {
            const want = this.input.getMoveDirection();
            const libre = want && this.maze.isWalkable(this.tile.col + want.x, this.tile.row + want.z);
            this.dir = libre ? want : null;
            if (this.dir) this.target = { col: this.tile.col + this.dir.x, row: this.tile.row + this.dir.z };
        }
        if (!this.target) return;

        const goal = this.maze.tileToWorld(this.target.col, this.target.row);
        const step = this.speed * this.boost * this.maze.tile * dt;
        const pos = this.mesh.position;

        if (pos.distanceTo(goal) <= step) {
            pos.copy(goal);
            this.tile = this.target;
            this.target = null;
            this.bus.emit(EVENTS.PLAYER_TILE, { ...this.tile });
        } else {
            pos.addScaledVector(goal.clone().sub(pos).normalize(), step);
        }
        if (this.dir) this.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    }
}

/* ---------------------------------------------------------------------
 * -------------------------- LA ESCENA --------------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Monta lo mínimo de Three.js (render, escena, luces y cámara en picado
 * sobre el laberinto), carga los modelos y crea en orden las piezas del
 * juego. El orden importa: primero los modelos, porque todo lo demás pide
 * figuras al AssetLoader; después el laberinto, porque los fantasmas y las
 * colisiones lo necesitan para existir.
 *
 * QUÉ USA
 * - assets.loadAll() se espera con await. Nunca falla: lo que no tenga .vox
 *   se dibuja con el placeholder de P1, así que se puede probar la IA sin
 *   tener un solo modelo hecho.
 * - La cámara se coloca a partir de maze.center() y del tamaño del
 *   laberinto, no con números fijos, para que siga encuadrando si cambia.
 * - PowerState escucha el bus y es quien sabe qué poder está activo; los
 *   fantasmas y Collisions lo consultan con powers.has('...').
 * - TestWaveSource es provisional, hasta que P2 tenga EnergyWave.js: es lo
 *   único con lo que se puede dañar a Clyde.
 * - La última línea simula pulsar la tecla 1 para arrancar en el nivel 1 sin
 *   repetir aquí la lógica que ya tiene GhostDebug.
 * ------------------------------------------------------------------- */

async function main() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    // Mismo contenedor que usa index.html
    (document.getElementById('game') ?? document.body).appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b16);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(12, 24, 8);
    scene.add(sun);

    await assets.loadAll();

    const maze = new Maze(scene, mapForLevel(0).matrix, assets);
    const center = maze.center();

    const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
    camera.position.set(center.x, maze.rows * maze.tile * 0.95, center.z + maze.rows * maze.tile * 0.55);
    camera.lookAt(center);

    addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    });

    const input = new Input(bus);
    const powers = new PowerState(bus);
    const player = new TestPlayer({ scene, maze, input, bus, start: mapForLevel(0).playerStart });

    const ghosts = new GhostManager({ scene, maze, player, bus, assets, powers });
    const waveSource = new TestWaveSource({ scene, maze, player, bus, powers });
    const collisions = new Collisions({ player, ghosts, bus, powers, waveSource, maze });

    /* -----------------------------------------------------------------
     * --------------------- EL JEFE FINAL -----------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * La etapa 2 no existe desde el principio: se crea cuando los cuatro
     * fantasmas quedan encerrados en su spawn. Mientras no haya jefe, boss
     * vale null y el bucle principal simplemente no lo actualiza. Al salir
     * de la arena hay que destruirlo, porque mientras vive tiene cambiado
     * el laberinto por el cuadrado abierto.
     *
     * QUÉ USA
     * - bus.on('boss:fusion', startBoss): ese evento lo emite GhostManager
     *   en checkStageOne() cuando los cuatro están encerrados. Es el único
     *   enganche entre la etapa 1 y la 2.
     * - startBoss() también lo llama la tecla 7 de GhostDebug, para saltar
     *   directo a la arena sin tener que encerrar a los cuatro cada vez.
     * - stopBoss() se llama desde loadMap(): BossStage.dispose() es quien
     *   devuelve maze.grid y maze.group a como estaban.
     * - El bucle principal lo actualiza con  boss?.update(dt)  — el ?. es
     *   lo que evita tener que comprobar si existe en cada frame.
     * --------------------------------------------------------------- */

    let boss = null;

    const startBoss = () => {
        boss?.dispose();
        boss = new BossStage({ scene, maze, player, bus, assets });
        boss.start();
    };
    const stopBoss = () => { boss?.dispose(); boss = null; };

    bus.on('boss:fusion', startBoss);

    /** Cambiar de nivel: laberinto nuevo y Pac-Man a su casilla de inicio */
    const loadMap = (index) => {
        stopBoss();   // si estábamos en la arena, se vuelve al laberinto
        const map = mapForLevel(index);
        const skip = mazeData.EXIT_TILE ? [mazeData.EXIT_TILE] : [];
        if (MAPS.length > 1) reloadMaze(maze, map.matrix, assets, skip);
        player.teleport(map.playerStart);
    };

    const debug = new GhostDebug({
        bus, ghosts, powers, player, waveSource,
        loadMap, ghostSpawns: mazeData.GHOST_SPAWNS,
        onSkipToBoss: startBoss,
        getBoss: () => boss,
    });

    // Empezar directamente en el nivel 1
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));

    /* -----------------------------------------------------------------
     * ------------------- EL BUCLE PRINCIPAL --------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Un frame del juego. El orden de las llamadas no es casual: primero se
     * mueve Pac-Man, después los fantasmas (que leen dónde quedó), después
     * se miran los choques con todo ya en su sitio, y al final se dibuja. Si
     * las colisiones fueran antes de mover, se comprobarían contra las
     * posiciones del frame anterior.
     *
     * QUÉ USA
     * - renderer.setAnimationLoop() en vez de requestAnimationFrame: es lo
     *   que recomienda Three.js y se pausa solo si la pestaña se oculta.
     * - THREE.Clock.getDelta() da los segundos desde el frame anterior.
     *   Está limitado a 0,05 con Math.min porque, al volver de otra pestaña,
     *   ese salto sería enorme y los fantasmas atravesarían paredes de un
     *   tirón. Todo el juego calcula con dt, nunca con frames.
     * --------------------------------------------------------------- */

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.05);   // sin saltos si se cambia de pestaña
        player.update(dt);
        ghosts.update(dt);
        boss?.update(dt);
        collisions.update(dt);
        powers.update(dt);
        debug.update(dt);
        renderer.render(scene, camera);
    });

    console.info('[ghost-test] listo. CONFIG.TILE_SIZE =', CONFIG.TILE_SIZE);
}

/* ---------------------------------------------------------------------
 * ------------------------- SI ALGO FALLA -----------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Si main() revienta (una ruta mal, un import que no existe, un modelo
 * roto), sin esto la pantalla se queda negra y hay que abrir la consola
 * para enterarse. Así el error se ve directamente encima del juego.
 *
 * QUÉ USA
 * - El .catch() de la promesa que devuelve main(), porque es async: un
 *   try/catch normal no atraparía nada aquí.
 * - Se añade un <pre> encima en vez de reemplazar el body, para no borrar
 *   el contenedor #game si el fallo ocurrió a medio montar la escena.
 * ------------------------------------------------------------------- */

main().catch((err) => {
    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;inset:0;margin:0;padding:20px;color:#f88;' +
        'background:#05050f;font:13px/1.5 monospace;white-space:pre-wrap;z-index:99';
    pre.textContent = `Error al arrancar la prueba de fantasmas:\n\n${err?.stack ?? err}`;
    document.body.appendChild(pre);
    console.error(err);
});