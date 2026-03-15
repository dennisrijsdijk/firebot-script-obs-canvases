type FrontendCommunicatorCommands = {

};

type BackendCommunicatorCommands = {
    getCanvasedSourceData: {
        args: [];
        returns: Array<OBSCanvasedSourceData> | null;
    };
    getColorSources: {
        args: [];
        returns: Array<OBSSource> | null;
    };
    getSourcesWithFilters: {
        args: [];
        returns: Array<OBSSource> | null;
    };
    getTextSources: {
        args: [];
        returns: Array<OBSSource> | null;
    };
    obsSupportsCanvases: {
        args: [];
        returns: boolean | null;
    };
};