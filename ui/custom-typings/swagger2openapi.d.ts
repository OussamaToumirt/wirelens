declare module 'swagger2openapi' {
    import { OpenAPIObject } from "openapi-directory";

    interface ConvertOptions {
        resolve?: boolean;
        patch?: boolean;
        // Without this, conversion fails outright for any input containing repeated
        // object references, as YAML anchors & merge keys produce when parsed.
        anchors?: boolean;
    }

    export function convertObj(
        swagger: object,
        options: ConvertOptions,
        callback: (err: Error | null, result: {
            warnings?: string[]
            openapi: OpenAPIObject
        }) => void
    ): void;
}