import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import template from "./template.html";
import obs from "../../obs-remote";
import globals from "../../globals";
import obsRemote from "../../obs-remote";

type EffectModel = {
    sceneUuid: string;
    sceneName: string;
    sceneItemId: number;
    sourceName: string;
    groupUuid?: string;
    duration: string | number;
    easeIn: boolean;
    easeOut: boolean;
    isTransformingPosition: boolean;
    isTransformingScale: boolean;
    isTransformingRotation: boolean;
    alignment: number;
    startTransform: Record<string, string>;
    endTransform: Record<string, string>;
}

type EffectScope = ng.IScope & { effect: EffectModel; } & Partial<{
    alignmentOptions: Record<number, string>;
    canvasedSourceData: OBSCanvasedSourceData["scenes"];
    selectedScene: OBSCanvasedSourceData["scenes"][number];
    selectedSource: OBSSource;

    getSceneItems: (sceneUuid: string) => OBSSource[];
    selectScene: (scene: OBSCanvasedSourceData["scenes"][number]) => void;
    selectSource: (source: OBSSource) => void;
    getSourceData: () => Promise<void>;
}>;

const model: Effects.EffectType<EffectModel> = {
    definition: {
        id: "dennisontheinternet:obs-canvases:transform-source",
        name: "[OBS Canvas] Transform Source",
        description: "Transforms the position, scale, or rotation of an OBS source either instantly or animated over time",
        icon: "fad fa-arrows",
        categories: ["common", "integrations"]
    },
    optionsTemplate: template,
    optionsController: ($scope: EffectScope, obsCanvasService: OBSCanvasService) => {
        $scope.canvasedSourceData = [];
        $scope.alignmentOptions = Object.freeze({
            [5]: "Top Left",
            [4]: "Top",
            [6]: "Top Right",
            [1]: "Center Left",
            [0]: "Center",
            [2]: "Center Right",
            [8]: "Bottom",
            [9]: "Bottom Left",
            [10]: "Bottom Right"
        });

        $scope.getSceneItems = (sceneUuid: string): OBSSource[] => {
            const scene = $scope.canvasedSourceData.find(s => s.sceneUuid === sceneUuid);
            return scene?.sources ?? [];
        }

        $scope.selectScene = (scene: OBSCanvasedSourceData["scenes"][number]): void => {
            $scope.effect.sceneName = scene.sceneName;
            $scope.effect.sceneUuid = scene.sceneUuid;

            $scope.effect.sceneItemId = null;
            $scope.effect.sourceName = null;
            $scope.effect.groupUuid = null;
            $scope.selectedSource = null;
        };

        $scope.selectSource = (source: OBSSource): void => {
            $scope.effect.sourceName = source.inputName;
            $scope.effect.sceneItemId = source.sceneItemId;
            $scope.effect.groupUuid = source.groupUuid;
        };

        $scope.getSourceData = async (): Promise<void> => {
            const canvasedSourceData = await obsCanvasService.getCanvasedSourceData();
            for (const canvas of canvasedSourceData) {
                for (const scene of canvas.scenes) {
                    scene.sources = scene.sources.filter(s => !s.inputKind.startsWith("wasapi"))
                }
            }

            $scope.canvasedSourceData = canvasedSourceData.flatMap(c => c.scenes);

            $scope.selectedScene = $scope.canvasedSourceData.find(s => s.sceneUuid === $scope.effect.sceneUuid);
            if ($scope.selectedScene) {
                $scope.selectedSource = $scope.selectedScene.sources.find(s => s.sceneItemId === $scope.effect.sceneItemId && s.groupUuid === $scope.effect.groupUuid);
            } else {
                $scope.selectedSource = null;
            }
        };

        $scope.getSourceData();
    },
    optionsValidator: (effect) => {
        if (!effect.sceneUuid) {
            return ["Please select a scene/group"];
        }
        if (!effect.sceneItemId) {
            return ["Please select a source"];
        }
        return [];
    },
    getDefaultLabel: (effect) => {
        return `${effect.sceneName} - ${effect.sourceName}`;
    },
    onTriggerEvent: async ({ effect }) => {
        if (isNaN(Number(effect.duration))) {
            effect.duration = 0;
        }
        const alignment = effect.alignment ? Number(effect.alignment) : undefined;
        const parsedStart: Record<string, number> = {};
        const parsedEnd: Record<string, number> = {};
        const transformKeys: Array<OBSSourceTransformKeys> = [];
        if (effect.isTransformingPosition) {
            transformKeys.push("positionX", "positionY");
        }
        if (effect.isTransformingScale) {
            transformKeys.push("scaleX", "scaleY");
        }
        if (effect.isTransformingRotation) {
            transformKeys.push("rotation");
        }

        transformKeys.forEach((key) => {
            if (effect.startTransform?.hasOwnProperty(key) && effect.startTransform[key].length) {
                const value = Number(effect.startTransform[key]);
                if (!isNaN(value)) {
                    parsedStart[key] = value;
                }
            }
            if (effect.endTransform?.hasOwnProperty(key) && effect.endTransform[key].length) {
                const value = Number(effect.endTransform[key]);
                if (!isNaN(value)) {
                    parsedEnd[key] = value;
                }
            }
        });

        await obsRemote.transform.transformSceneItem(
            effect.groupUuid || effect.sceneUuid,
            effect.sceneItemId,
            Number(effect.duration) * 1000,
            parsedStart,
            parsedEnd,
            effect.easeIn,
            effect.easeOut,
            alignment
        );
    }
};

export default model;