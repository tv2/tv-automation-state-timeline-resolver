export function fillArray<T>(length: number, mapFn: (index: number) => T): T[]
export function fillArray<T>(length: number, value: T): T[]
export function fillArray<T>(length: number, valueOrMapFn: T | ((index: number) => T)): T[] {
	return valueOrMapFn instanceof Function
		? Array.from({ length }, (_, i) => valueOrMapFn(i))
		: new Array(length).fill(valueOrMapFn)
}

export function fillRecord<T extends string, U>(keys: T[], mapFn: (key: T) => U): Record<T, U>
export function fillRecord<T extends string, U>(keys: T[], value: U): Record<T, U>
export function fillRecord<T extends string, U>(keys: T[], valueOrMapFn: U | ((key: T) => U)): Record<T, U> {
	return keys.reduce((accumulator, key) => {
		accumulator[key] = valueOrMapFn instanceof Function ? valueOrMapFn(key) : valueOrMapFn
		return accumulator
	}, {} as Record<T, U>)
}
