import { expect } from "../../test-setup";

import { formatBuffer } from '../../../src/services/ui-worker-formatters';

const bufferFromHex = (hex: string) => Buffer.from(hex.replace(/:/g, ''), 'hex');

const format = (hex: string, type: 'protobuf' | 'grpc-proto' = 'protobuf') => {
    const buffer = bufferFromHex(hex);
    return formatBuffer(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
        type
    );
};

describe("Protobuf formatting", () => {

    it("should render integers of every size as numbers, not strings", () => {
        // #1 = 1, #2 = 2^53 + 1 and #3 = a nanosecond timestamp, both of which are
        // larger than a JS number can represent exactly:
        expect(format(
            '08:01:' +
            '10:81:80:80:80:80:80:80:10:' +
            '18:b8:86:a1:8a:c9:de:af:fc:17'
        )).to.equal([
            '{',
            '  "1": 1,',
            '  "2": 9007199254740993,',
            '  "3": 1727340414715315000',
            '}'
        ].join('\n'));
    });

    it("should render strings, doubles and floats", () => {
        // #1 = "hi", #2 = 1727340414.715315 (double), #3 = 0.5 (float)
        expect(format(
            '0a:02:68:69:' +
            '11:b9:c7:ad:df:47:bd:d9:41:' +
            '1d:00:00:00:3f'
        )).to.equal([
            '{',
            '  "1": "hi",',
            '  "2": 1727340414.715315,',
            '  "3": 0.5',
            '}'
        ].join('\n'));
    });

    it("should expand byte fields into a readable view", () => {
        // #1 = a PNG header plus trailing bytes, which is not valid UTF-8, protobuf
        // or a packed list of any kind:
        expect(format('0a:0c:89:50:4e:47:0d:0a:1a:0a:00:01:02:ff')).to.equal([
            '{',
            '  "1": {',
            '    "Type": "Buffer (12 bytes)",',
            '    "As string": "\u2030PNG\\r\\n\\u001a\\n\\u0000\\u0001\\u0002\u00ff",',
            '    "As hex": "89 50 4E 47 0D 0A 1A 0A 00 01 02 FF"',
            '  }',
            '}'
        ].join('\n'));
    });

    it("should indent nested messages and repeated fields", () => {
        // #1 = { #1: "a" }, #2 = "x", #2 = "y" (repeated)
        expect(format('0a:03:0a:01:61:12:01:78:12:01:79')).to.equal([
            '{',
            '  "1": {',
            '    "1": "a"',
            '  },',
            '  "2": [',
            '    "x",',
            '    "y"',
            '  ]',
            '}'
        ].join('\n'));
    });

    it("should render an empty length-delimited field as an empty string", () => {
        expect(format('0a:00')).to.equal([
            '{',
            '  "1": ""',
            '}'
        ].join('\n'));
    });

    it("should render each message of a multi-message gRPC body", () => {
        // Two uncompressed length-prefixed messages, each { #1: <string> }
        expect(format(
            '00:00:00:00:04:0a:02:68:69:' +
            '00:00:00:00:05:0a:03:62:79:65',
            'grpc-proto'
        )).to.equal([
            '[',
            '  {',
            '    "1": "hi"',
            '  },',
            '  {',
            '    "1": "bye"',
            '  }',
            ']'
        ].join('\n'));
    });

});
