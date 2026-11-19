/* P1 VALERIA — LevelManager: el "director" de la partida.
 *
 * Flujo de cada nivel:
 *   1. loadLevel → coloca objeto real, falsos y pistas; emite LEVEL_START (P3 crea el fantasma)
 *   2. Pacman pisa el objeto real → emite POWER_PICKED (P2 activa el poder)
 *   3a. P3 emite GHOST_DEFEATED → aparece la llave donde cayó el fantasma
 *   3b. P2 emite POWER_EXPIRED sin haber vencido → el objeto reaparece en otro lugar
 *   4. Pacman recoge la llave → LEVEL_COMPLETE → siguiente nivel
 *   5. Con 4 llaves → empieza el jefe final; derrotarlo = WIN
 *
 * Vidas: se pierde 1 si se acaba el tiempo (se reinicia el nivel) o si P3 emite PLAYER_HIT.
 */
import { EVENTS, CONFIG, GHOST_INFO } from '../config.js';
import { STATES } from '../core/GameState.js';
import { GHOST_SPAWNS, PLAYER_START } from '../world/mazeData.js';
import { LEVELS, ESCAPE_TIME } from './levels.js';
import { Item, ITEM } from './Items.js';

export class LevelManager {
    constructor({ scene, maze, exit, assets, bus, gameState }) {
        Object.assign(this, { scene, maze, exit, assets, bus, gameState });
        this.items = [];
        this.level = null;
        this.playerTile = { ...PLAYER_START };
        this.time = 0;
        this.finalGhosts = [];
        this.activeBossBall = null;
        this.activeBossTarget = null;
        this.bossBallTimer = 0;

        bus.on(EVENTS.PLAYER_TILE, (t) => this.onPlayerTile(t));
        bus.on(EVENTS.GHOST_DEFEATED, (d) => this.onGhostDefeated(d));
        bus.on('ghost:locked', (d) => this.onFinalGhostLocked(d));
        bus.on('boss:etapa2', () => this.startFinalBoss());
        bus.on(EVENTS.POWER_EXPIRED, (d) => this.onPowerExpired(d));
        bus.on(EVENTS.PLAYER_HIT, () => this.loseLife('hit'));
    }

    get levelIndex() { return this.gameState.levelIndex; }

    // ------------------------------------------------------------ partida / nivel

    startGame() {
        this.gameState.reset();
        this.exit.close();
        this.bus.emit(EVENTS.LIVES_CHANGED, { lives: this.gameState.lives });
        this.bus.emit(EVENTS.KEY_COLLECTED, { keys: 0 });
        this.loadLevel(0);
        this.gameState.set(STATES.PLAYING);
    }

    loadLevel(index) {
        this.clearItems();
        this.gameState.levelIndex = index;
        this.level = LEVELS[index];
        this.phase = 'search';           // 'search' → 'key' → (último nivel) 'escape'
        this.ghostDefeated = false;
        this.lastPowerTile = null;
        this.timeLeft = this.level.timeLimit;
        this._lastSecond = -1;

        this.respawnPlayer();
        this.spawnRealItem();
        for (let i = 0; i < this.level.fakeCount; i++) {
            this.spawn(ITEM.FAKE, `fake_${this.level.power}`, this.randomTile());
        }
        for (let i = 0; i < this.level.hintCount; i++) {
            this.spawn(ITEM.HINT, 'hint', this.randomTile(), { text: '' }); // el texto se arma al recogerla
        }

        this.bus.emit(EVENTS.LEVEL_START, { index, level: this.level });
    }

    respawnPlayer() {
        this.playerTile = { ...PLAYER_START };
        this.bus.emit(EVENTS.PLAYER_RESPAWN, { ...PLAYER_START });
    }

    // ------------------------------------------------------------ objetos

    spawn(type, modelKey, tile, data = {}) {
        const item = new Item({ type, modelKey, data, ...tile }, this.scene, this.maze, this.assets);
        this.items.push(item);
        return item;
    }

    removeItem(item) {
        item.dispose();
        this.items = this.items.filter((i) => i !== item);
    }

    clearItems() {
        this.items.forEach((i) => i.dispose());
        this.items = [];
    }

    isOccupied(tile) {
        return this.items.some((i) => i.isAt(tile.col, tile.row));
    }

    /** Casilla libre, lejos del jugador y del fantasma, sin otro objeto encima. */
    randomTile(minDist = 4) {
        const ok = (t) =>
            !this.isOccupied(t) &&
            this.maze.distance(t, this.playerTile) >= minDist &&
            this.maze.distance(t, this.level.ghostSpawn) >= 2 &&
            this.maze.distance(t, PLAYER_START) >= 2;
        return this.maze.randomFreeTile(ok) ?? this.maze.randomFreeTile((t) => !this.isOccupied(t));
    }

    spawnRealItem() {
        // preferir una casilla de la lista que no sea la anterior, ni esté ocupada, ni pegada al jugador
        const candidates = this.level.itemSpawns.filter((t) =>
            this.maze.isWalkable(t.col, t.row) &&
            !this.isOccupied(t) &&
            !(this.lastPowerTile && t.col === this.lastPowerTile.col && t.row === this.lastPowerTile.row) &&
            this.maze.distance(t, this.playerTile) >= 4);
        const tile = candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : this.randomTile(6);
        this.lastPowerTile = tile;
        return this.spawn(ITEM.POWER, `power_${this.level.power}`, tile);
    }

    /** Arma el texto de una pista según dónde está el objeto real AHORA. */
    makeHintText() {
        const real = this.items.find((i) => i.type === ITEM.POWER);
        if (!real || Math.random() < 0.35) return this.level.tip;
        const c = this.maze.center();
        const midCol = c.x / this.maze.tile, midRow = c.z / this.maze.tile;
        const v = real.row < midRow ? 'norte' : 'sur';
        const h = real.col < midCol ? 'oeste' : 'este';
        const d = this.maze.distance(real, this.playerTile);
        return `${this.level.powerLabel}: busca al ${v}-${h}, a unas ${d} casillas de aquí.`;
    }

    // ------------------------------------------------------------ eventos

    onPlayerTile({ col, row }) {
        this.playerTile = { col, row };
        if (!this.gameState.is(STATES.PLAYING)) return;

        if (this.exit.isAt(col, row)) {
            this.gameState.set(STATES.WIN);
            return;
        }

        const item = this.items.find((i) => i.isAt(col, row));
        if (!item) return;
        this.removeItem(item);

        switch (item.type) {
            case ITEM.POWER:
                this.bus.emit(EVENTS.POWER_PICKED, { power: this.level.power, duration: this.level.powerDuration });
                break;
            case ITEM.BOSS_BALL:
                this.activeBossBall = null;
                this.activeBossTarget = item.data.ghost;
                this.bus.emit(EVENTS.POWER_PICKED, {
                    power: `superball_${item.data.ghost}`,
                    duration: 999,
                });
                this.bus.emit('boss:ballCollected', { ghost: item.data.ghost });
                break;
            case ITEM.FAKE:
                this.bus.emit(EVENTS.FAKE_PICKED, {});
                break;
            case ITEM.HINT:
                this.bus.emit(EVENTS.HINT_PICKED, { text: this.makeHintText() });
                break;
            case ITEM.KEY:
                this.collectKey();
                break;
        }
    }

    onGhostDefeated({ ghost, col, row } = {}) {
        if (this.phase !== 'search') return;
        if (ghost && ghost !== this.level.ghost) return; // no es el fantasma de este nivel
        this.ghostDefeated = true;
        this.phase = 'key';

        // el objeto real ya no hace falta
        this.items.filter((i) => i.type === ITEM.POWER).forEach((i) => this.removeItem(i));

        let tile = { col, row };
        if (col === undefined || !this.maze.isWalkable(col, row)) tile = { ...this.level.ghostSpawn };
        this.spawn(ITEM.KEY, 'key', tile);
        this.bus.emit(EVENTS.KEY_SPAWNED, tile);
    }

    onPowerExpired({ power } = {}) {
        if (this.phase === 'final-ghosts' &&
            this.activeBossTarget &&
            power === `superball_${this.activeBossTarget}`) {
            this.activeBossTarget = null;
            this.bossBallTimer = 1.5;
            return;
        }
        if (this.phase !== 'search' || this.ghostDefeated) return;
        if (power && power !== this.level.power) return;
        if (this.items.some((i) => i.type === ITEM.POWER)) return; // ya hay uno en el mapa
        const item = this.spawnRealItem();
        this.bus.emit(EVENTS.ITEM_RESPAWNED, { col: item.col, row: item.row });
    }

    collectKey() {
        this.gameState.keys++;
        this.bus.emit(EVENTS.KEY_COLLECTED, { keys: this.gameState.keys });

        if (this.gameState.keys >= LEVELS.length) {
            this.startFinalGhostStage();
        } else {
            this.transitionTimer = CONFIG.LEVEL_COMPLETE_DELAY;
            this.gameState.set(STATES.LEVEL_COMPLETE);
            this.bus.emit(EVENTS.LEVEL_COMPLETE, { index: this.levelIndex });
        }
    }

    startFinalGhostStage() {
        this.clearItems();
        this.gameState.levelIndex = LEVELS.length;
        this.level = {
            id: LEVELS.length + 1,
            name: 'Nivel 5 — Los cuatro fantasmas',
            ghost: 'los cuatro',
            ghosts: ['blinky', 'pinky', 'inky', 'clyde'],
            ghostSpawns: {
                blinky: GHOST_SPAWNS.blinky,
                pinky: GHOST_SPAWNS.pinky,
                inky: GHOST_SPAWNS.inky,
                clyde: GHOST_SPAWNS.clyde,
            },
            ghostSpawn: GHOST_SPAWNS.solo,
            power: 'superball',
            powerLabel: 'Súper bola',
            powerDuration: 999,
            timeLimit: 0,
            fakeCount: 0,
            hintCount: 0,
            itemSpawns: [],
            tip: 'Recoge cada bola de color y toca al fantasma indicado.',
        };
        this.phase = 'final-ghosts';
        this.finalGhosts = [...this.level.ghosts];
        this.activeBossBall = null;
        this.activeBossTarget = null;
        this.bossBallTimer = 1;
        this.respawnPlayer();
        this.bus.emit(EVENTS.LEVEL_START, { index: this.gameState.levelIndex, level: this.level });
    }

    spawnFinalBossBall() {
        const colors = Object.fromEntries(Object.entries(GHOST_INFO).map(([g, i]) => [g, i.hex]));
        const target = this.finalGhosts[Math.floor(Math.random() * this.finalGhosts.length)];
        const tile = this.maze.randomFreeTile((t) =>
            !this.isOccupied(t) &&
            this.maze.distance(t, this.playerTile) >= 4 &&
            this.maze.distance(t, GHOST_SPAWNS.solo) >= 2
        );
        if (!tile) {
            this.bossBallTimer = 1;
            return;
        }

        this.activeBossBall = this.spawn(
            ITEM.BOSS_BALL,
            `boss_ball_${target}`,
            tile,
            { ghost: target, color: colors[target] },
        );
        this.bus.emit('boss:ballSpawned', { ghost: target, color: colors[target] });
    }

    onFinalGhostLocked({ ghost } = {}) {
        if (this.phase !== 'final-ghosts') return;
        this.finalGhosts = this.finalGhosts.filter((name) => name !== ghost);
        if (this.activeBossBall) {
            this.removeItem(this.activeBossBall);
            this.activeBossBall = null;
        }
        if (this.activeBossTarget === ghost) this.activeBossTarget = null;
        if (this.finalGhosts.length) this.bossBallTimer = 1.5;
    }

    startFinalBoss() {
        if (this.phase !== 'final-ghosts') return;
        this.phase = 'boss';
        this.clearItems();
        this.activeBossBall = null;
        this.activeBossTarget = null;
        this.finalGhosts = [];
    }

    loseLife(reason) {
        if (!this.gameState.is(STATES.PLAYING)) return;
        this.gameState.lives--;
        this.bus.emit(EVENTS.LIVES_CHANGED, { lives: this.gameState.lives, reason });

        if (this.gameState.lives <= 0) {
            this.gameState.set(STATES.GAME_OVER);
            return;
        }
        if (reason === 'timeout') {
            this.bus.emit(EVENTS.LEVEL_TIMEOUT, { index: this.levelIndex });
            if (this.phase === 'escape') {
                this.timeLeft = ESCAPE_TIME;   // no se pierden las llaves
                this.respawnPlayer();
            } else {
                this.loadLevel(this.levelIndex); // reiniciar el nivel
            }
        } else {
            this.respawnPlayer();
        }
    }

    // ------------------------------------------------------------ loop

    update(dt) {
        this.time += dt;
        this.items.forEach((i) => i.update(dt, this.time));
        this.exit.update(dt);

        if (this.gameState.is(STATES.LEVEL_COMPLETE)) {
            this.transitionTimer -= dt;
            if (this.transitionTimer <= 0) {
                this.loadLevel(this.levelIndex + 1);
                this.gameState.set(STATES.PLAYING);
            }
            return;
        }

        if (!this.gameState.is(STATES.PLAYING) || this.phase === 'boss') return;
        if (this.phase === 'final-ghosts') {
            if (this.finalGhosts.length && !this.activeBossBall && !this.activeBossTarget) {
                this.bossBallTimer -= dt;
                if (this.bossBallTimer <= 0) this.spawnFinalBossBall();
            }
            return;
        }

        this.timeLeft -= dt;
        const sec = Math.max(0, Math.ceil(this.timeLeft));
        if (sec !== this._lastSecond) {
            this._lastSecond = sec;
            this.bus.emit(EVENTS.LEVEL_TIME, { remaining: sec });
        }
        if (this.timeLeft <= 0) this.loseLife('timeout');
    }
}
