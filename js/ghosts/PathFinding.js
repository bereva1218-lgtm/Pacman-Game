/* P3 — BFS en la grilla para perseguir una casilla objetivo.
 *
 * Es el cerebro de movimiento de los cuatro fantasmas. Ninguno decide "giro a
 * la derecha": todos dicen a qué casilla quieren llegar (getTargetTile) y este
 * archivo calcula el primer paso del camino más corto.
 *
 * Se usa BFS y no A* a propósito: el laberinto es de 21x21, apenas 440
 * casillas, así que la diferencia de velocidad no se nota y BFS garantiza el
 * camino más corto sin heurística que ajustar. Además, en una grilla donde
 * todos los pasos cuestan lo mismo, BFS ya ES el óptimo.
 *
 * CÓMO ESTÁ ORGANIZADO EL ARCHIVO
 *   1. bfsPath: el camino completo
 *   2. bfsNextStep: solo el primer paso, que es lo que usan los fantasmas
 *   3. distancia2 y lineaDeVision: ayudas sueltas
 *
 * Usa de Maze.js:  maze.isWalkable(col,row) · maze.neighbors(col,row) · maze.cols/rows
 */

const key = (col, row) => col + ',' + row;

/* ---------------------------------------------------------------------
 * ------------------------ EL CAMINO COMPLETO -------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Una búsqueda en anchura de toda la vida. Se parte de la casilla del
 * fantasma y se van visitando las vecinas por capas: primero las que están a
 * un paso, luego a dos, y así. Como se explora por capas, la primera vez que
 * se toca el objetivo es por el camino más corto que existe. Después se
 * reconstruye ese camino hacia atrás.
 *
 * QUÉ USA
 * - La cola es un array normal con un índice 'head' en vez de un shift().
 *   shift() reordena el array entero en cada llamada; moviendo solo el índice
 *   la cola es O(1) por elemento. Con cientos de casillas por frame y cuatro
 *   fantasmas, eso importa.
 * - 'visited' es un Set y 'cameFrom' un Map, los dos con la clave "col,row"
 *   que genera key(). Hace falta una clave de texto porque dos objetos
 *   {col,row} con los mismos números NO son iguales para un Set.
 * - Se marca como visitada al METER en la cola, no al sacar. Si se hiciera al
 *   sacar, la misma casilla entraría varias veces por caminos distintos.
 * - La reconstrucción va del objetivo hacia atrás con cameFrom y unshift(),
 *   que mete al principio: por eso el array sale ya en el orden correcto.
 * - El camino NO incluye la casilla de partida: empieza en la siguiente. Eso
 *   es lo que permite que bfsNextStep() haga path[0] directamente.
 * - Los tres if del principio cortan los casos imposibles antes de montar
 *   nada: sin datos, ya estamos ahí, o el objetivo es una pared.
 * ------------------------------------------------------------------- */

/**
 * Camino más corto entre dos casillas.
 * @returns {{col:number,row:number}[]} desde la siguiente casilla hasta el objetivo ([] si no hay camino)
 */
export function bfsPath(maze, start, goal) {
    if (!start || !goal) return [];
    if (start.col === goal.col && start.row === goal.row) return [];
    if (!maze.isWalkable(goal.col, goal.row)) return [];

    const visited = new Set([key(start.col, start.row)]);
    const cameFrom = new Map();
    const queue = [start];
    let head = 0;

    while (head < queue.length) {
        const current = queue[head++];

        if (current.col === goal.col && current.row === goal.row) {
            const path = [];
            let node = current;
            while (cameFrom.has(key(node.col, node.row))) {
                path.unshift(node);
                node = cameFrom.get(key(node.col, node.row));
            }
            return path;
        }

        for (const n of maze.neighbors(current.col, current.row)) {
            const k = key(n.col, n.row);
            if (visited.has(k)) continue;
            visited.add(k);
            cameFrom.set(k, current);
            queue.push(n);
        }
    }
    return [];
}

/* ---------------------------------------------------------------------
 * --------------------- SOLO EL SIGUIENTE PASO ------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Es lo que llaman de verdad los fantasmas. Pide el camino completo pero solo
 * devuelve la primera casilla, porque el objetivo se mueve y recalcular en
 * cada cruce sale mejor que seguir una ruta vieja. Encima añade la regla del
 * Pac-Man original: un fantasma no se da media vuelta en mitad de un pasillo.
 * Si el BFS quiere devolverlo por donde vino, se busca la mejor alternativa.
 *
 * QUÉ USA
 * - Lo llama Ghost.pickNextTile() cada vez que un fantasma llega al centro de
 *   una casilla, NO cada frame. Entre casilla y casilla solo se interpola.
 * - 'forbidden' es la casilla de la que viene. Si la única salida es esa
 *   (vecinos.length <= 1, un callejón sin salida), se permite devolverse: si
 *   no, el fantasma se quedaría atascado para siempre. Por eso los mapas
 *   generados no tienen callejones, pero la salvaguarda está igual.
 * - Cuando hay que desviarse, se ordenan las alternativas con sort() por
 *   distancia2 al objetivo y se coge la primera: la que más acerca.
 * - Si bfsPath devuelve vacío (objetivo encerrado, o pared), no se queda
 *   quieto: elige un vecino al azar. Un fantasma parado se ve como un bug,
 *   uno que deambula parece que está buscando.
 * ------------------------------------------------------------------- */

/**
 * Solo la siguiente casilla. Es lo que pide Ghost.js en cada cruce, así no
 * recalculamos la ruta completa cada frame.
 * @param forbidden casilla de la que viene: evita que se devuelva sobre sus pasos
 */
export function bfsNextStep(maze, start, goal, forbidden = null) {
    const vecinos = maze.neighbors(start.col, start.row);
    if (vecinos.length === 0) return null;

    const esProhibida = (t) => forbidden && t.col === forbidden.col && t.row === forbidden.row;

    const path = bfsPath(maze, start, goal);
    if (path.length > 0) {
        const next = path[0];
        if (!esProhibida(next) || vecinos.length <= 1) return next;

        // No devolverse: la mejor alternativa que acerque al objetivo
        const otras = vecinos.filter((t) => !esProhibida(t));
        if (otras.length === 0) return next;
        otras.sort((a, b) => distancia2(a, goal) - distancia2(b, goal));
        return otras[0];
    }

    // Sin camino (objetivo encerrado o es pared): moverse a cualquier lado válido
    const libres = vecinos.filter((t) => !esProhibida(t));
    const opciones = libres.length > 0 ? libres : vecinos;
    return opciones[Math.floor(Math.random() * opciones.length)];
}

/* ---------------------------------------------------------------------
 * -------------------------- AYUDAS SUELTAS ---------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONAN
 * distancia2 da la distancia al cuadrado entre dos casillas. No se saca la
 * raíz porque solo se usa para COMPARAR cuál está más cerca, y la raíz no
 * cambia el orden: si a² < b², entonces a < b. Ahorra el Math.sqrt en algo
 * que se llama muchas veces por frame.
 *
 * lineaDeVision responde si dos casillas se ven en línea recta sin paredes en
 * medio. Es lo que decide la embestida de Blinky y el disparo de Inky.
 *
 * QUÉ USAN
 * - distancia2 la usa bfsNextStep() para ordenar las alternativas, y los
 *   fantasmas para comparaciones rápidas. Para distancias reales en casillas
 *   se usa maze.distance() de P1, que es la de Manhattan.
 * - lineaDeVision empieza descartando lo barato: si no comparten ni fila ni
 *   columna, no hay línea y se sale sin recorrer nada.
 * - Math.sign() da la dirección unitaria (-1, 0 o 1) sin tener que saber
 *   cuál es mayor.
 * - El for va de 1 a pasos-1: NO mira la casilla de partida ni la del
 *   objetivo, solo lo que hay en medio. Mirar el destino rompería el disparo
 *   de Inky, porque ahí está Pac-Man.
 * - maxCasillas es el alcance: por eso Blinky no embiste de punta a punta del
 *   mapa aunque el pasillo esté despejado.
 * - Devuelve la dirección en vez de true/false porque quien la llama la
 *   necesita para moverse o disparar hacia allá.
 * ------------------------------------------------------------------- */

/** Distancia al cuadrado — solo para comparar, no hace falta la raíz */
export function distancia2(a, b) {
    const dc = a.col - b.col;
    const dr = a.row - b.row;
    return dc * dc + dr * dr;
}

/**
 * ¿Hay línea recta despejada entre dos casillas? La usa la embestida de Blinky.
 * @returns {null|{col:number,row:number}} dirección unitaria, o null si no hay línea
 */
export function lineaDeVision(maze, desde, hasta, maxCasillas = Infinity) {
    if (desde.col !== hasta.col && desde.row !== hasta.row) return null;

    const dCol = Math.sign(hasta.col - desde.col);
    const dRow = Math.sign(hasta.row - desde.row);
    if (dCol === 0 && dRow === 0) return null;

    const pasos = Math.abs(hasta.col - desde.col) + Math.abs(hasta.row - desde.row);
    if (pasos > maxCasillas) return null;

    for (let i = 1; i < pasos; i++) {
        if (!maze.isWalkable(desde.col + dCol * i, desde.row + dRow * i)) return null;
    }
    return { col: dCol, row: dRow };
}