import { IContext, IProperty } from './interfaces';

export const GENERIC_REGEX = /^(.+?)\</;
export const PREDEFINED = new Set(['number', 'string', 'boolean', 'any']);

const ARRAY_TYPE = /^(.+?)(\[\])+$/;
const KEY_TYPE = /^\{ \[key: string\]: (.+?) \}$/;

export let getInnerType = (type: string) => {
  let match: RegExpMatchArray;
  if (match = type.match(ARRAY_TYPE)) { type = match[1]; }
  if (match = type.match(KEY_TYPE)) { type = match[1]; }
  return type;
};

export let propertiesSort = (a: IProperty, b: IProperty) => a.key.localeCompare(b.key);

export let shortId = (id: string) => {
  let index: number;
  index = id.lastIndexOf(':');
  if (index >= 0) { return id.slice(index + 1); }
  index = id.lastIndexOf('.');
  if (index >= 0) { return id.slice(index + 1); }
  return id;
};

export let urnToId = (id: string) => {
  let match = id.match(GENERIC_REGEX);
  if (match) { id = match[1]; }

  return id
    .replace('urn:jsonschema:', '')
    .replace(/:/g, '.');
};

const namespaceRegex = /^(.+)\.(.+?)$/;
export let extractNamespace = (n: string) => {
  let match = n.match(namespaceRegex);
  if (match) {
    let prefix = match[1];
    let suffix = match[2];
    return { prefix, suffix };
  } else {
    return { prefix: null, suffix: n };
  }
};

export let isSuperContext = (a: IContext, b: IContext): boolean => (
  a.properties.length > 0 &&
  b.properties.length > 0 &&
  a.properties.every(p1 =>
    b.properties.some(p2 =>
      p1.key === p2.key &&
      JSON.stringify(p1.type) === JSON.stringify(p2.type) &&
      p1.required === p2.required &&
      p1.extras === p2.extras
    )
  )
);

export let unique = <T>(array: T[]): T[] => {
  let serializedResults: string[] = [];
  return array.filter((item) => {
    let serialized = JSON.stringify(item);
    let uniq = serializedResults.every((i) => i !== serialized);
    if (uniq) { serializedResults.push(serialized); }
    return uniq;
  });
};

export let tsEnum = (e: string[]) => e.map(t => `'${t}'`).join(' | ');

export let pascalCased = (text: string) => text
  .replace(/([A-Z_])/g, ' $1')
  .replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
  .replace(/\s/g, '');
