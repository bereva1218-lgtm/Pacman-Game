/* P3 — Banco de pruebas de los fantasmas (solo con CONFIG.DEBUG = true).
 *
 * Sirve para probar cada fantasma por separado sin esperar a P2:
 *
 *   1 2 3 4   cargar el nivel de Blinky / Pinky / Inky / Clyde
 *   5         los cuatro a la vez con la IA clásica (jefe final, etapa 1)
 *   0         quitar todos los fantasmas
 *   6         dar la súper bola del siguiente fantasma sin encerrar
 *   7         saltar directo a la etapa 2 del jefe
 *   Q W E R   activar poder: velocidad / invisibilidad / escudo / energía
 *   C         quitar el poder activo
 *   F         forzar el ataque especial AHORA (no esperar el cooldown)
 *   V         traer al fantasma al lado de Pac-Man
 *   B         quitarle 1 impacto (sin importar el poder)
 *   N         aturdirlo 2 s
 *   ESPACIO   lanzar una onda de energía (solo con el poder de energía)
 *
 * CÓMO ESTÁ ORGANIZADO EL ARCHIVO
 *   1. TestWave y TestWaveSource: las ondas de energía provisionales
 *   2. GhostDebug: el panel de la derecha, las teclas y el registro de eventos
 *
 * La onda de aquí es PROVISIONAL: cuando P2 tenga EnergyWave.js se borra
 * TestWaveSource y se le pasa su PowerManager a Collisions.
 */
import * as THREE from 'three';
import { EVENTS } from '../config.js';
import { LEVELS } from '../levels/levels.js';
import { GHOST_STATE } from './Ghost.js';

/* ---------------------------------------------------------------------
 * ------------------ ONDAS DE ENERGÍA (PROVISIONAL) -------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Sin esto Clyde es imposible de matar: solo le hacen daño las ondas, y el
 * EnergyWave.js de P2 todavía no existe. Cada onda sale de Pac-Man en la
 * dirección en la que mira, avanza en línea recta creciendo y perdiendo
 * opacidad, y desaparece al cumplir su tiempo de vida o al chocar con una
 * pared. Quien mira si golpea a un fantasma NO es esta clase, sino
 * Collisions.js, que pide la lista con activeWaves().
 *
 * QUÉ USA
 * - TestWaveSource escucha EVENTS.INPUT_FIRE (la barra espaciadora, que emite
 *   Input.js de P1) y crea una onda si powers.has('energy').
 * - fire() normaliza la dirección: Input da {x,z} y la grilla usa {col,row},
 *   así que acepta las dos formas y, si Pac-Man está quieto, dispara a la
 *   derecha.
 * - update(dt) recorre this.waves con un for...of y luego las limpia con un
 *   filter() por w.alive. Lo llama GhostDebug.update(), no el bucle principal.
 * - TestWave.update(dt) convierte su posición a casilla con worldToTile() y
 *   se destruye si esa casilla no es pisable: así la onda no atraviesa muros.
 * - activeWaves() es el único método que Collisions necesita de aquí. Cuando
 *   P2 tenga su PowerManager, basta con que exponga ese mismo método.
 * ------------------------------------------------------------------- */

const WAVE = { speed: 6, life: 1.2, startRadius: 0.4, growth: 1.2 };

class TestWave {
    constructor(scene, maze, origin, dir) {
        this.maze = maze;
        this.dir = dir;
        this.alive = true;
        this.age = 0;
        this.radius = WAVE.startRadius;

        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(maze.tile * WAVE.startRadius, 14, 10),
            new THREE.MeshBasicMaterial({ color: 0xffee33, transparent: true, opacity: 0.5 }),
        );
        this.mesh.position.copy(origin);
        scene.add(this.mesh);
        this.scene = scene;
    }

    update(dt) {
        if (!this.alive) return;
        this.age += dt;
        this.radius += WAVE.growth * dt;

        this.mesh.position.x += this.dir.col * WAVE.speed * this.maze.tile * dt;
        this.mesh.position.z += this.dir.row * WAVE.speed * this.maze.tile * dt;
        this.mesh.scale.setScalar(this.radius / WAVE.startRadius);
        this.mesh.material.opacity = 0.5 * (1 - this.age / WAVE.life);

        const t = this.maze.worldToTile(this.mesh.position.x, this.mesh.position.z);
        if (this.age >= WAVE.life || !this.maze.isWalkable(t.col, t.row)) this.dispose();
    }

    dispose() {
        if (!this.alive) return;
        this.alive = false;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

export class TestWaveSource {
    constructor({ scene, maze, player, bus, powers }) {
        Object.assign(this, { scene, maze, player, bus, powers });
        this.waves = [];
        bus.on(EVENTS.INPUT_FIRE, () => this.fire());
    }

    fire() {
        if (!this.powers.has('energy')) return;
        const d = this.player.dir;
        const dir = d ? (('col' in d) ? d : { col: d.x, row: d.z }) : { col: 1, row: 0 };
        this.waves.push(new TestWave(this.scene, this.maze, this.player.mesh.position, dir));
    }

    update(dt) {
        for (const w of this.waves) w.update(dt);
        this.waves = this.waves.filter((w) => w.alive);
    }

    activeWaves() { return this.waves; }
}

/* ---------------------------------------------------------------------
 * ------------------------ EL BANCO DE PRUEBAS ------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Un panel de texto fijo en la esquina derecha y un puñado de teclas. No
 * forma parte del juego: se monta aparte en ghostTest.js y se borra entero
 * cuando ya no haga falta. La idea es no tener que jugar un nivel entero
 * para ver un ataque — con F se fuerza, con V se trae al fantasma al lado y
 * con 7 se salta al jefe final.
 *
 * QUÉ USA
 * - El panel es un <pre> con posición fija, no un canvas: se reescribe
 *   entero cada frame con panel.textContent, que para texto plano es más
 *   barato que tocar el DOM elemento por elemento.
 * - Un solo listener de 'keydown' sobre window, guardado en this._onKey para
 *   poder quitarlo en dispose(). Si se registrara con una función anónima no
 *   habría forma de desengancharlo.
 * - POWER_KEYS y LEVEL_KEYS son objetos que mapean e.code a lo que toca, así
 *   onKey() no es una cadena interminable de if con códigos de tecla.
 * ------------------------------------------------------------------- */

const POWER_KEYS = {
    KeyQ: 'speed', KeyW: 'invisibility', KeyE: 'shield', KeyR: 'energy',
};
const LEVEL_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

export class GhostDebug {
    /**
     * @param loadMap     función (index) => void que recarga el laberinto del nivel.
     *                    Se llama ANTES de crear los fantasmas.
     * @param ghostSpawns GHOST_SPAWNS de mazeData.js (casa de los fantasmas)
     * @param onSkipToBoss función que arranca la etapa 2 (tecla 7)
     * @param getBoss     función que devuelve el BossStage actual, o null
     */
    constructor({ bus, ghosts, powers, player, waveSource = null,
                  loadMap = null, ghostSpawns = null,
                  onSkipToBoss = null, getBoss = null }) {
        Object.assign(this, { bus, ghosts, powers, player, waveSource, loadMap, ghostSpawns,
                              onSkipToBoss, getBoss });
        this.msg = 'Pulsa 1-4 para cargar un fantasma';
        this.log = [];

        this.panel = document.createElement('pre');
        Object.assign(this.panel.style, {
            position: 'fixed', top: '8px', right: '8px', margin: 0, padding: '8px 10px',
            font: '12px/1.45 monospace', color: '#fff', background: 'rgba(0,0,0,.65)',
            borderRadius: '6px', pointerEvents: 'none', zIndex: 10, whiteSpace: 'pre',
        });
        document.body.appendChild(this.panel);

        this._listenEvents();
        this._onKey = (e) => this.onKey(e);
        window.addEventListener('keydown', this._onKey);
    }

    /* -----------------------------------------------------------------
     * -------------------- EL REGISTRO DE EVENTOS ---------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Las últimas seis cosas que pasaron, en la parte baja del panel. Sirve
     * para ver lo que NO se ve: que Blinky avisó antes de embestir, que una
     * onda rebotó en un fantasma inmune, que el escudo bloqueó un proyectil.
     * Mirando solo la pantalla es imposible distinguir "no le hizo daño" de
     * "no llegó a tocarlo", y aquí se distingue.
     *
     * QUÉ USA
     * - La función add() de dentro mete el texto al PRINCIPIO con unshift(),
     *   para que lo más reciente quede arriba, y recorta la lista a 6 con
     *   this.log.length = Math.min(...), que trunca el array sin copiarlo.
     * - Todos los enganches son bus.on(...). Cada fantasma emite sus propios
     *   eventos ('blinky:dash', 'inky:teleport', 'clyde:swap'...), así que si
     *   se añade un ataque nuevo basta con escucharlo aquí.
     * - Este método se llama UNA vez, desde el constructor: los listeners se
     *   registran al crear el panel y ahí se quedan.
     * --------------------------------------------------------------- */

    _listenEvents() {
        const add = (txt) => {
            this.log.unshift(txt);
            this.log.length = Math.min(this.log.length, 6);
        };
        this.bus.on('ghost:warn', ({ ghost }) => add(`${ghost}: ¡va a atacar!`));
        this.bus.on('ghost:hit', ({ ghost, type, hits, maxHits }) =>
            add(`${ghost}: golpe ${type} (${hits}/${maxHits})`));
        this.bus.on('ghost:immune', ({ ghost, type }) => add(`${ghost}: inmune a ${type}`));
        this.bus.on(EVENTS.GHOST_DEFEATED, ({ ghost, col, row }) =>
            add(`${ghost} DERROTADO en (${col}, ${row})`));
        this.bus.on(EVENTS.PLAYER_HIT, ({ source }) => add(`Pac-Man golpeado por ${source}`));
        this.bus.on('blinky:dash', () => add('blinky: EMBESTIDA'));
        this.bus.on('pinky:clone', ({ total }) => add(`pinky: clon (${total})`));
        this.bus.on('inky:teleport', ({ col, row }) => add(`inky: teletransporte a (${col}, ${row})`));
        this.bus.on('inky:shoot', () => add('inky: dispara'));
        this.bus.on('projectile:blocked', () => add('escudo: proyectil bloqueado'));
        this.bus.on('clyde:swap', () => add('clyde: INTERCAMBIO'));
        this.bus.on('shield:blocked', ({ ghost }) => add(`escudo aguanta a ${ghost}`));
        this.bus.on('ghost:locked', ({ ghost }) => add(`${ghost} ENCERRADO en su spawn`));
        this.bus.on('boss:fusion', () => add('¡LOS CUATRO SE FUSIONAN!'));
        this.bus.on('boss:ataque', ({ n, nombre, duracion }) =>
            add(`ataque ${n}/4: ${nombre} (${duracion}s)`));
        this.bus.on('boss:superbola', ({ n, ultima }) =>
            add(ultima ? 'súper bola FINAL' : `súper bola ${n}/4`));
        this.bus.on('boss:golpe', ({ hits, maxHits }) => add(`jefe: ${hits}/${maxHits}`));
        this.bus.on('boss:victoria', () => add('JEFE DERROTADO — fin del juego'));
    }

    get ghost() { return this.ghosts.ghosts[0] ?? null; }

    /* -----------------------------------------------------------------
     * --------------------------- LAS TECLAS --------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Un solo manejador para todo, ordenado de lo general a lo concreto:
     * primero las teclas que cambian de nivel, después las del jefe, luego
     * los poderes y al final las que actúan sobre el fantasma en pantalla.
     * Cada bloque termina en return, así que una tecla nunca cae en dos
     * sitios.
     *
     * QUÉ USA
     * - Cambiar de nivel (1-4): el orden de estas tres líneas importa mucho.
     *   loadMap() recarga el laberinto PRIMERO; si se emitiera LEVEL_START
     *   antes, GhostManager crearía el fantasma sobre el mapa anterior y
     *   podría nacer dentro de una pared. Después se sustituye el ghostSpawn
     *   del nivel por el de la casa de fantasmas, porque los de levels.js son
     *   del mapa viejo.
     * - El nivel 5 (tecla 5) no usa LEVELS: se arma aquí un objeto de nivel a
     *   mano con la lista 'ghosts', que es lo que hace que GhostManager cree
     *   los cuatro con la IA clásica en vez de uno solo.
     * - La tecla 6 busca con find() el primer fantasma sin encerrar y emite
     *   POWER_PICKED con 'superball_<nombre>'. No lo encierra: eso lo hace
     *   Collisions.js cuando Pac-Man lo toca, que es el camino real del juego.
     * - La tecla F pone a 0 specialCd y shootCd. Son los contadores que cada
     *   fantasma descuenta en su update(), así que ponerlos a cero dispara el
     *   ataque en el frame siguiente.
     * - La tecla B salta a propósito el takeHit() normal: suma el impacto
     *   directo para poder matar a un fantasma sin tener su poder. Por eso
     *   repite a mano lo que haría takeHit() (barra, parpadeo y defeat()).
     * --------------------------------------------------------------- */

    onKey(e) {
        // Niveles
        if (e.code in LEVEL_KEYS) {
            const index = LEVEL_KEYS[e.code];
            const level = { ...LEVELS[index] };
            // El mapa primero: los fantasmas se crean sobre el laberinto nuevo
            this.loadMap?.(index);
            if (this.ghostSpawns) level.ghostSpawn = this.ghostSpawns.solo;
            this.bus.emit(EVENTS.LEVEL_START, { index, level });
            this.msg = `${level.name} — ${level.tip}`;
            return;
        }
        if (e.code === 'Digit5') {
            this.loadMap?.(0);   // el jefe final todavía no tiene mapa propio
            const s = this.ghostSpawns;
            this.bus.emit(EVENTS.LEVEL_START, {
                index: 4,
                level: {
                    name: 'Nivel 5 — Jefe final (etapa 1)',
                    ghosts: ['blinky', 'pinky', 'inky', 'clyde'],
                    ghostSpawns: s && {
                        blinky: s.blinky, pinky: s.pinky, inky: s.inky, clyde: s.clyde,
                    },
                    tip: 'IA clásica, sin ataques especiales',
                },
            });
            this.msg = 'Jefe final etapa 1: los cuatro con IA clásica';
            return;
        }
        if (e.code === 'Digit0') {
            this.ghosts.clear();
            this.msg = 'Sin fantasmas';
            return;
        }

        // Jefe final
        if (e.code === 'Digit6') {
            const libre = this.ghosts.ghosts.find((g) => !g.locked);
            if (!libre) { this.msg = 'Los cuatro ya están encerrados'; return; }
            this.bus.emit(EVENTS.POWER_PICKED, {
                power: `superball_${libre.name}`, duration: 999,
            });
            this.msg = `Súper bola de ${libre.name}: tócalo para encerrarlo`;
            return;
        }
        if (e.code === 'Digit7') {
            this.ghosts.clear();
            this.onSkipToBoss?.();
            this.msg = 'Saltando a la etapa 2';
            return;
        }

        // Poderes
        if (e.code in POWER_KEYS) {
            const power = POWER_KEYS[e.code];
            this.bus.emit(EVENTS.POWER_PICKED, { power, duration: 999 });
            this.msg = `Poder activo: ${power}`;
            return;
        }
        if (e.code === 'KeyC') {
            this.bus.emit(EVENTS.POWER_EXPIRED, { power: this.powers.current });
            this.msg = 'Sin poder';
            return;
        }

        // Sobre el fantasma actual
        const g = this.ghost;
        if (!g) return;

        if (e.code === 'KeyF') {
            g.specialCd = 0;
            g.shootCd = 0;
            this.msg = `${g.name}: ataque especial forzado`;
        }
        if (e.code === 'KeyV') {
            const t = this.player.tile;
            const libre = this.ghosts.maze.neighbors(t.col, t.row)[0] ?? t;
            g.placeAt(libre);
            this.msg = `${g.name} traído al lado de Pac-Man`;
        }
        if (e.code === 'KeyB') {
            g.hitCooldown = 0;
            g.hits++;
            g.updateHealthBar();
            g.blink(0.4);
            if (g.hits >= g.maxHits) g.defeat();
            this.msg = `${g.name}: ${g.hits}/${g.maxHits} impactos`;
        }
        if (e.code === 'KeyN') {
            g.stun(2);
            this.msg = `${g.name} aturdido 2 s`;
        }
    }

    /* -----------------------------------------------------------------
     * ---------------------------- EL PANEL ---------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Se arma el texto entero cada frame y se vuelca de una vez. Muestra
     * cosas que en pantalla no se ven: cuánto falta para el siguiente ataque,
     * a qué velocidad va el fantasma ahora mismo y a qué tipo de daño es
     * vulnerable. La velocidad de Pac-Man sale justo debajo para poder
     * comparar con la de Clyde, que depende de la distancia.
     *
     * QUÉ USA
     * - Se construye un array de líneas y al final un solo join('\n'), en vez
     *   de ir concatenando: una única escritura al DOM por frame.
     * - El if de tres ramas decide qué mostrar: el jefe si está corriendo, el
     *   aviso de que no hay nada, o la tabla de fantasmas. El jefe va primero
     *   porque durante la etapa 2 no hay fantasmas normales en escena.
     * - La tabla recorre this.ghosts.ghosts con un for...of y alinea las
     *   columnas con padEnd() y padStart(), que es lo que mantiene los
     *   números quietos en vez de bailando de un frame a otro.
     * - También actualiza las ondas con this.waveSource?.update(dt): van
     *   aquí, y no en el bucle principal, porque son parte de las pruebas y
     *   desaparecen junto con este archivo.
     * --------------------------------------------------------------- */

    update(dt) {
        this.waveSource?.update(dt);

        const g = this.ghost;
        const extras = this.ghosts.extras.length;
        const lines = [
            '── PRUEBA DE FANTASMAS ─────────────',
            `Poder: ${this.powers.current ?? '—'}`,
            `Pac-Man: (${this.player.tile.col}, ${this.player.tile.row})`,
            '',
        ];

        const boss = this.getBoss?.();
        if (boss?.running) {
            const a = boss.attack;
            lines.push(
                `JEFE ${boss.hits}/4 impactos · estado: ${boss.state}`,
                a ? `ataque ${boss.attackIndex + 1}/4: ${a.nombre}` +
                    (boss.state === 'attack' ? `  ${Math.max(0, a.dur - boss.t).toFixed(1)}s` : '')
                  : 'preparando...',
                boss.state === 'superball' ? 'recoge la súper bola' : '',
            );
        } else if (!g) {
            lines.push('Sin fantasma en escena.');
        } else {
            for (const gh of this.ghosts.ghosts) {
                lines.push(
                    `${gh.name.padEnd(7)} ${gh.state.padEnd(10)} ` +
                    `${gh.hits}/${gh.maxHits}  cd:${Math.max(0, gh.specialCd).toFixed(1)}s  ` +
                    `dist:${String(gh.distanceToPlayer()).padStart(2)}  vel:${gh.speed.toFixed(2)}`,
                );
            }
            // Para comparar con la de Clyde
            const pv = (this.player.speed ?? 0) * (this.player.boost ?? 1);
            if (pv) lines.push(`Pac-Man vel: ${pv.toFixed(2)}`);
            if (extras) lines.push(`clones: ${extras}`);
            lines.push(`vulnerable a: ${g.vulnerableA.join(', ') || '—'}`);
        }

        lines.push(
            '',
            this.msg,
            '',
            ...this.log.map((l) => '· ' + l),
            '',
            '1-4 fantasma · 5 jefe etapa 1 · 0 ninguno',
            '6 súper bola del siguiente · 7 saltar a la etapa 2',
            'Q velocidad W invisible E escudo R energía C quitar',
            'F forzar ataque · V traer · B golpe · N aturdir · ESPACIO onda',
        );

        this.panel.textContent = lines.join('\n');
    }

    /** Quita el panel y el listener de teclado. Al borrar este archivo del
     *  proyecto no queda nada enganchado a window. */
    dispose() {
        window.removeEventListener('keydown', this._onKey);
        this.panel.remove();
    }
}

// Reexportado por comodidad: así ghostTest.js puede comparar estados de
// fantasma sin importar también Ghost.js.
export { GHOST_STATE };