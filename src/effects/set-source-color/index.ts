import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import template from "./template.html";
import obs from "../../obs-remote";
import globals from "../../globals";

type EffectModel = {
    colorSourceUuid: string;
    colorSourceName: string;
    color: string;
    customColor: boolean;
}

type EffectScope = ng.IScope & { effect: EffectModel; } & Partial<{
    colorSources: Array<OBSSource>;
    selected: OBSSource;

    supportsCanvases: boolean;

    selectColorSource: (colorSource: OBSSource) => void;
    toggleCustomColor: () => void;
    getColorSources: () => Promise<void>;
}>;

const rgbRegexp = /^#?[0-9a-f]{6}$/i;
const rgbaRegexp = /^#?[0-9a-f]{8}$/i;

function rgbaToAbgr(hexColor: string) {
    return `${hexColor.substring(6, 8)}${hexColor.substring(4, 6)}${hexColor.substring(2, 4)}${hexColor.substring(0, 2)}`;
}

const model: Effects.EffectType<EffectModel> = {
    definition: {
        id: "dennisontheinternet:obs-canvases:set-source-color",
        name: "[OBS Canvas] Set Source Color",
        description: "Sets the color in an OBS color source",
        icon: "fad fa-palette",
        categories: ["common", "integrations"]
    },
    optionsTemplate: template,
    optionsController: ($scope: EffectScope, obsCanvasService: OBSCanvasService) => {
        $scope.supportsCanvases = false;

        if ($scope.effect.customColor == null) {
            $scope.effect.customColor = false;
        }

        if ($scope.effect.color == null) {
            $scope.effect.color = "#FF0000FF";
        }

        $scope.selectColorSource = (colorSource: OBSSource) => {
            $scope.effect.colorSourceUuid = colorSource.inputUuid;
            $scope.effect.colorSourceName = colorSource.inputName;
        };

        $scope.toggleCustomColor = () => {
            $scope.effect.customColor = !$scope.effect.customColor;
        };

        $scope.getColorSources = async () => {
            $scope.supportsCanvases = await obsCanvasService.getObsSupportsCanvases();

            if (!$scope.supportsCanvases) {
                return;
            }

            $scope.colorSources = await obsCanvasService.getColorSources();
            if ($scope.colorSources) {
                $scope.selected = $scope.colorSources.find(source => source.inputUuid === $scope.effect.colorSourceUuid);
            } else {
                $scope.selected = null;
            }
        }

        $scope.getColorSources();
    },
    optionsValidator: (effect) => {
        const rgbRegexp = /^#?[0-9a-f]{6}$/i;
        const rgbaRegexp = /^#?[0-9a-f]{8}$/i;

        if (!effect.colorSourceUuid) {
            return ["Please select a color source."];
        } else if (!effect.customColor && !rgbRegexp.test(effect.color) && !rgbaRegexp.test(effect.color)) {
            return ["Color must be in RGB format (#0066FF) or ARGB format (#FF336699)"];
        }

        return [];
    },
    getDefaultLabel: (effect) => {
        return effect.colorSourceName;
    },
    onTriggerEvent: async (event) => {
        if (!rgbRegexp.test(event.effect.color) && !rgbaRegexp.test(event.effect.color)) {
            globals.logger.error(`Set OBS Color Source: '${event.effect.color}' is not a valid RGB(A) color code.`);
            return;
        }

        let hexColor = event.effect.color.replace("#", "");
        hexColor = rgbaToAbgr(hexColor.length === 6 ? `${hexColor}FF` : hexColor)
        const settings: OBSColorSourceSettings = { color: parseInt(hexColor, 16) };

        await obs.setColorSourceSettings(event.effect.colorSourceUuid, settings);
    }
};

export default model;