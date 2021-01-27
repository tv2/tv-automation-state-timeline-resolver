/**
 * This file contains various classes that handles animations
 * The animators handle arrays of values, so both single magnitudes [opacity] and vectors (coordinates [x, y] or [x, y, z]) are supported
 */
/** Abstract class for Animators */
export declare abstract class Animator {
    protected positions: number[];
    constructor(startPositions: number[]);
    protected clonePositions(): number[];
    /** Cause the value to jump to the target value  */
    jump(target: number[]): number[];
    /** This function is called on every iteraton (frame)
     * @param target The target value the Animator is aiming towards
     * @param _timeSinceLastUpdate The delta time since last call to .update()
     */
    update(target: number[], _timeSinceLastUpdate: number): number[];
    /** Calculate multi-dimensional distance between values */
    protected getTotalDistanceToTarget(toValue: number[], fromValue: number[]): number;
    /** Calculate multi-dimensional hypotenuse of a vector */
    protected hypotenuse(vector: number[]): number;
}
/** Linear movement towards the target */
export declare class LinearMovement extends Animator {
    /** Speed of linear movement [units/ms] */
    private speed;
    constructor(startPositions: number[], 
    /** Speed of linear movement [units/ms] */
    speed: number);
    jump(target: number[]): number[];
    update(target: number[], timeSinceLastUpdate: number): number[];
}
/** Simulate physical movement: Accelerate towards target until reaching max speed. Then decelerate in time to stop at target. */
export declare class PhysicalAcceleration extends Animator {
    /** Accelerate towards target with this acceleration. [unit per ] */
    private acceleration;
    /** Maximal speed */
    private maxSpeed;
    /** Snap to target when distance is less than this value */
    private snapDistance;
    private speed;
    private directionChanges;
    constructor(
    /** The starting positions */
    startPositions: number[], 
    /** Accelerate towards target with this acceleration. [unit per ] */
    acceleration: number, 
    /** Maximal speed */
    maxSpeed?: number, 
    /** Snap to target when distance is less than this value */
    snapDistance?: number);
    jump(target: number[]): number[];
    /**
     * Update the iteration
     * @param target Target position(s)
     * @param timeSinceLastUpdate Time since last update
     */
    update(target: number[], timeSinceLastUpdate: number): number[];
    private _cap;
}
