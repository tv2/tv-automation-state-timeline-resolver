/**
 * A collection of easing methods defining ease-in ease-out curves from https://github.com/photonstorm/phaser licensed
 * under MIT
 *
 * @class Easing
 */
export declare namespace Easing {
    /**
     * Linear easing.
     *
     * @class Easing.Linear
     */
    class Linear {
        /**
         * Ease-in.
         *
         * @method Easing.Linear#In
         * @param {number} k - The value to be tweened.
         * @returns {number} k^2.
         */
        static None(k: number): number;
    }
    /**
     * Quadratic easing.
     *
     * @class Easing.Quadratic
     */
    class Quadratic {
        /**
         * Ease-in.
         *
         * @method Easing.Quadratic#In
         * @param {number} k - The value to be tweened.
         * @returns {number} k^2.
         */
        static In(k: number): number;
        /**
         * Ease-out.
         *
         * @method Easing.Quadratic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} k* (2-k).
         */
        static Out(k: number): number;
        /**
         * Ease-in/out.
         *
         * @method Easing.Quadratic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Cubic easing.
     *
     * @class Easing.Cubic
     */
    class Cubic {
        /**
         * Cubic ease-in.
         *
         * @method Easing.Cubic#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Cubic ease-out.
         *
         * @method Easing.Cubic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Cubic ease-in/out.
         *
         * @method Easing.Cubic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Quartic easing.
     *
     * @class Easing.Quartic
     */
    class Quartic {
        /**
         * Quartic ease-in.
         *
         * @method Easing.Quartic#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Quartic ease-out.
         *
         * @method Easing.Quartic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Quartic ease-in/out.
         *
         * @method Easing.Quartic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Quintic easing.
     *
     * @class Easing.Quintic
     */
    class Quintic {
        /**
         * Quintic ease-in.
         *
         * @method Easing.Quintic#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Quintic ease-out.
         *
         * @method Easing.Quintic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Quintic ease-in/out.
         *
         * @method Easing.Quintic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Sinusoidal easing.
     *
     * @class Easing.Sinusoidal
     */
    class Sinusoidal {
        /**
         * Sinusoidal ease-in.
         *
         * @method Easing.Sinusoidal#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Sinusoidal ease-out.
         *
         * @method Easing.Sinusoidal#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Sinusoidal ease-in/out.
         *
         * @method Easing.Sinusoidal#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Exponential easing.
     *
     * @class Easing.Exponential
     */
    class Exponential {
        /**
         * Exponential ease-in.
         *
         * @method Easing.Exponential#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Exponential ease-out.
         *
         * @method Easing.Exponential#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Exponential ease-in/out.
         *
         * @method Easing.Exponential#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Circular easing.
     *
     * @class Easing.Circular
     */
    class Circular {
        /**
         * Circular ease-in.
         *
         * @method Easing.Circular#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Circular ease-out.
         *
         * @method Easing.Circular#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Circular ease-in/out.
         *
         * @method Easing.Circular#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Elastic easing.
     *
     * @class Easing.Elastic
     */
    class Elastic {
        /**
         * Elastic ease-in.
         *
         * @method Easing.Elastic#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Elastic ease-out.
         *
         * @method Easing.Elastic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Elastic ease-in/out.
         *
         * @method Easing.Elastic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Back easing.
     *
     * @class Easing.Back
     */
    class Back {
        /**
         * Back ease-in.
         *
         * @method Easing.Back#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Back ease-out.
         *
         * @method Easing.Back#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Back ease-in/out.
         *
         * @method Easing.Back#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
    /**
     * Bounce easing.
     *
     * @class Easing.Bounce
     */
    class Bounce {
        /**
         * Bounce ease-in.
         *
         * @method Easing.Bounce#In
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static In(k: number): number;
        /**
         * Bounce ease-out.
         *
         * @method Easing.Bounce#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k: number): number;
        /**
         * Bounce ease-in/out.
         *
         * @method Easing.Bounce#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k: number): number;
    }
}
