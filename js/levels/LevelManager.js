/* P1 VALERIA — LevelManager: el "director" de la partida.
 *
 * Flujo de cada nivel:
 *   1. loadLevel → coloca objeto real, falsos y pistas; emite LEVEL_START (P3 crea el fantasma)
 *   2. Pacman pisa el objeto real → emite POWER_PICKED (P2 activa el poder)
 *   3a. P3 emite GHOST_DEFEATED → aparece la llave donde cayó el fantasma
 *   3b. P2 emite POWER_EXPIRED sin haber vencido → el objeto reaparece en otro lugar
 *   4. Pacman recoge la llave → LEVEL_COMPLETE → siguiente nivel
 *   5. Con 4 llaves → se abre la salida → pisarla = WIN
 *
 * Vidas: se pierde 1 si se acaba el tiempo (se reinicia el nivel) o si P3 emite PLAYER_HIT.
 */
import { EVENTS, CONFIG } from '../config.js';
import { STATES } from '../core/GameState.js';
import { PLAYER_START } from '../world/mazeData.js';
import { LEVELS, ESCAPE_TIME } from './levels.js';
import { Item, ITEM } from './Items.js';

export class LevelManager {
    constructor({ scene, maze, exit, assets, bus, gameState }) {
        Object.assign(this, { scene, maze, exit, assets, bus, gameState });
        this.items = [];
        this.level = null;
        this.playerTile = { ...PLAYER_START };
        this.time = 0;

        bus.on(EVENTS.PLAYER_TILE, (t) => this.onPlayerTile(t));
        bus.on(EVENTS.GHOST_DEFEATED, (d) => this.onGhostDefeated(d));
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
            this.phase = 'escape';
            this.timeLeft = ESCAPE_TIME;
            this.exit.open();
            this.bus.emit(EVENTS.EXIT_OPENED, {});
        } else {
            this.transitionTimer = CONFIG.LEVEL_COMPLETE_DELAY;
            this.gameState.set(STATES.LEVEL_COMPLETE);
            this.bus.emit(EVENTS.LEVEL_COMPLETE, { index: this.levelIndex });
        }
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

        if (!this.gameState.is(STATES.PLAYING)) return;

        this.timeLeft -= dt;
        const sec = Math.max(0, Math.ceil(this.timeLeft));
        if (sec !== this._lastSecond) {
            this._lastSecond = sec;
            this.bus.emit(EVENTS.LEVEL_TIME, { remaining: sec });
        }
        if (this.timeLeft <= 0) this.loseLife('timeout');
    }
}
