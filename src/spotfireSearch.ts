/**
 * This function creates a matching functions that can be used to determine if a string matches Spotfire search expression
 * 
 * Note: it currently only the following subset of the Spotfire search syntax is supported: 
 * 
 * -  ab finds items that contains any word beginning with ab
 * -  \*ab finds items that contains any word ending with ab
 * -  \*ab\* finds items that contains any word with ab in the middle
 * - ab ba finds items that contains a word beginning with ab AND a word beginning with ba.
 * - "A Green Apple" finds items that containts the phrase A Green Apple
 * - Search is not case-sensitive.
 * 
 * TODO: Implement support for more of the Spofire search syntax: 
 * https://docs.tibco.com/pub/sfire-analyst/12.0.0/doc/html/en-US/TIB_sfire-analyst_UsersGuide/index.htm#t=search%2Fsearch_searching_in_tibco_spotfire.htm
 
 * 
 * @param searchExpression search expression using the Spotfire expression syntax
 * @returns a matching function that can be used to determine if a string matches the search expression
 */

export function spotfireSearch(searchExpression: string) {
    let matchingExpressions: RegExp[] = [];

    let escapedString = searchExpression.replace(/[.+^${?}()|[\]\\]/g, "\\$&");

    let searchwords = escapedString.match(/"([^\"]+)"|([\*\w]+)/g)?.map((s) => s.replace(/(^[ "])|([ "]$)/g, ""));
    if (!searchwords) searchwords = [];

    let sfExpression = searchwords.map((s) => {
        if (s?.match(/^\*\w+\*$/)) {
            return s?.replace(/^\*(\w+)\*$/, "$1");
        }
        if (s?.match(/^\*\w+/)) {
            return s?.replace(/^\*(\w+)/, "$1\\b");
        }

        return "\\b" + s?.replace(/\*/, "");
    });

    sfExpression.forEach((expression: string) => {
        matchingExpressions.push(new RegExp(expression, "i"));
    });

    function match(s: string) {
        let matching = true;
        matchingExpressions.forEach((rx: RegExp) => {
            if (!rx.test(s)) {
                matching = false;
            }
        });
        return matching;
    }

    return {
        match
    };
}
