/** Minimal typed event bus. Events fire on gameplay moments, not per frame. */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private map = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, fn: Listener<Events[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => set?.delete(fn as Listener<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) (fn as Listener<Events[K]>)(payload);
  }

  clear(): void {
    this.map.clear();
  }
}
