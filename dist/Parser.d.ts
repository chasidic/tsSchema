export declare class Parser {
    private enums;
    private tree;
    addFile(filename: string): void;
    compose(filename: string, callback: (error: boolean) => void): Promise<void>;
    private checkType;
    private merge;
    private walk;
    private error;
}
