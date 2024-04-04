let cachedData = new Map<
	string,
	{
		value: any;
		expires: number;
	}
>();

export const cache = {
	get<T>(key: string, fn: () => T, ttl = 30000): T {
		const cached = cachedData.get(key);
		if (cached && cached.expires > Date.now()) {
			return cached.value;
		}
		const value = fn();
		cachedData.set(key, { value, expires: Date.now() + ttl });
		return value;
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
