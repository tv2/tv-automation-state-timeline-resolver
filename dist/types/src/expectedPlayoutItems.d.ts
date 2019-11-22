export declare type ExpectedPlayoutItemContent = ExpectedPlayoutItemContentVizMSE;
export interface ExpectedPlayoutItemContentVizMSE {
    /** Name of the element, or Pilot Element */
    templateName: string | number;
    /** Data fields of the element (for internal elements only) */
    templateData?: string[];
    /** What channel to use for the element */
    channelName?: string;
    /** If true, won't be preloaded (cued) automatically */
    noAutoPreloading?: boolean;
}
