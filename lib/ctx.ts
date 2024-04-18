export declare class ContextKey<T> {}

type MapValues<T extends ContextKey<any>[]> = T['length'] extends 0
    ? []
    : T['length'] extends 1
      ? [ContextValue<T[0]>]
      : T extends [ContextKey<infer U>, ...infer R extends ContextKey<any>[]]
        ? [U, ...MapValues<R>]
        : never;

export interface Context {
    get<T>(key: ContextKey<T>): T;
    set<T>(key: ContextKey<T>, value: T): this;
}

export class Context extends Map {
    getAll<T extends ContextKey<any>[]>(...keys: T): MapValues<T> {
        return keys.map((key) => this.get(key)) as any;
    }
}

export function ctxKey<T>(): ContextKey<T> {
    return Symbol() as any;
}

export type ContextValue<T> = T extends ContextKey<infer U> ? U : never;
