import { Controls, ModProperty } from "spotfire-api";

export function createPopout(
    controls: Controls,
    showSearchField: ModProperty<boolean>,
    reverseItemsOrder: ModProperty<boolean>,
    popoutClosedEventEmitter: any
) {
    const { checkbox } = controls.popout.components;
    const { section } = controls.popout;

    /**
     * Popout content
     */
    const is = (property: ModProperty) => (value: any) => property.value() == value;

    const popoutContent = () => [
        section({
            heading: "Appearance",
            children: [
                checkbox({
                    name: showSearchField.name,
                    text: "Show search field",
                    checked: is(showSearchField)(true),
                    enabled: true
                })
            ]
        }),
        section({
            heading: "Sorting",
            children: [
                checkbox({
                    name: reverseItemsOrder.name,
                    text: "Reverse items order",
                    checked: is(reverseItemsOrder)(true),
                    enabled: true
                })
            ]
        })
    ];

    return function show(x: number, y: number) {
        controls.popout.show(
            {
                x: x,
                y: y,
                autoClose: true,
                alignment: "Top",
                onChange: (event) => {
                    const { name, value } = event;
                    name == reverseItemsOrder.name && reverseItemsOrder.set(value);
                    name == showSearchField.name && showSearchField.set(value);
                },
                onClosed: () => {
                    popoutClosedEventEmitter.emit("popoutClosed");
                }
            },
            popoutContent
        );
    };
}
