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
    let body = readFileSync(filename, 'utf-8');
    let json: JSONSchema = JSON.parse(body);

    if (json.enum) {
      let name = basename(filename, extname(filename));
      this.enums.set(name, tsEnum(json.enum));
    } else {
      this.walk(json);
    }
  }

  compose(filename: string, callback: (error: boolean) => void): void {
    let contexts = this.merge();
    let outputRows: string[] = [];

    let rowsNamespace: {
      [namespace: string]: {
        enums: string[];
        interfaces: string[];
        aliases: string[];
      }
    } = {};

    let getNamespace = (prefix: string) => {
      rowsNamespace[prefix] = rowsNamespace[prefix] || { enums: [], interfaces: [], aliases: [] };
      return rowsNamespace[prefix];
    };

    this.enums.forEach((enums, n) => {
      let t = extractNamespace(n);
      let rows = getNamespace(t.prefix);
      rows.enums.push(`type ${t.suffix} = ${enums};`);
    });

    for (let context of contexts) {
      let master = context.names[0];
      let mastert = extractNamespace(master);
      let rows = getNamespace(mastert.prefix);

      let isEmpty = context.properties.length === 0;
      let curly = isEmpty ? '{}' : '{';

      if (context.parents.size) {
        let parents = Array.from(context.parents).map(x => x.names[0]).join(', ');
        rows.interfaces.push(`interface ${mastert.suffix} extends ${parents} ${curly}`);
      } else {
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
        let t = extractNamespace(alias);
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

    processString(filename, output, {
      baseDir: resolve(__dirname, '../'),
      replace: false,
      verify: false,
      tsconfig: false,
      tslint: false,
      editorconfig: false,
      tsfmt: true
    }).then(x => {
      writeFileSync(filename, x.dest);
      callback(x.error);
    });
  }

  private checkType(type: string | string[], context: string, key: string) {
    if (typeof type === 'string') {
      return type;
    } else {
      let enumString = tsEnum(type);
      let refs: string[] = [];
      this.enums.forEach((enums, ref) => {
        if (enums === enumString) {
          refs.push(ref);
        }
      });

      if (refs.length === 0) {
        let enumNewString = `${extractNamespace(context).prefix}.${pascalCased(key)}`;
        this.enums.set(enumNewString, enumString);
        return enumNewString;
      } else {
        return refs[0];
      }
    }
  }

  private merge() {
    let interfaces: { [context: string]: { [key: string]: IProperty[]; } } = {};

    for (let node of this.tree) {
      let type = this.checkType(node.type, node.context, node.key);
      let context = node.context;
      let key = node.key;
      let required = node.required;
      let extraSet = new Set<string>();

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
      let innerType = getInnerType(type);

      interfaces[context][key].push({ key, type, extras, required, innerType });
    }

    let contexts: IContext[] = [];

    for (let context of Object.keys(interfaces)) {
      let properties: IProperty[] = [];
      for (let key of Object.keys(interfaces[context])) {
        let nodes = unique(interfaces[context][key]);

        // Validate single node
        if (nodes.length > 1) {
          throw new Error('Cannot perform merge!');
        }

        let node = nodes[0];
        let innerType = node.innerType;

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

    let parentsMap = new Map<IContext, Set<IContext>>();
    contexts.forEach(c => parentsMap.set(c, new Set<IContext>()));

    // find aliases && parents
    for (let a = 0; a < contexts.length; a++) {
      for (let b = a + 1; b < contexts.length; b++) {
        let c1 = contexts[a];
        let c2 = contexts[b];
        if (c1.properties.length >= MIN_SUPER && c2.properties.length >= MIN_SUPER) {
          let a1 = isSuperContext(c1, c2);
          let a2 = isSuperContext(c2, c1);
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
          if (idx >= 0) { c.properties.splice(idx, 1); }
        }
      });

      if (c.names.length > 0) {
        c.properties.forEach((prop) => {
          let t1 = extractNamespace(c.names[0]);
          let t2 = extractNamespace(prop.innerType);
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

          for (let key of Object.keys(schema.properties)) {
            let child: JSONSchema = schema.properties[key];
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
