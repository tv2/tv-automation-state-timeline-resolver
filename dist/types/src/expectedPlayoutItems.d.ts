export declare type ExpectedPlayoutItemContent = ExpectedPlayoutItemContentVizMSE;
export interface ExpectedPlayoutItemContentVizMSE {
    /** Name of the element, or Pilot Element */
    templateName: string | number;
    /** Data fields of the element (for internal elements only) */
    templateData?: string[];
}
