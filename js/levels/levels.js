/* P1 VALERIA — Configuración de los 4 niveles 

 *   ghost         → nombre que usa P3 para crear el fantasma (EVENTS.LEVEL_START)
 *   ghostHits     → resistencia (P3 la lee de level.ghostHits)
 *   power         → id del poder; P2 lo recibe en EVENTS.POWER_PICKED { power, duration }
 *   powerDuration → segundos que dura el poder
 *   timeLimit     → segundos para encontrar el objeto y vencer al fantasma
 *   itemSpawns    → posibles casillas del objeto REAL (se elige una al azar; si el poder
 *                   se acaba sin vencer al fantasma, reaparece en OTRA de la lista)
 *   fakeCount     → cuántos objetos falsos aparecen
 *   hintCount     → cuántas pistas aparecen
 *   ghostSpawn    → dónde aparece el fantasma
 *   tip           → texto de pista sobre cómo vencer al fantasma
 */
export const LEVELS = [
    {
        id: 1,
        name: 'Nivel 1 — Velocidad',
        ghost: 'blinky',
        ghostHits: 1,
        power: 'speed',
        powerLabel: 'Poción de velocidad',
        powerDuration: 8,
        timeLimit: 90,
        itemSpawns: [{ col: 1, row: 1 }, { col: 19, row: 1 }, { col: 5, row: 5 }, { col: 15, row: 5 }],
        fakeCount: 1,
        hintCount: 2,
        ghostSpawn: { col: 10, row: 3 },
        tip: 'Con la poción eres más rápido que él: ¡alcánzalo!',
    },
    {
        id: 2,
        name: 'Nivel 2 — Invisibilidad',
        ghost: 'pinky',
        ghostHits: 2,
        power: 'invisibility',
        powerLabel: 'Estrella de invisibilidad',
        powerDuration: 8,
        timeLimit: 100,
        itemSpawns: [{ col: 1, row: 19 }, { col: 19, row: 19 }, { col: 3, row: 13 }, { col: 17, row: 13 }],
        fakeCount: 2,
        hintCount: 2,
        ghostSpawn: { col: 1, row: 7 },
        tip: 'Invisible, ella no te persigue. Acércate por detrás.',
    },
    {
        id: 3,
        name: 'Nivel 3 — Escudo',
        ghost: 'inky',
        ghostHits: 3,
        power: 'shield',
        powerLabel: 'Cristal protector',
        powerDuration: 10,
        timeLimit: 110,
        itemSpawns: [{ col: 1, row: 7 }, { col: 19, row: 7 }, { col: 7, row: 17 }, { col: 13, row: 17 }],
        fakeCount: 3,
        hintCount: 2,
        ghostSpawn: { col: 19, row: 15 },
        tip: 'El escudo bloquea sus proyectiles. Atácalo mientras dure.',
    },
    {
        id: 4,
        name: 'Nivel 4 — Energía',
        ghost: 'clyde',
        ghostHits: 4,
        power: 'energy',
        powerLabel: 'Esfera de energía',
        powerDuration: 12,
        timeLimit: 120,
        itemSpawns: [{ col: 1, row: 11 }, { col: 19, row: 11 }, { col: 9, row: 1 }, { col: 3, row: 19 }],
        fakeCount: 4,
        hintCount: 1,
        ghostSpawn: { col: 10, row: 15 },
        tip: 'Dispara ondas con ESPACIO. Necesitas 4 impactos.',
    },
];

/** Segundos para llegar a la puerta después de conseguir la 4.ª llave. */
export const ESCAPE_TIME = 30;
