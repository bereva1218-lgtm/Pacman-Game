/* P1 VALERIA — Datos del laberinto.
 *
 * Se dibuja con texto para que sea fácil de editar ('#' = pared, '.' = libre)
 * Laberinto propio de 21 × 21, simétrico y sin callejones sin salida.
 * Coordenadas: col = x (izquierda a derecha), row = z (arriba a abajo).
 */

const LAYOUT = [
    '#####################', //  0
    '#.........#.........#', //  1
    '#.###.###.#.###.###.#', //  2
    '#.#...............#.#', //  3
    '#.#.#.#########.#.#.#', //  4
    '#...#.....#.....#...#', //  5
    '###.#####...#####.###', //  6
    '#.........#.........#', //  7
    '#.###.#.#####.#.###.#', //  8
    '#...#.#.......#.#...#', //  9
    '###.#.###.#.###.#.###', // 10
    '#.....#.......#.....#', // 11
    '#.###.#.#####.#.###.#', // 12
    '#.#.......#.......#.#', // 13
    '#.#.#####...#####.#.#', // 14
    '#...#...........#...#', // 15
    '###.#.#########.#.###', // 16
    '#.....#...#...#.....#', // 17
    '#.###.#.#.#.#.#.###.#', // 18
    '#...................#', // 19
    '#####################', // 20
];

export const MAZE = LAYOUT.map((row) => [...row].map((c) => (c === '#' ? 1 : 0)));

/** Dónde empieza Pacman (y adonde vuelve al perder una vida). */
export const PLAYER_START = { col: 10, row: 11 };

/** Puerta de salida: está EN la pared de abajo. Se abre con las 4 llaves. */
export const EXIT_TILE = { col: 10, row: 20 };
