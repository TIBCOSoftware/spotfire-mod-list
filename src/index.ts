import { DataView, DataViewHierarchyNode, ModProperty } from "spotfire-api";
import { scrollBarControl } from "./scrollBarControl";
import { readableColor } from "polished";
import { createPopout } from "./popout";
import * as d3 from "d3";
import { spotfireSearch } from "./spotfireSearch";

var events = require("events");

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
const sortAxisName = "Sort";

/**
 * Set up drawing layers
 */
const modContainer = d3.select("#mod-container");
const listControl = d3.select("#list-control");
const searchControl = d3.select<HTMLDivElement, unknown>("#search-control");
const settings = d3.select("#settings");

const searchBox = searchControl
    .append("input")
    .attr("id", "searchbox")
    .attr("placeholder", "Type to search items")
    .attr("autocomplete", "off");

const listElements = listControl.append("div").attr("id", "listElements");
const markingOverlay = listControl.append("div").attr("id", "markingOverlay").attr("class", "inactiveMarking");

let scrollTop = 0;

let selection: Rect = { x1: 0, y1: 0, x2: 0, y2: 0 };

let scrollBarControlInstance: ReturnType<typeof scrollBarControl>;

Spotfire.initialize(async (mod) => {
    /**
     * Initialize render context - should show 'busy' cursor.
     * A necessary step for printing (another step is calling render complete)
     */
    const context = mod.getRenderContext();

    const reader = mod.createReader(
        mod.visualization.data(),
        mod.windowSize(),
        mod.property<string>("searchExpression"),
        mod.property<boolean>("showSearchField"),
        mod.property<boolean>("reverseItemsOrder")
    );

    reader.subscribe(generalErrorHandler(mod)(onChange), (err) => {
        mod.controls.errorOverlay.show(err);
    });

    scrollBarControlInstance = scrollBarControlInstance || scrollBarControl(listControl);

    async function onChange(
        dataView: DataView,
        windowSize: Spotfire.Size,
        searchExpression: ModProperty<string>,
        showSearchfield: ModProperty<boolean>,
        reverseItemsOrder: ModProperty<boolean>
    ) {
        /**
         * Coonfigure styling
         */

        document.querySelector("#extra_styling")!.innerHTML = `
        .body { 
            color: ${context.styling.general.font.color}; 
            font-size: ${context.styling.general.font.fontSize}px; 
            font-weight: ${context.styling.general.font.fontWeight}; 
            font-style: ${context.styling.general.font.fontStyle};
            font-family: ${context.styling.general.font.fontFamily};
        }

        #searchbox {
            border-color: ${context.styling.scales.line.stroke};
            color: ${context.styling.scales.font.color};
            font-size: ${context.styling.general.font.fontSize}px; 
            font-weight: ${context.styling.general.font.fontWeight}; 
            font-style: ${context.styling.general.font.fontStyle};
            background-color: ${context.styling.general.backgroundColor};
        }
        .marked {
            background-color: ${readableColor(context.styling.general.backgroundColor, "#d6dcfc", "#6489fa", false)};
        }
        `;

        /**
         * Get Data
         */

        const hasListAxis = !!(await dataView.categoricalAxis(listAxisName));
        const hasSortAxis = !!(await dataView.continuousAxis(sortAxisName));

        if (!hasListAxis) {
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

        let hierarchy: d3.HierarchyNode<DataViewHierarchyNode> = d3.hierarchy(list);

        if (hasSortAxis) {
            hierarchy.sum((d) => {
                return d.children ? 0 : d.rows()[0].continuous(sortAxisName)?.value() || 0;
            });

            hierarchy.sort((a, b) => {
                let aValue = a?.value || 0;
                let bValue = b?.value || 0;
                return reverseItemsOrder.value() ? aValue - bValue : bValue - aValue;
            });
        } else {
            let compareValue = 0;

            hierarchy.sort((a, b) => {
                if (reverseItemsOrder.value()) {
                    compareValue = b.data
                        .formattedValue()
                        .toLowerCase()
                        .localeCompare(a.data.formattedValue().toLowerCase());
                } else {
                    compareValue = a.data
                        .formattedValue()
                        .toLowerCase()
                        .localeCompare(b.data.formattedValue().toLowerCase());
                }
                return compareValue;
            });
        }

        let listItems: d3.HierarchyNode<DataViewHierarchyNode>[] = [];

        let expression = searchExpression?.value() || "";

        let searchBoxElement = searchBox.node();
        if (searchBoxElement) searchBoxElement.value = expression;

        // convert from Spotfire expression language to regExp

        let sf: ReturnType<typeof spotfireSearch> = spotfireSearch(expression);

        // flatten the hiearchy and convert all matching nodes to a list
        hierarchy.eachBefore((node: d3.HierarchyNode<DataViewHierarchyNode>) => {
            if (
                node.depth > 0 &&
                node.data.value() &&
                (searchExpression.value() == "" || sf.match(node.data.formattedValue()))
            ) {
                listItems.push(node);
            }
        });

        /**
         * Layout
         */

        let fontSize = parseInt(context.styling.general.font.fontSize.toString());

        let lineHeight = fontSize * 1.4;
        if (showSearchfield.value()) {
            searchControl.style("display", "block");
        } else {
            searchControl.style("display", "none");
        }

        let searchControlHeight = searchControl.node()?.clientHeight || 0;

        settings.on("click", handleSettingsClick);

        let width = windowSize.width;
        let height = windowSize.height;

        let listControlHeight = height - searchControlHeight;

        let totalItems = listItems.length;

        let visibleItems = Math.floor(listControlHeight / lineHeight);
        if (visibleItems >= totalItems) visibleItems = totalItems;

        let maxScrollTop = totalItems - visibleItems;
        if (maxScrollTop < 0) {
            maxScrollTop = 0;
        }

        listElements.style("width", `${width}px`);
        listElements.style("height", `${listControlHeight}px`);

        if (scrollTop > maxScrollTop) {
            scrollTop = maxScrollTop;
        }

        scrollBarControlInstance.update(
            12,
            width - 14,
            searchControlHeight,
            height - searchControlHeight,
            totalItems,
            scrollTop,
            maxScrollTop,
            visibleItems,
            context.styling.scales.line.stroke,
            context.styling.general.backgroundColor,
            lineHeight,
            scrollBarValueChanged
        );

        scrollBarControlInstance.render();

        function renderList() {
            let visibleElements = listItems.filter((v, index) => {
                return index >= scrollTop && index - scrollTop < visibleItems;
            });

            listElements
                .selectAll("div")
                .data(visibleElements)
                .join("div")
                .text((node: d3.HierarchyNode<DataViewHierarchyNode>) => node.data.formattedValue())
                .style(
                    "padding-left",
                    (node: d3.HierarchyNode<DataViewHierarchyNode>) => `${(node.depth - 1) * fontSize}px`
                )
                .classed("list-item", true)
                .classed(
                    "list-item-header",
                    (node: d3.HierarchyNode<DataViewHierarchyNode>) =>
                        (listDepth == 2 && node.data.level == 0) || (listDepth > 2 && node.data.level == 1)
                )
                .classed(
                    "list-item-superheader",
                    (node: d3.HierarchyNode<DataViewHierarchyNode>) => listDepth > 2 && node.data.level == 0
                )
                .classed(
                    "marked",
                    (node: d3.HierarchyNode<DataViewHierarchyNode>) =>
                        node.data.markedRowCount() == node.data.rowCount()
                );
        }

        /**
         * Update DOM
         */

        renderList();

        context.signalRenderComplete();

        /**
         * Search
         */

        searchBox.on("input", searchBoxChangeHandler);

        function searchBoxChangeHandler(event: InputEvent) {
            mod.property("searchExpression").set(searchBox.node()?.value || "");
        }

        /**
         * Enable rectangle selection
         */

        function handleSettingsClick(event: MouseEvent) {
            let showPopOut = createPopout(mod.controls, showSearchfield, reverseItemsOrder, popoutClosedEventEmitter);
            showPopOut(event.x, event.y);
        }

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
                .selectAll<HTMLDivElement, d3.HierarchyNode<DataViewHierarchyNode>>(".list-item")
                .nodes()
                .forEach((element) => {
                    let rect: DOMRect = element.getBoundingClientRect();

                    if (rect.top < bottom - scrollTop && rect.top + lineHeight > top - scrollTop) {
                        let selection = d3.select<HTMLDivElement, d3.HierarchyNode<DataViewHierarchyNode>>(element);
                        selection.datum().data.mark(event.ctrlKey || event.metaKey ? "ToggleOrAdd" : "Replace");
                    }
                });

            markingOverlay.attr("class", "inactiveMarking");

            document.removeEventListener("mousemove", mouseMoveHandler);
            document.removeEventListener("mouseup", mouseUpHandler);
        };

        const mouseDownHandler = function (event: MouseEvent) {
            if (event.button === 0) {
                let scrollTop = document.body.scrollTop;
                selection = {
                    x1: 0,
                    y1: event.clientY + scrollTop,
                    x2: document.body.clientWidth - 2,
                    y2: event.clientY + scrollTop
                };
                document.addEventListener("mousemove", mouseMoveHandler);
                document.addEventListener("mouseup", mouseUpHandler);
            }
        };

        const mouseEnterHandler = function (event: MouseEvent) {
            if (totalItems > visibleItems && context.interactive) {
                scrollBarControlInstance.show();
            }
            if (context.isEditing && context.interactive) {
                settings.style("visibility", "visible");
            }
        };

        const mouseLeaveHandler = function (event: MouseEvent) {
            if (!scrollBarControlInstance.isHandleBeingDragged()) {
                scrollBarControlInstance.hide();
                settings.style("visibility", "hidden");
            }
        };

        const mouseWheelHandler = function (event: WheelEvent) {
            let change = Math.round(event.deltaY / lineHeight);

            scrollTop += change;

            if (scrollTop < 0) {
                scrollTop = 0;
            }
            if (scrollTop > maxScrollTop) {
                scrollTop = maxScrollTop;
            }

            renderList();
            scrollBarControlInstance.setValue(scrollTop);
        };

        var popoutClosedEventEmitter = new events.EventEmitter();

        function handleClick(event: MouseEvent) {
            if (event.altKey) {
                let showPopOut = createPopout(
                    mod.controls,
                    showSearchfield,
                    reverseItemsOrder,
                    popoutClosedEventEmitter
                );
                showPopOut(event.x, event.y);
            }
        }

        listElements.on("mousedown", mouseDownHandler);
        modContainer.on("mouseenter", mouseEnterHandler);
        modContainer.on("mouseleave", mouseLeaveHandler);
        listElements.on("wheel", mouseWheelHandler);
        listControl.on("click", handleClick);

        function scrollBarValueChanged(value: number) {
            scrollTop = value;
            renderList();
        }
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
