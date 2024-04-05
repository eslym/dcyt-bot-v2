let cachedData = new Map<
	string,
	{
		value: any;
		expires: number;
	}
>();

export const cache = {
	async get<T>(key: string, fn: () => T | Promise<T>, ttl = 30000): Promise<T> {
		const cached = cachedData.get(key);
		if (cached && cached.expires > Date.now()) {
			return cached.value;
		}
		const value = await fn();
		cachedData.set(key, { value, expires: Date.now() + ttl });
		return value;
	},
	set(key: string, value: any, ttl = 30000) {
		cachedData.set(key, { value, expires: Date.now() + ttl });
		return this;
	},
	has(key: string) {
		const cached = cachedData.get(key);
		return cached && cached.expires > Date.now();
	},
	clear(key: string) {
		cachedData.delete(key);
		return this;
	},
	invalidate() {
		for (const [key, value] of cachedData.entries()) {
			if (value.expires < Date.now()) {
				cachedData.delete(key);
			}
		}
		return this;
	}
};

export const lock = {
	has(key: string) {
		return cache.has(`$lock:${key}`);
	},
	add(key: string) {
		cache.set(`$lock:${key}`, () => true, 60000);
	},
	delete(key: string) {
		cache.clear(`$lock:${key}`);
	}
};
