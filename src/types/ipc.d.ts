type FrontendCommunicatorCommands = {

};

type BackendCommunicatorCommands = {
    obsSupportsCanvases: {
        args: [];
        returns: boolean | null;
    };
    getTextSources: {
        args: [];
        returns: Array<OBSSource> | null;
    };
};