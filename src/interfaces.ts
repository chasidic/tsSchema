export interface JSONSchema {
  type?: string;
  id?: string;
  properties?: { [name: string]: JSONSchema; };
  format?: string;
  items?: JSONSchema;
  $ref?: string;
  enum?: string[];
  required?: boolean;
  additionalProperties?: JSONSchema;
}

export interface JSONNode {
  context: string;
  key: string;
  type: string | string[];
  enum: string[];
  format: string;
  integer: boolean;
  required: boolean;
}

export interface IContext {
  names: string[];
  parents: Set<IContext>;
  properties: IProperty[];
}

export interface IProperty {
  key: string;
  type: string;
  extras: string;
  required: boolean;
  innerType: string;
}
