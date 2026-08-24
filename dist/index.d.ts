import { Transform } from 'node:stream';
export interface FileLike {
    path: string;
    contents: unknown;
    isStream(): boolean;
    isBuffer(): boolean;
    clone(): FileLike;
}
export type Namespace = string | false | ((file: FileLike) => string | false);
export interface OnceOptions {
    context?: string | false;
    namespace?: Namespace;
    algorithm?: string;
    file?: string | false;
    fileIndent?: number;
}
export declare class GulpOnceError extends Error {
    readonly plugin = "gulp-once";
    constructor(message: string, options?: ErrorOptions);
}
declare const create: (options?: OnceOptions | Namespace) => Transform;
declare const once: typeof create & {
    GulpOnceError: typeof GulpOnceError;
};
export default once;
export { once as 'module.exports' };
//# sourceMappingURL=index.d.ts.map