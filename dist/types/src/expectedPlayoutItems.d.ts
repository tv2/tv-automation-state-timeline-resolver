import { VIZMSEPlayoutItemContent } from './vizMSE';
export declare type ExpectedPlayoutItemContent = ExpectedPlayoutItemContentVizMSE;
export interface ExpectedPlayoutItemContentBase {
    /** Id of the rundown the items comes from */
    rundownId: string;
    /** Id of the rundown playlist the items comes from */
    playlistId: string;
}
export declare type ExpectedPlayoutItemContentVizMSE = ExpectedPlayoutItemContentBase & VIZMSEPlayoutItemContent;
