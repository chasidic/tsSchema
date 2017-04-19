import { processString } from 'typescript-formatter';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename, extname } from 'path';

import {
  JSONSchema,
  JSONNode,
  IProperty,
  IContext
} from './interfaces';

import {
  unique,
  pascalCased,
  urnToId,
  tsEnum,
  extractNamespace,
  isSuperContext,
  propertiesSort,
  getInnerType,
  PREDEFINED
} from './common';

const MIN_SUPER = 2;

export class Parser {

  private enums = new Map<string, string>();
  private tree: JSONNode[] = [];

  addFile(filename: string) {
    const body = readFileSync(filename, 'utf-8');
    const json: JSONSchema = JSON.parse(body);

    if (json.enum) {
      const name = basename(filename, extname(filename));
      this.enums.set(name, tsEnum(json.enum));
    } else {
      this.walk(json);
    }
  }

  async compose(filename: string, callback: (error: boolean) => void): Promise<void> {
    const contexts = this.merge();
    const outputRows: string[] = ['/* tslint:disable */', ''];

    const rowsNamespace: {
      [namespace: string]: {
        enums: string[];
        interfaces: string[];
        aliases: string[];
      }
    } = {};

    const getNamespace = (prefix: string) => {
      rowsNamespace[prefix] = rowsNamespace[prefix] || { enums: [], interfaces: [], aliases: [] };
      return rowsNamespace[prefix];
    };

    this.enums.forEach((enums, n) => {
      const t = extractNamespace(n);
      const rows = getNamespace(t.prefix);
      rows.enums.push(`type ${t.suffix} = ${enums};`);
    });

    for (const context of contexts) {
      const master = context.names[0];
      const mastert = extractNamespace(master);
      const rows = getNamespace(mastert.prefix);

      const isEmpty = context.properties.length === 0;
      const curly = isEmpty ? '{}' : '{';

      if (context.parents.size) {
        const parents = Array.from(context.parents).map(x => x.names[0]).join(', ');
        rows.interfaces.push(`interface ${mastert.suffix} extends ${parents} ${curly}`);
      } else {
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
        const t = extractNamespace(alias);
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

    const x = await processString(filename, output, {
      baseDir: resolve(__dirname, '../'),
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

    writeFileSync(filename, x.dest);
    callback(x.error);
  }

  private checkType(type: string | string[], context: string, key: string) {
    if (typeof type === 'string') {
      return type;
    } else {
      const enumString = tsEnum(type);
      const refs: string[] = [];
      this.enums.forEach((enums, ref) => {
        if (enums === enumString) {
          refs.push(ref);
        }
      });

      if (refs.length === 0) {
        const enumNewString = `${extractNamespace(context).prefix}.${pascalCased(key)}`;
        this.enums.set(enumNewString, enumString);
        return enumNewString;
      } else {
        return refs[0];
      }
    }
  }

  private merge() {
    const interfaces: { [context: string]: { [key: string]: IProperty[]; } } = {};

    for (const node of this.tree) {
      const type = this.checkType(node.type, node.context, node.key);
      const context = node.context;
      const key = node.key;
      const required = node.required;
      const extraSet = new Set<string>();

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
      const innerType = getInnerType(type);

      interfaces[context][key].push({ key, type, extras, required, innerType });
    }

    const contexts: IContext[] = [];

    for (const context of Object.keys(interfaces)) {
      const properties: IProperty[] = [];
      for (const key of Object.keys(interfaces[context])) {
        const nodes = unique(interfaces[context][key]);

        // Validate single node
        if (nodes.length > 1) {
          throw new Error('Cannot perform merge!');
        }

        const node = nodes[0];
        const innerType = node.innerType;

        // Validate & Normalize references
        if (!PREDEFINED.has(innerType)) {
          if (!interfaces[innerType] && !this.enums.has(innerType)) {
            throw new Error(`Bad reference: ${innerType} ${node.type}`);
          }
        }

        properties.push(node);
      }

      contexts.push({ names: [context], properties, parents: new Set<IContext>() });
    }

    const parentsMap = new Map<IContext, Set<IContext>>();
    contexts.forEach(c => parentsMap.set(c, new Set<IContext>()));

    // find aliases && parents
    for (let a = 0; a < contexts.length; a++) {
      for (let b = a + 1; b < contexts.length; b++) {
        const c1 = contexts[a];
        const c2 = contexts[b];
        if (c1.properties.length >= MIN_SUPER && c2.properties.length >= MIN_SUPER) {
          const a1 = isSuperContext(c1, c2);
          const a2 = isSuperContext(c2, c1);
          if (a1 && a2) {
            c1.names = c1.names.concat(c2.names);
            contexts.splice(b, 1);
            b--;
          } else if (a1) {
            parentsMap.get(c2).add(c1);
          } else if (a2) {
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
          if (idx >= 0) { c.properties.splice(idx, 1); }
        }
      });

      if (c.names.length > 0) {
        c.properties.forEach((prop) => {
          const t1 = extractNamespace(c.names[0]);
          const t2 = extractNamespace(prop.innerType);
          if (t1.prefix === t2.prefix) {
            prop.type = prop.type.replace(prop.innerType, t2.suffix);
          }
        });
      }

      c.properties.sort(propertiesSort);
    }

    contexts.sort((a, b) => a.names[0].localeCompare(b.names[0]));
    return contexts;
  }

  private walk(schema: JSONSchema): string | string[] {
    let out: string = null;

    switch (schema.type) {
      case 'object':
        if (schema.id && schema.properties) {
          out = urnToId(schema.id);

          for (const key of Object.keys(schema.properties)) {
            const child: JSONSchema = schema.properties[key];
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
        } else if (schema.$ref) {
          out = urnToId(schema.$ref);
        } else if (schema.additionalProperties) {
          out = `{ [key: string]: ${this.walk(schema.additionalProperties)} }`;
        } else {
          out = 'any';
          this.error(schema);
        }
        break;
      case 'array':
        out = (schema.items ? this.walk(schema.items) : 'any') + '[]'; break;
      case 'boolean':
      case 'string':
      case 'number':
        out = schema.type; break;
      case 'integer':
        out = 'number'; break;
      case 'any':
        out = 'any'; break;
      default:
        if (schema.$ref) {
          out = urnToId(schema.$ref);
        } else {
          this.error(schema);
        }
    }

    return out;
  }

  private error(schema: JSONSchema) {
    // console.error(`bad object: ${ JSON.stringify(schema) }`);
  }
}
