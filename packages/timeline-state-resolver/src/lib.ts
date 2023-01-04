import {
	Datastore,
	Timeline,
	TimelineDatastoreReferencesContent,
	TSRTimelineContent,
	ITranslatableMessage,
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'

/**
 * getDiff is the reverse of underscore:s _.isEqual(): It compares two values and if they differ it returns an explanation of the difference
 * If the values are equal: return null
 * @param a
 * @param b
 */
export function getDiff(a: any, b: any): string | null {
	return diff(a, b)
}

/*
Note: the diff functions are based upon the underscore _.isEqual functions in
https://github.com/jashkenas/underscore/blob/master/underscore.js
*/
function diff(a?: any, b?: any, aStack?: any, bStack?: any): string | null {
	// Identical objects are equal. `0 === -0`, but they aren't identical.
	// See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
	if (a === b) {
		if (!(a !== 0 || 1 / a === 1 / b)) {
			return `not identical (${a}, ${b})`
		} else return null
	}
	// `null` or `undefined` only equal to itself (strict comparison).
	if (a == null) {
		return `First value is null/undefined (${a}, ${b})`
	}
	if (b == null) {
		return `Second value is null/undefined (${a}, ${b})`
	}
	// `NaN`s are equivalent, but non-reflexive.
	if (a !== a) {
		if (b !== b) {
			return null
		} else return `first value is NaN, but second value isn't (${a}, ${b})`
	}
	// Exhaust primitive checks
	const type = typeof a
	if (type !== 'function' && type !== 'object' && typeof b !== 'object') {
		return `${a}, ${b}`
	}
	return deepDiff(a, b, aStack, bStack)
}

const ObjProto = Object.prototype
const SymbolProto = typeof Symbol !== 'undefined' ? Symbol.prototype : null

// Internal recursive comparison function for `getDiff`.
function deepDiff(a: any, b: any, aStack: any, bStack: any): string | null {
	// Unwrap any wrapped objects.
	if (a instanceof _) a = (a as any)._wrapped
	if (b instanceof _) b = (b as any)._wrapped
	// Compare `[[Class]]` names.
	const aClassName = ObjProto.toString.call(a)
	const bClassName = ObjProto.toString.call(b)
	if (aClassName !== bClassName) {
		return `ClassName differ (${aClassName}, ${bClassName})`
	}
	switch (aClassName) {
		// Strings, numbers, regular expressions, dates, and booleans are compared by value.
		case '[object RegExp]':
		// RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
		// eslint-disable-next-line no-fallthrough
		case '[object String]':
			// Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
			// equivalent to `new String("5")`.
			if ('' + a !== '' + b) {
				return `Primitives (${a}, ${b})`
			} else return null
		case '[object Number]':
			// `NaN`s are equivalent, but non-reflexive.
			// Object(NaN) is equivalent to NaN.
			if (+a !== +a) {
				if (+b === +b) {
					return `Object(NaN) (${a}, ${b})`
				} else return null
			}
			// An `egal` comparison is performed for other numeric values.
			if (!(+a === 0 ? 1 / +a === 1 / b : +a === +b)) {
				return `Numeric (${a}, ${b})`
			} else return null
		case '[object Date]':
		case '[object Boolean]':
			// Coerce dates and booleans to numeric primitive values. Dates are compared by their
			// millisecond representations. Note that invalid dates with millisecond representations
			// of `NaN` are not equivalent.
			if (+a !== +b) {
				return `Numeric representations (${a}, ${b})`
			} else return null
		case '[object Symbol]': {
			const aSymbol = SymbolProto!.valueOf.call(a)
			const bSymbol = SymbolProto!.valueOf.call(b)
			if (aSymbol !== bSymbol) {
				return `Symbols are not equal`
			} else return null
		}
	}

	const areArrays = aClassName === '[object Array]'
	if (!areArrays) {
		if (typeof a !== 'object' || typeof b !== 'object') {
			return `One is an object, but not the other (${typeof a}, ${typeof b})`
		}

		// Objects with different constructors are not equivalent, but `Object`s or `Array`s
		// from different frames are.
		// return false // tmp
		const aCtor = a.constructor
		const bCtor = b.constructor
		if (
			aCtor !== bCtor &&
			!(_.isFunction(aCtor) && aCtor instanceof aCtor && _.isFunction(bCtor) && bCtor instanceof bCtor) &&
			'constructor' in a &&
			'constructor' in b
		) {
			return `Different constructors`
		}
	}

	// Assume equality for cyclic structures. The algorithm for detecting cyclic
	// structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.

	// Initializing stack of traversed objects.
	// It's done here since we only need them for objects and arrays comparison.
	aStack = aStack || []
	bStack = bStack || []
	let length = aStack.length
	while (length--) {
		// Linear search. Performance is inversely proportional to the number of
		// unique nested structures.
		if (aStack[length] === a) {
			if (bStack[length] !== b) {
				return `stack lengths is equal`
			} else return null
		}
	}
	// Add the first object to the stack of traversed objects.
	aStack.push(a)
	bStack.push(b)

	// Recursively compare objects and arrays.
	if (areArrays) {
		// Compare array lengths to determine if a deep comparison is necessary.
		length = a.length
		if (length !== b.length) return `length differ (${a.length}, ${b.length})`
		// Deep compare the contents, ignoring non-numeric properties.
		while (length--) {
			const d = diff(a[length], b[length], aStack, bStack)
			if (d) {
				return `array[${length}]: ${d}`
			}
		}
	} else {
		// Deep compare objects.
		const keys = _.keys(a)
		let key
		length = keys.length
		// Ensure that both objects contain the same number of properties before comparing deep equality.
		if (_.keys(b).length !== length) return `keys length differ (${_.keys(b).length}, ${length})`
		while (length--) {
			// Deep compare each member
			key = keys[length]

			if (!_.has(b, key)) {
				return `Key "${key}" missing in b`
			} else {
				const d = diff(a[key], b[key], aStack, bStack)
				if (d) {
					return `object.${key}: ${d}`
				}
			}
		}
	}
	// Remove the first object from the stack of traversed objects.
	aStack.pop()
	bStack.pop()

	return null
}

export interface Trace {
	/** id of this trace, should be formatted as namespace:id */
	measurement: string
	/** timestamp of when trace was started */
	start: number
	/** Tags to differentiate data sources */
	tags?: Record<string, string>
}
export interface FinishedTrace extends Trace {
	/** timestamp of when trace was ended */
	ended: number
	/** duration of the trace */
	duration: number
}

export function startTrace(measurement: string, tags?: Record<string, string>): Trace {
	return {
		measurement,
		tags,
		start: Date.now(),
	}
}

export function endTrace(trace: Trace): FinishedTrace {
	return {
		...trace,
		ended: Date.now(),
		duration: Date.now() - trace.start,
	}
}

/**
 * 'Defer' the execution of an async function.
 * Pass an async function, and a catch block
 */
export function deferAsync(fn: () => Promise<void>, catcher: (e: unknown) => void): void {
	fn().catch(catcher)
}

/**
 * Set a value on an object from a .-delimited path
 * @param obj The base object
 * @param path Path of the value to set
 * @param val The value to set
 */
const set = (obj: Record<string, any>, path: string, val: any) => {
	const p = path.split('.')
	p.slice(0, -1).reduce((a, b) => (a[b] ? a[b] : (a[b] = {})), obj)[p.slice(-1)[0]] = val
}
export function fillStateFromDatastore(state: Timeline.TimelineState<TSRTimelineContent>, datastore: Datastore) {
	// clone the state so we can freely manipulate it
	const filledState: typeof state = JSON.parse(JSON.stringify(state))

	Object.values(filledState.layers).forEach(({ content, instance }) => {
		if ((content as TimelineDatastoreReferencesContent).$references) {
			Object.entries((content as TimelineDatastoreReferencesContent).$references || {}).forEach(([path, ref]) => {
				const datastoreVal = datastore[ref.datastoreKey]

				if (datastoreVal !== undefined) {
					if (ref.overwrite) {
						// only use the datastore value if it was changed after the tl obj started
						if ((instance.originalStart || instance.start || 0) <= datastoreVal.modified) {
							set(content, path, datastoreVal.value)
						}
					} else {
						set(content, path, datastoreVal.value)
					}
				}
			})
		}
	})

	return filledState
}

export function t(key: string, args?: { [k: string]: any }): ITranslatableMessage {
	return {
		key,
		args,
	}
}
