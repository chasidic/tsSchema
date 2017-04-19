import { IContext, IProperty } from './interfaces';
export declare const GENERIC_REGEX: RegExp;
export declare const PREDEFINED: Set<string>;
export declare const getInnerType: (type: string) => string;
export declare const propertiesSort: (a: IProperty, b: IProperty) => number;
export declare const shortId: (id: string) => string;
export declare const urnToId: (id: string) => string;
export declare const extractNamespace: (n: string) => {
    prefix: string;
    suffix: string;
};
export declare const isSuperContext: (a: IContext, b: IContext) => boolean;
export declare const unique: <T>(array: T[]) => T[];
export declare const tsEnum: (e: string[]) => string;
export declare const pascalCased: (text: string) => string;
