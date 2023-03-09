import * as d3 from "d3";

export function scrollBarControl(context: d3.Selection<d3.BaseType, unknown, HTMLElement, any>) {
    const buttonSize = 12;

    let scrollBarScale: d3.ScaleLinear<number, number, never>;
    let value: number;
    let maxValue: number;
    let top: number;
    let left: number;
    let height: number;
    let width: number;
    let totalItems: number;
    let extent: number;
    let handleHeight: number;
    let handleDragStartY: number;
    let handleTop: number;
    let valueChanged: (value: number) => void;
    let color: string;
    let background: string;
    let handleDrag = false;
    let scrollDistance: number;

    let scrollBar = context.select<HTMLDivElement>("#scrollBar");
    if (scrollBar.empty()) {
        scrollBar = context
            .append("div")
            .attr("draggable", "false")
            .attr("id", "scrollBar")
            .style("visibility", "hidden")
            .on("mousedown", scrollBarMouseClick)
            .on("wheel", scrollBarMouseWheel);
    }

    let scrollBarButtonTop = scrollBar.select<HTMLDivElement>("#scrollBarButtonTop");

    if (scrollBarButtonTop.empty()) {
        scrollBarButtonTop = scrollBar.append("div").attr("draggable", "false").attr("id", "scrollBarButtonTop");
        scrollBarButtonTop.on("mousedown", upButtonClick);
    }

    let arrowUp = scrollBarButtonTop.select<HTMLDivElement>("#arrowUp");

    if (arrowUp.empty()) {
        arrowUp = scrollBarButtonTop.append("div").attr("draggable", "false").attr("id", "arrowUp");
    }

    let scrollBarButtonBottom = scrollBar.select<HTMLDivElement>("#scrollBarButtonBottom");

    if (scrollBarButtonBottom.empty()) {
        scrollBarButtonBottom = scrollBar.append("div").attr("draggable", "false").attr("id", "scrollBarButtonBottom");
        scrollBarButtonBottom.on("mousedown", downButtonClick);
    }

    let arrowDown = scrollBarButtonBottom.select<HTMLDivElement>("#arrowDown");

    if (arrowDown.empty()) {
        arrowDown = scrollBarButtonBottom.append("div").attr("draggable", "false").attr("id", "arrowDown");
    }

    let scrollBarHandle = scrollBar.select<HTMLDivElement>("#scrollBarHandle");

    if (scrollBarHandle.empty()) {
        scrollBarHandle = scrollBar
            .append("div")
            .attr("draggable", "false")
            .attr("id", "scrollBarHandle")
            .on("mousedown", scrollBarHandleMouseDown)
            .on("dragstart", preventDragging);
    }

    return {
        setValue,
        render,
        update,
        hide,
        show,
        isHandleBeingDragged
    };

    function isHandleBeingDragged() {
        return handleDrag;
    }

    function update(
        _width: number,
        _left: number,
        _top: number,
        _height: number,
        _totalItems: number,
        _value: number,
        _maxValue: number,
        _extent: number,
        _color: string,
        _background: string,
        _scrollDistance: number,
        _valueChanged: (value: number) => void
    ) {
        width = _width;
        left = _left;
        top = _top;
        height = _height;
        totalItems = _totalItems;
        value = _value;
        maxValue = _maxValue;
        extent = _extent;
        color = _color;
        background = _background;
        scrollDistance = _scrollDistance;
        valueChanged = _valueChanged;

        scrollBarScale = d3
            .scaleLinear()
            .domain([0, totalItems - 1])
            .range([buttonSize + 2, height - buttonSize - 4]);
    }

    function setValue(_value: number) {
        value = _value;
        render();
    }

    function render() {
        scrollBar
            .style("width", `${width}px`)
            .style("height", `${height - 2}`)
            .style("left", `${left}`)
            .style("top", `${top}px`)
            .style("border-color", color)
            .style("background-color", background);

        handleTop = scrollBarScale(value);

        handleHeight = scrollBarScale(value + extent - 1) - scrollBarScale(value);
        if (handleHeight < 2) {
            handleHeight = 2;
        }
        scrollBarHandle
            .style("width", "8px")
            .style("background-color", color)
            .style("height", `${handleHeight}px`)
            .style("top", `${handleTop}px`)
            .style("left", "2px");

        scrollBarButtonTop
            .style("top", "0px")
            .style("width", `${buttonSize}px`)
            .style("height", `${buttonSize}px`)
            .style("left", "0px")
            .style("border-color", color);

        arrowUp.style("border-bottom-color", color);

        scrollBarButtonBottom
            .style("top", `${height - buttonSize - 3}`)
            .style("width", `${buttonSize}px`)
            .style("height", `${buttonSize}px`)
            .style("left", "0px")
            .style("border-color", color);

        arrowDown.style("border-top-color", color);
    }

    function hide() {
        let scrollBar = context.select<HTMLDivElement>("#scrollBar");
        scrollBar.style("visibility", "hidden");
    }

    function show() {
        let scrollBar = context.select<HTMLDivElement>("#scrollBar");
        scrollBar.style("visibility", "visible");
    }

    /**
     * Internal Functions
     */

    function preventDragging(event: MouseEvent) {
        /**
         * Prevent dragging from interfering with the behavior of the scrollbar.
         * In theory this should not be necessary but for some reason dragging is initiated on
         * the scrollbar handle in the Spotfire windows client if the previous attempt to move the handle
         * is terminated outside the scrollbar.
         * */
        event.preventDefault();
    }

    function scrollBarMouseClick(event: MouseEvent) {
        if (event.clientY < handleTop) {
            handleTop = handleTop - handleHeight;
            if (handleTop < scrollBarScale.range()[0]) {
                handleTop = scrollBarScale.range()[0];
            }
        }

        if (event.clientY > handleTop + handleHeight) {
            handleTop = handleTop + handleHeight;
            if (handleTop + handleHeight > scrollBarScale.range()[1]) {
                handleTop = scrollBarScale.range()[1] - handleHeight;
            }
        }

        value = scrollBarScale.invert(handleTop);

        render();
        valueChanged(value);
    }

    function scrollBarMouseWheel(event: WheelEvent) {
        let change = Math.round(event.deltaY / scrollDistance);

        value += change;

        if (value < 0) {
            value = 0;
        }
        if (value > maxValue) {
            value = maxValue;
        }
        render();
        valueChanged(value);
    }

    function scrollBarHandleMouseDown(event: MouseEvent) {
        handleDrag = true;
        handleDragStartY = event.clientY;
        event.stopPropagation();
        document.addEventListener("mouseup", scrollBarMouseUp);
        document.addEventListener("mousemove", scrollBarMouseMove);
    }

    function scrollBarMouseUp(event: MouseEvent) {
        if (handleDrag) {
            handleDrag = false;
            adjustScrollHandle(event);
        }
        document.removeEventListener("mouseup", scrollBarMouseUp);
        document.removeEventListener("mousemove", scrollBarMouseMove);
    }

    function scrollBarMouseMove(event: MouseEvent) {
        if (handleDrag) {
            adjustScrollHandle(event);
        }
    }

    function adjustScrollHandle(event: MouseEvent) {
        handleTop = handleTop + (event.clientY - handleDragStartY);
        if (handleTop < scrollBarScale.range()[0]) {
            handleTop = scrollBarScale.range()[0];
        }
        if (handleTop + handleHeight > scrollBarScale.range()[1]) {
            handleTop = scrollBarScale.range()[1] - handleHeight;
        }
        handleDragStartY = event.clientY;
        value = scrollBarScale.invert(handleTop);
        render();
        valueChanged(value);
    }

    function downButtonClick(event: MouseEvent) {
        if (value < maxValue) {
            value += 1;
            render();
            valueChanged(value);
        }
        event.stopPropagation();
    }

    function upButtonClick(event: MouseEvent) {
        if (value > 0) {
            value -= 1;
            render();
            valueChanged(value);
        }
        event.stopPropagation();
    }
}
