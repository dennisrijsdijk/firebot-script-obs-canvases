type FrontendCommunicatorCommands = {

};

type BackendCommunicatorCommands = {
    getColorSources: {
        args: [];
        returns: Array<OBSSource> | null;
    }
    getTextSources: {
        args: [];
        returns: Array<OBSSource> | null;
    };
    obsSupportsCanvases: {
        args: [];
        returns: boolean | null;
    };
};