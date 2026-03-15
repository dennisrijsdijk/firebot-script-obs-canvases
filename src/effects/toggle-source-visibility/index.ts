import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import template from "./template.html";
import obs from "../../obs-remote";
import globals from "../../globals";

type EffectModel = {
    selectedSources: Array<OBSSourceVisibilityData>;
}

type EffectScope = ng.IScope & { effect: EffectModel; } & Partial<{
    canvasedSourceData: OBSCanvasedSourceData[];
    filteredCanvasedSourceData: OBSCanvasedSourceData[];
    searchText: string;
    missingSources: EffectModel["selectedSources"];
    onlyShowSelected: boolean;

    sourceIsSelected: (sceneUuid: string, sceneItemId: number, groupUuid?: string) => boolean;
    deleteSource: (source: OBSSourceVisibilityData) => void;
    toggleSourceSelected: (sceneUuid: string, sceneItemId: number, groupUuid?: string) => void;
    getActionDisplay: (action: boolean | "toggle") => string;
    getSourceActionDisplay: (sceneUuid: string, sceneItemId: number, groupUuid?: string) => string;
    setSourceAction: (sceneUuid: string, sceneItemId: number, action: boolean | "toggle", groupUuid?: string) => void;
    filterSources: (searchText: string) => void;
    getSourceData: () => Promise<void>;
    updateOnlyShowSelected: (value: boolean) => void;
}>;

const model: Effects.EffectType<EffectModel> = {
    definition: {
        id: "dennisontheinternet:obs-canvases:toggle-source-visibility",
        name: "[OBS Canvas] Toggle Source Visibility",
        description: "Toggle visibility for OBS sources",
        icon: "fad fa-clone",
        categories: ["common", "integrations"]
    },
    optionsTemplate: template,
    optionsController: ($scope: EffectScope, obsCanvasService: OBSCanvasService) => {
        if ($scope.effect.selectedSources == null) {
            $scope.effect.selectedSources = [];
        }

        $scope.searchText = "";
        $scope.missingSources = [];
        $scope.onlyShowSelected = false;

        $scope.sourceIsSelected = (sceneUuid: string, sceneItemId: number, groupUuid?: string): boolean => {
            return $scope.effect.selectedSources.some(s => s.sceneUuid === sceneUuid && s.sceneItemId === sceneItemId && s.groupUuid === groupUuid);
        };

        $scope.deleteSource = (source: OBSSourceVisibilityData): void => {
            $scope.effect.selectedSources = $scope.effect.selectedSources.filter(s => !(s.sceneUuid === source.sceneUuid && s.sceneItemId === source.sceneItemId && s.groupUuid === source.groupUuid));
            $scope.missingSources = $scope.missingSources.filter(s => !(s.sceneUuid === source.sceneUuid && s.sceneItemId === source.sceneItemId && s.groupUuid === source.groupUuid));
        };

        $scope.toggleSourceSelected = (sceneUuid: string, sceneItemId: number, groupUuid?: string): void => {
            const sourceIndex = $scope.effect.selectedSources.findIndex(s => s.sceneUuid === sceneUuid && s.sceneItemId === sceneItemId && s.groupUuid === groupUuid);
            if (sourceIndex !== -1) {
                $scope.effect.selectedSources.splice(sourceIndex, 1);
            } else {
                const scene = $scope.canvasedSourceData.flatMap(canvas => canvas.scenes).find(s => s.sceneUuid === sceneUuid);
                const source = scene?.sources.find(s => s.sceneItemId === sceneItemId && s.groupUuid === groupUuid);
                if (source) {
                    $scope.effect.selectedSources.push({
                        sceneUuid,
                        sceneName: scene.sceneName,
                        sceneItemId,
                        sourceName: source.inputName,
                        groupName: source.groupName,
                        groupUuid: source.groupUuid,
                        action: "toggle"
                    });
                }
            }

            $scope.filterSources($scope.searchText);
        };

        $scope.getActionDisplay = (action: boolean | "toggle"): string => {
            switch (action) {
                case true:
                    return "Show";
                case false:
                    return "Hide";
                case "toggle":
                    return "Toggle";
                default:
                    return "";
            }
        };

        $scope.getSourceActionDisplay = (sceneUuid: string, sceneItemId: number, groupUuid?: string): string => {
            const source = $scope.effect.selectedSources.find(s => s.sceneUuid === sceneUuid && s.sceneItemId === sceneItemId && s.groupUuid === groupUuid);
            return source ? $scope.getActionDisplay(source.action) : "";
        };

        $scope.setSourceAction = (sceneUuid: string, sceneItemId: number, action: boolean | "toggle", groupUuid?: string): void => {
            const source = $scope.effect.selectedSources.find(s => s.sceneUuid === sceneUuid && s.sceneItemId === sceneItemId && s.groupUuid === groupUuid);
            if (source) {
                source.action = action;
            }
        };

        $scope.updateOnlyShowSelected = (value: boolean) => {
            $scope.onlyShowSelected = value;
            $scope.filterSources($scope.searchText);
        };

        $scope.filterSources = (searchText: string): void => {
            if ($scope.searchText !== searchText) {
                $scope.searchText = searchText;
            }

            const filteredData: OBSCanvasedSourceData[] = [];

            for (const canvas of $scope.canvasedSourceData) {
                const canvasData: OBSCanvasedSourceData = {
                    canvasName: canvas.canvasName,
                    canvasUuid: canvas.canvasUuid,
                    scenes: []
                }

                for (const scene of canvas.scenes) {
                    const sceneData: OBSCanvasedSourceData["scenes"][number] = {
                        sceneName: scene.sceneName,
                        sceneUuid: scene.sceneUuid,
                        sources: scene.sources.filter(source => {
                            const matchesSearch = source.inputName.toLowerCase().includes(searchText.toLowerCase());
                            const isSelected = $scope.effect.selectedSources.some(s => s.sceneUuid === scene.sceneUuid && s.sceneItemId === source.sceneItemId);
                            return matchesSearch && (!$scope.onlyShowSelected || isSelected);
                        })
                    };

                    if (sceneData.sources.length > 0) {
                        canvasData.scenes.push(sceneData);
                    }
                }

                if (canvasData.scenes.length > 0) {
                    filteredData.push(canvasData);
                }
            }
            $scope.filteredCanvasedSourceData = filteredData;
        };

        $scope.getSourceData = async (): Promise<void> => {
            $scope.canvasedSourceData = [];
            $scope.missingSources = [];
            $scope.canvasedSourceData = await obsCanvasService.getCanvasedSourceData();

            for (const source of $scope.effect.selectedSources) {
                const sourceExists = $scope.canvasedSourceData.some((canvas) => {
                    return canvas.scenes.some((scene) => {
                        return scene.sceneUuid === source.sceneUuid && scene.sources.some(s => s.sceneItemId === source.sceneItemId);
                    })
                });
                if (!sourceExists) {
                    $scope.missingSources.push(source);
                }
            }

            $scope.filterSources($scope.searchText);
        };

        $scope.getSourceData();
    },
    onTriggerEvent: async (event) => {
        await obs.batchSetSourceVisibilities(await obs.batchGetNewSourceVisibilities(event.effect.selectedSources));
    }
};

export default model;