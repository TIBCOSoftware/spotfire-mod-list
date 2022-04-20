import { DataView, DataViewHierarchyNode } from "spotfire-api";
import * as d3 from "d3";
import { readableColor } from "polished";

const Spotfire = window.Spotfire;

interface Rect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

const DEBUG = true;

/**
 * Constants
 */

const listAxisName = "List";

/**
 * Set up drawing layers
 */
const modContainer = d3.select("#mod-container");
const listElements = modContainer.append("div").attr("id", "listElements");
const markingOverlay = modContainer.append("div").attr("id", "markingOverlay").attr("class", "inactiveMarking");

let selection: Rect = { x1: 0, y1: 0, x2: 0, y2: 0 };

Spotfire.initialize(async (mod) => {
    /**
     * Initialize render context - should show 'busy' cursor.
     * A necessary step for printing (another step is calling render complete)
     */
    const context = mod.getRenderContext();

    const reader = mod.createReader(mod.visualization.data(), mod.windowSize());

    reader.subscribe(generalErrorHandler(mod)(onChange), (err) => {
        mod.controls.errorOverlay.show(err);
    });

    async function onChange(dataView: DataView, windowSize: Spotfire.Size) {
        /**
         * Coonfigure styling
         */
        document.querySelector("#extra_styling")!.innerHTML = `
        .body { 
            color: ${context.styling.general.font.color}; 
            font-size: ${context.styling.general.font.fontSize}px; 
            font-weight: ${context.styling.general.font.fontWeight}; 
            font-style: ${context.styling.general.font.fontStyle};
        }
        
        .marked {
            background-color: ${readableColor(context.styling.general.backgroundColor, "#d6dcfc", "#6489fa", false)};
        }
        `;

        let fontSize = parseInt(context.styling.general.font.fontSize.toString());
        /**
         * Get Data
         */

        const hasList = !!(await dataView.categoricalAxis(listAxisName));

        if (!hasList) {
            listElements.selectAll("*").remove();
            return;
        }

        let listHierarchy = await dataView.hierarchy(listAxisName);
        if (!listHierarchy) {
            listElements.selectAll("*").remove();
            return;
        }

        let listDepth = listHierarchy.levels.length;

        let list = await listHierarchy.root();

        if (!list) {
            return;
        }

        /**
         * Layout
         */

        let width = windowSize.width;
        let height = windowSize.height;

        listElements.style("width", `${width}px`);
        listElements.style("height", `${height}px`);

        /**
         * Update DOM
         */

        let root = listElements.selectAll<HTMLElement, DataViewHierarchyNode>("div").data([list]).join("div");

        if (!root.empty()) {
            makeList(root);
        }

        context.signalRenderComplete();

        function makeList(
            elements: d3.Selection<HTMLElement, DataViewHierarchyNode, HTMLElement, DataViewHierarchyNode>
        ) {
            let subs: d3.Selection<HTMLElement, DataViewHierarchyNode, HTMLElement, DataViewHierarchyNode> = elements
                .selectAll<HTMLElement, DataViewHierarchyNode>("div")
                .data((node: DataViewHierarchyNode) => node?.children || [])
                .join("div")
                .text((node: DataViewHierarchyNode) => (node.value() ? node.formattedValue() : ""))
                .classed("level0", (node: DataViewHierarchyNode) => node.level == 0)
                .classed("list-item", true)
                .classed("list-item-header", (node: DataViewHierarchyNode) => listDepth == 2 && node.level == 0)
                .classed("list-item-superheader", (node: DataViewHierarchyNode) => listDepth > 2 && node.level == 0)
                .classed("list-item-megasuperheader", (node: DataViewHierarchyNode) => listDepth > 3 && node.level == 0)
                .classed("marked", (node: DataViewHierarchyNode) => node.markedRowCount() == node.rowCount());
            if (!subs.empty()) {
                makeList(subs);
            }
        }

        /**
         * Enable rectangle selection
         */

        const mouseMoveHandler = function (event: MouseEvent) {
            let scrollTop = document.body.scrollTop;
            selection.x2 = document.body.clientWidth - 2;
            selection.y2 = event.clientY + scrollTop;

            markingOverlay
                .attr("class", "activeMarking")
                .style("left", `${selection.x2 > selection.x1 ? selection.x1 : selection.x2}`)
                .style("top", `${selection.y2 > selection.y1 ? selection.y1 : selection.y2}`)
                .style("width", `${Math.abs(selection.x2 - selection.x1)}`)
                .style("height", `${Math.abs(selection.y2 - selection.y1)}`);
        };

        const mouseUpHandler = function (event: MouseEvent) {
            let scrollTop = document.body.scrollTop;
            let top = selection.y1;
            let bottom = selection.y2;

            if (top > bottom) {
                top = selection.y2;
                bottom = selection.y1;
            }

            listElements
                .selectAll<HTMLElement, DataViewHierarchyNode>(".list-item")
                .nodes()
                .forEach((value, index, number) => {
                    let rect: DOMRect = value.getBoundingClientRect();
                    if (rect.top < bottom - scrollTop && rect.top + fontSize > top - scrollTop) {
                        d3.select<HTMLElement, DataViewHierarchyNode>(value)
                            .datum()
                            .mark(event.ctrlKey || event.metaKey ? "ToggleOrAdd" : "Replace");
                    }
                });

            markingOverlay.attr("class", "inactiveMarking");

            document.removeEventListener("mousemove", mouseMoveHandler);
            document.removeEventListener("mouseup", mouseUpHandler);
        };

        const mouseDownHandler = function (event: MouseEvent) {
            let scrollTop = document.body.scrollTop;
            selection = {
                x1: 0,
                y1: event.clientY + scrollTop,
                x2: document.body.clientWidth - 2,
                y2: event.clientY + scrollTop
            };
            document.addEventListener("mousemove", mouseMoveHandler);
            document.addEventListener("mouseup", mouseUpHandler);
        };

        modContainer.on("mousedown", mouseDownHandler);
    }
});

/**
 * subscribe callback wrapper with general error handling, row count check and an early return when the data has become invalid while fetching it.
 *
 * The only requirement is that the dataview is the first argument.
 * @param mod - The mod API, used to show error messages.
 * @param rowLimit - Optional row limit.
 */
export function generalErrorHandler<T extends (dataView: Spotfire.DataView, ...args: any) => any>(
    mod: Spotfire.Mod,
    rowLimit = 2000
): (a: T) => T {
    return function (callback: T) {
        return async function callbackWrapper(dataView: Spotfire.DataView, ...args: any) {
            try {
                const errors = await dataView.getErrors();
                if (errors.length > 0) {
                    mod.controls.errorOverlay.show(errors, "DataView");
                    return;
                }
                mod.controls.errorOverlay.hide("DataView");

                /**
                 * Hard abort if row count exceeds an arbitrary selected limit
                 */
                const rowCount = await dataView.rowCount();
                if (rowCount && rowCount > rowLimit) {
                    mod.controls.errorOverlay.show(
                        `☹️ Cannot render - too many rows (rowCount: ${rowCount}, limit: ${rowLimit}) `,
                        "General"
                    );
                    return;
                }

                /**
                 * User interaction while rows were fetched. Return early and respond to next subscribe callback.
                 */
                const allRows = await dataView.allRows();
                if (allRows == null) {
                    return;
                }

                await callback(dataView, ...args);

                mod.controls.errorOverlay.hide("General");
            } catch (e) {
                if (e instanceof Error) {
                    mod.controls.errorOverlay.show(e.message, "General");

                    if (DEBUG) {
                        throw e;
                    }
                }
            }
        } as T;
    };
}
