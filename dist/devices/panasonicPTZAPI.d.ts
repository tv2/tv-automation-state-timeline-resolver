/// <reference types="node" />
import { EventEmitter } from 'events';
/**
 * Low level device class for Panasonic PTZ devices executing a
 * basic queue.
 */
export declare class PanasonicPtzCamera extends EventEmitter {
    private _url;
    private _commandDelay;
    private _commandQueue;
    private _executeQueueTimeout;
    constructor(url: string, commandDelay?: number);
    sendCommand(command: string): Promise<string>;
    dispose(): void;
    private _dropFromQueue;
    private _executeQueue;
}
/**
 * High level methods for interfacing with a panasonic PTZ camera. This class
 * depends on the PanasonicPtzCamera class.
 */
export declare class PanasonicPtzHttpInterface extends EventEmitter {
    private _device;
    constructor(host: string, port?: number, https?: boolean);
    private static _isError;
    dispose(): void;
    /**
     * Get the last preset recalled in the camera
     * @returns {Promise<number>}
     * @memberof PanasonicPtzHttpInterface
     */
    getPreset(): Promise<number>;
    /**
     * Recall camera preset
     * @param {number} preset The preset to be recalled in the camera. 0-99
     * @returns {Promise<number>} A promise: the preset the camera will transition to
     * @memberof PanasonicPtzHttpInterface
     */
    recallPreset(preset: number): Promise<number>;
    /**
     * Get camera preset recall speed, within speed table
     * @returns {Promise<number>} A promise: the speed set in the camera
     * @memberof PanasonicPtzHttpInterface
     */
    getSpeed(): Promise<number>;
    /**
     * Set camera preset recall speed, within speed table
     * @param {number} speed Speed to be set for the camera preset recall. 250-999 or 0. 0 is maximum speed
     * @returns {Promise<number>} A promise: the speed set in the camera
     * @memberof PanasonicPtzHttpInterface
     */
    setSpeed(speed: number): Promise<number>;
    /**
     * Get camera lens zoom speed (essentially, current virtual zoom rocker position)
     * @returns {Promise<number>} A promise: the speed at which the lens is changing it's zoom
     * @memberof PanasonicPtzHttpInterface
     */
    getZoomSpeed(): Promise<number>;
    /**
     * Set camera lens zoom speed (essentially, current virtual zoom rocker position)
     * @param {number} speed Speed to be set for the camera zoom. Acceptable values are 1-99. 50 is zoom stop, 49 is slowest WIDE, 51 is slowest TELE, 1 is fastest WIDE, 99 is fastest TELE
     * @returns {Promise<number>} A promise: the speed at which the lens is changing it's zoom
     * @memberof PanasonicPtzHttpInterface
     */
    setZoomSpeed(speed: number): Promise<number>;
    /**
     * Get camera lens zoom (an absolute number)
     * @returns {Promise<number>} A promise: current lens zoom
     * @memberof PanasonicPtzHttpInterface
     */
    getZoom(): Promise<number>;
    /**
     * Set camera lens zoom (an absolute number)
     * @param {number} level The zoom level to set the lens to
     * @returns {Promise<number>} A promise: current lens zoom
     * @memberof PanasonicPtzHttpInterface
     */
    setZoom(level: number): Promise<number>;
    /**
     * Ping a camera by checking it's power status. Will return true if the camera is on, false if it's off but reachable and will fail otherwise
     * @returns {Promose<boolean | string>} A promise: true if the camera is ON, false if the camera is off, 'turningOn' if transitioning from STBY to ON
     * @memberof PanasonicPtzHttpInterface
     */
    ping(): Promise<boolean | string>;
}
