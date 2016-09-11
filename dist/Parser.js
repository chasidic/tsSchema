"use strict";
const typescript_formatter_1 = require('typescript-formatter');
const fs_1 = require('fs');
const path_1 = require('path');
const common_1 = require('./common');
const MIN_SUPER = 2;
class Parser {
    constructor() {
        this.enums = new Map();
        this.tree = [];
    }
    addFile(filename) {
        let body = fs_1.readFileSync(filename, 'utf-8');
        let json = JSON.parse(body);
        if (json.enum) {
            let name = path_1.basename(filename, path_1.extname(filename));
            this.enums.set(name, common_1.tsEnum(json.enum));
        }
        else {
            this.walk(json);
        }
    }
    compose(filename, callback) {
        let contexts = this.merge();
        let outputRows = [];
        let rowsNamespace = {};
        let getNamespace = (prefix) => {
            rowsNamespace[prefix] = rowsNamespace[prefix] || { enums: [], interfaces: [], aliases: [] };
            return rowsNamespace[prefix];
        };
        this.enums.forEach((enums, n) => {
            let t = common_1.extractNamespace(n);
            let rows = getNamespace(t.prefix);
            rows.enums.push(`type ${t.suffix} = ${enums};`);
        });
        for (let context of contexts) {
            let master = context.names[0];
            let mastert = common_1.extractNamespace(master);
            let rows = getNamespace(mastert.prefix);
            let isEmpty = context.properties.length === 0;
            let curly = isEmpty ? '{}' : '{';
            if (context.parents.size) {
                let parents = Array.from(context.parents).map(x => x.names[0]).join(', ');
                rows.interfaces.push(`interface ${mastert.suffix} extends ${parents} ${curly}`);
            }
            else {
                rows.interfaces.push(`interface ${mastert.suffix} ${curly}`);
            }
            for (let p of context.properties) {
                let required = p.required ? ':' : '?:';
                rows.interfaces.push(`${p.key}${required} ${p.type};${p.extras}`);
            }
            if (!isEmpty) {
                rows.interfaces.push('}');
            }
            rows.interfaces.push('');
            let aliases = context.names.slice(1).sort((a, b) => a.localeCompare(b));
            for (let alias of aliases) {
                let t = common_1.extractNamespace(alias);
                let rows = getNamespace(t.prefix);
                rows.aliases.push(`type ${t.suffix} = ${mastert.prefix === t.prefix ? mastert.suffix : master};`);
            }
        }
        for (let ns of Object.keys(rowsNamespace).sort()) {
            outputRows.push(`declare namespace ${ns} {`);
            for (let line of rowsNamespace[ns].enums) {
                outputRows.push(line);
            }
            if (rowsNamespace[ns].interfaces.length > 0) {
                outputRows.push('');
            }
            for (let line of rowsNamespace[ns].interfaces) {
                outputRows.push(line);
            }
            for (let line of rowsNamespace[ns].aliases) {
                outputRows.push(line);
            }
            outputRows.push('}\n');
        }
        let output = outputRows.join('\n');
        typescript_formatter_1.processString(filename, output, {
            baseDir: path_1.resolve(__dirname, '../'),
            replace: false,
            verify: false,
            tsconfig: false,
            tslint: false,
            editorconfig: false,
            tsfmt: true
        }).then(x => {
            fs_1.writeFileSync(filename, x.dest);
            callback(x.error);
        });
    }
    checkType(type, context, key) {
        if (typeof type === 'string') {
            return type;
        }
        else {
            let enumString = common_1.tsEnum(type);
            let refs = [];
            this.enums.forEach((enums, ref) => {
                if (enums === enumString) {
                    refs.push(ref);
                }
            });
            if (refs.length === 0) {
                let enumNewString = `${common_1.extractNamespace(context).prefix}.${common_1.pascalCased(key)}`;
                this.enums.set(enumNewString, enumString);
                return enumNewString;
            }
            else {
                return refs[0];
            }
        }
    }
    merge() {
        let interfaces = {};
        for (let node of this.tree) {
            let type = this.checkType(node.type, node.context, node.key);
            let context = node.context;
            let key = node.key;
            let required = node.required;
            let extraSet = new Set();
            interfaces[context] = interfaces[context] || {};
            interfaces[context][key] = interfaces[context][key] || [];
            if (type.startsWith('any')) {
                extraSet.add('?');
            }
            if (node.integer) {
                extraSet.add('INT');
            }
            if (node.format) {
                extraSet.add(`FORMAT: ${node.format}`);
            }
            let extras = extraSet.size > 0 ? ` // ${Array.from(extraSet).join(' & ')}` : '';
            interfaces[context][key].push({ key, type, extras, required });
        }
        let contexts = [];
        for (let context of Object.keys(interfaces)) {
            let properties = [];
            for (let key of Object.keys(interfaces[context])) {
                let nodes = common_1.unique(interfaces[context][key]);
                // Validate single node
                if (nodes.length > 1) {
                    throw new Error('Cannot perform merge!');
                }
                let node = nodes[0];
                let type = node.type;
                // Validate & Normalize references
                let innerType = common_1.getInnerType(type);
                if (!common_1.PREDEFINED.has(innerType)) {
                    if (!interfaces[innerType] && !this.enums.has(innerType)) {
                        throw new Error(`Bad reference: ${innerType} ${type}`);
                    }
                    else {
                        let t1 = common_1.extractNamespace(context);
                        let t2 = common_1.extractNamespace(innerType);
                        if (t1.prefix === t2.prefix) {
                            node.type = type.replace(innerType, t2.suffix);
                        }
                    }
                }
                properties.push(node);
            }
            properties.sort(common_1.propertiesSort);
            contexts.push({ names: [context], properties, parents: new Set() });
        }
        let parentsMap = new Map();
        contexts.forEach(c => parentsMap.set(c, new Set()));
        // find aliases && parents
        for (let a = 0; a < contexts.length; a++) {
            for (let b = a + 1; b < contexts.length; b++) {
                let c1 = contexts[a];
                let c2 = contexts[b];
                if (c1.properties.length >= MIN_SUPER && c2.properties.length >= MIN_SUPER) {
                    let a1 = common_1.isSuperContext(c1, c2);
                    let a2 = common_1.isSuperContext(c2, c1);
                    if (a1 && a2) {
                        c1.names = c1.names.concat(c2.names);
                        contexts.splice(b, 1);
                        b--;
                    }
                    else if (a1) {
                        parentsMap.get(c2).add(c1);
                    }
                    else if (a2) {
                        parentsMap.get(c1).add(c2);
                    }
                }
            }
        }
        // flatten parents
        for (let c of contexts) {
            let cSet = parentsMap.get(c);
            let newSet = new Set(cSet);
            cSet.forEach((p) => {
                parentsMap.get(p).forEach((s) => { newSet.delete(s); });
            });
            c.parents = newSet;
        }
        // clean parents properties
        for (let c of contexts) {
            c.parents.forEach((p) => {
                for (let prop of p.properties) {
                    let idx = c.properties.findIndex(x => x.key === prop.key);
                    if (idx >= 0) {
                        c.properties.splice(idx, 1);
                    }
                }
                c.properties.sort((a, b) => a.key.localeCompare(b.key));
            });
        }
        contexts.sort((a, b) => a.names[0].localeCompare(b.names[0]));
        return contexts;
    }
    walk(schema) {
        let out = null;
        switch (schema.type) {
            case 'object':
                if (schema.id && schema.properties) {
                    out = common_1.urnToId(schema.id);
                    for (let key of Object.keys(schema.properties)) {
                        let child = schema.properties[key];
                        let type = this.walk(child);
                        if (child.enum) {
                            type = child.enum;
                        }
                        let context = out;
                        let format = child.format || null;
                        let integer = child.type === 'integer';
                        let required = !!child.required;
                        this.tree.push({ context, key, type, format, integer, required, enum: child.enum || null });
                    }
                }
                else if (schema.$ref) {
                    out = common_1.urnToId(schema.$ref);
                }
                else if (schema.additionalProperties) {
                    out = `{ [key: string]: ${this.walk(schema.additionalProperties)} }`;
                }
                else {
                    out = 'any';
                    this.error(schema);
                }
                break;
            case 'array':
                out = (schema.items ? this.walk(schema.items) : 'any') + '[]';
                break;
            case 'boolean':
            case 'string':
            case 'number':
                out = schema.type;
                break;
            case 'integer':
                out = 'number';
                break;
            case 'any':
                out = 'any';
                break;
            default:
                if (schema.$ref) {
                    out = common_1.urnToId(schema.$ref);
                }
                else {
                    this.error(schema);
                }
        }
        return out;
    }
    error(schema) {
        // console.error(`bad object: ${ JSON.stringify(schema) }`);
    }
}
exports.Parser = Parser;
