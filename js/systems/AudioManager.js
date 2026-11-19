/* AudioManager — todo el sonido del juego.
 *
 * Los archivos viven en  audio/<nombre>.mp3  (también acepta .ogg y .wav).
 * La lista completa de nombres está en audio/LEEME.md y en SOUNDS (abajo).
 *
 * Ningún otro archivo del juego llama al audio: este sistema ESCUCHA el bus
 * (igual que HUD y Screens), así que para añadir un sonido nuevo basta con:
 *   1. ponerlo en SOUNDS,
 *   2. enlazarlo a un evento en EVENT_SOUNDS (o llamar audio.play('nombre')).
 *
 * Si un archivo no existe, simplemente no suena (como los placeholders del AssetLoader):
 * puedes ir añadiendo audios poco a poco sin romper nada.
 *
 * Los navegadores bloquean el audio hasta que el jugador toca una tecla o hace clic,
 * así que la música del menú arranca en cuanto se pulsa la primera tecla.
 *
 * Teclas:  M = silenciar / activar sonido
 *
 * Uso por código:
 *   audio.play('pickup_key');
 *   audio.playMusic('music_boss');
 *   audio.setVolume('music', 0.4);   // 'master' | 'music' | 'sfx'  (0 a 1)
 */
import { EVENTS } from '../config.js';
import { STATES } from '../core/GameState.js';

const DIR = 'audio';
const EXTENSIONS = ['mp3', 'ogg', 'wav'];
const STORAGE_KEY = 'pacman-audio';

/**
 * Catálogo. vol = volumen base (0-1), cd = segundos mínimos entre dos repeticiones,
 * vary = variación aleatoria de tono (0.05 = ±5 %), music = se repite en bucle.
 */
export const SOUNDS = {
    // --- Música (bucle) ---
    music_menu: { music: true, vol: 0.7 },
    music_level1: { music: true, vol: 0.6 },   // Blinky
    music_level2: { music: true, vol: 0.6 },   // Pinky
    music_level3: { music: true, vol: 0.6 },   // Inky
    music_level4: { music: true, vol: 0.6 },   // Clyde
    music_boss: { music: true, vol: 0.7 },     // nivel 5: jefe final

    // --- Pantallas / jingles ---
    ui_click: { vol: 0.8 },                      // empezar, pausar y reanudar
    jingle_level_complete: { vol: 0.9 },
    jingle_game_over: { vol: 0.9 },
    jingle_win: { vol: 0.9 },

    // --- Jugador ---
    player_step: { vol: 0.35, cd: 0.12, vary: 0.06 },
    player_hit: { vol: 1 },
    player_respawn: { vol: 0.8, cd: 0.5 },
    player_fire: { vol: 0.8, vary: 0.04 },       // onda de energía (poder del nivel 4)

    // --- Objetos y poderes ---
    pickup_power: { vol: 0.9 },                  // objeto real (el mismo sonido para los 4 poderes)
    pickup_superball: { vol: 0.9 },              // nivel 5: súper bola del jefe
    pickup_fake: { vol: 0.9 },                   // objeto falso (¡trampa!)
    pickup_hint: { vol: 0.8 },
    pickup_key: { vol: 0.9 },
    key_spawn: { vol: 0.8 },                     // aparece la llave al vencer al fantasma
    item_respawn: { vol: 0.5 },
    power_expire: { vol: 0.7 },
    shield_block: { vol: 0.9, cd: 0.3 },
    exit_open: { vol: 1 },

    // --- Tiempo ---
    timer_tick: { vol: 0.6 },                    // cada segundo en los últimos 10
    timer_timeout: { vol: 0.9 },

    // --- Fantasmas ---
    ghost_spawn: { vol: 0.8 },
    ghost_warn: { vol: 0.8, cd: 0.3 },           // aviso antes de un ataque especial
    ghost_hit: { vol: 0.9, cd: 0.1 },
    ghost_immune: { vol: 0.6, cd: 0.3 },         // el golpe no le hace nada
    ghost_defeated: { vol: 1 },
    ghost_locked: { vol: 0.9 },                  // encerrado con su súper bola
    blinky_dash: { vol: 0.9 },
    pinky_clone: { vol: 0.8, cd: 0.2, vary: 0.08 },
    inky_teleport: { vol: 0.9 },
    inky_shoot: { vol: 0.8, cd: 0.1 },
    clyde_swap: { vol: 0.9 },
    projectile_blocked: { vol: 0.6, cd: 0.1 },

    // --- Jefe final ---
    boss_fusion: { vol: 1 },
    boss_phase2: { vol: 1 },
    boss_attack: { vol: 0.9 },
    boss_ring: { vol: 0.8, cd: 0.2 },            // el suelo se encoge
    boss_superball: { vol: 0.9 },
    boss_ball_spawn: { vol: 0.8 },
    boss_hit: { vol: 1, cd: 0.1 },
    boss_defeated: { vol: 1 },
};

/** evento del bus → sonido. (Los casos con lógica propia están en _bind.) */
const EVENT_SOUNDS = {
    [EVENTS.FAKE_PICKED]: 'pickup_fake',
    [EVENTS.HINT_PICKED]: 'pickup_hint',
    [EVENTS.KEY_SPAWNED]: 'key_spawn',
    [EVENTS.EXIT_OPENED]: 'exit_open',
    [EVENTS.ITEM_RESPAWNED]: 'item_respawn',
    [EVENTS.LEVEL_COMPLETE]: 'jingle_level_complete',
    [EVENTS.LEVEL_TIMEOUT]: 'timer_timeout',
    [EVENTS.PLAYER_HIT]: 'player_hit',
    [EVENTS.PLAYER_RESPAWN]: 'player_respawn',
    [EVENTS.GHOST_DEFEATED]: 'ghost_defeated',
    'ghosts:ready': 'ghost_spawn',
    'ghost:warn': 'ghost_warn',
    'ghost:hit': 'ghost_hit',
    'ghost:immune': 'ghost_immune',
    'ghost:locked': 'ghost_locked',
    'shield:blocked': 'shield_block',
    'projectile:blocked': 'projectile_blocked',
    'blinky:dash': 'blinky_dash',
    'pinky:clone': 'pinky_clone',
    'inky:teleport': 'inky_teleport',
    'inky:shoot': 'inky_shoot',
    'clyde:swap': 'clyde_swap',
    'boss:fusion': 'boss_fusion',
    'boss:etapa2': 'boss_phase2',
    'boss:ataque': 'boss_attack',
    'boss:anillo': 'boss_ring',
    'boss:superbola': 'boss_superball',
    'boss:ballSpawned': 'boss_ball_spawn',
    'boss:ballCollected': 'pickup_superball',
    'boss:golpe': 'boss_hit',
    'boss:derrotado': 'boss_defeated',
};

export class AudioManager {
    /**
     * @param {{bus, gameState, powers?}} ctx   powers es opcional (para el sonido de la onda)
     */
    constructor({ bus, gameState, powers = null }) {
        this.bus = bus;
        this.gameState = gameState;
        this.powers = powers;

        const AC = window.AudioContext ?? window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.ctx.destination);

        this.volumes = { master: 0.8, music: 0.6, sfx: 1, muted: false, ...this._readSettings() };
        this._applyVolumes();

        this.buffers = new Map();
        this.lastPlayed = new Map();
        this.music = null;            // { name, source, gain }
        this.wantedMusic = null;
        this.ducked = false;

        this._bind();
        this._unlockOnGesture();
    }

    // ------------------------------------------------------------ carga

    /** Descarga y decodifica todos los audios que existan. No bloquea el juego. */
    async loadAll() {
        const missing = [];
        await Promise.all(Object.keys(SOUNDS).map(async (name) => {
            const buffer = await this._loadOne(name);
            if (buffer) this.buffers.set(name, buffer);
            else missing.push(name);
        }));
        if (missing.length) {
            console.info(`[Audio] Sin archivo (silencio): ${missing.sort().join(', ')}`);
        }
        this._syncMusic();
    }

    async _loadOne(name) {
        for (const ext of EXTENSIONS) {
            try {
                const res = await fetch(`${DIR}/${name}.${ext}`);
                if (!res.ok) continue;
                return await this.ctx.decodeAudioData(await res.arrayBuffer());
            } catch { /* probamos con la siguiente extensión */ }
        }
        return null;
    }

    // ------------------------------------------------------------ reproducir

    /** Efecto de sonido. opts: { vol, rate } multiplican el valor del catálogo. */
    play(name, { vol = 1, rate = 1 } = {}) {
        const def = SOUNDS[name];
        const buffer = this.buffers.get(name);
        if (!def || !buffer || this.ctx.state !== 'running') return;

        const now = this.ctx.currentTime;
        if (def.cd && now - (this.lastPlayed.get(name) ?? -Infinity) < def.cd) return;
        this.lastPlayed.set(name, now);

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * (def.vary ?? 0));
        const gain = this.ctx.createGain();
        gain.gain.value = (def.vol ?? 1) * vol;
        source.connect(gain).connect(this.sfxBus);
        source.start();
    }

    /** Cambia de música con fundido. Si ya suena esa, no hace nada. */
    playMusic(name) {
        this.wantedMusic = name;
        this._syncMusic();
    }

    stopMusic() {
        this.wantedMusic = null;
        this._syncMusic();
    }

    _syncMusic(fade = 0.6) {
        if (this.ctx.state !== 'running') return;                  // se reintenta al desbloquear
        const want = this.wantedMusic;
        if ((this.music?.name ?? null) === want) return;

        const t = this.ctx.currentTime;
        if (this.music) {
            const old = this.music;
            old.gain.gain.cancelScheduledValues(t);
            old.gain.gain.setValueAtTime(old.gain.gain.value, t);
            old.gain.gain.linearRampToValueAtTime(0, t + fade);
            old.source.stop(t + fade + 0.05);
            this.music = null;
        }
        if (!want || !this.buffers.has(want)) return;

        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers.get(want);
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(SOUNDS[want].vol ?? 1, t + fade);
        source.connect(gain).connect(this.musicBus);
        source.start();
        this.music = { name: want, source, gain };
    }

    // ------------------------------------------------------------ volumen

    setVolume(which, value) {
        this.volumes[which] = Math.min(1, Math.max(0, value));
        this._applyVolumes();
        this._saveSettings();
    }

    toggleMute() {
        this.volumes.muted = !this.volumes.muted;
        this._applyVolumes();
        this._saveSettings();
    }

    _applyVolumes() {
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.03);
        this.musicBus.gain.setTargetAtTime(this.volumes.music * (this.ducked ? 0.3 : 1), t, 0.15);
        this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.03);
    }

    _readSettings() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { return {}; }
    }

    _saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes)); } catch { /* sin storage */ }
    }

    // ------------------------------------------------------------ eventos

    _bind() {
        const { bus, gameState } = this;

        // Sonidos directos: un evento → un sonido
        for (const [event, sound] of Object.entries(EVENT_SOUNDS)) {
            bus.on(event, () => this.play(sound));
        }

        // Música según el nivel (el jefe cambia la música al fusionarse los fantasmas)
        bus.on(EVENTS.LEVEL_START, ({ index }) => {
            this.playMusic(`music_level${Math.min(index + 1, 4)}`);
        });
        bus.on('boss:fusion', () => this.playMusic('music_boss'));

        // Cambios de pantalla
        bus.on(EVENTS.STATE_CHANGED, ({ from, to }) => {
            this.ducked = to === STATES.PAUSED;
            this._applyVolumes();

            if (to === STATES.PAUSED) this.play('ui_click');
            else if (from === STATES.PAUSED && to === STATES.PLAYING) this.play('ui_click');
            else if (to === STATES.MENU) this.playMusic('music_menu');
            else if (to === STATES.GAME_OVER) { this.stopMusic(); this.play('jingle_game_over'); }
            else if (to === STATES.WIN) { this.stopMusic(); this.play('jingle_win'); }
            else if (from === STATES.MENU && to === STATES.PLAYING) this.play('ui_click');
        });

        // Objeto real recogido (la súper bola suena aparte, con boss:ballCollected)
        bus.on(EVENTS.POWER_PICKED, ({ power }) => {
            if (!power.startsWith('superball_')) this.play('pickup_power');
        });
        bus.on(EVENTS.POWER_EXPIRED, ({ power }) => {
            if (!power?.startsWith('superball_')) this.play('power_expire');
        });

        // Llave: KEY_COLLECTED también se emite con keys = 0 al empezar la partida
        bus.on(EVENTS.KEY_COLLECTED, ({ keys }) => { if (keys > 0) this.play('pickup_key'); });

        // Reloj: tic en los últimos 10 segundos
        bus.on(EVENTS.LEVEL_TIME, ({ remaining }) => { if (remaining <= 10 && remaining > 0) this.play('timer_tick'); });

        // Pasos (solo jugando) y onda de energía (solo con el poder del nivel 4)
        bus.on(EVENTS.PLAYER_TILE, () => { if (gameState.is(STATES.PLAYING)) this.play('player_step'); });
        bus.on(EVENTS.INPUT_FIRE, () => {
            if (gameState.is(STATES.PLAYING) && this.powers?.has('energy')) this.play('player_fire');
        });

        // M = silenciar
        window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) this.toggleMute(); });
    }

    /** Los navegadores no dejan sonar nada hasta el primer gesto del jugador. */
    _unlockOnGesture() {
        const unlock = async () => {
            await this.ctx.resume();
            if (this.ctx.state !== 'running') return;
            window.removeEventListener('keydown', unlock);
            window.removeEventListener('pointerdown', unlock);
            if (!this.wantedMusic && this.gameState.is(STATES.MENU)) this.wantedMusic = 'music_menu';
            this._syncMusic();
        };
        window.addEventListener('keydown', unlock);
        window.addEventListener('pointerdown', unlock);
    }
}
