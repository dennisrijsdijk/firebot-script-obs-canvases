import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import template from "./template.html";
import obs from "../../obs-remote";

type EffectModel = {
    textSourceUuid: string;
    textSourceName: string;
    textSource: "static" | "file";
    text: string;
    file: string;
}

type EffectScope = ng.IScope & { effect: EffectModel; } & Partial<{
    textSources: Array<OBSSource>;
    selected: OBSSource;
    selectTextSource: (textSource: OBSSource) => void;
    toggleSource: () => void;
    textFileUpdated: (file: string) => void;
    getTextSources: () => Promise<void>;
}>;

const model: Effects.EffectType<EffectModel> = {
    definition: {
        id: "dennisontheinternet:obs-canvases:set-source-text",
        name: "[OBS Canvas] Set Source Text",
        description: "Sets the text in an OBS text source",
        icon: "fad fa-font-case",
        categories: ["common", "integrations"]
    },
    optionsTemplate: template,
    optionsController: ($scope: EffectScope, obsCanvasService: OBSCanvasService) => {
        if ($scope.effect.textSource == null) {
            $scope.effect.textSource = "static";
        }

        $scope.selectTextSource = (textSource: OBSSource) => {
            $scope.effect.textSourceUuid = textSource.inputUuid;
            $scope.effect.textSourceName = textSource.inputName;
        };

        $scope.toggleSource = () => {
            $scope.effect.textSource = $scope.effect.textSource === "static" ? "file" : "static";
        };

        $scope.textFileUpdated = (file: string) => {
            $scope.effect.file = file;
        };

        $scope.getTextSources = async () => {
            $scope.textSources = await obsCanvasService.getTextSources();
            if ($scope.textSources) {
                $scope.selected = $scope.textSources.find(source => source.inputUuid === $scope.effect.textSourceUuid);
            } else {
                $scope.selected = null;
            }
        }

        $scope.getTextSources();
    },
    optionsValidator: (effect) => {
        if (!effect.textSourceUuid) {
            return ["Please select a text source."];
        }

        return [];
    },
    getDefaultLabel: (effect) => {
        return effect.textSourceName;
    },
    onTriggerEvent: async (event) => {
        await obs.setTextSourceSettings(event.effect.textSourceUuid, event.effect);
    }
};

export default model;