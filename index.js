var postcss = require('postcss');

function getSortOrder(options) {
    if (options.hasOwnProperty('sort-order') && Array.isArray(options['sort-order'])) {
        var sortOrder = options['sort-order'];
        var order = {};

        if (typeof sortOrder[0] === 'string') {
            sortOrder.forEach(function (prop, propIndex) {
                order[prop] = {
                    group: 0,
                    prop: propIndex
                };
            });
        } else {
            sortOrder.forEach(function (group, groupIndex) {
                group.forEach(function (prop, propIndex) {
                    order[prop] = {
                        group: groupIndex,
                        prop: propIndex
                    };
                });
            });
        }

        return order;
    }

    return false;
}

function cloneWithStyle(node) {
    var nodeClone = node.clone();
    nodeClone.raws = node.raws;

    if (nodeClone.raws.before) {
        nodeClone.raws.before = nodeClone.raws.before.replace(/\n\s*\n/g, '\n').replace(/\r\n\s*\r\n/g, '\r\n');
    }

    return nodeClone;
}

function cleanLineBreaks(node) {
    if (node.raws.before) {
        node.raws.before = node.raws.before.replace(/\r\n\s*\r\n/g, '\r\n').replace(/\n\s*\n/g, '\n');
    }

    return node;
}

module.exports = postcss.plugin('postcss-sort', function (opts) {
    opts = opts || {};

    return function (css) {
        var order = getSortOrder(opts);

        // Index to place the nodes that shouldn't be sorted
        var lastGroupIndex = order['...'] ? order['...'].group : Infinity;
        var lastPropertyIndex = order['...'] ? order['...'].prop : Infinity;

        css.walk(function (rule) {
            if ((rule.type === 'rule' || rule.type === 'atrule') && rule.nodes && rule.nodes.length) {

                var processed = [];

                rule.each(function (node, index) {
                    var sortName = null;

                    if (node.type === 'comment') {
                        return;
                    } else if (node.type === 'decl') {
                        sortName = node.prop;

                        // if property start with $ and letters it's a variable
                        if (/^\$[\w-]+/.test(node.prop)) {
                            sortName = '$variable';
                        }
                    } else if (node.type === 'atrule') {
                        sortName = '@atrule';

                        var atruleName = '@' + node.name;

                        if (order[atruleName]) {
                            sortName = atruleName;
                        }

                        // if atRule has a name like @mixin name or @include name, we can sort by this name too
                        var atruleParameter = /^[\w-]+/.exec(node.params);

                        if (atruleParameter && atruleParameter.length) {
                            var sortNameExtended = sortName + ' ' + atruleParameter[0];

                            if (order[sortNameExtended]) {
                                sortName = sortNameExtended;
                            }
                        }
                    } else if (node.type === 'rule') {
                        sortName = '>child';
                    }

                    // If the declaration's property is in order's list, save its
                    // group and property indices. Otherwise set them to 10000, so
                    // declaration appears at the bottom of a sorted list:
                    var orderProperty = order[sortName];

                    node.groupIndex = orderProperty && orderProperty.group > -1 ? orderProperty.group : lastGroupIndex;
                    node.propertyIndex = orderProperty && orderProperty.prop > -1 ? orderProperty.prop : lastPropertyIndex;
                    node.initialIndex = index;

                    if (node.prev() && node.prev().type === 'comment') {
                        var previousNode = node.prev();

                        if (previousNode.raws.before && previousNode.raws.before.indexOf('\n') > -1) {
                            previousNode.groupIndex = node.groupIndex;
                            previousNode.propertyIndex = node.propertyIndex;
                            previousNode.initialIndex = index - 1;

                            var previousNodeClone = cloneWithStyle(previousNode);

                            processed.push(previousNodeClone);
                        }
                    }

                    processed.push(node);

                    if (node.next() && node.next().type === 'comment') {
                        var nextNode = node.next();

                        if (nextNode.raws.before && nextNode.raws.before.indexOf('\n') < 0) {
                            nextNode.groupIndex = node.groupIndex;
                            nextNode.propertyIndex = node.propertyIndex;
                            nextNode.initialIndex = index + 1;
                            processed.push(nextNode);
                        }
                    }
                });

                // Sort declarations saved for sorting:
                processed.sort(function (a, b) {
                    // If a's group index is higher than b's group index, in a sorted
                    // list a appears after b:
                    if (a.groupIndex !== b.groupIndex) return a.groupIndex - b.groupIndex;

                    // If a and b have the same group index, and a's property index is
                    // higher than b's property index, in a sorted list a appears after
                    // b:
                    if (a.propertyIndex !== b.propertyIndex) return a.propertyIndex - b.propertyIndex;

                    // If a and b have the same group index and the same property index,
                    // in a sorted list they appear in the same order they were in
                    // original array:
                    return a.initialIndex - b.initialIndex;
                });

                rule.removeAll();
                rule.append(processed);

                rule.each(function (node) {
                    node = cleanLineBreaks(node);

                    var prevNode = node.prev();

                    if (prevNode && node.groupIndex > prevNode.groupIndex) {
                        if (node.raws.before) {
                            node.raws.before = '\n' + node.raws.before;
                        }
                    }
                });

            }
        });
    };
});