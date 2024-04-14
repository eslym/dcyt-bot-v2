export declare class ContextKey<T> {}

export type Context = {
    get<T>(key: ContextKey<T>): T;
    set<T>(key: ContextKey<T>, value: T): void;
};

export function createContext(): Context {
    return new Map();
}

export function ctxKey<T>(): ContextKey<T> {
    return Symbol() as any;
}

export type ContextValue<T> = T extends ContextKey<infer U> ? U : never;
