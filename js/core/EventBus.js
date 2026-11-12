/* P1 VALERIA — EventBus

 *   bus.on(EVENTS.GHOST_DEFEATED, (data) => { ... });
 *   bus.emit(EVENTS.GHOST_DEFEATED, { ghost: 'blinky', col: 3, row: 5 });
 */

export class EventBus {
    constructor() {
        this.listeners = new Map();
        // nombreEvento -> Set de funciones
    }

    /** con ON se hace que cuando pase un evento, se ejecute una funcion */
    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        // si un evento no esta en la lista Map, entonces se crea una lista vacia a ese evento
        this.listeners.get(event).add(callback); // se agrega esa funcion a una lista de funciones que se ejecutan cuando pasa ese evento
        return () => this.off(event, callback); // devuelve la funcion que si la llamas se boora de la lista
    }

    /** Suscribirse solo a la próxima vez. */
    once(event, callback) {
        const off = this.on(event, (data) => {
            off();
            callback(data);
        });
        return off;
    }

    // para borrar una funcion de la lista de funciones
    off(event, callback) {
        this.listeners.get(event)?.delete(callback);
    }

    /*Emit es cuando pase ese algo, pase los datos  */
    emit(event, data = {}) {
        const set = this.listeners.get(event);
        if (!set) return;
        // copiamos por si alguien se desuscribe dentro del callback
        for (const cb of [...set]) {
            // esto es en caso de que algo de un compañero falle, el error se muestre en consola
            try {
                cb(data);
            } catch (err) {
                console.error(`[EventBus] Error en listener de "${event}":`, err);
            }
        }
    }

    clear() {
        this.listeners.clear();
    }
}

// Una sola instancia compartida por todo el juego
export const bus = new EventBus();
