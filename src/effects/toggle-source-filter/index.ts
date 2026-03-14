import { Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import template from "./template.html";
import obs from "../../obs-remote";
import globals from "../../globals";

type EffectModel = {
    selectedFilters: Array<{
        sourceUuid: string;
        sourceName: string;
        filterName: string;
        action: boolean | "toggle";
    }>;
}

type EffectScope = ng.IScope & { effect: EffectModel; } & Partial<{
    sourceList: OBSSource[];
    sourceListFiltered: OBSSource[];
    searchText: string;
    missingSources: EffectModel["selectedFilters"];
    onlyShowSelected: boolean;

    filterIsSelected: (sourceUuid: string, filterName: string) => boolean;
    toggleFilterSelected: (sourceUuid: string, filterName: string) => void;
    setFilterAction: (sourceUuid: string, filterName: string, action: boolean | "toggle") => void;
    getFilterActionDisplay: (sourceUuid: string, filterName: string) => string;
    getMissingActionDisplay: (action: boolean | "toggle") => string;
    formatSourceType: (type: string) => string;
    filterSources: (searchText: string) => void;
    deleteMissingFilter: (sourceUuid: string, filterName: string) => void;
    getStoredData: () => void;
    getSourceList: () => Promise<void>;
    updateOnlyShowSelected: (value: boolean) => void;
}>;

const model: Effects.EffectType<EffectModel> = {
    definition: {
        id: "dennisontheinternet:obs-canvases:toggle-source-filter",
        name: "[OBS Canvas] Toggle Source Filter",
        description: "Toggle filters for OBS sources, scenes and groups",
        icon: "fad fa-stars",
        categories: ["common", "integrations"]
    },
    optionsTemplate: template,
    optionsController: ($scope: EffectScope, obsCanvasService: OBSCanvasService) => {
        $scope.searchText = "";
        $scope.missingSources = [];
        $scope.onlyShowSelected = false;

        if ($scope.effect.selectedFilters == null) {
            $scope.effect.selectedFilters = [];
        }

        $scope.filterIsSelected = (sourceUuid: string, filterName: string): boolean => {
            return $scope.effect.selectedFilters.some(filter => filter.sourceUuid === sourceUuid && filter.filterName === filterName);
        };

        $scope.toggleFilterSelected = (sourceUuid: string, filterName: string): void => {
            const filterIndex = $scope.effect.selectedFilters.findIndex(filter => filter.sourceUuid === sourceUuid && filter.filterName === filterName);
            if (filterIndex !== -1) {
                $scope.effect.selectedFilters.splice(filterIndex, 1);
            } else {
                const source = $scope.sourceList.find(s => s.inputUuid === sourceUuid);
                const sourceName = source ? source.inputName : "";
                $scope.effect.selectedFilters.push({ sourceUuid, sourceName, filterName, action: true });
            }

            $scope.filterSources($scope.searchText);
        };

        $scope.setFilterAction = (sourceUuid: string, filterName: string, action: boolean | "toggle"): void => {
            const filter = $scope.effect.selectedFilters.find(filter => filter.sourceUuid === sourceUuid && filter.filterName === filterName);
            if (filter) {
                filter.action = action;
            }
        };

        $scope.getFilterActionDisplay = (sourceUuid: string, filterName: string): string => {
            const filter = $scope.effect.selectedFilters.find(filter => filter.sourceUuid === sourceUuid && filter.filterName === filterName);

            // I don't love this but it works for now
            $scope.missingSources = $scope.missingSources.filter(m => !(m.sourceUuid === sourceUuid && m.filterName === filterName));

            return filter ? $scope.getMissingActionDisplay(filter.action) : "";
        };

        $scope.getMissingActionDisplay = (action: boolean | "toggle"): string => {
            switch (action) {
                case true:
                    return "Enable";
                case false:
                    return "Disable";
                case "toggle":
                    return "Toggle";
                default:
                    return "";
            }
        };

        $scope.formatSourceType = (type: string): string => {
            return type
                .split(" ")
                .map(
                    w => w[0].toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()
                )
                .join(" ");
        };

        $scope.updateOnlyShowSelected = (value: boolean) => {
            $scope.onlyShowSelected = value;
            $scope.filterSources($scope.searchText);
        };

        $scope.filterSources = (searchText: string) => {
            if ($scope.searchText !== searchText) {
                $scope.searchText = searchText;
            }

            const normalizedSearchText = searchText.toLocaleLowerCase();

            $scope.sourceListFiltered = $scope.sourceList.filter((source) => {

                if ($scope.onlyShowSelected) {
                    return source.filters?.some(filter => {
                        const isSelected = $scope.filterIsSelected(source.inputUuid, filter.filterName);
                        const filterMatchesSearch = filter.filterName.toLocaleLowerCase().includes(normalizedSearchText);

                        return isSelected && filterMatchesSearch;
                    }) || false;
                }

                return source.filters?.some(filter => filter.filterName.toLocaleLowerCase().includes(normalizedSearchText));
            });
        };

        $scope.deleteMissingFilter = (sourceUuid: string, filterName: string) => {
            $scope.effect.selectedFilters = $scope.effect.selectedFilters.filter(filter => !(filter.sourceUuid === sourceUuid && filter.filterName === filterName));
            $scope.missingSources = $scope.missingSources.filter(m => !(m.sourceUuid === sourceUuid && m.filterName === filterName));
        };

        $scope.getStoredData = () => {
            for (const filterName of $scope.effect.selectedFilters) {
                $scope.missingSources.push(filterName);
            }
        };

        $scope.getSourceList = async () => {
            $scope.sourceList = [];
            $scope.missingSources = [];
            $scope.sourceList = await obsCanvasService.getSourcesWithFilters() || [];
            
            $scope.getStoredData();
            $scope.filterSources($scope.searchText);
        };

        $scope.getSourceList();
    },
    onTriggerEvent: async (event) => {
        const allSourcesWithFilters = await obs.getSourcesWithFilters();
        const pendingActions: Array<{ sourceUuid: string; filterName: string; enabled: boolean }> = [];

        for (const filter of event.effect.selectedFilters) {
            const source = allSourcesWithFilters.find(s => s.inputUuid === filter.sourceUuid);
            if (!source) {
                globals.logger.warn(`Source '${filter.sourceName}' not found, skipping filter action`);
                continue;
            }

            const filterInstance = source.filters?.find(f => f.filterName === filter.filterName);

            if (!filterInstance) {
                globals.logger.warn(`Filter with name ${filter.filterName} not found on source '${filter.sourceName}', skipping filter action`);
                continue;
            }

            const enabled = filter.action === "toggle" ? !filterInstance.filterEnabled : filter.action;

            pendingActions.push({
                ...filter,
                enabled
            });
        }

        await obs.setFilterEnabledBatch(pendingActions);
    }
};

export default model;