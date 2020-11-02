"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * A collection of easing methods defining ease-in ease-out curves from https://github.com/photonstorm/phaser licensed
 * under MIT
 *
 * @class Easing
 */
var Easing;
(function (Easing) {
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
        static None(k) {
            return k;
        }
    }
    Easing.Linear = Linear;
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
        static In(k) {
            return k * k;
        }
        /**
         * Ease-out.
         *
         * @method Easing.Quadratic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} k* (2-k).
         */
        static Out(k) {
            return k * (2 - k);
        }
        /**
         * Ease-in/out.
         *
         * @method Easing.Quadratic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            k *= 2;
            if (k < 1)
                return 0.5 * k * k;
            return -0.5 * (--k * (k - 2) - 1);
        }
    }
    Easing.Quadratic = Quadratic;
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
        static In(k) {
            return k * k * k;
        }
        /**
         * Cubic ease-out.
         *
         * @method Easing.Cubic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            return --k * k * k + 1;
        }
        /**
         * Cubic ease-in/out.
         *
         * @method Easing.Cubic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            k *= 2;
            if (k < 1)
                return 0.5 * k * k * k;
            return 0.5 * ((k -= 2) * k * k + 2);
        }
    }
    Easing.Cubic = Cubic;
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
        static In(k) {
            return k * k * k * k;
        }
        /**
         * Quartic ease-out.
         *
         * @method Easing.Quartic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            return 1 - (--k * k * k * k);
        }
        /**
         * Quartic ease-in/out.
         *
         * @method Easing.Quartic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            k *= 2;
            if (k < 1)
                return 0.5 * k * k * k * k;
            return -0.5 * ((k -= 2) * k * k * k - 2);
        }
    }
    Easing.Quartic = Quartic;
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
        static In(k) {
            return k * k * k * k * k;
        }
        /**
         * Quintic ease-out.
         *
         * @method Easing.Quintic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            return --k * k * k * k * k + 1;
        }
        /**
         * Quintic ease-in/out.
         *
         * @method Easing.Quintic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            k *= 2;
            if (k < 1)
                return 0.5 * k * k * k * k * k;
            return 0.5 * ((k -= 2) * k * k * k * k + 2);
        }
    }
    Easing.Quintic = Quintic;
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
        static In(k) {
            return 1 - Math.cos(k * Math.PI / 2);
        }
        /**
         * Sinusoidal ease-out.
         *
         * @method Easing.Sinusoidal#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            return Math.sin(k * Math.PI / 2);
        }
        /**
         * Sinusoidal ease-in/out.
         *
         * @method Easing.Sinusoidal#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            return 0.5 * (1 - Math.cos(Math.PI * k));
        }
    }
    Easing.Sinusoidal = Sinusoidal;
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
        static In(k) {
            return k === 0 ? 0 : Math.pow(1024, k - 1);
        }
        /**
         * Exponential ease-out.
         *
         * @method Easing.Exponential#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            return k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
        }
        /**
         * Exponential ease-in/out.
         *
         * @method Easing.Exponential#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            if (k === 0)
                return 0;
            if (k === 1)
                return 1;
            k *= 2;
            if (k < 1)
                return 0.5 * Math.pow(1024, k - 1);
            return 0.5 * (-Math.pow(2, -10 * (k - 1)) + 2);
        }
    }
    Easing.Exponential = Exponential;
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
        static In(k) {
            return 1 - Math.sqrt(1 - k * k);
        }
        /**
         * Circular ease-out.
         *
         * @method Easing.Circular#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            return Math.sqrt(1 - (--k * k));
        }
        /**
         * Circular ease-in/out.
         *
         * @method Easing.Circular#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            k *= 2;
            if (k < 1)
                return -0.5 * (Math.sqrt(1 - k * k) - 1);
            return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);
        }
    }
    Easing.Circular = Circular;
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
        static In(k) {
            let s;
            let a = 0.1;
            let p = 0.4;
            if (k === 0)
                return 0;
            if (k === 1)
                return 1;
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            }
            else
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            return -(a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
        }
        /**
         * Elastic ease-out.
         *
         * @method Easing.Elastic#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            let s;
            let a = 0.1;
            let p = 0.4;
            if (k === 0)
                return 0;
            if (k === 1)
                return 1;
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            }
            else
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            return (a * Math.pow(2, -10 * k) * Math.sin((k - s) * (2 * Math.PI) / p) + 1);
        }
        /**
         * Elastic ease-in/out.
         *
         * @method Easing.Elastic#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            let s;
            let a = 0.1;
            let p = 0.4;
            if (k === 0)
                return 0;
            if (k === 1)
                return 1;
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            }
            else
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            k *= 2;
            if (k < 1)
                return -0.5 * (a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
            return a * Math.pow(2, -10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p) * 0.5 + 1;
        }
    }
    Easing.Elastic = Elastic;
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
        static In(k) {
            let s = 1.70158;
            return k * k * ((s + 1) * k - s);
        }
        /**
         * Back ease-out.
         *
         * @method Easing.Back#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            let s = 1.70158;
            return --k * k * ((s + 1) * k + s) + 1;
        }
        /**
         * Back ease-in/out.
         *
         * @method Easing.Back#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            let s = 1.70158 * 1.525;
            k *= 2;
            if (k < 1)
                return 0.5 * (k * k * ((s + 1) * k - s));
            return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
        }
    }
    Easing.Back = Back;
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
        static In(k) {
            return 1 - Bounce.Out(1 - k);
        }
        /**
         * Bounce ease-out.
         *
         * @method Easing.Bounce#Out
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static Out(k) {
            if (k < (1 / 2.75)) {
                return 7.5625 * k * k;
            }
            else if (k < (2 / 2.75)) {
                return 7.5625 * (k -= (1.5 / 2.75)) * k + 0.75;
            }
            else if (k < (2.5 / 2.75)) {
                return 7.5625 * (k -= (2.25 / 2.75)) * k + 0.9375;
            }
            else {
                return 7.5625 * (k -= (2.625 / 2.75)) * k + 0.984375;
            }
        }
        /**
         * Bounce ease-in/out.
         *
         * @method Easing.Bounce#InOut
         * @param {number} k - The value to be tweened.
         * @returns {number} The tweened value.
         */
        static InOut(k) {
            if (k < 0.5)
                return Bounce.In(k * 2) * 0.5;
            return Bounce.Out(k * 2 - 1) * 0.5 + 0.5;
        }
    }
    Easing.Bounce = Bounce;
})(Easing = exports.Easing || (exports.Easing = {}));
//# sourceMappingURL=easings.js.map