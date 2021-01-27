import { TSRTransitionOptions } from '../../types/src/casparcg';
export declare class InternalTransitionHandler {
    private _transitions;
    terminate(): void;
    getIdentifiers(): string[];
    clearTransition(identifier: string): void;
    stopAndSnapTransition(identifier: string, targetValues: number[]): void;
    private initTransition;
    activateTransition(identifier: string, initialValues: number[], targetValues: number[], groups: string[], options: TSRTransitionOptions, animatorTypes: {
        [groupId: string]: {
            type: 'linear' | 'physical';
            options?: TSRTransitionOptions;
        };
    }, updateCallback: (newValues: number[]) => void): void;
    private _stopTransition;
}
