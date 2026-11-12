/** Configuración del juego, constantes del juego — P1 VALERIA
 *
 *  Todo lo que sea "un número que quizás queramos ajustar" vive aquí,
 *  así nadie tiene que buscar valores mágicos dentro del código.
 */

export const CONFIG = {
    TILE_SIZE: 1,          // tamaño de una casilla en unidades de Three.js, como no hay especifica puede ser 1 m
    WALL_HEIGHT: 1,        // alto de las paredes, tambien como arriba 

    CAMERA: {
        FOV: 50, // es el angulo vertical de la camara
        HEIGHT: 20,// altura sobre el centro del laberinto
        TILT: 10,  // cuánto se corre hacia abajo
    },

    START_LIVES: 3,
    LEVEL_COMPLETE_DELAY: 2.5, // segundos entre recoger la llave y el siguiente nivel

    //esto se cambia despues con lo de magica Voxel
    COLORS: {
        BACKGROUND: 0x05050f,
        FLOOR: 0x10102a,
        WALL: 0x2233ff,
        KEY: 0xffd700,
        DOOR: 0x8b4513,
        HINT: 0x66ff99,
    },

    // Mientras P2 Laura crea a Pacman y P3 Santiagfo (fantasmas) no estén listos, creo en el  main.js crea un
    // jugador de prueba y teclas para simular eventos.
    DEBUG: true, // Poner en false al integrar.
};

/**
 * Nombres de TODOS los eventos del juego.
 * Voy a usar export const EVENTS, entonces tienen que importarlo como { EVENTS} from este archivop
 * Columna "quién emite → quién escucha" para que los 3 sepamos el contrato.
 */
export const EVENTS = {
    // creo una biblioteca de eventos
    // se cambio el estado del juego
    STATE_CHANGED: 'state:changed',     // GameState → todos     { from, to }

    // Inputs
    INPUT_FIRE: 'input:fire',           // Input lo recibe P2 (EnergyWave)
    INPUT_PAUSE: 'input:pause',         // Input lo recibe  main
    INPUT_START: 'input:start',         // Input lo recibe main

    // --- Niveles ---
    LEVEL_START: 'level:start',         // LevelManager → P3 (aparecer fantasma), P2 (HUD)  { index, level }
    LEVEL_TIME: 'level:time',           // LevelManager → P2 (HUD)  { remaining }
    LEVEL_TIMEOUT: 'level:timeout',     // LevelManager → P2 (HUD)  { index }
    LEVEL_COMPLETE: 'level:complete',   // LevelManager → P2 (Screens)  { index }

    // --- Objetos ---
    POWER_PICKED: 'power:picked',       // LevelManager → P2 (PowerManager activa el poder)  { power, duration }
    FAKE_PICKED: 'item:fake',           // LevelManager → P2 (HUD mensaje)
    HINT_PICKED: 'item:hint',           // LevelManager → P2 (HUD muestra texto)  { text }
    ITEM_RESPAWNED: 'item:respawned',   // LevelManager → P2 (HUD)  { col, row }
    KEY_SPAWNED: 'key:spawned',         // LevelManager → P2 (HUD)  { col, row }
    KEY_COLLECTED: 'key:collected',     // LevelManager → P2 (HUD)  { keys }
    EXIT_OPENED: 'exit:opened',         // LevelManager → P2 (HUD)
    LIVES_CHANGED: 'lives:changed',     // LevelManager → P2 (HUD)  { lives }

    // --- Eventos que P1 ESCUCHA de los demás ---
    PLAYER_TILE: 'player:tile',         // P2 (Pacman) → LevelManager  { col, row }  (cada vez que cambia de casilla)
    PLAYER_HIT: 'player:hit',           // P3 (Collisions) → LevelManager
    PLAYER_RESPAWN: 'player:respawn',   // LevelManager → P2 (Pacman vuelve al inicio)  { col, row }
    POWER_EXPIRED: 'power:expired',     // P2 (PowerManager) → LevelManager  { power }
    GHOST_DEFEATED: 'ghost:defeated',   // P3 (Ghost) → LevelManager  { ghost, col, row }
};
