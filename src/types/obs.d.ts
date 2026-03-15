type OBSFilter = {
    filterEnabled: boolean;
    filterName: string;
};

type OBSSource = {
    inputKind: string;
    inputKindCaps: number;
    inputName: string;
    inputUuid: string;
    groupName?: string;
    groupUuid?: string;
    sceneItemId?: number;
    unversionedInputKind: string;
    filters?: Array<OBSFilter>;
};

type OBSScene = {
    sceneIndex?: number;
    sceneName: string;
    sceneUuid: string;
};

type OBSSceneItem = {
    inputKind?: string;
    isGroup?: boolean;
    sceneItemEnabled: boolean;
    sceneItemId: number;
    sceneItemIndex: number;
    sceneItemLocked: boolean;
    sceneItemTransform: unknown;
    sourceName: string;
    sourceType: string;
    sourceUuid: string;
};

type OBSCanvas = {
    canvasFlags: {
        ACTIVATE: boolean;
        EPHEMERAL: boolean;
        MAIN: boolean;
        MIX_AUDIO: boolean;
        SCENE_REF: boolean;
        [x: string]: boolean;
    };
    canvasName: string;
    canvasUuid: string;
    canvasVideoSettings: {
        baseHeight: number;
        baseWidth: number;
        fpsDenominator: number;
        fpsNumerator: number;
        outputHeight: number;
        outputWidth: number;
    };
};

type CanvasWithScenes = OBSCanvas & {
    scenes: Array<OBSScene>;
};

type OBSTextSourceSettings = {
    text: string;
    file: string;
    textSource: "static" | "file";
};

type OBSColorSourceSettings = {
    color: number;
};

type OBSCanvasedSourceData = {
    canvasName: string;
    canvasUuid: string;
    scenes: Array<{
        sceneName: string;
        sceneUuid: string;
        sources: Array<OBSSource>;
    }>;
};

type OBSSourceVisibilityData = {
    sceneUuid: string;
    sceneName: string;
    sceneItemId: number;
    sourceName: string;
    groupName?: string;
    groupUuid?: string;
    action: boolean | "toggle";
}