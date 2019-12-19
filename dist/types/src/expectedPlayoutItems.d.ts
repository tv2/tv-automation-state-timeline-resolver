import { VIZMSEPlayoutItemContent } from './vizMSE';
export declare type ExpectedPlayoutItemContent = ExpectedPlayoutItemContentVizMSE;
export interface ExpectedPlayoutItemContentBase {
    /** Id of the rundown the items comes from */
    rundownId: string;
}
export declare type ExpectedPlayoutItemContentVizMSE = ExpectedPlayoutItemContentBase & VIZMSEPlayoutItemContent;
