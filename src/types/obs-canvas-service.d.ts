type OBSCanvasService = {
    getObsSupportsCanvases(): Promise<boolean>;
    getTextSources(): Promise<Array<OBSSource> | null>;
}