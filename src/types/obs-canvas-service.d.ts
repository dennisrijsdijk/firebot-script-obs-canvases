type OBSCanvasService = {
    getCanvasedSourceData(): Promise<Array<OBSCanvasedSourceData> | null>;
    getColorSources(): Promise<Array<OBSSource> | null>;
    getSourcesWithFilters(): Promise<Array<OBSSource> | null>;
    getTextSources(): Promise<Array<OBSSource> | null>;
    getObsSupportsCanvases(): Promise<boolean>;
}