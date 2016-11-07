"use strict";
exports.GENERIC_REGEX = /^(.+?)\</;
exports.PREDEFINED = new Set(['number', 'string', 'boolean', 'any']);
const ARRAY_TYPE = /^(.+?)(\[\])+$/;
const KEY_TYPE = /^\{ \[key: string\]: (.+?) \}$/;
exports.getInnerType = (type) => {
    let match;
    if (match = type.match(ARRAY_TYPE)) {
        type = match[1];
    }
    if (match = type.match(KEY_TYPE)) {
        type = match[1];
    }
    return type;
};
exports.propertiesSort = (a, b) => a.key.localeCompare(b.key);
exports.shortId = (id) => {
    let index;
    index = id.lastIndexOf(':');
    if (index >= 0) {
        return id.slice(index + 1);
    }
    index = id.lastIndexOf('.');
    if (index >= 0) {
        return id.slice(index + 1);
    }
    return id;
};
exports.urnToId = (id) => {
    let match = id.match(exports.GENERIC_REGEX);
    if (match) {
        id = match[1];
    }
    return id
        .replace('urn:jsonschema:', '')
        .replace(/:/g, '.');
};
const namespaceRegex = /^(.+)\.(.+?)$/;
exports.extractNamespace = (n) => {
    let match = n.match(namespaceRegex);
    let prefix = match[1];
    let suffix = match[2];
    return { prefix, suffix };
};
exports.isSuperContext = (a, b) => (a.properties.length > 0 &&
    b.properties.length > 0 &&
    a.properties.every(p1 => b.properties.some(p2 => p1.key === p2.key &&
        JSON.stringify(p1.type) === JSON.stringify(p2.type) &&
        p1.required === p2.required &&
        p1.extras === p2.extras)));
exports.unique = (array) => {
    let serializedResults = [];
    return array.filter((item) => {
        let serialized = JSON.stringify(item);
        let uniq = serializedResults.every((i) => i !== serialized);
        if (uniq) {
            serializedResults.push(serialized);
        }
        return uniq;
    });
};
exports.tsEnum = (e) => e.map(t => `'${t}'`).join(' | ');
exports.pascalCased = (text) => text
    .replace(/([A-Z_])/g, ' $1')
    .replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(/\s/g, '');
