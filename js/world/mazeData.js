/* P1 VALERIA — Datos de los laberintos (uno por nivel).
 *
 * Se dibujan con texto para que sea facil de editar ('#' = pared, '2' = pared variante wall2, '3' = wall3, '4' = wall4, '.' = libre).
 * Los cuatro son 21x21, simetricos en vertical y sin callejones sin salida.
 * Coordenadas: col = x (izquierda a derecha), row = z (arriba a abajo).
 *
 * Todos comparten la misma estructura fija, como en el Pac-Man original:
 *   - CASA DE LOS FANTASMAS en el centro (interior cols 8-12, filas 9-11)
 *     con una sola puerta arriba, en (10, 8).
 *   - ZONA DEL JUGADOR debajo de la casa, sobre el eje central.
 *   - PUERTA DE SALIDA en la pared de abajo, en (10, 20). Se abre con las 4 llaves.
 *
 * Asi los fantasmas siempre salen del mismo sitio y el jugador sabe donde
 * reaparece, aunque el laberinto cambie en cada nivel.
 */

/** Blinky — pasillos largos para la embestida. Pasillo recto mas largo: 19 casillas. */
const NIVEL_1 = [
    '#333333#33333#333333#', //  0
    '2.........#.........2', //  1
    '2.#.#.#4#.#.#4#.#.#.2', //  2
    '2.4.....#...#.....4.2', //  3
    '2.4.#.#.2...2.#.#.4.2', //  4
    '#.4.2.4.2...2.4.2.4.#', //  5
    '2.4.2.#.2.#.2.#.2.4.2', //  6
    '2.#.2...#...#...2.#.2', //  7
    '2.4.2.##33.33##.2.4.2', //  8
    '2.4.2.42.....24.2.4.2', //  9
    '2.4.#.42.....24.#.4.2', // 10
    '2.4.2.42.....24.2.4.2', // 11
    '2.#.2.##33333##.2.#.2', // 12
    '2...2.#...#...#.2...2', // 13
    '2.#.2.#.#.#.#.#.2.#.2', // 14
    '#.4.2...........2.#.#', // 15
    '2.4.#.#33#.#33#.#.4.2', // 16
    '2.4...............4.2', // 17
    '2.#44444#...#44444#.2', // 18
    '2...................2', // 19
    '#333333#######333333#', // 20
];

/** Pinky — abierto y lleno de bucles para los clones. Pasillo recto mas largo: 9 casillas. */
const NIVEL_2 = [
    '#####################', //  0
    '#.........#.........#', //  1
    '#.#.#.#.#.#.#.#.#.#.#', //  2
    '#.......#...#.......#', //  3
    '#.###.#.#.#.#.#.###.#', //  4
    '#.....#.#...#.#.....#', //  5
    '#.###.#.#...#.#.###.#', //  6
    '#.#.....#...#.....#.#', //  7
    '#.#.#.####.####.#.#.#', //  8
    '#...#..#.....#..#...#', //  9
    '###.##.#.....#.##.###', // 10
    '#...#..#.....#..#...#', // 11
    '#.#.#.#########.#.#.#', // 12
    '#.#...#.......#...#.#', // 13
    '#.###.#.#####.#.###.#', // 14
    '#.........#.........#', // 15
    '#.##.#.##...##.#.##.#', // 16
    '#.........#.........#', // 17
    '#.#.#.#.#...#.#.#.#.#', // 18
    '#.....#.......#.....#', // 19
    '#####################', // 20
];

/** Inky — lineas de vision largas para los proyectiles. Pasillo recto mas largo: 13 casillas. */
const NIVEL_3 = [
    '#####################', //  0
    '#.........#.........#', //  1
    '#.#####.#.#.#.#####.#', //  2
    '#.......#.#.#.......#', //  3
    '#.#######.#.#######.#', //  4
    '#.......#.#.#.......#', //  5
    '###.#.#.#...#.#.#.###', //  6
    '#.......#...#.......#', //  7
    '#.########.########.#', //  8
    '#......#.....#......#', //  9
    '#.##.#.#.....#.#.##.#', // 10
    '#......#.....#......#', // 11
    '#.#.#.#########.#.#.#', // 12
    '#.#.#.....#.....#.#.#', // 13
    '#.#.#.#.#.#.#.#.#.#.#', // 14
    '#.........#.........#', // 15
    '#.###.#.#.#.#.#.###.#', // 16
    '#.....#.#...#.#.....#', // 17
    '#.###.#.#...#.#.###.#', // 18
    '#.....#.......#.....#', // 19
    '#####################', // 20
];

/** Clyde — retorcido, sin rectas largas. Pasillo recto mas largo: 9 casillas. */
const NIVEL_4 = [
    '#####################', //  0
    '#.........#.........#', //  1
    '#.#.#####...#####.#.#', //  2
    '#...#.....#.....#...#', //  3
    '#.#.#.#########.#.#.#', //  4
    '#.#.#.....#.....#.#.#', //  5
    '#.#.###.#...#.###.#.#', //  6
    '#...#...#...#...#...#', //  7
    '##.##.####.####.##.##', //  8
    '#...#.##.....##.#...#', //  9
    '#.#.#.##.....##.#.#.#', // 10
    '#.....##.....##.....#', // 11
    '#.###.#########.###.#', // 12
    '#...#...#...#...#...#', // 13
    '###.###.#...#.###.###', // 14
    '#...#...#.#.#...#...#', // 15
    '#.#.#.#.#.#.#.#.#.#.#', // 16
    '#.#.#.#.......#.#.#.#', // 17
    '#.#.#.#.##.##.#.#.#.#', // 18
    '#.....#.......#.....#', // 19
    '#####################', // 20
];

/* ------------------------------------------------------------------ zonas fijas */

/** Casa de los fantasmas: igual en los cuatro mapas. */
export const GHOST_HOUSE = Object.freeze({
    inside: { col0: 8, col1: 12, row0: 9, row1: 11 },  // interior transitable
    door: { col: 10, row: 8 },                          // unica salida, arriba
    outside: { col: 10, row: 7 },                       // casilla justo encima de la puerta
});

/** Donde aparece cada fantasma. Niveles 1-4 usan 'solo'; el nivel 5, los cuatro. */
export const GHOST_SPAWNS = Object.freeze({
    solo: { col: 10, row: 10 },                 // centro de la casa
    blinky: { col: 10, row: 7 },                // fuera, encima de la puerta (como el original)
    pinky: { col: 9, row: 10 },
    inky: { col: 10, row: 10 },
    clyde: { col: 11, row: 10 },
});

/** Puerta de salida: esta EN la pared de abajo. Se abre con las 4 llaves. */
export const EXIT_TILE = Object.freeze({ col: 10, row: 20 });

/* ------------------------------------------------------------------- los mapas */

const toMatrix = (layout) => layout.map((row) => [...row].map((c) => (c === '#' ? 1 : c === '2' ? 2 : c === '3' ? 3 : c === '4' ? 4 : 0)));

/**
 * Un mapa por nivel. LevelManager usa LEVEL_MAPS[index].
 *   matrix      -> lo que recibe el constructor de Maze
 *   playerStart -> donde empieza Pacman y adonde vuelve al perder una vida
 */
export const LEVEL_MAPS = [
    {
        id: 1,
        ghost: 'blinky',
        matrix: toMatrix(NIVEL_1),
        playerStart: { col: 10, row: 16 },
    },
    {
        id: 2,
        ghost: 'pinky',
        matrix: toMatrix(NIVEL_2),
        playerStart: { col: 10, row: 16 },
    },
    {
        id: 3,
        ghost: 'inky',
        matrix: toMatrix(NIVEL_3),
        playerStart: { col: 10, row: 17 },
    },
    {
        id: 4,
        ghost: 'clyde',
        matrix: toMatrix(NIVEL_4),
        playerStart: { col: 10, row: 17 },
    },
];

/** El mapa de un nivel (si el indice se sale, devuelve el primero). */
export function mapForLevel(index) {
    return LEVEL_MAPS[index] ?? LEVEL_MAPS[0];
}

/* --- Compatibilidad: lo que ya importan main.js y LevelManager (mapa del nivel 1) --- */
export const MAZE = LEVEL_MAPS[0].matrix;
export const PLAYER_START = LEVEL_MAPS[0].playerStart;