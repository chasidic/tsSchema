"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_formatter_1 = require("typescript-formatter");
const fs_1 = require("fs");
const path_1 = require("path");
const common_1 = require("./common");
const MIN_SUPER = 2;
class Parser {
    constructor() {
        this.enums = new Map();
        this.tree = [];
    }
    addFile(filename) {
        const body = fs_1.readFileSync(filename, 'utf-8');
        const json = JSON.parse(body);
        if (json.enum) {
            const name = path_1.basename(filename, path_1.extname(filename));
            this.enums.set(name, common_1.tsEnum(json.enum));
        }
        else {
            this.walk(json);
        }
    }
    compose(filename, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            const contexts = this.merge();
            const outputRows = ['/* tslint:disable */', ''];
            const rowsNamespace = {};
            const getNamespace = (prefix) => {
                rowsNamespace[prefix] = rowsNamespace[prefix] || { enums: [], interfaces: [], aliases: [] };
                return rowsNamespace[prefix];
            };
            this.enums.forEach((enums, n) => {
                const t = common_1.extractNamespace(n);
                const rows = getNamespace(t.prefix);
                rows.enums.push(`type ${t.suffix} = ${enums};`);
            });
            for (const context of contexts) {
                const master = context.names[0];
                const mastert = common_1.extractNamespace(master);
                const rows = getNamespace(mastert.prefix);
                const isEmpty = context.properties.length === 0;
                const curly = isEmpty ? '{}' : '{';
                if (context.parents.size) {
                    const parents = Array.from(context.parents).map(x => x.names[0]).join(', ');
                    rows.interfaces.push(`interface ${mastert.suffix} extends ${parents} ${curly}`);
                }
                else {
                    rows.interfaces.push(`interface ${mastert.suffix} ${curly}`);
                }
                for (const p of context.properties) {
                    const required = p.required ? ':' : '?:';
                    rows.interfaces.push(`${p.key}${required} ${p.type};${p.extras}`);
                }
                if (!isEmpty) {
                    rows.interfaces.push('}');
                }
                rows.interfaces.push('');
                const aliases = context.names.slice(1).sort((a, b) => a.localeCompare(b));
                for (const alias of aliases) {
                    const t = common_1.extractNamespace(alias);
                    const aliasRows = getNamespace(t.prefix);
                    aliasRows.aliases.push(`type ${t.suffix} = ${mastert.prefix === t.prefix ? mastert.suffix : master};`);
                }
            }
            for (const ns of Object.keys(rowsNamespace).sort()) {
                outputRows.push(`declare namespace ${ns} {`);
                for (const line of rowsNamespace[ns].enums) {
                    outputRows.push(line);
                }
                if (rowsNamespace[ns].interfaces.length > 0) {
                    outputRows.push('');
                }
                for (const line of rowsNamespace[ns].interfaces) {
                    outputRows.push(line);
                }
                for (const line of rowsNamespace[ns].aliases) {
                    outputRows.push(line);
                }
                outputRows.push('}\n');
            }
            const output = outputRows.join('\n');
            const x = yield typescript_formatter_1.processString(filename, output, {
                baseDir: path_1.resolve(__dirname, '../'),
                replace: false,
                verify: false,
                tsconfig: false,
                tslint: false,
                editorconfig: false,
                tsfmt: true,
                tsconfigFile: null,
                tslintFile: null,
                vscode: false,
                tsfmtFile: null
            });
            fs_1.writeFileSync(filename, x.dest);
            callback(x.error);
        });
    }
    checkType(type, context, key) {
        if (typeof type === 'string') {
            return type;
        }
        else {
            const enumString = common_1.tsEnum(type);
            const refs = [];
            this.enums.forEach((enums, ref) => {
                if (enums === enumString) {
                    refs.push(ref);
                }
            });
            if (refs.length === 0) {
                const enumNewString = `${common_1.extractNamespace(context).prefix}.${common_1.pascalCased(key)}`;
                this.enums.set(enumNewString, enumString);
                return enumNewString;
            }
            else {
                return refs[0];
            }
        }
    }
    merge() {
        const interfaces = {};
        for (const node of this.tree) {
            const type = this.checkType(node.type, node.context, node.key);
            const context = node.context;
            const key = node.key;
            const required = node.required;
            const extraSet = new Set();
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
            const extras = extraSet.size > 0 ? ` // ${Array.from(extraSet).join(' & ')}` : '';
            const innerType = common_1.getInnerType(type);
            interfaces[context][key].push({ key, type, extras, required, innerType });
        }
        const contexts = [];
        for (const context of Object.keys(interfaces)) {
            const properties = [];
            for (const key of Object.keys(interfaces[context])) {
                const nodes = common_1.unique(interfaces[context][key]);
                // Validate single node
                if (nodes.length > 1) {
                    throw new Error('Cannot perform merge!');
                }
                const node = nodes[0];
                const innerType = node.innerType;
                // Validate & Normalize references
                if (!common_1.PREDEFINED.has(innerType)) {
                    if (!interfaces[innerType] && !this.enums.has(innerType)) {
                        throw new Error(`Bad reference: ${innerType} ${node.type}`);
                    }
                }
                properties.push(node);
            }
            contexts.push({ names: [context], properties, parents: new Set() });
        }
        const parentsMap = new Map();
        contexts.forEach(c => parentsMap.set(c, new Set()));
        // find aliases && parents
        for (let a = 0; a < contexts.length; a++) {
            for (let b = a + 1; b < contexts.length; b++) {
                const c1 = contexts[a];
                const c2 = contexts[b];
                if (c1.properties.length >= MIN_SUPER && c2.properties.length >= MIN_SUPER) {
                    const a1 = common_1.isSuperContext(c1, c2);
                    const a2 = common_1.isSuperContext(c2, c1);
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
        for (const c of contexts) {
            const cSet = parentsMap.get(c);
            const newSet = new Set(cSet);
            cSet.forEach((p) => {
                parentsMap.get(p).forEach((s) => { newSet.delete(s); });
            });
            c.parents = newSet;
        }
        // clean parents properties
        for (const c of contexts) {
            c.parents.forEach((p) => {
                for (const prop of p.properties) {
                    const idx = c.properties.findIndex(x => x.key === prop.key);
                    if (idx >= 0) {
                        c.properties.splice(idx, 1);
                    }
                }
            });
            if (c.names.length > 0) {
                c.properties.forEach((prop) => {
                    const t1 = common_1.extractNamespace(c.names[0]);
                    const t2 = common_1.extractNamespace(prop.innerType);
                    if (t1.prefix === t2.prefix) {
                        prop.type = prop.type.replace(prop.innerType, t2.suffix);
                    }
                });
            }
            c.properties.sort(common_1.propertiesSort);
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
                    for (const key of Object.keys(schema.properties)) {
                        const child = schema.properties[key];
                        let type = this.walk(child);
                        if (child.enum) {
                            type = child.enum;
                        }
                        const context = out;
                        const format = child.format || null;
                        const integer = child.type === 'integer';
                        const required = !!child.required;
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
