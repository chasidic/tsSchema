import { IContext, IProperty } from './interfaces';
export declare const GENERIC_REGEX: RegExp;
export declare const PREDEFINED: Set<string>;
export declare let getInnerType: (type: string) => string;
export declare let propertiesSort: (a: IProperty, b: IProperty) => number;
export declare let shortId: (id: string) => string;
export declare let urnToId: (id: string) => string;
export declare let extractNamespace: (n: string) => {
    prefix: string;
    suffix: string;
};
export declare let isSuperContext: (a: IContext, b: IContext) => boolean;
export declare let unique: <T>(array: T[]) => T[];
export declare let tsEnum: (e: string[]) => string;
export declare let pascalCased: (text: string) => string;
