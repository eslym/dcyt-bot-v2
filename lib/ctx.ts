export declare class ContextKey<T> {}

export class Context {
    #values = new Map<ContextKey<any>, any>();
    #getters = new Map<ContextKey<any>, () => any>();

    get<T>(key: ContextKey<T>): T {
        if (this.#getters.has(key)) {
            return this.#getters.get(key)!();
        }
        return this.#values.get(key);
    }

    set<T>(key: ContextKey<T>, value: T): void {
        this.#values.set(key, value);
    }

    getter<T>(key: ContextKey<T>, getter: () => T): this {
        this.#getters.set(key, getter);
        return this;
    }
}

export function createContext(): Context {
    return new Context();
}

export function ctxKey<T>(): ContextKey<T> {
    return Symbol() as any;
}

export type ContextValue<T> = T extends ContextKey<infer U> ? U : never;
