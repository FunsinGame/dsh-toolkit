import { createRequire as __dmpCreateRequire } from 'node:module';
const require = __dmpCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e2) {
    throw err = [e2], e2;
  }
};
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e2) {
    throw mod = 0, e2;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/simple-yenc/dist/esm.js
var t, e;
var init_esm = __esm({
  "node_modules/simple-yenc/dist/esm.js"() {
    t = (t2, n = 4294967295, e2 = 79764919) => {
      const r = new Int32Array(256);
      let o, s, i, c = n;
      for (o = 0; o < 256; o++) {
        for (i = o << 24, s = 8; s > 0; --s) i = 2147483648 & i ? i << 1 ^ e2 : i << 1;
        r[o] = i;
      }
      for (o = 0; o < t2.length; o++) c = c << 8 ^ r[255 & (c >> 24 ^ t2[o])];
      return c;
    };
    e = (n, e2 = t) => {
      const r = (t2) => new Uint8Array(t2.length / 2).map(((n2, e3) => parseInt(t2.substring(2 * e3, 2 * (e3 + 1)), 16))), o = (t2) => r(t2)[0], s = /* @__PURE__ */ new Map();
      [, 8364, , 8218, 402, 8222, 8230, 8224, 8225, 710, 8240, 352, 8249, 338, , 381, , , 8216, 8217, 8220, 8221, 8226, 8211, 8212, 732, 8482, 353, 8250, 339, , 382, 376].forEach(((t2, n2) => s.set(t2, n2)));
      const i = new Uint8Array(n.length);
      let c, a, l, f = false, g = 0, h = 42, p = n.length > 13 && "dynEncode" === n.substring(0, 9), u = 0;
      p && (u = 11, a = o(n.substring(9, u)), a <= 1 && (u += 2, h = o(n.substring(11, u))), 1 === a && (u += 8, l = ((t2) => new DataView(r(t2).buffer).getInt32(0, true))(n.substring(13, u))));
      const d = 256 - h;
      for (let t2 = u; t2 < n.length; t2++) if (c = n.charCodeAt(t2), 61 !== c || f) {
        if (92 === c && t2 < n.length - 5 && p) {
          const e3 = n.charCodeAt(t2 + 1);
          117 !== e3 && 85 !== e3 || (c = parseInt(n.substring(t2 + 2, t2 + 6), 16), t2 += 5);
        }
        if (c > 255) {
          const t3 = s.get(c);
          t3 && (c = t3 + 127);
        }
        f && (f = false, c -= 64), i[g++] = c < h && c > 0 ? c + d : c - h;
      } else f = true;
      const m = i.subarray(0, g);
      if (p && 1 === a) {
        const t2 = e2(m);
        if (t2 !== l) {
          const n2 = "Decode failed crc32 validation";
          throw console.error("`simple-yenc`\n", n2 + "\n", "Expected: " + l + "; Got: " + t2 + "\n", "Visit https://github.com/eshaz/simple-yenc for more information"), Error(n2);
        }
      }
      return m;
    };
  }
});

// node_modules/@wasm-audio-decoders/common/src/WASMAudioDecoderCommon.js
function WASMAudioDecoderCommon() {
  const uint8Array2 = Uint8Array;
  const float32Array = Float32Array;
  if (!WASMAudioDecoderCommon.modules) {
    Object.defineProperties(WASMAudioDecoderCommon, {
      modules: {
        value: /* @__PURE__ */ new WeakMap()
      },
      setModule: {
        value(Ref, module) {
          WASMAudioDecoderCommon.modules.set(Ref, Promise.resolve(module));
        }
      },
      getModule: {
        value(Ref, wasmString) {
          let module = WASMAudioDecoderCommon.modules.get(Ref);
          if (!module) {
            if (!wasmString) {
              wasmString = Ref.wasm;
              module = WASMAudioDecoderCommon.inflateDynEncodeString(
                wasmString
              ).then((data3) => WebAssembly.compile(data3));
            } else {
              module = WebAssembly.compile(e(wasmString));
            }
            WASMAudioDecoderCommon.modules.set(Ref, module);
          }
          return module;
        }
      },
      concatFloat32: {
        value(buffers, length2) {
          let ret = new float32Array(length2), i = 0, offset = 0;
          while (i < buffers.length) {
            ret.set(buffers[i], offset);
            offset += buffers[i++].length;
          }
          return ret;
        }
      },
      getDecodedAudio: {
        value: (errors, channelData, samplesDecoded, sampleRate2, bitDepth2) => ({
          errors,
          channelData,
          samplesDecoded,
          sampleRate: sampleRate2,
          bitDepth: bitDepth2
        })
      },
      getDecodedAudioMultiChannel: {
        value(errors, input, channelsDecoded, samplesDecoded, sampleRate2, bitDepth2) {
          let channelData = [], i, j;
          for (i = 0; i < channelsDecoded; i++) {
            const channel2 = [];
            for (j = 0; j < input.length; ) channel2.push(input[j++][i] || []);
            channelData.push(
              WASMAudioDecoderCommon.concatFloat32(channel2, samplesDecoded)
            );
          }
          return WASMAudioDecoderCommon.getDecodedAudio(
            errors,
            channelData,
            samplesDecoded,
            sampleRate2,
            bitDepth2
          );
        }
      },
      /*
       ******************
       * Compression Code
       ******************
       */
      inflateDynEncodeString: {
        value(source) {
          source = e(source);
          return new Promise((resolve3) => {
            const puffString = String.raw`dynEncode012804c7886d()((()>+*§§)§,§§§§)§+§§§)§+.-()(*)-+)(.7*§)i¸¸,3§(i¸¸,3/G+.¡*(,(,3+)2å:-),§H(P*DI*H(P*@I++hH)H*r,hH(H(P*<J,i)^*<H,H(P*4U((I-H(H*i0J,^*DH+H-H*I+H,I*4)33H(H*H)^*DH(H+H)^*@H+i§H)i§3æ*).§K(iHI/+§H,iHn,§H+i(H+i(rCJ0I,H*I-+hH,,hH(H-V)(i)J.H.W)(i)c)(H,i)I,H-i*I-4)33i(I.*hH(V)(H+n5(H(i*I-i(I,i)I.+hH,i*J+iHn,hi(I-i*I,+hH,H/H-c)(H,iFn,hi(I,+hH,H0n5-H*V)(J(,hH/H(i)J(H(V)(J(i)c)(H)H(i)H,c)(3H*i*I*H,i)I,4(3(-H(H,W)(H-I-H,i*I,4)3(3(3H,H-I1H+I,H.i)H1V)(J.i(v5(33H.-H(H,i(c)(H,i*I,4)333)-§i*I*+§H*iHn,hi73H,H(i)8(H+J+H)P*(H*V)(J-r,§H)P*,H.i)H+H,i)V)(-H*i*I*H+i)I+H-H.I.H,H-i)I,4)333Ã+)-§iø7i(^*(iü7I,*h+hH+iDn,h*hilI+i)I,+hH+,hH+iô7H,c)(i)H+i´8W)(H,I,H+i*I+4)-+hH(H)8*J-i(p5.*h*h*hH-i')u,hH(P*(J+,hH(P*0J,H(P*,n50H+H,H-b((3H(P*0i)I.4)3H-i¨*n5*H-iÅ*s,hi73H-i)J+V)&+I,H(H+V)æ,8(I.H(H*8*J-i(p51H-i)J+i¸7V)(H(H+iø7V)(8(J/H(P*0J+s,hi73H+H,H.J,I.H(P*(m5(H.H(P*,s5.+hH,m5*H(P*(J.H+H.H+H/U((b((H(H(P*0i)J+^*0H,i)I,4(3(3H(H.^*03H-i¨*o5)33i(73(3(3-H,H+i)c)(H,i*I,H+i)I+4)33i)I-3H-3!2)0§K(i2J,L(H,H(^*(H,H*^*4H,i(^*0H,i(^*DH,j(_*<H,H)P*(^*,H,H+P*(^*8*h*h+hH,i)8(I3i§I**h*h*h*h*h*h*hH,i*8(6+(),03H,j(_*@i*I-H,P*<J.i,J(H,P*8J/s50H,H.i+J0^*<i¦I*H.H,P*4J1J.U(*H.U((J2i')o5/H.U()I.H,H(^*<H0H1U((H.i0J.i§i0i')o5/H/H.H2J*H(J.q50H,P*0J/H*I-H,P*(J0,hH,P*,H-q,hi)I-423+hH*m5+H/H0H(H1U((b((H/i)I/H(i)I(H*i)I*4(3(3H,H.^*<H,H-^*04*3iØ1U((5+i(I(i¨7i1^*(i$6iè1^*(i°7iè6^*(i¬7iÈ6^*(+hH(iÈ*n,hiÈ*I(+hH(i¨,n,hi¨,I(+hH(iØ,n,hiØ,I(+hH(iè,o,hH,i-H(i0c)(H(i*I(4)33iè1i1H,i-iÈ*8)Bi(I(+hH(ido,hH,i-H(i-c)(H(i*I(4)33iÈ6iè6H,i-iF8)BiØ1i)b((41-H,i-H(i/c)(H(i*I(4)3(3(-H,i-H(i1c)(H(i*I(4)3(3(-H,i-H(i0c)(H(i*I(4)3(3(3H,H/^*0H,H(^*<3i(I*4*3H,H,i¸)^*TH,H,iø-^*PH,H,iX^*LH,H,i(^*HH,i-8(I(H,i-8(I-i¥I*H,i,8(I.H(iErH-iEr5)H(i©*I1H-i)I0i(i;H.i,J(i(H(i(rCJ(J*H*i;sCI*i¨1I-H(I/+hH/,hH,i-H-V)(i)H,i+8(c)(H/i)I/H-i*I-H*i)I*4)-H(i)i¨1I/+hH(H*o,hH,i-H/V)(i)i(c)(H/i*I/H(i)I(4)33i¤I*H,iø-H,i¸)H,i-i;8)5+H0H1I2i(I-+hH-H2p,hH,H,iP8*J*i(p5-H*i7u,hH,i-H-i)H*c)(H-i)I-4*3i(I/i+I.i+I(*h*h*hH*i86*(*)3H-m,hi£I*403H-i)H,W)-I/i*I(4)3i3I.i/I(3H2H,H(8(H.J(H-J.p,hi¢I*4.3H,i-H-i)I*+hH(,hH*H/c)(H*i*I*H(i)I(4)-H.I-4+3(3(33H,W)1m,hiI*4,3H,iø-H,i¸)H,i-H18)J(,hi¡I*H(i(p5,H1H,V)ú-H,V)ø-o5,3H,i(H,iXH,i-H1i)H08)J(,hi I*H(i(p5,H0H,V)H,V)o5,3H,H,iPH,iH8+I*4+3(3(3H,i$6i¬78+I*3H*H3m5(3i)I-H*i(r5)3H)H,P*0^*(H+H,P*<^*(H*I-3H,i2L(H-33Á)+(i¨03b+(,(-(.(/(0(1(2(3(5(7(9(;(?(C(G(K(S([(c(k({(((«(Ë(ë((*)(iø03O)()()()(*(*(*(*(+(+(+(+(,(,(,(,(-(-(-(-(i¨13M8(9(:(((0(/(1(.(2(-(3(,(4(+(5(*(6()(7(T7*S7US0U `;
            WASMAudioDecoderCommon.getModule(WASMAudioDecoderCommon, puffString).then((wasm) => WebAssembly.instantiate(wasm, {})).then(({ exports }) => {
              const instanceExports = new Map(Object.entries(exports));
              const puff = instanceExports.get("puff");
              const memory = instanceExports.get("memory")["buffer"];
              const dataArray = new uint8Array2(memory);
              const heapView = new DataView(memory);
              let heapPos = instanceExports.get("__heap_base");
              const sourceLength = source.length;
              const sourceLengthPtr = heapPos;
              heapPos += 4;
              heapView.setInt32(sourceLengthPtr, sourceLength, true);
              const sourcePtr = heapPos;
              heapPos += sourceLength;
              dataArray.set(source, sourcePtr);
              const destLengthPtr = heapPos;
              heapPos += 4;
              heapView.setInt32(
                destLengthPtr,
                dataArray.byteLength - heapPos,
                true
              );
              puff(heapPos, destLengthPtr, sourcePtr, sourceLengthPtr);
              resolve3(
                dataArray.slice(
                  heapPos,
                  heapPos + heapView.getInt32(destLengthPtr, true)
                )
              );
            });
          });
        }
      }
    });
  }
  Object.defineProperty(this, "wasm", {
    enumerable: true,
    get: () => this._wasm
  });
  this.getOutputChannels = (outputData, channelsDecoded, samplesDecoded) => {
    let output = [], i = 0;
    while (i < channelsDecoded)
      output.push(
        outputData.slice(
          i * samplesDecoded,
          i++ * samplesDecoded + samplesDecoded
        )
      );
    return output;
  };
  this.allocateTypedArray = (len, TypedArray, setPointer = true) => {
    const ptr = this._wasm.malloc(TypedArray.BYTES_PER_ELEMENT * len);
    if (setPointer) this._pointers.add(ptr);
    return {
      ptr,
      len,
      buf: new TypedArray(this._wasm.HEAP, ptr, len)
    };
  };
  this.free = () => {
    this._pointers.forEach((ptr) => {
      this._wasm.free(ptr);
    });
    this._pointers.clear();
  };
  this.codeToString = (ptr) => {
    const characters = [], heap = new Uint8Array(this._wasm.HEAP);
    for (let character = heap[ptr]; character !== 0; character = heap[++ptr])
      characters.push(character);
    return String.fromCharCode.apply(null, characters);
  };
  this.addError = (errors, message, frameLength2, frameNumber2, inputBytes, outputSamples) => {
    errors.push({
      message,
      frameLength: frameLength2,
      frameNumber: frameNumber2,
      inputBytes,
      outputSamples
    });
  };
  this.instantiate = (_EmscriptenWASM, _module) => {
    if (_module) WASMAudioDecoderCommon.setModule(_EmscriptenWASM, _module);
    this._wasm = new _EmscriptenWASM(WASMAudioDecoderCommon).instantiate();
    this._pointers = /* @__PURE__ */ new Set();
    return this._wasm.ready.then(() => this);
  };
}
var init_WASMAudioDecoderCommon = __esm({
  "node_modules/@wasm-audio-decoders/common/src/WASMAudioDecoderCommon.js"() {
    init_esm();
  }
});

// src/host/audio/web-worker-shim.ts
var InertWorker;
var init_web_worker_shim = __esm({
  "src/host/audio/web-worker-shim.ts"() {
    "use strict";
    InertWorker = class {
      constructor() {
        throw new Error("dsh-music-player does not use the worker decoder");
      }
    };
  }
});

// node_modules/@wasm-audio-decoders/common/src/WASMAudioDecoderWorker.js
var getWorker, WASMAudioDecoderWorker;
var init_WASMAudioDecoderWorker = __esm({
  "node_modules/@wasm-audio-decoders/common/src/WASMAudioDecoderWorker.js"() {
    init_web_worker_shim();
    init_WASMAudioDecoderCommon();
    getWorker = () => globalThis.Worker || InertWorker;
    WASMAudioDecoderWorker = class extends getWorker() {
      constructor(options, name2, Decoder, EmscriptenWASM2) {
        if (!WASMAudioDecoderCommon.modules) new WASMAudioDecoderCommon();
        let source = WASMAudioDecoderCommon.modules.get(Decoder);
        if (!source) {
          let type = "text/javascript", isNode, webworkerSourceCode = `'use strict';(${((_Decoder, _WASMAudioDecoderCommon, _EmscriptenWASM) => {
            let decoder, moduleResolve, modulePromise = new Promise((resolve3) => {
              moduleResolve = resolve3;
            });
            self.onmessage = ({ data: { id, command, data: data3 } }) => {
              let messagePromise = modulePromise, messagePayload = { id }, transferList;
              if (command === "init") {
                Object.defineProperties(_Decoder, {
                  WASMAudioDecoderCommon: { value: _WASMAudioDecoderCommon },
                  EmscriptenWASM: { value: _EmscriptenWASM },
                  module: { value: data3.module },
                  isWebWorker: { value: true }
                });
                decoder = new _Decoder(data3.options);
                moduleResolve();
              } else if (command === "free") {
                decoder.free();
              } else if (command === "ready") {
                messagePromise = messagePromise.then(() => decoder.ready);
              } else if (command === "reset") {
                messagePromise = messagePromise.then(() => decoder.reset());
              } else {
                Object.assign(
                  messagePayload,
                  decoder[command](
                    // detach buffers
                    Array.isArray(data3) ? data3.map((data4) => new Uint8Array(data4)) : new Uint8Array(data3)
                  )
                );
                transferList = messagePayload.channelData ? messagePayload.channelData.map((channel2) => channel2.buffer) : [];
              }
              messagePromise.then(
                () => self.postMessage(messagePayload, transferList)
              );
            };
          }).toString()})(${Decoder}, ${WASMAudioDecoderCommon}, ${EmscriptenWASM2})`;
          try {
            isNode = typeof process.versions.node !== "undefined";
          } catch {
          }
          source = isNode ? `data:${type};base64,${Buffer.from(webworkerSourceCode).toString(
            "base64"
          )}` : URL.createObjectURL(new Blob([webworkerSourceCode], { type }));
          WASMAudioDecoderCommon.modules.set(Decoder, source);
        }
        super(source, { name: name2 });
        this._id = Number.MIN_SAFE_INTEGER;
        this._enqueuedOperations = /* @__PURE__ */ new Map();
        this.onmessage = ({ data: data3 }) => {
          const { id, ...rest } = data3;
          this._enqueuedOperations.get(id)(rest);
          this._enqueuedOperations.delete(id);
        };
        new EmscriptenWASM2(WASMAudioDecoderCommon).getModule().then((module) => {
          this.postToDecoder("init", { module, options });
        });
      }
      async postToDecoder(command, data3) {
        return new Promise((resolve3) => {
          this.postMessage({
            command,
            id: this._id,
            data: data3
          });
          this._enqueuedOperations.set(this._id++, resolve3);
        });
      }
      get ready() {
        return this.postToDecoder("ready");
      }
      async free() {
        await this.postToDecoder("free").finally(() => {
          this.terminate();
        });
      }
      async reset() {
        await this.postToDecoder("reset");
      }
    };
  }
});

// node_modules/@wasm-audio-decoders/common/src/utilities.js
var assignNames;
var init_utilities = __esm({
  "node_modules/@wasm-audio-decoders/common/src/utilities.js"() {
    assignNames = (Class, name2) => {
      Object.defineProperty(Class, "name", { value: name2 });
    };
  }
});

// node_modules/@wasm-audio-decoders/common/index.js
var init_common = __esm({
  "node_modules/@wasm-audio-decoders/common/index.js"() {
    init_WASMAudioDecoderCommon();
    init_WASMAudioDecoderWorker();
    init_utilities();
  }
});

// node_modules/codec-parser/src/constants.js
var symbol, mappingJoin, channelMappings, lfe, monophonic, stereo, surround, getChannelMapping, vorbisOpusChannelMapping, rate192000, rate176400, rate96000, rate88200, rate64000, rate48000, rate44100, rate32000, rate24000, rate22050, rate16000, rate12000, rate11025, rate8000, rate7350, absoluteGranulePosition, bandwidth, bitDepth, bitrate, bitrateMaximum, bitrateMinimum, bitrateNominal, buffer, bufferFullness, codec, codecFrames, coupledStreamCount, crc, crc16, crc32, data, description, duration, emphasis, hasOpusPadding, header, isContinuedPacket, isCopyrighted, isFirstPage, isHome, isLastPage, isOriginal, isPrivate, isVbr, layer, length, mode, modeExtension, mpeg, mpegVersion, numberAACFrames, outputGain, preSkip, profile, profileBits, protection, rawData, segments, subarray, version, vorbis, vorbisComments, vorbisSetup, block, blockingStrategy, blockingStrategyBits, blockSize, blocksize0, blocksize1, blockSizeBits, channel, channelMappingFamily, channelMappingTable, channelMode, channelModeBits, channels, copyright, copyrightId, copyrightIdStart, frame, frameCount, frameLength, Number2, frameNumber, framePadding, frameSize, Rate, inputSampleRate, page, pageChecksum, pageSegmentBytes, pageSegmentTable, pageSequenceNumber, sample, sampleNumber, sampleRate, sampleRateBits, samples, stream, streamCount, streamInfo, streamSerialNumber, streamStructureVersion, total, totalBytesOut, totalDuration, totalSamples, readRawData, incrementRawData, mapCodecFrameStats, mapFrameStats, logWarning, logError2, syncFrame, fixedLengthFrameSync, getHeader, setHeader, getFrame, parseFrame, parseOggPage, checkCodecUpdate, reset, enable, getHeaderFromUint8Array, checkFrameFooterCrc16, uint8Array, dataView, reserved, bad, free, none, sixteenBitCRC;
var init_constants = __esm({
  "node_modules/codec-parser/src/constants.js"() {
    symbol = Symbol;
    mappingJoin = ", ";
    channelMappings = (() => {
      const front = "front";
      const side = "side";
      const rear = "rear";
      const left = "left";
      const center = "center";
      const right = "right";
      return ["", front + " ", side + " ", rear + " "].map(
        (x) => [
          [left, right],
          [left, right, center],
          [left, center, right],
          [center, left, right],
          [center]
        ].flatMap((y) => y.map((z) => x + z).join(mappingJoin))
      );
    })();
    lfe = "LFE";
    monophonic = "monophonic (mono)";
    stereo = "stereo";
    surround = "surround";
    getChannelMapping = (channelCount, ...mappings) => `${[
      monophonic,
      stereo,
      `linear ${surround}`,
      "quadraphonic",
      `5.0 ${surround}`,
      `5.1 ${surround}`,
      `6.1 ${surround}`,
      `7.1 ${surround}`
    ][channelCount - 1]} (${mappings.join(mappingJoin)})`;
    vorbisOpusChannelMapping = [
      monophonic,
      getChannelMapping(2, channelMappings[0][0]),
      getChannelMapping(3, channelMappings[0][2]),
      getChannelMapping(4, channelMappings[1][0], channelMappings[3][0]),
      getChannelMapping(5, channelMappings[1][2], channelMappings[3][0]),
      getChannelMapping(6, channelMappings[1][2], channelMappings[3][0], lfe),
      getChannelMapping(7, channelMappings[1][2], channelMappings[2][0], channelMappings[3][4], lfe),
      getChannelMapping(8, channelMappings[1][2], channelMappings[2][0], channelMappings[3][0], lfe)
    ];
    rate192000 = 192e3;
    rate176400 = 176400;
    rate96000 = 96e3;
    rate88200 = 88200;
    rate64000 = 64e3;
    rate48000 = 48e3;
    rate44100 = 44100;
    rate32000 = 32e3;
    rate24000 = 24e3;
    rate22050 = 22050;
    rate16000 = 16e3;
    rate12000 = 12e3;
    rate11025 = 11025;
    rate8000 = 8e3;
    rate7350 = 7350;
    absoluteGranulePosition = "absoluteGranulePosition";
    bandwidth = "bandwidth";
    bitDepth = "bitDepth";
    bitrate = "bitrate";
    bitrateMaximum = bitrate + "Maximum";
    bitrateMinimum = bitrate + "Minimum";
    bitrateNominal = bitrate + "Nominal";
    buffer = "buffer";
    bufferFullness = buffer + "Fullness";
    codec = "codec";
    codecFrames = codec + "Frames";
    coupledStreamCount = "coupledStreamCount";
    crc = "crc";
    crc16 = crc + "16";
    crc32 = crc + "32";
    data = "data";
    description = "description";
    duration = "duration";
    emphasis = "emphasis";
    hasOpusPadding = "hasOpusPadding";
    header = "header";
    isContinuedPacket = "isContinuedPacket";
    isCopyrighted = "isCopyrighted";
    isFirstPage = "isFirstPage";
    isHome = "isHome";
    isLastPage = "isLastPage";
    isOriginal = "isOriginal";
    isPrivate = "isPrivate";
    isVbr = "isVbr";
    layer = "layer";
    length = "length";
    mode = "mode";
    modeExtension = mode + "Extension";
    mpeg = "mpeg";
    mpegVersion = mpeg + "Version";
    numberAACFrames = "numberAACFrames";
    outputGain = "outputGain";
    preSkip = "preSkip";
    profile = "profile";
    profileBits = symbol();
    protection = "protection";
    rawData = "rawData";
    segments = "segments";
    subarray = "subarray";
    version = "version";
    vorbis = "vorbis";
    vorbisComments = vorbis + "Comments";
    vorbisSetup = vorbis + "Setup";
    block = "block";
    blockingStrategy = block + "ingStrategy";
    blockingStrategyBits = symbol();
    blockSize = block + "Size";
    blocksize0 = block + "size0";
    blocksize1 = block + "size1";
    blockSizeBits = symbol();
    channel = "channel";
    channelMappingFamily = channel + "MappingFamily";
    channelMappingTable = channel + "MappingTable";
    channelMode = channel + "Mode";
    channelModeBits = symbol();
    channels = channel + "s";
    copyright = "copyright";
    copyrightId = copyright + "Id";
    copyrightIdStart = copyright + "IdStart";
    frame = "frame";
    frameCount = frame + "Count";
    frameLength = frame + "Length";
    Number2 = "Number";
    frameNumber = frame + Number2;
    framePadding = frame + "Padding";
    frameSize = frame + "Size";
    Rate = "Rate";
    inputSampleRate = "inputSample" + Rate;
    page = "page";
    pageChecksum = page + "Checksum";
    pageSegmentBytes = symbol();
    pageSegmentTable = page + "SegmentTable";
    pageSequenceNumber = page + "Sequence" + Number2;
    sample = "sample";
    sampleNumber = sample + Number2;
    sampleRate = sample + Rate;
    sampleRateBits = symbol();
    samples = sample + "s";
    stream = "stream";
    streamCount = stream + "Count";
    streamInfo = stream + "Info";
    streamSerialNumber = stream + "Serial" + Number2;
    streamStructureVersion = stream + "StructureVersion";
    total = "total";
    totalBytesOut = total + "BytesOut";
    totalDuration = total + "Duration";
    totalSamples = total + "Samples";
    readRawData = symbol();
    incrementRawData = symbol();
    mapCodecFrameStats = symbol();
    mapFrameStats = symbol();
    logWarning = symbol();
    logError2 = symbol();
    syncFrame = symbol();
    fixedLengthFrameSync = symbol();
    getHeader = symbol();
    setHeader = symbol();
    getFrame = symbol();
    parseFrame = symbol();
    parseOggPage = symbol();
    checkCodecUpdate = symbol();
    reset = symbol();
    enable = symbol();
    getHeaderFromUint8Array = symbol();
    checkFrameFooterCrc16 = symbol();
    uint8Array = Uint8Array;
    dataView = DataView;
    reserved = "reserved";
    bad = "bad";
    free = "free";
    none = "none";
    sixteenBitCRC = "16bit CRC";
  }
});

// node_modules/codec-parser/src/utilities.js
var getCrcTable, crc8Table, flacCrc16Table, crc32Table, crc8, flacCrc16, crc32Function, concatBuffers, bytesToString, reverseTable, reverse, BitReader, readInt64le;
var init_utilities2 = __esm({
  "node_modules/codec-parser/src/utilities.js"() {
    init_constants();
    getCrcTable = (crcTable, crcInitialValueFunction, crcFunction) => {
      for (let byte = 0; byte < crcTable[length]; byte++) {
        let crc2 = crcInitialValueFunction(byte);
        for (let bit = 8; bit > 0; bit--) crc2 = crcFunction(crc2);
        crcTable[byte] = crc2;
      }
      return crcTable;
    };
    crc8Table = getCrcTable(
      new uint8Array(256),
      (b) => b,
      (crc2) => crc2 & 128 ? 7 ^ crc2 << 1 : crc2 << 1
    );
    flacCrc16Table = [
      getCrcTable(
        new Uint16Array(256),
        (b) => b << 8,
        (crc2) => crc2 << 1 ^ (crc2 & 1 << 15 ? 32773 : 0)
      )
    ];
    crc32Table = [
      getCrcTable(
        new Uint32Array(256),
        (b) => b,
        (crc2) => crc2 >>> 1 ^ (crc2 & 1) * 3988292384
      )
    ];
    for (let i = 0; i < 15; i++) {
      flacCrc16Table.push(new Uint16Array(256));
      crc32Table.push(new Uint32Array(256));
      for (let j = 0; j <= 255; j++) {
        flacCrc16Table[i + 1][j] = flacCrc16Table[0][flacCrc16Table[i][j] >>> 8] ^ flacCrc16Table[i][j] << 8;
        crc32Table[i + 1][j] = crc32Table[i][j] >>> 8 ^ crc32Table[0][crc32Table[i][j] & 255];
      }
    }
    crc8 = (data3) => {
      let crc2 = 0;
      const dataLength = data3[length];
      for (let i = 0; i !== dataLength; i++) crc2 = crc8Table[crc2 ^ data3[i]];
      return crc2;
    };
    flacCrc16 = (data3) => {
      const dataLength = data3[length];
      const crcChunkSize = dataLength - 16;
      let crc2 = 0;
      let i = 0;
      while (i <= crcChunkSize) {
        crc2 ^= data3[i++] << 8 | data3[i++];
        crc2 = flacCrc16Table[15][crc2 >> 8] ^ flacCrc16Table[14][crc2 & 255] ^ flacCrc16Table[13][data3[i++]] ^ flacCrc16Table[12][data3[i++]] ^ flacCrc16Table[11][data3[i++]] ^ flacCrc16Table[10][data3[i++]] ^ flacCrc16Table[9][data3[i++]] ^ flacCrc16Table[8][data3[i++]] ^ flacCrc16Table[7][data3[i++]] ^ flacCrc16Table[6][data3[i++]] ^ flacCrc16Table[5][data3[i++]] ^ flacCrc16Table[4][data3[i++]] ^ flacCrc16Table[3][data3[i++]] ^ flacCrc16Table[2][data3[i++]] ^ flacCrc16Table[1][data3[i++]] ^ flacCrc16Table[0][data3[i++]];
      }
      while (i !== dataLength)
        crc2 = (crc2 & 255) << 8 ^ flacCrc16Table[0][crc2 >> 8 ^ data3[i++]];
      return crc2;
    };
    crc32Function = (data3) => {
      const dataLength = data3[length];
      const crcChunkSize = dataLength - 16;
      let crc2 = 0;
      let i = 0;
      while (i <= crcChunkSize)
        crc2 = crc32Table[15][(data3[i++] ^ crc2) & 255] ^ crc32Table[14][(data3[i++] ^ crc2 >>> 8) & 255] ^ crc32Table[13][(data3[i++] ^ crc2 >>> 16) & 255] ^ crc32Table[12][data3[i++] ^ crc2 >>> 24] ^ crc32Table[11][data3[i++]] ^ crc32Table[10][data3[i++]] ^ crc32Table[9][data3[i++]] ^ crc32Table[8][data3[i++]] ^ crc32Table[7][data3[i++]] ^ crc32Table[6][data3[i++]] ^ crc32Table[5][data3[i++]] ^ crc32Table[4][data3[i++]] ^ crc32Table[3][data3[i++]] ^ crc32Table[2][data3[i++]] ^ crc32Table[1][data3[i++]] ^ crc32Table[0][data3[i++]];
      while (i !== dataLength)
        crc2 = crc32Table[0][(crc2 ^ data3[i++]) & 255] ^ crc2 >>> 8;
      return crc2 ^ -1;
    };
    concatBuffers = (...buffers) => {
      const buffer2 = new uint8Array(
        buffers.reduce((acc, buf) => acc + buf[length], 0)
      );
      buffers.reduce((offset, buf) => {
        buffer2.set(buf, offset);
        return offset + buf[length];
      }, 0);
      return buffer2;
    };
    bytesToString = (bytes) => String.fromCharCode(...bytes);
    reverseTable = [0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15];
    reverse = (val) => reverseTable[val & 15] << 4 | reverseTable[val >> 4];
    BitReader = class {
      constructor(data3) {
        this._data = data3;
        this._pos = data3[length] * 8;
      }
      set position(position) {
        this._pos = position;
      }
      get position() {
        return this._pos;
      }
      read(bits) {
        const byte = Math.floor(this._pos / 8);
        const bit = this._pos % 8;
        this._pos -= bits;
        const window2 = (reverse(this._data[byte - 1]) << 8) + reverse(this._data[byte]);
        return window2 >> 7 - bit & 255;
      }
    };
    readInt64le = (view, offset) => {
      try {
        return view.getBigInt64(offset, true);
      } catch {
        const sign = view.getUint8(offset + 7) & 128 ? -1 : 1;
        let firstPart = view.getUint32(offset, true);
        let secondPart = view.getUint32(offset + 4, true);
        if (sign === -1) {
          firstPart = ~firstPart + 1;
          secondPart = ~secondPart + 1;
        }
        if (secondPart > 1048575) {
          console.warn("This platform does not support BigInt");
        }
        return sign * (firstPart + secondPart * 2 ** 32);
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/HeaderCache.js
var HeaderCache;
var init_HeaderCache = __esm({
  "node_modules/codec-parser/src/codecs/HeaderCache.js"() {
    init_constants();
    HeaderCache = class {
      constructor(onCodecHeader, onCodecUpdate) {
        this._onCodecHeader = onCodecHeader;
        this._onCodecUpdate = onCodecUpdate;
        this[reset]();
      }
      [enable]() {
        this._isEnabled = true;
      }
      [reset]() {
        this._headerCache = /* @__PURE__ */ new Map();
        this._codecUpdateData = /* @__PURE__ */ new WeakMap();
        this._codecHeaderSent = false;
        this._codecShouldUpdate = false;
        this._bitrate = null;
        this._isEnabled = false;
      }
      [checkCodecUpdate](bitrate2, totalDuration2) {
        if (this._onCodecUpdate) {
          if (this._bitrate !== bitrate2) {
            this._bitrate = bitrate2;
            this._codecShouldUpdate = true;
          }
          const codecData = this._codecUpdateData.get(
            this._headerCache.get(this._currentHeader)
          );
          if (this._codecShouldUpdate && codecData) {
            this._onCodecUpdate(
              {
                bitrate: bitrate2,
                ...codecData
              },
              totalDuration2
            );
          }
          this._codecShouldUpdate = false;
        }
      }
      [getHeader](key) {
        const header2 = this._headerCache.get(key);
        if (header2) {
          this._updateCurrentHeader(key);
        }
        return header2;
      }
      [setHeader](key, header2, codecUpdateFields) {
        if (this._isEnabled) {
          if (!this._codecHeaderSent) {
            this._onCodecHeader({ ...header2 });
            this._codecHeaderSent = true;
          }
          this._updateCurrentHeader(key);
          this._headerCache.set(key, header2);
          this._codecUpdateData.set(header2, codecUpdateFields);
        }
      }
      _updateCurrentHeader(key) {
        if (this._onCodecUpdate && key !== this._currentHeader) {
          this._codecShouldUpdate = true;
          this._currentHeader = key;
        }
      }
    };
  }
});

// node_modules/codec-parser/src/globals.js
var headerStore, frameStore;
var init_globals = __esm({
  "node_modules/codec-parser/src/globals.js"() {
    headerStore = /* @__PURE__ */ new WeakMap();
    frameStore = /* @__PURE__ */ new WeakMap();
  }
});

// node_modules/codec-parser/src/codecs/Parser.js
var Parser;
var init_Parser = __esm({
  "node_modules/codec-parser/src/codecs/Parser.js"() {
    init_globals();
    init_constants();
    Parser = class {
      constructor(codecParser, headerCache) {
        this._codecParser = codecParser;
        this._headerCache = headerCache;
      }
      *[syncFrame]() {
        let frameData;
        do {
          frameData = yield* this.Frame[getFrame](
            this._codecParser,
            this._headerCache,
            0
          );
          if (frameData) return frameData;
          this._codecParser[incrementRawData](1);
        } while (true);
      }
      /**
       * @description Searches for Frames within bytes containing a sequence of known codec frames.
       * @param {boolean} ignoreNextFrame Set to true to return frames even if the next frame may not exist at the expected location
       * @returns {Frame}
       */
      *[fixedLengthFrameSync](ignoreNextFrame) {
        let frameData = yield* this[syncFrame]();
        const frameLength2 = frameStore.get(frameData)[length];
        if (ignoreNextFrame || this._codecParser._flushing || // check if there is a frame right after this one
        (yield* this.Header[getHeader](
          this._codecParser,
          this._headerCache,
          frameLength2
        ))) {
          this._headerCache[enable]();
          this._codecParser[incrementRawData](frameLength2);
          this._codecParser[mapFrameStats](frameData);
          return frameData;
        }
        this._codecParser[logWarning](
          `Missing ${frame} at ${frameLength2} bytes from current position.`,
          `Dropping current ${frame} and trying again.`
        );
        this._headerCache[reset]();
        this._codecParser[incrementRawData](1);
      }
    };
  }
});

// node_modules/codec-parser/src/containers/Frame.js
var Frame;
var init_Frame = __esm({
  "node_modules/codec-parser/src/containers/Frame.js"() {
    init_globals();
    init_constants();
    Frame = class {
      constructor(headerValue, dataValue) {
        frameStore.set(this, { [header]: headerValue });
        this[data] = dataValue;
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/CodecFrame.js
var CodecFrame;
var init_CodecFrame = __esm({
  "node_modules/codec-parser/src/codecs/CodecFrame.js"() {
    init_globals();
    init_constants();
    init_Frame();
    CodecFrame = class extends Frame {
      static *[getFrame](Header, Frame2, codecParser, headerCache, readOffset) {
        const headerValue = yield* Header[getHeader](
          codecParser,
          headerCache,
          readOffset
        );
        if (headerValue) {
          const frameLengthValue = headerStore.get(headerValue)[frameLength];
          const samplesValue = headerStore.get(headerValue)[samples];
          const frame2 = (yield* codecParser[readRawData](
            frameLengthValue,
            readOffset
          ))[subarray](0, frameLengthValue);
          return new Frame2(headerValue, frame2, samplesValue);
        } else {
          return null;
        }
      }
      constructor(headerValue, dataValue, samplesValue) {
        super(headerValue, dataValue);
        this[header] = headerValue;
        this[samples] = samplesValue;
        this[duration] = samplesValue / headerValue[sampleRate] * 1e3;
        this[frameNumber] = null;
        this[totalBytesOut] = null;
        this[totalSamples] = null;
        this[totalDuration] = null;
        frameStore.get(this)[length] = dataValue[length];
      }
    };
  }
});

// node_modules/codec-parser/src/metadata/ID3v2.js
var unsynchronizationFlag, extendedHeaderFlag, experimentalFlag, footerPresent, ID3v2;
var init_ID3v2 = __esm({
  "node_modules/codec-parser/src/metadata/ID3v2.js"() {
    init_constants();
    unsynchronizationFlag = "unsynchronizationFlag";
    extendedHeaderFlag = "extendedHeaderFlag";
    experimentalFlag = "experimentalFlag";
    footerPresent = "footerPresent";
    ID3v2 = class _ID3v2 {
      static *getID3v2Header(codecParser, headerCache, readOffset) {
        const headerLength = 10;
        const header2 = {};
        let data3 = yield* codecParser[readRawData](3, readOffset);
        if (data3[0] !== 73 || data3[1] !== 68 || data3[2] !== 51) return null;
        data3 = yield* codecParser[readRawData](headerLength, readOffset);
        header2[version] = `id3v2.${data3[3]}.${data3[4]}`;
        if (data3[5] & 15) return null;
        header2[unsynchronizationFlag] = !!(data3[5] & 128);
        header2[extendedHeaderFlag] = !!(data3[5] & 64);
        header2[experimentalFlag] = !!(data3[5] & 32);
        header2[footerPresent] = !!(data3[5] & 16);
        if (data3[6] & 128 || data3[7] & 128 || data3[8] & 128 || data3[9] & 128)
          return null;
        const dataLength = data3[6] << 21 | data3[7] << 14 | data3[8] << 7 | data3[9];
        header2[length] = headerLength + dataLength;
        return new _ID3v2(header2);
      }
      constructor(header2) {
        this[version] = header2[version];
        this[unsynchronizationFlag] = header2[unsynchronizationFlag];
        this[extendedHeaderFlag] = header2[extendedHeaderFlag];
        this[experimentalFlag] = header2[experimentalFlag];
        this[footerPresent] = header2[footerPresent];
        this[length] = header2[length];
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/CodecHeader.js
var CodecHeader;
var init_CodecHeader = __esm({
  "node_modules/codec-parser/src/codecs/CodecHeader.js"() {
    init_globals();
    init_constants();
    CodecHeader = class {
      /**
       * @private
       */
      constructor(header2) {
        headerStore.set(this, header2);
        this[bitDepth] = header2[bitDepth];
        this[bitrate] = null;
        this[channels] = header2[channels];
        this[channelMode] = header2[channelMode];
        this[sampleRate] = header2[sampleRate];
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/mpeg/MPEGHeader.js
var bitrateMatrix, calcBitrate, v1Layer1, v1Layer2, v1Layer3, v2Layer1, v2Layer23, bands, to31, layer12ModeExtensions, bitrateIndex, v2, v1, intensityStereo, msStereo, on, off, layer3ModeExtensions, layersValues, mpegVersionDescription, isoIec, mpegVersions, protectionValues, emphasisValues, channelModes, MPEGHeader;
var init_MPEGHeader = __esm({
  "node_modules/codec-parser/src/codecs/mpeg/MPEGHeader.js"() {
    init_constants();
    init_utilities2();
    init_ID3v2();
    init_CodecHeader();
    bitrateMatrix = {
      // bits | V1,L1 | V1,L2 | V1,L3 | V2,L1 | V2,L2 & L3
      0: [free, free, free, free, free],
      16: [32, 32, 32, 32, 8],
      // 0b00100000: [64,   48,  40,  48,  16,],
      // 0b00110000: [96,   56,  48,  56,  24,],
      // 0b01000000: [128,  64,  56,  64,  32,],
      // 0b01010000: [160,  80,  64,  80,  40,],
      // 0b01100000: [192,  96,  80,  96,  48,],
      // 0b01110000: [224, 112,  96, 112,  56,],
      // 0b10000000: [256, 128, 112, 128,  64,],
      // 0b10010000: [288, 160, 128, 144,  80,],
      // 0b10100000: [320, 192, 160, 160,  96,],
      // 0b10110000: [352, 224, 192, 176, 112,],
      // 0b11000000: [384, 256, 224, 192, 128,],
      // 0b11010000: [416, 320, 256, 224, 144,],
      // 0b11100000: [448, 384, 320, 256, 160,],
      240: [bad, bad, bad, bad, bad]
    };
    calcBitrate = (idx, interval, intervalOffset) => 8 * ((idx + intervalOffset) % interval + interval) * (1 << (idx + intervalOffset) / interval) - 8 * interval * (interval / 8 | 0);
    for (let i = 2; i < 15; i++)
      bitrateMatrix[i << 4] = [
        i * 32,
        //                V1,L1
        calcBitrate(i, 4, 0),
        //  V1,L2
        calcBitrate(i, 4, -1),
        // V1,L3
        calcBitrate(i, 8, 4),
        //  V2,L1
        calcBitrate(i, 8, 0)
        //  V2,L2 & L3
      ];
    v1Layer1 = 0;
    v1Layer2 = 1;
    v1Layer3 = 2;
    v2Layer1 = 3;
    v2Layer23 = 4;
    bands = "bands ";
    to31 = " to 31";
    layer12ModeExtensions = {
      0: bands + 4 + to31,
      16: bands + 8 + to31,
      32: bands + 12 + to31,
      48: bands + 16 + to31
    };
    bitrateIndex = "bitrateIndex";
    v2 = "v2";
    v1 = "v1";
    intensityStereo = "Intensity stereo ";
    msStereo = ", MS stereo ";
    on = "on";
    off = "off";
    layer3ModeExtensions = {
      0: intensityStereo + off + msStereo + off,
      16: intensityStereo + on + msStereo + off,
      32: intensityStereo + off + msStereo + on,
      48: intensityStereo + on + msStereo + on
    };
    layersValues = {
      0: { [description]: reserved },
      2: {
        [description]: "Layer III",
        [framePadding]: 1,
        [modeExtension]: layer3ModeExtensions,
        [v1]: {
          [bitrateIndex]: v1Layer3,
          [samples]: 1152
        },
        [v2]: {
          [bitrateIndex]: v2Layer23,
          [samples]: 576
        }
      },
      4: {
        [description]: "Layer II",
        [framePadding]: 1,
        [modeExtension]: layer12ModeExtensions,
        [samples]: 1152,
        [v1]: {
          [bitrateIndex]: v1Layer2
        },
        [v2]: {
          [bitrateIndex]: v2Layer23
        }
      },
      6: {
        [description]: "Layer I",
        [framePadding]: 4,
        [modeExtension]: layer12ModeExtensions,
        [samples]: 384,
        [v1]: {
          [bitrateIndex]: v1Layer1
        },
        [v2]: {
          [bitrateIndex]: v2Layer1
        }
      }
    };
    mpegVersionDescription = "MPEG Version ";
    isoIec = "ISO/IEC ";
    mpegVersions = {
      0: {
        [description]: `${mpegVersionDescription}2.5 (later extension of MPEG 2)`,
        [layer]: v2,
        [sampleRate]: {
          0: rate11025,
          4: rate12000,
          8: rate8000,
          12: reserved
        }
      },
      8: { [description]: reserved },
      16: {
        [description]: `${mpegVersionDescription}2 (${isoIec}13818-3)`,
        [layer]: v2,
        [sampleRate]: {
          0: rate22050,
          4: rate24000,
          8: rate16000,
          12: reserved
        }
      },
      24: {
        [description]: `${mpegVersionDescription}1 (${isoIec}11172-3)`,
        [layer]: v1,
        [sampleRate]: {
          0: rate44100,
          4: rate48000,
          8: rate32000,
          12: reserved
        }
      },
      length
    };
    protectionValues = {
      0: sixteenBitCRC,
      1: none
    };
    emphasisValues = {
      0: none,
      1: "50/15 ms",
      2: reserved,
      3: "CCIT J.17"
    };
    channelModes = {
      0: { [channels]: 2, [description]: stereo },
      64: { [channels]: 2, [description]: "joint " + stereo },
      128: { [channels]: 2, [description]: "dual channel" },
      192: { [channels]: 1, [description]: monophonic }
    };
    MPEGHeader = class _MPEGHeader extends CodecHeader {
      static *[getHeader](codecParser, headerCache, readOffset) {
        const header2 = {};
        const id3v2Header = yield* ID3v2.getID3v2Header(
          codecParser,
          headerCache,
          readOffset
        );
        if (id3v2Header) {
          yield* codecParser[readRawData](id3v2Header[length], readOffset);
          codecParser[incrementRawData](id3v2Header[length]);
        }
        const data3 = yield* codecParser[readRawData](4, readOffset);
        const key = bytesToString(data3[subarray](0, 4));
        const cachedHeader = headerCache[getHeader](key);
        if (cachedHeader) return new _MPEGHeader(cachedHeader);
        if (data3[0] !== 255 || data3[1] < 224) return null;
        const mpegVersionValues2 = mpegVersions[data3[1] & 24];
        if (mpegVersionValues2[description] === reserved) return null;
        const layerBits = data3[1] & 6;
        if (layersValues[layerBits][description] === reserved) return null;
        const layerValues2 = {
          ...layersValues[layerBits],
          ...layersValues[layerBits][mpegVersionValues2[layer]]
        };
        header2[mpegVersion] = mpegVersionValues2[description];
        header2[layer] = layerValues2[description];
        header2[samples] = layerValues2[samples];
        header2[protection] = protectionValues[data3[1] & 1];
        header2[length] = 4;
        header2[bitrate] = bitrateMatrix[data3[2] & 240][layerValues2[bitrateIndex]];
        if (header2[bitrate] === bad) return null;
        header2[sampleRate] = mpegVersionValues2[sampleRate][data3[2] & 12];
        if (header2[sampleRate] === reserved) return null;
        header2[framePadding] = data3[2] & 2 && layerValues2[framePadding];
        header2[isPrivate] = !!(data3[2] & 1);
        header2[frameLength] = Math.floor(
          125 * header2[bitrate] * header2[samples] / header2[sampleRate] + header2[framePadding]
        );
        if (!header2[frameLength]) return null;
        const channelModeBits2 = data3[3] & 192;
        header2[channelMode] = channelModes[channelModeBits2][description];
        header2[channels] = channelModes[channelModeBits2][channels];
        header2[modeExtension] = layerValues2[modeExtension][data3[3] & 48];
        header2[isCopyrighted] = !!(data3[3] & 8);
        header2[isOriginal] = !!(data3[3] & 4);
        header2[emphasis] = emphasisValues[data3[3] & 3];
        if (header2[emphasis] === reserved) return null;
        header2[bitDepth] = 16;
        {
          const { length: length2, frameLength: frameLength2, samples: samples2, ...codecUpdateFields } = header2;
          headerCache[setHeader](key, header2, codecUpdateFields);
        }
        return new _MPEGHeader(header2);
      }
      /**
       * @private
       * Call MPEGHeader.getHeader(Array<Uint8>) to get instance
       */
      constructor(header2) {
        super(header2);
        this[bitrate] = header2[bitrate];
        this[emphasis] = header2[emphasis];
        this[framePadding] = header2[framePadding];
        this[isCopyrighted] = header2[isCopyrighted];
        this[isOriginal] = header2[isOriginal];
        this[isPrivate] = header2[isPrivate];
        this[layer] = header2[layer];
        this[modeExtension] = header2[modeExtension];
        this[mpegVersion] = header2[mpegVersion];
        this[protection] = header2[protection];
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/mpeg/MPEGFrame.js
var MPEGFrame;
var init_MPEGFrame = __esm({
  "node_modules/codec-parser/src/codecs/mpeg/MPEGFrame.js"() {
    init_constants();
    init_CodecFrame();
    init_MPEGHeader();
    MPEGFrame = class _MPEGFrame extends CodecFrame {
      static *[getFrame](codecParser, headerCache, readOffset) {
        return yield* super[getFrame](
          MPEGHeader,
          _MPEGFrame,
          codecParser,
          headerCache,
          readOffset
        );
      }
      constructor(header2, frame2, samples2) {
        super(header2, frame2, samples2);
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/mpeg/MPEGParser.js
var MPEGParser;
var init_MPEGParser = __esm({
  "node_modules/codec-parser/src/codecs/mpeg/MPEGParser.js"() {
    init_constants();
    init_Parser();
    init_MPEGFrame();
    init_MPEGHeader();
    MPEGParser = class extends Parser {
      constructor(codecParser, headerCache, onCodec) {
        super(codecParser, headerCache);
        this.Frame = MPEGFrame;
        this.Header = MPEGHeader;
        onCodec(this[codec]);
      }
      get [codec]() {
        return mpeg;
      }
      *[parseFrame]() {
        return yield* this[fixedLengthFrameSync]();
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/aac/AACHeader.js
var mpegVersionValues, layerValues, protectionValues2, profileValues, sampleRates, channelModeValues, AACHeader;
var init_AACHeader = __esm({
  "node_modules/codec-parser/src/codecs/aac/AACHeader.js"() {
    init_globals();
    init_utilities2();
    init_constants();
    init_CodecHeader();
    mpegVersionValues = {
      0: "MPEG-4",
      8: "MPEG-2"
    };
    layerValues = {
      0: "valid",
      2: bad,
      4: bad,
      6: bad
    };
    protectionValues2 = {
      0: sixteenBitCRC,
      1: none
    };
    profileValues = {
      0: "AAC Main",
      64: "AAC LC (Low Complexity)",
      128: "AAC SSR (Scalable Sample Rate)",
      192: "AAC LTP (Long Term Prediction)"
    };
    sampleRates = {
      0: rate96000,
      4: rate88200,
      8: rate64000,
      12: rate48000,
      16: rate44100,
      20: rate32000,
      24: rate24000,
      28: rate22050,
      32: rate16000,
      36: rate12000,
      40: rate11025,
      44: rate8000,
      48: rate7350,
      52: reserved,
      56: reserved,
      60: "frequency is written explicitly"
    };
    channelModeValues = {
      0: { [channels]: 0, [description]: "Defined in AOT Specific Config" },
      /*
      'monophonic (mono)'
      'stereo (left, right)'
      'linear surround (front center, front left, front right)'
      'quadraphonic (front center, front left, front right, rear center)'
      '5.0 surround (front center, front left, front right, rear left, rear right)'
      '5.1 surround (front center, front left, front right, rear left, rear right, LFE)'
      '7.1 surround (front center, front left, front right, side left, side right, rear left, rear right, LFE)'
      */
      64: { [channels]: 1, [description]: monophonic },
      128: { [channels]: 2, [description]: getChannelMapping(2, channelMappings[0][0]) },
      192: { [channels]: 3, [description]: getChannelMapping(3, channelMappings[1][3]) },
      256: { [channels]: 4, [description]: getChannelMapping(4, channelMappings[1][3], channelMappings[3][4]) },
      320: { [channels]: 5, [description]: getChannelMapping(5, channelMappings[1][3], channelMappings[3][0]) },
      384: { [channels]: 6, [description]: getChannelMapping(6, channelMappings[1][3], channelMappings[3][0], lfe) },
      448: { [channels]: 8, [description]: getChannelMapping(8, channelMappings[1][3], channelMappings[2][0], channelMappings[3][0], lfe) }
    };
    AACHeader = class _AACHeader extends CodecHeader {
      static *[getHeader](codecParser, headerCache, readOffset) {
        const header2 = {};
        const data3 = yield* codecParser[readRawData](7, readOffset);
        const key = bytesToString([
          data3[0],
          data3[1],
          data3[2],
          data3[3] & 252 | data3[6] & 3
          // frame length, buffer fullness varies so don't cache it
        ]);
        const cachedHeader = headerCache[getHeader](key);
        if (!cachedHeader) {
          if (data3[0] !== 255 || data3[1] < 240) return null;
          header2[mpegVersion] = mpegVersionValues[data3[1] & 8];
          header2[layer] = layerValues[data3[1] & 6];
          if (header2[layer] === bad) return null;
          const protectionBit = data3[1] & 1;
          header2[protection] = protectionValues2[protectionBit];
          header2[length] = protectionBit ? 7 : 9;
          header2[profileBits] = data3[2] & 192;
          header2[sampleRateBits] = data3[2] & 60;
          const privateBit = data3[2] & 2;
          header2[profile] = profileValues[header2[profileBits]];
          header2[sampleRate] = sampleRates[header2[sampleRateBits]];
          if (header2[sampleRate] === reserved) return null;
          header2[isPrivate] = !!privateBit;
          header2[channelModeBits] = (data3[2] << 8 | data3[3]) & 448;
          header2[channelMode] = channelModeValues[header2[channelModeBits]][description];
          header2[channels] = channelModeValues[header2[channelModeBits]][channels];
          header2[isOriginal] = !!(data3[3] & 32);
          header2[isHome] = !!(data3[3] & 8);
          header2[copyrightId] = !!(data3[3] & 8);
          header2[copyrightIdStart] = !!(data3[3] & 4);
          header2[bitDepth] = 16;
          header2[samples] = 1024;
          header2[numberAACFrames] = data3[6] & 3;
          {
            const {
              length: length2,
              channelModeBits: channelModeBits2,
              profileBits: profileBits2,
              sampleRateBits: sampleRateBits2,
              frameLength: frameLength2,
              samples: samples2,
              numberAACFrames: numberAACFrames2,
              ...codecUpdateFields
            } = header2;
            headerCache[setHeader](key, header2, codecUpdateFields);
          }
        } else {
          Object.assign(header2, cachedHeader);
        }
        header2[frameLength] = (data3[3] << 11 | data3[4] << 3 | data3[5] >> 5) & 8191;
        if (!header2[frameLength]) return null;
        const bufferFullnessBits = (data3[5] << 6 | data3[6] >> 2) & 2047;
        header2[bufferFullness] = bufferFullnessBits === 2047 ? "VBR" : bufferFullnessBits;
        return new _AACHeader(header2);
      }
      /**
       * @private
       * Call AACHeader.getHeader(Array<Uint8>) to get instance
       */
      constructor(header2) {
        super(header2);
        this[copyrightId] = header2[copyrightId];
        this[copyrightIdStart] = header2[copyrightIdStart];
        this[bufferFullness] = header2[bufferFullness];
        this[isHome] = header2[isHome];
        this[isOriginal] = header2[isOriginal];
        this[isPrivate] = header2[isPrivate];
        this[layer] = header2[layer];
        this[length] = header2[length];
        this[mpegVersion] = header2[mpegVersion];
        this[numberAACFrames] = header2[numberAACFrames];
        this[profile] = header2[profile];
        this[protection] = header2[protection];
      }
      get audioSpecificConfig() {
        const header2 = headerStore.get(this);
        const audioSpecificConfig = header2[profileBits] + 64 << 5 | header2[sampleRateBits] << 5 | header2[channelModeBits] >> 3;
        const bytes = new uint8Array(2);
        new dataView(bytes[buffer]).setUint16(0, audioSpecificConfig, false);
        return bytes;
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/aac/AACFrame.js
var AACFrame;
var init_AACFrame = __esm({
  "node_modules/codec-parser/src/codecs/aac/AACFrame.js"() {
    init_constants();
    init_CodecFrame();
    init_AACHeader();
    AACFrame = class _AACFrame extends CodecFrame {
      static *[getFrame](codecParser, headerCache, readOffset) {
        return yield* super[getFrame](
          AACHeader,
          _AACFrame,
          codecParser,
          headerCache,
          readOffset
        );
      }
      constructor(header2, frame2, samples2) {
        super(header2, frame2, samples2);
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/aac/AACParser.js
var AACParser;
var init_AACParser = __esm({
  "node_modules/codec-parser/src/codecs/aac/AACParser.js"() {
    init_constants();
    init_Parser();
    init_AACFrame();
    init_AACHeader();
    AACParser = class extends Parser {
      constructor(codecParser, headerCache, onCodec) {
        super(codecParser, headerCache);
        this.Frame = AACFrame;
        this.Header = AACHeader;
        onCodec(this[codec]);
      }
      get [codec]() {
        return "aac";
      }
      *[parseFrame]() {
        return yield* this[fixedLengthFrameSync]();
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/flac/FLACFrame.js
var FLACFrame;
var init_FLACFrame = __esm({
  "node_modules/codec-parser/src/codecs/flac/FLACFrame.js"() {
    init_globals();
    init_utilities2();
    init_constants();
    init_CodecFrame();
    FLACFrame = class _FLACFrame extends CodecFrame {
      static _getFrameFooterCrc16(data3) {
        return (data3[data3[length] - 2] << 8) + data3[data3[length] - 1];
      }
      // check frame footer crc
      // https://xiph.org/flac/format.html#frame_footer
      static [checkFrameFooterCrc16](data3) {
        const expectedCrc16 = _FLACFrame._getFrameFooterCrc16(data3);
        const actualCrc16 = flacCrc16(data3[subarray](0, -2));
        return expectedCrc16 === actualCrc16;
      }
      constructor(data3, header2, streamInfoValue) {
        header2[streamInfo] = streamInfoValue;
        header2[crc16] = _FLACFrame._getFrameFooterCrc16(data3);
        super(header2, data3, headerStore.get(header2)[samples]);
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/flac/FLACHeader.js
var getFromStreamInfo, blockingStrategyValues, blockSizeValues, sampleRateValues, channelAssignments, bitDepthValues, FLACHeader;
var init_FLACHeader = __esm({
  "node_modules/codec-parser/src/codecs/flac/FLACHeader.js"() {
    init_constants();
    init_utilities2();
    init_CodecHeader();
    getFromStreamInfo = "get from STREAMINFO metadata block";
    blockingStrategyValues = {
      0: "Fixed",
      1: "Variable"
    };
    blockSizeValues = {
      0: reserved,
      16: 192
      // 0b00100000: 576,
      // 0b00110000: 1152,
      // 0b01000000: 2304,
      // 0b01010000: 4608,
      // 0b01100000: "8-bit (blocksize-1) from end of header",
      // 0b01110000: "16-bit (blocksize-1) from end of header",
      // 0b10000000: 256,
      // 0b10010000: 512,
      // 0b10100000: 1024,
      // 0b10110000: 2048,
      // 0b11000000: 4096,
      // 0b11010000: 8192,
      // 0b11100000: 16384,
      // 0b11110000: 32768,
    };
    for (let i = 2; i < 16; i++)
      blockSizeValues[i << 4] = i < 6 ? 576 * 2 ** (i - 2) : 2 ** i;
    sampleRateValues = {
      0: getFromStreamInfo,
      1: rate88200,
      2: rate176400,
      3: rate192000,
      4: rate8000,
      5: rate16000,
      6: rate22050,
      7: rate24000,
      8: rate32000,
      9: rate44100,
      10: rate48000,
      11: rate96000,
      // 0b00001100: "8-bit sample rate (in kHz) from end of header",
      // 0b00001101: "16-bit sample rate (in Hz) from end of header",
      // 0b00001110: "16-bit sample rate (in tens of Hz) from end of header",
      15: bad
    };
    channelAssignments = {
      /*'
      'monophonic (mono)'
      'stereo (left, right)'
      'linear surround (left, right, center)'
      'quadraphonic (front left, front right, rear left, rear right)'
      '5.0 surround (front left, front right, front center, rear left, rear right)'
      '5.1 surround (front left, front right, front center, LFE, rear left, rear right)'
      '6.1 surround (front left, front right, front center, LFE, rear center, side left, side right)'
      '7.1 surround (front left, front right, front center, LFE, rear left, rear right, side left, side right)'
      */
      0: { [channels]: 1, [description]: monophonic },
      16: { [channels]: 2, [description]: getChannelMapping(2, channelMappings[0][0]) },
      32: { [channels]: 3, [description]: getChannelMapping(3, channelMappings[0][1]) },
      48: { [channels]: 4, [description]: getChannelMapping(4, channelMappings[1][0], channelMappings[3][0]) },
      64: { [channels]: 5, [description]: getChannelMapping(5, channelMappings[1][1], channelMappings[3][0]) },
      80: { [channels]: 6, [description]: getChannelMapping(6, channelMappings[1][1], lfe, channelMappings[3][0]) },
      96: { [channels]: 7, [description]: getChannelMapping(7, channelMappings[1][1], lfe, channelMappings[3][4], channelMappings[2][0]) },
      112: { [channels]: 8, [description]: getChannelMapping(8, channelMappings[1][1], lfe, channelMappings[3][0], channelMappings[2][0]) },
      128: { [channels]: 2, [description]: `${stereo} (left, diff)` },
      144: { [channels]: 2, [description]: `${stereo} (diff, right)` },
      160: { [channels]: 2, [description]: `${stereo} (avg, diff)` },
      176: reserved,
      192: reserved,
      208: reserved,
      224: reserved,
      240: reserved
    };
    bitDepthValues = {
      0: getFromStreamInfo,
      2: 8,
      4: 12,
      6: reserved,
      8: 16,
      10: 20,
      12: 24,
      14: reserved
    };
    FLACHeader = class _FLACHeader extends CodecHeader {
      // https://datatracker.ietf.org/doc/html/rfc3629#section-3
      //    Char. number range  |        UTF-8 octet sequence
      //    (hexadecimal)    |              (binary)
      // --------------------+---------------------------------------------
      // 0000 0000-0000 007F | 0xxxxxxx
      // 0000 0080-0000 07FF | 110xxxxx 10xxxxxx
      // 0000 0800-0000 FFFF | 1110xxxx 10xxxxxx 10xxxxxx
      // 0001 0000-0010 FFFF | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      static _decodeUTF8Int(data3) {
        if (data3[0] > 254) {
          return null;
        }
        if (data3[0] < 128) return { value: data3[0], length: 1 };
        let length2 = 1;
        for (let zeroMask = 64; zeroMask & data3[0]; zeroMask >>= 1) length2++;
        let idx = length2 - 1, value = 0, shift = 0;
        for (; idx > 0; shift += 6, idx--) {
          if ((data3[idx] & 192) !== 128) {
            return null;
          }
          value |= (data3[idx] & 63) << shift;
        }
        value |= (data3[idx] & 127 >> length2) << shift;
        return { value, length: length2 };
      }
      static [getHeaderFromUint8Array](data3, headerCache) {
        const codecParserStub = {
          [readRawData]: function* () {
            return data3;
          }
        };
        return _FLACHeader[getHeader](codecParserStub, headerCache, 0).next().value;
      }
      static *[getHeader](codecParser, headerCache, readOffset) {
        let data3 = yield* codecParser[readRawData](6, readOffset);
        if (data3[0] !== 255 || !(data3[1] === 248 || data3[1] === 249)) {
          return null;
        }
        const header2 = {};
        const key = bytesToString(data3[subarray](0, 4));
        const cachedHeader = headerCache[getHeader](key);
        if (!cachedHeader) {
          header2[blockingStrategyBits] = data3[1] & 1;
          header2[blockingStrategy] = blockingStrategyValues[header2[blockingStrategyBits]];
          header2[blockSizeBits] = data3[2] & 240;
          header2[sampleRateBits] = data3[2] & 15;
          header2[blockSize] = blockSizeValues[header2[blockSizeBits]];
          if (header2[blockSize] === reserved) {
            return null;
          }
          header2[sampleRate] = sampleRateValues[header2[sampleRateBits]];
          if (header2[sampleRate] === bad) {
            return null;
          }
          if (data3[3] & 1) {
            return null;
          }
          const channelAssignment = channelAssignments[data3[3] & 240];
          if (channelAssignment === reserved) {
            return null;
          }
          header2[channels] = channelAssignment[channels];
          header2[channelMode] = channelAssignment[description];
          header2[bitDepth] = bitDepthValues[data3[3] & 14];
          if (header2[bitDepth] === reserved) {
            return null;
          }
        } else {
          Object.assign(header2, cachedHeader);
        }
        header2[length] = 5;
        data3 = yield* codecParser[readRawData](header2[length] + 8, readOffset);
        const decodedUtf8 = _FLACHeader._decodeUTF8Int(data3[subarray](4));
        if (!decodedUtf8) {
          return null;
        }
        if (header2[blockingStrategyBits]) {
          header2[sampleNumber] = decodedUtf8.value;
        } else {
          header2[frameNumber] = decodedUtf8.value;
        }
        header2[length] += decodedUtf8[length];
        if (header2[blockSizeBits] === 96) {
          if (data3[length] < header2[length])
            data3 = yield* codecParser[readRawData](header2[length], readOffset);
          header2[blockSize] = data3[header2[length] - 1] + 1;
          header2[length] += 1;
        } else if (header2[blockSizeBits] === 112) {
          if (data3[length] < header2[length])
            data3 = yield* codecParser[readRawData](header2[length], readOffset);
          header2[blockSize] = (data3[header2[length] - 1] << 8) + data3[header2[length]] + 1;
          header2[length] += 2;
        }
        header2[samples] = header2[blockSize];
        if (header2[sampleRateBits] === 12) {
          if (data3[length] < header2[length])
            data3 = yield* codecParser[readRawData](header2[length], readOffset);
          header2[sampleRate] = data3[header2[length] - 1] * 1e3;
          header2[length] += 1;
        } else if (header2[sampleRateBits] === 13) {
          if (data3[length] < header2[length])
            data3 = yield* codecParser[readRawData](header2[length], readOffset);
          header2[sampleRate] = (data3[header2[length] - 1] << 8) + data3[header2[length]];
          header2[length] += 2;
        } else if (header2[sampleRateBits] === 14) {
          if (data3[length] < header2[length])
            data3 = yield* codecParser[readRawData](header2[length], readOffset);
          header2[sampleRate] = ((data3[header2[length] - 1] << 8) + data3[header2[length]]) * 10;
          header2[length] += 2;
        }
        if (data3[length] < header2[length])
          data3 = yield* codecParser[readRawData](header2[length], readOffset);
        header2[crc] = data3[header2[length] - 1];
        if (header2[crc] !== crc8(data3[subarray](0, header2[length] - 1))) {
          return null;
        }
        {
          if (!cachedHeader) {
            const {
              blockingStrategyBits: blockingStrategyBits2,
              frameNumber: frameNumber2,
              sampleNumber: sampleNumber2,
              samples: samples2,
              sampleRateBits: sampleRateBits2,
              blockSizeBits: blockSizeBits2,
              crc: crc2,
              length: length2,
              ...codecUpdateFields
            } = header2;
            headerCache[setHeader](key, header2, codecUpdateFields);
          }
        }
        return new _FLACHeader(header2);
      }
      /**
       * @private
       * Call FLACHeader.getHeader(Array<Uint8>) to get instance
       */
      constructor(header2) {
        super(header2);
        this[crc16] = null;
        this[blockingStrategy] = header2[blockingStrategy];
        this[blockSize] = header2[blockSize];
        this[frameNumber] = header2[frameNumber];
        this[sampleNumber] = header2[sampleNumber];
        this[streamInfo] = null;
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/flac/FLACParser.js
var MIN_FLAC_FRAME_SIZE, MAX_FLAC_FRAME_SIZE, FLACParser;
var init_FLACParser = __esm({
  "node_modules/codec-parser/src/codecs/flac/FLACParser.js"() {
    init_globals();
    init_constants();
    init_Parser();
    init_FLACFrame();
    init_FLACHeader();
    MIN_FLAC_FRAME_SIZE = 2;
    MAX_FLAC_FRAME_SIZE = 512 * 1024;
    FLACParser = class extends Parser {
      constructor(codecParser, headerCache, onCodec) {
        super(codecParser, headerCache);
        this.Frame = FLACFrame;
        this.Header = FLACHeader;
        onCodec(this[codec]);
      }
      get [codec]() {
        return "flac";
      }
      *_getNextFrameSyncOffset(offset) {
        const data3 = yield* this._codecParser[readRawData](2, 0);
        const dataLength = data3[length] - 2;
        while (offset < dataLength) {
          const firstByte = data3[offset];
          if (firstByte === 255) {
            const secondByte = data3[offset + 1];
            if (secondByte === 248 || secondByte === 249) break;
            if (secondByte !== 255) offset++;
          }
          offset++;
        }
        return offset;
      }
      *[parseFrame]() {
        do {
          const header2 = yield* FLACHeader[getHeader](
            this._codecParser,
            this._headerCache,
            0
          );
          if (header2) {
            let nextHeaderOffset = headerStore.get(header2)[length] + MIN_FLAC_FRAME_SIZE;
            while (nextHeaderOffset <= MAX_FLAC_FRAME_SIZE) {
              if (this._codecParser._flushing || (yield* FLACHeader[getHeader](
                this._codecParser,
                this._headerCache,
                nextHeaderOffset
              ))) {
                let frameData = yield* this._codecParser[readRawData](nextHeaderOffset);
                if (!this._codecParser._flushing)
                  frameData = frameData[subarray](0, nextHeaderOffset);
                if (FLACFrame[checkFrameFooterCrc16](frameData)) {
                  const frame2 = new FLACFrame(frameData, header2);
                  this._headerCache[enable]();
                  this._codecParser[incrementRawData](nextHeaderOffset);
                  this._codecParser[mapFrameStats](frame2);
                  return frame2;
                }
              }
              nextHeaderOffset = yield* this._getNextFrameSyncOffset(
                nextHeaderOffset + 1
              );
            }
            this._codecParser[logWarning](
              `Unable to sync FLAC frame after searching ${nextHeaderOffset} bytes.`
            );
            this._codecParser[incrementRawData](nextHeaderOffset);
          } else {
            this._codecParser[incrementRawData](
              yield* this._getNextFrameSyncOffset(1)
            );
          }
        } while (true);
      }
      [parseOggPage](oggPage) {
        if (oggPage[pageSequenceNumber] === 0) {
          this._headerCache[enable]();
          this._streamInfo = oggPage[data][subarray](13);
        } else if (oggPage[pageSequenceNumber] === 1) {
        } else {
          oggPage[codecFrames] = frameStore.get(oggPage)[segments].map((segment) => {
            const header2 = FLACHeader[getHeaderFromUint8Array](
              segment,
              this._headerCache
            );
            if (header2) {
              return new FLACFrame(segment, header2, this._streamInfo);
            } else {
              this._codecParser[logWarning](
                "Failed to parse Ogg FLAC frame",
                "Skipping invalid FLAC frame"
              );
            }
          }).filter((frame2) => !!frame2);
        }
        return oggPage;
      }
    };
  }
});

// node_modules/codec-parser/src/containers/ogg/OggPageHeader.js
var OggPageHeader;
var init_OggPageHeader = __esm({
  "node_modules/codec-parser/src/containers/ogg/OggPageHeader.js"() {
    init_globals();
    init_constants();
    init_utilities2();
    OggPageHeader = class _OggPageHeader {
      static *[getHeader](codecParser, headerCache, readOffset) {
        const header2 = {};
        let data3 = yield* codecParser[readRawData](28, readOffset);
        if (data3[0] !== 79 || // O
        data3[1] !== 103 || // g
        data3[2] !== 103 || // g
        data3[3] !== 83) {
          return null;
        }
        header2[streamStructureVersion] = data3[4];
        const zeros = data3[5] & 248;
        if (zeros) return null;
        header2[isLastPage] = !!(data3[5] & 4);
        header2[isFirstPage] = !!(data3[5] & 2);
        header2[isContinuedPacket] = !!(data3[5] & 1);
        const view = new dataView(uint8Array.from(data3[subarray](0, 28))[buffer]);
        header2[absoluteGranulePosition] = readInt64le(view, 6);
        header2[streamSerialNumber] = view.getInt32(14, true);
        header2[pageSequenceNumber] = view.getInt32(18, true);
        header2[pageChecksum] = view.getInt32(22, true);
        const pageSegmentTableLength = data3[26];
        header2[length] = pageSegmentTableLength + 27;
        data3 = yield* codecParser[readRawData](header2[length], readOffset);
        header2[frameLength] = 0;
        header2[pageSegmentTable] = [];
        header2[pageSegmentBytes] = uint8Array.from(
          data3[subarray](27, header2[length])
        );
        for (let i = 0, segmentLength = 0; i < pageSegmentTableLength; i++) {
          const segmentByte = header2[pageSegmentBytes][i];
          header2[frameLength] += segmentByte;
          segmentLength += segmentByte;
          if (segmentByte !== 255 || i === pageSegmentTableLength - 1) {
            header2[pageSegmentTable].push(segmentLength);
            segmentLength = 0;
          }
        }
        return new _OggPageHeader(header2);
      }
      /**
       * @private
       * Call OggPageHeader.getHeader(Array<Uint8>) to get instance
       */
      constructor(header2) {
        headerStore.set(this, header2);
        this[absoluteGranulePosition] = header2[absoluteGranulePosition];
        this[isContinuedPacket] = header2[isContinuedPacket];
        this[isFirstPage] = header2[isFirstPage];
        this[isLastPage] = header2[isLastPage];
        this[pageSegmentTable] = header2[pageSegmentTable];
        this[pageSequenceNumber] = header2[pageSequenceNumber];
        this[pageChecksum] = header2[pageChecksum];
        this[streamSerialNumber] = header2[streamSerialNumber];
      }
    };
  }
});

// node_modules/codec-parser/src/containers/ogg/OggPage.js
var OggPage;
var init_OggPage = __esm({
  "node_modules/codec-parser/src/containers/ogg/OggPage.js"() {
    init_globals();
    init_constants();
    init_Frame();
    init_OggPageHeader();
    OggPage = class _OggPage extends Frame {
      static *[getFrame](codecParser, headerCache, readOffset) {
        const header2 = yield* OggPageHeader[getHeader](
          codecParser,
          headerCache,
          readOffset
        );
        if (header2) {
          const frameLengthValue = headerStore.get(header2)[frameLength];
          const headerLength = headerStore.get(header2)[length];
          const totalLength = headerLength + frameLengthValue;
          const rawDataValue = (yield* codecParser[readRawData](totalLength, 0))[subarray](0, totalLength);
          const frame2 = rawDataValue[subarray](headerLength, totalLength);
          return new _OggPage(header2, frame2, rawDataValue);
        } else {
          return null;
        }
      }
      constructor(header2, frame2, rawDataValue) {
        super(header2, frame2);
        frameStore.get(this)[length] = rawDataValue[length];
        this[codecFrames] = [];
        this[rawData] = rawDataValue;
        this[absoluteGranulePosition] = header2[absoluteGranulePosition];
        this[crc32] = header2[pageChecksum];
        this[duration] = 0;
        this[isContinuedPacket] = header2[isContinuedPacket];
        this[isFirstPage] = header2[isFirstPage];
        this[isLastPage] = header2[isLastPage];
        this[pageSequenceNumber] = header2[pageSequenceNumber];
        this[samples] = 0;
        this[streamSerialNumber] = header2[streamSerialNumber];
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/opus/OpusFrame.js
var OpusFrame;
var init_OpusFrame = __esm({
  "node_modules/codec-parser/src/codecs/opus/OpusFrame.js"() {
    init_CodecFrame();
    OpusFrame = class extends CodecFrame {
      constructor(data3, header2, samples2) {
        super(header2, data3, samples2);
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/opus/OpusHeader.js
var channelMappingFamilies, silkOnly, celtOnly, hybrid, narrowBand, mediumBand, wideBand, superWideBand, fullBand, configTable, OpusHeader;
var init_OpusHeader = __esm({
  "node_modules/codec-parser/src/codecs/opus/OpusHeader.js"() {
    init_constants();
    init_utilities2();
    init_CodecHeader();
    channelMappingFamilies = {
      0: vorbisOpusChannelMapping.slice(0, 2),
      /*
      0: "monophonic (mono)"
      1: "stereo (left, right)"
      */
      1: vorbisOpusChannelMapping
      /*
      0: "monophonic (mono)"
      1: "stereo (left, right)"
      2: "linear surround (left, center, right)"
      3: "quadraphonic (front left, front right, rear left, rear right)"
      4: "5.0 surround (front left, front center, front right, rear left, rear right)"
      5: "5.1 surround (front left, front center, front right, rear left, rear right, LFE)"
      6: "6.1 surround (front left, front center, front right, side left, side right, rear center, LFE)"
      7: "7.1 surround (front left, front center, front right, side left, side right, rear left, rear right, LFE)"
      */
      // additional channel mappings are user defined
    };
    silkOnly = "SILK-only";
    celtOnly = "CELT-only";
    hybrid = "Hybrid";
    narrowBand = "narrowband";
    mediumBand = "medium-band";
    wideBand = "wideband";
    superWideBand = "super-wideband";
    fullBand = "fullband";
    configTable = {
      0: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 10 },
      8: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 20 },
      16: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 40 },
      24: { [mode]: silkOnly, [bandwidth]: narrowBand, [frameSize]: 60 },
      32: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 10 },
      40: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 20 },
      48: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 40 },
      56: { [mode]: silkOnly, [bandwidth]: mediumBand, [frameSize]: 60 },
      64: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 10 },
      72: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 20 },
      80: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 40 },
      88: { [mode]: silkOnly, [bandwidth]: wideBand, [frameSize]: 60 },
      96: { [mode]: hybrid, [bandwidth]: superWideBand, [frameSize]: 10 },
      104: { [mode]: hybrid, [bandwidth]: superWideBand, [frameSize]: 20 },
      112: { [mode]: hybrid, [bandwidth]: fullBand, [frameSize]: 10 },
      120: { [mode]: hybrid, [bandwidth]: fullBand, [frameSize]: 20 },
      128: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 2.5 },
      136: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 5 },
      144: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 10 },
      152: { [mode]: celtOnly, [bandwidth]: narrowBand, [frameSize]: 20 },
      160: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 2.5 },
      168: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 5 },
      176: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 10 },
      184: { [mode]: celtOnly, [bandwidth]: wideBand, [frameSize]: 20 },
      192: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 2.5 },
      200: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 5 },
      208: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 10 },
      216: { [mode]: celtOnly, [bandwidth]: superWideBand, [frameSize]: 20 },
      224: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 2.5 },
      232: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 5 },
      240: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 10 },
      248: { [mode]: celtOnly, [bandwidth]: fullBand, [frameSize]: 20 }
    };
    OpusHeader = class _OpusHeader extends CodecHeader {
      static [getHeaderFromUint8Array](dataValue, packetData, headerCache) {
        const header2 = {};
        header2[channels] = dataValue[9];
        header2[channelMappingFamily] = dataValue[18];
        header2[length] = header2[channelMappingFamily] !== 0 ? 21 + header2[channels] : 19;
        if (dataValue[length] < header2[length])
          throw new Error("Out of data while inside an Ogg Page");
        const packetMode = packetData[0] & 3;
        const packetLength = packetMode === 3 ? 2 : 1;
        const key = bytesToString(dataValue[subarray](0, header2[length])) + bytesToString(packetData[subarray](0, packetLength));
        const cachedHeader = headerCache[getHeader](key);
        if (cachedHeader) return new _OpusHeader(cachedHeader);
        if (key.substr(0, 8) !== "OpusHead") {
          return null;
        }
        if (dataValue[8] !== 1) return null;
        header2[data] = uint8Array.from(dataValue[subarray](0, header2[length]));
        const view = new dataView(header2[data][buffer]);
        header2[bitDepth] = 16;
        header2[preSkip] = view.getUint16(10, true);
        header2[inputSampleRate] = view.getUint32(12, true);
        header2[sampleRate] = rate48000;
        header2[outputGain] = view.getInt16(16, true);
        if (header2[channelMappingFamily] in channelMappingFamilies) {
          header2[channelMode] = channelMappingFamilies[header2[channelMappingFamily]][header2[channels] - 1];
          if (!header2[channelMode]) return null;
        }
        if (header2[channelMappingFamily] !== 0) {
          header2[streamCount] = dataValue[19];
          header2[coupledStreamCount] = dataValue[20];
          header2[channelMappingTable] = [
            ...dataValue[subarray](21, header2[channels] + 21)
          ];
        }
        const packetConfig = configTable[248 & packetData[0]];
        header2[mode] = packetConfig[mode];
        header2[bandwidth] = packetConfig[bandwidth];
        header2[frameSize] = packetConfig[frameSize];
        switch (packetMode) {
          case 0:
            header2[frameCount] = 1;
            break;
          case 1:
          // 1: 2 frames in the packet, each with equal compressed size
          case 2:
            header2[frameCount] = 2;
            break;
          case 3:
            header2[isVbr] = !!(128 & packetData[1]);
            header2[hasOpusPadding] = !!(64 & packetData[1]);
            header2[frameCount] = 63 & packetData[1];
            break;
          default:
            return null;
        }
        {
          const {
            length: length2,
            data: headerData,
            channelMappingFamily: channelMappingFamily2,
            ...codecUpdateFields
          } = header2;
          headerCache[setHeader](key, header2, codecUpdateFields);
        }
        return new _OpusHeader(header2);
      }
      /**
       * @private
       * Call OpusHeader.getHeader(Array<Uint8>) to get instance
       */
      constructor(header2) {
        super(header2);
        this[data] = header2[data];
        this[bandwidth] = header2[bandwidth];
        this[channelMappingFamily] = header2[channelMappingFamily];
        this[channelMappingTable] = header2[channelMappingTable];
        this[coupledStreamCount] = header2[coupledStreamCount];
        this[frameCount] = header2[frameCount];
        this[frameSize] = header2[frameSize];
        this[hasOpusPadding] = header2[hasOpusPadding];
        this[inputSampleRate] = header2[inputSampleRate];
        this[isVbr] = header2[isVbr];
        this[mode] = header2[mode];
        this[outputGain] = header2[outputGain];
        this[preSkip] = header2[preSkip];
        this[streamCount] = header2[streamCount];
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/opus/OpusParser.js
var OpusParser;
var init_OpusParser = __esm({
  "node_modules/codec-parser/src/codecs/opus/OpusParser.js"() {
    init_globals();
    init_constants();
    init_Parser();
    init_OpusFrame();
    init_OpusHeader();
    OpusParser = class extends Parser {
      constructor(codecParser, headerCache, onCodec) {
        super(codecParser, headerCache);
        this.Frame = OpusFrame;
        this.Header = OpusHeader;
        onCodec(this[codec]);
        this._identificationHeader = null;
        this._preSkipRemaining = null;
      }
      get [codec]() {
        return "opus";
      }
      /**
       * @todo implement continued page support
       */
      [parseOggPage](oggPage) {
        if (oggPage[pageSequenceNumber] === 0) {
          this._headerCache[enable]();
          this._identificationHeader = oggPage[data];
        } else if (oggPage[pageSequenceNumber] === 1) {
        } else {
          oggPage[codecFrames] = frameStore.get(oggPage)[segments].map((segment) => {
            const header2 = OpusHeader[getHeaderFromUint8Array](
              this._identificationHeader,
              segment,
              this._headerCache
            );
            if (header2) {
              if (this._preSkipRemaining === null)
                this._preSkipRemaining = header2[preSkip];
              let samples2 = header2[frameSize] * header2[frameCount] / 1e3 * header2[sampleRate];
              if (this._preSkipRemaining > 0) {
                this._preSkipRemaining -= samples2;
                samples2 = this._preSkipRemaining < 0 ? -this._preSkipRemaining : 0;
              }
              return new OpusFrame(segment, header2, samples2);
            }
            this._codecParser[logError2](
              "Failed to parse Ogg Opus Header",
              "Not a valid Ogg Opus file"
            );
          });
        }
        return oggPage;
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/vorbis/VorbisFrame.js
var VorbisFrame;
var init_VorbisFrame = __esm({
  "node_modules/codec-parser/src/codecs/vorbis/VorbisFrame.js"() {
    init_CodecFrame();
    VorbisFrame = class extends CodecFrame {
      constructor(data3, header2, samples2) {
        super(header2, data3, samples2);
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/vorbis/VorbisHeader.js
var blockSizes, VorbisHeader;
var init_VorbisHeader = __esm({
  "node_modules/codec-parser/src/codecs/vorbis/VorbisHeader.js"() {
    init_constants();
    init_utilities2();
    init_CodecHeader();
    blockSizes = {
      // 0b0110: 64,
      // 0b0111: 128,
      // 0b1000: 256,
      // 0b1001: 512,
      // 0b1010: 1024,
      // 0b1011: 2048,
      // 0b1100: 4096,
      // 0b1101: 8192
    };
    for (let i = 0; i < 8; i++) blockSizes[i + 6] = 2 ** (6 + i);
    VorbisHeader = class _VorbisHeader extends CodecHeader {
      static [getHeaderFromUint8Array](dataValue, headerCache, vorbisCommentsData, vorbisSetupData) {
        if (dataValue[length] < 30)
          throw new Error("Out of data while inside an Ogg Page");
        const key = bytesToString(dataValue[subarray](0, 30));
        const cachedHeader = headerCache[getHeader](key);
        if (cachedHeader) return new _VorbisHeader(cachedHeader);
        const header2 = { [length]: 30 };
        if (key.substr(0, 7) !== "vorbis") {
          return null;
        }
        header2[data] = uint8Array.from(dataValue[subarray](0, 30));
        const view = new dataView(header2[data][buffer]);
        header2[version] = view.getUint32(7, true);
        if (header2[version] !== 0) return null;
        header2[channels] = dataValue[11];
        header2[channelMode] = vorbisOpusChannelMapping[header2[channels] - 1] || "application defined";
        header2[sampleRate] = view.getUint32(12, true);
        header2[bitrateMaximum] = view.getInt32(16, true);
        header2[bitrateNominal] = view.getInt32(20, true);
        header2[bitrateMinimum] = view.getInt32(24, true);
        header2[blocksize1] = blockSizes[(dataValue[28] & 240) >> 4];
        header2[blocksize0] = blockSizes[dataValue[28] & 15];
        if (header2[blocksize0] > header2[blocksize1]) return null;
        if (dataValue[29] !== 1) return null;
        header2[bitDepth] = 32;
        header2[vorbisSetup] = vorbisSetupData;
        header2[vorbisComments] = vorbisCommentsData;
        {
          const {
            length: length2,
            data: data3,
            version: version2,
            vorbisSetup: vorbisSetup2,
            vorbisComments: vorbisComments2,
            ...codecUpdateFields
          } = header2;
          headerCache[setHeader](key, header2, codecUpdateFields);
        }
        return new _VorbisHeader(header2);
      }
      /**
       * @private
       * Call VorbisHeader.getHeader(Array<Uint8>) to get instance
       */
      constructor(header2) {
        super(header2);
        this[bitrateMaximum] = header2[bitrateMaximum];
        this[bitrateMinimum] = header2[bitrateMinimum];
        this[bitrateNominal] = header2[bitrateNominal];
        this[blocksize0] = header2[blocksize0];
        this[blocksize1] = header2[blocksize1];
        this[data] = header2[data];
        this[vorbisComments] = header2[vorbisComments];
        this[vorbisSetup] = header2[vorbisSetup];
      }
    };
  }
});

// node_modules/codec-parser/src/codecs/vorbis/VorbisParser.js
var VorbisParser;
var init_VorbisParser = __esm({
  "node_modules/codec-parser/src/codecs/vorbis/VorbisParser.js"() {
    init_globals();
    init_utilities2();
    init_constants();
    init_Parser();
    init_VorbisFrame();
    init_VorbisHeader();
    VorbisParser = class extends Parser {
      constructor(codecParser, headerCache, onCodec) {
        super(codecParser, headerCache);
        this.Frame = VorbisFrame;
        onCodec(this[codec]);
        this._identificationHeader = null;
        this._setupComplete = false;
        this._prevBlockSize = null;
      }
      get [codec]() {
        return vorbis;
      }
      [parseOggPage](oggPage) {
        oggPage[codecFrames] = [];
        for (const oggPageSegment of frameStore.get(oggPage)[segments]) {
          if (oggPageSegment[0] === 1) {
            this._headerCache[enable]();
            this._identificationHeader = oggPage[data];
            this._setupComplete = false;
          } else if (oggPageSegment[0] === 3) {
            this._vorbisComments = oggPageSegment;
          } else if (oggPageSegment[0] === 5) {
            this._vorbisSetup = oggPageSegment;
            this._mode = this._parseSetupHeader(oggPageSegment);
            this._setupComplete = true;
          } else if (this._setupComplete) {
            const header2 = VorbisHeader[getHeaderFromUint8Array](
              this._identificationHeader,
              this._headerCache,
              this._vorbisComments,
              this._vorbisSetup
            );
            if (header2) {
              oggPage[codecFrames].push(
                new VorbisFrame(
                  oggPageSegment,
                  header2,
                  this._getSamples(oggPageSegment, header2)
                )
              );
            } else {
              this._codecParser[logError](
                "Failed to parse Ogg Vorbis Header",
                "Not a valid Ogg Vorbis file"
              );
            }
          }
        }
        return oggPage;
      }
      _getSamples(segment, header2) {
        const blockFlag = this._mode.blockFlags[segment[0] >> 1 & this._mode.mask];
        const currentBlockSize = blockFlag ? header2[blocksize1] : header2[blocksize0];
        const samplesValue = this._prevBlockSize === null ? 0 : (this._prevBlockSize + currentBlockSize) / 4;
        this._prevBlockSize = currentBlockSize;
        return samplesValue;
      }
      // https://gitlab.xiph.org/xiph/liboggz/-/blob/master/src/liboggz/oggz_auto.c#L911
      // https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/vorbis_parser.c
      /*
       * This is the format of the mode data at the end of the packet for all
       * Vorbis Version 1 :
       *
       * [ 6:number_of_modes ]
       * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
       * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
       * [ 1:size | 16:window_type(0) | 16:transform_type(0) | 8:mapping ]
       * [ 1:framing(1) ]
       *
       * e.g.:
       *
       * MsB         LsB
       *              <-
       * 0 0 0 0 0 1 0 0
       * 0 0 1 0 0 0 0 0
       * 0 0 1 0 0 0 0 0
       * 0 0 1|0 0 0 0 0
       * 0 0 0 0|0|0 0 0
       * 0 0 0 0 0 0 0 0
       * 0 0 0 0|0 0 0 0
       * 0 0 0 0 0 0 0 0
       * 0 0 0 0|0 0 0 0
       * 0 0 0|1|0 0 0 0 |
       * 0 0 0 0 0 0 0 0 V
       * 0 0 0|0 0 0 0 0
       * 0 0 0 0 0 0 0 0
       * 0 0|1 0 0 0 0 0
       *
       * The simplest way to approach this is to start at the end
       * and read backwards to determine the mode configuration.
       *
       * liboggz and ffmpeg both use this method.
       */
      _parseSetupHeader(setup) {
        const bitReader = new BitReader(setup);
        const mode2 = {
          count: 0,
          blockFlags: []
        };
        while ((bitReader.read(1) & 1) !== 1) {
        }
        let modeBits;
        while (mode2.count < 64 && bitReader.position > 0) {
          reverse(bitReader.read(8));
          let currentByte = 0;
          while (bitReader.read(8) === 0 && currentByte++ < 3) {
          }
          if (currentByte === 4) {
            modeBits = bitReader.read(7);
            mode2.blockFlags.unshift(modeBits & 1);
            bitReader.position += 6;
            mode2.count++;
          } else {
            if (((reverse(modeBits) & 126) >> 1) + 1 !== mode2.count) {
              this._codecParser[logWarning](
                "vorbis derived mode count did not match actual mode count"
              );
            }
            break;
          }
        }
        mode2.mask = (1 << Math.log2(mode2.count)) - 1;
        return mode2;
      }
    };
  }
});

// node_modules/codec-parser/src/containers/ogg/OggParser.js
var OggStream, OggParser;
var init_OggParser = __esm({
  "node_modules/codec-parser/src/containers/ogg/OggParser.js"() {
    init_globals();
    init_utilities2();
    init_constants();
    init_Parser();
    init_OggPage();
    init_OggPageHeader();
    init_FLACParser();
    init_OpusParser();
    init_VorbisParser();
    OggStream = class {
      constructor(codecParser, headerCache, onCodec) {
        this._codecParser = codecParser;
        this._headerCache = headerCache;
        this._onCodec = onCodec;
        this._continuedPacket = new uint8Array();
        this._codec = null;
        this._isSupported = null;
        this._previousAbsoluteGranulePosition = null;
      }
      get [codec]() {
        return this._codec || "";
      }
      _updateCodec(codec2, Parser2) {
        if (this._codec !== codec2) {
          this._headerCache[reset]();
          this._parser = new Parser2(
            this._codecParser,
            this._headerCache,
            this._onCodec
          );
          this._codec = codec2;
        }
      }
      _checkCodecSupport({ data: data3 }) {
        const idString = bytesToString(data3[subarray](0, 8));
        switch (idString) {
          case "fishead\0":
            return false;
          // ignore ogg skeleton packets
          case "OpusHead":
            this._updateCodec("opus", OpusParser);
            return true;
          case (/^\x7fFLAC/.test(idString) && idString):
            this._updateCodec("flac", FLACParser);
            return true;
          case (/^\x01vorbis/.test(idString) && idString):
            this._updateCodec(vorbis, VorbisParser);
            return true;
          default:
            return false;
        }
      }
      _checkPageSequenceNumber(oggPage) {
        if (oggPage[pageSequenceNumber] !== this._pageSequenceNumber + 1 && this._pageSequenceNumber > 1 && oggPage[pageSequenceNumber] > 1) {
          this._codecParser[logWarning](
            "Unexpected gap in Ogg Page Sequence Number.",
            `Expected: ${this._pageSequenceNumber + 1}, Got: ${oggPage[pageSequenceNumber]}`
          );
        }
        this._pageSequenceNumber = oggPage[pageSequenceNumber];
      }
      _parsePage(oggPage) {
        if (this._isSupported === null) {
          this._pageSequenceNumber = oggPage[pageSequenceNumber];
          this._isSupported = this._checkCodecSupport(oggPage);
        }
        this._checkPageSequenceNumber(oggPage);
        const oggPageStore = frameStore.get(oggPage);
        const headerData = headerStore.get(oggPageStore[header]);
        let offset = 0;
        oggPageStore[segments] = headerData[pageSegmentTable].map(
          (segmentLength) => oggPage[data][subarray](offset, offset += segmentLength)
        );
        if (this._continuedPacket[length]) {
          oggPageStore[segments][0] = concatBuffers(
            this._continuedPacket,
            oggPageStore[segments][0]
          );
          this._continuedPacket = new uint8Array();
        }
        if (headerData[pageSegmentBytes][headerData[pageSegmentBytes][length] - 1] === 255) {
          this._continuedPacket = concatBuffers(
            this._continuedPacket,
            oggPageStore[segments].pop()
          );
        }
        if (this._previousAbsoluteGranulePosition !== null) {
          oggPage[samples] = Number(
            oggPage[absoluteGranulePosition] - this._previousAbsoluteGranulePosition
          );
        }
        this._previousAbsoluteGranulePosition = oggPage[absoluteGranulePosition];
        if (this._isSupported) {
          const frame2 = this._parser[parseOggPage](oggPage);
          this._codecParser[mapFrameStats](frame2);
          return frame2;
        } else {
          return oggPage;
        }
      }
    };
    OggParser = class extends Parser {
      constructor(codecParser, headerCache, onCodec) {
        super(codecParser, headerCache);
        this._onCodec = onCodec;
        this.Frame = OggPage;
        this.Header = OggPageHeader;
        this._streams = /* @__PURE__ */ new Map();
        this._currentSerialNumber = null;
      }
      get [codec]() {
        const oggStream = this._streams.get(this._currentSerialNumber);
        return oggStream ? oggStream.codec : "";
      }
      *[parseFrame]() {
        const oggPage = yield* this[fixedLengthFrameSync](true);
        this._currentSerialNumber = oggPage[streamSerialNumber];
        let oggStream = this._streams.get(this._currentSerialNumber);
        if (!oggStream) {
          oggStream = new OggStream(
            this._codecParser,
            this._headerCache,
            this._onCodec
          );
          this._streams.set(this._currentSerialNumber, oggStream);
        }
        if (oggPage[isLastPage]) this._streams.delete(this._currentSerialNumber);
        return oggStream._parsePage(oggPage);
      }
    };
  }
});

// node_modules/codec-parser/src/CodecParser.js
var noOp, CodecParser;
var init_CodecParser = __esm({
  "node_modules/codec-parser/src/CodecParser.js"() {
    init_utilities2();
    init_constants();
    init_HeaderCache();
    init_MPEGParser();
    init_AACParser();
    init_FLACParser();
    init_OggParser();
    noOp = () => {
    };
    CodecParser = class {
      constructor(mimeType2, {
        onCodec,
        onCodecHeader,
        onCodecUpdate,
        enableLogging = false,
        enableFrameCRC32 = true
      } = {}) {
        this._inputMimeType = mimeType2;
        this._onCodec = onCodec || noOp;
        this._onCodecHeader = onCodecHeader || noOp;
        this._onCodecUpdate = onCodecUpdate;
        this._enableLogging = enableLogging;
        this._crc32 = enableFrameCRC32 ? crc32Function : noOp;
        this[reset]();
      }
      /**
       * @public
       * @returns The detected codec
       */
      get [codec]() {
        return this._parser ? this._parser[codec] : "";
      }
      [reset]() {
        this._headerCache = new HeaderCache(
          this._onCodecHeader,
          this._onCodecUpdate
        );
        this._generator = this._getGenerator();
        this._generator.next();
      }
      /**
       * @public
       * @description Generator function that yields any buffered CodecFrames and resets the CodecParser
       * @returns {Iterable<CodecFrame|OggPage>} Iterator that operates over the codec data.
       * @yields {CodecFrame|OggPage} Parsed codec or ogg page data
       */
      *flush() {
        this._flushing = true;
        for (let i = this._generator.next(); i.value; i = this._generator.next()) {
          yield i.value;
        }
        this._flushing = false;
        this[reset]();
      }
      /**
       * @public
       * @description Generator function takes in a Uint8Array of data and returns a CodecFrame from the data for each iteration
       * @param {Uint8Array} chunk Next chunk of codec data to read
       * @returns {Iterable<CodecFrame|OggPage>} Iterator that operates over the codec data.
       * @yields {CodecFrame|OggPage} Parsed codec or ogg page data
       */
      *parseChunk(chunk) {
        for (let i = this._generator.next(chunk); i.value; i = this._generator.next()) {
          yield i.value;
        }
      }
      /**
       * @public
       * @description Parses an entire file and returns all of the contained frames.
       * @param {Uint8Array} fileData Coded data to read
       * @returns {Array<CodecFrame|OggPage>} CodecFrames
       */
      parseAll(fileData) {
        return [...this.parseChunk(fileData), ...this.flush()];
      }
      /**
       * @private
       */
      *_getGenerator() {
        if (this._inputMimeType.match(/aac/)) {
          this._parser = new AACParser(this, this._headerCache, this._onCodec);
        } else if (this._inputMimeType.match(/mpeg/)) {
          this._parser = new MPEGParser(this, this._headerCache, this._onCodec);
        } else if (this._inputMimeType.match(/flac/)) {
          this._parser = new FLACParser(this, this._headerCache, this._onCodec);
        } else if (this._inputMimeType.match(/ogg/)) {
          this._parser = new OggParser(this, this._headerCache, this._onCodec);
        } else {
          throw new Error(`Unsupported Codec ${mimeType}`);
        }
        this._frameNumber = 0;
        this._currentReadPosition = 0;
        this._totalBytesIn = 0;
        this._totalBytesOut = 0;
        this._totalSamples = 0;
        this._sampleRate = void 0;
        this._rawData = new Uint8Array(0);
        while (true) {
          const frame2 = yield* this._parser[parseFrame]();
          if (frame2) yield frame2;
        }
      }
      /**
       * @protected
       * @param {number} minSize Minimum bytes to have present in buffer
       * @returns {Uint8Array} rawData
       */
      *[readRawData](minSize = 0, readOffset = 0) {
        let rawData2;
        while (this._rawData[length] <= minSize + readOffset) {
          rawData2 = yield;
          if (this._flushing) return this._rawData[subarray](readOffset);
          if (rawData2) {
            this._totalBytesIn += rawData2[length];
            this._rawData = concatBuffers(this._rawData, rawData2);
          }
        }
        return this._rawData[subarray](readOffset);
      }
      /**
       * @protected
       * @param {number} increment Bytes to increment codec data
       */
      [incrementRawData](increment) {
        this._currentReadPosition += increment;
        this._rawData = this._rawData[subarray](increment);
      }
      /**
       * @protected
       */
      [mapCodecFrameStats](frame2) {
        this._sampleRate = frame2[header][sampleRate];
        frame2[header][bitrate] = frame2[duration] > 0 ? Math.round(frame2[data][length] / frame2[duration]) * 8 : 0;
        frame2[frameNumber] = this._frameNumber++;
        frame2[totalBytesOut] = this._totalBytesOut;
        frame2[totalSamples] = this._totalSamples;
        frame2[totalDuration] = this._totalSamples / this._sampleRate * 1e3;
        frame2[crc32] = this._crc32(frame2[data]);
        this._headerCache[checkCodecUpdate](
          frame2[header][bitrate],
          frame2[totalDuration]
        );
        this._totalBytesOut += frame2[data][length];
        this._totalSamples += frame2[samples];
      }
      /**
       * @protected
       */
      [mapFrameStats](frame2) {
        if (frame2[codecFrames]) {
          if (frame2[isLastPage]) {
            let absoluteGranulePositionSamples = frame2[samples];
            frame2[codecFrames].forEach((codecFrame) => {
              const untrimmedCodecSamples = codecFrame[samples];
              if (absoluteGranulePositionSamples < untrimmedCodecSamples) {
                codecFrame[samples] = absoluteGranulePositionSamples > 0 ? absoluteGranulePositionSamples : 0;
                codecFrame[duration] = codecFrame[samples] / codecFrame[header][sampleRate] * 1e3;
              }
              absoluteGranulePositionSamples -= untrimmedCodecSamples;
              this[mapCodecFrameStats](codecFrame);
            });
          } else {
            frame2[samples] = 0;
            frame2[codecFrames].forEach((codecFrame) => {
              frame2[samples] += codecFrame[samples];
              this[mapCodecFrameStats](codecFrame);
            });
          }
          frame2[duration] = frame2[samples] / this._sampleRate * 1e3 || 0;
          frame2[totalSamples] = this._totalSamples;
          frame2[totalDuration] = this._totalSamples / this._sampleRate * 1e3 || 0;
          frame2[totalBytesOut] = this._totalBytesOut;
        } else {
          this[mapCodecFrameStats](frame2);
        }
      }
      /**
       * @private
       */
      _log(logger, messages) {
        if (this._enableLogging) {
          const stats = [
            `${codec}:         ${this[codec]}`,
            `inputMimeType: ${this._inputMimeType}`,
            `readPosition:  ${this._currentReadPosition}`,
            `totalBytesIn:  ${this._totalBytesIn}`,
            `${totalBytesOut}: ${this._totalBytesOut}`
          ];
          const width = Math.max(...stats.map((s) => s[length]));
          messages.push(
            `--stats--${"-".repeat(width - 9)}`,
            ...stats,
            "-".repeat(width)
          );
          logger(
            "codec-parser",
            messages.reduce((acc, message) => acc + "\n  " + message, "")
          );
        }
      }
      /**
       * @protected
       */
      [logWarning](...messages) {
        this._log(console.warn, messages);
      }
      /**
       * @protected
       */
      [logError2](...messages) {
        this._log(console.error, messages);
      }
    };
  }
});

// node_modules/codec-parser/index.js
var codec_parser_default, data2;
var init_codec_parser = __esm({
  "node_modules/codec-parser/index.js"() {
    init_CodecParser();
    init_constants();
    codec_parser_default = CodecParser;
    data2 = data;
  }
});

// node_modules/@wasm-audio-decoders/aac/src/EmscriptenWasm.js
function EmscriptenWASM(WASMAudioDecoderCommon2) {
  var Module = Module;
  var out = (text) => console.log(text);
  var err = (text) => console.error(text);
  function ready() {
  }
  Module = {};
  function abort(what) {
    throw what;
  }
  var HEAP8, HEAP16, HEAP32, HEAPU8, HEAPU16, HEAPU32, HEAPF32, HEAPF64, HEAP64, HEAPU64, wasmMemory;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    HEAP8 = new Int8Array(b);
    HEAP16 = new Int16Array(b);
    HEAPU8 = new Uint8Array(b);
    HEAPU16 = new Uint16Array(b);
    HEAP32 = new Int32Array(b);
    HEAPU32 = new Uint32Array(b);
    HEAPF32 = new Float32Array(b);
    HEAPF64 = new Float64Array(b);
    HEAP64 = new BigInt64Array(b);
    HEAPU64 = new BigUint64Array(b);
  }
  var base64Decode = (b64) => {
    var b1, b2, i2 = 0, j = 0, bLength = b64.length;
    var output = new Uint8Array((bLength * 3 >> 2) - (b64[bLength - 2] == "=") - (b64[bLength - 1] == "="));
    for (; i2 < bLength; i2 += 4, j += 3) {
      b1 = base64ReverseLookup[b64.charCodeAt(i2 + 1)];
      b2 = base64ReverseLookup[b64.charCodeAt(i2 + 2)];
      output[j] = base64ReverseLookup[b64.charCodeAt(i2)] << 2 | b1 >> 4;
      output[j + 1] = b1 << 4 | b2 >> 2;
      output[j + 2] = b2 << 6 | base64ReverseLookup[b64.charCodeAt(i2 + 3)];
    }
    return output;
  };
  var UTF8Decoder = new TextDecoder();
  var UTF8ToString = (ptr, maxBytesToRead) => {
    if (!ptr) return "";
    var maxPtr = ptr + maxBytesToRead;
    for (var end = ptr; !(end >= maxPtr) && HEAPU8[end]; ) ++end;
    return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
  };
  var ___assert_fail = (condition, filename, line, func) => abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"]);
  var __abort_js = () => abort("");
  var __emscripten_runtime_keepalive_clear = () => {
  };
  var timers = {};
  var callUserCallback = (func) => func();
  var _emscripten_get_now = () => performance.now();
  var __setitimer_js = (which, timeout_ms) => {
    if (timers[which]) {
      clearTimeout(timers[which].id);
      delete timers[which];
    }
    if (!timeout_ms) return 0;
    var id = setTimeout(() => {
      delete timers[which];
      callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
    }, timeout_ms);
    timers[which] = {
      id,
      timeout_ms
    };
    return 0;
  };
  var _emscripten_resize_heap = (requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    return false;
  };
  var _fd_close = (fd) => 52;
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = (num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    return 70;
  }
  var printCharBuffers = [null, [], []];
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
    return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)));
  };
  var printChar = (stream2, curr) => {
    var buffer2 = printCharBuffers[stream2];
    if (curr === 0 || curr === 10) {
      (stream2 === 1 ? out : err)(UTF8ArrayToString(buffer2));
      buffer2.length = 0;
    } else {
      buffer2.push(curr);
    }
  };
  var _fd_write = (fd, iov, iovcnt, pnum) => {
    var num = 0;
    for (var i2 = 0; i2 < iovcnt; i2++) {
      var ptr = HEAPU32[iov >> 2];
      var len = HEAPU32[iov + 4 >> 2];
      iov += 8;
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j]);
      }
      num += len;
    }
    HEAPU32[pnum >> 2] = num;
    return 0;
  };
  var _proc_exit = (code) => {
    throw `exit(${code})`;
  };
  for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
    base64ReverseLookup[48 + i] = 52 + i;
    base64ReverseLookup[65 + i] = i;
    base64ReverseLookup[97 + i] = 26 + i;
  }
  base64ReverseLookup[43] = 62;
  base64ReverseLookup[47] = 63;
  var wasmImports = {
    /** @export */
    "a": ___assert_fail,
    /** @export */
    "d": __abort_js,
    /** @export */
    "c": __emscripten_runtime_keepalive_clear,
    /** @export */
    "e": __setitimer_js,
    /** @export */
    "f": _emscripten_resize_heap,
    /** @export */
    "i": _fd_close,
    /** @export */
    "g": _fd_seek,
    /** @export */
    "h": _fd_write,
    /** @export */
    "b": _proc_exit
  };
  function assignWasmExports(wasmExports) {
    _create_decoder = wasmExports["l"];
    _malloc = wasmExports["m"];
    _destroy_decoder = wasmExports["n"];
    _free = wasmExports["o"];
    _decode_frame = wasmExports["p"];
    __emscripten_timeout = wasmExports["r"];
  }
  var _create_decoder, _malloc, _destroy_decoder, _free, _decode_frame, __emscripten_timeout;
  function initRuntime(wasmExports) {
    wasmExports["k"]();
  }
  if (!EmscriptenWASM.wasm) Object.defineProperty(EmscriptenWASM, "wasm", { get: () => String.raw`dynEncode01605aad4db0´¥ØDªnö´ÅH=}Mlä¡',¬½cù'Üß¬N§áOÁ.ýöy®+÷å;2ðÄWäö×cµ"¿Zµµæ»vN£=  ÝHÎ
"JÆ³µu<ìò¨
ìf
)ÍJb­¨ÃìÕÏÌ1
ä«ÔI:Oõz«¸é<´9ëÀ´É¢&ñ:·a%0Îf®f6BV6xõvs¢²k÷7â%¡GPve¹Ïå 6; 7K}Ký >e»Ä{Â¹Oa#÷pd¤õhàpíqqíàM=}Aq|¥.pà©­øÁr£~+Ós§= Á~z¤jiiáIÔB,ªh¬²t	B¦ëd³àôääðÕÃ¢Jæxbd!l»"  ömP¡ìC¤Üù"xTßÜÛé®ÈÁ©àÝØmBP$[@5èW#qàtä·.@d»;p1kQeXÒÜyt¿ä&t×¿\êPæ¸No=}äá	7AD¬Q°%ÐÍÓÈÛÊU8×ØÍ³Ã*Xð't+Ã>ª\¡ü«~£ºãü­ì7àÙÆJ*ê]çµ¬ëºøÃtëÊ-&Tú¯j#Ðr 
[qòÔÍ#lºÁóÜãôâz@=MTÙák{kr«<·}¤ºþÓA~én[îîK+vûÂáÇóEà#igc­Je¹t­g-¤96±m;ó8ü­ û¿ú3qÐ±eç^¼4ñÉVÕHxOÒ0ß(;ef¯ëÝ_Û¹¢Ç*À<¿Bÿ4ïB_zô«ù¨d3P?Ú½´Ê£*^§í¡ÍÇõ_1;]. nÄÜ/³ÿÜîáÙÅwöÚ4Ì'!;Ó%Üæ%Zßåëj ÐµÂfÏªAÛÜ5äãa«¸Ãi"rNÒ8$µö&räÑõI¯×=MË×»Í%=M'¼KI¥¬+¬<Ú»I¨ÇÀÊ>ÚØ(þçkTH°ø Þû¹('ÈÔë½3iU<~È© Ó°íÇ´wÙkBØg½h=MQþÇ©æ.c/yëqÒQÏKwaU¶«áôÀ£7eª^ê\8{P= *ü- è3Nl71:´¿CônÒ§*Js^42ÿ*1¤ùs%¯c&Àc¨m@z6h5~T²û_Rð¿å¥J_[x@£Ì$Z?ÜoÀØ^¨¦ÃAô5Mgñÿ/LR
ÉÒuMb\[!=MáÚ:0+E¾6u2S¹Â}ó3Æíé^ÍSwAu½_e¬ÄT#çcT÷á­I,©>hFË= i¯G#Ø"B]\ðk.Ò-.K¬fÁÁÿþo _^oÁI!D[òºÝ3fõ´ÙOû6¨ïÓªZbóÙ+}Ñä
DÍÇ.ç¨òßVÍë¸ä"×ÃGy)O4;´cð= ¤G#×Ú¬}z¬Ã= âR	iü@þdÑñHöt6HkÌø-0¨a®T}§|XNÅ²:ïrZí÷Âð¢bãù»ã¶$-*T7¨K:Ãak_.Ïá®©?Aø£_Ï# º×h*AÆÐ¬|nFûOöd þöèdM¿v=}HnÎ®Ë= .D­B#¹ÁBë©K'­Ý=}R9½óë¨IªÔ)ñº£=}k®â+5#i=} /Y=M»Ö¶o$ÚO?:Od¨¤¨ZrV%Úgw«7ö ½ûAtÌ¯Oõ×öþ­ Skû	îrù;0áÍmÌ-¨æÎ_ÈÏvSé>dhÌcýÅ´óÇ~å

¥õl'FÉ¹SÜütBTÿ²Ð°}t®g8Wnð;¬{{;H·ôÀ=MÝè­ßÝzXÉó0ÝÙ±åyüÞqXÎ¡4»Mµï-¹å² l¸¬Ô-HÈko;"K¢Ý©Þå«=Mxó¿F¨|güPÁtÝûJ|þd<IÁï~¶º*òõYÜó{tDK4¤ou;T/Oö¥·V¯þµv#|7[èH2G¢¸vÃúÉêÑMØøZØ9&*Â²0³~ÅÏøBqñ^lWIøñ0©ùhZ¢Fýç´À%äðÄO¢ÎäT1¬ß
tOÎÝ$[éÞ¾MoSÔ)´;¹1¢hEX³püÅ9(Å|þâßNnÇ<Ì¢ÔÑ¼±ÄòV­d]!ãÆ®O;*»ïÐ§Ñ"Õ´ZåGrÐçïB¿ò5oø=MÀ¬,
bWÍÐÂ¨óFÚônú»[À,;A(ÃFMÅl¯y#3øù÷QT©Óó"ÿnJ¸å\)ò7V@Óo¹t*_ó~"ª^îåbÿÊi ßXú¼nEñ÷8Gzòþ;êÝ-7|kÐ£LÐÑß¯f®"=MQGP!ÎrtBÅGû&¡ [O|bXuÁæáý½+¹ÇÇÎÑÐºäÎc?WîÎ¸¹d{uòIIàÞIQo¯þûKVñøÔ]^Ý·D/7V*NîOm§)1J Á»ua1Ç,Òd9[KT<×È#¾¤ä
$Ó²ÇEÌ«.Á ¤÷çØäöÉÅ@ 21Ç'Ã| ´çâÀ½¼®Û>3Òú½wçHN~öª<CâB¹!x(.§H8óù§=}eÃ=}xúoe>Òú
#SÒ°1ÖúØÄí=}¦:5ÙÖè$ÀÂ0:Q}G<öJTwIõ¿ 3W£P´+6h¾8oû®Ï­bé¿xÙMmU:hÂWJ{þ?Íº
8H×{-"z;&LX:cB¥K0d+ÿA05ÇÊ¾lWÈâü<®Ê=}×ëÛÙLÏ¿|Äñ$áJlÑÈ×³2Ì
<9* fc£Û&PÊ¾	~æ~µZNÇë¡Æ¤L)©ZM)âÊýÆé'è©Ì ãÈðGdýÈ¼¹>©|ÍF9¯¸Õ1Ið	1>­zO~°.±=} 
I=Mz=M¸ÌÉiM$"»î¾PJjõúÙüCZÌí!9Ë­V&Ì9ú¦Ææ}¾8¬¥-¯¥J1=}­Rièælx¬¤ýhÑ=}­ïeå¤puEáaÃ "@|ÎSj«©¢ÝaSAõõgN7ýÀ²ÛWùøþ¾£a>uæ0½úCúØÕºFÁð±]=}u$-ÕÚ=}S/ý!ow_ë8¿ÆþuéÓºóÛ´ S´IvÆ:ùã,u}Ê /÷ÓéD¤Øsºñóì-T2·
¯2ÊQ¬üGØöØRM4´fkZ«¾Éu«\÷¡;Îk{|ãpÓ(h^Æë)Ö÷u~#IÂ~¬þß@°¾ã)ã®×x"ÓRüagL¸\B;e8"a×xQ&·¸¬ 4n­ùuú´Ô÷a§ú6	Å@2Bö^Ö	|îÓ3òç7fæLG«Mofim¨¢p!)4$s/ZºÅAtÖ\2p*¼Êª¼0ÁDìaé@MëcêâD?	³öÞ¤0, q¢
<Ä8¥g¨×ÏÓ° J Ò[]»;óo;Ø¨Y0#ePKýB:¸~>Îõ'Üæ8¨ÅK±4"A;;fõ¹Èö~9m1îEKºË¾m'ÉmK¬YHî6è7§ÞØÌµyþQØÆ²3úv¹®ÉM%ÏÞk5Â/3ýÂ²îuIÝk£ñïòO:Bþ6vêöîÌdù@QT%Â¨eé­w»H= ÚÔâ¿amÆúN@k(u)Jî²¸Óü	@:ýñµþÌÛWXô9ø­*U©®Ø¶{.(þÍÙ6¬+³Õû§rÙv<	ÅØà×¸*F,0¬±Å#É4§kÔ)óPÃ%woò³¥Ö+e·¹Ð}q_¦6®~§ø"!ÓiÈÉí×ue5,Ð5àôjj©2#VjÑËt"ÅXâ8éæ eÊaým E4Ð0@G¬iÍ»(Ë^*$ìñìd ³Bs.½ ðÊaÚtf5Õ@gÄ>$ßu]s@ôUÑ-5L±-£}D× ÷= äã8²Fë;} $Ç°¨0q1Úåe=M
BcxqÎGeÜDà%¦]20qu -v<,Ø"üþ ^cþ Ð®i9Q1iòÈÿ­(î¨"òÇíz¡ríéÆï£ºäìº¥rÖkò¨"ò r¬üéû|A®DÌ¨"
H@òÒûê|= "ÊÐ hþ8Kê*¶hêz%r®äÃÚ&r­&r(Ýêhßï*	ÔlgúlgzÀiác~E&
Ð×ßÆ0Ä 2l0h|ÐÚÕI¾z¢¼_¿_°ÚòÀ"©ÕêÕ*ECÜ¯LG[Å±0@J;ÿ^JÛ.^z7N^9¿ ©±ZØ¡ZN$ÑJ)­=M(ÎÑÇÚUïU!|B·b¸z(6B&Kk¡íA7bgWîÅï£àÝu}	RÉxÂ¯uc4CØ«I±ÝÉ'E7å=MEÙYÌ= 8ßZlÏVM¼Ú['kQM'kÖWV°ÖÜ5#gõæý´ïÐìiÁð÷£Z<äuÎxÑS¯<Ñ[{Øà;/wZÖÌh+<'mGV§ÖhK<7lÁã;÷R(b­47ù÷ÆH;ðLBþÝÆ!²+Ö!ÃóBýC!áìÛøBÕ>6%(Â*»g=M¤ÑP<ªÁcvVd4xÞ%0gÛ0þVÕR±2¡:0:ÓùóõBq½ÇÛÖ?ü¹Õ°#nÒÝ}(K
NNÎ	(S0JÔÈì{þoP¤é«©úO-õB5w= S©ëR¢DA²æ)0ÌûÒÑ<Ûî{@kîÂzS#ó¥ë*ÓSÞWID²zwidÝë¤¢Þn¾­Âþ<&mÃ*{§jÌ¾Wgù±æ£øZiÉlä:e=MJ¥d9ý¸«v¼oõpèñ´!ãÚÀf\ýE¢Û7}ö«Õ=}mvÜÁûaKÛ;½mÑÊ#¹:¢õpªõójEéÛFñþxõ Î÷r0Nô= Ãúë×µ#3ÇVc-GySøïyBpR¬ôô=Mú¦£¦¼÷)°-»&@ÃOm¥Ì5z8m1Ý\LöPïñ½"ócxþf!¬o$W¹±÷¨RRÌX²±= RÈjÂÿ¾éßt£×iúí)àRÔ3å{GÁÁ¹ø³ëc?X_=}à{©ò=M=}±+%¸C3æÑ¹}î}ÆåÎ©=M;#lç¡ú/,?æ%¶ßÆÆ&/l+ÿùùùNÎ©VQ½ ÇÆµ¶¶¶Å¶vÖW_'ÿ?=}Ü>k¾R@ËÞÜÃ\["ÿ.¼a8	QEt8éô=}òXÆ=}]ËÉ62[þUî82=}Xä¹©oë-ÂZ»w^«Hàyñ¹×ÌF3o^5=}¹­¢³­d#DäÑóíwEï0¥K²&åP_W1¯ X=}ö³XßÞGÜ|"AûÞñ"ý÷^äQhfÇd!%²Ðcâpm!oøâ_aBÁØc_iäÒ&Yó}àØ= Qgä³îNcBæU±¢Ø$äx}o[Ò½1Ly¼âLÓÞ^CûUåú¬Ñ¸¶Ø	¾3µQ_ Ï¶Å¢Êø(JÁÐ×°2£¸uo8®Àmý/ÿµaF½O×4rô¿2+"¥Å4	0Ë$Hj\ÊRÏÿ<NKg¶i5r­õÀÖ¡´"¼üPÅ÷´µGàÓ,¤bÐéiVù¡'h$Ôhö­¢0!e3ûÕâÇúdÃF|!ÍF¡%üw¯
E./Å:	tWyM "CGyó&RP	z×ÅI<ï]¸ôç÷Z{\¼9Î)¨.Rþó×_ SPêR-Q¿R=}ÜçXéTµÏÞ¥oÏMÇ74èDüü«üõSÒZ¼¿6»ÆÕ©«Z2ñ¶ù7*Ñ¹¥,Bâ¼ô«ù =}ù ù»ÄØ».*lp²Æ¦yqyþúýGÖLcboSæK¸ã6	V
ïÇ-Ï-gS WxD°ê"S¹ZIÇß=}Òâ/½A%[«ÿ4$9PòÖð^U·'Ùö_Lý^Ûñs¾±ojÏNoeµ"»5";Z£¡-PÖâEPîeÝpdÓ$J¤J°]ÔÚLûV3?ÞÄ?RÌÇ;üÂËå\v[Ó¶¼º,Oôù	¼ájeÏõ;*V=}×ÌÏ5õù°È¢¯yH0I+Å¿ôû×©Î9>d·­s«¯Û§ {
>õTIÄ¢îÔa§­°¯²X³MÛTûÈMþÕ3¸¯B#ÞÖÑb'SP~¿'åWçºYU.Þ|«âÝ\¼ÿQ¿ÑåTx/,Ò¹\Ô|5_çR"/Í@¹2DÇ¹Ù^ÇBG°">ÄBIGRCUkAS\,U¹PÑE1äX	UkAK\,/Ï/sP3 P?9|½qÈÃkõ>Ka!%Vj$#¨¬¼ÑâKûðdkìÃêÂ¼ö4Ïô
X%x cn×w%ßøXëâØ3BQ*G°ÉÚª3ÿ§Lk	C8¨=}³½f²J´É[WÌn,Ó¨Í¤;ßÀÓÀÛ¯Í´:Þ®ÍÖ](F V±É[¹ñRÜÂ\ÚUÍÈ[Ç
×õOPÊ7ßy:^U2Vº9·G{:^bÕj_ÿ/ÉÛ×?cÎ11_PÅ×ÖÂ2ç¦ÝÖ$x¦ï^÷ÆP³Õ/íH4x15{£${
ÿ¤4º
¨Ð'&Õ
/·')nÂHu~ëvtkûÉÈ}¦©v¼k[æÑ¯Þ\%:4m{õmFÞHåaWÓ#®&ÌþoOC,ô£Þcñm«ÏvT#aªZaô=M°ü|[Ü ½¬á¶-=MAlµ/ôKy¡Å=M#$yò=MaÄçB±EHÌuúÄÿ£ÈµÈ¢óÊ9þ25úI¨¢ð}ô9ü©º]Òqw^LtÞ´âkïrýa>^%El Ñ¬¡OJ(}}P¬ëÀ,¤IBáÉg#.ÃWW¸Æ"(Oí¬µø}{cÎL*­LSês	u&ù+³ARVÔ·¨}Í¸Í9$ÝB¨,ôº<dÅÆ¡,âÈñãã0âmpí1ÕwÕÜê'ÃÅÖÄÊNW;ñhðX§)¸ÛG8iî÷ìÃ+~áð»§PÐ7Ë%³Z:Yï·o(&á¬bYç·= ùÀÅïZÆºé­juèZ Ù¾íL¾ïX<ùHóó£í¥"ØdC¡!VtJÛhtçz·wøa/T(ÃEæµµô [·Æ Ã= ó@¥"¨3};Ôw/Äbn²º1uEEqÊóÀ£*)LöÍoa1 í³T·Ù¶RgÖóØ	y«Þ3OùpP×= KàßQßÃ<"aY©­=Mþ9kXÞ=}gXj ]¬gÌ= éò¼Ã¯>Ý@Ò{çÎÊjûÏß§¬eÀÇ4uHnÒYnßQêÑÊ9êMþlú¥ìéOQw¥Ò¥$á¤Ý	8à£yßSêÑ¤¬é(3ñDÉ9Þ±v¦1¡¼LJÐcRC¼¶_= éÇ.Ì{Ûz7Äo­ÈÊo@¦Ûj§Ðü¸	J©5þ´µèv2FB ´øæ.°½¬;I JaüMRRðBW£g©H~êe^ØH]õ¿¾ïÓ"CË÷Ç¬û±
ýþÚCßÒ4Ù/£U('kR£Ý}©¤êÞ"óãè/×yåTR/Ñ¶¶ñÚ/|b8/(gå#þLKùB^¸\ÈIrFxÁ54 :\z=M½Ù¬ÿmÒH5@QAQ"_IZ~\ÿHQ9Ã Ãp{FîS]n°@Ã^9PÛÜ¶¿¼¶ðeý~«9øî|±iÃì&2±ûªk Fg!c).7±·66¬þtÙøvÍt\_1 8@)	n.ÄnÙ?$ð2ö®þùÈ8]ÐáÁW3ÕbøÚ5Î¾tµqâ²31)esÔ)ï?OVÌ&Mà.½Õ%´".YãÔÛáÑëY)&ÆýÛ%æÉ}Â¾8-[ò¨üWMðk â\öÔSl¤äø#.¤¥£òêÑþyçìïl~ÙMd;Öí«ÿ´¦À®QÁo=}Ttù$¬käU·éÁíéëõ|3¼­bk}CXzÊê+è°3¼,uÛêLáÖæcèüîkçDVé}^´Q9yÒòÏ5¹	c}b ýA9òØÉRÙçoëBRæ´²<áä/Þ¼~Äç¬>èqµ§õ^/Yÿò¼³|Nå.ìiò »ØÖáù}|&öÖø¹ DÏåüc >Rgá\ÿbRr>û}RÎ§ØVn§1@
É*ýpògOæ×&í!»B	õ¡tÖÙÿÕ >j¬ÓD~c|"Ú= @Ð¯÷cÊÿv65éÊQ4fjÓÍp÷á)g«q']àûí38ß¥&[= 'ù:d!.­\ºdàÙÕÉØc§µ·ß4ñÀ½j¯[¶.g?ìnGdßÐ&ù%d%Þ¢ëiëeìÐÎºhØ=M"åþ¶½Å5Nþy_9{¼ìÜC ÐÒíÑò÷1m¬}"ÝzbtÒx|&Ó)ß¬¾I]ñæbèß/{½­èMõXØ(1ToÏ¥@aØ Iõy{\¢ñ¼t¬)eü@ý= ö	+#ÿ<É×Qö5Ð-þEñ¨²á¨ÂaÏì´v ¤5Åß
Ú«= FäËüóÕY<soß2Åà= R±~¦¾Å³JD¬	ê¿ð_P¾m ;eGG´= ðÿ9@¡le\sì%æï.Ñ@U!;KÉw)e=Mtßk¯÷òÛ«iÔ}À¶üO5Û¥^þ?xJýÞ;¤ééú¨Êºv­Ëê­3ôPÐ[#QCwS¹P?ÏZ%dì[õú¾17HzÕ	3ÕK?U:)\âÐÇyêcWtI«ìàAªyîÕßüáìÙ{ý¡AµtÍ¸à>~? ìëú¶»Û°«¸|ÁÆAòE:ä1Ï¹öSLÑ8¸Ç¸ÜµBò%ýÁQÙÉmRÂéÙâZðùÊº0q;5×!x,_= ZHtÖË)Ü~.o¹Àd­ZÄº= jÚù©bÎpCÐÊE\óò"\ªj&öåüæö%ü¦ecãj,4Ø[G83QH¬p6ÚAi(Î:Æ¡éVp)t!úL÷iÉqLñøÀêw½\ÝËû Ì[
´IÛôAåÝI^àiã¼¶RÖODe¹÷=}·õÏF²¤:.?i÷O+ßù÷5Û_BpÑA¾tß8=}ëj¶Nat¾¬¨ª§râÉcdr)ú¶.î¶LÄ±Ó2ñe%ëMd×MÿQÿ+y4Syty´¡%y¾÷l}Ö¶öÔ?¹,0ù÷ÅáÐ}ÎãU!ê	c´%L5½0©®"xTCªm<;Kå[7V"]Bvì³AIùP=}cF&ehù)Dá]	êµd)3.s£X­zÃ¸@nòsáÑðe1!üñÙFoNµó¡²vHÂêF×(-\xõJ£m%IÇÿzf ËÄ© :I= ú¾ñ¤áQbP$%Î;l1}Æ9<ø8Å<ÇØjÆ)Á{Ì'nÍv'P ©ùùÅÎ_¦E!û·ÆÆ0áN½ùÁ ,<á)>ÌÚ´8$«Bx_9ÑàtIZQQ*XÞÌÿ$Ó|0 ì)úFuM¢8f°Ñâz¬*]¼W$iëÚ(KzíäØùYoû;kâºô[¹Ê<Ìaæa]ñàÈ¦ÜGQ´¤rgÚ)þk¥ÑÌx<©ÐÌi½j Zîq5ödxsG\ßeHv1N÷gæÕWêé®Q@È²@=}¹å+A=}+èqd^öNìnAIè²àRðb°©ñqíL))$Ð¥­WâfEàýgºÒàËÿÉ½÷hxwèZ62Õ@ÅÅ¯¦¼üLáwGí¨[x3í¦èIæÍ\WVPjvZôÚ2qfyò"ÝèZàgÝ¥Çàg^\HÐí_×]­|¸R_æ··ÏÑ¹MÊ:÷+D, U^2.xG8-9ìVè¬jtdHÈê÷*ókÃø¼Aî×%' ]>+(²DÝÂêÏIÅü3ÑF1+¾&mÖ¦ÐâÙ÷h$ÔøÌ oÃ ¾ÐuûíÅeÇâÎÊ}}#;BÛJÂo	ÐfÀ-Au<òxa°¬+°Ò2±>5 ûh=MJgª¥ù¢¼<«¬éÕZyv >ø!ÄÄ«òZ"vcÂÒeýÞý=MOmqñÎÄyGÂeºe¬B
)úÆè¼ñÛt3DêìrÅÑ=}ØÙín)óá»ÁÎ3:0ÓÔ(f­¼t×Jòr @÷y.Êâ^Ç=}´ñÿ¾w¿ë¹âÍ5ôL?N¼ûBÞn»PärBvÅÓäå~èL×þcB)°Ýª®½.ÊåefvØQÓÓª$ér¯k°MQ(Þæ-Þ~¥6üLªÇõõµ½¸N(#SxìÐ0$éþPmGÉ&Äô±@®,ÐÌýê= ë}s¸hÚ	öòúæ´=}+ ·sk¾Àli;qLUsñ&N$Mlé½H¢ÌH¢ìVv¹£_])0ß´/¶ÀÔ¶bÎÊê6!3nG£w¿7íETpM­c%,#ðNó'oMl~ädÀBîùV±ä«k´P¡Ùð­ôöp/Jñ<±ß­®oF]CÙè$¼Äñ@OfpÞ~8:ÜÞjeôéU¹)c;?p¿µ(·ÿ=M®é¸µn±gùZÙÖÆå´I÷#BGh ½ÚÓ¦"³þp§PB&spJÞÎÝrìBdGìdæè<cÇé86èÐmë°pùÇ6WyôT\ÍXï±½ö&´wsÑ÷hsæéøFóRþ>ÌyGÕH Ò ÑCÓLÕ
+
UJî¨hë&òHà&~PtÉFq§ª¶8²¥Wi(YÚá¿O4«Hßz[ç/ré·¯ºÀ·Ãë'îDcýÙÕ~ùÊCjÎhéÚä6mÞv&yr,}µV|­©¶Dã¯åíuø¶÷'¿Ü3TpÔ0ÃurõÅmæWÄJYXÀ÷J|\(²bSÍWTôû¨^ÆFþ<£eqlÇßF.ú_£BMÅ%èM¼ËÏç=}ZM S#³ÚQ-îOØ_FÌ³ÖÚO6OW$éô^Rý¤ì®ð{:©TþìU
ÕÚYg>PcåÖgðNá¯ÌUr¼q ö6knÎÿ q|ØîM%rÂ,Ï-Y;'¥ÌQ:(µáä¢ÔdD$xH=}ÄÃãêñQ~	$=M,ôªáå¨Ð³l¶ú.ê{\ÒA¨­]l£y1O!ç)¹Ê´=}V·h¢o´¸¡¶ò¹Í~¯üi\böû³òáè+t;V ÷ÖÙ=}ÁájAÚ!ç>LÐã¹µ5IÑÀB=M|zCù¤^µCØÅ4qP=}à·Þ^}~ôÉK%uùRSÛB$¤äÕÏÚÚÙ©ósOl9²g­1¤¯ªÃc®$¿Ú}Ë(wà|ÞGFìîQBëkë[.1 õC=}Ftv{æ£Òf@eÚ¤Ô¶Ï²?ZÖDÙ2E]vÈü8M·?ãLàë'1Âvi|ë@á·ºÄ,a¢~i5¸ÛÛyMM:÷0^ÒOm©ëä>IøSU¦iD¢#Ô/¨QØíô¹ìÿZ¬;¥ÕË*ÑCÙw¨Fx´ë&ëX-"Kf=M	¤gXâW£ãØª$góºùÖ!Vw¸,ã.".ÑØ¦yöª]T¶-)ýe-(z8k!ÖûÑÝÍzÊ,§íµ¨Âb·väZ_²#> iæ2òÏ¾5Fã­£"ö/¬<ÈÁQxîúß Íª4h:½©ù±=  VÏD=} P$ÂÉîñ¨T*ù,CW¸ï§âi§èÿÈÂhy»ºyTÜ«jÛB½»?QIÈCJÕÙ²}ùÑwrü7,d¾ãðb Wú'JW½a{,ãirþôA7Î#òE/Î##µË»Õ[= 'Móñµ_|&OQ/ó[ä¢ïµaKf>lÙ@UÃn}Ü²î÷S~´=M´âEÃ×ªSë«SQÈ´U?o
gÛßøwlV{öÀOÔ#A´·n	\ZÞ
jC7R³=Mì>ÏÎÝ»)§OþÔ#¾vsëHF}µ"ô%Ê*ðµí¥	ô´]2Öi3v<Á$öÒIõôMÉ¡U«:åâÌôy òÎºË4BÛ2tw¿&B»ÈeyÀv{vCç-Æu=}:(h¾oÃ¡eêzQ½ÿù7ÿWJÅdbáP9"~hÿ>übAó»äsÜr5cMcÍ~É~È¥½ìð^ öPlär¾r_ ¨½î[PÐ;	$~ÖåþVb/È¿U;Ë·ê4¯ÏüoOÞ,7\PÖ.ý&PØ ÊÖkíºoNáedmñ%xÑ=}ZëjôQ*Ñ=}Á:çcMD+¾l¾_;6= ¹.ä_;-Kþ	QîÚÌ½vCE9Í;ÙÝÍ;Í;FWEE]Ìò²²¿ÁgòuP)ÂPßÅa M'Ú×¬s1oSÇ=}3$Éù/îÉ77ÃúîØ*ÑÚ¬+=M®ñ²©gÞ?­¦=MÆýc"¾ë´ûGï¼Ì xÀ¯·'5íÓÝõñÈ&EÉ¬Ó¶ËYQRøöÐÝ	(Ìîë	¸=MW½°ôñô7qjÜnaü§FcMú÷´ÚMÀ;ÊÔ«õ×o:Í-ýLiþ±)û)qÎG=M.$-=MCÚß¬¸OJ­¬;PCY=M@ZÒ¬[Ó]<í¶;7M²Ý¾§PdÐ~Ù0næ7' UAø¥ËÑ¸¬gnRC%MDZÜ¬þÎtÃÌÕ
Ôª÷wÞ¬¦}é,­óq_h83IÙ@éP­ñ°!iÚ Å
% º(®ï~ÍÚ Ã¶'®4Ûq8¡Øs£:M¶Ç(ÔùvR°U][ Æ²&-ã÷Ï,MÑ-ØF a¢Ai[ÓÄêW0vÈKV>ïfèB=}VEñ c¸àNù6ø/Wåöùaê»\¬ù¿þ[½¥ëÖ íÄcD¡ºªc­ÚUE²v= ?©ËB¿=}×ÇqI¡ô÷©®áöë¨Ë ùPÖòñôôàìØÓáö¸­ù¶èªég Á&.¹¢q<Öe b =M2Uáêªß U¾ÓT©e(¨Ó» u¶[Ä Êb= =M«cÍTÊçÅ= ²z>¦«Ôú£îf­²hp6z@ÙóÔ¦¾ ¿5±	kp%Út ·k8Y+4¸Àÿ YáU½ÆºA9^Â Ümù»f¢i¹ 0ª=MÄ (C½)AÁÑßHKj0ý£6ôïSs@£ÀÊ S"MK¨}&íÆ	n°Êg5%gºÚjWcW,L~Éðî= iáäsàyùmqÏ£ è7ø«¹ò÷óiÉg¶´m%ß}6ü	2Ï[óÑhbâ²Mµ72e=MåLóu7çJàÊ>JìçÖWUäüÒUð5Ñ<= TèÒâM-jf2ú7F=}µÄIíc$£éT+  " <)$¥¤¾aÐQM³xÊFÃºAµëÅ¥µÐÿ½L§ä¢!ÑUMp·½NÂ÷v+½ÐvîÁ|þtù"îÆ5[¤eØ¾Ø°=}=M®F&ªòo°_íìZ,+lùf2úV~hÈÞæÙPëÑêÄnð1YzèìæèweÌÌ®5jþÛ&FÓ.F¦yúbòïYðRªÛ: ºSIz?6Yp*ÆÜ÷iª÷LòjAk·é©è¸@ýKlà{þJØ>G®:$Àu8­%À3¶»Smq7Ë¿Cºüb¤ªê#ûr5Ë­?$LaÐ#6C´½eþ1B.65B¤fBíbB£p§eë_sÌ4¸uA7_ÞÑf_qõ= ÒèíM¾~Â/ä=M[	d/S"}Õ°ÉÄ[JZÈÄöì}¼ xN·æIûk¬ËJÇAËõ·Xþ9'²fç!e5ß^¨ÏÈMÖÎÜk.LR~yÔ*¯[Áqè5¢LÉ<LÐQÕpp4S3ù·Ñ2².|I+7/|	ô¦÷Üh÷£/+î+VNÅBp{¤v%nÑv ¹A$¬9ë}ê=MWe¾LÔÌØðø×ÈÖèseÉ­Ð,Ápå8'î+¼?yÀå¸q{ì%^:Åv%= øs×ù¦è£LËV·= æÆè}åmºè bï÷ü8·4d$ÞÖ¼FÅoÇñå8¡<@{(¡­ÐI5Ì4ó¡4©
ÅíQìK	»62Ò³îg t09B§Å"IÉilÎA(¶0|÷=Mm"YËöìz¤Ã= >mä)ß¬Ê;	Ð9ª±Q¼9L8S7AàÊp.¼ý:&õu;m°#:'Å
z>û2ni"±ºûô-ÑèR¯(-54StëÿkÇ	íÔ8m1ÐÆA4³!IµtÄàsI´
?´= 1X§ßÕÀVAÇ38#Pã<¬ô,É5ç'*/Ó×ãR~.è	(5þÜu;[®=M PTý²ÈHD»'mÞcµà6<V5µü§= eU³d'ZõKMR¯ZuSýaî¶î"¢Æóíïg§}û³+*áãit·êJPÆ1G2±ç´ú½uûrp¤=M2w%½ÀQ6LõÆéMÅrE=MÙÙ+­#·cnsü×~83²Æ-SÛ½n3Å¶±»fÝ+í¿Ýg34áäS1l~@+ K[¬Ùh(ê¬ÇK+À±ÑQ:k6Ý-MId«Ï"DÿÀËkg%äÿ5âÁñUÓb ¹¶X
òÛFîI£ú¢ú]ÎÈæl4¡Qx¦¹Ëv¾]\ï=}¼RØjÇHÀaA¿â¶²í´*ÓÂj÷­ù0WªJýÝÒ$+®C M²PcÈåì¾p­=} «cüJË.¦áØQØë¬èº¾t¤=MÏJ>Tøýz#ª@½-Óìábü]ðý»RAìe=}f>¨ã4<XÄB(cz<hëáÊ i;¦¼ íµâª°0éDü¯ÂÔÑ·èÌMÞZ øA#§dÕ¨{O¹AýÈ±æºÁ34>Ô-Ç{'S!SÐî{gÖ<oõÜ$ä¯¿î¸¾H8Y'!«øÿüä¥ºÝel_°FÇªà¬^á2Å=MÂ«ÙzJû*ùáQ=M¢¢Fs[Vb¯fÙâËú].I=}kòUØKÿlI.ße$/*= "CáÚéouFD¶ÎKEÈ;¯óaçp4gyE,[R¨5úgþ¸èò{)rªâ)y÷ÿ¸úG]+øWGÔÁ+]óÿEævîÍ=}^U¦1?0X#$Tñ3¨©T÷óAÔçÉêNÕ«æZ«¸ThÆ(òÅ(ÚàmÓ¦!S§= +ÒÎÅ7z_9E ®üÐ}ø¯¥ßqÄ^úÕQ¢ù:ËÍ_YÁ lëÔÈlg®.ï|yRT°Íö0+¦oi·¯ÙÊaªÎV©YçC	9EÙ/osF=M!Í©7q¨wS28kôÀ^E]©·ì(:}£|pøþ/ ;ùmþæÔv(ÆÄA'©<dþ!Yo¿ñ¾áÀcÜ¬Ö)Ef¡c~U DJÛ¨a{pÚ#awaívn,Ï[\­>ß 9ÕõÇXNÇÿ/ùÇò¦z9¾Ç Ôñ8(&RÖñÌkð>-÷ti{)8A½ñõb¨óÂ2a3^7Í¬Oå0!ð¾S&8_GÙ>/ÇêÑ(Múÿ.ºÛUU××EC\®PíeIö+>Xõz?þ8:=M×Sù»?ýJUëB.}Üòdû¡6¨ÏÁmY5¤°ïÎPrÒ0}q½QW PL ·|ÐÄ>áû¨E{	òÈAËÇ'è×{¦:ÖpM3¤=}%56²c·ZeUû oìãæ­0[&¡ÅsTþÑ0ÌsTÑ0¼sTîÑ0æHÍC iË|Ï¡K3¡wÖ_õã²B«³Ä°/·{Åþ½Ï1¨òVï«f¬îì¤¤aVkLáë³ä«³ÿØÖõ¤ÈùÂXTÆlg5³Ak%= *ÇÇ Ð@Ô-cÞ;<Áó×QVl×Quþ=}¹Ê5îNæ¾DÂqÍ(Î ìè'yyÅ6FºêÐ%Ñ{YÏ¼ÜbEÙ4\1YëÓ)#÷ÚApÆî¦Ùp>\|Ân¸5 t*V¯tf&= |6Eñ"#nÅFUÉã¦EÔ¬oôWßugeÃKA§ï{¾S2'»_B§ïß³é¶vR5'Ï3§ï/|7§§Y[à^ACZHnë·@o>{L»ñ(|ýP<{z.ía= â¤ÉÄ
"±¶§&*b13An±Z1µ@O°ÖæâÒ8wÐ'±_|?pBÞ¡þÖ#ú8=MoÁ2¹W¨­Æ
ÜüÜ	î*ºÐÂ²¬õÉ 
yØ´Ü-ÛJrù+
lô÷;úÂkFÆÍ×¥ZÒ"Âä¤oÝvn?ácV®%·yøë±³å
¡Ø·e´Ü ýãB<d ¦áìd/UÀ>R#Ãa5×mIä-= pñÀÃfêôÉ¡6§cd)È³&®TÄá½ãì.Ý*ü= h$ÝJ[£gg=}¦Ðø×ì£æÀê}^¶¶¼ÜYÕYPOZX¿ÇERÛU³ÞZ_BûOéÀ¤¼_PKAÓÇ[Bõ+RBÛülÿÜW)õ+ßKáÒÖÖVæ=}¯ró°dù)ædN*E·Ý}_s©½ÐòØ.¶ÛóWM¾ÑirýºÑA÷É×üµ|Ç3Ü[×»{¿uÿ
òEB³+ïÍÜúWzZÇ3^ÛþmÝj_-=}Èh2#R½^/YÙP×¼^î7Q.¿['1%¨][ÚU1Ë¾Ö|½Ç#½ÒJD)BvÓÌBþÌºÓÄ¥õï¨/<.R¨Ì*³iJÍ&ÈåÐ¹~éÌ>P·oâÑ2ËÃK=M¯Åä3iJ[ïÅ!Ù>ÂÝ|Gc°-«ßIÙÛH(OF»ëåÂmAjl-¡:ê©-ØCÓv@Ð¡P¬¡QSzÎ)RéÎ÷aòV=MòRij¢d|ñhÿÿyþ#SSs¦8	ÏiYVþê)y$=}f)+ÂÑ°·,þ3*òNlJ52W¯ñ³¼â¥bÊÞsÃ©F@Áf5ïL¶Ëq,Ø;?¸WL ZêÇyÛ@6Ô_øÐ#ÛÌæ³Oï*n!q»5ÈÈÜß2Xc§¸ÂûÜqwÞ!Ò%ÓÊªîBuo´¸Æ1qó½Ðt¬EBIHxÍßñ(õ¦äÞ¢Ì»é¶*möï½!ÇrØqWë
&±/SíN
Ã¬ÑtS4ø«/% |ð{Øè±zº=M©ÚâêrÏÞ®Ùk%@Ü^³}«°±áZRa-äLjèæ­Ö³WÓÉ'ðiÖÕebKÎï=}Í 2ï:Î»ß[ûÿ>?N¸¹9?Kªß55L+NÊÚF29ýÔCü¯nÒm[­ïOÖûTÝÁþ¤;{YYæ¶	Õ½¨íÐíÃÝcm:âÊpÁû©îXÉC²Ã§m
áFy3]§°¬Õô'¯o¡¸ EØm8Ñ%zì±·= ¯{àfPÔm ³gäu Gzà×´²eX^@[KcË¸Em FiTLÀÖ&yôÁH¹"×eWÎævfÒ
F	«ê}+QkKlyf{]±tHtÆÁ_rüþíW:$ZÔÐÖfå=M¿ôÌ¬$|f?òªÄÙµL÷ÖÅÃyUæÂYý^Óùö »"ba2*{g¹òu~#¦e÷À4µã¤ÛâØìù AA6WÝã,S;îû4½½3¬
ÎK)6¬Ä/Éù~ìùÑu:ÆR4íËj´©#½-JûÝ~Ç¡}Ê1(þ¦.!yJIþþýJÁøÖ4§~Êßn4B3öÜ°«=}Ø #µÇß¥þ=M½¡¿ÂíE4¾Z7iRª=}×u9¥ëÇ¿*µ=}ª­7ùÃÇ<0Ô¹/rûAö¤»=}¢ÃUÂJ¸µ 2^yÝêú¸¸J= òäVß©Ôe &èúèza³±cò¼ÄqTit´)¬tgrá«,çÿdºR÷HkÞ­ÒQÍí¼:RjnÈøGÊGÙF¿ó&JQ7¡¼çÜòÉÃ}ÌP&ãC©û!£î
v¬±Ü¿Ü¯QëÁø 9¡0bÄ@ *jr©ôa½GêÐÈjáË³æ§ÚÎÛ	¾ã n¹iòÇy»BóV/®ßråú$´¸¬¿^ÂSbmÞ2ÛÏÜQ@Z£þ1@â]S oÒQÏðì±¢ø¬¤ cúo)p&D°ì)y²ÞéËã¯©iäòr(YYÌÞÕ ¹ûÇN1Öu´¨Â%w{IÌ¢0ý%ÝË½UNÊXMã>Ùj^z%²7W'.ô{ZBúæMÌ4¼'3Ã#àð¢¼wÎlFQòo¦Ó½QáêÿÑÄ#UAÕ$½= ÁFïÓ©ÐZö4îø2XïÒ£ÜT¦#NFRò'T Ãµ+Âçã~AÆ4¦m©{!Ú#eDsÞ¡U0æØó£þÈW·xwýÍl^r¬cÆ´+5Ã¡ÇÄ§ÄÏ®¶LOYþO9OøÜ§!¬'Á¤w÷LLµ<;ÅëSZhR/ß|ù0eû¶ú¦G=MøÜÛÀ½¢4qës¾*²^.×GÝ:Ñþê&3ù7(ábuVÝÌuêJå}H;vEÅé7"ËÒÎ£«ÿûqøtSm¦aþô¡°CÛ_ã äÄ+*ÓKÏªdçÌ¿ÂöTs¶JÐ¾·íùp%cù«é*·Õ¦ÙA*[ÚÀdPÉØ~7-Ð~Þ&öÆ/~ê­Oî#¶ÕØâD -É	y,ZW41oµSl¸Ö%õÌ'fEªæ?"Åê	¨ÖiÄ¶k®¹®HÀçQîÅ} x©º«J ¾5haCjr0u MÌ;ÉÆ£¿½®måÛ5_úd¿{c/åÛ)X
c+vA¢>!¸P¿_MFÞA;jQeÆÄvå*ª*x= çm= 	qÛèEÐy= åûïÈviEª·´¦f«õÌË-pC= ð =M®ûÌ?rÔH}3ðÆ½ws¨F5tÑGMØ³½:ÿ»ýËÕF;þÉG/£«ZÒò	G@$Ó<¬­] ÕûÂÚ·äø Rt};väT[dD[lË
ÕË¼ÇõzC~¨¼À¾z¦ÀÈ ¨úê*¦wøö÷0.½ý¶4F¼Æ.åF¼ä®¼?åÌÑ÷úa
±;µ4=}.s®¿@þÕBv,½  Pþ®ÅwâÓBÜ?ÿ'Xk=}¥PB[ë(Wx£G»PÙh¦?.{dT\1®né7/Ã.-Ùn½B!³uý@Ãµ\Èñ^Æ¥M¡4¥¼±GjÍàºúÁzPÿéGZÜÖa1Ê#ÅWbÎ= ¡ïa½(¼wnà8Ål7=}Y´ýEÓèÅ¡N&ä;úíþLÊª¬ð)§îc(TðjÁPàu}îHx8½L%U×ÇcÒ¨Xüàr=M~³@8·.õbæm.àËHÆUyRSb§¬D¸39IÊ´ç|Á$Ê3ÒÔ
þSëqü¦Ð#k´ÊÎX>0gFkèÜáÒæ¢r0Nëwk¨%Q¢²Áì±yòpy<0,S0Âç)_Þ¦ÏMp)ßyÚnÝfÞ6âêý·¥ ·42	pn%Åîé^Û¾?Aù'Ú.UFðËØsz¯Ðð$ùOS¦õ Ê5ÓtÈ´=MÆuDUíFÆæíà	·ÓïÞýÑdßÍ±×4= ÷s IÇÛ=}s¬ô ºf"ÿÄm±ÅháB²´ÔEñ­9Z=M n­ûz¹eÀ-õJÚºm=}FGT÷<Z0a;åG7M÷²~
3^¹¶¼uRòwØlúÎ.ûXÿ
§Û9µ}ÜÇÐf©ÚC³çjT)ÌÁ»ñ-¾@ÍIjãÓ8 Z;)Ü½GÃZ±/çñyÇ®.A"^ðj¡9çÃf5ï°Ä§mêàÇ­r¦¯o®ã±t­ù±ðZ¤Á¸á%{ÄõAÕÚÉÁÍöP:R0 j{òiY[tJå0W½P¢4Ä-3g+Æ\JF'wN")>%rhÏÅçÍ~Jàý½çÆNÛïvågVØ|RÔy5²õô¾Éº²q±Àö"9 ¤v°LØR,Èçë=M®ÆNÓ0÷}³ÖµB¢X¸Â
¯¶æ¬÷NÕºÛ»=}^ðu;­hxk¨ñ^ »ô×îu8³3	½¢Ãv5=M:Ç#oE©:ÏN÷]j¶U4.ÿLñ§î|YV¡JÆ]ª¼³ÏtàL	û×+{= 6Úô»M÷=MÐH/@ËWr{ríopÜÚÒÖ bõúb»Æ¹ç= YÚ¸é½
¦GI¸yà,y,6 0åéQåÀhÎÐ·Ù Íp0ÿ-Ä£kýPý?Ë¡7"öÜd<ÙËaÝGÃ'XO»mnfò>¢æ[¤ã3È=}¹ºsÔ+OG:&RcNè|ÑwæÎ¶Øî2CÖ¬,?#qWQÐ6!p(Àsõ£_8ôÙ
-tJÎ5 À¦%:Y¹Saþ®?ÛMâ^lá<ËüuÚf¹= ½ä¬#}¿ÛÅðµää \Þ±í5M~Ï&8L0Y¬$<ï=}Ñµ½hÆµt N»
T%1>&ÚÀTµB®W:biíþ©(Þ8øÖÈºCÉù5/äBk\zþuÎ¡u1¬4-~¹è¯F¿%ÏÆg/µn4 u= AÈëéÂä#" +áìñnEÒÜXr+vâM¹
t&ì&XvûÎÜVÏÿÖ#ßE Ó®â¥Y\é/¿ÇqÏ{Wþ¨øYVõ·G½VO1&wÓm÷NéVmWU·c»£<s9
óÍýyÕ  Ê\¬ÂðåÍÒc©ÌÁÚT©¿ÙsþÓn|xÂuËòÈ[ÄÓk%.ÓU5|Ë\ä«´É ºàÊwIys6oloÀÅÔ;ö\³øà=}§	+RIþÌìÿùÉ k®@nòêÛhßÄCÃäkgîòàzü;;1ÅôGVQW)¿ßîO¨ÇÙ² XßÞ5û¿©CØ#"8S¦Gw´"$ëSíçJD¶ÝMHîSÌê­PÔq= F>%É\à<ªÐXOÞû£­¿^Ï_ÐRÏÁDácHªû­!µ5a=Mj»Cäö¹Ã¢QÖ]»K@»±Ê9´4C*@Í±à"z@]åçÍ/3Dù¼¹·?{ÍÉ_Ü5£´;$K²ÌÐÏæik9wNCmþgHùGR ¸®.Vû)ÆS¸J µR¿	µ)Lù6²»#_¯·¸ZðÕoË°%=}/àc?¬ÓC+:Çì¤.È¨éùûÑ²§ÞÃs?SQóã¸4Æöèeß+\YÃKcXÊnÜÇÑMÁ=}ÊÊw8hÕ¼ÏòßQ4öUl´úúýªõÒ©iö¦ñÌ/¶B1Õ*ßF)>!S= És (jq)Ã+X¦nv.º
¿ÚØ{
­¡Ãs·Ê'Ð¶wçg

Áês8K[Ìý.#BCô Æ£H.Ö]4Ëuå
WM·ì4-ÏOý¸Ëá©Öº0y G÷¨ovrY5mïC¼Ôc,c5ÀíRÈ¯yr=}¨BcÛ³]d/¸= ;KRÌe¾¥½@<^W[nM=Mlg¡¯>øpGgàAä½À}Îâ dtdqOv ;@ä1ú4³bGX½G¦K»=MóGªñ­­Ûáã,Ü1wÂÙ'DÃ³ÛèkÓ,É_ä^ù= Û7ÅgÕj¼«o¯u{Rô6NIUhJ÷_Ù°/@§òVµµÈG$<äø{_Ð5AqTÁ?:=}¥iU
½»È-±Ýù;mÎ÷q¯ûÓÝ¯Ëu|'¥}£·@p0×W'E/E÷õ7JÖ=}<ÉE7|¯¶3%SÂp ;¯³DÏóøU¡ÁÍqó/á=MiÒ°&$*">¤#é¶¶4iÄàý²ÑGÂwD 
ÉMÙ{Ó,T5îÉÙÈÍ×[Ân¸CµBõÝç_e´óBgzÆÔ
üEqù$¨Â= êÁQM²£'LH¨|8>s}"¹§¼Yd	Ú´Á¼°éÇ
sRBPðMP¯®>NUhõ¾ è®?-'îIgì[;[dFTßQªD'yð¿V1;-B*óöÑ$Õÿy&YRÙL2æ}ªÏaô»
¬6oÅ
Yv´ÿ~×l)ur×Ü¶®|YÄ)éå&di*B ø­Wÿ)ZðØ1cõ6ò¦Ô£Ê¤V$ä|8¸=}°ìó¤jä%·IáõdÔpØ[ ­ H§ê×æHüÚµÛ
´wòÑ:çÒÆºopHã"ZÆÞÉnÇÑÍÃ¼Ã÷hÕ_/ÎE
ôR= ù_ãV^A2|h¿÷.ä¶o)S;ÃÄ9£B½$«³eÅ&7ãV*L°RS	é|*Õ°¼éÊ%úÚ.Sz}ïñtØ|IÉwlîeðZ=}@ëAÓñ7òkNé"nÁÑÙÔaìü¸jaPüÛß­ ®IêÑ¦¥+@F¯´Â@J?Ø½¢ÊùnÂ¹	&ë¼U)TºÅÌ°-~Ú¨euÀSr¯eª×cR U­µ;ïâÔç(Ì¬ÅßÙBû«ü¨÷Ù]7´HrÒL&ÅMÑ1U(þë¶i=}¦zI¼r:¢mkkú¨ ¹Ði6ìx¢,ÇÒn q¡VÁ:%ÀÚ°Âw­ì¨&¨.ë#= 8¨|BÐâBo1PZì¬ùáõæ¶¦ûE» ¿âBv©$ÁÚ{-rÚà'8Ì5C¶t
}ùæ±¦ÇÞ43#ë	×ÃóÉMù¤ÍÑJû4N äµç'2xmù{WuSÂíÑy6ëÊ&Äq­ÜÔBøÐë´·«Ð#»
!ÅgÞt¢Y´pÜ«5ÌA'Ñýb(ÓQz,Vù+Þ\bjÀR,	ü!Ýâ¹·ºr$ÍÀ5¸º¬g¹³Æ§*³R÷á¢±óR	d[ÉHÆ´kLÚ[ÞÝ%¹Å­¼?ðUµêv¥EõO¥ÌÆ$üâ®¤¬ÑG£w^?ÚH6}ýí y¦õ@Î/ÿÁðôNF';{ï3<D­oçÛ&À¨ê¨7}-LX$0-PÊJ$0A*4L£·ü*\Z"/·rÐ%Ê¶sô³ÕîÍ
ªÔ+¯5¹mk­)JL^1¦C(À&Võ9iÓûl
¦4 K4§v¾'âÅålyòò®7%ÜÑ~sxx'=M'táC	qÃÌ@¢-1ÀqAh\gôÇinµ·e»Òë}
>µ¡ \m«5Æö>7pùÍ½sfwøé©ÃZíç¼*á»ÁµÓ°ªÊIÆ	£)ÓÊt­Áîµ}*×é $ÀVWD:zç_×g[ pHþnV)Jý¶%8soÖÎÖKs$eÛò¹ ><8WZÀÆcw2eHwUPI§ü$f¸²°¡¥dEW´o®odU·8ôw·§Ñ]@¥ 1 ]?.gWs=}@]äNÆ0úyDä²'ÕJ"%Ê^0È7Ò63 ÷e&µÚ- b<øy~´IµÆÛ1AøãÃºï/ß}åèÀßeú¾ïct5ÉJ²ÇL¶ÚÀÓ´ÝË¶]EùÁ,:WOÑ£=}~k¤ìHyevUáV=  ÓÔ3A3	µÙ½L¡Ò¹e/¾ÕÐpe¯®&¢ã*§YÝ!Yº+:E²MF+¿Â§ª7k{ËüÎK«JÚr2·ß? #¤°êB:f2½¦v2ÍÑx«½±È²Ø*ü¹|è¾Éh4¨2ôZäÿ^h×tÖ=MÙ¢Ä4çÞËT"
ïéÅÔ(NCù\ÊØÓËx66xÙTÄ--ÿ¸AòÉKádi£*nÂÕ]÷êÍâ× ±ã½´Þs¾¿Wi¦M6i»Ö	ØoÅÄSî.Ë·	
µÝµ27Òâb$áít³ÃvÒïuÔèMOÝ­jb\Yë;,%Ü?kYYÞºìoÉ\l$5=}ÅQe¶ :oðÍÆD:bNÝÁÁ¹Ú,R!úÊÚ]¶úè3_ïV(ÿÁråÈ=}~öry>ð ºnáZ
åG¯H1£Úë¼(á²Vm¢+õrÝ­ñb4UÂ©²#¾N³CBZói)Þü¨^AÚÀf«?UýÁKl?e È Lú¬KÚÝÔg5S"¡éA§OktÐ#Ýð³´u/Ì Á]×0tCÛp%Ù e7J@e¤ÑjÛ¯xÂ°Ïß9O·£èµ÷'Îie¯g#E3(ýKPÓÕIÁáÍÑH\ÓkFÎUÑñËào¼°®4IÜcw°ÞÊTÑºÕüëv*µ)¸4æã,Ú^d¤[æ6;= _HMû·¡t;VÜnv÷5¤>JF¡£¾äWIýïÉcçD·,ø9yÖÞç%$JÐöåÓä±ã,ýÓå6fâ¥-¿|ÃãVÙcÀ;HÇô
}dFpjÿ.%Ræ/,Ý¦Ö®³M7Öô/AûÚ?¬OÆÙ3OfXb¨ázr8d=uËQ;2hõ±N1J8] >V c$ÄJ pÃu¾¡?ã>âræxÏ¯ £íu=M±û)Üen-¸^VìzÃVï]Ø~
Æ9?6¨·	.ÒWç/æU{Ü0ÒdÌS^¹^ÐiüC¯jnN¹ùnMèÑæºmÛª®AÊÏAMyùIs_8BÙÀTYÅla;Q$=M¬å= >|QCÉé4~xJt5Ê1náÀò1ÚUdð¶-½ñ§flÅ;\¦«ãé"JØ9êQLn'Q9}ï²\\Ä]}«X:ÿ48ü×ÒéGÎsw( Î7OGÉ!ÜêÚ>QRÕÑmiLPôÛ!Õtñ^2ã£pÞ¦Ûì "Oã¨/êÿmµ$ Ã&yä¡&þ×Gz_ã¬(ÚJÁ5Ù"ÞKñ­8¬hÖ5Vø¹Wp@ýþÇ= ªEþ,ÿáÛè$aÆ·ËP«ÎµüËè»M´$ ð=}R'½§<¹c¥päEïÍÕÁY-¨z*ÌQ£D·N»øìÕ·hõ[ÑôTNÃmæoçG½X·¡ûÚ= Òy*öAúÉKqÅè£\õs+{Ç4@ÖVyèæ§ï²º°iñÎ	8ÉqÎ'rJBÂà4×ø[ëÐ½Ç·ÐìN@"PXn· ³ýFîM ®UífÑ¾°ìùZ®n
À6= nÒ¦V8ÂgÙ£Ç¦ÛÇÓ.4ÒH§³j!q}Ù.fnû cÂ+÷XyYY¬Vã#áå¾'åtMF=}Ó±É­y$¿g²Ü¯=}=}h#;RoÃmºà¥/usÿU²ïkÌ¨m
gg/¨Kp;ãî¶aÏê­O+s,K{= 0e\¦Â[ª·ðdèA¦ èy.¬fFèáh¸êXíå#ôyÞd/øªøÐôê¥býnq¼iêªzø2êyp>¢§>y¾6ÆèÝÏMJeÆ:Àª&°?lbu<ÔåÈ(óÿT¾Ñ +Qä:ul¶¿cÁ0Lsú XöÕª(Íá^efÓwq>Ý
ãÝ¢Mrc»4[-¥[m{Á}ÎOVPVNïàÓ[Wú«zÊ4T»ÓW¯)3J6ÛÛNcn½ÑÁu«é,= T©Ã.ÌM¬a4²ËHðks½qÌ_³Ù¦û=MY3³ÃçíÊ øK(F=}FéÒÁnr $ÌF¿ü¢,U^ô+Gdô6¬2-½\+7\KÒ |÷:OÑdûyIî§_âCÆE¡ÄÕL1ðËÎUC ³ÍÆøïÃR¥¸,wRõÓî®±R^hùç[y{°^6±Yí]iZæÞ²4>?ëÙîÔ«E%K$­TèEXåCP\¦ù x,£ê¾È¾ìObÓË2ûhÉÅ eìØW¡~Caô¡h$5%fQ8j\V³¦8k#3ÖÉAãà4ì¨ ±|¡:	#Ê´E×ÔhwåÚ¨¡ÇmhXR´},òIùèAÈIõâáñv°:pX¿\K1¹§ D	Rg96rÇJyÙ*ý²ÎÆ£Ñ¹)ÞÀjçÐr¬¿oð£vN= &v1·Hì¦88J·WÃÂÑôäòUVÒHK{}L»VÊ³»ö½áWÌ%0Ä= b³°½ÐÕW"G.¨6¹ì%!<H}£~õñ0eU]Ø+í]a±}ÄÉÍÕi)z4Ý L,<ÏÕM¹sD®lKEÉe5(3â¤BVÍÂ-Òà9,:!×p¾rasIäÈ°¬hÆë«ÂEÌý¤íÑð7f x-yØ±æÜ^v¯õw=M³~gµã5­×÷)Ä¹ìü×|	0³í­]¦M¹)ôô/Ó¬Ã£ç)Ìòõ%eòÒ4¡"²TzNéÑÆ¸©ºTlÊÑÊ!4<Hõ~pºö³¥c4¥"+¸ês&BQX¸®6¬Æ®Í¦Â°êÖ= çbxïûfì-¦é½WØKI2ô®"ÿÙj~ D?u;HuLéHíb´ïôù?Ã= SfÉéàGíPlImþÙÚ¾o/¦Ú^Ø1SØËî-À
0ø5&>^LS"X½eJ?%üMgj6§ìo îÄë=M,ªT= tµ¥MÂ#Ü9Ìåú Ã´ðQPRl[¤Óc}¬ÆgSÏ[QöU3ÃEäZÆá8GðnñxÜÛíù°ü²ò\È?àUl= fÿ
«/ã7Je!àâËC×¿vl¿6VV)Þµyoáí¯õ0SðoÁG
nï¼Ç@{­n§J#úXrÕø´" iÙX@þkÕ!-×Ð³- ;=}å®hú§Xävð-þÚ-PvJá§ÛXÐkF×	§}K ·ãòô·BÕDñM÷·»0qÿeT1úMá!r/¤¡øt|4¼:º©4ë!gWýC=}}>}Ù7IWÙrgÜR4TM~U9¥{ÓÃ¤ý÷kª&[Eq=M³8±÷²÷0<0ø«·z°RËºÌäðk9Qú}(±H«¢kÐê"Aª²Ht¹R[ÊÊV¸fz´Ëì¿áMÊ
¢yRpèúb÷×:î1úüxaÅ5yÐâ¤ô¡£>Ñª¿í(^Gr[Z+äv_ª¿raòÍfqoÅaç[ïÐÀ-8}/Eöúµ*ß£¼bWÿsF-ú98VµÆ¼^Ü4êësûz_%c\^Y§b_³TÈòÍðøzjû@¨DkÙ7HÔ\1In&Èø´$9´ñjâ²ÈwSIfä4(ÍÝ4b ÆáéçÕÂÃNªýµ7æ-×;ê!¼¤Ev~¡UK x/$W@ù4RµeÊuÁ=MþºýÉóÇýîQ2û
ËQBÁyñy÷É~O4­GyûÙHÛ-Rp\õïÌ0ì-,Æ9iYäúÎ|ïÒª¤òIV ÐûRÑ30fkt01<ªß%ÈñÎ±ÍÂÔö2¶î;vØ8ÕFÌ$Êùdm!9må°4[9òÜ0CB|×6«KrÌ$°»÷=M¼ÍË½K³%÷Â;§ëbùGWÓÐèâá¾ï0uÎE²:ÏK5¯é3ÝÜ¢5(í Xy=}çÜ%Î;Âò=}±}À÷õö¯Qivh¸ïø}Pö¥´]À Å§r¤fD×f~*W Ëó¡ôÁ»êF\¡«Ék0yK( ½ih¯*GmÝÀy¸¬<Çá=}b/4å3Vÿ¡\H{ï-Á%¹®Å©-óÉ§Qöù	meù'{ª°È·¥MÂÂëï\vuËP&^Ù³ÿc:Í¨Ì8òQµVRÔÀ%5Ûù´\#ª^Ö*öF S¼©ýÑÒµ»íUtòÚiftÿ|Ýcåô!¬ zID¸Y6	ZLpÖööø#¬pÃ*nÝvddo	'°{põÐ4òðËsY/¬½Áó34:LÊjà|èEæ»´¤¬ý|ÌøÜ¹<÷W$JÆÔChf«Aê$xH>!sB»fÖéXaéÿN¨¹o¶ï&¼9âFÍ>è>míºÏ<Úó6û9ÙÃÚÍâü¾<½aÇÏ­ÍÄÈÃë3Â[sã6·(½!lò5Ïé­.S=}ÐÊò÷F= = 2BøqÜep®¶Lî	8é@¯bW¾ýÍBO§Ø¼S;Ô
uBÿ¾·Ã&KK¢6w}ñ¸=}¼ÎàªçX%øî¨ª'	(°ñÐØBPÄp!¡¡:,¥¾/Å3ô¼7ûÂÍ3¨ÆE©¦FüÉ;§A¯»ÔzüÄ<Ãà1Ï{0"Uíù¶	äXGø°%M¤ÑÏÈëO´çR)°}R8B	dü¯¡ícKÆjý*IyÇ¬¦¦ù,\NVü«mz¥Ä«@=MièiÖXäSßØ­	Í­%ÉU¨8øÛLJyÈ~ß³ò5çtÂ÷|õæÐé8Ód¯~g¶.íú eÔKD ¤@Be±¦»&fÑyKfj £Ñd?#]¨&GºôqésÖÆÊ¸GwúZñ»XÒLñi²éÖ"gÉlÊïä-±¯ÏS*ØÏûÉ¶/£þ¡6ubIFÜ'§Bô:*ÿo=}làA1 jGãÀÁQÀÝÏÎåÒÖB5#a:3&²Rªº(þØq¼µáRÚîÙÚX¢®X:DjôÏ!8ÎOW4õÅú¼´kØÿ.ûÕ><úëbé= øbÑã®p.XI.öûá})¼Ó÷¤ñµ­æ=MU¾z¾{)Sè²·	¤­Ä×·	 J°/®¿¥lÉ'©pâ9Tñ)É¸ó ¥án}ÅóKH_©9°T*~C2pzx=MBvCu×³ù°ºLÐí¥0°7:: ó~îÓÔªBÊ&²N-4¥ÀkVxÅ­ù³î´»ÜÆ[.BÃ¹¯kÒã$¦¹%ms?÷"Ý¨8Ç©X^êÛðHc°S#h¨áï]ÙÂÀ#å1ì4ÙýGFsÔó2-=MÞ5$¡Ôì¡µLvYbÂabþKUðGÿÇHP-híüe­ BcRSaøÑÕ"-Ö¨g¼#ÔÚóÔPâ¯ÖåôûA!ÜëæQR%H0á= Kø\-ËÆC\¨ÒÉíw' _¥	#ÈsÀ?ØDÕ ||>è"<o¿áhe¼§!0ü)å'æèT(;	Ã	öà_ú%ocà:°ÁÌ ¸/Lg²=MÆqu>ò°©¹@ÃÝökËµúããN5øi§_"ÛÃh*9g#GÿÖÕJ·þ:tZ>®¬ è®KD=}Ô½|äûÒ|S¾*ãG|@F÷¬§UÎô]³Ü[Y¨¢ÅÛÕ»È¤Âùù6¡xfqÅ\§= À-uß¤Uh±°"¼o<û
¸÷Ò+®HílfÅÿ«8ÉÌ&PÊJÍ¬õþ²n	å6ê ¯OGè¥B »Òé1ºB/°Ë&)möMA	ÄJÊ6 =}@ÞíHÕÏ~åæ= 
Û»Kµ#¿:ÐYýZE1/_«Ø)×ú¢C;
2Æ\Îw:ÒäÜÿ^÷ßÝH^D£qjëÐubúxíyÖ3uC(»Ó= S=MÎ\T=M¾^¼XFéëÍ!a¶ÿý¦%m=}<éÊØ[ÄyuP ãDGÃÈ= U92z!EóïóV)=M}Á}®+"**è= ¸éua6¸i«ü03çï= :´¶ØiøÁbhLp>j?*¤ªJ´«V¯ØmÞ±D£Ã1 g= =}= P{LSßßf8Û ×ç&.fJÃ= ×àóf xHsµYEaX<HÈÜ><§ªÌªóc{Ñ·ú$  ÆÿÑi¢Õ;¿¾:i¿1ô~A a±!}8ï>DÊçU¦=MG§íôÔ=MqCBlT#71P­b«o,EßÐ¡@×ºTÞúKÅ¸:ABÿ²üÙPñôýË¡ ÐÝMeý­©ÆH¨k/û%6ð¹Wmo/Á¹|.ü7üó¸g1ÿ¶gºÓzö
4._KHô¥óíïåÑQµÁõóÀtXùÄ­¶ßÆü yÇø²0óØ
ÞÎóÍ@D÷ÆºÌx¼Tw5¾ëIá~ôje»Q9-]2Mº.Ðµ4?)4= %þ-â{Of³0J-¬ú	ç= 3y»äýº1µÎõíèDð
3 ¸øÌÖô8y9&ÈMt³DE¨Èx»»÷ +W\= êÌ Üì= ï$ÚvlÑÁNö4Ïâ=Mõßë+KN]·@??&UK-èóÑ´BÌL¸hbÏçI>Ë|·Av@9~UzåÂ2Ê°¬ËNSÓ¶ÿ&ØämØgþ"!câ³g³ÉS¤-aBÔû·µv÷¶n1õw= øh
®rÔG¬Êß(çßÂFûb"ëvä³'ß1øHÒgÉTÅí^h0±7²î´pk'=M©ëFùTó ý@ÊÌ'­gêPÚÚëÕòäÙü¼é+¡õøö·è²Ó«Ô"½ÜóÔ)ßY-'®þ¼z¾ Êø®H½7OÙùuV"P=M=}ìçE?Â#-xR¨(¶!¥§òê«EÌ _ð Fñe¼£= ¿ß³Ù½²ÊR!å!wÀd\áý0= ÍRl"b®f'E¾âRâý1$)WÊ&¥A²a®jW5ÐsÎÇÌ	u¢ùyÐi«Î4ÌRý\è;ïö¦
&KnJ>9¢Iñ= ðu~hÃCõ´5m±ó*#I¯Ù!èáU$åJûUTè;6'6Z	ï2¦þ×7Òè_((%Çf±G¨ÖÝ,ÞFµä'×j(±ÓÄ¶Ìôðïi°ëé;ÄËSüY]ÃÝÔb;ÿè ð¬ó@ºZØ*P¾5×%Ñæ_ùåû¼=MøÝæß4·Xô®p	ÓÐaÞ¬ýäÚ¦j°4QÑÈK»I^/ÎÅJ"É\~ÙB^!jçõüa¨ð©¬+Â÷\ë¼?,	oR~/<Â/ÈòÜ^¿Z/¶FpßO ·öªÅ_Ûô**Â­prLÿóSOÁõoæM×²GÍs¬²1äÄÍsr}äúðüi) ­¹¹5?l%õÅlã9Í£Ärµ¹înÃ®Ù-$0¶¹ RF»]Ýtð_·îOº@]}N@ÝKÏ/U§=MYÄß[ÍßÓ·6á®ZQ8Vigx<ÂS\éÎ2äëlÈzR
¿mú±(Ýh)Üëfm®=MxZQ Tz¬î= µñõ´#saf­%#	êÍ[ÓBùq¯í»ãÙ^¯ì¤Gl1Éðy#ÅFä'lä­#¥s¢-yM	ÖeîrÞj¢NÞLëc_½moxXÇ¸ë?íq:3	¯ÞöÚùîS¢	ñv±VøØ¡ù}CÅkío)DÉÑÐäh»Ä:·ÂyöÕBYüLÓô¸ePJð§Æ»Z?éWnx·_ø»Öª%ó#°æ¶¶­G&6³þÁEü5BÏ£pùK»Á¤Öx(&moPU¿Ð;65ÔnÎ«VÁM8÷5»n:>Åa)( È²SDmµ}2å® Þô[ÞG¾q_õÊY^r=}ÏC×hG²iê G%?N=}²Þ7û¯ì9ÔýäûI;B:©Vîj¯îL	lÓ²$¦©10ó¡/~1å-ò,äD½2Î2	ÚÐÀ?>ËÑ²#©r¢O^nTnÌñNkÙ®íW¡Å¥NÆê3Û+s=}1[ìÕC3±:/)>ÕâÆÅÏÚ7YI½Qûå	~Rîæó0D5àhrm±æKêÎåÙËråT,7§ß@eú;Û¶Àd£~ÈyÙÙMÛcñg)#æ®ÿìÂÃ4ÇkÀ¿8.dPëÓòØí'$
gB,oFo}ºæ*f¡º §ûúÖ½lÃMèÌÒ%ksGÜ5ÇBÂQ-Û-­|§í9ÔÄÅ#J¦óTìAL~³r?P¶-1Í½òÕ=} ìiþ«¤ÝÄ&fÏ¸2Ïå
TÊ©ÇÜê<¤@daË-Ò1ª±]È ßb±2Ðb3»
J×0ÁOL®·T©tªu°ÆöU	Á= ¤(pØÚSÜ/Àaó=M­µ4WÞfËt^ß
¿Y9lâÑ7òæÖ#Hº;ëdøLÚ¯QÎ$Âx/·Gú±1ÄóUÀ-§ÜÏ­öUi}N÷]§Ày þÂ(4óòwURáû{U3j<[B\ª£+-ã@Àpd®ÂP¨Î>JSÖ5RwzMø3/AMc3ïëÒ@{Þ¿MÙhP&\AAÊ[§ehÀÓo·»ä4¡ÉáíÎÐ;2ª9Å_ø¨*©l¿½u3= ¼A¹Ð&ÍQ Ú|²Í­E5Öæy¼#ï÷2RJi²IIpjÜ}r.A$ÑeaÔJ~ýõ$Í²ybê¡Æ6
¡4ü°°-LÔ#589÷"NÈ±:ªëô32Ä9&=Mß[C.~âM>GåD<R¢ÎÒ©7/FÉßÖÇ([!±5«Ûé©xe¼ôªoÊè/ìrâû;mj;4ä¨ê°ïw+¯,¦¿-EWVómOiï7¶×&â*Ã²¯÷ HlþÌOù»·ÃqË»P£®$¾ê8	¼lJ0U÷F¶ÓÎ¶Ìq[YìÃ§
$¡0HÚôvÈõX= ÿÕªI;Ê;ð0%*9=M§Ïñõ¡õ-äyZçù Ü<NÆH~zøþP³	ýª(§\Öç4õÛ\é»
*¿¥÷¼4ûaNi3HK²¬ßæâ;õ¶ªß#U/#9tëïÖÅ<ø2vÿaïiÜ	¸Ü:Ý×kü}¸@ô¾³Óâ1.(B!EÄQ9§16¨ædy$É{[IP~jü­õdµ?%ÂQgyQ ¬3Zíb¿GÂÖ$¸ÜðkÄQ)U4)'´½XH(Áëëo2ÍTI|,aè%ë/ uÎKø%«v8Ë¹Ü°úø×Ú&B³°/µ+@¹ÜÚh¾ 
e@11Ë2¥®FÎó×ñl_y¼/B3ÑÏù(	 Nvÿx­ñ.dë¯7¸Üv(Bãè1(ütªB<ø%+¸Ü
&HîvÕdÇí¹ÜîWbWîï
É»¨½Õ<â¬"&BcIzvÿüÈÙvYL
ïpYÑ';Ób¦í,WùthÇVÏÈúßG0æmªïò>/¸º¥§î(]'²n)\øí=M@Âì\
 iäI·x:é«ÚV¥¦øHéÍLºtØXFL[¬z-àB¶LÃÀ^Q#B·ÏÄ8Íß'üðØxT:²èQ¾+úÏÎÂ¸¥6Ö SïÉ=}*ÎvÂª ª¤×fï¸ÏµtQWòTfñÐI"lL\Ôs×í3{!J2w0ËñaÙõ7ÈîÖn7§$nzy8i.? "¾}y·2&"¿¬Ç<È#½ô!kK*L½ÙvícYuH-£µÒÇÄaé6¶0ÔBX}µg¥¼g­Bbûî\ì ±ëE§üògON×=}âA¤´aÝõÚéb£j[$}ÕÙ8ô÷ÍVf á'ïºáF3:4qâÓâ3GøÇ÷5ÑÉ½ÎÒGDKÊjµÏ	Qê.pý­ôi±Kô2ûp:xC~©/?¿C_ÐmA)[Xz3fË°ºÝ(T\Læ¨ GkëB&½ö¾"ùGKê!®«ñðmäÉï¬¥r°*¸FZþQ­M¤FÙ3Âu|üÝñ·fÛ»u(qå=}Æ~$V´í£òQ4®ÙveßMG4î©ë5C®;CîÚ<Nf)V¢¥ùSEÁ^²¡Ñ	AKÂ8æþ ð µBWâ.ÚìÓlåv'Br4@«xòøJ|ácÅðÑMÞkÊ´åj= Ã¹Q&¸:'	R²»îzôc¾¦rCìãâ@£ÜhÞx³Ôp>\|Ânèd)AZwÞMîgbf)£¥ìèn7]Eg¾	F	¥äçKï\.§ÞÅäÙ¨Q
ýëöoõ_7ê¹ÅRßÊõ²-õS2ÊÜcjµÔøQhü ÈècíÚ·êëbIIîÑ93ÝpE~^nÙk<ª.µP¦»ÑO£=}YäÞk%¯ÏhÇïxAå<;r¾Ò÷ä÷âg1ºJ°m	ïäF¨tëg #g/ëZpEª¸UUyê9Å´ô*þxê|ÔB©=Mm $±^ª[Ñ£ä%|ÃEêè4B9ðâs«u×Vu-IEþjÝÛ^àûÖ@Iú½ñYUq9=}¸ÓSo}x@t<¦vÝW³q¥Tqñ¬¥ð÷â2¦¤¨maf¬aUÉdÙÅ*0kûÄAúÄY÷÷Tõ¦Õ2
ì}Z^­rýFéX~vyÃøà«×4">B'r¤|íªyõÖ¬Ë§Äê)¦BÆ¬»dcK+ºëà	DfMAµ¥üË½mó¬ÓãE¸qÈbmÅä¹VVÜ.ÜGåïî¸È0cùåç(Åk[¯/ñ¢O´n8('.=}u÷±ÉÔsÃnf[CÑ<t7lôîF:¬æJ%¨¼Ì@ÐçôTæÁ¨#nõ3¥f)mnOk/á@¸Á² æ¹[r¡ïOÒBÛèOÐB¤­£x»ãßgÇ¿V[[§SÐjÈÂæ3ã=}]-ËûÄÈÇMm»-¼»fú.þ­gDÈVj °³$°"?lÕÌøÆä	Rf/ÄÀ+dî§j:uÎ8t´ûj±^}÷É
äT9<{':¼SC)lc+ÁýlÓKÆ#LÔæsøøÓ6Zj¯h|;ËôZêRú:ùyfÃIkü±áCræsC2v|çýäíóÍú½äR!ÃªÊ@Ïk:-ùkd<Ös©ð4H¦ºó6¢_±V.øÛÇ974ºå§Ñ¦AØ®§3gAy®Gì³ç«4=}}?§Ù W"Öã¸Ïî_Ï&³»Ë7HÍ%Ö&ãrRÈO@Ì3xsZëî;àW¿nÈ~=MNè&iNcqÚ~uþfOy!ïS®ß&XíûBX«Dnq¢wZ¡2Z5è:/NÛ§4ïA\¬Ð^Ç	ôßíÐP,ëZ<Ò°Á×9ßà¾f)DFPe¯:N3y¦"añkç5¢vû7dÏÜ¸R)Ò¨Øí6·isgö¯_|Èq±ÿå×<¸i>MA?o>Ô4»Ýä-UfÊ4¼RöNätbØ=M/¡þÙu¹Î%øZ=}ÈòPänB
=M©÷M( l÷ÝÒX>«PR«ÎæT¼¥= c'Ä%XZJØßÁÄnË~^L¥V2PÝ²yF1täéçÂz	:J·tÙ{ðq ÃeÔ!üL²)" i$W*Ñ:ÒBV
"Õ?ºâß}JT[B;ßCñxCÒ+J_ì¥-Ss00ºYÄ½@Zñî=Ml¯pù72$Y3þ^¹m)Ñ@)Ð6§YtØÑX¬¥ ¿´"½ânðÆb¤û¼XFÊaW7Hl}Ë¥¾Z7NÙõÚhyYÑw+ømH´3§©¾¥KÕ³7:hÍ6wV²¯Ôåv'Ì¾#14«ÇÐx(9³¯&âªÓ5#\ ÝRÄ´_^?ÓBKÁ42àJ³oBàGé&©¹È&I©³= ?G%wéò2í7Ndy?z^:£?}zì±ý bË?\f2%¶K¿}¢òKÍÁwÓ%éÕÙ=M½Âÿ%tÙT×U}ÕX,zC´yÿ"°%tÒSö	.Îá¾04ì$¢X@=M¤ö(f1¸íãDSÑ¬õ²÷¤Ï+¸pj?5º§¢Æõ±ÏgJ-±øØÂ)Ö/>æV0ëü@c*
¶°ÿëøîpÚ¯¨{uîi>s±È jÏh)!9'G"7¨¡ÆU×°ô'>ýyãhæ:= }ÐcyûcAy[´ëÚ
8ôc¹¥o*ÿméÝÍ%Êw¾¢µÏÿ­ÇUt¥ZJx5·ºSl±@«-Aa
eH¸aaFrsP\OÑí÷áñx´x=}p4´nÐ_­IDD*½&èt­ó%gä}Úx#¶ñj=}G@³ö%ÝëÓouèqzå7híÂ Òý¡©t}ZÂ@i9QOÈ÷râÖ-õdùf¹4¼XµÜ®¾c0Ò]ïàòþ£A¯éÈþMx¤\1Êé¶´O = >Ë« AX'@à= ß)ÆÀÐeóZÃÖX_©ÑÐjY]·<Ô¡,^¦¹?5iî>¢¡ä&âh%©|éë¾æµÿ¶b«(-vÒLRÉµLî¾²m°­êËMv³åAýü­¶nWmú´ßà±_ÞTåo¹ï=}S6væ$!­Á!o÷_« @W¼RÍ)¥æh¿14RÓ|Y&%ñî/Ç8b
@K4	jÁD¾Ñ¸Ôu²*Brd5g.bùNvD2\¶ì´Ý_ðä>Ûÿ))ó¢^ÃX$Ø\2B
#eÈÓQeH	/KOFÕ~þÄë®Âø:([×¿Çµ*Xv?ù¼¥èØIâ×ÿ
l¶þ=Mo[i¼ÊÆw¯ýühÕ9Ô Y»-yGÞQà¶w|êÑ+ëBöî¾ft"ª%_ äTq[7YfnÍ»ô&4Ñ|ä¿G(ÁÙl¦û&iu>tRÏïd¿àö8â¸|t
H²NUQëA=}*³½Ø¶hÎO_qDÈÊß!ÅÈx/y¥]?UØ,&æWö¡ê[~t"Î2Aíî§!=}gØJ #+O¿J¾Ñ3=}3PÉÕ))¿ÂeÒºúBõªöZOZ1ÛÚ[Nõ+_P§ß^×~X Nó÷o^*¿Y*ï#ëTöNRw½\9mIs_÷Ë/ùNûÎ	®ÌJïIEKXO@©Ì\P¥Ö^_ØV?ÇE«¯qmkl7¯uA,ñ&ÀqµÛõÅñY0ýÂ{|íó$ÓTmÂÉåÁËÃå>n£$K³d\å'
ìº°ã rö&¯°w*¡(Óìä°^{$C[ÁHð	ì6­*ßb·SQÝß
×ÂJïéJÓ0ÿ¹øT1ÑÎG_Ý¸Ù_Ñu*ø^rUAäs2¯ì½yÿ&rõÁ¨Åyòês	éæJ";GÎxIÅaÕ9[%Gì­:ïgæb¿Èb[BøV"ð:§¥>OéÄÇðª8ÍÄÙ05>E
j°âzúº$øÃ²:íR¢ìÅÊÛèÏ~Cc¹éði÷	¨?bàÕ­Þ9É$fÜ¸Ç¥JíÝz;§>.c©]®æÑ2øÉB·k¨ÃÐ¢d|»	ª¬4ï³¯°~sÑ£;=}Wq2_Ùp÷ï'~
+>¨éÜ3&å"ú2¾Wõ÷Æe}=M Pwô42ËÐüÌ±-C¹Ð%A|y<Xsé1ÝNr9¤jÖA:eÚ]T0åÄ&ºsÃí?Õ£¦0{R,éË§¼p©ÄÉ$t¿å	_ÌO2èÉºÇ~äÛQhÎ²ùßo÷29ß×mF=M¼Õ	Jû_Zk<¸]¶âú¶LÝvZütÂÛ_Rb ×Vy^9Çx=Måùsus5¬Æm645HÀ'ÕíZ7÷í-7ä."ÞH®ó1pàºó|#Håi.v,sÂ$.OÏS.=Mmñf í©ÉíÓ{q¼ÍÅ"= bÍùn­µZPÏ½
ZÛÎsTW´k&@¹qýíj¶T-( ìí*ðAbYî³}æKùq7= Á»°}g´nF|Á´¬ sV´ûÅ±Xú-P@fäW%ÙÚ"wÚv«|òEóE \Xö¦où°Çú<Ç»ÛÄæÃN­ÆË2:ÿ­,=}Uqô½+ÍÃääST.;ÄËìU.ïíUÎü´¼qêÉ%ÚS(gvû¹7 ¶IT§½;T¤ú4iá¨ëü²ÐgÐâ&(ÓÎ¤ñbgTÓº­Ìâ8°crXaÁâ<jú%¯½õ{löíªL	ì¥"%R³ãÐ ûÐÛòq2«¯¢ Ö©YÚm= ØÝh#KÑ°n
L2ûÏY<PRDby©9Apl}Ò
õÀV	Ik	Ó¼ÜÂ¶ EWÌ¨­Ð Þ$£gx¹Ç\3¬|)uR/ÄÐ</ùr
ïFÞèN¢­áÃûTIrs¬÷µ?dP¯o®DkããW2U8ãBØÚQe1¿úEÏ:u\i3ÜUëÿc?§]q*gFXè
áoéÞU7±³?ÜD6ìúðäOéH(ªÖ¿ ±½{2òe¸?õ4T%GW¸êþÏê®ìÝ.¬N+)µÖ5üÉhøfì¼áÅH,TúneX¤vyããÛ¢õMZÐJåk9ÓÐ½&nVmÇôC3yKÂ®w:
 ÝE¦f$XèM °?TiST§ _ÌSÉ§E´=}¡xfÛýu #mÇÈËhñ4ôóõCªB4ns»*"æê¸1Úlo)µÈ´ÎÄ¹ì,­5²Ý"jÅ½rS²]$zaÒÏGôÔjRî*³¸È7ËúZU *Z¹$V@öB9»ãmÄ.Ï¡,¶$è÷è,j¢¿ÕýGü
¯OÛÆ¹}Ã>doÃÛ¢Ë/ûõ¿ÏtVÿ>þÍïª§.®ÝRã@'Yfö;7	å^¨¨WdÅ#}¹/Oë­õPPE&©Íh)a+ÉCÑ¤J{¢6ÐyÉå72Ç[±60Ãu= ëW:ï	î£Ì[xCI1r¹5ë^tZXH7}*÷K¹2M»2gðTuêeÊÕùØ­$Fùwå
!°oD²ºY©ë¢apÉE¯
´ýEµ.Ñ÷¡¾¼§e²@Bº¨}R	'¹æÄÐdáÅ©NÏ.êøìjNA1ªÜ´<|å	î¶%¥øoú)Ü³b¥[w½ýXç¬Cwùwx£³ÚïëI(ÏÏ7"£å,6°ér3Û6,Ò§cëb²ïXózåò
lj}õ1GjùL4ÚÂüÚ-q%ü:EùÊã´ÃÔ,uU6É±H~úò©QúðÒBPå¦£CìÝ²xözùxÓX;Ä¸C¼ä0#geíÒ³Q¹4r«jÝÀ8þýØ£yãF 
Ë²¨U¸{TEË/5ÁUþjú«yêê§RGVÚËgâ5où¾¤Ò|-|b>qð@½Í  Or¤lØûe|'6"Ç yaûüNûô¼·^ÏâT(£ñYï"ßtPVí§B&»Fþ=M~@ëéÒÆ®Là$ Ò¿õýL(7ù^¶Nbúu ?¨Þ+Ë&°íÁµ÷pb¸UßArF¶¢}_Ê÷yò¨·µ¨^æQ¼²P|KDÆ= ÞUäÅyarý',2ü¹ÓFØÀÀÓªÆ=}LÑ¤¹ÇâÆëÕúçFð;ãõºì÷Áü6ÄÖ¼{ÕÑª!¶Æ'«f¸Ï5sHµ²Ö%RÈíØà~¯ÃÜ.ÉWK­|H·i3»=MaÛLô¼¯hnaWÚ-¤À±)uoéquGâÍ.±x8Ü­Ø®-,£@)U%×±¶zåUÝöìC$>¸{1ì|«¶õ¹ÈØ¨UwÄUZ«zJ´¤~D¯åøO1UÕºccw%vî"6Ðr5ÚmFÙ÷·¶èù< ÛìkÍÜí]±tc£íy=}ðÒ Ø?bæ(ùÙu!rÓñÖE}ÐºCZ,#ÇBÆî·=MÐ7º;= æh¶¾JWBmÁxPuzâ÷¢åÖÿúu¯ìûôÒT(¶DìS:¾tá@	:¢5fßà×K÷±üê6¹\¡µ öÐ 5FæPVÍö(éÏ«WA¬1ÑXßE¯Ç·þ>í,å îêoô°WûNwQôºjý{s2.ÈØäLµâ²0´¿½(ÜçMÄM¡TÉØî½¦~Ú=} ye¦Z;>Á0h®û@ÙðÂÓûAÙkP°ZÁëIuvÅæÙ1¯ÅÑ&üeo¨b®¹.áiGrkUScP éÍõp¹{°ÎÚ<2È;êï$'f¸wÖ{QQ5£a¹"¬fÁùÝDFI=}?c®´ÜÁ·ÐyLû£#ÿ;Êª@"¨FÇ{¾ ×68-[veG
oäàp®Ða­Zb¾bX½A
µà^æ[vËÌ?¾¦£ÚôÕMÏ1mÍ-1kZë.ÏÑïó|»	1ÖkCÍ~[ùï¨!¬=}ÙS¦Qæ+Ä¡h¥êÛâ}õ$Ç]JHp»ä5/+ºE2:=}³Ç)a;µñÂ"ú>¥3ÛIeØ)¼¡ó=}J_7÷ ¬¹Å£Äú$JjÛ©lÃZÝ¸p{¨Múç þëÕVÅhí6#Þ°1&.8a&÷¢	ã£×Â¤+nÍÄx1#Æ ô¸êÕM n»4ÆUlÌ5o{¯9ØÆb#rÀ	Øþ435Â§@Âõ»ùyarZ¬O*ð¤ÝtÕÕnwÎ6·0aµäßwêvîÔw=}³o¿ºA­H
Í= ]±àµL¢V¡¢}¬à:9dw5/å«,Ò^ßÒ©bA£VO¥ä$ÄXy!ÁõhtÉ)ù¹-PVéUÉñÕIA°s°Ñ4Ü·áL
jÆËXfvÎ¯lßÇU=MR¸ö5k¯*H= J¥©Ã×NTÒßGWWDÃKÏIú^KU7Ü¿¢î/EÁO(¸Ç>ßØë±pç\kXwY7#)y¥}îQè­çsw+©ã®=M¶½zòíÈ ?îÂÞ¿Hr|f÷3,g¨F[o>Lâmö*5¯êX$	±¯ìÑó³¬c&-<·UvÄMÕ®¸«
±.Îu³=}Êå^»Ù;^v³=}êÝZKÔkgáÞIvRU=}¢ez}L¥§ö%pnüñ!c°íÉ>úÑë_4;÷w)D¸]RwÔTû"vG:ºñ~)\4+B¶ãáºö¬´#jqKr¶Ãu&"$wþkÈÞ°{D*'½3ü$±ÓN6ù,Á%Þ²ÊM´_5Ý&*.Ô39¸Ò~CÈºâ±-}û÷ÈÒuÛQ³¾å
¬ød9°u=}5z¼?_¨ÄÛoPìÖ/s¡íÖ°æã>nî´ë2l
¤##Ms¦ïNÜÐA= ò7«2hFÒg:­ËAÑrã?«aK)Wjf¦uv>Ràë·ëS$V-·¥rÉ¦íi§,;µMìßö= *â·/ñÍ>¾.¶¡knô?ºÀSÿbübúÍº4%°[°ïÝü'þíîý"d>èVoaûÚOÊbØOhñB^¿kùDç¬S&ö]Þù*A¾½¹ r¸f¥Êß¸\¬D%¼mûÚýníT5·VÑÆß»º²$;Äêº­ÑsöÁÉËDË=MYiKþþ}Q:©#lá%u¥ó?Øfê}P Ï¡Ï9FùÇ  òÓÜôÝÍxåB=MVÌ¼ü´9MSâóÃ/¾¥Ú´ÿ­ÚÚõDhY8Óàkj"åÄtè= .;Ï$~sxvó¡	oböKÆ,R÷´ý
h¸¥ ¥oå+ëÇâáæÌ§n4§OîWÑ~òÌª®:ÚëÉãÿÄ¥Q&¸?äK½þùkRÎO2ìÜ;ã-Â?Ä)ÓnBsAÚ±¿uâeÔ]Ó4î@ì±/üî"*±_Ha(ûdÀÛsd%Y/ë.¸TY1t]øiêb9Ø±<6(C9Et¡¾h£|ñê#oR?Ç~²º¶ìöDs;«ÎK¢/áé¢¡®Àõ9Ê2//ÍìFî$#iGò/]ì|wìl>{AüëËÌÒÈàÇSyu´ÅEKÚpQk¤ôÖè´ê¯rD±àùswÚþSÞ.[XJ <Xý ç8ñõÇØIñ|ÕK'3fËöZÊ35ã©-¤öëXyÔúîähà{¹àc[ÿû~)p7;Õý!ïp·UÜ4£7á¹à=}¡49ð:ðqÕHÃ_³ßôð[¢[y0°=}×Ð4Ã^)OXúò
pÙï÷ù[Öæ6.<óÓÈK'Ùw:ªÂ.À³ELnÚ.ø¡Ææñ¢Eu¼8éÓö]Øì=M	ÁËt7= 4Ù
n¼«(çÃ4Ñ1²Ùª~[Kq- hD}ðu]µMIÈ]¶Ú#÷zíÈÚBÆ¨qÌûÿ69IOA!ÄÁ¥«O²ìÑãNQ"næXÎéÚ K5{ÂîT >&óÊæ¨ð6¿dÚ/µãg×M¿
[òÇ ê0EúÀ¶¨«ë$ÎünZÎiáÓÁÈGLWù¦hUÀgbÚ¤b\î}*äá 8"ø4<á¡ù ÿ  þí3á¥ñ«çUÇ^c(L¿Ûå¹[¥iÕÅú	Fàæ.ýÛvA}0 ,'âEù±)_ÕÅ\è2Ø3>Ð3$ó4N¡BnþÑí\iTv]íHKóB}eÿ
Ëºø)cNo;2Ìû¡¼ÿÀºü\8:Ü\~ö/^öFëÇåFã´-óù­Æ¢³J<ÕØ@ã¤¹ç&Þá<UcÈ°aØåÊÇ°ÍÞá¶à¹«¶¨"ÀH?ª@<_kzÞ7è<F«ç¿ïÿDF1ÆsBxuuòÆkè±¦Òø=}fíî¦#ÞÜÚ³uÔn4Ü!}v|ÿ¶PBSäÃæºdª°­@-jXz®]«!èÔÝ= $
££iÂsPdûúâ Zß.xë:#%¢ø#úÖORË±>F1vþÈJ5ö«_Üù;Ü=}=MCÓùÞ­XUÎëÏUvaÒ+=M-ú6êZ¿£×Zü4VKê±:ÔðÚ	@*cã¹ïF Rm Ïç^(ÕTêËÊ~ZåK= <= ªì=}ÃlòáHÖ@ª¶ f#pmÜ°YõcKã¼XYa°Rø*ëµ±±ÅfÇÈØ"ûXÇ8o+úù#ÂÃRàT²·}4p7§¿Þ³NfPÀÝTæ÷?Tg,9ë¢g¼hg,!CÝÊf¥u	Û2¹{´¶ÏbÕ9EÌÕ¨õ®öMwbr]Qê|xVk£wÂ@ |¡×rcbð)z·R¼ÎuÞéb¬õâw«¬ó8jÖ^xÕÕÆ0y ¼Â²¤¼±Íl}Ê¡Ã1sxMÒë§£c0¥]üñ´T=MÖ÷Ö÷bèÊü¼=M44Ìjµ±5
¬í×ÊgÈæEbÍ»·.÷ jÞdF]%ãt&nÆ80¸ 9'eèýcsG®p9|=MsK}Ð§òR¶ ß|æ= åãww ¦UÛ%´aãÐ­æ  = ÑßJÇåFÐÎ|ÉÈi5üÇ=}ég#Qñv´«çÉÆaÑüráa wðc:¾fÐvÊbÈtpRÒ¤°éôåÿMx³î9ïøÞ÷SvkIséÎ¿(ä/$¾À6±´T».DxáIdSI ¥¤ûéðù¶n=}dÍd:8Æ¬KZ!¾ù­o¥öIôÁÀâ8d?ÝF)üÔ)¸cÛÙ­Øk±A¶ÓíÒU¹çØz£³yÇ°i5£Ïïø¥²ä³IDéz<¨ÒèÃé'î½cý©ý0­éy0»¸(òRÒ¯ðaô³wä?¨&É«n«² íaë;é;û+|9SÔÙÃ¸eÄ£ª½ßMnº#_)Æ-¨ìAiCAéÉDCµ¯¥úWè#¸&
(8ì%²ö-Ø@*ÉCÀú-¸/þÈ¯+Æ<Å$¶Cþ/nÃ{W_»9ìï¯y?nûjrûQË9ìw üË¤=}Ð[/ínðtO:tÏò¼wRR#SC¯Ç»Aµ%=MYãßÚG±è1e9RMÛTæÿèrÔdY:î^ýr¾÷S_;6wQ>¯¶{¡ÚÀ;Ø
m¥ãÈagH)üÒÇÍ®kµ.(ùt·=}½ÍkOT
u
buùSòéü·=M°EÜyÒ&¼YÏ_9h= P>Q%ï*_f¬Í'ñKO$^B,?¬=MmÅmÑkvÿSòéü3ÍË£ùSÚKu= Üþ=Mh¯ç0öih=}=}êôÅËEòéü3=MÈ£ùSf¢o]Sõ@8² ì{?S>8Q}ÿç¸¾ ß/LÄCÛ[)Ê3£xpQÎz1j
 ÇN5F³5"Ek¯|ßÓW×j!Ñt«¹ñÞÙ­Ñº<è=}?å­¨Û*Äy=MlâÄ£»¨±óäY#µäÓIÙ4!¼/:î±U=Mo0ÚdDçC_Tö¿Ðe1k®K+Ò3åÜuí¼¸û£À´¶õ%"O*^µ^$·pÑ
raÈ¦Ä=MrkÎ®»z=}ñX¢ø7($Íyk>8()Nþ@YAùâçhmliÑ¢±¾Q*cç×¹éCüÃ2¹ÅC²dõÒ¥v2¿¦4ÑQ¤gi¡^EüÌÀ½Xá
#'mmKO;OÂ°]SÄ°Âêk¾R=}}ØÌöYÅ÷ÛYëé96óK&UûÂZH*:"»jmmÉ'lâÔÁ9»Êæº!Ð#S~Î¢8!= ÙÛãsqÈ¯kg?a?<dB3òîÆEñR4%Ê¦ñJ¿á8Zy»fùÌgýò¹|-2¹~ÁG4«§U6ªTÈf7(Ö âÆ¼¾1ÐÿW¹o¥ÙÆg{;FBK	sÒ1·¾MÎuµ]üzí?
=}Lu^á%¥x[´¬7õå³~¢íqÅ	´LF¾
 ÌÒ§Y¥õóiª
à±É\²è.i¢¨mÄØf ´SÚ7vaÐ>mr½!HütÐL]{c±[Âô¬ãb9Ç±'>ÀRf-,Â<EaÎ8J?aÖÁ*ÔøºAS= ³rÍaîø¢µ¬)ð7ÚþGøn 2Öóãxíï7ªD´Gá®½¯xOó'¬~[D¤T2yÈ'!~h?óµ$´uEÔôÊöE¬$ºBf= µf³u³ý}÷ÉÈN£©w¬ìFTêÿ3¸k{ãrrV¶æf{èsÃ*ñá¡µz.;Z¾°±×%	Æ>â3^®ÒòÌ(ML­àÍú¡äi:êN¸óÝy-äI{õVµè.w±UVülmà·²9éLèÎ{½°îD«XB;g¡ï4ôÉî2Û@Ö= ýiÄðþ'±2Â§=M¤]V7Ë÷¹Ø-
HjØ%ßìëCõ"Á_ /=M§Kþ;Â4%pÝÅ"ðAÙí¼+:ry9&êûDnßwþá%&¥ ¶é	Ð®úz2,!;à ]Æ7{H7¶n}0ÿ÷ÝxrÕ:×so«0bß~qî*LìFÕ5 MîTÝÝÆµå	ØAusö"<µ«únýü©QÕÑ¼xt ÿú»2É-¡ýí7<òú»²ÈÎ©JøFö.¸Ó«:ÊÎ©åQqC{-âõüÉÎ±Ë%Ó¯r4l{ú»²ó"zþ¹1}r+4;8ÚëÌ(+ti!4Ñ!éÍ@Q ù¶áÃÄ×f!êèBv¤ tßÏõyèèBv¤ $XèQmèÂdk¤¡ô­àpÅ~¤9ßh8 5o½GÙ4Ê´Ë-¾;?péuÕ°%SþMf6M@6:ÒÁBÃÌuÙU´0",Ib ±¿ê¡qb[î¯(FBDvhScÆÞ>ømÖ³S:Hâ}ä5úÚöµ·
BÊ±1~ö òqV&RÓ&4W>
:©iN~ù»ÔÇ¢²ªýÇl®uÁÊöh)o}xËä3Â·( b3õª*µë=M<(2/6iÌ\¾
ér= 03ueñ_ÿ¨i}ú¶äÕ© ·/I»¿ñ²A%Å<å@Bû$$<·¶Ü£ÑL4õíöT\àfÁ®#­ôL£Â¹þªðlgÇþî´ÛùÜV][Á<òÌÜÈtRP.Êö
Ï<ºõmÍKÆÏ=MZgéBÜ,=}ºmÐÓ¬ÏZÑ¾Ø= S¶¥óÇ·Ý.ÛVPÓOa8¬QqgÐ]úgoØyÈÄúÜd/A¶.ñ !"¿ùLC·@&·Ak^Y#áâî^ÔÒõ¾[UÍt{Æ 2-|âsÅ iÂdº<z7hÝ£CÅ¤³Ý
XØ¢/û¥ÃvçeRæ(ÛëHâ^7¥e­YùÉÆîß#é³øtoÍ0ÕÙ°$ÞßílRæCZ*±DæBØce·ÛH¡G Ü÷°wG²ÑeeÚöÂ^øRîÍs¿×ñû¥0ûÁÐOÝch%&M7z{jÿ9cb¨"·°¡CÌLÙ9.Ó³"øVêëH= Hæ§ß!ÎOJËH5?=}³yïõ	ÈÍ¬écpÂð]Áÿ=}%÷Z!-wÝ^â÷=MäÞ3PÓÞP#õ6Çe[mL\ïÛ³Û¡¾áÚ/Þ;c%ÜM%z<Q¥ê¿^C>·_][hôýº\A÷EWÎ\°¯Û=}h8²¥Ot\Pí×cþ1	³]=MPò+¶xÈãw¼µÕwÙäò«r¨!ÍòÄEgW@è·Y÷6Xq¢¹	J¦ä_Þfjþg_^I·Iõ
Ë()zc±ä·%Ä4=MIµºu&
ªðKÕv»
%
z[U
ãÎ­Vª:2ÒÿDdf7GnâBÈ#©³XÌEô´Æ¼¢H©YµaÔ²å Û½·_CY·¼ÝN+>g:×ßR¼]êo²!u6_?V01[\"klPRT)_ Iíú_gt­n êId}oÇÚ2E®M4À½^A,?WìëOÂJ= -ÕY÷B½ÿJ[×£¶%±7cÉf]%üó_öI
½ê^þftòû}§tj½ävÄjáè¸0Ï58.rlgÎò	¤O½Ö½¤~]ÞEó¼ë¯áHd	~@
nëÏ<Z7×Ü¾RYôZ1(%ø>Æ/¾¶g¢¯·ð¢Unô"MiuÑð«Êoñ²n¸Èú­®ôê.ùäÜ+Õc¢ã³HCý	ûºhÉö*n_/Þ0a />_:^ë5=}ñ<ký_\>?K@W¿Pw¼^åEÞÇÝGM×a}þZù'_A27/ª:ý×Í:ß/W<mO%ú!O¤:2Nwß=}e
f±7ùbzxíhW£~p$BôË.S	ÇS	¸¯Ñ6¿üpNR´\ªt¥§¢ª·ú^³þáV6±í6~ôö/ù40N=MA£,ÓÐÑ
¦@ØºÉ²Å$Öúl®V
F½ò=MþÎÞË5¡¨ã_óÊù5¸¥ÐÌ´£DbØ68¶ãÝuáÅÍÌb¯kÀbüË¥íÀwîKÔÌ8f_¨ý4ù²KîHI²&¯Z¢9@>kowfOfÐªÑ$«±ºÂf¢²ª¾Ñ+7wBÕÎe´­Èèç¯èë1H÷*<=}|*'B
fQf4<EÎ àÊcâó¸ûQëc?UqJÙ1Üúç¹÷èÍ¢Öc
CüëÅdq¸=MVIÌj
M ÜùÏ\¹S&ÿ=MÙC/®ÛCOÈüV&?1#Ú©cÆ&5>åmê0£³Ç^íÿþdá3Ï\­ >S»¹ÁØ4W_ª°õ7S~ZÌæv TøÈ\D&s_Ôò89²yf¥zô]O75ýÌåT%¿Kv¶6»Ky!°OJÛvXD¡ú7ÖP¿I¢'P£hT#¦5;îôûR99tÍÖ	ÐÌ8ÓÇ9èÃ5WÅ¶¾+ó#ó-ðT"B ¾Îï"n¿©ý·¢,Âñp²ê÷Ø{üÐ¹Ñ	NÆSàF¡)hõÂ\ì]¿=M¡b&T÷*®Ù=MQ¬Bj5(¾­c

¾~ÁMâCôxñ¯mäÜ²E[ÐrñÃÈ×ÑùoPrJ$¡(D¹Â$ënmÅk-þ¸q¹#KOÀ Älòø³µMGç,ÍváZ¹FE%¼v XÖ5è³àû.ÒEÏLÛöÜ*ºÕDw XüÎK-àï{ze>S«ÉàË~öÌv³?[/yñxÁ¡SªFÒs'lúìõæó©ì?¯ÉÒ-Pë,&/@=M3¬
­B¦yÙHÍÂÒý07æÀ
TTgL<1ðN ÅÃ²ùW¢)¼Ûìé¼;8u¤æ«ô· ÚÄ/¡=}ÕXÈâÝÁ²Ù>·þ»ÕòÆuéc´+¥´¶Û»ÃqÈ1^?°T½ÕÇBZÕÐ¯7Á]î&{5OÍÑ]Ùsölöè+Z®±Ïe³VÖ¬³õ¥~)¦Ã¿°ÊÚÐùß·VÌÌûH	÷UE­Ìïø§6-«mWþ7Ï9Í£VÂóì®3Ü9|Cð°£9ÛZÖAQX!GhJFh)zw4=}â¿fÍhøRO¢;Â^Æ 	Hk÷ô¡QgÚ=}å\ÝCåÌ3j?vÜ|6 ÑLðÓÆ)¦yâ ú¿%CÆÍxÆ%KîøÖó¨ì éòjfÜ@¢7o.¥zñ_$ÂI5H7ñ9£º«ê±I!Ü_|É-MV°ÂÒîê z5<ÿt9Íº_êak¨ È\éý1{Ã3ÚªS3Àö°ÊxÉ£g®|üè ÝXÕ¨£ðÈt6»»£»y®]k·fá±¿FðRé(éìjR¾ªpåFò¢Ô)q=M¦ÄgÎï!ÑÄz4r)shfFè÷¦«4,¾xÅ>:¸/Ä¶ÆSx= .5Ä\%uúOhD¾ß¬M )äµÞÑ*FÖ Ø´6g#
Jöv1y7±ÖQé,=}¦é·)å=M$}ò}åí+²Ç*Ñ¦áÞAýåZU!-b/ggPÈºÔ²ÂZEÕÑêá/,íåJÑÚ:3¿jÙÐ³Ôéuö¨MÈ,$é9w8Õòù®p&±òÆÙ!ûJB ¢E Gé=MäüUëIÄÁû<@s]~ãðÌ,Æ¿¬{Ñ¾ÇH{ùÈ»±b¶s¸µ7k[ÑÎ¸p\àÕ!/R-²O=MöÖ4Í-õ ¹Â®ijùdçu×jçZé½¢ãÈª3¥áÛ:4ÑçÙ+æ¤'ºÈ+= i¸§ÂjÉv}Ö×zã.úyº­61GÔÀþýöý*]	¡¨¯+òÉ.XðBÄº³¦<ÄÚlÿÍñÖÔ+KîáØÍAÁd0§Ùv
lûi9æ¢UÐz!ÀrßËQçÇç¿[añØ¦é]|dÔ¢Ñ×(Hú$¦võSööÖû´Yþ%úë¸ÇöY0JñºÐÿuU>@ì­têÖÈô«;Èu/Ö,S*Ôõ¶ï­ääÀáK4®5UtÔ(Úüèè®?ÇÎï_Õ1p[X9
ëf8'ËÆy,ÅNÃêQ8|ñy·2êY,¡1ÚSZE9åø@ñÉÄWþ$T®awýT6TÂß¦P<'ePæúxöLªû|ÌU´­¥×Ücwéì.ù*(6Ã½ýå¥u¶üuFÆyÄÍNIe)ê8ÔÝ1Uöçq¾
¥âcë&và}ºHæÚ|kÏZ9}õú¨ r¤'63îVîZ&^åNE	<9<æäºÎõPéä(ÐIí=}ÜS55{òkðLÌKtú¹º$÷¡§ÐûÛ½÷b&Öã¡c|MÓ: p%p æpµgS3Ä{-= 7lBÉ¿Ó©%dm«"~6Ö½kK:v¹ý
SÐ5eO*âp9x@Ä3èL¢½,ÿr%¹j¡Í4u´4×Úõe¢öÅÍE¥3ÜãZ®CM#ÕëÃô.÷1e¤Ô}¸ó&z«= onz\Ë´ÀÆsÁòÈl¤rrZÄ'bf@0B«rú¸#]Ü*­ò3	/H¤øäS§éD 4¹+uB©"G|Ë×}=M6ëZWfâÏ GÓU{ÕÁ|Å-ÜÉ°ÕÔ,F'ftöâoÆÉPëàkÿ7[-Îoµx2ÿÆVòÒBí®ôBM ê¦ÐÁ	ÊÊ½·&ÜîtjþV17§?m9èøµ3výN0mí¨NÐª«,X@Â¬8ñÑkæ2 =Mà¶¸Üà¿}ò°HÂ ´ezzÌ£ßâú¾dª´ª¥{¿gÄaVh'aòìw²7=}H¤~çî.¼ÏÑ=}Ð±ÚUe@ÛXñ7ÂDyÒ±TeðÇr¹Ò¸«3d1
wµuäN¦³ÏÅ7¦DÄ$_)¦Äî¬Ì£eÓeqÛË{34>?ÌùdøF»ºDú8b5ÍCæÍ»3ÍÌ8m;¶[ÃOìôrcÈäÍ£¶7 Ç6rí:H3-l½¹^a;yr³WÃÅ Í4Ã¢!yUÄmÚ] §52çÙDÊôþéö¿'c®Í<yÆ´ëòÆÜ¥=MHxw¾ãî&ÚeÇÝÔ¬.ìî	áhhexú:Ëc°ÓýæúË:4\/W=MÇÀfÂÍTÖ*zjÖ^ÁÎ*R=MÁ_uúzîNýÎ7T¬T#Ê¿î³ZõBl§óUÐÔOº|µ@î®3ÐÔ­åï=MÏ¿qî&¿îÖø_ä=MTèÖ«¯zµ+/âNE'îË©ë31ßs@ãSøÑÎÐyÏC*æS¸3þà¿Tïê1y¦Ñr^3#	Ò_¦ÎÑC5M-+@ÎBVRs{óô»ý¥6U,!Ù,csýÁÀòIáùN¦.1ùjÙ4jm®Ç|ØÚèk#y±t½CÙ¿óF&ÂörrÝ pËâ~g±SRIýàâ-õ±õ«\	ÂÖÐ R¶s·õb VBUä£ÉÏÓM±ñ< öN$÷ùN·3ýl/øN5ïún Ø§Ê´Q7!M!Ý<<ûAöíÝØû³J¢³J=}lçç¬ñjª=}Ð]@>Z!½edÅ{<2ß¸©XÕjËa7Êí;)gkÇ¬Ô£42_ß½¡îO/øNå!wõ{ÞÑ)ßY-'®þ¼z¾p<&RJ{ÀçGoEkP¾C<h÷Wk#R8gÝ¨A~ÜØÄ¡Ð]8ÿ 3ÀA^qbªÚæ ×¡Wù"Õ=}Ìí«Èà%{=}Gúl°ÄC$GÝh5zøüvÔ°Tj_&"
R¦ÿÃø¹æTËz~¾R½H"êê¥TÄ¤¬yäúMg³Íß\Ð6aÝ8»Á(­Vô&LçËÉ MÆ>Qs)/:ÉÁeBéFÌQ!¯O;¬PAÈúôö¯)ÎÓójk0¼Ad¶CUÓ|Oäî ¥ÜLØÛ'jAy\¾ÒÁS®e´= v½øÑÓX!±¶ªðÀ«-ë>úÙ FiL¥>;êc?ÇcðÞ)IU±YÁ
¤­=Möv5Ï¤ñzpTöÛú6ÿZ÷ìaâÅ¥Y¹±°I5gÔÑt2fìãÊ8£{f¦ ³c=MÃGâ«||ÎWMÐ©#[@BæW!-Ù¦e±!kïÛP<È¨¡ÿïÃq»®ÉTiqEÕ±#t6°ßä£¬íÿ©"þ7,÷ÈáØhvïô#:¯÷úD-¨Ês±ú¼+
OìÝQ8wùÏÊZAu¢Î°Þ{}Ç.Å¿É>z»2p\28à¼mÈ8ÝpGõÌÓÃ×2]µ¼P\¤SmÐñ6Xn¼M<7É-ï&W°±ÈKÛ/ÉÊY¾QhVíMÝËóãÍ}?.â¶©i¶å+³Ê¿±
ê®[!2/{GaÆ4_ëëi*nß\t³ãà= -³ãCHH­#WªÚ;Yø¼BÑ%©G¿÷D"Ç!!\onµ!©È «\w®»BjFFÄFÔ,)E¨¼= å0aÉ³= ª<Î5,KÓîGéZ>ÜyþfUgFÈocñoNbvBIÙ''ýÀáµ÷^MGN]T_ÜS§¾Gè~}-!qÀ»¸DÑç[&èüæ[Ýï[cï[¼y:¾ë=M
VØ\¬;ï¦3VsKÊ+èåý~:_6ðMïÙ±:]HîÐLÝË(TBÁ1¶ú8Çi,lôL*¥ePn]~j4·éÎLKÛÿ¹½2î)@\6uaW#¼Ö%!zJ£«Óé¤d= ùmpáÞà².éùÊ£Ó·×AÇõ5ûW×Ö^E­nÑù¦dØüP8píuD(ò9FW%P
UÛt7=MÂ¦*þ)¡«$Ê9û^É¹ÀöÚ²>¥Ç÷ùóYX$jì¦áBò}:Cî0_2Ê +=M¢)sÑ)ïc/¯_|åÜ"Ý
øW$0 * ¸] ÎUÖ óïÆÌno­Î÷µºnúRE2 çâ*ð¦ï#=M¥{ÏPwÏÈÏr÷¬©p®á¹oùçJÝM­ñþò~QÍ¬YQÝé@M»fv8:¥qÅí©ýwI¾vç°eº3x¬¹u13mö®ÔªOÊ¡ñXçg:þtH£cdV;µ
§K/@å,ëQ= =}+÷0çh ¹é­Y0±âtôBU^iG­}v"D^à3)mæ±ã@¸Ö8¶KRª/\ê¦Û¾dêKéZÑ2úÍ³= K6úØ¶Mn#ó¶nëª¯µñçf!Àj,1ßdFHâÀÁ{OéÌ»½V= $ÜEa}îbâ·ÿ]JyÀUW8 t#ÿð³à?m»OÉ¤9cp³sEj¤= É#ö'*¨ÿ~\F»= ÎúÏë¸¿H»D{J­c[àùÂRõÑâSÓûÑ¶}ÿÁv($'áúW#ÊIÈ¼þë
1¹=M¢:¯ªãKâ¿|8¼P»ÈXíÓmtLòí\3ìÉùXÅ½&j\Õ6jt(:uùÁ )Ëæ³>Dg%%ÁlnÃ	#Ð]Ä)o»éÉYÅª­ÆBXL\Éè[vßYóý«	¡H$¡r@ð__wãC¤nNBÒ¦æîh¦fæ¿ *Écã+z@h£Ð§)çadtcN<1ÃÀp4fÎ)òg.¸
ÉÈÈÈÊ


= álhÑ©ËP©ÉapKQ)ãvÿglSiã0Â®N_) áã§lÁàÔJ¨ò»ç\1föVG|6³ðhÕæbµ4Aí)Æ	¬oIAÁÏ??ßT_\ÿ:_	_q= Øh IæqÐ/coU+AY[?ß_]X×ºéJotâoF|¹ V!peÎ§éòoëôpöÅ=  ÓÞªv¸îÝ°ü?ôiNû¥)´Ù_ÎþËÔ4À=MàOuÜcaÅ¤FµÒdJÁÐØRRlÑU4gËî'¢I·ÂOb©# ÷=M«pÃråÀ«Fè\Lã$ôõB-ÉhË7.mLêÊÌë+/[íj,v×¾àÆ|õ¤×(dI;êbw°ZfJ¢¨CÏ76bu^Âj³s¹*î¾!´e°OHülaG ÂÉ1=}p{´´Ö"Ãï|)¢ª­¯o@ÐYtWÜTd}Fþu\úÅ}Ç+ê#ìçªb¹§°¯Yç}Ô0eªñ>jJíj±Fì£4ü¨1nÐ¼È¬'d?¢à|~~w(ÚHæý{¿û(×¥	î¬°.Â"öLvÄÉÝr(ïðOU;mÞ¾]DIØÛÛ>|ô5týLê%ÀáÆªrÇ}.ý§ÅÈ~î¯îÓuÅÆj£Åyå)aêtFpsÍ<ÐHð«äðEÚøMív÷UE¡P= x4bfÀÔUÍ;ÖW_ÍË(Í;VLÆ;Í;Oü6ë¥ÙÕúF"TZ3×î­üÞÁºÅ,6^êW¥¹ZÅýÅß¸,üV´)Î[©ù_½³NÿIHHV³¾¦{ïEUªtk×u±Í3¸ªô³¿:«¬Ê·y
ïÿz7=M§(=M_&+!%³ÅRyò|¯®TºéJÅV¦9±½V¯6ðµ÷n¨§ÃÂ<Dl¿Þ¹Ìw½÷5gÏ©@CxðÇ¡ï%Dù´ÔÞ-õæ»¨:/ÂPEûLÒXEéßDÔcÍéxÝwx*RCþù5ôq¾òúÅº«]ñÎ,³Þ|RqG§^B{Ü¢¥¢Jìñ«BÔ©òðOÇ¨«-ÌiÓ+óë	å²5 ´6Vð
EEî~ÜJa=}zÂÝkû%NÕZnÌ!Cö\ü5zÇXÎËç£¶ÛÿKèºC.Ý5å]8 ïþÈoÃ²ZQØßZ4m P!lÁAØï}.;q<ºjë01d
î%×|¦GÐ1Zÿì¡/	T5ü&IijÖâ;Byç,D'.9Ç-QIÙ°¹ !]å¬Iø}¿öÇH¶z$!Õuë¶!ÂE
KIùáÞ1Ö1ÚéÏÖ T9%)
<{.ÙÓmv.<£ñ;¾.=M8¯ÔHaÍ$Xô#lØô"ÃÜ×â¡Õ[.B_\|6½Ð]S¥Zl,»-üÜÓõûÑ'ÕêÃT;mþ=}$Î@2ÎqÙ{_c×0}Ù÷óÙ×yÄØoCW¹AaoHÆVð½ÇQÜJÃÔÃÄUäÏwÿÒ®þ4-V÷ Ê&«´µ¾ÁÌ_êLÉKm½K#»£×FÛ	Ü7Nc[Ü$ï¯Ô]$jû/LXå£3R£qßF·] Á)oî{_$E8J¦_×NÏfJ\=}^l6D³ê3ßÈÁ³ûÔ{ã.»½¼7IA2®ÿÞZ|ÛÈ ¥æxÂq7{C-äô²sí¬i\ï#,8òÊ¦!ÓnÎ ë-ãy]$ê©ë=MI;0æ¼{ÿÅ,¤ÞE9±É/ÄÕg6TÒÄµÃÿ±$ù7m½HÎG"UØîÕ3íúNÄÌU Êþt<VÂGlÏT+é5W×ï]0kSÃ[sßÒGg= ½3 nfñ9ø(ÀÞkÁ%"°Ë£ùÃz&ãcAxUí âoï9êúRJ¥sv£lSíWíj'Sþ?rXñ©­9QÄfPeE±æ3·ü&I¬>ü¡ïöù$8ÅÒ^Øv¥c¹pö-IÛ¼ûþ+þü¼æÜ)#ÅÅª]b~{wÀ¾èÃ'ÞvK¬Eã«8{¾âQ=}²"ôqö¾æ!;Ò´w¶ð»¶!úõ¿¿å¶#Êø´¶S#@= 8fb=  :Í;-µÑ=MÍ;VÓÍýÍ;Ùp¸\tl;[³ÐC!°g¦[®¼íQÌË,1&QAÝgs:y¬IÃêßw³tç¬yHÏ&ÎÆ¬Â¦ï ÓÄ,Æ.kDÑ,âüÀ«VD"«¬ã=MPKÉ¥0üâÙ2=}ú5§1g8Pmcn9P<7v±Ç»&yÌ9NÅ'VÖ¼:Ë§ãûº;3ÈÖ®n,ÏF Hvg:Ò·G¨P§Æ®Èt®öñ_#iªÇzF3JãO$^/å£/½Ð$õâÈN¯×£*í@Î<îÑÇÔß×¯0ãïý<O¡¯·¯WDÿ­þìP¢P"ß	wæ/¾4©Qi¯IõC#2LJ#áx¿¶UUÅ0±¿Ü\:&ïÆ;\ÀE¯â2ÿ®«\Y[«äa,ù~  Ûah³bÙðbhhÍ[ÏoBéµêÀ,veS\Íj¢HdçK¬ínE§/°lìÒnÃìõ"XGÓxMäAä­m'Ð|¹Ìd»Ú¥ÀÃè 8ò:¨ºíVÝqe±<|w¥_«±xå¦3Ã;¥S*fû*xÌ_ïAMãxÖ%2¿¶gÃyAt'Õ|éëB0ê³Ö=Mæ%³Ò~«/d¶®×Ùb>ÀúÿhsÉÜñv¾©´©ÐÙrG>1ù#òñ¯Æê»j|¿ø">G\óöª½_´~¨ÿÍzo
3¨]ív×2Hwõ®ï®I4Ì®']§êpî-À#Il,)1Å²ó*ùÆQÛvÇqÉô-lÁï&ÆCßûÔW|ò5-)A<|Z¤EÂ<÷nKÒ9Y÷÷9Ùøn,C;úG­ú¯:äÜü.'?­ «åà_iøÓ£ È:lw#ú'ps» (ne@1ûbþvÒ§_ÌH«Óê(K¿$X½¥L^¹$¹êø[ê±ûôPä#ªÓ dÇ	¢çkQhÇÂ¼hWÁfOwÑ<¸,7b¶ã%Ü9FHo]SUóÂûäÿÇ¨éNÄôÏÌî÷±5®&éÂ~*ÈuÇ¤Ã#Ç)ÉÖµ®Çæú²äó«¹Üô'¶Å8h+²&KýÅÌX¼¦Ýº·õ¸±.ðçEjÀùâiß·°ÝâïÖõTq·ÒÃ¨!Y¸é	êøµ¸°%{µÛ¶3=MúíÃ
_/?
9ô¶£WnÁR-z¾Ø4r³±ëÐ´eÛÊQY´+Yä:C>Ò419þA%UTN»ïÌ½?~5 !ºeòÑjÚL³XóâQª²ûZïò&õø
*¶q=}Q/k´¸¾¶Á³3°-õ~Êò÷ÉÕ³­wm}¥zdÝ¸O}mo=}ª4W3¹=M¥Ð§+·}¥Ü[HH¢'ú{z|UÌ4ûþü¥Ún¿4óÊUû¡Ñ= ÀàÈÍ;ÖýÌ;MOÌ;Í;Í;8Cõnîe®}«ÆIxÚº§CN÷53þUÃU9GK;X/ÇÀ£»cco6xÈÒ' 0¦v7?É¤øÁLÑ[z¿4ä<)$òa¶=MVîé	-
Á&ÂËòù[-\Ýs7Ò¹8<,¢/å;S4ÃV#"¶f×2¥òØåõ÷=MÜZÇºÉ{½:H ¦)5N¼A©ÈGÆÉå:É6?®ëõÖê½ÓOïýÐÑg¯;H(áQã¦¿|,GÄÆ³IÝ®T3üì>GÄ*ÂÚw27¥KFÑÑVë{¼LDßkY\Î®ÕSÒû¼ï<t­I­ÙoÇÛÐ«~~/S°Sèg[«oT¾Ú´Qòç÷Í
÷RklJÅ]«3Yø»)§?ëÓÜL;OC5óY¼2/ä6ÞªX\,ú@G%yZ)R=}/üa¶7n ÿ= Ë= ?Fe(Ý çajÐðJíã,gÙ¨B¡ÞnÒ^Ñp©èD¥¢zå¸ÎlÑÀ è-S£l8w$=}pß']<ÁJ5l3»øºñiåù¬ÁÜ",©qÁÉ1hz¦ÈëÐ·î0ÞÚä9û|?7Ñüª[±NrÉ#±v¯èÓÕt7¹¦ùQ*7Ì*µì±µì2öxxC'¨¦O³æîN¯l¿áòEeÖswhhbs&kì¾ ?ðN ô×b¿óé´(2
¨6ì¥ñC¥L«¥LvùÝ±¤Ù²M(é,r5ªªUÆÕòøÌ÷
rùª¬»QÅ¤9ÓrÕ©ôXQõ,PÜß*ÍsMÄÉ)(¬¹SÛë¬MC½Î*ÛóI,Tjµjì
ñ"A.j«jæ"÷j&Éjö|?_ø"$ËjÕþ%Q·å)´Äµ1w±É¶¹Ù£õYMµK´ZÚ´f*:hõ.3´r±y±E5õÇ´
=}´X¬E)Øá&z­ÓÊØê&Â|7íË-fÖ6Ø3H2z5 C%íA³r0Èª£<O3HÒ¢EíÞ1^®C[Va¶Óx__t©ªêråz²Jü/]Þ­©:«ÉOKüÓ;»VÛÄóq9¢9¤ñ0_S?KWVZn7UC¾¶KÙ&X¿jh*|ýªÔlÛÑWC¸É!&ú»*ÁF Ñ,í÷w§À§JÄî¸îá|·¦uÒù*ÑÊ'ùe|ë&FØác»Dê«}FÐCXÐú\|'«|¯Ñ4>DÑçI~'ç|¯%þÓLß)^m§DÛîÖU|eÿßAXVõY{'=MO|³ÞÒÈ\F¨ÉA8=}*ÑFo'þ|É_:ÆêÊ¤=M½©ï½»üÔÍu4¾¸XÎq³??
ä½ðüÆ8öÃ7 :·C}	'ð^4ú2
±ÒMÈú<þ¶:g±ìæ~+ jË	ÿ§/6]-Ï#Úä.:¥òT]T)GÍzÖêÚýÛ÷É>:ª²o«é:o_,ÊéÜ¥'õ°^f²K3¬£]£ZÍÔÐ¬,È¶åMÆLÓIä;Ã&L0»gVg¡­0ç2ÙcÔ~Ãhý3Q;2x6W£Vc1&t3,q?Íhå»"ÈGüÞÇí0S#¶ùdûdT­ØÜÛt,Ê'@[ßIä#o½ %à.Õ'Be~8Eé+6¾0BíBsxøFïä>áPxäASÃrf­o£³çÐÈ¯ë ÆÓ¢±ÙfUB~åÛrpPq¦æ)Côb´$¬©ã_Ô\ºöa)ä)ì¬.&*Q0OÿkMògïôÜ,H½= «eXs¾èÁ?kÑ £FyDX¢îÞnj¼» Zï«îi|6Ñ Á¶'QùCBîè5Vç³KLgÚ×ñLðÌÚE©¿}99§éSû±ªÍ½ÛÑ¸ÝAü¤	ªråº)T÷ÿMÏªv­ËUÔ4ôJ­ÕòÖø J=}¤J'¶ÚÒë§¨÷¦­ô.~ö¦©{ó+~Dª]úM«ÁRÉ;	%2^#·¨õ
Íö9Mð<=}ÉÔ¸Ê½ùÝ¶JßSòT@øªÉS29ïQ^Ö®OãÜz3Þ÷U§Z8ýTÕÛÁ-Õ! ¤³¹;µHP< R>¨7?¤/xÔÃLxÍÔÈdf8i÷^i¢ZQ1"ôÉ®¢)CäÈ¯¯Á¨Ø¬hêr&W©pj*¹¢7ùe¢·ý">ZÉ¢Ò5¬ÜîSH!Ì@×ÉéPVI¡Í°Í¶Pé<Ì<¹2µØF³XÏï0+Ðp\ðP1@øÐÔ7iAA8Ò¢(¼ß±H|ÜµÐJ¿¸]rþ
v½Þ¼S¤HÝAZõ0ZEý'ÐÜ°¹xPT÷0-Và»ªLújûA<þÍ» &Z¶ÇJ£0¹º,T=M«×7Å®ÔÇKgWÀëWÄÝgy?2ÌÀ"Î>N/ÚmÂ#,¹÷Cã99x«FÌüMßâ]=}ò©r©ÀÌÕW±L:W¬Eù{ß#åMx'*8-êéÌUmBùVè©T£9wjÇÿóøÔË=M«À¯gýò%Ì¬R8CyåLÇãâ¸­ÅW­Ã[Æ±Iø]|Ö³è7,Ã«×À[uë8F !øÉVº.FÄOK·aï7ç*Õ,I\fÆÙÚsËåýõåÿ;.úOÄÙo×¯VO²¶:CË,ü]ïCL"sEN¤UlkÀë.S[Oí÷ùåMv%Ïò*ûLý1ÍSû¶¹#þúÀOq;5XäUi
Å{ÀFV¸¥I{vÁZþÉÏ_(ÎlZ,öN["Â¦«-Ìä_¯ÆYYý]çmÈÃ'¾±ÍZ¯å¾	2hcå´Å-}	2sÕ
¡Éá¼ëNN¢Ý²*i}{ÉH®qÊZÔ g	z°ÐÌ:["ðºãÛóS øNÎóZó'+aÞpMÍ»ÒÓÚ?É]¸äÞû»²ÃuRz®ç¸óÂúmíz©/¯8±ÆàäúÞ©Ø²à>y¥Êk'°Ç4\*ñ.Ñ1T)íb3úÀoC©ÛÎ¬<¹>4#!÷v[³U= ZèÎçp7l6ú"æÐÒëïþ1¯öôN%ñ.îd
¨¤/t:íÅðWó¬Ôû./ÙÖQVÒ:7û3,É³ÈÚ.´Rªü¦¿¯_y$ÃÕú¥óûzMFðûU¼ªxº¤~FSH[ Yt:ßa-¹¨	&ëûQÂ*¾¢«­ö²¼_ÂÑÞy9ûÁ£·0A©Êê<È	lW7Ç}­º¯§Â0í<¤WÇÍú»ÃÃiM?õê®ÎEË;©GAnUÎ]YëNÖ<£2þÛÉD@ÝÔþªII$]Z= })¨	ko1!ò#ô×Bh½ª«>~Gßï3þNÙ(©NÔêú#®3.\Ò½Üæò«/²!jZUZ|² rë4ÊßéZ[¿#¹·È[24Ú@z}®÷zÎð=M6­²~ÚëfØ´1&ô;ôHnÐ÷ôN¶3ÏÔ[ÝzÀWàeR§TÀ3ÃzÛQiÛª/Ê	5ÓªTÙ¡}RKHAZ÷TL\J^^)?òU
iØ¯ÇuÚK§2±¯¿1{]fr_§¨èÎýY¿©IÐsß\íZß×3´A=}/Y¥£\÷ºH/¶ªNV÷¾ª_±ÀÄ{%!Xñr~Ã²0ÖØ¨eS¯	 Ìâ*¿
"×àÄÝgÌ²£+eìUOh%'î8·§ÖüIäczaïð.ÈÍHì¥³>­kQ;°Ê7eW×¡½è{Úª·ì51!=Mr}88HO¶X×#W=}pþ?}zýTßí~¾ùK+ÝÈïKá·ïÛÀÎâaôºl@UHå1ÚAûí2zBä÷q¿xÁ·ªÏØ\IíóÓ[è=}wÏªZÂõì+íqEÊâXÛxz>oçU#/<^X=}Î= *vlàÕïá¨8p¡ãg]¡èå½åW¤ÞÄf]hÓÝ'þÔk_àZô!7Áh,wl!È=}°»te$r1¶Ø7jß=MæA*ñÁð8mç/	A0Ë(Ï,hë°LÈãY÷Í(9v1·ÌA@rGï$k§Èç?ÃLQ"~©â³r,óBSq¸i:@,ælÿmiO·pRámÓá ÖÀtvíâX2ØÔ{íý^Ã°ÓÓlö@¥ùc.lykëÃ¨/qçFBZ§ÁÓýs"ýKíkþÏÓ!NÀ½ÍÖ%Yh<MæØzçÛ&!ç-Ð§7¦×ìk~oí+C1*cæËða¨úàõsðØB®én×úè~Is1ÖßBdØÏV¢¥ÛÏLïW¦Oû>0Ra¿JãTÆTU¥-¿J[!7o;O[Áí´öYQ¢d ÉÏ= V×l$ê þm¤Í/°Öpì
âðÏzlO	!8]xÜ¸hN,i!GXÌi'G­"wóÐ>t¥Wtß=M"ÐÔÚxJOåÁ# )õyå7Ã¡B#ñ¹vîNÊqQí UöhÜé Ìr{F¤"r®ÝPjÏo§KÏt¥SÈHè&>8y}cËê!9ñëå'¸Xï#Ó÷óBðÕn³CEuoBØLî'e=}ddÙËÉb>© éGþèßÓsGÒþ«¢iëïAÁ£rûyo6£ºýìáz¸eR³0K j,>@Ü´V¬%òù	ÖuSB©?|S®£O¹É0«#êoÉ8>}îC2ñ¹ønIð®§ Úfì, EHlXwÇcöÿðËðiÏ'¬¼¨+$5ùèüéíùPOùå#n¹8þôåÁ+@»þåÏp3{6Â[gÆ£Åê8\;1[¦Tzû8]Ö8òã³Òg/EÀP[|xÖ*¥	¥¾GB¤ÒwFÂÂÉÔÏEê½öë9ýS(#·GÃS SØ«~Fý-ãE3ÞE»ìRñ)YHyËS±Ð#
R²Ì[²EbDT ÷AeH= j°´°à;«jÐÝÇaR/v Vþ¾¿à{*åP1$ê!å¸pÃ]jÑpïuåpówL¤Î·vÂ[S¢¨új µæíÚû* ñ!ßül©+P¬ãÔl{$[ô+pÖ³æu¯Å¸¾£°ëlO*¡ZÂoX?ûÅô|Y~Ò¼höCÁü|E¨ø'åÒl¿ç[nÌn+1Ð¦î<KÒ<'ÿwBÚ]ð©¹á·zjl1³ b,u°  Çeòu¸r "he%&7)²Àí¬át¿V]Òe&· ×ûbÇV@Ô¤átXÒ¾á7%U×tXZ ácBºYJuÊ²£L^u_t¸*sç§»×î4ígÒÌ@BØÄ#Ñ£"mBX¸n­·îÕCÙÑÄYÑôgÑæÒÔîD0éEÈ÷(Qåã#çÿ°.QÕjçWlÑÜ'Sî®k¬öÐøCH²<æC>îµ{<ÐÜ>*Ågç*Îî||gtç®|EØÛü]©î~ì.ÐHµèÇüGØÙáC8n%unIî¯7êæ>B»%AØçC<½îq|KNÑ>GPÜ>Þ$QB§/|N/Ë¶GP¢¼¿'Ñ]§Eî®A8QöÃ^î$W|nßDsÍGè^$1G§Èºcç%wî»D¦n|Ë¥v­|'¥L{§åèú*¤£ÓÌrÉ]@(swíY)¹T¯D_ëÃ­A'1»1ðvîl1q11¶î¤1¶1Ãñ6î±1f1Õ1×ñ1¿îØ1b1Þ1Í1wñFn1¸±·°­Ô²Ô«T²4Ê?&zzzRtåèB¤ùåÈîÈéÈí¤»Ô¨Ô¢Ô¶Ô©Ô½Ô»Ô¯T¨T¬´ÚÚ
wèz¥?¤?¥¥¤¶11¿1±û(Y@¨Þ9­[ôÎÏ2
D½­ÐR©SE÷ò5;U	ý·+T!vIMK7£î¨dxhÃÏ8k#fäiÃ{ÆhÊKeï=MÅ¢/âg"\F?"Þ³ÍÆ= Ë-9ÞÐÓf#Z-Ê5Ïo»úÖæ½{°-<¼5ºY	9W»³]Â«Ý"üÍVï÷WRHÑA¬:\Øþê®Î*ÛÉRÑZZ|UkßoÈôW«ª)\¬»Þ1ë¯*øæ^Ý½
ã¶0Îqj´ZA2³ÄDoáÔNÐÔ-{i£gaw>í"^¨§´}Ñ¥0QúhUõHpQ+¢ÐHºxúÎ¦ÝÓ*'&a¶_ò½uÒõÔd¾.àÊØvrNÅÃIà¼P.#PÜ4® Táå³·è£Å(MçNÂ»D¨Sµ@"ve¶@Ú¯î©|Ê|USÓXüDøßýFaçî#[c§0wîæÏ|Á]F6*Á\÷[îKî#Ê111Ï1¿±û¨ÜI_E¾÷ËòÓ¶¨=M»M»jÍöqâýÝñÀx´Ì¿Ó¯xÜ¡¸\©åõuÊýì8ïµÆL/ »D(xßTdFÞø¥d%oÏ¸²9tLOöÆaÛøÕúµÉÍÂ¶¾;ù%RL4ã£Lù!iXNrûULfÊÔ÷-ýTð½¼·+ÒþÆËlJ9°_ÌPÿÌIMÌÈçÖÔ¿ÛÊÝû¡SjÒ¥·Ô{»ZôX9	VÍíÉÿ½ßúHèvú³XìÔÍýu½Â­þõôT*þhD
M gzÕ~þt{E®ÖÙsÈNj8@«»od°"YÀ:¹}ª#É¶Ótù&ñÎM®ÅöIT¾(MÔ#à\"EÄÂå<®­ó±3ÉW%yT<Åvýü­þþÓ	è²\F3ÿçkÈØP2Þøöå/ëÉ!DE´âT"·1=MwÉ0D4WYûázþÌSáû)Z!vâ/¶ÚÓÛ{mxã^½=}©	Ã×³N94½ï¼ïôòV0côCeT¬W·}:'È&üCÔ=Mì²Ò®2¯È¾¤5£W<(E<zËÓáN¨×Û½èå··IzÉÇ¼!Î0ÕOûTQ"­<÷5t%ËHOÛ{TàªÝ#3m¯ÈZ:ò¹«kþf_ÉUØ­X{ÊÝ[ö6íß¯çðõ¡y1ô÷ÿ)=}Ik-<5¨Æýû(Eû8-´ÌUãþ^©k{ß1iÄ²:ª
ý_ò»\ZÖ	í:vA#PóæÎç¿î¨Î²!òm
èÐËï÷?;£ËÓgæ4Ê8	û4û5!6×âófÈ@!ê.¬úÛéHeºðîHâ'½PÔêÖlLjã*ª7¡£×½Øþ4¥ ÈKnÿÍ=}ALç:ïÚH ?çV FM~¸öÎ= ¿ýþ4sÚ	w$lÔ" D>Ø3	o¦OLc	Ã¿<=MKënjÃá#±sìSLçæï]ØÆßVyà<aøÑ,n¤<¡x53tgnú,%l^/-;|!zv)bÌf#UZÀæná¹3pD-|ê@~ö>Íéº!j»¶8wlIíÂg®yî]:6;Äíqö°µb=MCÌ°V(f
Ø^-vÎ³¦"}Î£ýéÆN'QñrÄÿó@üût
Xs@3aél­lÍÙä¾Íäêy 8Ýk§Aó.È|¿zz'@]ÐOC= -n8Ãv;ª&ÂÀß§l9Jè³]üÐËësÂíýÃfy ÃíkºT¼Á¶LêºÎ0Ò£JSÑRË|ÆC&§×È§î''CÁHEá7·ÀáiÈa²Ó¯ÌTäûN¤È/þhÿvWòpX<kÚ#W¸[ $g=Mx-wïzÝ1,o]Ð%>ñ;]ñs= m¥= TdÀý×6õg¢Ï°p4wg[·pâgLªvnm!ÅÉi¡½8iw¬£qt³ä¢'lf§"[Ä,-ùì[óÑ;|"Q|cP@ d^È¦ÂÙ¢¿îä©t)°Xj#$Öê¦HÈôê]¶|c'ïvG¶$"L³´¦'!ÝÙ|4$Ápï*åQØP~¾#s¬¯ RJdäV«$Rì¤¨/"«rÊ¢òÐÉ·rZ_¨¢3HÄl¹ðìÛoò±ÏüâD$t¬òâóß²ÝÌ*FHÎÂÛÎ²zÏ©ã^4ø}koÃÞ³ú=M%+*àJ1lLÍ. yK¬8ÇÄ/á¬Ü.$S&ÄA>F¼Ûúå¡Z9XLùm#Ì|Ê)¦AXt÷ã^{ÓÐgõJp¨L
lEBGã¼Ö*£o¾©Ù¾÷gÉÅ~<ºSÐ6Ë\SQÔ¦,'òÇY°µ Kbxæv@<Ìñnt R= ºÂøvBý§Æu"Û­Zþu¿uB£gy>ø)6½æîl»£YÞyª$¦Z#É­ÍDhÔõã%(³L{mÒì'ÊFÜöCÜge¢[è¦Ð.£á1j|´àq;Æb\bÎ@¾ õÏjÌÍ/QºïÃVîYúý.ZÒÜêD¬G¨¶ÐüB(»!ÄçF¾îï§,/Ò´¾A³%Raç²ç%Ëîo|zÞÑL]!ÑNç]n=}ß|~ÍB1ëÉ´ä\7Þ~Pÿgtßv\Ï_Mï¼©Z2\®¯©WÞõ.¨7ul¦muvËjþ¦jºÛt"3SåDÞËd[}"&¢_ÙªK_¬ÐZìÉ\MÉ'~¬²Çk9@kÚÌßq3M/~û¥SçUÄ'êzéYÍÑÄªNÌÆÛÏVV¸K{ù¹{$K)ëÅ¹tÿ­y;æ9¬E§qÛÞ»Íis^Ã÷Ý¶;Ë¹ñ*¦ÖÈkíKëýi;+|;/ZË~Æï-ó8¤MÒöu³!¯¿À·¸÷KÌÇY­ÆÛç&5EEo8zýöm½'*?a1O¹DéÚöYå¥æÞ§îù©(ví9­µ½Fºª.Rnô-
²ÉÙztÍ©ö7£ûRÚI0/ktü4ýÕ3ÛÛ0'þT
ýÂ¤¢Zðå
};Ã¢][³Ö+= :ÙpýÕF´Â­À£IS«ªz¦õ¶6YÀdmõ;òÅJÒ-þ
²ô2í1s¤ÁÈJxº+áöÚ²T2»E¢â{É6íÿùC'ÌbÅ=}TQI¾<=}çv÷Y²«±»= eÏiÏ'pJWÞr=}j/AâÊ3HãÎlµ~í¹^Q_áXú­¯³	¼þ®R>ùÛëDÁÔ÷ÎÏ,t²6Óy	Òe¹×ù¢Êð×I´
ð¯]Q3)?ÐfQZyDD¬úëòbÆ3(¡ÓH#WCB¼J°¼¤ÉASHEÜÊYÿÚµók©Îq¹¬ûµö08«Ò#²òu3r[Å´9ÁÝ¾®-û¶0ëDõÔ¨êB5¶³[ú5Ë3zZôö¦:øVK	@.Ú*¸á$ÏûH2Æò¶Î}0ïèr}õHW¶zÙÑ{I:®c×°Ú_ýTÁeÿ8¥3×3-QÛHñ^¾²÷¶L9§.9TøVó§'cE.aÚFÝé¤Ïg?o³.ù4ÅV±úAx5Iãw'ÉX.¯¡*Ö	MÙ¼¥wvþÝÒÒ£!/0Ç)â9ý/ÓÔB2ÙÊû×áZÙ½añÊM
¬áQ·HV04YÙÿ¦óu7)5AfÉÕcõõÔ)­úCÛë*m
H6Y­ï£c-N2¯×I?^Êzþ¹£ÍOñ%OÛTE4Ýº Ø }¦ õ§S2ú[az¯	RU¿XìB42|MG$Oi«¿0¯*3Ý©×
¿ò*·49GH}5Ï(XÍVÚ§Õ½?3;OIMo7CÈ63	{U4HsmÐY¬0[kmÏJw²¥Ù]É<s¿é¦¹ß¿±8>Æí[®×[_ {Þ0
Õ©rPënJ^6»	Ç±kÉ²­»þ\£/^²+ßB#Éªþä7Oô xìÖûõñZ·y÷b;¡U¸l6±a«±!(KH°uÏ
Â-µìÏïRÅMíKàS;@ãzÞçIzNJÔ$:Dîx×¾ûºîûo4ÁsÜG×¢V;®ðí2 BzmìÉ6 ;X.8æËÂ»ðôîÈÂìvrÃå,~½kT×!sÍXtÊCÆfoNê,y½QÉ·|zãSÕOnjX»ë¥UHH0mËÁW7ÎÑIî7{C1ïN¾o9»UÀ8
çýsUÁ³É_T7gÎNNázc´XyÀQ¾cKé_þh?7s÷;U¢÷à¾À[Ú!ýü]m1ß¾yÁqÔ×{Á*<UJmU}1ìTáÊ©<X1g9ÎÝÒV¥E¸Ã¿ÅìÞU¡']*då]0ÉÎ(þT#ý]f<Mï^]g Ý.= ¼= IfcQÁB¯o$i-¡Xth*gfAò
úÂQv³¸Þ%¡gÔ¿Ææ@7Æø"|kÇø &|]P3bS¸ ©×\fÃA!!8	dsæÀ*æ /£°}ê_Ðlä¥æ¿ä¡·l"\¶0Ë"GÁºlßJæ¡#ÒºjçC:5A(OÎí®q6ðõºC¶ëôü§ Ødá§FøÿÃãGÍ¬3vObÌ1Ë8ÿÄÞ,xé½µ!Ú:Áßô}:M#è?ÖÐÔçMbÛ'Qr¨ÐDdM^ªÀIåÔñtcª18· úØaçd,Íq°æA»q#/lïÚr¶§pL×sîßH:c~³à8 ø68Xî"ç°XÒtùîæÕÂïî¦ÚKÈdí~cC9ÃÐ	ÒlüÕ|#?aÏ6 Icºfî%M$øÑÀTï%¬Û§<õUü´AýsÖÐâS}¼HFl#= ÇØ=MÕ¦Ô=MÜí½ÀrEâ{;½@U!e§¼Q9u½o³ó¾¸ÁÉ{ìïÁ^48ï#b1	ÑYnkøìuN¸Ú&}/_&£óï§#ùQ8SÏ&òg*D~H¸Náqß¨ ¯!d4ö­ ^/iXÂCé±¹þ¨DéL¦¯dnýè~©sÑÈ7¤lÚqÙ]<kØÁ^sVP¦ýï÷ØÃS­Ï¼³W¡oÖ¯U¡ÄoÞ\R¡4h¿L«U%M=}Y&w;[Z8oÏö[!]vÖR'N^8P§ºùÚYÃ¥= ^¦e Ö£= ¼~d ¦p=Má¸pÚcñ0tèµF¡8xqäËâ{äUÀ1!øùwìM[ãIÍì¢ÀLsâý¥HØdßæ Û(Òr´¶¯"F»ó0£tÑV¸òrêBò°låéÆxª§ç»®xÖçláóÁLyGS£8yk¿¬&i=}ÐüÖj'
\ÐOm':Ð°7ht¤À©ÖdXîhê ®ñhrrµ{Ñr;ô@jï#Àj	G Èê¢ô©¬±zcn¦Q¥FÔéáìÂ@ò|ã¯ËÃpÛfß%@U ¸Ué%9É¨pëÿ/ÂAqçeÖÑ¸{}ç«Cüí£µÝ|LÛè=}~%ÉQø~Î·CQN»¢ZÀç»bÇ@"dt?¨àD§bîW­¤GÑéxùýhíéHÚqu­éÐ¬"v'<«©¢M*ü	¨¢6çKªòìUq)8·ôìB£)øPyõ³.e¥þ8ôûâÙ{²^²j¾7 «uL²ÑuûÆèmu*³ñYuÚA2Ðm+GÁ¤ÉzÖ>­#É0MõnÕ}2QÉ·LÏ}¾yHÃûáSayðtÆÀ.ZlLûáòlÄ;à¬,×*$C8¬\ýóéOÑAÚKQ¬kvã>kÃó0ÕÞvnM)â9íÄß,"jUÌ,-æÿÓÞ¤ÇÑ¦îÌ)¦Õ¥7ÆÃ1ÿÌlNùãmÓP:gªyÈ¼øãÛÒAÊn*¿ëÃ*HÁôkµ[¼¼R)¥ÐúØ¯wZGÓ1VwÞF"½oçfG>oóSPo%+R0oêB<ëüZýçµYÐ('çÜøæD#aSSÔË~ý*çßÕÖß,'}Eb´V +b 	= '¢j0= &Ók0ÝÃaþ} >Ubß¾à!?k@0	pöÝj1À½èÉåXp²è^Iåþ¹h5åpauå¶.$÷?å6¹æü\z#XBÍyBÄÐðA=}y"6+´æËÇÅÝ»æÉÕx)°4®î{ÒñCJÐÆìñû÷|AÒô)±&E¸°nGUÒ´Nñ_©¼u=}÷#X|·*­îåýu°À+ eB=Mu°} æbçctz áerÅj,¶¸á{t¸«á<jl ËjµÀº àWjÜ_
 
¶e:ÓdÈÑÄKÓ¤WECì#¬"qæ'í(ë£èÃ­'/î¡É|v|*jî$SRöÐ½)Ô§Ði'ý|ÑB\ÁîÓÅ|+Â/Ó\,qØãÃ±u'*Êî,g|]þÐÌEÈ	CÙ#1['Gï|kÓÒìËBèÉFPY!1]w'?|½»%QB¹ßL_éK¥¹Í|¥Zü[2[Wiy
}8
õ²=}ý¯Æ]ªùÍYµ¶xSê½Î_ï]ÔO¬v{ð.=MáTµÅdÝ|úB]HÉÆõ.êQë	8É=}ûì=Mw2­+#ºì9¬c.N ¬M²J}ÔäJ6þ,Ûu#uZTYÙ´³¶4Jø^üÎÇ9©UTH}ÿ§_½(°æêï5P«s²ÊC8Z¹gÃì#º»Uä$"hUõÝ6d=M]±ÛpûC'<!Ø?tã³æÁ·í&¸;BI¼äô@ ÏæàO21(K= õ7îËÓ¦ëî{Ìì<KMá¯4W")ÚÏØ¿U%\^Pìn$a!Ûzb]xØ¶½j§g?¨(~§AýÏlL$ÌÈ&-« #¤ì|øìþ±øuùuÉ
­'lLÈ-ä¦«vnÜ.&[òëR9Ù°R,çïÆanü G8¢ä(Óùl¯Ú*1¼î/Mu÷  R¥eIÐ¨\\vÒ¨¯ÑÜØ*qZíÃUîói{LßÏ0­ßYÐ©¦Hd©+1¤)+?3EãöªÆGÎòÜ^±yÑ ¼r²RAé+ôÚ©ØÄL¶ÛIuÝÉ:ÉÍÉö	Ô!IeéÔZµgIT4Q2×ß	¶ØÞ¿Ô/P|I2­?Çªív/ó~Ñ¹1ÇTªWU²mërIO½2F[F'%uÒ¨K«Ïì]yW°ÚËGÓIí×2Ï«z_ã]ó]ËlKtûÊhGbhO7KjÖ?Uå:£¡PÕàð½´ø>ºX)Md¼4®{LÑv¶ÒwNWWrö.Twºº£d)ühÁ
Ùü0Z¹ß³ *ÜøkiOÇj}GjqSå5)ëä#g÷j·õ·hÿ=MvLsûäªääU×k­Óªå¦IUJJiÜÓØ^Pò·Ö­ø¹Ô³MîD6AJÃÁ«=M F Þu¦%4kÆÕ¿ä.i-"¿?âVV"!*×áj«[>þÍéJ(TþÔÂob¹#¡çí]7í¿=M/åþL8»£ÒµMÅ",Õg/¯f(FÌYìÌ¾ôuSÐÆO4:þý~ÕiøçKx¶9ñ@ìMx'n=}WÀ.º¾¬5#÷oÀÏã¹nå>{¸îþ_ö$ÄÉÍùÖÉðÍÀ_È+ø.æ_ú!ä8RSÓ8H2Ú#ÜÚI¢Þ>ÂÉ.²¶×y¹â»êQýË8\³K¸çJmÁsÓO²"l§ÌÃñóÖóÙ¸¨Y~;ïº~Àª	çø]AL§KÑ!:%âöéÛe;G;4Er+"&&[µëû8¿GRªk{×ÿµÄ¦A¯8ëÇ¬WeJ_êµ¼Ø#$Ç:U¬K,Çþ6(m\&N6ÝÇû_Âz=MEv°<×*T*«å6µ2vnTÝëz3·k1Ñ.Ä½ó×>³éHðY|½J2ýb·I1óÞÈ;¡cwÕ-Ñ©>6ç6¶KÞN®ßòoTCyj hôÚÈ}mA½æ3;jËõÅ£,§òM¾¢Á¡b9{p1Ã°*Z1Ô"á&ú2Ï®´Ú6å¶Ðmó<Iâg	
Ú²HCéÔGðePFØß:Br¨Æ!Ä:Ùr]Él§o³Ù¥dÍ=}s¥k·%°.Lj.«©ÂrI¬®ººã<=}H³nF1'bzF¸×eñ9tzÄymÿ¦m3ú¡N®I'Òlø­F0-DTè~.ú§÷-_òe´ÛÈ1å¥ô½ø½¢÷òöFºÈüþ8 ONI±Dú¹úÞuÝË)B*Ú»þ"_Î 5fûÈáMÆòXÌmy´Ä-í´OÎA?Öð¶W½ÜDÎtç6V²/òÝºª=MÿW³Ðãt¤íqç	OTVP±z]Lxm±=}#®0ñðóDGt%~­ýK*)¶Kô¶°÷äÓÔÂ5Ù
ÒáD²Q +ÄtÐålF¾¹±8K×Ù­©Î±MQ­¿[<95ôæ.þ§óúOóçY£ºYqU¹YøºÎ>Mÿ±ñ°«V¹/)ÂOkjÞ½§7l¿±OËR¼XæÝªOÉàDc½/\¨ËW53R×ÿHèÑc]j^¢z	VV·òËÜ{Æ²ýZý>ýZ¡¯ß\w#Þ37v289ª£¾]ÿ>_¨~8¦>ÎªØ[®iõ2}ê:¡´e3»µPÍõbÌ;C°ÕÛ\«K= ¡«méÛ47öIèe34ñ>sÐsgÈÀ9×mT¸:y³çÊJ^%ÈëªwÍLâéÄW1BÕÝn®HÂ×=MòSÝN¨MîÝÚ]²oËÄZÐ6KáS[Û al¾z  ¶IVâ*>¾x6pF¯mQ3hAzÑ«ÏOã ;ÝÐ_VåÒVûú _ìiÌ[¡SÝQ<^Ø
= ×n =} <p¯£gÁ%7¡X=}tÚÆ>Áf8û#Og» ¶Ïá"!Àz£Â-p{êAÅ£ñIÄi?z«<o"/f||æ}ç£Ý9ÐMÃí=M ÆdJ/î ýmò
Í$vnÏÌÙBï$£ù}~8(~x¢â¾²8ÍòÂ¡ßa)eÀÅÐ}¦øÐøPÔd0ØtøËjîíâMÈÄ}}í>& ]0x¸ Âÿcþøíå&VÅLèoK|¬?iÇö²#yÇ?¿Ç¨½ÐKók~§ÂRÃ·äÙA^¼ôìãY^ÑH0/}á<Á~ÁåC1USØ8åÚ Zög¾2d¤ö®àñ.,S$ê?þØqqK
Bp'kIÚ>ÈøBí'ÁKCcEÒ¨fXBEÜ¿\ZFë"·XÒà¶uYC®ãÒb°Ô= JbQpCÿdpä±KâPhââA×xT£/j!PPr»^9ü©ÙitêÖ¢Á_t¯½#PÑÓxßç!9Ó¶ÌÿìéßÇÂ4ç£|©Cà­q@­q{é1+ÑQ­n;¤¡ËÆtN·§¡£ÌQÝ	1ÝzÖJVí¡>xZx;$¢ç'"DÊË'ÁÑ |Ïì#	ÑX~;BÑQØ_$#Ç´b¯¯ N+i°¶¯$Õ¤ÔøÿèÃõéØ4iIN©ð/«"Ë©È¶«¦Ã|Ã=}ùÄC­j3²Ï×j"¾À±æZ"ÃÁ>¿ª%?	¸ÄýæUQÉ=}øfú|Køî³¢ðönçòÔ¼÷îªlØ9ÇcÏ6Ä IÚfÆÄÀ¹¦dÄ"Ç¶ºnÇÂÀý8'ú¹0óÄA©8« ÔkñÏ@	ýíËV9uñíPÙ9øÚ{¶¯ñ2g²|þðã9°¿ûc#ê|üwûWÏ'¼<xük«/¼øÅFBDR¼þëïÒ12òë¯RðDÁÃ¨~ÄÙoES@_oëÞFÛþm/'WiY­*çZ<ÜÍ+'êÜqW§BvÀó¥atîe°màÕ¾aötÀ!bü·àïj _= }kÁ:§L¶û¢ï¤½Øtåpµûk]¸Jw¢MÙ~uãlKlÄ¸¸ffy¬ô²æµ9¸,öÀõlÖ)@Þ²æ;7ÅHV¤fÚy~(p4©îUfÒÌõÞ|-îÒìQñ#¢î!Â7¾ó+Äþ|aDx­înçDø×¦î§7EXM÷Âk(1V»n÷VjäÊ÷8ct(²@¤áæjTp; üëp[±|+² ¥!eÖ²= $K­jÜ>	à:¡eº*t´ "µe´@P á<ºeF±KóbLûbÞp$Ñcçæçå( =}ç§ê§ó§ m'vi'Ð{+Ñ'õÃ÷g§çÚ= '2pnEÐnÈîBØîÄîëI|¶FÓä*êÛÆÐlý#Á~'Oå|öÒÄwWr'6êËÐ(Ó¬<*£Ãw§D¾î²îã|çäÃ|¥Å|7®ÒüFHÕ¶S|'èk|v÷¿q7¿EßýÃÆçÐëCÍõØ[nç¡'Fzî>WvX??ßO[øÃGsî¯æ5Ò$G¸VâîZWu§CËQ,|ÿ>Òß'ÑM'o|ÓÒä6ÓlY$1Vù=MáÃ wîzññO·îÒñ¿s'g±Nî1ìÆnõO|j±Vg'q]D8²[%q
pI_F¨rývÕÊAPq=Ms5é¬º¤{¤o¥:ß|¥Ù½g5|£¥^å¤Ô¹T¾4Q' ñã¬ôº:
p=}sÝt]uÕÉCHr¡Djv%é¤¼´ºº:u}uýv½p½s=}r5\¯¾K^©4ZZZZZ]Ùý[ôC,N^VVKÇ8ß[ÓD7 ùr+NÇi±2íMæ©£ÃC·ª¶´¨;I©¯î3ssÄÑóåVöåÓ3k¦eÇåD)Õ"ju¦f¬IuóÖ}'~'4G39A+9Gîù½RÉ¶ß÷m²[(Ò³Áwò=d{±ÙãÉ tá´|'3?ú°ZÎö®61±EYt¹¡	G±ÞQ~ú]xÕÈ§_Ï2§4_#Ëú¼9¨s/\ó¡
HA3i9®:0zg{u£d¼æ¶2x]xì#ÌS¨< ÓWÈì×"3ÿÎØKaßRÑ.ÒCÀDÏi%FZÐl[{å3oÂÁ« %Zmª%.AIùéü³¹|d*¥ÑÅ~t/RÑAÆaÍ$y+Ð·'&¦îÙÌûb} >ïCI¤î¼îËBWÓ4ÿG+·+L}§ïfnçÏ|=}ÞÒ^-Q õã^Ò8^CuÙÑp½p5êz¤¥ß¤_^Å×-ùXÈó4
³gÐç´XGð\­vö²A Ëb~ræö\sÌî×ÆIæ9	ã8ú¸8"·V®ÀÓ¬Â[2s80J¼ÆzKB÷ý^è?âR¿/ÜÌÅsïLÆW#oGºÅV4yvÛé0	Ä·+O#§LÁ7wL')RÓ1ÈÆùçº¸N¾jÊ³ws5¨ÍËY½óü2@µ=}BÝK¥FTFg&ÔÛ@= zùÍªÆwÈëÍúüì×;°Ö´º mS¡o&ðòsåò-Á×*Ïý ã})=M(ïN<nj©{ùÍêwÃ('áZ3XÝÉÔó¸F2U4bz¿®
³>ÙÄÉØ/ßíØA|Ê±¤K.=MHeÄè»¬zÖ«I#=}Âúüüò5¶²7-(µæ·$Utñ>9¤?çÍBÔÔ{ÅÏCÓ×2>I!Ô(ÉÕß¼ªßòn°Ì;¡R»Òøø|#'(ÜÌyy4ü 9ñI=}ÿÒæîÉéN| §2;±÷) RjýU¦ï¾¼äªj[Öów¶±é*}Z¸Ô÷6×=M³Oñã1czExXø&OÞ¢ù£þ1?]TÉ8kÂçKHëUÊ×DÅ»£O+JcM[¨Ï,1à}ÿI)wñÞK1
?ÈÞO´Mg\@T?Z½kmúTç´N^®Í´}äqÚ*ð¶C=}LÖxªev´ÐÁ^&'ÃnhIà\8ïJè?Â=}ÎÕhÁý35 @um<Hìæú8Z¢s÷ÊA-8¨]1e%A}0uÛJÀÃùn,CÔ¡{×£¸¶×ùHªo%ÆºÂ6cWÚÀ/´cHoIi]çËº´m$L[æ#í/lNTæ¾ÞôTMëêÝñôÂì}=}¬ðÚ2d÷#ZÁÊßT:5&o F&a¶pÞãEA8tø÷y-$|1ß,ÑÙ=MeV«f/!Hþ²¸ÖÐlÁV1rÆºAÖ?ÁèlÜçÃ ÷AÐþÃíZ ÝÂdîÛ: VýmÆÌ;¨XL~éb8¯í}&$9Cµôw©>¸êçÐÕtpØ¿ ûxæ¯xòÇqBc/«à»#¦!VLHï¦:#1xsf¥¿& =M a³µ'"ÒA¸ØIÞÞoÒâÌsÌýQB& W
k~¢Gî.XA)cdí£"3ÑØ)}ENHr~×Ê'ý8¢¯ÐÈb~®àÒNØâíÿèTsC@åE¾¸ÍKm?{µãÜÏonIY"Áá¨%oÙÞ(XLç½A^ÐGoÏ÷= ¼yàUãc±pâ¼qä®m¡Ø{rl3{!ÍwâÇ;¢¡ÇrfB#Si¥[¨~tf%ÁèYuæÿÁóQQRÄìzrîÿ«#]|S¢p»qáòÞÂK,êdï$7dNî¢®È%§CF5Èmê!&y¸±wãïvK¶'ÂÏÓl$A5.ë'\ Ø~ê'nUd)iö= å¦f®®äYñ¤,±«" ØO­"9©øEñìÍ{ò1yí¢jÚ-«!æç(ðêÝI	¯åÁ'XÛA#:´®ãNðÔL.ª'
³IØ
üá|Gl$,/ >;yÐNöi_¬¶Ç"@©4m@qòå×Ë°S¸LvãÌLU+&RBÌ<=M*¦ä¦nüüÒÿòcóØ=}ôãÎv¸qñëä5¸²õkUVÙ/£ÃÒ~¢G×­~DÃ)(Üìí+ç+
ÜòogL[wÀ*¤teXVåMbôuÀù¹®ÙuÂ¸ÁÞÎä8qIíåx ã	´æâyÚ®÷3Öy¼*ÐOãlg$¦ØÌç÷û|B%ø'=MÒ@ü|Lù|¥DHà&pe¦Ð´áB|en° ÐbtØÜ«á!t\ iÕî¾|Y£&s§g'ó©|+ó6uÐÜù-ÈyçÌs'_[/,ºu|£Ñ#QqçOkîMÏ|éC¿ÓY%ÑõJçÍ{'§ñ2H­WônÊ]WS¨_ÿ§²²úR?^;ßzQ±	Áù1I91ñ1Ýí¹¿§·ÇwÿÏ÷i¾BC¤¿§og§D4LH¬+øPPAö©Qq_Km+øXèPô$ñª_K-Hì_U¾¸²¶ú2_Q«¯Ï#¾mÚHKÕO3µ»½=M]_¢5¨pc±TíÍ;¶W:Í;6M7ª²\£	t/ZMvó5L*= ¶ç'sh¤>¿ñ(ÄjjÅgj²²²zÍÍÔÝ/=MÔS1ýå~úI]=}[Èÿ¹Ïx{y á¡J_Á£4,/Îù,¨ì²Ãì
à¯.³´iØùÉêtø@Dø+ßø9ÂÆ¨¨â©vèkþÅ¶érC>Ê9÷èp¤xèü=}AÐfPBCËÖ¼Î'CUZÜÞßplæ¢AÐr½#ãkujôà(¥ÃØñ¨³	Ôó)ÆÓïS%Â	´·5V@ð~9Åým9Âû}®Fæ»NGá®CükÙ¢ë~c¦|S"ÊÔ8C$íc3{ÁE= Ó;u¤AÏ=MÝÍ5Í;Î°Ñ²;nK&ÕÃ±M&Ì¼;ÓÛ?SXË6.,Y6>wç­züXSï
}ÞüØaüKçÒ7ÚA¥Î=}°À]¸@$ß²=MÑüÐ= \×^(·ÜV:ïDZVõ fa$jÅ ¶= j¥ ¸bªÅðàØiq/u+:ô¼aµ ºcÊÕ°xåÌ4 £6ÀÒdÍ¹åÚcÈáÆkÈáÖgHÔ¡fd¸¤6*d=}~0Kc]axb#±Ü×àQdø¬¡Ài¹ò¡Lueäå° ñ¢aÀ©6ÝÝ
ü'äÐ§$¹kÌ»Òp¸°Ë)L÷®·!ª²òôûækñ¾KhÐÀîü÷ÿ»Þå¬ 	úhÚùÊLÁ¹V'(±ü-éÿ^	ºW9'éØX©èØús»tÖÈ[Ó·SpRa?GØFþÙés¿[«÷*Ñbjt±Bæ~ØBÍÃÖÀñ$òµ³£Õ43 ­3:¾Ú·OIÝ3I8ÔÊéXì¢Ø¼"ÇAt_¢JÈ2M'Éç§Ö¤ÉÍÞI©BL>Mû}{G¿1XíÛÏÒP,;ÛG×ÿÛ=}+ö=}0«ïãkì9M½v3Rá4§Z¸ÿø.¬w3999Ó%ÅÇ
JÊK>MöV«çC2ÉIÔ¹Ö³ÖÇVÄVÒAý"7_ª';«l%ÙF9öÔ[võý+æâ,aê4¸P\ ^9Z]/¡\>¤zQZnûð¦pGãªqgî°³qCaTÈÃ2ã¨TâÏøLn¤¬d³Êò&z÷kúh·L²t$ª½©=M&ð!´³T"	ËþsÝ= <Tá>¯à<X5æÉw¨w¯c«ÕÉÀÁáªß
Â º!Î¢Êb·/uÄ·?8õFï_FG__Þ_\ÙðúTÍèiYDCùBRÉ¬4õ6D0ºéä¯þc'¸×)jÑe1ï=M§gñ2|1ãòcÂjn¦çÒà	§;ø*âÕá'¹2Ú:M©ðølb¤55aU=ME²@{²Ç·ó¶søØ¸e-ÞèãÉ·(ñ&×Å³¤­) aãxo£6!tç+yø3+ùáó¸ÍÂ*Ðn)né)&Eù¼ö¬¸¨ÆQ¸Ð¹)BíÄ8H%l?@ÝgSuSu#·l¿Qëù<ùAiSoøsNÄø×(,ýùAnóAiÙ ,ýÿÁq½ó%+r[ù1Åè?òÅËÄR;û?>[\Ýå·-*ë:ßé<jàh= àN=MÛE^¢Íû)üÃôfÊí6bÍ²b%²å2e²2¤C16Ì9æÌø6ÉlöÀðfÌ¬CÄýB£ÜnE	©oSÐ®/!îA}H:±¼:»|"ã¶4¹uÀiY
µdv%bYX*Xo'Y"¯\+Ñ¥ÎìrÓèÜ3]Y
°|àÁê
­ÑNß@¬8 ïa±ÿÆÇ®EÄ¬6¤®u°áÔ{½Æù#6ãÑ×¤i	âr¢yÁtá´t«,ÙÓ3Ìc¦øCàç¶ºEòiýZe^Ê]×(­1v<äwJVáê¯<·OÁEõ¢fBË¾Ü¹!ØF	G¯¦Y_uæeþ #~XøUeèAMÉËUü%V|a7O&÷­ºÐN.þæÃÛ/wÜJ}%GTýÓRVFÓGï[= dêu>å]GíÝ4pSMDÐI(£ý?úèåÔ?ÏÁÍ3<º.gw@gÒ,éà#*÷hñgkÒsçky©­t4	­Õ¸%­ÄpÀ4 $JÞ,Zh^íÊy=MÙ³MÞ£µÙfUíÆ9ZÝ6=M¥µµ¶ç,ë×$YëvtæâHüi2a?ýí}:îÐÑ×Ø^Bù¹-ÙÌ×¿æ¬FR°	Uê?ÌápÈß¶.Æ#> Eu6«üºÓ­¾ßÁèâpoHÂÝº¾È ¤Áéâråj¨t¤":xLe&b;Ìã%tñ_2ÓãCsÜ#Ä+ÃÌ]:k¿'Îøí1Àèà0íjÂgdx  ÇeÃqæmÐÇ87:fP!øl'ãyäsó>Z¨l¦p!xÚPP=}ÝÙGÓ¡èW?4SÛ¾ÂàÁ¢V½ï}Ð,Ð:âÎpdðÃáB·5l#òô¨¡|¯¨'z- 7Êß~¦sqÔè{y'=}É¡1P^åÔ®«1ãHÄGµÛ5µ½ò^^Æ@5=MPÃ!§¼(Ó!bRÛMÕO gç21î¯ÔÒ
3ýýK\¢w÷äAîâpiö0PífA}¡÷·6UíÎN-n=M= ÂlGéw"Óë7¦st*~¿BsY.RL¨îîEX¤®®ET¬..E\¢ERªñ-°ànËp%g#ù*6à &_\7ÒÓ×Ò×WoRPï¯RÔð#ÓÙ^bõOÆÜ¦lßãix!>Àâ­Òps¿ð8ZÈ+ø¡!Ö¢P]ÿs[¹EDÄr4v
 uê8DZFù±0T 9ázÎ4¢r³Úò¢Î¶.È¢iÃuÈëý×UÛuÃ®ÏÆ³{Ú±ªÀw²©kÉL&òÐ#ãh2m'zMÿ+óléêÈHój:	óO¹.êÊEMW,W"·ÿ¸êLT= nà¿Ì;ó{7Ë;¼ OÔ}½¶×³.#_Á.´(	)é))ñ))á))þ))Ç;»û{KË+«ëkSÓ3³ósCÃ#£ãc]Ý=}½ý}MÍ=M-­ímUÕ5µõ¾ÎÙ³[RëªE¯Ù,~Ðï<F7&uÓñSüCl_S_PßRgQPsRc?S?P¿QÿÓ*i'|Ñ(a[L+n;Ì)fK%z,rë/|%l3¬)¤.xìt#l¸l0¯¿1«¯1­·1©§1®»1ª«1¼1¸tU4u¥­±½´uuÞ¾	Ü@OX¤7¹´Ek< 'Ã×íÖÂ7ockïÂ×whhÖwà©¨yª×h2ýû:Q¼Fc<wC¿ê¦50J{µ½
Í´íªÙÀGyæ,È°ß&[ÆxlÊ\ÐùAø_Ä¦J²çycælø §Ç X_g¯ Ð7.Cíb_Ï]ÿÝK_dQ¢ò¾ËÓß×C·}v­Ý1ÈÞ7ZMºB$K5:äß÷÷:mrÅË{±6""ú(n¶«$ôTò=M÷=}Þ,¨"ÑL²9ê¼éßÕ×+ÖÄ¨ë¯öHrÐ³V¦%Jìpé¹6Þra§(®Ü÷Ù*Â|zSoñ=}ñJõÓÙ±Èó3Q¾¼6_ú¤ç²Oä#»m1ÕÿäÕÞËÈ$üý$]r§Úèrç½[êwÃÊKfë©ÝÚ²ìË;ø_%Q"¡­¿?ÂÉúÆB°ú=MÓGhúÅ¦ë¤ýzÏßB	z'vË¤2]FÍråæÊú¿?µ9/ ¬ù	ÆØó£B(P&T¤çîÊ4Ç.éîú¾vÞÐ	ÔÞ
H>]æØ¢Óù·ñÇjoøÞ@îøª%bó[¢¥¥U;§·uSÿêÇmªp÷³õdµ»êp×M?ê3/õXluÆÇõlþ]¡¹?&/Õêr[Ãn×·ýäÇb3"¬¡DïÏÂ"ÛeÏ=}å&ezY¾¢¹¡	*·¬±ë¨H À#P¡Þc©äêömK§è	ï{8ºäyúB¤@üfr­s%P¾m¤¯qU,[Ú[5"£8G¦¤öÇ½ÚÈJÙ¾²â:6vµK8¼¼§õÐîj-zñn=MÚÁ5îªq±¸ë.¢©Ì_¶+Nq­9Ä´+¦[ÆØ)¤m¬Z6ZËkG7¦\çu.ÈØÂEåz,Îí[\zÖZ!£mýv#±î¡¨ÛV¸*9çW(Éw1é1Ò6KÕ!ú±½ÉV=Múl]Nü·Ôo\Ç¶³=M?ëÙz5|îJ-8 TZÐ%ê%qÝùjû]95ê·cðçµÉA*,9Cøµ«ùÛhúÍÙJô=M!uõm§C¦eºÎHâMº=}âÁÿ§Ó2ü£'rÔ
ü'Á|Ù|ë+ÈÛßbSÍ+ÐÉéå»+y~ÅÐôV'ñÄ¼ê {ký²VÍs8·õaÔô¿}MQý!û.Üúëa%$ÝøíWùÂìZ.E8HÂO,C¡ÚqGúÀ(ý®¤Ó¶q¦Ùë»±¨4|DµP²ÞHw²=M+©	= /oÚ¸9u07ÒÔvðÖÃek»uÆ½R	:zçÍY(70ÍªýÕE]ÑG±>Íá=MSHßÅse.dvÍF\¼Ò¶ÏE¦Ç±[çK#×ðçÆ××³ÿíÎwÍ9Ío+FÆu÷e¹ü~ïñv¹ì_^C¸·ÿX8ôÎÄ])´X|ÄÙ/Ì7ì7W¬ÔÎ|!Ò£7kîÏ(ÀRòCX+ _Siú)èÍÛêÏ©ßPÐúüóßÈÖfóßhxÙnI\ïöÎÒPSG¼"5HaÚ÷Y@/´÷IAþ¦_¯·°ªÃE­ÅÊëËìñªH÷ËüKÿª7ùUe5¦¼1­AåqüÄRyÓ@¼yÍÎ0³&ÎøÁû¤2sÄ©¥qñ(w³NN¨ÖyÏEi$)ód.<ÄºOd7úCQþ°)|¯BR.b¹Ø|>øn·Yv'R%Í¾ýëEILÔÌ}ë±^}'TÕw#øØïU®1È=}CGTÈ<.?'êìaoHj[¿o°Ç¤0@W§-ö)Ûä;%hÔUÃYÿhöµFÿAô=}ß¢ÕïÐ®Þ*+Ú¥×Èx®#[Ó^=}ÿCtkGl[v¢UJwT7i¡±]âG!¸=}ß)Ù!DÊÏÐp!ñ0¼z$Â£«|b97ZZálÙWúa¼üÃ%Aõa|_Ã¥ßºþÛ#4µ^¬L^öL8¿}?2ÃEZ»ÓI_óëæ[
÷X±KÈ«ë¿Ú'þÌ,Üçïoõ?S«XCgÜ<)] bÏFKÜÄM¤L§hX¤ï·þDq4=}ó7WÑ;ãòÖäTJç}] 7~	ZgM_gµ'|8ýYý}¾Sý2'îm[&"q¿þYí)pORu÷%®x^u_tþÁPM=}Ø¹O,LÑÁ¬õk?B+å·6$3Õâ{ÆSýIMM¦ûsn«RÊsé¿1ØTeCý?°ÈÜT{&'|ÙØF6ùn´_!Êg²ÞP,#þu<"þ5=})ÜÈ§VÐoû:1DëgGmSÎúóñLMéAü¯úO¥ =}§2#X6CîùÙEcÍó9ºXþ*­Ô¿YþMùLÖß'Z=}{\îôÜ¿,Ì):O§Þåm'«]Ø.fë#PÆÌE¯=M¹ÓLw,>±]ëÅÏ0N/µÏRGRk@¨ôua\úåçcyõÅ©/2 
F¹ÒÐßpK?ÂÁÞpû»"Ö·­n$ø9A9x"@è¯h!Z6ÓÆoE·I&åæÂ[l+ÁD9EÇx¥Íÿ2ÂªW!üä@'|~ráW'xèÀé1^ÔîDL?çú¤Ì&£T5ñ\Ü^àe'¨ï·¾t·>'ÕÃ-|Nú=MO1ÏÖl~NÒ'æ>×öîN°Zv÷©Îu§ó»,s§õFæu$Ñ[âeKBéëÇÏÀÞÃ,Qûü ÚûÝû SêÂ1ìÏwrIËÆª3"¤ÄøPËÕr«ø0,éLûXùñù&t¬/tÃþ¨)ØøyAÅð"ßeíé7ýêQº¸2EM»1Þ,µÎ¬#_2u¬C2xsÓùfM?,3¬6?T(üFIÔÝá>Û39Õ~ãðÔæ&þÅTøÞæ_p=}U^@CÒòIHJd	®y¶~Ó­N~EX1¬~ì"H¬Nç~Ã<¿4ÛoBÏQ÷äFæTZ«+]t(ª[¿&¸Ç±}Ë ôåéA¾ºÏ,F¶+8Æ3"Òw.}Òÿó©[Ò0í8.|fM>æ¥O¼^µÌÁ71¼¦>=}ìÝÐ;æÎÂ?àÏ@A)J=MÇÂ¸~©ß7ÛÀRsËPñï¥5eGSF9ªWÀ2HuÄ}ÀþúÞe$3«÷?µ(©#xvÂ
¼,Uv¥Tèêµ¥¬Kðè¥8.×ÅqmsGqxËÿ-ëé¿ûÛ)%<ªú)¤Mü¡5/äJ3	Åi-dÚ,7K3²FÔû&[,²¾®A]èjæ¬;ñ~8­TËy±ó©½æ[ØÒFô3ÄVúùöo|ã¹Ø÷öíF²jÃ¦ò
â5Ë§P^ÑeÏ³çñþ¼áI6¼\Ï_ÄÉÂ	ò!ÛfßIÉõì8àAÝ
H¹2ïmµ¸L«#ó+^+5äþ}N-5H©ä¾½îT@>-ÊÞö×# ú~ç	ünÅý¹DÜLä'ÑE¥}óó^ÒlS:Ïm×A0
zNÄ^£¹mcBç¯mû³ºð7À­k§6R»ÊyyO5R? QE
ñº=M¥K¢ç7_ÀýHn?MÒÁÁ¶ç-
ªÑP§}5S+$7â|uë=}K©z±..G¨O¼¶/Y6¹QÕ*Z¿ØuYÉþé)ÝÐcÓ]s$º=}fÌýÂ%D3mx»¦é¶míK¼ljÉ@7	pµ9 Pýá"÷âî$åùj­SuNÛtü|DøÏCVÜ±0ª^µ$$]M>6èS_ò[{'9¾|û@!ÑÄòÓO¥<µË×8èGÏõ|¿X¦d\´Ú¸ýDº÷wÂ±uÇJþè7c´ÔZ]°ÌüÂùOÑÖêåRôjsÓQWê\]Âãjß½Ãñr¢¯Kú,²Á2E8²ñ³Ø¦¬I]ÑÄúÿçm¥çYÊBLu}¹»­|¦/ÕãpÊÜ®r¿	ÿýz?äRe ­§÷¹ÂÒêzS¢tuÙÞ0ð4ì}Õô8PÉ8°!Q²«BòÆÓ¶ù1­,3÷x\ã?ÑÐMBTaé=}ýûkûr=}þ5+y«dñmñÓ£ÖV$ùú¸ù6Ûéû[bÅëýf]ðY«,3÷YRòÅæ©7ÚvHíéL¦
¤*ð3ò¬ióö»ÅÙrÖSÄy%rKb¦+n´¨I;÷°òËßóxw@¥±ØUîVµÃX%_Ã¸c	^{.åôÄ¨Ä?ê?Wü×20>»ÛOýÖqmú¤½2°²Ä³©ry±Ä_·ÇÞ@¶24ìôRÐ7G--Ø è¦WÎ£,¤´èÛÿè9r%ÎEÿ$=}.ùí´x6cKùýiV]ÙÚ®Ú=}F u'ÐÖÛdíóÂQ:Ð:H¦"Ö,Iwï6M"Hmè)tB×Op®°!âèK\¾.ÌËüÚ²ó>]ãZÞgúßåûrmXÄ%¾ØÎ!ïÐ·ðGªá\(åJ/ã Võ3T8ïEÞ<2Öxc#ÜHÃo!0óMOg,Àø/îÿ¯n0Ý,Þ÷ÑµÉÐ×wï<$«ÓF<}ýá=}LFL±xÝAÏ>©þ+Ö£nÓ!'ÉÌ1Zxk¿¬ÀIs|ØÔíUÅ°/\þB§SÝH.86íÿnÿ)Æ~Úy(:»=}¸¸Ôá7r,H¿ÙéÓ¾KÑ,÷¼x9þQ!9.{ÑÔµLÔãßA1åp^³DÃ¹û°­æ?Lþßl¹ Fj#.[Aü= ¥ïx7Qp>F´÷5¨¼u)¸=}°KÒç_ÒCRT?îÝ±ÌÐÙýèBhNue	±|ô°mïÂg×ÏCúO!)µÛPùöD5 DrIò¡íò{.üôÞùÌz©?ô¼Ø»j-²RÛ¦É¦òû:iïçªfÔwçÏIP!¥ý±²MH QÌïòãêtRéªè>V³)*ÝÂòw»sþô²@ÎÜ×B>¥!÷\ÙXæ0iÒÁïyñ"Éçk¿pþ<?tww.«ÜÊÐø¿P,Ó)ì/2ùö¥"×ïg÷´è Q.Tj=MuEF.L|âÝu®Ü0ev>×.ÕXLÖ1zN$·6:¨ÈG$¶-ñI9ZQ×iòÌïe~ÖÒ©¶·4
»×LF «{}ÓcÓ¾A=MJ ïîÎð?Ç+y$V\Þ=Mª­L¹TÓ³L|f#ýÖºj.nÖ|Õ×|bÒÓY?iøÀ£×ÚÿáyÔg·8YSbÅWn«áØ{V{bÍG:E:Xÿ<æÏ Kë=}ÉkÎ{uû× #ú:§×A\ÒËÞg!Ê6üyoºa½ÙZ)aÄÔEãÈQ,êÍÒnCTVêCYö4	îj«N^Ûr1U½)wåÛ°¿AïMº½H6JlVXºP&\1Àë6á¨kGÕ-kÇZD½C¸0Ch5Àägú^þKùÒCOKxIË"ë%xÅ¢S¯Ø'øÕOÏ>èÑq½Î¤?è¨\Ê(1G8=}ðn&ÀØaWëc6¯ïÃGUÙ_£´KÓUÃÜ¼=M'-ú¯LÃÇfõ%×_.¯ì'#K|ßCeB»KÕ/ØO$Ù3¿ÃÍn»V¬änOÈÁ&1îüÿWnV}ßy'gÕÀBîo8×±ûË¦£½ÛÊKÇ 7øV¸ðé!M×{J;Ò#ê¼lx9öo¼KÜ{F¶ß¦KjÆ<YâbÊQJêøÚg;Þ#F¬­¦wt+.tÜéfë§^ "}Õf÷@¨Ýzæ÷¡¯îøZsvÛº2ÅÊ¿
QÙXLÈ¦Yäz2âÕ5è<@:ÓøQ¢.k²r´Eü÷¹çÒ(XÌE³ÅÚ6æ0E¢sÂóúÁ
"²svGP7õf*ú_0/«&ÅJP6¹.	ß½GÐ÷zÔÀs5¨:0âÅ¡·Æn\å9Êu°aI®«VZµîØ¶¼;lm6J¼B³âYJ)&úzTM¾äP1úÜpê6¬Ý¸= C=MÙµU¦6BPa¿ÀÊ0æVÜæOûê_èK{:2gó;Ñù»7*¬|?4þ³£;¢ûuÏ9¶KcÒö×@#Ã§>¸\nÃÒã?»¬þ#ñ¯?ÀÔ=Mn}êsðF7éÆÍ¾Aûë=Mý¿À'Û½nyï@¥ýÏ­|&)T¸ÔRiVý1CRP§Xÿã> ØÝg7ifï%ZcÏ{ã~Km	ÁqåµìX¥yiûó¦Ì~páI¦&¼BÞk=My;,°øð«¢ð|Í"7±ùÒ;ö¸Z8ô×ÖeÁ¡OìTÆüÝPNTG£GÛÄ.£aØLÊ!©g/2âCWÿ&;,:EçM÷ØëªÔIV~}D'±;È)³ïB÷u~&%¯¶LLç×Åéàüøü>Ý,Ù Àob=M´Ýwî´º3ÌÛÔC/ÇûÑD¾îV¿ïf|ÈÄ»Ì¸M|ÓÌ¢ÍiUEìôYøJÃ«ILÌ8õ;ÐFÔØlL.öþ¨7ý¹¥~h	L®EU¨KÏ'#S§"]ô}ë-ç"
0îCm hwÛFüJãG;MÏdÐDíÇ
BºggíÒáVtgûGà$ën¼Ãë4Ïn<xÏåÎ½}ù<|©k|y=MÏì§·}9B~Jj|ù¤g­üXMVx9é¶þÐBÇ/¶(ÚE¤'¦{üi-Â÷ãí4èGýS¾xÙ<ùóiC'_UÖ¥/rÇ&-©uÐJI"íô&éÓ½XV?½AN]ÿ:¤èä°wJ¯ÖÓAû=}G%VÿnBºyúÑ¸lNÚ3Î1ÎàòÝçsæ3ôÌÛÒ¸¦)ðLÑ1»©øTuáª^þMê#õmrÝÿ°³ÜÜç¶«WÒõÔÚñÅÝ·2×øDº	D\¸ÏGòÁ³§¨ïzõT2¢Z
:ãÿ>ÎÐ{H!Çek¯KXÝD°GúF@âé«<È	yFÖ<¡¡C%?<jLtt?Ì»eE=}µ=}tTH°j²0ÂÔ,¢!áa»Í³e×zHºß¦òÕ¶X]ÉÙgecãMÍt49xxù}ô+¯:3ÉµùÄV·®wU2Lª'n·è!DA>G+Ù! »4Ç+I7s³DÔqBü³$8ÒnêszÒÊd%â_X½¢Ççe]äFy§n<ï*¹Ï¦\Ïü:s¥2Ú/´¯s«E<ù·Ä,ðÖéxKGB3$R¡Ò.>±)ùÎ£X;*ÉÒÎÄö&Þ
=Müá{nêëÒÞ\Þ)ØÊ\iAXµ&Z¿AU¡&z[3ÂLyWÿÏ+ØEeCì5÷¥*yßnvc)ÂHmÍ	ìNäj¯yãí$!<ß§Ì·*¸ºqÌ,Ä|I8 C3§ÂÉýo×ísê¢µ.Z¼T­¶E-J·"BáwÙêðÀµþÙR®Ä|³Å$í
L×½x-±ÅÌÉöÐ{ª?±¥ý²õyqÙÂæñËwè%´ÓU×Á°""4ÂÅújã½*%gÜÜ²¢ç¿µÂ"au¶ïZZÛ	ÕÈ(Ð·Aú¶­=MûjÕµ°Î"³Ä¸³A]6jèÆL7bÿÜû±>®É¦ÍÛÕÏ&õ§z±4äRå=MiÉ}:@@ê¬Ú<v_¼úÞÁÛ<ÉäãÖg;èýo"Ä³v/Mä·²ÞNì'UmÈê2ã\Þc­à?æft(íÇc¢ìÑJ:îå­$4øÎ)Ìlà¾7ß857rgRK[=}jã/57¡Ë¬x¿ïÜ{¤§'t»,Û¾ç5Öønºý|pK´ç4¸§Øv5"Ð¦f4.eÃÊ1SÌo8ÊðÚ£L¿ì-Ö%¥ßÁ¡"§]ø?iØø¸c;ÂÓmöìMí\9gÒ^ÀB!Þ8Ü@o´=Mf@¿ïë{èW¿qÅ^~=M&ó£¦
fîm# "8¸ï òÃµPÞr?½Ñ2È$F_æÏ%xÜR^í_M{ç)®AÁ~¹ðÑ;cN;ÞA9 é¨Xe=}<©ú°é´¯=M¤íJ´¬È·éM3@Ôb«=MÆÀ§e~&.¤¥-¯{\ßÂ×6|Ñ]ékFAªÆ>4,'QÕEXÇö#»Û¤öÁUå¸l+P
tCÃÎßæW»áMF]Öa¦0ärT(»ãuË!TPcFuKÁZcK¢ê&æ­Øx h©Ê;°hmgCü¶qßgbÝ'%1\î{JP@µ9åL)åÑÐªA"Ð:RmzÛUÞwcjV (ÍkðÈÆ<[êª%axn^ê;/n ª+çVnÏ<ÿYÿR.õÝ¡Ä=}¡D=M_âêH£8[â$õçÑTÐ~f8}¡®~ëï@UY/0Òtm¶ÿÅ:X<Zäá'Ñ'®î*g±LÝb1ÝB²óXRwµUÒØ§ZÀ![|,¾LëGCÒ5LtnÇ#KtN¬,&&Þxôýå©c\1'kOJ\Ñs9®#+s{Gü!ELläIþ¥O©y¸óØvc2ñM|Â<3Q8= ò3PÏa(xñæÞá8ÿðêã/CÒ_´Ôoû'PS&exÞ ß/ë8Öe6z÷<eGN½">+)h¼ØyÖZ)7âÞ>ÃXëØ9RÊ¶eA>6×mæ¡µr?fÌ¡rÚÏjïÏÇÙmÿ§%DË°é¯$-7A3q?Ï _:{ta¸dß¿ÃÿY­ì	¯à¹B­x® à5øñ]jEZÁHDuìþåañPvÒ¾Í;Ðô}ßáDÐÉÜn}/h¼T|Ù­q¬ë§WQ×zg¥"Dy&ö¤¢CÔÒgó&Á£t,%Dô,~Ut±ÁtSd'$Àì1sô>é¡3N'ØI~k+ò§ê¥"H§Ñwå±o.Q~K¤×W@Uao+\[x9JaôcNC¼0cÚoSZ$K¶Wpò[pÃv?%2Õïv7;¦ÍÆä&÷£>_iFö¦£ÜÜâ¥#Ã-³\~åf-\±ëâVõÌýÛgw<þA ¼â?ãîÑ,F%#Ò3ÍH4'CÎÚdÝîWîqøÁ^b«nåZenw>"VA4[vþD$3Á¸Tu:\j¥ Clzzê¾§s ÖIfy&è:päæ!Hp"{naë$Ð_×}_BAøKxXqq!70JLK"YÚîêwgóPF²òÕ>h#ã?@8'·ÐP.ÛXö¾&xx÷GÙ¾d+qÐ[Üq*4_4^"ß "6kP+[àGQÃÎ\l.CZï´Äj¤J<èm "¿É0ÊQÿ©çÜ<Ü©'ñSÇÑÕ£f¢ª.  c³ÚþáW¬¼<ÙzKY=M:Í*¢©ß´6ÆÒÚ=M/&ñð³X¾ýíµÈ¸ùã£P%æÿ?CãëÓ±\VâjÓC©ìûYq³®ÀÞ.§Ü|ÙNÿð¶Ülo?Þ¢ê]mXì¥ËîHAÇü×dÁÙ¸>ÔxZÙX4Oª¬@'£UeÏn²ºgÑÃËB'Ø£U·æY| ã¿Ý3"­×<gw@RÝÐ»àÛ4Z{ÓV ]TäHO¡ëöåhT<íùËkkfeå¸þs*?S®<ÜX}IsÖÀÕq´Í*h!!»	h^»@xùÇÁËªvÖ<h«Igæ¹oK+%|°¡+=MË0ß¥ij
¶!dë·B=M¥À>Òü¸ê=MCp£Ô"²T¿¸æ¸bó$Th¿doÒÌ»èÏ§+ÁI©uEHøçÃÞB(úq^sÃ-¢ ûj×ÿéuÈîûîãÏ°JmÛ¶bá³ðr5rM6­"®Iw®E¯ öOLyAáÝßA³ìnn^í«C°ÐAØïá/??¸YÛt®ï
"/ñX}´åæA´¿årKÁh~½íÁ'æ Qªì_l¢(?Ê,W|èû#^ B©ßd^!¤ëÞ^SoD[[@ªOz¸÷\oï5@5h"fYdM_ÂÝi)»^B@ª·ÚSwæÚ"£vV.ÐÒ®B® vIõ®°=M%1îÐy°gOÛ$|	ãí}JÎÎy7£V{,G7£¦±Èz¸Q×æÅÕ!7ßHBÂá®»_APqH']#sØz0:mÎàQ¹£({PJZÉàÜ~²zñÚ¹wæ"=M¾g>íH<szñØ­{fÊ­ËÌg'^­èÓÏëó;û0EævZX¯û1i/&É@ Ãúâ9BÆD6%õÆ¬~5bÓûQò|ó5µ(ÊµN"ã´Pjwêíþ,¨s)Ë´H¦}µAÅ\j»pÑÜ¬dEW¿Hµ"±Gj%j­µú©¿%kµî/Z²µö-uUÃµ¹ýrv
ÒÄØúp;µÉ¥ì*?ó¤[û
ÌSí¸]´õ¶f$Ôµ>ëêw½«´YÌD³©õct+ÅLMþÈÅCÃýx8­&[ñ"ÆäìÎ]#%ýI[(»CKÂ÷ìE!"*·&=Mé!æÖúÅ¼VTøU²&N^Â¡æì?ÝäV×yÏÆ]ñÑèFq¾0»ôÉ+%ÞÿHÊ'ó½¢-¡.wiÏ(FIÚq´.¿¶è-sD<;¨\øîQ|1@zê(­Ò®ýLºOó3Ð=}Ñ¢.qgëûGDhKãE4ÜM"ElÐvÓO)y7ÈÜÿ)¯7²¨ô371¸Ü®õ3Ã-õSFÖ .àíJ³	üÖÄ"@üQÃ^ªQÒÎ?V£Ê3GIû²¢!®¹©2±meuê2SjÑèôbHAyÕ6³Ñïÿ4+¨!»gÚ³eÎõÆÔ±P<³º8µ!ï_©}ÍtüÚ-¼ú;½!íÊ2¤Ûe÷ý,Ð×°0=}EâûõóâíÖóøY.Õ7ßZ¼hÐ-/ÖîDO¿u!COS6JÊ±RI~Ç-@H~Éo!]×ùðDå}<sÞpúïÃXpÛãbÆ+¸]~×ÈVcááÙÉQo¥Û%ÌxÛë/ºÒ&6°\°hÇHQ!K1!üeÒÇmfÑF¶wÊÿ$Ò¼Gbz ¯Ëc8Ôd<#.éCY ïi/ToZ/ÊQÑZV»*ûQ§¸wúKV}D¹]-\MÿÞFy{ûMA>Ø5a
m=}(Öón1Èmî}Å4ô%h!yÐ;÷õ9Ü.ÿ¿îÃ"òÖÞxúfÖ¼þ×á®åÎìLÙù©sü!è#Ï¸³Wýû0¯Uf^ÖB²íû¼R§ë_äR«îâWCÎ-âßÿÝ#B;ÜYa=MNPæ#s§±=}t!	LÔf-<õwÞuÎooþ<NT_Á=}RÛ; ëK­WÈ·Q¥/+¯êîoNõH¾Üÿ5rxÚµ©|@rA·ÑL¢IÎé¤H20béÁ;©O¿®ðfóÈT¢êÜÑDª­Ý»9¸,A h±¥ÇðX¶ÂÆ Ä½BÐSÅW= éCÖè)6r¯ËtëJXèEÎÌrv+0ËÂÊð{7+Îëá;<øÕOü@¦[E/¥=M{ús©-|üú\²¼ù¿¬D*Ö#Ò·*viòÍ­Â"õMuÜ;ëqY=MðÔwÿ¦ÈÁ§V?ínÈ¬w×ÚÒÁ§£ìSM)*ï|=}ó1·Ñ´Ïá½¼oÕ Õ¸´Fâõ{Jê.õLèèD$]&­)ñÿf!0å}ÜçHklyã0þ,ï-ýYÄ<×ÓBIHÁN,õRHR,éºkÀ3éCö"!ñÇ^ ß§W»ëVîT±Î"GnÛm5ó|ÊªMÉ;{éûMÙÖ(¬4GCg°OÇ§,ãèÃí!q|nI®/y'5	¿á£ü÷Oã¸»ûX¡V æ5³¯#«®ÿ¥£Ìd@ö«>¶àÁ6¬IÝi=MÉFjþK*§·ãQÍ·Î)f½¶üvâîµö¼NrêB¹öTÿÞkÅOÝßd,hïäWukÎ©ëâõe_& ÎåõÚW ¨Ca7gx2+ìO~!?ô
ÿÀÏíiUo&Á÷i¾ê'C»&\q]b_ËÅ,ói 3èú9yÃ(ñ¥éøÁ¨W
4­À&W(o3G©%gÔÊ4C³Udl3C6y¸E7ù¦º¹h\+úJ+ÆïXs´#ºçBÏ~N4ÖÄÈÉ.«}yT	= Õ ¡²\NÉ-]¼É/Õ¡ÀL<þn÷Ñ©~¿¹î!¡ÍIb­Í8·Yk½:Á°[H%ÉÅ5ØG! úßv¬7 '2Ú¤(Hèfü·GpUþ<êÞ	-Xo	Ð9mFçÒ^[vÜÛ¼&egðS×e'í²PðüØÇòìúÊÊTº*RµÁ¡Ì«nü5ì³§»Ñà¿¾-±GFäß¸?«ãõßKp)½Ê§ó¡ÊP¦Ë¶=M¦]~[{];Ð;#ª3Ê+<ÿøò1ö;Ê+pz8î«ß®ÛJ9\à×·ÍI½äV:<pí}Û¶aæN(¤Ü\M
#ç{S Z­çÎÁ!Y®|ÚwösÕ¹Ù{²û.LÑs!QýÉØ}Ó6KT ¶Õ3Ç)tÇKSCW8Ü à[·Áµo£^þóè(æWØmI qmg¢ÇÃvà¾ömBÔëi5tÑ°E\ò'¨ÝÂ*»O~BKÔÞëo;fÑwA^FÔ¾~ã¥®vTx~e/7v<ÆyéM
|yµ½XlV¹2SZ­Ô2ÂF{ÈhB&A7 E2õcTãTÑ·Vì»ã=MR$ÛËvÌïÿC1ß= ¾ÄÕïZ¹UAGßÜ*AîC 9ö;&ZÀÍáÿS:8ó0ýÙgo§Ï~~Øp-×Lx3Y¶Vüuw^VÔª5|)Ì:Ñ@L{»/á#BXp§ÎRºã2Ð§6½îi®,¾âDm®?sÓüXËv*<üIÀmç]ý	ÝrÚ¶S ×ôìÐÁ!È¼kÒ_\Á¸ºO"^Ac1Ëôò/_T¡ëªº« GjÏIåL!oýÑ*g=M^9ÁÍÊoþN5mslÚ2Áµw.J):psHgWJ·Ý\[>ósÕ7
w»mÏïÓÛ1ÌËËX¼L%èö¸ü3ëÑÅ ¿ÕÌp=MçÒ(?Í-Bë%I·Iô&ßÒEàeI¢£3ís%=}þÎ4ôs3Ç1Ñ$½1?íÃÜÏésÁÎ<ûsl³<¸ÆÜ®ü_M&k®è®:rO¿>V¨]Üz1O¢1Û$.o&ë£û_Ký[ê'_K;i¹ð$'fZ"ºB%ÊÂHÓéMzj/té³Ò~«3ªzC­ôÈÏ«J»QÕúTßF.aÇKBÃ;sÃÌÏýÍ&YRÅu\íÔýW&-ZÕ]Í§õ4=MÛJ·µ×ýwNé;ÃTÇ}½Sw­÷ãÚËLÒF*ýÏ\ejvL@HDLBÊôÇNYkw¹gí¨û5·÷%22Dªí²µY=MÔ?Oå'×êÒÅ_"¼Vî.ïÎØ#N,³£¦%è·W:¡F(³0stó¦-Ú9£­úJçU1ÞjøZÈ´
±ìó1ýW°ÃÛ±\&Ã)B%æü{]öÇ_ÅÂ2åaT]V&×3ðËôS=}^:Ø]^]i½ÛPøÉ¸¿Öù¤9(¸^^Õ=}JKÚî·ÐóZZ-´ÆÊ²=}©¤äf²ÜVËbUëÍUì¼ß*~QYaÝü?£ÄÁO¼ýIF¡Zàå{UEÊ_qÝ]¦ð2ö&¶.«¾nIÞdÊA²ÆzÉ·õû;f;	J4ØVq¨KHêP«Ì=Muv¯[±<»ßÕ¼îÞ9ñë¬~{»P9EÁtÎæ¸]î¡{DoGß­ìË¶æxÌùV°¤jxÂ¾­ÒéHe=M¥7E±î<úþúMÍ,ÓQ@3S$\ªÜGåÆ}ôP-º±¼´ïË5¦ÓØK2WÜîj"=M¢|CûP¤ÿ "x&¸"ìÛÂøpëqóp»ÂnwÁ®&<dffëdód{ãñ !¬À¡Âä6Æ%z6*¸ÁMÊohÛ¡8séLqÃlLù$>Vð÷ìL=M ~»7äÇL y.â1òÊ1¯
¿ýåz.¢=}.¢%±ÇB
°S°Sâã!Ák%e®!­ê»ýåºçk]<\»:§>ÂYéÈÚúCû<s	X1ÏM_ØØÖp»þq
c¿ÜÇ¬~V5öÞ
_ÿºO¯U_¶^Hû®ü<ùæZÖÂF2*ÿê¿s=M{Òûê6óÜ0Æ= _6X5_³Qß
µA= jØ«8CPØCqØ6ß^ENÑÀyJUÑ-ô>Ú&û>VÚ°³>¶{¾>L¥µ¦Ls9ª9J&ZX
^Ú3í*D®RÎuaZpJ7«µo^ £ÚÛ-ÏÞ~LSª[Ìÿ·ÓªÓ*8^5Ø²¢Å»g·7á?6¿Ýð4ìùöNÈ|s:ë%1ÆÑ«KÁcC©íÿÎP¼ýlºáQ&7MÁFã«Rè(ñ·JAÕ{Í?üî6Ù<h4Y½¶4JyÅI¢»D ¶UVL%yné]V\SHì­Ø*](VÞ>W¥cñÈêEïîjõMÑ$3XÐú·ÂâFa=M12]¢¥ºO²ãþ£w¬(YÖ®ÎüÙìu¢#A0{-_Â×|ß8IÊfÊ^6¢\Î «Þì|	ÒFo*×©ÔISßLníÑá6È^·4L¹ªÖ\MãxúßÜùBÆ×ÏÊh½}éüY÷·+&×+×°H)óúg'Óî.Û=M[Å»úß"¦VE3(=}ã úÂ²*r´ï^kYGÄq¡·»¡#_|'¡@¼£{¢_NBâÇeöTeÚY=MZ/&52az3sºY-O=M9%ez]ºS¯«Ì§U&GF050Ì-ÿùp«@wÊ¢ßá)»zÝ°ÍHÃÞHöF.ÿk<q] -ë[ú_£ü/ç¦Wã¶Ë^lÍéU{-<fº|~¥SßÙ= =M¼NçiåË^<¬t¿iXa\àFÓø¬i¾Ô¿SGw-ïoVtÏ ÷/Ê^ûêP&wUgÔUîF½Áû¸oâ¹joY-C:ÕãÕh\/D-?¢v:ÇI¬i0[:0Û-![ã|¿:ëÂ¬Ù,	YA=}NK_#C#KÈ^[û.*q¡¼gÄ[CæF¿$áüGPÕÕ@_ à;èçQç1\³¢pEs£	|µú%U¨S¯¯,q]±¥Øé¢PúSá¾Ë¼c¿BnYoØ4öý¶&ÒjÜ½§Ø-ÕÔ³*Ô.ùO"/m¼¥S~¬Ó[~sù@¿J È^oÙÜí×ÿ».Ø}-O±gG¿ôæ. Öä·4\GÖEÞÛPkDáÞ-ßÇâq32"n(µq§SOÕH­òV*ÄD
zø·S¿z1èÚ,Ôõê= ý­¶2Ó»lõ¤J	6Y«§ÐqC$¶D
Sîª-¿ bO8³óS·õ'É^öÿ-wÒçÐÓD
;PúßÉÑåyåÄ¿D
Yw-?Òßaß	uí¡
æÓ4\gã)D~áð¼þ5^§¸ÀöââG¤SÿÛZ¼ö}I#¡xÓG!Y¢g* gð:@4\c0wìíI6±mÜ/®îÆ¿«[O»62 0TF:zºÇ­ûòÚ1Ev2ýCHeó(·îÉ¿¢¿ú¿=MN¡ÓÏ!?â*ßTso<%3®ìÖ¿,:vÎè×g¬â¬Ãû}z2£·D´ÖX;|ëz/[1XÇvD%®ÜHÐê°[æTkNw´+¿äÏÿ@= @@= ´Óhhì
E¶ -ä¹²]"Qsã\]s	"îqÎ58Õ^sÏWp½Gv%aÍÌ	Í$_:Í¦w-µÍ;MÏÿ:ÖÃ;®6û^=MÕûÄ(ÁÙ¤l½]y(ìOLr¥Ýíùè>V:ß¶T;ä[(Ö3_TýìL¸.<³C§ºÞ²·éÅÒjöÒÿ¯í<zä&¶¢¦+:(oûÞ®AÞz	ª|9|äiæëÝQK-t,3í!uhj«}Bg{Ð)ÐhTvBÎ3£åK;D0øhA'ÜÎis£/¦ëZürÆ¡°-U%öA	|]{¦4rµ[VµP©æ{vÀCtD¬HçO.î¸Gê[	Ïj¯ò"Ý¢Û¯àÉÞ×ì9Äê³c[Î·t=MFÀ<RHúIW4ÉjxôÀ	&Ìºz«TÜß}ÜOZ´Û]njÜL!»ør¶Ù 4°4·ðbÅÂùá}~@1m)¹=}ÏBÝàb?êÑÔKl4?|=}]¼ñ0­TÊ0²NNÒ¡ì¾Ç È|"w¨2ò¥JûÑ×*÷C)urýÇÀ³!¸)¼ òòÈW
5Å'mã°=MòioÎ­Rv&N>¤ýÞÔÏ³û®ÕK«ç¢ªi&=}r.)¨Go=}ºû3°¥vWÕïi³ÌKðÏ>pRq¶±T%+»v=M1È"
]ÖM¢ºÔ£ºBüêþTûH<sk,gWüËÉ¢÷c:ÛoyQø¸¨MI;ümö[KQÅ|©¬~¦ðý8äùÝø!e<mg80X¿4;SIß,õcX	3ôÒ÷=M	¯O'	É LO®vqkOì-GÞíâ¹Ý¶ó¸Þ¶ÓÛúÝnµÒ·ìÍ¥­ºÃ³ßòW¶½6ZÈËöÎÛó=MB> }ÝÜþ§äñÑøaÛ;ñ	ÊÖ7¹1ñÏ#Ññ4Aâq»r0ñ}^åõ&5Ø?ì®ÔÜs­>~­Iwìy;9éÕïù*w4XÛ.4¢ùfïÏs6%-ù¥êåÅ>k5ZùH%²GmÌ-¶ÇF_ÂzË¿±E_£íD	ÐÑrWw#>pã}GÃ»@xº3I¯5Ð§õrFw'ý}"f¿³ÈüBOÇ°>¶æã§GAQâéØx1s%ºö0xVç¸õC·l~:]3|ß^îÐçe¬¹ &mW0'ÇôÄ=M#
¼_´ngEyó9=MÉT%@vm{ò ?99½ùNN31¬g=MËTò«+Ãc&"fá¡ßøãÍùg©öîCïË{#»;½õ_?:=M=}½Í;MMÞ¼;6xÝõÑ±¹GÙá£¤Üº?. âß6¾	¹=Mñ²Óµ¥ðÂyÈ)>æ!ío¡{¶÷ªå(j9Þ´\FXxö_B=M2øBJÐ§Ö+KêG÷p¿AÏæú{Æ	=Ms54bñÊ²éÊ_­)»&7ÂÈE*jÌ\.ÝÖ«ÝÌéÚÀ	Ã"Î¸l§òçy«âgz×«Ó÷	Ï5·lÆ?ÚÄÓ­Ä¯jÁâ
³r§fÿ>¯9è?¸yO³7)L=}FêÌÀ%#êAÆoúßhmÈùíî'înÇu·m~[Z3a?.´9aßøëRË¸EÌmµ#^ëÉÚRÌJÿÛbY5Ï­7ê2×Çæm¦G6N;WòM1ÈÚE¼ÖªdïØ¦Ã<¾|DGùæí Vã7òÌÈÝMÛ¬Kâ~;N3TrKÈ6í,0:Bîv'«CºòÈÛt¯OÖ>ÄfÑÆ_º Q*öÈöIì¹Õg ,¬­z
g0kËU¥CÑ#°ÓxG²÷Û£°ÄMì}Më±q8vÞ×4^ÆÒWl&=M¸¥# ê=}OD±bÝQMç¤ì£ád{þÐ%~ë6ôêè'=MùÜ)#qñÆÖ3êgÍ¨ÈãÚ££A	|Åøl7Ïáæ××ôQEÒáC³)'7¶|ûbNOE[ä.Éºð,î[ÎÓuý¦o¨¿Ãß)±^',î®3:dîwéZZÄ]Ißùç÷B}2¿S(@8ÓHÍæø³Ì¢ò^º±]éÎN.É"¶=}Þ=}=}Ã½âüÏ]#Õ¾oûïZç¶DwåæÁ¹º×Êé^Äu[o¥ã|/f &î~òH¡ÀÑWäÀH¡¿<«xé^ýæÃ]C¡Æým!JGáòH­×ÉØÚ=}êï§Ãð[Ñ¥¨Ç@0´#¾Ï>Nî£U¿Ã1SDX°ìÃæÖÌÚ;éÎ.Q3îIz00Ïä©TÜüEØÁEC¶3Ú0wîïÒ}G¸þCQ¢óH?ÓdÒtÝ#Si§Wg1ïêOýÃðøþ$!ZÂ§®ýøù¾©×=}Z£M6Õ3õ4Åú¤¯tËÕ÷ÕgÔ»­XÇ7Qã«WÝ¸ý65úªg?è Lø+­r_¤Ï
Jê<.½Ìë2*®9ÀpY¸Jmü3÷Öj]AùÚW©LIæ4TJÌ:òí<ê}ó¤×Üýe4TªÁÞ,Ô¼ÞÒ@Gå7>×¢mªÍ7þ®XV÷¤ß»^SvVÓa+Ûp5BéÞÍ{{SòÕÿ­=MZk÷_	Û*Õ½ÆµÖt«ÿÍ©¼é^Ì:¹=}~«ÕÔÅoõ¤×ÊÃó>¾·þ_~ÌC*l×5'ô¶«^¢EAs4èø¹òHco±Êµ=}T[Zí¯6Ï©T1¼t-õÍFSÛÎ±~Fé^HQ¬«q÷çö$=}ÅôYû{?ó39,^ùÝ#­öôÛþi6Ô£¬J;â*DÀØÀöö"öô¼"6
z_RL4.
Öô¢Ó."%ú1OÍþ
æ_WSM0¿|ÆrgADhÜ·~³ÿÓSºNØ,¾tïuã=MX²¸#Y&|1I³ùÄ³ü	§2aî­ù²öG/ßÃßOÖ)æéCBØÈáHÉWõ^(^]>ÿ+Âm=Mþ¹ñÒ~ÃSù¤o-Az qÚ¸£GzR¨¹O_å]=MµHGÝýH¡\ªúDÞâF:L29Æø$nÎ]õå±®ço}1¢rÝä=Mf»ÝrRHjZ}'WÿñB×^Ç-ÑîêBÃ/4¶üíN$&'Æì»N¡íÃOU»¿/_mbiZLKÁð=M#R.¼$YW¤_?Ùòee¡c°Àe%èôc¡ÉêI¢x¬ùÔ÷8nÇSÍ!q½	eØè7,aq¼	ð¨=M>h"®ðÉPðr°Ì7nOhÍ%ÝÛqþ°çgÊP®ÔE'Ý´3|N³ÂiW>fM E.Iök1Ý@³ú>+U@Zí¦ß~x|z¦ûÎ?ÛÏ¾®·¶×W66OØXHQó{/þÏÎø_WY+'¯3k%CE#]ãQ!hµuãÅó)B×  ;ñ®}3T.þËeG\ëpl¿=M¦7 £I$ÂúÊ88auCsóû;gËÛKåæÇ/¿,,.U|}G¶WßXÃÎpjÉ²Í½VßN?VÍ+Ü§Ð%Ö3®J­yîÅ}ìÌ3<OÛæ£EÛN·öFr­(ìbHY=}Ð×¹bNr2±9g~Áw°Ñ¸bòAwøÔþ·ÏæùTTP¥ÜÎ°ª£@×É­Xµ{±KL&/2èKÚç1$U±Üã«~¼¹UzfãKÈCm\»ÎTd½Üºs­´ÜóVVQQÚfõzèz­¬uÛºKH¥739ï¥ÏgFs³<ëþ#ºãó¸sÏÂ1j6%8ÈRÎpG3+È8öäÑ«>ë;SQÄ<ùäõÕL('¯Û8õäGX# x= = = = ¤{;69ª¸^T'øç/ÏQ.ÌP)ÓS[V/c|(£|,ü*Ãü.s¼)³¼-<+Ó</k(«,Ï=M¬Ôè=MÍû/ÛF:Í;¾;ÍÙÍÛÍÃ:ÎÓY­ÌÆÇÝÍLÃÄÁ@ ÃÃBÅÅDÇÇFÉÉHËËJ
ÍÍLÏÏNÎ./¥¿ÞGÕã>#2Ûå>j¨yÿã)Ä-oðGâ½ÔÏÒ¸««©CWTÒ$+T>¯ñ­LãT^ðÝÄ«§óíIßEãÖ[$·¹¸¤DkWDÐÑYøXD$+"Os£Ñ¢ÒÙ#®*ïí
ô= k#6ÈØÀM^´¸ôÇw¸wÂ3ø[£yæ<Á´å}ËÀvß5BâÆ}Dº^¿ãËí5Ø j	¦uÐé%ÃÅ¥¨=}õïsÅ9Èï«§
«Æ-ë#FñèsìÜQ-77P9©TB~\Ènÿï÷çDö[ÐMmLç7¢;E«O)ðçbÝEo_üßÛÃM3Ç7-Úü5µ2	Ô×AÀÚ ll%éã{%ÈIWBY¥s'ìX íz~ñÖé|»¦M/Ï[#Ô@@eU¹Â¾Õóô\¡I«7uïÿ¦6¾{ÀÀØºUÜÚðrç@tµQY©ÃúÃx÷4G0BVç©)xÚ3áÃoHõ´ÍZÇ«]OW
7V%²QdG>]DòÈEà?QÇ~~|¿ÖÛX#dgV§!>~£Ó³Àõ÷áü|üójÀÒ
x^öAñ$jXg·ÁÙmv¾5¢ãþK½%ý:þK4ÚF±Yfù·A(JZ;/BM2]h>èu>ëKQrZê~¢Z[®X$h¯ÔW+Sþ@l»×å¼¬®.MõæZáA²Á	@MÚ®øð$Bwï×Wë£ìèÙH2SØé¶Ù6666·WOÇÕ?R^´WmOP²X?ÚËÌ/þ<oü+x@G\³LMÄ¿mü'°P7yÃ\Û&[O"ÏáY!\ÀÞT.\FV=M¼'X|ø+SyæB:= è"HþAe0&t××ñù2èál××GÒãS}7{Ý>HW&àf4­n¨v#ÅxQñ:nÃêrìÛ3ØíüØ÷º))»É¢®µÀ:{Gj3¬ãü]òÆ]¼cF¿uS2Üé¼!öLíuÒ¹¶Á-û6zDZï8 Æå=M[È6o4L:éÂµ\p_øcØD = å³ÿÍ;ÆFýÍ;Z°­Ç;Í;Í;8ÆÏ¾Z^GúúÎFFP(?B-Gp¹ÂBÙAÜÈMºFá-Ë« F$0[ñ®%À¿ºsÜ¼4ÌYÁkÞïØßÀ4>\ EUªTÑW¥OÇpw¾.U¹öÔÇ÷Äl/fQw^ßmQ/Ã7Ô7Ë~-È7UÕ#çÀ)ïÆPmØ>Ô°f®÷|»÷¯S%8³¤/öcr$QFü7t9Ý½XåxT¿5wï&õ¤BòJÚtêº($§V<BÐùÌ<ÏñYÏñ¾ïÛÇsIø4|&sôtýßÉ¹¢v÷uoõZ©ýiúÞl^ÞIëX¬Å°G]Ñ¥(¿*ýþ«/D/ÄnM«½-úý1$EÂXºB½ D±¿5RðFÊKïÆ*_¶¥gÊ6§wÕíáù"OµaïZHÇ=}¼K´Z³Ë5íËuÝ+=M¹¦¾sù¯åµ[V®ÖD±]ÜicÖºMïa?©ùM3Í½øfEVnÒïZHSÛdÊÌa×²&-KåÒ­¬«A®(Z)\vÔ4lsçµ¤D°kR]¨3RïÞVE"PU¸nÆY}P=MåG­ÛD±]ÄÞL+U.<ÇÒéu¹g§I¥¿&ò§ÝTóYL_§)Æ=}_;º®)Z)\8wVSþjÊ6]ÿ×Üî%ÛáJÓ\ÄÞLk[Y©¯v¹IKãÆ½_ÿ{¤êfñ¶Fp+aöC°³·è%-ýFx¼= åêIJJê¢°è¶I7Ù©^·@M0ÞÙ¿<¯,º»ÈßÚËTLïÿ./Ý1Ë)ºï0ÚYúG¬/^XI\<wÅ­6å6'ÓÇß\ÔÞZË½]Ø¯/^XI\T±/ºJØ¯/^X	ç²=MºW×êþ]½HRÍ5Xq¥/^þ²Iµ70Y¡/^E®+ìTæUZÇÍ?7EWE\V·«N+gDæ\ðRdGQwwQj§ÏYDå<ðÒ¤þ@^B¾AèWDäð{R£ßÙâSXëëØå>ÜðsR¢Î(o]Ei.CBuîØ?R¡®(kÁÞ]Ei.CBuîØ?R¡®(kÁÞ]Ei.CBuîØ?R¡®(k^ø¿ßÙâSXëëØå>ÜðsRâF7¿þ@^B¾1PEãü@ß,!Ù\%¥AÝ+g!ß^ø¿ßÙâSXëëØ¥#[öo.÷_\^RdGQwwQêæWü_YÃÞ]Ei.CBumO;]Ñ\GïYU÷ï¨c§ÏW'YRÿF7¿þ@^mO;]Ñ\GïYU÷ï/©#[Ößü_YÃÞ]=}qü'?«2P]FÜY/SK¯ÐÞz>ýµ\GïYU×Þ_z6X­QÿF7?YA\=MÈ^S'\ZSvG¥£Eü@ïYUG.ïÒ®P'\ZW¦£YGåYUO1°,_îSíæ
¹T3âI½¾ü(Ü_/ÃýYïH®.Û×v«¿ßg)jÇ0¦6ûôÆ6çËO!K¦>:Í;µ¦ÖÌ;©»	Ú[NË|_U5W¨I$0 ÊEE;3^Þ¾})d7òTWjîRÈgÙÐ§gH2(lÙðÓ·R_¦)©­[=}®Õö9
È>ÑzñNµÜ'îËN2Ö¾Ò(&ç	Õ(C\Tþ¢ÄD Ê5ÍIÑÛ§ä.kÏ²Db/ûÝyõ?Ë5¢>ªðJ.¬RýM	Ê9®Ñú)Û5JQoP¦*A?ãD9DJãñYÇy«tÆuò3H¯%LI*5ùûÿ¹Thþ(·×QNF/Éï½¯ßZÚÒBWQÂó\DVt_<T¹5CQlÆßPðïÇ(+Â¨-rvßÑl«LOÙÕZ+3®Ý±Lf~R/­×4óöK)ÿ5óMûÉÜ<]qì*¹Q9K3YK%>@Z´NÇ\Yëùfø	MÁ&ùOX%ovs1çò6N«3\PdD£ÿ8Y9-Z2|8¯mþ^¤óØ^VÖ7=Mþ©Xe~R¯LG+Dù,ñçøCÆ¬>ºì·üX=M9«V^·Øi~R¯Lg¿¾ÙÀÛÚ3
U&ÔÆBSöËMDs!Ç!£Té]@k?=}BM4ßùÞ^À1X=}îß§]$ït/^@Z$ÞPeÞ^I±ò¼(x3ÞIOÖBæ«= oY0VãPÓ÷'4¬vëZñEáQ)jÞ-uOz £Té]@k\LW«#
Òì-;LX&ïQîbD£ÿ8o /jÿk¬r37dZ	[ÜÃ"OØa~R¯Lg¿@Gï²î
ÙéÊß5Z½gÍCyöØb~R¯Lg¿@/s'ô$´gºãGK¿/Õm«aoY0VãPÓ¯YmµZ
º	ÏK1eöÿi~R¯Lg¿@G¤¶â)áZOËÔU^ÁÊàçÜHs[!wX)SP{*ÏRLZöÒÝ·ái~R¯Lg¿@Ç@¨¿ö¥Ùþ8ÿÒ ÌSÝCºø±}D£ÿ8o / \æ¦gz;\&¶ÔMÑ&doY0VãPóÓ"5vÚdëR~?·¶ZzØ(çÜáÿüs§Ymí^\&¶ÆvÁâçÜHs[!wX¹K0ùvÆrë\g±.éÑî÷±uD£ÿ8o /ºÿæn/1P~é¦*\&²æxsD£ÿ8o ¯.É'¢¯Ø|¤6XÞÔþK&XeD£ÿ8o ¯.Éø±ÑXí-Ï8Ê&doY0VãP+Ã­Êî×ª$A£9A1Î¦Ã@]/²}ua= ãluµ_&V#Ø¼mT¸géWI3_9w[)\ sÜ!{\!ÜâSXëëØåNûØâØãØä¯Ð~ßÑqÐ$ÝSc¯PeÏPçÜ!Ù\%¥"qW-o!w!RYdGQwwQj§<Pd¿PæYESi.CBuîÏÞ@i@mS+Gsü'¿¼$|Ñ?\ sÜS+Gsü'¿¼$|Ñ?\ sÜS+Gsü'¿¼$|Ñ?\ sZ7ïYESi.CBuîÏÞ@i]K'\RYdGQwwQj§<X¿]K'\RYdGQwwQj§<X¿]K'\RYdGQwwQj§<]QZ7ïYESi.CBuîÏ[CßUS+Gsü'¿¼$|Ñ?V'_J¿F÷/ïè·BMï_5Þ,ÿ¯Ð~ßÑqÐ$Ý;_ß]ø¿ÿ@^B¾Aè[^·_ZÜ!Ù\%¥"qWÍß\^UÃÞYÜâSXëëØåN;^X¿]K'\RYdGQwwQj§X'^X¿]K'\RYdGQww+Pï]QZ7ïYESi.Cö·A[CßUS+Gsü'¿¼$>A[CßUS+Gsü'¿¼D{>A[CßUS+Gsü'¿¼D{>A[CßUS+Gsü'¿þA{>A[CßUS+GóÒ##V'_J¿F÷/EÜØæÏØçßLï_5Þ,ÿ¯Ðþ¿ØæÏØçßLï_5Þ,ÿ¯Øå¿ØæÏØçßLï_5ß|YÜ"\"Ü#\#!cî3ëèÓå£âsN>}«×FÎ<áV.~9k_L?\ã¾?,Û?ÑÓÝNB= ÁjbÈò<=}=}ýbÐJ TªýÑWÄÎÏU·ä$Bé¬»ITh¡ha£³xÃJTZ ¢Óªa¤C©(ìe}Â$ª°íÎ½öZ'[ã" |éÒºÛ8[øÍÍÅë5ÆÏÐÄú[4y¬­%r+ÆzC[©¿­õ®_ì/µ¥ö¤!nË¹Õ ô©{7s¬  $bã¦ÌVýx¨èÔGN§ç=}]ýý~S8=}Ö×ÞU743UMS'×¿ßZXA]=}õõls#Ë·BO¢ÔÍ[7éM_oÍ^I¶Zç ÔCå0äk¾#Ö_ë½\N2E?+ºW;	m'Õ¹ð=}-:ÞõZLÞ+îÞÇíkÖ=MÄGöGÓ4Õæ4ô$°X/wjë¨u!KÇ¸èýìÒÖê4Ï§xÁÁzÝÎê&/YÑ]É¼uMÛü£&Ì14çiviuÎ3H6Þæ(xJ]ãnöð9¹WO{ÍâoßJÃ÷"(Ïb³}éw×'iJOUüªö§ñF¼82B¯Ý(É=}¶ÍÉÙK¸é³Ò­ÖíEû(HX7°tõ2;twZéôÛ°ã¾pI°»üÓµ±Öøº{]e{ÂU0ò%Ý>´Zù÷*ö²
úð#þþ%ðöýrolZ¸ù­åËFØí<à=MY¦ñs	à½îÿV4ºäú©,2©WMÌºÆüîî»i¾[ûîm»ñBÝc@ò\æ}sãÛ¤¯¶dI¬¢Ó4ÂV(ö¥>¬%çÂuzý¶92ºëÔA.ÝQ ò$¬Ã ¡&qD8ü¨~¥L³õÂ7&¼üñftÉÁÃËÕ>LIzi}~¸0æ<Òás ÷ÑÃ@Ð*O#þ®»-®@öý²Zú°T¤l¿ÀoÎÚ ´ ðÑÙÔ[õ¨uIôø-ú2µSìKíê%à}4¨ÓÍíLJÄ¸¬D£kß+Âb?]WuÜ['È»ùéÏË~GOöú ÇÊÚÿeÖÉ§ñDéüêæW ÌÌ¿Ã&õg¸!Â ¯Ö©ãóM¸tü#|ÈÌ±= %ú¦µJ¦)Í°x	.fü=Mð$ïRÙÃóoâÔR9
29ûe> ¨yºéVL3ºFH 0þ¦µä(2	Pv¹ôåà¿¼0¸p§¾ïcÐX-úoµ?«ø£wÄ³ÏËC3bÕ÷(ÑÆ%"6-=}7µcÓyMþã§©Sýìö%O		>{¥¨ÐQ@³'çn.Ñ%>ò¾(_ÔþwõPgÖI6+Ä<Vn¦¢¿2êó·º=}S¥"è+âeÏµÐEQÐÚÀ0¯%>.´üw;só;N±hS²ØiWl^iÅ	ê5÷ÆõxÒU}¡ÆÄ©#&û:åêôåÿ)ÉÄË*ðB<QLoê±lt	ÁÌö¸÷ü3'MspñD.û
ðtÛáMT}«ï;ÂÜ±}7\y]ÂAÉÇây*{oÆî¥¬mµÒºNë'í­æ
¨7÷ù15JÿÌÓHÛÎ_Ü=M:à9Õ«RK+YU§â,R^ýËSzfhù¼xñã±ÞÄÏzÉ f_.IHÊ!EGyÊá¯ùG¢õicd×#Ìº9ôç«7'NÔút¾+mvWæSSÎa-e6ãÅÊO§Ö2Ru¯/ àJ±VZüìó¤¾¾CåÅû³¨~=M¥ÒöÁ×W9£ó®|©ì	×^¯¡_§l¤ËJ¨?A·´ÅÿÔE^%\F¡ÓÒºô'å °ZVV$9
â)gÚÀ¤û¥·åËnÍ2B~wQ©ø·eRoÝÓßKuLOÀ}JÍñ÷'@ýÁß¸®ÝZíÍ÷6P>©ÅZøwÍÛ"³Þ!ÑVm£LÒ('+¿Ø|îïõ'3[»ôË",>àêº& ÑÐÂàS= W¤ë«KXMnËaK¿$D^oåç*]	Á7¼úYim»VÌ>wF[Ûã)R?åáÇD>»&LÇÚTH«.Ö«ÚûÙE±Gö¼:ÅG+wüøòÍ=Mè­QwÒAúh+T©ÔÏ¢= «¡ôþUüGW.îÇÖ³ê:ÕÉÍÖN±¡^*¶^LÕfþfÁÛt	J)qX §ñÔéÔã>¦XùÑíÓmÜ0A7¼ºHXuÐ=}÷Ì=}ó]½'ãìåzÇ¾Ea­Ò\ÕØß2 Lï^ãHùÁpù­KÅÀÔ¦V»C(ÛÁ4¹ß¶P	¹-âû&¯Þ<w}ÅtÞî7* êÖÞ	@}×¤üÀY¢íÝÏé¿[Çßþ¾ÊlOö^M§:çOÈíxáÑeI¸ðIà½rFIZ÷ÎBó^e?º%?+^XñýÚògÎ-%çûªP>ã^×qwuSÕyi´¸õ«7.êù¥±è¯¼È§ã]-5®ÅtÊc£¶dAz¶
LÆMûb³æ-erA°i¼W§"%¦ïµö£:Tüäï 7ÜùÚ'Úå7|Jrùçáï#P¸Õvê
ºO&ÉØSK[A½ø¯Ô¥ø¼2¯]¯ÑKþÔÁnêk;õl-!ôqF¬KÇ8ÔÕ?lD¢Ù=}ÕÖ5m)þ¹HY²î4â>´Ã+n f;= Tø	¯wvÔëì'-Êð'Q!330½­®ÇæÇ1Z»r|Ná)vÃ¼G\ÐINE§>E­rt»Uw>E¨YMTÌwØ´9gT¬çBÙ­=MJÁ¡AçüP«¤ÖÞtÊb5Ár£Éª+84*lÜNÚõ¥uÕÏsÐMIÍëZýj"¼E¶¶Ïh5TNØ y°,sF]«þÚXÂBg|²-ÔÒ|d¸ßqüB MmÅÛ¢e. öHÜ´=MXq^õå\vAÅQê=MÈ¼'¨ÜÜ= V¯È¹ôéÍ:×ò6¹:@EZõÜËÂ~}zïÙ7½@nå±Ô$'tÍü//ß-çï¦©d"£	÷|DëãÚÜ,<~êÊyG¿u@{¡ªmÒ|ºøåZã¹èG=MåÎ¥4§ðS­7ç.Þ(&]I¹-á jqao$Ðµ»¶ÅÈfÇß­¥0¹o%Ø*"q:Ó¬QÒl+	]çÜJ¸o)ÑGl¢P¬/ð·Cè¿r» 2ù¹uíX)= Ý'w®ëÁ)bÏØJWêEöCÝs	¤¹sg}Ñy½µhV£Ð½U¤]C¼|~ÐêÝÀ8fMÚ¦ø>À-:5kM-Þ'Øª¼¼ÿø­­I·´¯L'²qSFm!	Í½È\<hrGÍöÈúeTòh=}tFGNûÊ1òÇùp®@^K2{CcõÙNB´g«<NæPôLTø[ä½ÄgF°:ºq'T¯ã_= ï½v@ôÄï±\KÅ´¬¡ça®ÍÉÃÅØFõ #Të¯KuKv<òüÞ|HKìá^²íú©-q­À2i>±P·ón	H_üÌ	öÁèsOÞÃv©·å³ÑI»ÀFá7âCÈ²S©óÒÓ1à[þè7Kô<WrI)5|I6"ëää¦ r?6F°íAÅÁÂ§N®§²"Þ1HoìLõaÝÓ¦nÔð	ëh oGî.VÄ¡×øü";Et¨ÃæóH£R~Ã.¤"QdÈuQïÎ¯~¡E¦\½a?ýlOPXZt
»òc/ÞùRTÈyUjm³È/ô[ñn=}© 8Cýô±ÊÔRu®å}øSqçÜÈ×mÍ,²ö¨bòpXéC6ÖKîô	9 9N8¨!iìô¦^ö-´¯ªÖ©"k?ßtÚÑq«òA\8kFóÌXUÞN	·ÄPøÇÏ¸[zÚ¸þ¼ñ³E /$X¾ÂCFNõ¬ì\1±Vl X1²|pðO2ã3ýX²ý/Nl2" ¦´¡k=}ÅÐ^"+óK|Jc3T2³ç>
±!D÷£ZYy¹^ °Nz(¼/Q0¥,­óÕ#ê/&YÑçw½Yþ­sÅ1#AdÓÛÖCÁJVÌ:Tb©7~3ñªóW²¬ý¬¦BHÉçB;Ò:Ô2fÿNë$v¿A#ëH(â>ÚÞÃÊýÛ  {¯ªYç/xO¯·ö YámÞE®jéäâú=}qÈâýEeñÃQF þwà¯ìåKrwºý)¶æRá±p÷¦_ ØTÕyÕ<r4æ´&Kõq}°ÜCí] Sâ­ºæÈ@¦x5lÛç3øuYå÷\6´ñ|«rÉN>ÈÕÎx¶öü²Y&ÒÞÌÁç5ÓÀÞØi·Ïª!'U9T1M¿ø©{?Îg3s3váÀãÈ1oL×7ÔPóæ±Òw{ä+»ßéñG+wÄn¥¦Ó(:ß"GYØúæ/M¾ã}¦ð½ÄÃævS>£ËrmHGã©øÑ±ÈÜJ¡RCßkÌAâ ©}ûcÄ\ÌB¢·inO¥47VC3BHO|êØ(½Ú3'[Ì?
)°¤Éiú÷§ ÆÖ=Mo?$tÒ¾µïºÖØ AÒh?ì¤Aè¤ÓíÅ¬'G0d4ÄCÎ¥Ê¥°Udª®#4õ\ú¼js¼246Qnú7EÿÌ1Ã:«xàA-NXíþu;ÍÃÃi³¶]ÞKÞj¿·|õ¤§ÁÌz÷%giÞÂþ¤Æ²È¾
>¨Çø=MÖë+FëEï¿Ïe=}Þ|u¥ßÿÙ¥Ê¹¯Çø¦å-CÐýNÊýÈñÙ$¯Ã#¿FS¤é¬Qv	×ùÅPøL+¹GÐ_Û^¿p¾Ú]¸Ò[N]ç¼a!Ú= µÖ= Év^Ðý=MÙVB5:Zû×]Ý~$×³++)K¶,qÑYÖ>_Çe"Sw¿u+2KÏ?õ£WJíêe¦ã"wßg\J:O6qæ®À8â¯q"$P£y¨kÄyÌ+ÿSÙ\ dð°DÑë.ò´¶Ó·ÞO^5ßPPñ¾x­Æ$¸ÍV5§º;8?<9:ú=M=}Ö;Joæó3QÄ£^G7áøjó(Ipåúi2H9= ãùSÙÖ!'uRX>Â©@ÑëDÂ©õ|5zãµjÉ5öÚ£ËÝ¨=MmlF^7^ýWNONá:ðÞWËåî'8¤tç¯¦^9Ç[R|þ÷»PP%bÁ1Mrõür£n9b<
´ÈÚÓ½WùÍÓlìiBXÚÃ;Â;ÍþOÂ;M¬¯>8Ë;QFF7^];=}µ½]òÒ²2{=}ÝyùRªjê¹9*Ê
ÙYeåJz¥%ø{øËzÈIÊKôõ·´JI·µ74zúxy75úúº8»:¸¹CíN#I@LHäë×6%u÷NÛøçï÷nÐ57O:U{câcãÎ=}ÓT>]go#CÐÿ /þØyÿôðXJUû)DW'ØGîLøª©¥¦­ëÈîsIxFIÇvxùùv¸8¹9ö÷·¶'7ØXÙY6'¦d¤då¦äçç¤E%%f¯l¨)T«ÿ73;7 
2ÑZ,UJNSwhúxÕþS°¬·9 -0"(48]RS[¯þÆ¸:»9ÄºÇÅ;:EDFEóÙkÐ	¼¼«+Ê^@=M=MËÈTUËÊÔå,Ûugoié³_&ÛO!'_'[;\9£Wx(SíêñúîæÖÄÌÂêþÁf-òGSRJ¿SYPãßïÜ´T'©Ô'·º;x8)Ke>½Ì=}¹ÿ^á!~>Añ1ÞaÑ¡qAQé)±Iyòðöôú¿¸¼òñ½¾½»÷·³°¶´: ãêJiÜì
ÃzäXÔ= -kwÉACQW°Öæaíyx;é´Jpg-Ö ¾AH:ªTëuÂ#â$NÐùÃbJ±tóíÌgt± »µÔm0ÑÙÍÄ§Ïàjm1y
\%|9Z¸MÇv=M4rÕ¹>vð2tÝl¢·Ô0 vZ)­u)+öx½A¦º·xñ[íÝèUyÑÙ\Q³QEÚÑÓÿQÓQ¦ÒJ,^JÉi.äMÕd{NsdN{Ûã%"8û´c,/o²þêIõÃÞwj"tÖÜy%ÞiYIÖÏ_IáâÌP8¿pTAº÷zÄkJ!RgkØµLlFÞÐN£d<ï­æêÏßaVùÐF'XÄ±lSu@³cgyzÁ×ðdgúNTãZt¶ïâG6ä®âE¸pÆàVSlì,/ o¾Ã3°¸iËACpzbRÓc°A=}c%M69h§¶¡¿Öd(Äã8^ÖÇH:9#¼tfÉ­bpÙÙo4?¼'¤ÏwÁÝòJ2:Tè0²íBi2sr¯©ÞîA© ¥Ù^è4Ç?ÌÓkKL×$d!c «xf0Ì;-ÙF-7Í;*Ö=MM_ûëÍ;K|Çù½ÿp¹Ù³¬ÇÌwVW(ÖÆ»Âä_ö=MQ	Á¶÷},Qçì%}Ç3ý=}×969¯/L
"UµÁGmõÜ£\¼Àn#X JâH5g@OûÈäqùQ8Üu£Ä#,hÉÞQR|æÂ/ÿ±¸Ýb¦'¯# ¤Ñ~vw ¿=}%Á~Nºî·W¶"NUÊô½»ëí%,«QNÈxµ ä·Â
0µzÕ{Ñ*fÃÒÊ0fí8zD1È¶e^bGôCAY²¶ì·uË ØÂXjÕºê×;wW+¼HþüáåiÐyæ·óZÌÃa|¼³ãC±= ïÒ"ÞÃsTI°¡ß+2/÷^{¸%¢êZîT¾YG U¨9EIãÄ«*\ö¾ò°ð4®¸©ÿæåªV×Òo&7*k#WëÅ;ÆIPý2DMçsU+2ó]ï6¿Br¥ØöØ5¸Ïq_
i4¿ìmêtíêQBVïl±;¥<©IvípOkCÎÓä8°´»w%Ë7è¦#q¶¿B¢{%CÍÂCL-"ÀRÂ¿<XÁçµ@©¾]G|?ÑJjOºÙënÙ m"þQEI\§ÞT_H3´ $ªÔ¸ªÛ¶É°ÖoÍZ@§ßÿy0ÆÃªJÂ¦
ö´)ú;1n´8ù¿ò½oI¥º~TÕær¨ñÒ4@}¦2H¸¯¦}Ýùw¤1VèxÚ{§'³+B¤úCõ¬'¥jÍývÈÆ2âª¿ù­oÖDðOñ¼jô§D³Vâbò´¨gu²<:
K¢+ð.S4L7õþVOªGÕJõý|1'a= ¡= â ^6AÓÁâ×_&-»ÇÝV'Ù.ÕÛ<G¾W+ï¼R)<RKï¾ZI	>ZCàgX@äwÎXAèÇ¼Q%yÏ<QGáo¾XAé>XCñ¯¾YEùÏ>Oß|3ál= = =  ßKtgÐ!gÐ#o§Ñ%wÇÑ'çÒ)ÛEö¿îÙFúÏ.ÙGþßoÜP"o¯ÜQ&ïÜR*/ÜS.oÝT2¯¯ÝU6¿ïÝV:Ï/ÝW>_cy= = = à¡fW']joX kÞPäAoïX$ÞQìÏCoY(«ÞRôEïY,ËÞSüOGoZ0ëÞTI¯ïZ4ÞUÏK¿o[8+ÞVMÏï[<KÞWO?|6ai= = = b ý=}Hp¢{nP@Pás@f"sPåAnß$Qé³Bv&QíÓC~_(£RñóD*³RõEß,ÃSù3F.ÓSýSG_ g o!w!""##$§$¯%·%¿&Ç&Ï'×'ß(ç(ï)÷)ÿ**+Ët<¢%Á|çQÌ;Î»Ä;Vö=}4òÍ^ßÏû&××Qÿg]ån£ï+0ÇHTzm]æî£/K0×HT~o8»-ÏÏH	á|IiàW.¢ºcË<¸tàP=}V>åK96Þ¨= Y{¶Ô·#$ÐþàSÕÉ¸êìFr ^Þ½ýô1®b:Ï{ÐMÂ5¡= \ß4ò'\­éàY(ãÇ. ^ð>êW¨a8_q¥¿inP?|'ga[ÿx_?ÉÐSJpÀßîq 	ô¯ÛQÁ·ÓîàMm/Ã¬?ñÃpPR¯;y ¦yæÑ\_OëQÝ61È;÷=}MÎ××úz[v#H|òAP%p""DÄ²lAl#©+Ä:¹#HÐ:õµl¥¸TLU9FµÚYá']>GÙÿWa.[ýëUÿ_° z ¢¨¾j 07g0?0;k= ããé´JÔqí¦ñ(Ðõê'çææÐêõÑs­ÇÕòìqxØ¬-'ÉÐÄ¾ææil¼FÃ'iÅÿ°Bp÷­Sø¾= °«ð)äòçÝa¼f°Hàép0í~¸hâxò¨Ãdx'ð#Åî¹<#b¶°#¬ê1u¨«´hH5>ÇÃbyÄñ§a7ÐkÓìjJL³Äñ­ÙR¤uÊp¤¿ºGö¡n3ÌÂám åC/RÙàî¢ôl§Å!QºyMÉeÜ3áSÚä-¶]ÛÕX[J8De"vþh¨»Ú@ÜÞìÕZmßê:»!Û­ª²ö-ë´ÏÄéiAêÙVßrSÒ¶öEäÊýÙR÷×Ä£;ÜvGÿGjª§£ º¼§þIª6×ôÑEßÏ´ñm9#*Ø¬ÍzÚªe,X÷{²%nú°4£É*Hñ³ýVXÓÓ8~ÂÕfÎ¤ "µ4Qq¿89­«»wÉóÖ	«ìêÉÎªµÀ3?Ã,B±6®}-½L!ë2¡úÁIbµÈçó$Ö³LéÔÅ¹Ë¿·&é ùXù;(!C­;¦OôQTìWìx¦TÈDA"Ë¢ÁÝ:9±à7Â¤Þá¹}Ï][À<{CßÄR»{+Ã?'¿}Ü[\[),Í[ËBÝ:A<z×F&|Ó®Î<×»+/ülð³Àx°t%Æ;ÍSÆÍ;Í;ÆÍ;Í;M[¬£PDTûó½SË¨"Ür~ ÊîóÄº/õòÀ½¶{é*ô£éÙ·²	2µO÷¸o6òö[í,:ª´ÿ¼0Rö£D²ÁìÔ­õ¯SD%Òiþ¼må{JÀÉ»ÖL¤ÇMí:)2Ù£ÙÔt2Ùãºjû¯G°;JpUáË·ÃßÉcþ_Æw+}@'Fì[×jUïcßÕ-µ\z> (Nv>¥ß"c*ÃÞ[e¿÷&;ºEÝ@ù3Ç¦ßZ¦1ùÿxï]/?îºÜ	+SlÝåz.5ôNvvÆÌXÇç#¯§Ê\ÐI¯×ò^ØÑ£;÷¸ó= t¯<\#¸ðx)Y2xö« ß	3Xs%zWYìSÂ¸Éulô °p%>:Í;.:Í;Í;Í;ÝI¯òAHìV(ÛÖÀ0)®hn\Oª.<NÌlM¡L=M¾UI#S¸}HïÀ=d{õ¡¬>ä*Dªo§Ök§f!o*Q<2ühgS´¶9¯CD-y¨íÿåÀ+
Ó9ÿMwBJè³¯ö0Í1<öCNÊ¦/¿«­EÍÀ[ÌªËS3¶äs|ð:!RóxÅo=MEÛ©Ð>ï9ãÒxAk}ËïÁGÛâRÈÞæ?Ë.1Ï@eD¿¤$Ò9Ý}ãQzßûàF&?£:Fa":?ßâ4ÇT¼Pâc¿Á¸Sút¥(W9Þ@A§Ä´¬J;ÞH5·äÿl^ýôxÐT¶ÛÞAE+7]ÁTRh×ùK;¨q®úðñ,z«-= Tõ§Øí»¥Ö±@?®õ ézkJhG%5 å¯Í×0 ]H4­1céÝlY h-&lÉ¢%¸³Æ®#×æu&Ñu{=M3æýgÍYÜ2î÷Lq}ÑSéC>_çJ<´×¥&(íñÖNè&¸uF©¼òwY>ì=MU1]]¹= 16dQÚ·;®åÐG¶"PY}®=Mºd­.Ù¥ts-L\xæ%Ò¯uCs(¼üèHv?3)¨S´Ôµ3°®ãOyùèiIû#M	¼¼ûçIñÜÖ>À-¢ÉvÚ·Ìi*«©O±î?Dj:D7)Î=M¦\b&¸4²y²'Ú^ÔËDHôNÍÌYÜkB¯p§Q­º{ãUtø7 ±\û:-¸çÖû<:Í%í&ÝÂÃC.>¯S^¿iJwÛ£2ó;æ)ø6k5 ¾èm!§Z@80ç
ÇÝ±y;ïÔ/Þ<°Lï8wN÷BÒítÑïgÜT f=Mèëãp;£ ]Àæ Áë]æ2R7õl£ÒÚÂ÷Ð~!<é~éGö±Þ|¥LM1¨æí¡ÌvíêÃQ(+]CC=}nËCQþáQspÛæ.ïé|Ùé]sSÐ)ËH-tÎ¬¥Ì}
~3ð[Ã;+ÃÒÁf-]ÆR ÑktÆÖðOÇIgeø).ÅÔ^¼"¯-C¾YèíDò<b|jv°ÓÆ§[=}Ñqªë½ì8¯\g.Ã_¹&û·+0|UXÈeÂ»1Xò
G2Ìû#7Øy¼V*R µöFÒè=}¿~ESj$o´DHk¥v¶ÂX§&±¦ÌÚQL³E¹çÌ^ çBÿ4ô_éDF¿èFÑ8?4]#S&ß°[÷¡á±7¶|[05ì´¿ãÇ3zV¹Åå\Fµ£EVÚ$.ó~aE]{H>(­LZÇ{ÎFà&v¤cXðuUS;XÌv!;c6}|µ£TáJ×JÞ^jGOD®.®^ëe×Ò}¸T8«;¾Î;'X?[9¯\a\¾~ Ôåç8ñÓèì+ç9NhcCî°ÙDÉ²'p-­MßÕ|'=}YdS7þD?1%±õ3è~Ñ½Gl>.2µÑöSï.1OþYGÔSbµL)(=}ë÷èz×ùé÷Õå9²~Õu1,f½'TI[Ï_­.f>D;N»KÝ{1æM£ïþ×yJÓweUÛô<Gã7Ýî
 TïÊo©WÚ(ÿò§ÂWïi´ßìÈ
ÿÞGsÚY7³ÿ@Ýÿé«0ÞUß.úc/QoÝ.¡zØ|6 ²c1´þ|7¤¶ó=M¥¼v^CQ íH%óÕH
#RÌ}.4UkÕøçÈfEÚ,¼¯
æ·¿K¼.àÖÝcjyí÷li¿Å¤áq=M­¦9Ì,oÃ¤#ù3d-= s[ûRTðÃ¬i}Á&ÆèSÎò7,/GI¼k~ "buöèVSKãk´=MÊÁ¥Æíuë7¹ÃGÂ-$®Ëäk°nAôæ§Ì9tË+Ö4¼3nÁfòN;ó³Î/çunT7Ó Ac7_Ò1&qAiNÌÑB÷s[³× y-ÇvîÖRâk"z|øMêT£·¦·2»6í£Z^ÐÃ\Ê×ä£>Iî#®ofÛ4s3þ¨2]e"È÷ÀwÙf¾]NeyIB-/Ïä¿¨mSÙäGÝYøI«_Þ(QC*ËäÍxÊI/åfß
d=}àÒ	 ®~o¯Ò"|{$,êÊÄâ)n&W×V{¢Ùqâqq§¢	¨h/ô´OäQìùÐöúä$ ­qHØ§¦rCñÌ­é¤êHg±h«£úu¶1¬ÊîÆäºlãÃøvåkhÇî¬=MæßéC8
Øò½C¹2a7£ihãqñUWr		ª$±é¶©,È©±yAÂ¦pØå "tBö²Âøª+O´FÎ®£8m!Iý­Ç»Öñk¸óá7l7]çÐ}yÕóì¬TFÅ»ëõ¿x{Á]ÓHÛçyü÷>Ó1]ò«Fúägõ¯:	ÜöÅFC àedÝÀMæ¢äux¼$FS¥ì,BM2Âlë¦Ï»i"ñHí%NºñöÃøµy{:*9³îß¯	 K¡eó?¶ÀS×½iO³å:éäi¾°-Å=}ÊôÞµÌ+«ÞgÒDR¢8ôjå7\Ù-ð7|Ü#åX/Ú«;Shr^}ó\>ÁL'DE°Ì]aÁºÄnÞIiÁYéK?ÑÈ3Ç4c%}Uå£ÐRkF¿©Ð\ª£Ï¨ÿX&,Ïhk,H6m?ySg1xU~ïß"ÿhC@[ë#ßS:Ïz*ßó¼£Ãm~Ëqæ&öèÅÕtú614²'LÝUL¯'ÙÖc"7^5à7¦&äéoûZ0$2-hÛÓË¤këÏP
åð»1ÐËEHà6¿È£|ÙåÖ´L;98ãs0)IÒ¥ÕvýhSHÐwÅI½(NF_l8côx·x A=}­6Í;6½;ÍÖ{µòÍÌ;ííÍQ,A_Sï6ÛQZèëds*pSÖgØ]²â®òñÄ*©fV©²[¢rKóº¥"¤rWªñV¼ê¢çÑtíÃÄ"äc8PÌ|÷M'µ~7iC;þy/&Ó6¾zÁdj¨Àï¯ÿ©sO#y*°·fAgb|Å¹ºë%¹Þ<ëI«¹F)AºçeIgD]ªî¼DÑ÷G,´Ù¦n)CV¶~AnÞ	´ Ìæb§u_¾áÍþê¬±Ö"8ì³¢9·éwUª\[r·¯Ñ¾¦ùa*hÐC·ÅNü·F=MâjúÔð\ûjM·´pöAÐÏÚ´Qº
ªK­µ¶É	Q¶íPäÓXSâm4ùõ.ûï5	8 .é;JäúÉlä+·z=}áKm8Èr¹ )9	?éPqSýè7B!F~1¥¢{ÉÏÍÖ5ÉL¤TyÍ´DÔz#R}{3LênAÊh·:+;EX£÷ßUTX©üKQ?fäð0§§ÏUé;¯=}ÝÞÐÀ³	a"Ãx|½"ðOm±Ïè6/ætÿÄùâq"ÊDÖyÖqºíH7FïØÃ2§í9.xAúù@÷Í"Ï¬è9Å"Ç4ùR,tÁbîùÒ½*ì\,PÎCÿÙÆ,Ä¦
"ß¼MÇ^ªÓ:^"(bÔk~ßÁ!	Ívh{'>ò«IûÊ©Sq«Ê=MR)jA¦Z¹Qõ
Ó=M¹À-ùµ6Y'zcs{äIX:æý¼ÛÆãÙu\3öß®8)G¡Ö¼Í#Çñ}³Ï8Q²;þ2¤ÛîÞÌïO;CÈC "¢g|Rðcárî|VÑ¤õS|ùØ9q×Õ.'Lä3?Ö¢xöDÇôÓÂ3?³NEâ§ãkÜ+vµ·FB*'£Õ_évÎ¤DL«0a">qCM®¦uS<IL.¤ÕoäëB!óU~ø<S1:óA¢¯6­VD!Á¯äùÉWWÂ³w2k(A%}Ïò^,{AÉþØSo+ÝÈúE#ÜòWEªø":\"÷6ßÜÙÏB'Ì|WÃ?
>Z|.J¦ßêG[Ú5ÿúald@_©= gì.7náDögÂpé3á¼öoÂÃØp[âpÞQj,ã%esøP£!ä©æpEâë¢u" Þ³2¢¹YµÖåRTÅ"]$7çPËxçQÿ¦iA4Þr.Aè ô³d3âHÓq,³î¤ú¨zæqà([ñí"êeu%øÜ.q1èö= ËØúvðâå³Aòé¡ÔfrÚÃØæÕ_%0ÊqëË¡ï'IÈ¡ðqrç­¯|Ï·$ÑQ?ø'þï'Zde2içp=}ó 8*d¢_«"ñâ¤¤ B¸=}©Üwú$">VªB_ó°ª¦ÔmJG¤E²°î¨ÁåO7ÐVÎjÙ0´ú*îù	Èÿ©¥íÃ1ÉîÕÃzO1Hø.U*Ôß¬G8åÔB5zÿ¡:yè¶¢-Sl¾ÅR½ÝS9Óój=}D2p}å"¹+ÂÏÍ9Ø)F)ÿ9Ì)¡vBE ßç2Li-E'¼æ6D²ÒwÌSÐ+#ÄÖ~ÊGRð±-§ÿGSÞË- L¾à¡£aîkjh± Þýyå¬Yp1Í¹äÂ°qá=}¥Â!_¥<&x1Ô¸Øø§*ä%öQCr^9þÿ÷7t1ÛxEH-²\l+¸øµæ1ä|£µ|1â0HÇF:ÒO÷:â*j_¸¡'j¤ÂÕÒ¿µòÅOR¢ê£+pméÊÄ«
úyÇ	¶=M!fõ/ÊpÝéÝÊxSEû6ºö4²Z×FÕ¤v6:sKP²'þ@¯Jé9¾¯6+Ú
zp½êë{¸U·c,zÙº0è1T¦Â¯2<äÈ¶<\iã}­DÊÂ×7»û½:¬G-èþå¾Ñk=M»Òeg¶­ÈEQG=MtNÎ¥b];¸99æ]*v<Î#:ýåEM]8îHÀ$É×ÐãÏ°8!"Ñý$æÖÒs1(hÛ4)cGF5Õñ k-»½üJÆÒÎÿÁÖûêÌíIÁ"4LHBÕoÆè&+ÛUß;ÍZ¸¾>'VKÒ³ÕZq=}íÉ?WGÐÃcéxÀOP= woP@9= )A8¨Rò¡Qã\È$ñò>,~"]Bp7Õø}&V0­2Ìh¡ÚØäL-èö'§ZP}E¦6Êý¤­zÏXÖÜt1Y°\èBol9³}*yàA&Í;®'Â;®öÍ;èÍ;Í;xÛGÙ_r\_õÐÞàäzÒirrûhc]gi©9;¥ªE?lþÅí½ªQÅ²äoJñô²ÅlÍÃ'wJmñµ)öðLðÙ·Åô)Çª7Ú(YFK*ÉFñ¼ñòE(þ+Ù³¶!HjNÞÀ ¨e·UjäÒÅïâ^u<Ä¤cõ,Lè¤éP¨JÏ´\r>»¥%.j^
¡åª®µNèêÒïµ	FvÊ>ß	´íÐ¬¾4¤Ö
YVæúïY
¯æêhC¤v00Ãæ7ÇØÁÜÅMÉÙYvAÿ,ÉÁ	ö²§üÝ¹²'XvÒ2Ìô;z}{2LÔl	ãbÚJ47S«ïÐ³.6siI±Ì4Lâþ>KI¶- #fä	òÇá®c7¶xÙ< ÇföíqA=M~ÅÄá±4eNwSÛÂé­¬hëÅ?sõ¬9Î/ÕsÅSùÉ°7ìÐºOÍÆ( ù0fK/ûW.,[
väAòUå!óø½v6ÐMäå2TÏ¥X|}Ã %ªï%¶|PõÌh[Å ·ò#Ì<6:È7&H¶=}Qÿ"ÖäkC$.aÖ:L(BÖ®Î3Túý9Ù}hÕc½ÏgÆ(m¨ÌÔ°Pã|h¯Ý×^ýtøFÄì7)å®CÄ]Ë"úéÔÒ±Q·wZéj½,¼ABMÑwóþpn-$ÖÎ¾_@ÆZ¸ÙÎ4«<ôB&W8íÊöRð]=MçClÚØ ãIàç¦ohFïF¾¾ÞI%,«ý÷CÓ¬<KJ½"y4$§I_[¸¸ì5ÝÌ?EÃ""?0ïu_H2/æäÿ\ÔA§øKgøös ·_= eDaV'beHÝàPÒ>6mèÏðñ2¹1õfÙÔèÔÂÕ¢,.lQ×ÿpÊ¦¢D9rB&Ep"9¹ºìì×ø#TnçYÖÓøì+Áä!3ÖäJyq*Wî°ÂÖä¢AhY§(ÓâPÙR4îòª>±u_O5§ÉÔêÛÊ'X&ÃB]xêÐl?Fx«'p/U:ÑÅ$	1®©üÑÆÌésr§øWKÿõ Ç?d£iü1d;ØÞáègPÛæL;[Ù«2þÄ4VSqbú¨%âaþ²Ôªø%û¤|á{ùW?ÏgY¢ýð®SØ×ú<ÿyg¥eàoÓ'Í»²;Í;MÃ;µ;¹räÐC{mJ¨ñUñR4¼=}E²âÑ¿ý÷\á«?+È¾¿æìw(¸òQOy"W|·nö¹Gýüµ¾ó<âGÞ·ùâÇçø¼!«e+ªj> øf?_=M$<ª©U1ªÒõÔ·)ìÛªä× ÆÛuç'x¡%ûÎuZ£1¤Êäåêú¥-4=MÊk~·	¬ãÐrVÁ®¯mEÆÉ1
E¹m¥xjóKÉ	0¿+=}Yº3º*½6RPÅ}"·ø=}¤§C>½Cä¡çÃB­}m>2Lå=MTd§K¹¦/Àþ:[UÜV /#olh÷!:1 J©f&Ì0>Ç *c¿ÁD%ìhA¨o)ù¦Ìr2ñ5Çí,Ù.$äO­h/7= sývúÈ=M1Ë1µsm¾³_×"ÚÈ"¬3õÆº¹,Ô8Ã'½ã>eA ÿÀÁ[¦k¦ïå(qk[_ÇE*Ç¶þÁ¥xq_.2¼ÂÅ¨4*¶/9(ÞÏCºÝ{"ï¤C8HÇ#Ô-&17MTýjMh»r=MÆË³?®gÖæÜH ¾)!é®nä1ÁãÕag[¯XPýÖóÓÝühóÂ2©EDõ+®B¢Që[­½xN¢Øu,JNÑUëÛOÉ±!íãûwqö¥2GFCÎöôÙYçÖXÛÛXÞgA¼\EÁ@og¿V2@·N¾Þ}NÅ'j" ¸'+SW,Ø?'_Zø81'ã©&ÏQÜì)ÜôEÇN7Þ¾=MCÇÍ¿¿,W±YqÖ¦\êÿe_ÛàébàÄÕàªV= "5x\ kgñ¶i²Ëð³3â,:qD;¨pÁÎlÝ$äPh1×°è÷äPK£læp~§FM³^mSÇG&ç9¬ËÏø·ïåq¶'L°¢¹ÿh!qÆ4©§ØIªdAØ[ªWv±ÞzuE>JqÛôõgTØt¥x/¶ëÑ»l#ìxÓ%Â´CýwCh_?îÞÈü+Cì'É®ÛÑXá¡ÎÖªÐÄªâDdV°bIIdËþ­O["my©O©{òÉÚ©#×³4ÿ¢øÕ¥ã ê³Ü­çÏ3T÷¦ØÃwù	«ðÆ;-æä^-½fÁñ#[^lßü(0P	Ý)Îö}]hDô+å>,2TM|Ã^-½î$ä|"Y,ÿQé|óþ*Y/1Ù>xð."wR¼ùG;×jT·pß ñée9² 8;®v]ÔñÞq' Å«êtq*ù;¥1ÆµÃéôø=M$ÃfMaáò= àÈÌË;½Ë;Í;Í;YÍ;¶ÚÝå·ò¿Ë["2¿È+¨=}®"ir"ûÔAê¬âP´ÆFõ=Måá².öòMøôYü²äRâìJýÄ|ÿ7ÖyËÏ*X®ÃF·Òä#
é|S°c¶(1þò3G=M|¯®_thÅÈ×e.ùjN±ðÀ¡!¿9µ¼éP»ï¶2Üýr%eÃY
Ä»®uEJp«_eòç´Ìß
ú½%÷?4¬Ûg"ÝIµ-o4ü¶
Iò±Sµ¡m{ËH´ãÁÿ2D=MæLÞm^3úö
ÇÉq¾¬_gºÒû(Þ4î=MÕÄ£¡çÄf¨Õt¯HPF1ÓþåcU¹7Ñ"ùN6BÏc{?5 WlÖyÐ7àÈfßÏ¡ÑÙ»z©î¼ÇD6¥Ûxq-0<º7±Åàéë­\Ô,¤@åi=M+äËN´Óëù]3-Ì:ÅÆY½ÓUÆÜÏ¡#»ºx&¢_UvZ¾r³Æ¼<S¸qF-Pá¶&EõW¸9Tïí]µÌhoG.¬{ÏV80>q:XIÙª9	2&îÒæÎ@
ýÒ²ÖtY}z(4áÐÔfýÖ\ýãÓag2®IÔÏ=}Fq&.®ì¹ß×1ë¹}½üÿB"=}åP×Ë½Ì\6-;ÎÞËA%È6ÙÙ1íÙ:%=}Ì.C¡±?£¡~¦UÐEäç?ØpÎ/_
Ù	53+J¾[´ÙLÅå5ëÝÊöSãoWÄ[Ö+'ïº£Uÿ²\}M.¯/«Þ~¨$»"/öa¤k 8!a´+bu@V;= EbanÆmòÆp1iP]\oeém!q$S§è1u£çpma½&=}kqäøQÃø«å¹>,s"èàB7#¼¶æÉ\µäïålÊz"êq¤Û E/qº%øÒ§ù»ª.¡±í2IÄt11ª6x2zÆUî±ÀÞìÇçÂìÛv£k\.8ªÑÒ×íSÂ¦üyÛBôÚp§ÅêÚfúô©ðÈ÷@"dÜá¦óÀG©¤K ö©ÃòÌ?ðGõYD©ì	kp}dæXÞÕêWG²L^ôÂÄ´E®SË]ñ@<2ë®IQ­Y úÿÅ07,Ð¯f1¯Y¨æî´ÒÇXEßfM¡¡nj È;èÍ[&Í;ÍÛèÍõ~^@ÈÜS©Øñ¡"¢rä=M@Èsi=}ÌxÁ9iÓ6¨ø§"dAHU¶¢wåô2¨Éü¯ªãR²Jhó¡U²
®ó²Ååô*$>¥L(©Ä4)[çì¤y­ª+È¹·¦[Önðg£ö(x­&4ÃF½÷B	ì-?ÅL)q.ã9DGµ­»)VõsxC¢"à°Iü&·DÔ[·.(ÒFJuÌjú¹áP	 3¢¡÷âÃt´ù Mfe#opÖä4'jÝ´P¾$J·òòjåõ¤r6Õ·ÒÖò·¥Þýò|[ô4O£"üÐ´Bù§åêeµ
Â´Ãuû
p~eEu¹6§%(êÍWµØ"´jM2
ù÷¿-ùjÊÞ´óëú&#4¬ý¦vè8¹-N	ùS¦-Ùf«£AzäÑÁ³Ùm_$Ë¨l5Ûæ8²h_"z®6 óËC4ZÏRÊ1÷7ÌlóÉ¤ëÛöÚ:=ME)ÉyNÊqÎætùnù³§9Õ¬+C®}ÉrÖ2¬mZIÊ=M4Üî×ÕtÃRË}oÄÚäÁ(?ÚG5S·ÙsÚ.Ô2sy
[Ô"Bp©13SìþD½ß1 Î@ú3 öfä3A©Ùc¥zzø79 GfÊ.Õõa»
aÁØß¯4¹ÁD=M+¨U¦ÖDB=MÈ¤X~~Ô²ÊñÕí86xI'(]q~xqVg*$°ïéwI¬4ÈBÐsùûøø7-äÐ¡TüÍB)ºs5WùÒ>¤î§ößA2øqÆèÏy,ÔÌFÁuûù=}#¬ñ1ÆÖ.q+oøi¾]éy3Ç1kºHÿ9â¦ÔÎA­kk}Ú»Ø6¢;evþÎ0ZeAðÈSÿèßuÙõ7Á½¹Y´"ª?º¶ä±Â¤æé¶B;ÆÅ)IÎ¸9Z,êP«|8zÑí6ÍÜËÃÈÛ{6¡äÍ3Ò{[Ö:Ø*&;ó9ùF<s	ÙM´ÏGÑ"®O.Ö,#LøÁ@Ê"¤1É§U ."×ÖR
|¼VHø>áðcA14!#NnfíÒpþKÀ?ÚgécnÞ½Ôu¥ØÓH½v)Â®4ÐBÉE¤úí×»DÄ+vÕïñ¿×N	óúühã%:øëú½(«8¸7¥ãVÔã¼LþB¢X<¼üE7}wI¾Ó!IÈz"Îâû¤VÎ®n×Èöû<Ë=}:K¦zÒC]HFò&#dçùëÚ¸-ã¿DOMA+¸ovØH9£N~½u__ho¦a÷ÿ±gÓØyî÷Õø;Û0ëÂ¾N-¯Ù9Õ'+@7¾*)Ý½äÃÍÞZ>8çûïÜûM/"øAHCIÃ	ÿÜì3Y©d]Ä-B§±<ïPÇËEÇÐ¿X)¸$YÕ,/6{Þä­9åÌaßfØû 9a¶h³= A6 ÈÕà	aÎcLÙpÀ>[= ]5¡äÉ¨&Q¡´5âÍ~9(6¡Æh{-ïdß¨î¡bâ¾%¢<(y¢¸4k£èqã£Ôýv1*pu³¢t{¢\O¢HµÁÛ"¬F¾wä:ìÔsÆQ\åy×,0ÁZ\SW"71v¾.hª§´¢9nqªnî°ÔºdÁO(ÿrO9hO§(U¢®µôü>¤qïµDË~À¥&¦ªù-±~é,~Õþ¦ÉTª««ìîQxÓ%x´&HZäGÃ!ðx'8&!4x)Äì»oÂ\_æÞ\Ñ¼ùB\µ®NJÑªì³¯üÖCChg(ô=MÑ¶|ëóÚ.YGÑÞÈoà²Ík= æ=MW&=MßFD,Í;½óÍ;;NÍÛÞïÞ÷G§aieÅräq´±¢-ÚrÕôÆèäÅ3|¨ª§âPãt®óÀZª®Íª©yÍôòì¨YtÁk)5·êÖâôëÔ8ÅRi	Xn<Ú¥£Ä_ó±¡·&T
VòQìÜÅhó¨Õ&|ôMêìç¯ÅD]#ý¯®SRÒä·DÀ¢.:Ò*÷³Íðüa³EÌ¸GA""£)¹ó½!ãrjêxt´hxP÷bA|Ù5»áÔâët¬=}@LÑe9Îh±l;êY ´ÂPÉ³µ)*¦ªÑÝªÄõh)òÕª2nñ¾µ2LùòEõ/¢±Lû³´Ü=M"7¡%@!®¬³ñ	BOäDÑ
j#wuÒ
¸ª­~óúßÊv_¦ø«]4ìüF:rMÊü²ÓHú¢O5hï)FzÊ\{0ðA·³m5ÛÊ¸¦ãú´=}ïÊXÑ££í·ÂûTºq?Ê	0|Ù
ÈÉ>°+áºªí02ÃöËøoÊq&ó·¯´\	ù¯§®éî¶Ö}³ÔÈKJp^óãÕ4øÃË²§Z½0ñúQµçtï¹¯Ê¬¯%úÚ1³ÊàþAóUhªýýÚîý1ÃÙ Ç!§Ù{Hµ" ³aÁªZ÷aÛ«c+ZxX_dcv{X5 ûófä&­ÆN¦6Éì(b¦Æ7²ùqÁ±©6¨/e¦>Í2Zøñû¦JÒãiA´ ±9ËBÄµsé&îÖq{ÅBP¼s"ÒXéHÕs§¾øèÓ ùªÒG½ÆäÏEÚcÕø©}ÎEÌÏ6úIÖ0,OÆäÝ?R»:Á!±1"!Úv
Ô¼-ÇºX:"@]vj¼@éeCok[Sº	¾>*£ûõ.¶6ãuMp[»YÓõuAÉI×1ªA'¶ò?äR8±6¦§í|i{":BÍÏCJÌúí<©{+W8è¾Ñ-æÐô(ÍÇÇyÖÂÇ¦.ÖÖÎlì¶:9;®SÖ9©Þ³÷ãï}h«pgïËx76áÍ ã³|l»A ;ál©ÕÀXÓy¶:é%LDÞ,)8ú®ä[EY= ©¹AD;/	õJWw"d3k	9%Uøë½ä:X %JäwXÎww.xùJ\%%ïüÎ÷Ö3.L¦¸Â2Êù?6­MáÎê®ÕÓÅåû)=}´O¦Ã.ÝÑ÷ç
ÅDØàç)\5.ã(<úJÁ^ªo­VØ°¾PP-#F~ÚEVÜ¾$,M±Û:!¾¯SÒI¥8Å^H¥Z8+;Ï¾VDQüïú*t"ÓãïI£ÜøA#:§]N¾R^éoÁþYÿ=M$¯fçÿu\GÇÐæYq~ú|Ë]@Ç7u³þYÉW+¯ªá= ²¹= Á½ VfaÖi0Ù¤àJÓbx7g(×àÐ4üÛqÀÝskeIhR÷èÊðríãhÃ­J'Ge¹(D¡Ú>l2@ÕðØ&p"¿³´}ã$SJmÇèõÃ£¬½x¢8Ì:þh±K®èXpÁ%"t2å)xj<	"¼NsFHä;÷ä©ÎoWÔøéW#h3­Lq:÷ì0$x¶¢Uß:¤hnèuq4hW¡Ih¥¦ôª±äeÛªö±ÕèòÁ¨ôT»Z]FÿêE%Z\¨ÃÄ×&(µ¦fäHèxG$ðï|#ÔæSÅìÀÚ¨tæJªEå5 ½sH9cæîáik 8Óò'qQ}|Ùk÷'Ù¸.Íül"Éy':nsC\®K}ÑZÿéI¡|Á69ý!å²iþør\ê¼á½âH d"3ùÀ<>dT!=}OiE­èEæMaÈÎ=  ÐÍ;ÍK]GÌ{Í;Í;ÖÍÓ§A.o1ë×Ëyiì1½Ä|C$|y/(¨Û´æH@É[¦¦üEGÂÃ¿YãÒ¤ï×üüAëD=}G*O*Q©î=Mb1/
âu(·0ÊàâV³$Zuj¤»/Gkjê± ^ ¿ÆËê½»©ùr1=}óHÄ>wÆ©¾©M#ª"7ô,Ù¤Y.Áu}z	¸±Ñ'×¯u*¤/=Mý´±]ê8§u+2Ù° ­A
Ê¤+/´óú+9f±¯±ÖåúÛ4Ä¦Q¤_°ÓæÌÈKÈø3Ð=}	ÀÇm"= ÄæwK´KÕm¿Ë¨ñ¼¢ö»¢X= Îöõ¨dWò¨¾¢¸Â&ÖiÁgÞ¿?Çé3ID´½+6º2¸h· ¡º­3òº+]º>¼62Tö)hÓ #247Q¤FÖ3QÜôîSÕhï CòÎK¸X¾'´ÚlYUÌÃk"Ð
ÈßÝK¼¯Ú½0SU8Wçþ=MùmDÁ Û}c7Åfzl,MÌ9hc"ÐÜã¡üWf<PUíaÛjçRx¿1èPoÜ7yÑçíüLÃ&¤Óöz©+¨'Ó¦äíIûñy­tÆÂ¼só¬¤}×<d;Çù>$ì#2¿1Ké7),Òûqâ6­,L4ú	|ùÜs,ì»Â5®"»PQáùH·o¸uÐeµòåsÖk"ÂÏåfÌ»ÇqOv¼°Yå5)h!*R¶*¢ËÜ(*
>¶®ÖéuÁ8Ô6ªýç¶ÖÝ2í#¥Í5Ñ)æP}<JÈ#,&+¹=MQKí7ÍÄÞÃ£8oªDâýÚ­M|19ñ"ÖNVsûÈ§p¦LóWýÅïL4YÎG¸gBnþ7Ö,hù¼nF×Ö°ÃäãÃÓ|¸ØÛ4!@ûnäÁÝªbB®½ú)ÄÔJtOí®äCjyW¹Ö1©SÂÿ®ÚÆÕé[ãkA°ðô>Ù¼ìMFRÈwÇFèÏÑñYkÁ´°ßÔQíû)e=}4	FFÆ]ÎªÓ\jQIÎÒÑCà{7µÉ¾¹W7ígÁ»¸>(ãÙXuP÷g-ØowÛ¸#ãÐßHÁ=}·oVì¾tSö÷Ð»Yü¾äéGÐuFØ!+¾ú=}TRI=M÷EÝh£6*îW13HÊ,'ó^F¬Q»I£¸zn¿R1Gùï:Ý+FÇÅÉfÞê]hÇ#~ÞÃ]Ä½DG,®[©OMw"@¨àc­jèÓ îat#bÄù} X|~iÀq P;= o³d¹þ¨²ðº-ãh[gñd(¡6¾j2]¹pAÚ(ô$U2vh1¡}¤æþïm,o½çÈÕ¤g~ßi£ø¥#øÊåq~è¿îGå¹¬7ÁÄ{#tvFS-"jµäÎY¤=}"³äQhKf¦pîhOJhín¤(Û"'wq.]íÇôAEhÃ¤kÍôÂßÛ§*>±FNê2WÜtAïÈZªQ²öìQÎìóêxËÑÿêÌreúÍí±F´ì,WÂÜZtC¶çk'qÎé$IËïsLx§zvALÅ$)Ñî­Ü{Gº*d§R8´!"vi&ûrTïp>iGdJ5iú}¨°CÊâ²sDY÷ÝÖhk%[&MØÍ'í°.UÉ'ñéM8L#VàÀgle°Í;ÕË;ÖG;jÊ;Í;Í;ªRçs%æ½±x%±¬[y%Xv¦D *»h@NÁ!xfî0×åþ;ÔÍ3ck}ºÈ÷0êQµÍµÝó½¬-"<GºÉ)ê·ÔÃK§C:Hû)& BÌÕÌ8k$&èù&MíÙÌßËÃ£¬&ÌÑýL<ÈÃGQ Oý?³M$¿Í'ØÒ¾³\õýÊ1|©M Óag±µ}ä»6ëYÁg{<!5n¾¼ÔP[ùãÄß|xg¦Y®ú´Ò2ùsßÏsb®öï×ßésÃ$Øß.©\®Ò\Ô²	ë6¼8*x=}8åQÃ|V&%ÿåÎ×±^ìëo½ì9=}¼CFËcÉGÖ3Þôû@Ü&ýÑHûW<\BÈboÚP÷RþgÃ2ØKPðÚäç*ÓT:DÁLÑo;NØØP1ãQÊô.LËiQ÷')çÙ	;ëÌ,JE$??Û){'§ûìæwSoC<(ÄU1Øèo3'FÕþ}VñQïOÜxc'.TÞ>wQóöÿ®M\¬îRÓª[é#ïQÑnY¹Û=}/SÞÒ&l0½àyåc¼q 8zmj²e LaÊ}l eXàÑÕ´¯{¤ujÒÚð8Íâ(hyDT4&<1B ðÉ·ã<ÞuÛTp3ä¸½$'Êì'£nhÑ¼ä¨¤µvNoQZªè¢x'	4Á2tl3ºø=M"\JhÕªxCXìrF\+9¥îÐ  ät5xC'6^qBéh}¤¸¢ì]qº¿éJÅdC_¸õ 0Ú!Jbâe
i67wx{¨\â=M]e¼âÄ¢ÇÀ t¡ZYbCfÑÍqD:Ô² hê?w<ßx_¥À¬Os¨Fö+é±°	Ç©JfrCmQÕõt|Còìwòz¿¨¶,÷xë¨=Mò#[>³ò¢·WO«ò4_®ñiu]3Å·¼x³¦±BÇcåìTM(°Ñ-=Mxuì¶\û
8 ÁÜY~~°,=MÈÕ­ñTB$Ëå^VñOéû2ÊÒÈjt6¹°£3	ñ&¨Ö7¬|ÉB52úóÃ#ËÊ2x)áMzÑ¨³EF/Õ-N§ú »­%zC9õÄáTã_ÌoºÀH°p¥ÿí:Í[4Í;ì³;Í;Í;ÍöÆ^Àóé@Ó!öüâ¥dY+iâÄÇÃáÈ6³Pçt|zx±°Áî¬.Ït¬:×¼ðXò@>}!BGânÿd!ÈRâÄÛÌéªý±rïDÜ)jò@©3¬R
ãÄ³Ï) ²rÉêDB©ý:)¿REÄ?u)P[òú©ªâ[Ä£Ä% ØêuÎG³H½¹q¬±º×¶IHAt%&ä=}Ô%íåê@¥I½±JðF¹%]KêïtR=M*ïúÀ©Ù}­Æ´z­CLúåö1ü=Mi.ôNÍËÂo2y9¾Òö)²­\»ÓUÆ%eí=M	Q¬óVF¿m!öß²£õlæ4mtk[Ræ%l!²ã£Ï#O:ÐÕäÁ-Ä#ðÙæm!rÕA)©#>æÉWm=}¿yÜm½ßºâÙEº+æôö±¹ÍS»ê÷ÂY¶/rË¸¦VUöòÃ)Ç¸Þ¾Ì6rón»Úü´É)R$rYE%¯îC_âÅÈÂ§ûÔî}Éê^GØ¼#Ñx»æVÔóîR#}ù,Õ¹N)q\ó¯Z½ÖGZ2ñR«HX#Sò8¼6P¬)Lyð/3ä´Å¯æÚþÈ!MÒÿÇS}Cy=}3ËñAº¯)}þÀÚéÙ.SC­/ã'þsO{Þz,,ßgCÃlØ¿J{lgó(ÀÂ÷{,ÌoáÂ$°= ¥Ë;Í»Í;¦Í;Í;ZØë9&§C³Çí]$bÙê&«ÃJíá:Î1¿8mÑ"Ø Q_õ&;z¢Ä¬lý=MéÕv3q£,ø+K	³é®)VÚIx
ø?Ô¾ý«Ô.79«Ç]±ýewÔ$~^ù. ï½^HëÂ°¡ù´fezè«¹Éã¸5l¢K{ÜÍÅP!af÷§{è¹ÆÃÉá!ê5fSy8gmýxÓ=} >zÔ\Á0â©ã85óù´(È²ïé¸ÇÒ¶)´'ÕÓóý¬BVé"BÄsÑ0\øÃRÉ);­VúÁÒO)=MÛÂX%DLßó³1îü6B nëå$¯æ%&v»:¹ÌJÉÁè%ZQvKÆ¹è=MÆ-rë5KLòÐ´"ei^ùßôP§Z§9p?ÆÃû-¹Ív9¾:¦¬Ûz8LÏÍÓû-1á'8üùÎÓ!q-í×;ÄSL-û{;ÜÛÇöûèn±C$®Að£*ÜnyªÄB.ûÂ}*ÕÑd_4}E0Ô
£;[Üg@ì<JIàãÞ:FD#nèoG¼÷û©½þÆÐYð;E¯÷õ¼r6Ñq®®%[´yA2À«»3W¼÷ñ¼$õVIMê+1[·¾^JR$¥,QóØ¯Oñ÷§å~mØÔE	çØÔ´Ïïµ#V¬TÛüMQÙù§D­~Â5)Ù",ÅïZWTx^%£[OïÖ.UÙô#GÛÁÿ¸EÝ27T:$¶ÛNlJ+G¢S9X¼¿JSÎã¯DB?Ü©Z>UI\"Ç,Ç_ÿ/Èê3iuÂCY÷½ñß¥-zê.íuC:FV´èûG*Ø%[¹êxá+²¥åmêuî$4+BRÓ%'¯ê_teð Ëú= QVtÐÌ óJaqzgÄÈw°Ç aÂQ¹@òVañdÄ>}°Eøìx®ÿ/c.ÝjXXhÇ@þa%= âê&Í;ÎÌ;Í;¹&Í;Íÿ³Nn:	>®¥^êæt£#/1òê÷õu±JÒ²4N
x Á¦?/+åê+uä¶Ä8i%+êWtò]A·¥é= ¥¨úÉÑ;³ÈNÇ6ä+qwàÚµ<-*¶ú«½ßfÈ2ì1´ýI¨ØFL-ïúôõÈZ=}÷_·zQdX} ©w9°þÁÈª#Jæ{YmÁª{$z ¹c#D6æ=}=}lgzBíôùÁHlÞåABÆ£ £V³æ·m³xV_ÆpàÊ±#C».Êé½0²ì¿ëXe<ÉÃé:#²ÂG+ùö»:rÅõ¥ÌcÚ}Ý7~¹*lXÁ¹ÌqWàäi}µ3¦Ç×LDX¸6ñæ©ÃçøhüIIh~B!1ÃÃõÕºÓ;}BQC(m'?'îO}=}Þ¶æQîNq«áIÒÚ.tQä@¹+	ÇÇgïkÄNI)ÒG	W¼GÉ3Pè§lfB>V4ÚÚ\Q¤mxÂÆÂ2%è/ äë£yg!àÍÍ;ùÍ;ÍS;îý¹;Í»0NÑ°¢Â¬Åéµ¾É±óH[êÞä$³.÷x¨S>\£Åõ$4=Mr"Õ@#r«,Û_ÕùÏöÉ^ýìú¥¦øoÄ3¥	Ó¬f(~hÊòù+|ìÄ2\3Þ=M¬£F6ÁyÁ¥Jö,Z=M0@eí"Ljkh§â4ÊjÏ²=}¶Á©oå3ãuÒí·x«¡xsË4_¹¡Y¯A2få¢Ût¦·8Ò©¡XsÝ¹Þ¯EQ÷Æ°ù÷»EÄõ<õ´ä­!æ¿Ô´É7§EGA­¶	¯Å<jê_Ù*!¹olÞ	ÜU¨¥øv=Uñ&;?É)AG7Øºª¦êæ²¯£Øw´L
Àà&%1zË,¸Ñ²7tËhkãËRL4x×¤C Ùíü¦38WîÐxõ¶ÇÏn±w1y½¾ÇßÕý¼íÕ&3qæfYæJ¬ú ÓÜ®ñE|ýÓHô®5qf7WJÐ²§SP®ý·m\ol¾_& 8{\õ7@3òf=}8°'ÝkãAýmnTpgz¼¾ÀàÆ çf/_È¦\ÍpÆgÝ/yLÉðK	!4¬ÞÊ¢zséPÈ³.ÄÅóí¬¦>#TpsÉéÈ,5v[¿¬¦]ÏÒÒ©å&isAà0Q)&·ÒÜÀCËë{yJFXä%7¸lÃÑ¥%.v®ëW¦¹TúÊ×áåP£ð¢ë·_H&Â;ÖëâçöüØIöå¥8Zö­á/ÌöÙç­"*9t	Î<q>ÌÇ3-áÅ8Í¹Î4qi²Í^<ÄóÞÿ-óW8ÞÀEµgAõ ÝCPÞÆç!Y|.ôÔU#Õ}ÔpöilÐH:A(çô¥nKnyÃçßhGä~}î|ÑÚ!AO;n9þÚ'E-¼äá"Yümë@²ë3$EnóÛhåÎó¼î.Õ	T¼j\NÂt»½äý"33üÞD2Pmï-Ûô^>CG~"µÁÉyïï
ÚìË@Q§/N~ÇfÙ~G,uUX'R(_çSÿ§úí~kVØß"£ØG1Wuÿ+O[]:GÐ¦ÿÚÙÝôP	ä/_ÕÜêPY	¯V^&ÿYºH|w§Ï]MÖ=M/}ãïX<O3[ï¾H\® 9/cºkö É1àcubJ7lp^kdÌK}°ÍØ ©aSb6+aõ]= Á#°Ñµ J=MaunêÜ¦D{vY-pA&°Qçð9¢wj¹¿º(æ5:æh³æº£¢Öïo	D ð®(¿¢:æhÏæ.[¢þlIÝDNãð¥[ÂLq"Á¦^è¯«§®é¨³"Ìuñ»$¯cä³£Jìèª«úqUÞêRÏ¤;mq÷×§h#æ÷&=}ëØ_õøeO'Y&)xóÏìPÍ¤,Ví»$üN|3ß,#±C%h[æÚ¬FFGÃª=Më9!1ø³wÂäë#óGó?­XB+dÝ¢<i	%r
·ªpÆn½úHøyùÀ®©Áíú°¬]Ç¢?iM¨øWâáÛàrCêb¼ûÍ;6¿{Í7Î÷EqL8êÍ;óµO1P}S;ù§MÙøwR oÖx·ºú"ít
³°ÚTÜºÁ«ßeÑØ(ÿPI»j2uì|å§ß¶8]ÿ"«¡ì~¹0Äç""#jÝ/ü°Ø_õÒ´F¶µI9°Å§{õ	´NØªEçÞ=M¦	ü
o²µ(¶	_óE£ÿ	Ò±)¸=MNo^õw/	ü)·©³Ú©mê&ëm$d¦MBzc¦Ê¼ùQ%{zí³$kÂDïz_Qã118ªÃ&íçnÉ,QØ&Ô²ªH4
 .6%=}Ô$yÓ¿ý½Ô>ø³Qm}¥ßö®^oÂp11ðO.»Ô
Ì3énJlÓ«îX¤TÁÐ¡¦Ýã¦=Mm6Öø^ä¡IfÂwÐê¡QKfxðÅÐRgã/_ÈÅxèË$;lÊÎ¸Ö0ÀR¹ãòYf.}£ªøèÙ$üZ/>-DG¬HËÒÖä)÷³¬$£B¨ê)¹ÍÞ9[ï©
Á2qé¦ç¬ÿÙ?^ýv{«¸½%¾cÏW=}JÉ	%z®8Zæ%g	vÂS§ëßºûv[së/¶»Ô:ÎÑ\ðåX«TØ-ÍþÊ³4 ÆÎ{ûáÌ$Æ"MÇÞô­YÉ+?Ù-¡î-îÿÌ$ÍóÅÓÚá-ïË\nûûï8GÍ¦v:èI$R²nÏ´ÓÈ2(Áß»çüþnMÐãØ¯lÿN°FÍçuInÏGX%AH|çOÍg Ãýã3Á:±çw}ÖwÄ?CR¸ywÑz¬ÎO²+Ç¼Òf6E6ùÂ¨31·çÞÕYÁþ+«+ã«¼ö=M×q¿êî'½¿Òùßó'[ÊõS8³3Cû~Â¯Q~ÿS¨yL1Ã§1oWï9ÿØè«ÃÏïÙr6W,C@¦ï¿VÚlIÆuÎQYFaÿ÷Xô	C	¯ÖÇ¿&mB¹Á/wsÝþÝ5GAoEYÿOD[¿Â½TÿAXô@C/W7Ýf?~nvgeÆhx; Áàïgg^q¦våga¹aï]xP@aûìàÏò= QlgòwbFÿkø¹p0Qðû«å=Mzvm	4D@³_Uoù#Tð»>n-¢Ò£f\r²ÓÎ($¸tRV°6£$DÂG%ðê£<{1Ì$Í6éX£äØ½Ûß°$2Ñq9fw1Póè¿§èE%GÙqã\èf+D=}&è%Û®¦lz.weo$pS­ýøÂ:Ôé]ø­&èa&ì©¿ëY±,!/ÃOÃ\F¥¦Üì¹µ"ìùÐ³Þ,c×LñÖx¨H;Áïäs6W«XÝ´"3r$uÊÚ"%üäÅÜÁúý0Ç±¢%ÕiÂîXÈ"×w_Ç@~bH(a= l7Í;^:ÍÖ±;Í;ÃÛÍ;VF¬ÎG,^¯\/±$¯E,ºr"sJâ¤/ru§ª\¥¹ÑÑ$*-r"^Éé|7ÙQ8ð¤?¡Â6[r½öpîyß÷Ù,B{+ì3¬Î"xÓÑ,:Ã7(:"î(\Ú¾¦XÇ¼Ý)õùRæ¬¯Ä*_óVùWh{ícÅtv7°¤ªÁgåbuÞzp­²pÎz;÷,>0Û¢ýójÙ\P 4tä	&.×uFß	@·å¦I´êD²Y*;uµä&ö¬x 2ÙìªUyv\ª¥¸Ì<ÒXü*R».õîª=M7µRßü>Y«¥.Ñ&ö2zSËlÍ1æ<(¬CGézÏ-5ð¾6¡Ã[~í4imA1Yá¦½­ÈñV½í0èß1Øô¶§8ÏÌ
.8=}»JJ³Öà®V"åCãôîªGNýóçÔü3¹Ò«ÇB}Á&1JÕýJKt^¾#?ÄØá³: ØÒüÍÌ!*¾fÓæyìþÄ0Óþ¡+f"úX¾ãLm^ÂPEcãcØPáÐHX!&ÔFù±,Ä´ó>U¬:q¦}õfútyËòÍ)ë­»ÍRAÖó·nûxG­~=}Z<DËWmóíÿø]!Ä^"Ã¤¡ëÅÉ1	¥îvµZ¸ôzÁ<¨<B­v?NXDô%;7B§vÁvo>Q%å?®Æø'Æ·i{AEá-2	NÓg;¬ÏÑ-HwÍä§_½î9ÔÄ3Qþ­{%ÙÀ3XÍ{AL±KÇûJÉ|GÐ¿$¬eçrÕ|êÐpfeZD}MðÛ£.ô£Vµn¹ÄDÜ<Ò¨_,ýCðVÕÑÝLðFÛÑ]Éjèì«:zBÊBòã«Z>yæh7ï,S½Ó))G÷<¼R¾ÓP(¥øßt­¼ªO²FË÷R´.@±ï§=Mr~"cÑcïFÍ:ÔWH8KØï¾ZH ¦MRøÐ,Ã:ïW²ê'2 ÃU;~"qÄG/~g3Xü(AÓè/UjWKX¨Üä¨4?G=M1¯WYESKÿ_YÄL\¡ª>V	\<K3\mÿ®ÿXTY!ÇX"ÄÎ!à÷*fyÉ Qîa÷[d<q<¢BeaOoXÚÓ ÿ[cÿiØ <ó= Áz2J5àNfl[À*ÿa	¬ËSåLu£Îj±;å£~zR+$ðìS¢jmqvíWæÔyDÊ(çJ»BðÃOåhqEð·3§ÜñBOBq¤ôËp1­ätyÂVXèµVxÑÉ½$S½q~ëpx§t´
åqÍ>éxP¥$¿öíqV·ê&uÃ>
{SÃ+ø½Ã*lìÉ¦ì¬ºrÔíèF:ñxC¢,g×Â^ôÂä9¨íÂÞvJø4ß¼ü õ¯pþß¯¤­;[Hä©3s¶rîªp6~ªXQ¼¢;i5ÿPcWtçräÁ\Í\®Íû¯Í;Í;Í;Öøû47)Jý_-h}ìhÃ¦ðn'ß¦ÂÜ®ð¢^<jÕëTí¨Ö²>­A9åxCu-¶¼+ÆeI§E"õKj¯¹ß ð]í¢Uj¨»ò½IµND´Ù·´Ñõ"Õµú´y>µ¥óüyr.´é¬[õú[´Zþ²¹Ø­¥úôá*?µÞ·ÅF°×íeIYO3ð¾_µ4(¾§®kí¡½¶l0¦CIlmÉ¹²Ä?Üþ48ÙµÈ\pzù¿É¨Gòa±Õ¶4ô¶GµÖýÄ¥Ô*µ0I¶»§zøüLSGùÔª,0I¤Ç.fýCÛÔï©\uý.¢V4UµG¹tãimý©OLf+k{¼ÏPö¡&Ff{ìLÏ½­TIf±÷xt<À0Îï!<sfxêx¨Óózm¦Ü8~%$ªÀr=M©QL=}kû¨ïóK¬ÞÅ.µßó9­.¬Ù83fóæÛ¬ÿÖ%D¥$=M	[2Ä"·sIØRá¥:vÕ»¬ÌÑ%+ºvyú»¨CóÉ]®ïX=};rë¶{FOÚ"¢Zÿt´këvÑ:R¬Ä=Mí¡Ù¶8£eûÍF:9FOa%&8¨ôÍ«Ì"m	W:ÉK
-u%Fÿ ¦úl\Æ
#änù3.Aèã²!¡Ú´ÏAë#an&tÿI(ùç]{}¥ª.³n½Ì²}" ]Ëç¶?}¶¤Óñ®)3*I +]êiJ4ÉI*Lìë¬é.6÷ù+¼ÎÎÒé?FÉ÷¹7½Ïªg_í+<WÛ®B1ã'B¼~2µÅïöU6RhÙÄyL1Å'V9~2¥_vïágîþQXÙ#üAQ'~2¬Þ¬ÿ©ÝüìùRXÔAkÿWUÝ*H~÷æX$þH³ß/õÂ/_çÜ*»¬ÿ*ïÝÆW±ß[íHü¼}¶Duôø¶µÐ­¹K8¬í¶.w,¾kqTÖ§p%q4Ù¸Q±PXOàbÑc¦lþ¹áànÅbMSÆa5dIsPÐ¤ ^	aÃvf<º{=}·}kÒ:]àæ¾ æGaOgô_¤úè4YåìtÒ¼¨æºÝûåüKt¸:ïn*òð¦{¢LiYÖZ5pÉ)R¦äßxç= ÂàÍ;=M»;Í;Í;ÍSø:*<&ÙçÒZ}Sß#íÄ±%ì4v»xÇö©uþ6(5"ÂÌwëçcïx3"xÄ=}ÄÒÿ%³v¹»ìØÌRö	_ÀZ\Øp5ÛûIÌ~G)½<ÆJ9xöI=}Í!8,ÿÃ·8´8ÊB íÑÍ	Ù+Æ3ûþ­ó/["$èI0	ãÏ©ö/Á ç»µ}Òx?.AµçB#}ìç+çYn6Ì9ApQ£ûënNÝEÀ¼NÝÓ(s!Å¦|÷å«E{jF_ëÑÔ54Å÷A]¼þîÒ-³+B%?6xÃ÷ã¼r¾ÕyP0E!»÷â7QÜíLÁ\½nQ¨ò3Ã¨±ïuª4U¸12C¿·oÃSÒÎüÇBWhÛ4@[ì§\û~&MEéC±Ró'úß~qÂXÔ®BÓã¯>&TEÇuÿ¶mÝ.U):+Ç6ÿ/óÜú.W:3nÿI§Ü¾PÉÒ7G4«³ÜÆÜ]"gïsÐ¥ VaSjf\{0Æ a&iÆÙàècÚ®oØ Læà=MÛbrülæN#àObîçb]nøs¥Pá ³ºáQå¹¬x©ð þÀÔáLÈ¸ÐÞ 8#¸èµH  Ó«ÐRùçñ#ªf&ô¸©Õ©.DóD¹¹­Â,Âæ÷(>òÆ7¨êôÌ»©«ÂÃÞ¿òTÙQº²³©®_ðDí¸{¯ÁÃÆ·ÜHº¡Q¶k%ùêbcu&¡9%ìÅêûõùçt>É¥S{ê;¯t&¨F(§¥ßê1éóÈÇ0ä+y´²
È:4Î	9«ÓÞøXÄ-þYúË&¶1±-ìëúhW#¿Ék­Oú×q¢x×ù[£´/vB¢p*ç´¤þFÔnÁ¬ÆöïY/ À±ö£atÍõÍ;-³Í;Í;Í;Uÿí.¢Òä}IühS¶¤è"Dãq"q¦<êÆZÞîP£î0èP¤KÄr/©*ÇÊ·÷>¸ÊgékÝ*íôµ$iA³Ø$áCrY¨LÙñ[=M$îÿriÁ óá,FùÓ*Ìó	ò,&BÏ^ÎB^QBÿZÄÌõ9Ò°;yÁ§óC,./Ùtùá¬á¸jgót)¼Éªö±½½Üså«}tHÐÃ¢ýÉj"ü)Úåwu:ü°XØ¥K£å¿ÏuZ_²å±±´^®=MªL¼kê	þê
95½@põCs´*/µ²Nõç´äÃ-÷;Ý¾x¿´&
1^2øw»¥jmÁ¼ó &zÅËÊ¼Í
±ó&+Þzý§Ëh_úq«^;×¦*³zûÉDßÑJfß~zÍI\¬.ÙÔFõ0©³µ§9tËÓ	®]ÁÏITúC6ù£§ø:Ì³Hþ.Y·UK5ÕZ\Ã@'p>	{LÌ°âìcã¶lÞ×x0 ¸<ýÅðß!Y-fmnxÜÃX¡Çf"I÷ÌÐ&w3DÃ²óù¬G¹µ:¤x>¼ÈÌ2ã)ï§úøÆÅñ©)U"WCisKê)Lçy?ù|[Å²;Yx%¢8?$«Ç÷¥	BvW»ÔÏq¸2#¢@¼úÈ1Êþå*ÂFÖë¬§®¾ÈØ7¢øA¬ZÆñº\­ý¿³:ì/ÆóíP$	³;F»Óûi½Ì²o6^û¿+Ìä®&c/8ÉùW)ÌÓ-qnßÓ¸ý)¤Þç}f¶×è?$Á×ggÁôSÝ#ôÉnùw¼¸O0Þï£Ø"Á-µgA÷SRý#è?n|çC±½úÒ2+MÌÓþµÑy6 ¥»÷C½ºlÓÑúO<Ó>NÐy×4C·Xg½¾¤_A3Ðq²ïå	êFPØ¾$Ã´¥ïTÕTp¾fÛL}O1Èîç"ÃU¶ïjçüSpöe¾ØYB²U(P÷/58³X*JüÕ:õSé¶+Ç×ÿ¦ýÝ<^{'X4øIlÖ¶ÌR	?G'ÉÿeÜªUYX1ÇD³8WÙ}Àª2à\ùbþGkø¸¯Uàíc&×h(5@Q(àÑ3¤@)Ú±?sð[øFeDÛPBCdtêvR±(,T%SäÜq Ê¨æ:æHu"PpÝÒ(&eU7æä£ÖkÉÕ6ãðCÏ¢]l©Îå\/ xà= ±t?èÍ;ÕÂ;Í;Í;Í;¾a3"4ÕUÏqôÈz¡Lí%uÍsë¥l»Ñï¨áH¿¢<µuÊë'm¥>vÂÊQë>»x¢´~6®q_/vmvê½+¥4Õ=}vÑÂ÷¨Ü°Týuyè1$3g@ÓK=MXZ¹´ðZ¯C_p¦#Ð&þ¦ì8¦ä¦Ð:óýëQ÷ñ øQì±Ò@Êzzxíûyg:xÑ{Úz·[{ùæy!å/©¦Qù&òY&¿+ìÚËì=}ûìøí@)GR±CyÃLCUm$ÝÃ9³C?¦ÐHÓ@çq_o/ß.=M®.(.ø.7X®PKís3ÓóSs<[GäÌJÏM|OHOAlKG{Bd«_-Ðú.ÓîÑò=MÖæÎÔþÎ×âÿÅ§üpcß1Ñ=}©Õ/yY$ÙU*i_¿l=}£àxp 1ÎC:Í;]Í;Í;Í;ÍÃùÃG Çd!MÈâÑeÓsk^tX^ô­ðÀ¸Á!ëòâ2EeË
j¼}á×= 4¢ð=MÀÚ·!/>âãd[§hríwØàG]ù¥âdq7kÏu¼?(Ý¨@]= â.iú¾uü¨[¨Aå@+¡íbÏkð8?üäÈòíÑ1s«ÚôØ×à9S¨ÌÁ©òòKEY
ªv5öäÏÉ3¢Ò	ý§·)<>òðáòvG&©· 9ò åòÆÇ7©Ìõ,<MGnZsÞNü?×5OiÚH/ðüß)^5?W»rzÉt÷ý¯%jõ¸1"{ht*ÜÜê¨åu«~ö³ô

8´»AÝdf°Î2µ9%qêOCt>®@DÌ¥F¥ê9tKtM¿ßOå×uèÚ¾1O
B%Í¥§^îwêDOus óÀ%Ù)u¡ú&%5T¬Ùò²CfÖÆ3úQå«Êúõ7¼
)·§C=Mf4TÏÙ=}µ³ïF0­Zñú¹Ca3ýFÈN2ô¹	9>?­ÁïFOí~Ö¾³DúÆ#}­'ú±??ËúÜ3Ø_ábú2pÁ¤Ô#7æ&©lw³ym!:LæYlëx÷=MÀ²-°!qÈÅx7!PûÕ¿#=M!æ²lx!Tæàæl¯x
Ì|9Ë(Ò$@i¼lÎXÜ70XéAR£ñïæ-?m>ÀªüÔíÄÙv#²EØ²«.vO´pÅÔÞ+?öÖÅWº6|
ÇQæe«»»ÂÔìLÁY=}/2Ö?:OùÄQe9F»ö$¾Ãy)RßçCÞ+óvÏ¿ÐJò?­+æ[ö/3>¸DÇ«ÿÿvOÂ0 Ñ=}ª§ÑLëE(ü0Öçh.EH¶0Q
~î+õ}ÊVÐØ¯ãÍ]>îQ|c|æ>îÕþBP6fÔ|ºN(.Öë)Î',ãn×"A}nÞ½ÑÔMØV0q&0Èaud= t,U69Í[Æ;Í;Í;Í;VÈÃ
jS ([àý¿c\1!0â¢9iÄÔ! âOéeM²i\?¡=}LâÙeëhnõtD8¸­ð
 ?~$Ìø0¡pÔwlHX¸0Áô@%dáß·°Ñé@D¡Aíâ½;e¹Vi6|qXsäÙweÎh<sèâ¡ej^pXävAoõÖÄ)5øòÒiò©jõX«äL{k¨2t÷©¸¹ºcéß¦ðÍ£«¢VòT~Y¬2ÑD-Äé¨Ø ²ÏDFº©5òkÅnª®|÷Xÿäc·ÙÏ«ÖôÄÝ9P®òVÄEÏé«¸tB%LÈêøÑu³s²ì/ 09uS"w±l	hµ¡1úB×}¥/&jßþ0ãB³¥çê×ãuÍ¦¾­°øPj­÷~²:Ø½±ßÿB>q¥ý3jß°KæBF¥íêKu5]°´mQïjµFªÄÏ-Edú*)É¹e%µ*Ê´V62¼Í 	:¼C_u
×1<H	°ÓÓ6-ýú^Æ^j-#Õú¦»¯ÖËú~2ÉÙ¾C?v:>1ÛIX²SYK-Wú¾Ál^Ôß¤£xæQlAóz¦H¬æQl^ÛÁÊ±£,2æumiÊxv5ÏÊ¸9:@xVÄKÏ84ð×ìA £1ùæóSm^éABz£-æ»mUnx~ËØÛ9@oyTÞÎhY.Të¡]¬hÅév¸Æ»«"ÈöÅÑÉr»D(À9û-²%?ôÉº>²úEÁ}«ë&ö×½¸\«# v$ÁôZ¤+<IöSËö¸\¹#íö¢W¹|<ÍÉÐ)R\æ]Ý+Wö^Ïq»&_$hIø>ñ2¤ÑDìMø0±åC²§Mî}ÍkAH¿.q´Õ¬Mè=}(å½Û'VîâÝ|f
ìÔ<}OÈ-QÑîWÂ§µîQ{|öLÕB8Ù*±DC<Õ§-Ûî'¯|M¾ÞÞÔlYAÐ_ygeÖ= ã÷òÍ;F·;Í;Í;Í;ÛF¥F%,êñu{¤ñB¸Ü¥ÄêÉtF´l èâÂ¦y¥2*êmuYz®³´ÍØ8¹1÷B7= %PAj®Àê=}Ì%åêBt·6zÎµ;=MHÓ¨qQÂ:Ù¥2Ëêí×te~.´4^ ØQ­1¤qìÆ²­1ï)w¿Ó	¶z-ë¬úNAjÈt39´©³F¢Ý­]Æú×ÍÝËV2,y ©¼ÛTt-=M¹ú¶köË¦=M3$>
¹»ó[ðF4i­MSú7·OÈ6,Ù	©W¡Oû¼èF^_¢ç¨"¬êéÌ­ð¦þ©Èù³Xõ¿x³¬è¿¦¸¿©´³¼¿È:¬X>¦x9¹è3«¸ ¼¶È¥X«x°è¢¸®µ»ÈÑ¨XÝ¢x×¾¨Ô­8Ú§Q¸]²È_¡h^åh	#xV¥´t#3xæþQm±óyâ{éLùmÒzJuÜÆx¾&pÁÃ­£PÑùÝ»£øæùlIgzno4|Çh®f/$ºÄ¸"pD­<:ÊÈ'pVXö(Ô!Ð\úN½#G'æ±lizÝdwsï#¸Ú¥èèÉ)ÿ Òù­º«P÷Ó¡+©m*ºÞ´ìÅ©10r|®´ËÇÙ7%^+qöÒC/ºâ?éxëK·ºêÏ8ÆI7§®¹â[é7½O¹ßÍX)ÒSç3?î@åÂÉt§aKq+1ªj'Ôîâ¹}!y¥÷¢îÈ|*j·Õ<=MMH>(}!¥QÎîçÝ|ÝfÂìÒÌú@=}QÂè:ÓJn'çÝî§}.n¿ÒdouNÓÄÞKW91J÷<þ%A!±%ÍGIq'CrÛTô-@Ùõ-X¸2³âG×/ìþÌ­÷ºÙÔTdu[ÙªlU{My)óØÇ_Ü¯=}Åþ@Â6Æ¯.½þËg½îÛL/&þj!é%8wþOÚº^Ql=}= p 1-¹;»_Ì»Ë;Í;Í;Í{×³²u¬¬óÚ¹WâÙeKjk^¨Z
À,;âWr¤«ë6?iÒ]¸]@?jâ$5ÃÎLé]¶â}eÙÚ$]ÞâÒ£e)'h¬rÜ³pmstº8¹°Í÷]¡!ìCâÏ.i/¥?;âïdgr¨z÷øÔòÅ¹ßÉ©xó¿¦´¨ÒìSKòO©ÖÜ	Uõ¾,_½R+ßòõÊª>Ë7¬2=Mú¿LH	°òÍäÄ1)O³iG¨&ò¤oìK©ªOõ|ÉÚªòCÄMÕ©"¨W´B'´ê'ytÐê«u1qÔ©%!÷u->²DZ°A¥Ïuùß±¤Ãì*ò´³¬
XBÎ«%@nê×¦7Q&È%éêvtYFµ4¹èy×|°ø×¶Q[õØOÂR£¥Ô+Øø¬=Mæú{ª3çF=M\úS¥1LKúÃOÊ:ÝZõÆ?oúÆËR]é>ymÊÊ¢c-&ÆúúÍ
ëÆÕ­õáúÈÔü\´­æúåë_49 ù­sý²|1,YUIm-TÛúÿÿÊr¤£ízrj#tÇXï¡Á#DòæO¿éQ;^&ÿ'Xx_rÇ^îSuBÜ£7¨<$=MõA÷îæl[yÞ{Ê¨&p½^úÉ¨ ßùAæl»l«Öy|¤íõGlµz4}#Z§æ:iåÅË«T<(ÇÛÒººvtÎ¼62Qm«9W1ÚG7öÞ¼Y#HßkµWÊ¹&¤gîdM3ºÞKÃ©8Ð"d«IöÈ$±ÛéGÊ+.íöv%V»î}ÔÃéÞ|÷ÏºfÜR<R	ÃÂz'/ù}ô:Ò´(Gp¥}{ªzF(_C= în¿'%?|c_ÕÜ²)QæÃÒÝ'Ï-|É:©§¾n0Ã5§		î}Ýw·'ãUî©;B.¾§:îE|Ò=}Ð¤+îV¯}Q¼®Eyú1SõPRþÙ1£õRÌÝ%3\Í¯)ïÇWlX.SIþÈ@âG_J~±/©üËM5)ÓçZØÜ,óÐÌ9³Ñö'TL¼NÉ.sMMVìDYQ-e/êËþ×eÿØ§OôadþÆk,áRc°À·é WØC=M =Mobsk\QÍèßy8X· ÙY TX¼Ñ@'¶á}cËgzUktzè¶£eûy¨Ê¹ !: áÓÂOÀLýh¸ÝN=}iôÜ|øg³DzßÄ(öãmgÒE@Eâ¾g"¼1!®q °¼ø= = = pý¾JNsÕTfh¶U¿3ÿI?m­38­­3<­3:Í­3>Ô}­39Ô½­3=}TP#¯3+TV[«Ä±= 9!N N9ëFããçNæ¹ÔÍî8èá=MóôÐÈL*öN»OLbDß_Þ>Ú4ïôÙJøG?Pq^]])Ü_m#JÊ­>U;zyÕ{2ÐPPú}ÀåÇXO}ìl_xî55âÞìIÀ@q·nc¡&þ¶+AüæÉÕØsN]oNÛ&TßþÛiëÎ¥oôô6 EÃº§dE£õÙ£>åxè5/Ü<*aþG#¦OûXqd[ÆHÅ­U>|]Ot:ÙçÁQvãìWtJisÛªÑ<~!K/¬Z.3ÔÎ¨¡í%MtÞ«Þt7CþO=}+ãJX<ÛIÃ_#{=}+ìüÎÖ÷¢Ú;Só²tSE.cãäLèQóÑhí¯=uAå:ÿÙ¹âÞ¸äEYlZß{ sUíÊO¯²xðÊln$z_tÑì¹"Ù=}aLD²  ÙËÿ¢%îªé"4-7w>÷A'ÒjtÑ<?Ët)IÛç³´üÞÅöxOÐ:åå³0·KAÜü÷ê?N¯1Yu¨4År(ç"×ÎÞtöûxõ5ÞpoéÝL¦!Ûí!ïWyWZÆ5d·j9Qo¿BMÝk|MLÃÊ¬¢[T,LzRØHÖ8«Æet2.ýÛ6èÔÜe;ÕøÕ«1GIþih.¼Ð±PY5#ÌkJ>Y ì­!Ó¤xLÖpOU[VD1j
Ù£þ\è¦¯ÚFÝ+þ+H´Óö×4Mù®A2A1:)ÈT@GÇB´©ô¯v ÕËlÒê&°ò·ÌwÉwã¼µ}UÇxe»±^³ÅCØ:Æ;w
¬!ZÇ'¿=}	ÈÀ
_åqÝdæ©T$CQÒ;?iÌÖ	ZÀ'oÓÔ/Þ¹EKGPÔ,Í{z²Xþ ã¶ú!KZ\CHkí.·d,
Ã¦ÞÑÎ²E
Çd¢Ì·üzçvÈ8þIð$¿=}»¥áÇëSçøÕpÐ«Ä{Pê5FïÊ#ê÷ÒÔ.]»áéYu>\¬0
¤Oqd_ñ<ãÈ2üo¦ohÌ{ÜC©õ= 5R+Np¸~cj438ZÑ¥áBMË±ÈIj=MFî²b»~ù Ã[3À¦þóÁªzÉ	XL*Lk7i¸ý´ÔµUÀÃÎMéîdÔ&÷<I9ê}7qXNCª~WØÐJÓßZ°­eJ¸Ú¹+è 0,·oO ]×o	tpxI[IsºNÊ9ï ;|CNÊ F{óöDp0SÇ´«£öSkh/rzõNÃ]eïLê^DáÓÖ´OÚjîCHvO¥ PmÑ«Æµ¶ÉøÿÁ#=M=}jØaºGda_y%s6è|;.Ñb+vØö2ëj¼=MçÛDxáHKzieáÃÔj7/oùyà|@OÞ÷x']:%ìËmMVÿuë>îÄ&%ò+©vMÍù!ìó¾ÒF
-è'WÙ&K>C&ñþohÚ|Xl^M×	M i*O\dõQ¼[?R*øO)= DË¿UåA?VBú;'WÁõùf«yÙU½APz;T¤¦ÓgÆH&ÚêÑ!½¿ÅT¸>F8ôæ(­;/q°ªzG&ðÔÎ²[=}¼b÷>Þ¿ÓÕJ"X¥áá·d@t3+³5xÛùÚÝ9xSÝg2:ðÇì^<S¦Pýa9È&>+Gf¿+Q Î·wË¿QÔGå!ØSçhD^Z $¤î}MÛî¦÷pñÐ»ã$A{#äÞ¦&Nj£2ïÅh<ìxU¤d¼XÌæ?bÞkÜwlýàc¾ØL@¶qÈ¶ÝZÞÖ²¿Å]îéû^lÛùéµòº¥{ýÔý %­qâ¸ÞM?&iJÁD-ö|
ÞtíßÉmÂB¡]Ü+,t´0]HËb;K=M³×¨W*^E#iá{å½K:×ê#s¿hxÞNôtKÎÜ\wß¥á.7ö-8"WÓ4= C©{âþry~ÖÜÍQ°j5=}¾ºg¤<¦÷)YçEÛ«ÄØD<¶j½|³°páüCÇY_:i:¾@õ'ÂVÏ|¹ÿZv94¿]Ée>¬ÛýÊÔY5ðt/ðglBôÖ¼êùþ&ù\\= ~e	ØÇBÐKµvtÒÕj'ªQG$r|ü}ßNhüJMúá"XeæÈÜF^4Ç>lÝÙÙCiê³K|\ò¯!¨ßÎR\ÅÞdåÙf÷æ/Ïî&¾ù4oMÐßå>UuéØYQÏó-CN3U~Ò¥ä£R5²jÁA9®OÏ' x;®yt*z³µÞBnI	s¥ø\ºXTÐAÞ\é¹Å¹¤Ád7h·ª02­Ä6mjÊOÒ38H0íÍVÍj¾'iyúi<øÚ[Aù>S{:rYOâ^®~µ+LTr IñE¶Ù{õoÕ¡ÿ"²9u¿¤ê¸¢¤x­Éuû%Â=M=}Öòõ*øO/RéTGk½¢c\X¼ÿé° ESôb?@= ö¨(BRe^³·w¶$á?vÁòÝàññéÉàÿõàÂÑÝX!a_ÿÓip]{¥Äïèt\×Ýù@ýe£pæåëëËôªÍo{pI&ø"±ôh#$ {É3Á7ôÎðGWþ^wGàëëlçÜ$(±bâ¢HÔjì	tyaì\ÿe= _>Kx=MÕÃ ¦äÇÆ²4J$
çG1ÉèUæÿR0peÀõ s"¿uøqVìÏßÓÇfÿÕÂI¼ÜhÔeÞ¬êD~TÝØÝªó­^ú¼L08B2ùT,6ÁHls.îÂòÂeC;õjä«¸N÷MÔñ_Ê¡ú4aÜÛ,²/¶ei;x¤S·Æ? (tqØn1ùyuÕüG½\¬Öºþ¢ÈZ§îüEJ´k¢U|Pz¢JoÃddôuA©<Ø=}åÓ¨nre/§XÓ}»]ÅiÖÆ&ÉìÎ5ÁVìÈý±ìr|¢5§÷õ/ü½7 jò«SùE<,õþýþ=MåÏ»=M§ÇBÕÒ®kØE6çòg:æ<ÿº¤$òkRð6ÇFdØG=}¾Ùtý§5j²þÛñrÛfÕó·´JÔÑÃ&Nc8¼òÅ¯Å6¾|Íæø(Ò¶ù]ú8#zø¿"KoÍþo³É}}éR¦oÁ+éÓÆöU 'êÙo±Y|('L½wôAìN«¤{9=} #åþ/ó¦@Ïx³´â0±ú«p+¹¯[,¸$ûÅq^ó=MP¿ì.C;©M+Í¼Í(¤[w4·Ñ3"= +Ò¦«§QB¼jbÍLPPE¦þö«îqT'ÿ<j9&N*¬DÃI(TOÆÓM¾¦Ñz2Ñ/)lÅRso¦ª®ÅRRktÌ@ÿ¢ìOþbÖ¾zJcã¢6= ª9³^ãý\;J'¯YNñÜ´dÛÕ°p'øÅM|ûÜñ$þ<"êµtyËB*8óßúíÒ)É^r½í^¿ÏIÈlDÓ$y>Þ,E|[NìååzIãC¹Ùe[wVN4¼åï(X¬RÏÔO7¤É4l&í}&zgDÞÌÁ¥"©Vßz®FKeÔÛ'@Ò·¤û~q£*	þÍ: %HFüµÓío×=M}7 /Üd§bÝ9ã­nµs±¹	"V?oÖO«öÍÖÃìÐýî¬Ûåô@,§¥öNå|MuÃõ2M£±Ér)³ÓR=Ms'
cñ;þñ±¹Øh¦0gfXnµ8E¬Ô/Àx(àpôU{h3¤]þp$~Þ¢±{qUåLP*Ð®jÃ"G¼\Î±fíós8NîµhöIn¬Å¾/;¦Jàt?~Ô±ý1³shô´$&?}ÁÍµ&§¬Ãã¶bÏDÑK[­Ö¨®&/xYãw)#h½ßä»¸wâR³dy§ä
\MÔæu°ôæ%1$
÷Q¾í$hJm|ðÎ yç@íl4
ÓSºí*\zìM!&8îO~ÃäùÉæÐJ­E ¶2AíZÁw2%(rqZFi°]Þ«O¥Á]dÊÅ"X"ô´G?ÁzKÌCØþ{-x=}iÌ_ìYNØfï°Ì¥û8MVöFÏÐÁUvjÊ~òÀ÷æÛ¥e/æ/D®GÒ)¯VÀÅm=}F·RK	¥ñZß/ãmüÜ{9:g<X­kÎýÙ³o,¦ÿ"zÊdÃÑ¯xïG6Ëè®öNÝfi]©À6O=}½pè 'Ïo§<¤xäîöV
(êgÀüYõÛÿÎÑ"5í¨Û­ôÓÒªíöD+%9³î²)½féB¼>=M^Ó× ÊRÓ²×|ÆïEü­ûÑxK­4ùUJ
=Me¬Ñ ¼I§tBùÙÿËÊhìBKý÷èÖ/EäCÛæx"ï°Ù6õ½Å®TN½ßáYÈ²Úmø´³â×6³4Fòö©QUqÒ:áâéx²ø@åâa¬}Ã#É]°îÆ°ëSÏoPl¼$VÿÆ¿&!É}ÅC¸·mYþlýCÑCì£ùu£ôùe³ÕO@q©IüÁL=Mo@©#c×ÕÂÌéÁâ.ä<®BÎ.³øÄ¶_ØWEÓ£ û|%h4Ù2ôÝ^ç/MZØ9Ð!êJÅ.DCEîOjÉ	ù¢ú6röë'Dàe/Ñk©!üQ¦?ùÃàÅ!±ÄfPIÕSê9ÝÊ¢­ålµæBFTö;ã¥äkEBÅGDô½¢Çÿ¥óüHè§Fï¦N©C{ØÛ×|[3vP!Ûw[âx'?BÃQëÀøì·nøåIÆ
Ý4XÚj!É	tüy ®ê¶Üj5êNuCù|/Î¥(ùfÒ\}GBa}9ë¬ÅÐ,Ê>ÔTÓ¼;õaÒÜÙÙøáôØúß£ÁQst1øË$TJßXÛÀ]ý°ü±%ô#w"FÙ(ú4ñ³TúrùGqîñ¨Î;åN&X®ú ']©lôÔ£^÷ßP9ôZýÞá5Æþè"Ò+e>øÅ!èýé4O½é\ìÚÎé¿Ã<Ò·²ÝP÷G o³áa\Õó ÙÊÈ/#nó/i|ò4 X3eìëBüJ}B'CÊ×»Pv+?/0[¬íÁWPúuÓ1²§=}js>L7"^ûaSeþV±}$Kkï-§-ä=MÎ¢,õm ÓåáORAR«¶UKÄZåysê<z¤¤?¢¾Dvâ:Í¹±x q£FfÈW·dsï[ÞÒ3,þ,)ó\ðâWÜU o)îÔ;g{;{k¹zÞç¬¤Í£
>z'Uüïð®rçÒÉäÀÔÅnË/vGð¾Sùð
¢ÌGÑúÞÂÎpW);'øÈém<O­D°CË®7»
üb=MX¿&OÈæ~D0ØüµÖ¼ÊZ.ÓxHÁ8¶ÃúVZ_¸Ðìþ¾_<¾½Þ¡>È.R[ÕD_J|gºú|jý/ÍCNMB:Í;Í;Í»%]ñ<ç»UðZ®ýó.4»>@oG'[Gq	·¸A!çUV1hr^ÓcëÁÀÜE³³~÷ æ«öq¤ròFI¸b,B®ÀàRÂQÃ¶J}^«VÉkÊb¸Ísp&Å³À\à4eS Âúà¦±&?I,Õ«;Ëbz Ã°&·½ÆF*	GÈßúÈÈ¨vöâÈI²xß£M,ÉzdCÓþ{F+	kvÉÓúÈÈ¨vOËp&©MbM¯sdm)"NÛWMÐP0ACuÔE¼µýØºI¢'73X+ÇB<øµIï/ÜÖ*ïÿj= ¿v]¥¿<}êÎÚH_éàûêþÚHûêbbLu½¯Ô»1¥ÏpÝ£To1ºbHÞÇê>¦³TÛ1f#X*G\ËT= >øl! = si&fËÑ1ùHÌp=MëÀÓ¢Ryÿ­¶«.gi¼jeÉæDÝeâràÀÈ¦ã1ëÈZa=}à£ !A@Ú|iHâ§ÀhxÄAÀÑ ió¥÷ª¿¶é%ø|ãcÁz0hi,Ç¬=M*ì!xñfè«¹= n­)ãòâB±é©©±ápÚzõálrzÊceð" ñ"¨º|Uá±¤ê DèõyÖdñ8ò~bÙ+ªîqÛ¢n¤é#ôà*é¼ $æÜÌ	ºê¬5chüsÒÂ¦Âx8·æ$Òî¼m·/%=M¼cÓ,Ñ¼û,ÐLjû*%Ò*Lzç"ÒSL{ÇyÖ¼b7(bÇÄ»øè»@¸¹»&,$<«iÒ«¼#Ñô-å7$	Ðñ¼+®#M<c×/ÅVý»Â¼éÐHLÓF,¼ðÛDÎCÎ)p³EyÅ¦ymÇÐý1È¦Ay/¨ÒúÂ"Åª³Êþ"*I£±ýô&jã²¢½a¶ª±<õºuø2ê2Ùªv¤ªªee²û2+ô
ôø2ô:õbªK¢á¶ ô>ªçbTnCÓ¿úRC=}XSó+¾ÝR+GÈÒ3Eo]$o>Ó¯ÜDÉKÑEuOXØwOsB­Õor¿[]í¯ÞÉR-óëÐRóB¯NU [¬ÙA#WXC#Ñ@H]Ñ7[$¯ÙM¯<@a;Ñ%/&¯E\XWÿ>7_ÿ9Ï0ü[_Ç]6>%^ßNÞÝã¥?Ï7G×}Èdx¿[RôíãQ²7þHï?Þ·}kCÏBÅCÒ` });
  var imports = {
    "a": wasmImports
  };
  this.setModule = (data3) => {
    WASMAudioDecoderCommon2.setModule(EmscriptenWASM, data3);
  };
  this.getModule = () => WASMAudioDecoderCommon2.getModule(EmscriptenWASM);
  this.instantiate = () => {
    this.getModule().then((wasm) => WebAssembly.instantiate(wasm, imports)).then((instance) => {
      const wasmExports = instance.exports;
      assignWasmExports(wasmExports);
      wasmMemory = wasmExports["j"];
      updateMemoryViews();
      initRuntime(wasmExports);
      ready();
    });
    this.ready = new Promise((resolve3) => {
      ready = resolve3;
    }).then(() => {
      this.HEAP = wasmMemory.buffer;
      this.malloc = _malloc;
      this.free = _free;
      this.create_decoder = _create_decoder;
      this.destroy_decoder = _destroy_decoder;
      this.decode_frame = _decode_frame;
    });
    return this;
  };
}
var init_EmscriptenWasm = __esm({
  "node_modules/@wasm-audio-decoders/aac/src/EmscriptenWasm.js"() {
  }
});

// node_modules/@wasm-audio-decoders/aac/src/AACDecoder.js
function _AACDecoder(options = {}) {
  this._init = () => {
    return new this._WASMAudioDecoderCommon().instantiate(this._EmscriptenWASM, this._module).then((common) => {
      this._common = common;
      this._inputBytes = 0;
      this._outputSamples = 0;
      this._frameNumber = 0;
      this._input = this._common.allocateTypedArray(
        this._inputSize,
        Uint8Array
      );
      this._channels = this._common.allocateTypedArray(1, Uint32Array);
      this._sampleRate = this._common.allocateTypedArray(1, Uint32Array);
      this._samplesDecoded = this._common.allocateTypedArray(1, Uint32Array);
      this._outputBufferPtr = this._common.allocateTypedArray(1, Uint32Array);
      this._outputBufferLen = this._common.allocateTypedArray(1, Uint32Array);
      this._errorStringPtr = this._common.allocateTypedArray(1, Uint32Array);
      let ascPtr = 0, ascLen = 0;
      if (this._audioSpecificConfig) {
        const asc = this._common.allocateTypedArray(
          this._audioSpecificConfig.length,
          Uint8Array
        );
        asc.buf.set(this._audioSpecificConfig);
        ascPtr = asc.ptr;
        ascLen = asc.len;
      }
      this._decoder = this._common.wasm.create_decoder(
        this._transportFormat,
        ascPtr,
        ascLen,
        this._channels.ptr,
        this._sampleRate.ptr,
        this._samplesDecoded.ptr,
        this._outputBufferPtr.ptr,
        this._outputBufferLen.ptr,
        this._errorStringPtr.ptr
      );
    });
  };
  Object.defineProperty(this, "ready", {
    enumerable: true,
    get: () => this._ready
  });
  this.reset = () => {
    this.free();
    return this._init();
  };
  this.free = () => {
    this._common.wasm.destroy_decoder(this._decoder);
    this._common.free();
  };
  this._decode = (data3) => {
    if (!(data3 instanceof Uint8Array))
      throw Error(
        "Data to decode must be Uint8Array. Instead got " + typeof data3
      );
    this._input.buf.set(data3);
    this._common.wasm.decode_frame(this._decoder, this._input.ptr, data3.length);
    let error;
    if (this._errorStringPtr.buf[0]) {
      error = this._common.codeToString(this._errorStringPtr.buf[0]);
      console.error("@wasm-audio-decoders/aac: \n	" + error);
    }
    const output = new Float32Array(
      this._common.wasm.HEAP,
      this._outputBufferPtr.buf[0],
      this._outputBufferLen.buf[0]
    );
    const decoded = {
      error,
      outputBuffer: this._common.getOutputChannels(
        output,
        this._channels.buf[0],
        this._samplesDecoded.buf[0]
      ),
      samplesDecoded: this._samplesDecoded.buf[0]
    };
    this._common.wasm.free(this._outputBufferPtr.buf[0]);
    this._outputBufferPtr.buf[0] = 0;
    this._outputBufferLen.buf[0] = 0;
    this._samplesDecoded.buf[0] = 0;
    return decoded;
  };
  this.decodeFrames = (frames) => {
    let outputBuffers = [], errors = [], outputSamples = 0;
    for (let i = 0; i < frames.length; i++) {
      let offset = 0;
      const data3 = frames[i];
      while (offset < data3.length) {
        const chunk = data3.subarray(offset, offset + this._inputSize);
        offset += chunk.length;
        const decoded = this._decode(chunk);
        outputBuffers.push(decoded.outputBuffer);
        outputSamples += decoded.samplesDecoded;
        if (decoded.error)
          this._common.addError(
            errors,
            decoded.error,
            data3.length,
            this._frameNumber,
            this._inputBytes,
            this._outputSamples
          );
        this._inputBytes += chunk.length;
        this._outputSamples += decoded.samplesDecoded;
      }
      this._frameNumber++;
    }
    return this._WASMAudioDecoderCommon.getDecodedAudioMultiChannel(
      errors,
      outputBuffers,
      this._channels.buf[0],
      outputSamples,
      this._sampleRate.buf[0]
    );
  };
  this._isWebWorker = _AACDecoder.isWebWorker;
  this._WASMAudioDecoderCommon = _AACDecoder.WASMAudioDecoderCommon || WASMAudioDecoderCommon;
  this._EmscriptenWASM = _AACDecoder.EmscriptenWASM || EmscriptenWASM;
  this._module = _AACDecoder.module;
  this._transportFormat = options.transportFormat || 0;
  this._audioSpecificConfig = options.audioSpecificConfig;
  this._inputSize = 2 ** 16;
  this._ready = this._init();
  return this;
}
var TRANSPORT_ADTS, TRANSPORT_ADIF, TRANSPORT_RAW, setDecoderClass, determineDecodeMethod, decodeAdts, decodeAdif, decodeRaw, placeholderDecodeMethod, decodeMethod, init, AACDecoder;
var init_AACDecoder = __esm({
  "node_modules/@wasm-audio-decoders/aac/src/AACDecoder.js"() {
    init_common();
    init_codec_parser();
    init_EmscriptenWasm();
    TRANSPORT_ADTS = 0;
    TRANSPORT_ADIF = 1;
    TRANSPORT_RAW = 2;
    setDecoderClass = /* @__PURE__ */ Symbol();
    determineDecodeMethod = /* @__PURE__ */ Symbol();
    decodeAdts = /* @__PURE__ */ Symbol();
    decodeAdif = /* @__PURE__ */ Symbol();
    decodeRaw = /* @__PURE__ */ Symbol();
    placeholderDecodeMethod = /* @__PURE__ */ Symbol();
    decodeMethod = /* @__PURE__ */ Symbol();
    init = /* @__PURE__ */ Symbol();
    AACDecoder = class {
      constructor(options = {}) {
        this._onCodec = (codec2) => {
          if (codec2 !== "aac")
            throw new Error(
              "@wasm-audio-decoders/aac does not support this codec " + codec2
            );
        };
        new WASMAudioDecoderCommon();
        this._audioSpecificConfig = options.audioSpecificConfig;
        this._transportFormat = this._audioSpecificConfig ? TRANSPORT_RAW : TRANSPORT_ADTS;
        this[init]();
        this[setDecoderClass](_AACDecoder);
      }
      [init]() {
        this[decodeMethod] = this._audioSpecificConfig ? decodeRaw : placeholderDecodeMethod;
        this._codecParser = null;
      }
      async [determineDecodeMethod](data3) {
        let transportFormat = TRANSPORT_ADTS;
        if (data3.length >= 4 && data3[0] === 65 && // A
        data3[1] === 68 && // D
        data3[2] === 73 && // I
        data3[3] === 70) {
          transportFormat = TRANSPORT_ADIF;
          this[decodeMethod] = decodeAdif;
        } else {
          this[decodeMethod] = decodeAdts;
          this._codecParser = new codec_parser_default("audio/aac", {
            onCodec: this._onCodec,
            enableFrameCRC32: false
          });
        }
        if (transportFormat !== this._transportFormat) {
          this._transportFormat = transportFormat;
          this[setDecoderClass](this._decoderClass);
        }
        await this._ready;
      }
      [setDecoderClass](decoderClass) {
        if (this._decoder) {
          const oldDecoder = this._decoder;
          oldDecoder.ready.then(() => oldDecoder.free());
        }
        this._decoderClass = decoderClass;
        this._decoder = new decoderClass({
          transportFormat: this._transportFormat,
          audioSpecificConfig: this._audioSpecificConfig
        });
        this._ready = this._decoder.ready;
      }
      [decodeAdts](aacFrames) {
        return this._decoder.decodeFrames(aacFrames.map((f) => f[data2] || f));
      }
      [decodeAdif](aacChunks) {
        return this._decoder.decodeFrames(aacChunks);
      }
      [decodeRaw]() {
        throw Error(
          "@wasm-audio-decoders/aac: decode() and decodeFile() are not supported when audioSpecificConfig is set. Use decodeFrames() with raw AAC frames."
        );
      }
      [placeholderDecodeMethod]() {
        return WASMAudioDecoderCommon.getDecodedAudio([], [], 0, 0, 0);
      }
      get ready() {
        return this._ready;
      }
      async reset() {
        this[init]();
        return this._decoder.reset();
      }
      free() {
        this._decoder.free();
      }
      async decode(aacData) {
        if (this[decodeMethod] === decodeRaw) return this[decodeRaw]();
        if (this[decodeMethod] === placeholderDecodeMethod)
          await this[determineDecodeMethod](aacData);
        if (this[decodeMethod] === decodeAdif) return this[decodeAdif]([aacData]);
        return this[decodeAdts]([...this._codecParser.parseChunk(aacData)]);
      }
      async flush() {
        const decoded = this[decodeMethod] === decodeAdts ? this[decodeAdts]([...this._codecParser.flush()]) : this[decodeMethod] === decodeAdif ? this[decodeAdif]([]) : this[placeholderDecodeMethod]();
        await this.reset();
        return decoded;
      }
      async decodeFile(aacData) {
        if (this[decodeMethod] === decodeRaw) return this[decodeRaw]();
        if (this[decodeMethod] === placeholderDecodeMethod)
          await this[determineDecodeMethod](aacData);
        const decoded = this[decodeMethod] === decodeAdif ? await this[decodeAdif]([aacData]) : this[decodeAdts]([...this._codecParser.parseAll(aacData)]);
        await this.reset();
        return decoded;
      }
      async decodeFrames(aacFrames) {
        return this._decoder.decodeFrames(aacFrames);
      }
    };
  }
});

// node_modules/@wasm-audio-decoders/aac/src/AACDecoderWebWorker.js
var DecoderWorker, AACDecoderWebWorker;
var init_AACDecoderWebWorker = __esm({
  "node_modules/@wasm-audio-decoders/aac/src/AACDecoderWebWorker.js"() {
    init_common();
    init_EmscriptenWasm();
    init_AACDecoder();
    DecoderWorker = class extends WASMAudioDecoderWorker {
      constructor(options) {
        super(options, "aac-decoder", _AACDecoder, EmscriptenWASM);
      }
      async decodeFrames(frames) {
        return this.postToDecoder("decodeFrames", frames);
      }
    };
    AACDecoderWebWorker = class extends AACDecoder {
      constructor(options) {
        super(options);
        super[setDecoderClass](DecoderWorker);
      }
      async free() {
        await this._decoder.free();
      }
      terminate() {
        this._decoder.terminate();
      }
    };
  }
});

// node_modules/@wasm-audio-decoders/aac/index.js
var aac_exports = {};
__export(aac_exports, {
  AACDecoder: () => AACDecoder,
  AACDecoderWebWorker: () => AACDecoderWebWorker
});
var init_aac = __esm({
  "node_modules/@wasm-audio-decoders/aac/index.js"() {
    init_AACDecoder();
    init_AACDecoderWebWorker();
    init_common();
    assignNames(AACDecoder, "AACDecoder");
    assignNames(AACDecoderWebWorker, "AACDecoderWebWorker");
  }
});

// node_modules/qrcode/lib/can-promise.js
var require_can_promise = __commonJS({
  "node_modules/qrcode/lib/can-promise.js"(exports, module) {
    module.exports = function() {
      return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
    };
  }
});

// node_modules/qrcode/lib/core/utils.js
var require_utils = __commonJS({
  "node_modules/qrcode/lib/core/utils.js"(exports) {
    var toSJISFunction;
    var CODEWORDS_COUNT = [
      0,
      // Not used
      26,
      44,
      70,
      100,
      134,
      172,
      196,
      242,
      292,
      346,
      404,
      466,
      532,
      581,
      655,
      733,
      815,
      901,
      991,
      1085,
      1156,
      1258,
      1364,
      1474,
      1588,
      1706,
      1828,
      1921,
      2051,
      2185,
      2323,
      2465,
      2611,
      2761,
      2876,
      3034,
      3196,
      3362,
      3532,
      3706
    ];
    exports.getSymbolSize = function getSymbolSize(version2) {
      if (!version2) throw new Error('"version" cannot be null or undefined');
      if (version2 < 1 || version2 > 40) throw new Error('"version" should be in range from 1 to 40');
      return version2 * 4 + 17;
    };
    exports.getSymbolTotalCodewords = function getSymbolTotalCodewords(version2) {
      return CODEWORDS_COUNT[version2];
    };
    exports.getBCHDigit = function(data3) {
      let digit = 0;
      while (data3 !== 0) {
        digit++;
        data3 >>>= 1;
      }
      return digit;
    };
    exports.setToSJISFunction = function setToSJISFunction(f) {
      if (typeof f !== "function") {
        throw new Error('"toSJISFunc" is not a valid function.');
      }
      toSJISFunction = f;
    };
    exports.isKanjiModeEnabled = function() {
      return typeof toSJISFunction !== "undefined";
    };
    exports.toSJIS = function toSJIS(kanji) {
      return toSJISFunction(kanji);
    };
  }
});

// node_modules/qrcode/lib/core/error-correction-level.js
var require_error_correction_level = __commonJS({
  "node_modules/qrcode/lib/core/error-correction-level.js"(exports) {
    exports.L = { bit: 1 };
    exports.M = { bit: 0 };
    exports.Q = { bit: 3 };
    exports.H = { bit: 2 };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "l":
        case "low":
          return exports.L;
        case "m":
        case "medium":
          return exports.M;
        case "q":
        case "quartile":
          return exports.Q;
        case "h":
        case "high":
          return exports.H;
        default:
          throw new Error("Unknown EC Level: " + string);
      }
    }
    exports.isValid = function isValid(level) {
      return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
    };
    exports.from = function from(value, defaultValue) {
      if (exports.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e2) {
        return defaultValue;
      }
    };
  }
});

// node_modules/qrcode/lib/core/bit-buffer.js
var require_bit_buffer = __commonJS({
  "node_modules/qrcode/lib/core/bit-buffer.js"(exports, module) {
    function BitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    BitBuffer.prototype = {
      get: function(index) {
        const bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
      },
      put: function(num, length2) {
        for (let i = 0; i < length2; i++) {
          this.putBit((num >>> length2 - i - 1 & 1) === 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module.exports = BitBuffer;
  }
});

// node_modules/qrcode/lib/core/bit-matrix.js
var require_bit_matrix = __commonJS({
  "node_modules/qrcode/lib/core/bit-matrix.js"(exports, module) {
    function BitMatrix(size) {
      if (!size || size < 1) {
        throw new Error("BitMatrix size must be defined and greater than 0");
      }
      this.size = size;
      this.data = new Uint8Array(size * size);
      this.reservedBit = new Uint8Array(size * size);
    }
    BitMatrix.prototype.set = function(row, col, value, reserved2) {
      const index = row * this.size + col;
      this.data[index] = value;
      if (reserved2) this.reservedBit[index] = true;
    };
    BitMatrix.prototype.get = function(row, col) {
      return this.data[row * this.size + col];
    };
    BitMatrix.prototype.xor = function(row, col, value) {
      this.data[row * this.size + col] ^= value;
    };
    BitMatrix.prototype.isReserved = function(row, col) {
      return this.reservedBit[row * this.size + col];
    };
    module.exports = BitMatrix;
  }
});

// node_modules/qrcode/lib/core/alignment-pattern.js
var require_alignment_pattern = __commonJS({
  "node_modules/qrcode/lib/core/alignment-pattern.js"(exports) {
    var getSymbolSize = require_utils().getSymbolSize;
    exports.getRowColCoords = function getRowColCoords(version2) {
      if (version2 === 1) return [];
      const posCount = Math.floor(version2 / 7) + 2;
      const size = getSymbolSize(version2);
      const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
      const positions = [size - 7];
      for (let i = 1; i < posCount - 1; i++) {
        positions[i] = positions[i - 1] - intervals;
      }
      positions.push(6);
      return positions.reverse();
    };
    exports.getPositions = function getPositions(version2) {
      const coords = [];
      const pos = exports.getRowColCoords(version2);
      const posLength = pos.length;
      for (let i = 0; i < posLength; i++) {
        for (let j = 0; j < posLength; j++) {
          if (i === 0 && j === 0 || // top-left
          i === 0 && j === posLength - 1 || // bottom-left
          i === posLength - 1 && j === 0) {
            continue;
          }
          coords.push([pos[i], pos[j]]);
        }
      }
      return coords;
    };
  }
});

// node_modules/qrcode/lib/core/finder-pattern.js
var require_finder_pattern = __commonJS({
  "node_modules/qrcode/lib/core/finder-pattern.js"(exports) {
    var getSymbolSize = require_utils().getSymbolSize;
    var FINDER_PATTERN_SIZE = 7;
    exports.getPositions = function getPositions(version2) {
      const size = getSymbolSize(version2);
      return [
        // top-left
        [0, 0],
        // top-right
        [size - FINDER_PATTERN_SIZE, 0],
        // bottom-left
        [0, size - FINDER_PATTERN_SIZE]
      ];
    };
  }
});

// node_modules/qrcode/lib/core/mask-pattern.js
var require_mask_pattern = __commonJS({
  "node_modules/qrcode/lib/core/mask-pattern.js"(exports) {
    exports.Patterns = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
    var PenaltyScores = {
      N1: 3,
      N2: 3,
      N3: 40,
      N4: 10
    };
    exports.isValid = function isValid(mask) {
      return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
    };
    exports.from = function from(value) {
      return exports.isValid(value) ? parseInt(value, 10) : void 0;
    };
    exports.getPenaltyN1 = function getPenaltyN1(data3) {
      const size = data3.size;
      let points = 0;
      let sameCountCol = 0;
      let sameCountRow = 0;
      let lastCol = null;
      let lastRow = null;
      for (let row = 0; row < size; row++) {
        sameCountCol = sameCountRow = 0;
        lastCol = lastRow = null;
        for (let col = 0; col < size; col++) {
          let module2 = data3.get(row, col);
          if (module2 === lastCol) {
            sameCountCol++;
          } else {
            if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
            lastCol = module2;
            sameCountCol = 1;
          }
          module2 = data3.get(col, row);
          if (module2 === lastRow) {
            sameCountRow++;
          } else {
            if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
            lastRow = module2;
            sameCountRow = 1;
          }
        }
        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
      }
      return points;
    };
    exports.getPenaltyN2 = function getPenaltyN2(data3) {
      const size = data3.size;
      let points = 0;
      for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
          const last = data3.get(row, col) + data3.get(row, col + 1) + data3.get(row + 1, col) + data3.get(row + 1, col + 1);
          if (last === 4 || last === 0) points++;
        }
      }
      return points * PenaltyScores.N2;
    };
    exports.getPenaltyN3 = function getPenaltyN3(data3) {
      const size = data3.size;
      let points = 0;
      let bitsCol = 0;
      let bitsRow = 0;
      for (let row = 0; row < size; row++) {
        bitsCol = bitsRow = 0;
        for (let col = 0; col < size; col++) {
          bitsCol = bitsCol << 1 & 2047 | data3.get(row, col);
          if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
          bitsRow = bitsRow << 1 & 2047 | data3.get(col, row);
          if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
        }
      }
      return points * PenaltyScores.N3;
    };
    exports.getPenaltyN4 = function getPenaltyN4(data3) {
      let darkCount = 0;
      const modulesCount = data3.data.length;
      for (let i = 0; i < modulesCount; i++) darkCount += data3.data[i];
      const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
      return k * PenaltyScores.N4;
    };
    function getMaskAt(maskPattern, i, j) {
      switch (maskPattern) {
        case exports.Patterns.PATTERN000:
          return (i + j) % 2 === 0;
        case exports.Patterns.PATTERN001:
          return i % 2 === 0;
        case exports.Patterns.PATTERN010:
          return j % 3 === 0;
        case exports.Patterns.PATTERN011:
          return (i + j) % 3 === 0;
        case exports.Patterns.PATTERN100:
          return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case exports.Patterns.PATTERN101:
          return i * j % 2 + i * j % 3 === 0;
        case exports.Patterns.PATTERN110:
          return (i * j % 2 + i * j % 3) % 2 === 0;
        case exports.Patterns.PATTERN111:
          return (i * j % 3 + (i + j) % 2) % 2 === 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern);
      }
    }
    exports.applyMask = function applyMask(pattern, data3) {
      const size = data3.size;
      for (let col = 0; col < size; col++) {
        for (let row = 0; row < size; row++) {
          if (data3.isReserved(row, col)) continue;
          data3.xor(row, col, getMaskAt(pattern, row, col));
        }
      }
    };
    exports.getBestMask = function getBestMask(data3, setupFormatFunc) {
      const numPatterns = Object.keys(exports.Patterns).length;
      let bestPattern = 0;
      let lowerPenalty = Infinity;
      for (let p = 0; p < numPatterns; p++) {
        setupFormatFunc(p);
        exports.applyMask(p, data3);
        const penalty = exports.getPenaltyN1(data3) + exports.getPenaltyN2(data3) + exports.getPenaltyN3(data3) + exports.getPenaltyN4(data3);
        exports.applyMask(p, data3);
        if (penalty < lowerPenalty) {
          lowerPenalty = penalty;
          bestPattern = p;
        }
      }
      return bestPattern;
    };
  }
});

// node_modules/qrcode/lib/core/error-correction-code.js
var require_error_correction_code = __commonJS({
  "node_modules/qrcode/lib/core/error-correction-code.js"(exports) {
    var ECLevel = require_error_correction_level();
    var EC_BLOCKS_TABLE = [
      // L  M  Q  H
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      1,
      2,
      2,
      4,
      1,
      2,
      4,
      4,
      2,
      4,
      4,
      4,
      2,
      4,
      6,
      5,
      2,
      4,
      6,
      6,
      2,
      5,
      8,
      8,
      4,
      5,
      8,
      8,
      4,
      5,
      8,
      11,
      4,
      8,
      10,
      11,
      4,
      9,
      12,
      16,
      4,
      9,
      16,
      16,
      6,
      10,
      12,
      18,
      6,
      10,
      17,
      16,
      6,
      11,
      16,
      19,
      6,
      13,
      18,
      21,
      7,
      14,
      21,
      25,
      8,
      16,
      20,
      25,
      8,
      17,
      23,
      25,
      9,
      17,
      23,
      34,
      9,
      18,
      25,
      30,
      10,
      20,
      27,
      32,
      12,
      21,
      29,
      35,
      12,
      23,
      34,
      37,
      12,
      25,
      34,
      40,
      13,
      26,
      35,
      42,
      14,
      28,
      38,
      45,
      15,
      29,
      40,
      48,
      16,
      31,
      43,
      51,
      17,
      33,
      45,
      54,
      18,
      35,
      48,
      57,
      19,
      37,
      51,
      60,
      19,
      38,
      53,
      63,
      20,
      40,
      56,
      66,
      21,
      43,
      59,
      70,
      22,
      45,
      62,
      74,
      24,
      47,
      65,
      77,
      25,
      49,
      68,
      81
    ];
    var EC_CODEWORDS_TABLE = [
      // L  M  Q  H
      7,
      10,
      13,
      17,
      10,
      16,
      22,
      28,
      15,
      26,
      36,
      44,
      20,
      36,
      52,
      64,
      26,
      48,
      72,
      88,
      36,
      64,
      96,
      112,
      40,
      72,
      108,
      130,
      48,
      88,
      132,
      156,
      60,
      110,
      160,
      192,
      72,
      130,
      192,
      224,
      80,
      150,
      224,
      264,
      96,
      176,
      260,
      308,
      104,
      198,
      288,
      352,
      120,
      216,
      320,
      384,
      132,
      240,
      360,
      432,
      144,
      280,
      408,
      480,
      168,
      308,
      448,
      532,
      180,
      338,
      504,
      588,
      196,
      364,
      546,
      650,
      224,
      416,
      600,
      700,
      224,
      442,
      644,
      750,
      252,
      476,
      690,
      816,
      270,
      504,
      750,
      900,
      300,
      560,
      810,
      960,
      312,
      588,
      870,
      1050,
      336,
      644,
      952,
      1110,
      360,
      700,
      1020,
      1200,
      390,
      728,
      1050,
      1260,
      420,
      784,
      1140,
      1350,
      450,
      812,
      1200,
      1440,
      480,
      868,
      1290,
      1530,
      510,
      924,
      1350,
      1620,
      540,
      980,
      1440,
      1710,
      570,
      1036,
      1530,
      1800,
      570,
      1064,
      1590,
      1890,
      600,
      1120,
      1680,
      1980,
      630,
      1204,
      1770,
      2100,
      660,
      1260,
      1860,
      2220,
      720,
      1316,
      1950,
      2310,
      750,
      1372,
      2040,
      2430
    ];
    exports.getBlocksCount = function getBlocksCount(version2, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 0];
        case ECLevel.M:
          return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 2];
        case ECLevel.H:
          return EC_BLOCKS_TABLE[(version2 - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    exports.getTotalCodewordsCount = function getTotalCodewordsCount(version2, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 0];
        case ECLevel.M:
          return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 2];
        case ECLevel.H:
          return EC_CODEWORDS_TABLE[(version2 - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
  }
});

// node_modules/qrcode/lib/core/galois-field.js
var require_galois_field = __commonJS({
  "node_modules/qrcode/lib/core/galois-field.js"(exports) {
    var EXP_TABLE = new Uint8Array(512);
    var LOG_TABLE = new Uint8Array(256);
    (function initTables() {
      let x = 1;
      for (let i = 0; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        x <<= 1;
        if (x & 256) {
          x ^= 285;
        }
      }
      for (let i = 255; i < 512; i++) {
        EXP_TABLE[i] = EXP_TABLE[i - 255];
      }
    })();
    exports.log = function log(n) {
      if (n < 1) throw new Error("log(" + n + ")");
      return LOG_TABLE[n];
    };
    exports.exp = function exp(n) {
      return EXP_TABLE[n];
    };
    exports.mul = function mul(x, y) {
      if (x === 0 || y === 0) return 0;
      return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
    };
  }
});

// node_modules/qrcode/lib/core/polynomial.js
var require_polynomial = __commonJS({
  "node_modules/qrcode/lib/core/polynomial.js"(exports) {
    var GF = require_galois_field();
    exports.mul = function mul(p1, p2) {
      const coeff = new Uint8Array(p1.length + p2.length - 1);
      for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) {
          coeff[i + j] ^= GF.mul(p1[i], p2[j]);
        }
      }
      return coeff;
    };
    exports.mod = function mod(divident, divisor) {
      let result = new Uint8Array(divident);
      while (result.length - divisor.length >= 0) {
        const coeff = result[0];
        for (let i = 0; i < divisor.length; i++) {
          result[i] ^= GF.mul(divisor[i], coeff);
        }
        let offset = 0;
        while (offset < result.length && result[offset] === 0) offset++;
        result = result.slice(offset);
      }
      return result;
    };
    exports.generateECPolynomial = function generateECPolynomial(degree) {
      let poly = new Uint8Array([1]);
      for (let i = 0; i < degree; i++) {
        poly = exports.mul(poly, new Uint8Array([1, GF.exp(i)]));
      }
      return poly;
    };
  }
});

// node_modules/qrcode/lib/core/reed-solomon-encoder.js
var require_reed_solomon_encoder = __commonJS({
  "node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports, module) {
    var Polynomial = require_polynomial();
    function ReedSolomonEncoder(degree) {
      this.genPoly = void 0;
      this.degree = degree;
      if (this.degree) this.initialize(this.degree);
    }
    ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
      this.degree = degree;
      this.genPoly = Polynomial.generateECPolynomial(this.degree);
    };
    ReedSolomonEncoder.prototype.encode = function encode(data3) {
      if (!this.genPoly) {
        throw new Error("Encoder not initialized");
      }
      const paddedData = new Uint8Array(data3.length + this.degree);
      paddedData.set(data3);
      const remainder = Polynomial.mod(paddedData, this.genPoly);
      const start2 = this.degree - remainder.length;
      if (start2 > 0) {
        const buff = new Uint8Array(this.degree);
        buff.set(remainder, start2);
        return buff;
      }
      return remainder;
    };
    module.exports = ReedSolomonEncoder;
  }
});

// node_modules/qrcode/lib/core/version-check.js
var require_version_check = __commonJS({
  "node_modules/qrcode/lib/core/version-check.js"(exports) {
    exports.isValid = function isValid(version2) {
      return !isNaN(version2) && version2 >= 1 && version2 <= 40;
    };
  }
});

// node_modules/qrcode/lib/core/regex.js
var require_regex = __commonJS({
  "node_modules/qrcode/lib/core/regex.js"(exports) {
    var numeric = "[0-9]+";
    var alphanumeric = "[A-Z $%*+\\-./:]+";
    var kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
    kanji = kanji.replace(/u/g, "\\u");
    var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
    exports.KANJI = new RegExp(kanji, "g");
    exports.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
    exports.BYTE = new RegExp(byte, "g");
    exports.NUMERIC = new RegExp(numeric, "g");
    exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
    var TEST_KANJI = new RegExp("^" + kanji + "$");
    var TEST_NUMERIC = new RegExp("^" + numeric + "$");
    var TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
    exports.testKanji = function testKanji(str) {
      return TEST_KANJI.test(str);
    };
    exports.testNumeric = function testNumeric(str) {
      return TEST_NUMERIC.test(str);
    };
    exports.testAlphanumeric = function testAlphanumeric(str) {
      return TEST_ALPHANUMERIC.test(str);
    };
  }
});

// node_modules/qrcode/lib/core/mode.js
var require_mode = __commonJS({
  "node_modules/qrcode/lib/core/mode.js"(exports) {
    var VersionCheck = require_version_check();
    var Regex = require_regex();
    exports.NUMERIC = {
      id: "Numeric",
      bit: 1 << 0,
      ccBits: [10, 12, 14]
    };
    exports.ALPHANUMERIC = {
      id: "Alphanumeric",
      bit: 1 << 1,
      ccBits: [9, 11, 13]
    };
    exports.BYTE = {
      id: "Byte",
      bit: 1 << 2,
      ccBits: [8, 16, 16]
    };
    exports.KANJI = {
      id: "Kanji",
      bit: 1 << 3,
      ccBits: [8, 10, 12]
    };
    exports.MIXED = {
      bit: -1
    };
    exports.getCharCountIndicator = function getCharCountIndicator(mode2, version2) {
      if (!mode2.ccBits) throw new Error("Invalid mode: " + mode2);
      if (!VersionCheck.isValid(version2)) {
        throw new Error("Invalid version: " + version2);
      }
      if (version2 >= 1 && version2 < 10) return mode2.ccBits[0];
      else if (version2 < 27) return mode2.ccBits[1];
      return mode2.ccBits[2];
    };
    exports.getBestModeForData = function getBestModeForData(dataStr) {
      if (Regex.testNumeric(dataStr)) return exports.NUMERIC;
      else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC;
      else if (Regex.testKanji(dataStr)) return exports.KANJI;
      else return exports.BYTE;
    };
    exports.toString = function toString(mode2) {
      if (mode2 && mode2.id) return mode2.id;
      throw new Error("Invalid mode");
    };
    exports.isValid = function isValid(mode2) {
      return mode2 && mode2.bit && mode2.ccBits;
    };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "numeric":
          return exports.NUMERIC;
        case "alphanumeric":
          return exports.ALPHANUMERIC;
        case "kanji":
          return exports.KANJI;
        case "byte":
          return exports.BYTE;
        default:
          throw new Error("Unknown mode: " + string);
      }
    }
    exports.from = function from(value, defaultValue) {
      if (exports.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e2) {
        return defaultValue;
      }
    };
  }
});

// node_modules/qrcode/lib/core/version.js
var require_version = __commonJS({
  "node_modules/qrcode/lib/core/version.js"(exports) {
    var Utils = require_utils();
    var ECCode = require_error_correction_code();
    var ECLevel = require_error_correction_level();
    var Mode = require_mode();
    var VersionCheck = require_version_check();
    var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    var G18_BCH = Utils.getBCHDigit(G18);
    function getBestVersionForDataLength(mode2, length2, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        if (length2 <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode2)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    function getReservedBitsCount(mode2, version2) {
      return Mode.getCharCountIndicator(mode2, version2) + 4;
    }
    function getTotalBitsFromDataArray(segments2, version2) {
      let totalBits = 0;
      segments2.forEach(function(data3) {
        const reservedBits = getReservedBitsCount(data3.mode, version2);
        totalBits += reservedBits + data3.getBitsLength();
      });
      return totalBits;
    }
    function getBestVersionForMixedData(segments2, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        const length2 = getTotalBitsFromDataArray(segments2, currentVersion);
        if (length2 <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    exports.from = function from(value, defaultValue) {
      if (VersionCheck.isValid(value)) {
        return parseInt(value, 10);
      }
      return defaultValue;
    };
    exports.getCapacity = function getCapacity(version2, errorCorrectionLevel, mode2) {
      if (!VersionCheck.isValid(version2)) {
        throw new Error("Invalid QR Code version");
      }
      if (typeof mode2 === "undefined") mode2 = Mode.BYTE;
      const totalCodewords = Utils.getSymbolTotalCodewords(version2);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (mode2 === Mode.MIXED) return dataTotalCodewordsBits;
      const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode2, version2);
      switch (mode2) {
        case Mode.NUMERIC:
          return Math.floor(usableBits / 10 * 3);
        case Mode.ALPHANUMERIC:
          return Math.floor(usableBits / 11 * 2);
        case Mode.KANJI:
          return Math.floor(usableBits / 13);
        case Mode.BYTE:
        default:
          return Math.floor(usableBits / 8);
      }
    };
    exports.getBestVersionForData = function getBestVersionForData(data3, errorCorrectionLevel) {
      let seg;
      const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
      if (Array.isArray(data3)) {
        if (data3.length > 1) {
          return getBestVersionForMixedData(data3, ecl);
        }
        if (data3.length === 0) {
          return 1;
        }
        seg = data3[0];
      } else {
        seg = data3;
      }
      return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
    };
    exports.getEncodedBits = function getEncodedBits(version2) {
      if (!VersionCheck.isValid(version2) || version2 < 7) {
        throw new Error("Invalid QR Code version");
      }
      let d = version2 << 12;
      while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
        d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
      }
      return version2 << 12 | d;
    };
  }
});

// node_modules/qrcode/lib/core/format-info.js
var require_format_info = __commonJS({
  "node_modules/qrcode/lib/core/format-info.js"(exports) {
    var Utils = require_utils();
    var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    var G15_BCH = Utils.getBCHDigit(G15);
    exports.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
      const data3 = errorCorrectionLevel.bit << 3 | mask;
      let d = data3 << 10;
      while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
        d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
      }
      return (data3 << 10 | d) ^ G15_MASK;
    };
  }
});

// node_modules/qrcode/lib/core/numeric-data.js
var require_numeric_data = __commonJS({
  "node_modules/qrcode/lib/core/numeric-data.js"(exports, module) {
    var Mode = require_mode();
    function NumericData(data3) {
      this.mode = Mode.NUMERIC;
      this.data = data3.toString();
    }
    NumericData.getBitsLength = function getBitsLength(length2) {
      return 10 * Math.floor(length2 / 3) + (length2 % 3 ? length2 % 3 * 3 + 1 : 0);
    };
    NumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    NumericData.prototype.getBitsLength = function getBitsLength() {
      return NumericData.getBitsLength(this.data.length);
    };
    NumericData.prototype.write = function write(bitBuffer) {
      let i, group, value;
      for (i = 0; i + 3 <= this.data.length; i += 3) {
        group = this.data.substr(i, 3);
        value = parseInt(group, 10);
        bitBuffer.put(value, 10);
      }
      const remainingNum = this.data.length - i;
      if (remainingNum > 0) {
        group = this.data.substr(i);
        value = parseInt(group, 10);
        bitBuffer.put(value, remainingNum * 3 + 1);
      }
    };
    module.exports = NumericData;
  }
});

// node_modules/qrcode/lib/core/alphanumeric-data.js
var require_alphanumeric_data = __commonJS({
  "node_modules/qrcode/lib/core/alphanumeric-data.js"(exports, module) {
    var Mode = require_mode();
    var ALPHA_NUM_CHARS = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      " ",
      "$",
      "%",
      "*",
      "+",
      "-",
      ".",
      "/",
      ":"
    ];
    function AlphanumericData(data3) {
      this.mode = Mode.ALPHANUMERIC;
      this.data = data3;
    }
    AlphanumericData.getBitsLength = function getBitsLength(length2) {
      return 11 * Math.floor(length2 / 2) + 6 * (length2 % 2);
    };
    AlphanumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    AlphanumericData.prototype.getBitsLength = function getBitsLength() {
      return AlphanumericData.getBitsLength(this.data.length);
    };
    AlphanumericData.prototype.write = function write(bitBuffer) {
      let i;
      for (i = 0; i + 2 <= this.data.length; i += 2) {
        let value = ALPHA_NUM_CHARS.indexOf(this.data[i]) * 45;
        value += ALPHA_NUM_CHARS.indexOf(this.data[i + 1]);
        bitBuffer.put(value, 11);
      }
      if (this.data.length % 2) {
        bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i]), 6);
      }
    };
    module.exports = AlphanumericData;
  }
});

// node_modules/qrcode/lib/core/byte-data.js
var require_byte_data = __commonJS({
  "node_modules/qrcode/lib/core/byte-data.js"(exports, module) {
    var Mode = require_mode();
    function ByteData(data3) {
      this.mode = Mode.BYTE;
      if (typeof data3 === "string") {
        this.data = new TextEncoder().encode(data3);
      } else {
        this.data = new Uint8Array(data3);
      }
    }
    ByteData.getBitsLength = function getBitsLength(length2) {
      return length2 * 8;
    };
    ByteData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    ByteData.prototype.getBitsLength = function getBitsLength() {
      return ByteData.getBitsLength(this.data.length);
    };
    ByteData.prototype.write = function(bitBuffer) {
      for (let i = 0, l = this.data.length; i < l; i++) {
        bitBuffer.put(this.data[i], 8);
      }
    };
    module.exports = ByteData;
  }
});

// node_modules/qrcode/lib/core/kanji-data.js
var require_kanji_data = __commonJS({
  "node_modules/qrcode/lib/core/kanji-data.js"(exports, module) {
    var Mode = require_mode();
    var Utils = require_utils();
    function KanjiData(data3) {
      this.mode = Mode.KANJI;
      this.data = data3;
    }
    KanjiData.getBitsLength = function getBitsLength(length2) {
      return length2 * 13;
    };
    KanjiData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    KanjiData.prototype.getBitsLength = function getBitsLength() {
      return KanjiData.getBitsLength(this.data.length);
    };
    KanjiData.prototype.write = function(bitBuffer) {
      let i;
      for (i = 0; i < this.data.length; i++) {
        let value = Utils.toSJIS(this.data[i]);
        if (value >= 33088 && value <= 40956) {
          value -= 33088;
        } else if (value >= 57408 && value <= 60351) {
          value -= 49472;
        } else {
          throw new Error(
            "Invalid SJIS character: " + this.data[i] + "\nMake sure your charset is UTF-8"
          );
        }
        value = (value >>> 8 & 255) * 192 + (value & 255);
        bitBuffer.put(value, 13);
      }
    };
    module.exports = KanjiData;
  }
});

// node_modules/dijkstrajs/dijkstra.js
var require_dijkstra = __commonJS({
  "node_modules/dijkstrajs/dijkstra.js"(exports, module) {
    "use strict";
    var dijkstra = {
      single_source_shortest_paths: function(graph, s, d) {
        var predecessors = {};
        var costs = {};
        costs[s] = 0;
        var open = dijkstra.PriorityQueue.make();
        open.push(s, 0);
        var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
        while (!open.empty()) {
          closest = open.pop();
          u = closest.value;
          cost_of_s_to_u = closest.cost;
          adjacent_nodes = graph[u] || {};
          for (v in adjacent_nodes) {
            if (adjacent_nodes.hasOwnProperty(v)) {
              cost_of_e = adjacent_nodes[v];
              cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
              cost_of_s_to_v = costs[v];
              first_visit = typeof costs[v] === "undefined";
              if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                costs[v] = cost_of_s_to_u_plus_cost_of_e;
                open.push(v, cost_of_s_to_u_plus_cost_of_e);
                predecessors[v] = u;
              }
            }
          }
        }
        if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
          var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
          throw new Error(msg);
        }
        return predecessors;
      },
      extract_shortest_path_from_predecessor_list: function(predecessors, d) {
        var nodes = [];
        var u = d;
        var predecessor;
        while (u) {
          nodes.push(u);
          predecessor = predecessors[u];
          u = predecessors[u];
        }
        nodes.reverse();
        return nodes;
      },
      find_path: function(graph, s, d) {
        var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
        return dijkstra.extract_shortest_path_from_predecessor_list(
          predecessors,
          d
        );
      },
      /**
       * A very naive priority queue implementation.
       */
      PriorityQueue: {
        make: function(opts) {
          var T = dijkstra.PriorityQueue, t2 = {}, key;
          opts = opts || {};
          for (key in T) {
            if (T.hasOwnProperty(key)) {
              t2[key] = T[key];
            }
          }
          t2.queue = [];
          t2.sorter = opts.sorter || T.default_sorter;
          return t2;
        },
        default_sorter: function(a, b) {
          return a.cost - b.cost;
        },
        /**
         * Add a new item to the queue and ensure the highest priority element
         * is at the front of the queue.
         */
        push: function(value, cost) {
          var item = { value, cost };
          this.queue.push(item);
          this.queue.sort(this.sorter);
        },
        /**
         * Return the highest priority element in the queue.
         */
        pop: function() {
          return this.queue.shift();
        },
        empty: function() {
          return this.queue.length === 0;
        }
      }
    };
    if (typeof module !== "undefined") {
      module.exports = dijkstra;
    }
  }
});

// node_modules/qrcode/lib/core/segments.js
var require_segments = __commonJS({
  "node_modules/qrcode/lib/core/segments.js"(exports) {
    var Mode = require_mode();
    var NumericData = require_numeric_data();
    var AlphanumericData = require_alphanumeric_data();
    var ByteData = require_byte_data();
    var KanjiData = require_kanji_data();
    var Regex = require_regex();
    var Utils = require_utils();
    var dijkstra = require_dijkstra();
    function getStringByteLength(str) {
      return unescape(encodeURIComponent(str)).length;
    }
    function getSegments(regex, mode2, str) {
      const segments2 = [];
      let result;
      while ((result = regex.exec(str)) !== null) {
        segments2.push({
          data: result[0],
          index: result.index,
          mode: mode2,
          length: result[0].length
        });
      }
      return segments2;
    }
    function getSegmentsFromString(dataStr) {
      const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
      const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
      let byteSegs;
      let kanjiSegs;
      if (Utils.isKanjiModeEnabled()) {
        byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
        kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
      } else {
        byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
        kanjiSegs = [];
      }
      const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
      return segs.sort(function(s1, s2) {
        return s1.index - s2.index;
      }).map(function(obj) {
        return {
          data: obj.data,
          mode: obj.mode,
          length: obj.length
        };
      });
    }
    function getSegmentBitsLength(length2, mode2) {
      switch (mode2) {
        case Mode.NUMERIC:
          return NumericData.getBitsLength(length2);
        case Mode.ALPHANUMERIC:
          return AlphanumericData.getBitsLength(length2);
        case Mode.KANJI:
          return KanjiData.getBitsLength(length2);
        case Mode.BYTE:
          return ByteData.getBitsLength(length2);
      }
    }
    function mergeSegments(segs) {
      return segs.reduce(function(acc, curr) {
        const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
        if (prevSeg && prevSeg.mode === curr.mode) {
          acc[acc.length - 1].data += curr.data;
          return acc;
        }
        acc.push(curr);
        return acc;
      }, []);
    }
    function buildNodes(segs) {
      const nodes = [];
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        switch (seg.mode) {
          case Mode.NUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.ALPHANUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.KANJI:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
            break;
          case Mode.BYTE:
            nodes.push([
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
        }
      }
      return nodes;
    }
    function buildGraph(nodes, version2) {
      const table = {};
      const graph = { start: {} };
      let prevNodeIds = ["start"];
      for (let i = 0; i < nodes.length; i++) {
        const nodeGroup = nodes[i];
        const currentNodeIds = [];
        for (let j = 0; j < nodeGroup.length; j++) {
          const node = nodeGroup[j];
          const key = "" + i + j;
          currentNodeIds.push(key);
          table[key] = { node, lastCount: 0 };
          graph[key] = {};
          for (let n = 0; n < prevNodeIds.length; n++) {
            const prevNodeId = prevNodeIds[n];
            if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
              graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
              table[prevNodeId].lastCount += node.length;
            } else {
              if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
              graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version2);
            }
          }
        }
        prevNodeIds = currentNodeIds;
      }
      for (let n = 0; n < prevNodeIds.length; n++) {
        graph[prevNodeIds[n]].end = 0;
      }
      return { map: graph, table };
    }
    function buildSingleSegment(data3, modesHint) {
      let mode2;
      const bestMode = Mode.getBestModeForData(data3);
      mode2 = Mode.from(modesHint, bestMode);
      if (mode2 !== Mode.BYTE && mode2.bit < bestMode.bit) {
        throw new Error('"' + data3 + '" cannot be encoded with mode ' + Mode.toString(mode2) + ".\n Suggested mode is: " + Mode.toString(bestMode));
      }
      if (mode2 === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
        mode2 = Mode.BYTE;
      }
      switch (mode2) {
        case Mode.NUMERIC:
          return new NumericData(data3);
        case Mode.ALPHANUMERIC:
          return new AlphanumericData(data3);
        case Mode.KANJI:
          return new KanjiData(data3);
        case Mode.BYTE:
          return new ByteData(data3);
      }
    }
    exports.fromArray = function fromArray(array) {
      return array.reduce(function(acc, seg) {
        if (typeof seg === "string") {
          acc.push(buildSingleSegment(seg, null));
        } else if (seg.data) {
          acc.push(buildSingleSegment(seg.data, seg.mode));
        }
        return acc;
      }, []);
    };
    exports.fromString = function fromString(data3, version2) {
      const segs = getSegmentsFromString(data3, Utils.isKanjiModeEnabled());
      const nodes = buildNodes(segs);
      const graph = buildGraph(nodes, version2);
      const path = dijkstra.find_path(graph.map, "start", "end");
      const optimizedSegs = [];
      for (let i = 1; i < path.length - 1; i++) {
        optimizedSegs.push(graph.table[path[i]].node);
      }
      return exports.fromArray(mergeSegments(optimizedSegs));
    };
    exports.rawSplit = function rawSplit(data3) {
      return exports.fromArray(
        getSegmentsFromString(data3, Utils.isKanjiModeEnabled())
      );
    };
  }
});

// node_modules/qrcode/lib/core/qrcode.js
var require_qrcode = __commonJS({
  "node_modules/qrcode/lib/core/qrcode.js"(exports) {
    var Utils = require_utils();
    var ECLevel = require_error_correction_level();
    var BitBuffer = require_bit_buffer();
    var BitMatrix = require_bit_matrix();
    var AlignmentPattern = require_alignment_pattern();
    var FinderPattern = require_finder_pattern();
    var MaskPattern = require_mask_pattern();
    var ECCode = require_error_correction_code();
    var ReedSolomonEncoder = require_reed_solomon_encoder();
    var Version = require_version();
    var FormatInfo = require_format_info();
    var Mode = require_mode();
    var Segments = require_segments();
    function setupFinderPattern(matrix, version2) {
      const size = matrix.size;
      const pos = FinderPattern.getPositions(version2);
      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || size <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || size <= col + c) continue;
            if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupTimingPattern(matrix) {
      const size = matrix.size;
      for (let r = 8; r < size - 8; r++) {
        const value = r % 2 === 0;
        matrix.set(r, 6, value, true);
        matrix.set(6, r, value, true);
      }
    }
    function setupAlignmentPattern(matrix, version2) {
      const pos = AlignmentPattern.getPositions(version2);
      for (let i = 0; i < pos.length; i++) {
        const row = pos[i][0];
        const col = pos[i][1];
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupVersionInfo(matrix, version2) {
      const size = matrix.size;
      const bits = Version.getEncodedBits(version2);
      let row, col, mod;
      for (let i = 0; i < 18; i++) {
        row = Math.floor(i / 3);
        col = i % 3 + size - 8 - 3;
        mod = (bits >> i & 1) === 1;
        matrix.set(row, col, mod, true);
        matrix.set(col, row, mod, true);
      }
    }
    function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
      const size = matrix.size;
      const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
      let i, mod;
      for (i = 0; i < 15; i++) {
        mod = (bits >> i & 1) === 1;
        if (i < 6) {
          matrix.set(i, 8, mod, true);
        } else if (i < 8) {
          matrix.set(i + 1, 8, mod, true);
        } else {
          matrix.set(size - 15 + i, 8, mod, true);
        }
        if (i < 8) {
          matrix.set(8, size - i - 1, mod, true);
        } else if (i < 9) {
          matrix.set(8, 15 - i - 1 + 1, mod, true);
        } else {
          matrix.set(8, 15 - i - 1, mod, true);
        }
      }
      matrix.set(size - 8, 8, 1, true);
    }
    function setupData(matrix, data3) {
      const size = matrix.size;
      let inc = -1;
      let row = size - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (!matrix.isReserved(row, col - c)) {
              let dark = false;
              if (byteIndex < data3.length) {
                dark = (data3[byteIndex] >>> bitIndex & 1) === 1;
              }
              matrix.set(row, col - c, dark);
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || size <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
    function createData(version2, errorCorrectionLevel, segments2) {
      const buffer2 = new BitBuffer();
      segments2.forEach(function(data3) {
        buffer2.put(data3.mode.bit, 4);
        buffer2.put(data3.getLength(), Mode.getCharCountIndicator(data3.mode, version2));
        data3.write(buffer2);
      });
      const totalCodewords = Utils.getSymbolTotalCodewords(version2);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (buffer2.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
        buffer2.put(0, 4);
      }
      while (buffer2.getLengthInBits() % 8 !== 0) {
        buffer2.putBit(0);
      }
      const remainingByte = (dataTotalCodewordsBits - buffer2.getLengthInBits()) / 8;
      for (let i = 0; i < remainingByte; i++) {
        buffer2.put(i % 2 ? 17 : 236, 8);
      }
      return createCodewords(buffer2, version2, errorCorrectionLevel);
    }
    function createCodewords(bitBuffer, version2, errorCorrectionLevel) {
      const totalCodewords = Utils.getSymbolTotalCodewords(version2);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version2, errorCorrectionLevel);
      const dataTotalCodewords = totalCodewords - ecTotalCodewords;
      const ecTotalBlocks = ECCode.getBlocksCount(version2, errorCorrectionLevel);
      const blocksInGroup2 = totalCodewords % ecTotalBlocks;
      const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
      const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
      const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
      const rs = new ReedSolomonEncoder(ecCount);
      let offset = 0;
      const dcData = new Array(ecTotalBlocks);
      const ecData = new Array(ecTotalBlocks);
      let maxDataSize = 0;
      const buffer2 = new Uint8Array(bitBuffer.buffer);
      for (let b = 0; b < ecTotalBlocks; b++) {
        const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
        dcData[b] = buffer2.slice(offset, offset + dataSize);
        ecData[b] = rs.encode(dcData[b]);
        offset += dataSize;
        maxDataSize = Math.max(maxDataSize, dataSize);
      }
      const data3 = new Uint8Array(totalCodewords);
      let index = 0;
      let i, r;
      for (i = 0; i < maxDataSize; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          if (i < dcData[r].length) {
            data3[index++] = dcData[r][i];
          }
        }
      }
      for (i = 0; i < ecCount; i++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          data3[index++] = ecData[r][i];
        }
      }
      return data3;
    }
    function createSymbol(data3, version2, errorCorrectionLevel, maskPattern) {
      let segments2;
      if (Array.isArray(data3)) {
        segments2 = Segments.fromArray(data3);
      } else if (typeof data3 === "string") {
        let estimatedVersion = version2;
        if (!estimatedVersion) {
          const rawSegments = Segments.rawSplit(data3);
          estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
        }
        segments2 = Segments.fromString(data3, estimatedVersion || 40);
      } else {
        throw new Error("Invalid data");
      }
      const bestVersion = Version.getBestVersionForData(segments2, errorCorrectionLevel);
      if (!bestVersion) {
        throw new Error("The amount of data is too big to be stored in a QR Code");
      }
      if (!version2) {
        version2 = bestVersion;
      } else if (version2 < bestVersion) {
        throw new Error(
          "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
        );
      }
      const dataBits = createData(version2, errorCorrectionLevel, segments2);
      const moduleCount = Utils.getSymbolSize(version2);
      const modules = new BitMatrix(moduleCount);
      setupFinderPattern(modules, version2);
      setupTimingPattern(modules);
      setupAlignmentPattern(modules, version2);
      setupFormatInfo(modules, errorCorrectionLevel, 0);
      if (version2 >= 7) {
        setupVersionInfo(modules, version2);
      }
      setupData(modules, dataBits);
      if (isNaN(maskPattern)) {
        maskPattern = MaskPattern.getBestMask(
          modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel)
        );
      }
      MaskPattern.applyMask(maskPattern, modules);
      setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
      return {
        modules,
        version: version2,
        errorCorrectionLevel,
        maskPattern,
        segments: segments2
      };
    }
    exports.create = function create(data3, options) {
      if (typeof data3 === "undefined" || data3 === "") {
        throw new Error("No input text");
      }
      let errorCorrectionLevel = ECLevel.M;
      let version2;
      let mask;
      if (typeof options !== "undefined") {
        errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
        version2 = Version.from(options.version);
        mask = MaskPattern.from(options.maskPattern);
        if (options.toSJISFunc) {
          Utils.setToSJISFunction(options.toSJISFunc);
        }
      }
      return createSymbol(data3, version2, errorCorrectionLevel, mask);
    };
  }
});

// node_modules/pngjs/lib/chunkstream.js
var require_chunkstream = __commonJS({
  "node_modules/pngjs/lib/chunkstream.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var ChunkStream = module.exports = function() {
      Stream.call(this);
      this._buffers = [];
      this._buffered = 0;
      this._reads = [];
      this._paused = false;
      this._encoding = "utf8";
      this.writable = true;
    };
    util.inherits(ChunkStream, Stream);
    ChunkStream.prototype.read = function(length2, callback) {
      this._reads.push({
        length: Math.abs(length2),
        // if length < 0 then at most this length
        allowLess: length2 < 0,
        func: callback
      });
      process.nextTick(
        function() {
          this._process();
          if (this._paused && this._reads && this._reads.length > 0) {
            this._paused = false;
            this.emit("drain");
          }
        }.bind(this)
      );
    };
    ChunkStream.prototype.write = function(data3, encoding) {
      if (!this.writable) {
        this.emit("error", new Error("Stream not writable"));
        return false;
      }
      let dataBuffer;
      if (Buffer.isBuffer(data3)) {
        dataBuffer = data3;
      } else {
        dataBuffer = Buffer.from(data3, encoding || this._encoding);
      }
      this._buffers.push(dataBuffer);
      this._buffered += dataBuffer.length;
      this._process();
      if (this._reads && this._reads.length === 0) {
        this._paused = true;
      }
      return this.writable && !this._paused;
    };
    ChunkStream.prototype.end = function(data3, encoding) {
      if (data3) {
        this.write(data3, encoding);
      }
      this.writable = false;
      if (!this._buffers) {
        return;
      }
      if (this._buffers.length === 0) {
        this._end();
      } else {
        this._buffers.push(null);
        this._process();
      }
    };
    ChunkStream.prototype.destroySoon = ChunkStream.prototype.end;
    ChunkStream.prototype._end = function() {
      if (this._reads.length > 0) {
        this.emit("error", new Error("Unexpected end of input"));
      }
      this.destroy();
    };
    ChunkStream.prototype.destroy = function() {
      if (!this._buffers) {
        return;
      }
      this.writable = false;
      this._reads = null;
      this._buffers = null;
      this.emit("close");
    };
    ChunkStream.prototype._processReadAllowingLess = function(read) {
      this._reads.shift();
      let smallerBuf = this._buffers[0];
      if (smallerBuf.length > read.length) {
        this._buffered -= read.length;
        this._buffers[0] = smallerBuf.slice(read.length);
        read.func.call(this, smallerBuf.slice(0, read.length));
      } else {
        this._buffered -= smallerBuf.length;
        this._buffers.shift();
        read.func.call(this, smallerBuf);
      }
    };
    ChunkStream.prototype._processRead = function(read) {
      this._reads.shift();
      let pos = 0;
      let count = 0;
      let data3 = Buffer.alloc(read.length);
      while (pos < read.length) {
        let buf = this._buffers[count++];
        let len = Math.min(buf.length, read.length - pos);
        buf.copy(data3, pos, 0, len);
        pos += len;
        if (len !== buf.length) {
          this._buffers[--count] = buf.slice(len);
        }
      }
      if (count > 0) {
        this._buffers.splice(0, count);
      }
      this._buffered -= read.length;
      read.func.call(this, data3);
    };
    ChunkStream.prototype._process = function() {
      try {
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {
          let read = this._reads[0];
          if (read.allowLess) {
            this._processReadAllowingLess(read);
          } else if (this._buffered >= read.length) {
            this._processRead(read);
          } else {
            break;
          }
        }
        if (this._buffers && !this.writable) {
          this._end();
        }
      } catch (ex) {
        this.emit("error", ex);
      }
    };
  }
});

// node_modules/pngjs/lib/interlace.js
var require_interlace = __commonJS({
  "node_modules/pngjs/lib/interlace.js"(exports) {
    "use strict";
    var imagePasses = [
      {
        // pass 1 - 1px
        x: [0],
        y: [0]
      },
      {
        // pass 2 - 1px
        x: [4],
        y: [0]
      },
      {
        // pass 3 - 2px
        x: [0, 4],
        y: [4]
      },
      {
        // pass 4 - 4px
        x: [2, 6],
        y: [0, 4]
      },
      {
        // pass 5 - 8px
        x: [0, 2, 4, 6],
        y: [2, 6]
      },
      {
        // pass 6 - 16px
        x: [1, 3, 5, 7],
        y: [0, 2, 4, 6]
      },
      {
        // pass 7 - 32px
        x: [0, 1, 2, 3, 4, 5, 6, 7],
        y: [1, 3, 5, 7]
      }
    ];
    exports.getImagePasses = function(width, height) {
      let images = [];
      let xLeftOver = width % 8;
      let yLeftOver = height % 8;
      let xRepeats = (width - xLeftOver) / 8;
      let yRepeats = (height - yLeftOver) / 8;
      for (let i = 0; i < imagePasses.length; i++) {
        let pass = imagePasses[i];
        let passWidth = xRepeats * pass.x.length;
        let passHeight = yRepeats * pass.y.length;
        for (let j = 0; j < pass.x.length; j++) {
          if (pass.x[j] < xLeftOver) {
            passWidth++;
          } else {
            break;
          }
        }
        for (let j = 0; j < pass.y.length; j++) {
          if (pass.y[j] < yLeftOver) {
            passHeight++;
          } else {
            break;
          }
        }
        if (passWidth > 0 && passHeight > 0) {
          images.push({ width: passWidth, height: passHeight, index: i });
        }
      }
      return images;
    };
    exports.getInterlaceIterator = function(width) {
      return function(x, y, pass) {
        let outerXLeftOver = x % imagePasses[pass].x.length;
        let outerX = (x - outerXLeftOver) / imagePasses[pass].x.length * 8 + imagePasses[pass].x[outerXLeftOver];
        let outerYLeftOver = y % imagePasses[pass].y.length;
        let outerY = (y - outerYLeftOver) / imagePasses[pass].y.length * 8 + imagePasses[pass].y[outerYLeftOver];
        return outerX * 4 + outerY * width * 4;
      };
    };
  }
});

// node_modules/pngjs/lib/paeth-predictor.js
var require_paeth_predictor = __commonJS({
  "node_modules/pngjs/lib/paeth-predictor.js"(exports, module) {
    "use strict";
    module.exports = function paethPredictor(left, above, upLeft) {
      let paeth = left + above - upLeft;
      let pLeft = Math.abs(paeth - left);
      let pAbove = Math.abs(paeth - above);
      let pUpLeft = Math.abs(paeth - upLeft);
      if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
      }
      if (pAbove <= pUpLeft) {
        return above;
      }
      return upLeft;
    };
  }
});

// node_modules/pngjs/lib/filter-parse.js
var require_filter_parse = __commonJS({
  "node_modules/pngjs/lib/filter-parse.js"(exports, module) {
    "use strict";
    var interlaceUtils = require_interlace();
    var paethPredictor = require_paeth_predictor();
    function getByteWidth(width, bpp, depth) {
      let byteWidth = width * bpp;
      if (depth !== 8) {
        byteWidth = Math.ceil(byteWidth / (8 / depth));
      }
      return byteWidth;
    }
    var Filter = module.exports = function(bitmapInfo, dependencies) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let interlace = bitmapInfo.interlace;
      let bpp = bitmapInfo.bpp;
      let depth = bitmapInfo.depth;
      this.read = dependencies.read;
      this.write = dependencies.write;
      this.complete = dependencies.complete;
      this._imageIndex = 0;
      this._images = [];
      if (interlace) {
        let passes = interlaceUtils.getImagePasses(width, height);
        for (let i = 0; i < passes.length; i++) {
          this._images.push({
            byteWidth: getByteWidth(passes[i].width, bpp, depth),
            height: passes[i].height,
            lineIndex: 0
          });
        }
      } else {
        this._images.push({
          byteWidth: getByteWidth(width, bpp, depth),
          height,
          lineIndex: 0
        });
      }
      if (depth === 8) {
        this._xComparison = bpp;
      } else if (depth === 16) {
        this._xComparison = bpp * 2;
      } else {
        this._xComparison = 1;
      }
    };
    Filter.prototype.start = function() {
      this.read(
        this._images[this._imageIndex].byteWidth + 1,
        this._reverseFilterLine.bind(this)
      );
    };
    Filter.prototype._unFilterType1 = function(rawData2, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData2[1 + x];
        let f1Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        unfilteredLine[x] = rawByte + f1Left;
      }
    };
    Filter.prototype._unFilterType2 = function(rawData2, unfilteredLine, byteWidth) {
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData2[1 + x];
        let f2Up = lastLine ? lastLine[x] : 0;
        unfilteredLine[x] = rawByte + f2Up;
      }
    };
    Filter.prototype._unFilterType3 = function(rawData2, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData2[1 + x];
        let f3Up = lastLine ? lastLine[x] : 0;
        let f3Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f3Add = Math.floor((f3Left + f3Up) / 2);
        unfilteredLine[x] = rawByte + f3Add;
      }
    };
    Filter.prototype._unFilterType4 = function(rawData2, unfilteredLine, byteWidth) {
      let xComparison = this._xComparison;
      let xBiggerThan = xComparison - 1;
      let lastLine = this._lastLine;
      for (let x = 0; x < byteWidth; x++) {
        let rawByte = rawData2[1 + x];
        let f4Up = lastLine ? lastLine[x] : 0;
        let f4Left = x > xBiggerThan ? unfilteredLine[x - xComparison] : 0;
        let f4UpLeft = x > xBiggerThan && lastLine ? lastLine[x - xComparison] : 0;
        let f4Add = paethPredictor(f4Left, f4Up, f4UpLeft);
        unfilteredLine[x] = rawByte + f4Add;
      }
    };
    Filter.prototype._reverseFilterLine = function(rawData2) {
      let filter = rawData2[0];
      let unfilteredLine;
      let currentImage = this._images[this._imageIndex];
      let byteWidth = currentImage.byteWidth;
      if (filter === 0) {
        unfilteredLine = rawData2.slice(1, byteWidth + 1);
      } else {
        unfilteredLine = Buffer.alloc(byteWidth);
        switch (filter) {
          case 1:
            this._unFilterType1(rawData2, unfilteredLine, byteWidth);
            break;
          case 2:
            this._unFilterType2(rawData2, unfilteredLine, byteWidth);
            break;
          case 3:
            this._unFilterType3(rawData2, unfilteredLine, byteWidth);
            break;
          case 4:
            this._unFilterType4(rawData2, unfilteredLine, byteWidth);
            break;
          default:
            throw new Error("Unrecognised filter type - " + filter);
        }
      }
      this.write(unfilteredLine);
      currentImage.lineIndex++;
      if (currentImage.lineIndex >= currentImage.height) {
        this._lastLine = null;
        this._imageIndex++;
        currentImage = this._images[this._imageIndex];
      } else {
        this._lastLine = unfilteredLine;
      }
      if (currentImage) {
        this.read(currentImage.byteWidth + 1, this._reverseFilterLine.bind(this));
      } else {
        this._lastLine = null;
        this.complete();
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-async.js
var require_filter_parse_async = __commonJS({
  "node_modules/pngjs/lib/filter-parse-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var ChunkStream = require_chunkstream();
    var Filter = require_filter_parse();
    var FilterAsync = module.exports = function(bitmapInfo) {
      ChunkStream.call(this);
      let buffers = [];
      let that = this;
      this._filter = new Filter(bitmapInfo, {
        read: this.read.bind(this),
        write: function(buffer2) {
          buffers.push(buffer2);
        },
        complete: function() {
          that.emit("complete", Buffer.concat(buffers));
        }
      });
      this._filter.start();
    };
    util.inherits(FilterAsync, ChunkStream);
  }
});

// node_modules/pngjs/lib/constants.js
var require_constants = __commonJS({
  "node_modules/pngjs/lib/constants.js"(exports, module) {
    "use strict";
    module.exports = {
      PNG_SIGNATURE: [137, 80, 78, 71, 13, 10, 26, 10],
      TYPE_IHDR: 1229472850,
      TYPE_IEND: 1229278788,
      TYPE_IDAT: 1229209940,
      TYPE_PLTE: 1347179589,
      TYPE_tRNS: 1951551059,
      // eslint-disable-line camelcase
      TYPE_gAMA: 1732332865,
      // eslint-disable-line camelcase
      // color-type bits
      COLORTYPE_GRAYSCALE: 0,
      COLORTYPE_PALETTE: 1,
      COLORTYPE_COLOR: 2,
      COLORTYPE_ALPHA: 4,
      // e.g. grayscale and alpha
      // color-type combinations
      COLORTYPE_PALETTE_COLOR: 3,
      COLORTYPE_COLOR_ALPHA: 6,
      COLORTYPE_TO_BPP_MAP: {
        0: 1,
        2: 3,
        3: 1,
        4: 2,
        6: 4
      },
      GAMMA_DIVISION: 1e5
    };
  }
});

// node_modules/pngjs/lib/crc.js
var require_crc = __commonJS({
  "node_modules/pngjs/lib/crc.js"(exports, module) {
    "use strict";
    var crcTable = [];
    (function() {
      for (let i = 0; i < 256; i++) {
        let currentCrc = i;
        for (let j = 0; j < 8; j++) {
          if (currentCrc & 1) {
            currentCrc = 3988292384 ^ currentCrc >>> 1;
          } else {
            currentCrc = currentCrc >>> 1;
          }
        }
        crcTable[i] = currentCrc;
      }
    })();
    var CrcCalculator = module.exports = function() {
      this._crc = -1;
    };
    CrcCalculator.prototype.write = function(data3) {
      for (let i = 0; i < data3.length; i++) {
        this._crc = crcTable[(this._crc ^ data3[i]) & 255] ^ this._crc >>> 8;
      }
      return true;
    };
    CrcCalculator.prototype.crc32 = function() {
      return this._crc ^ -1;
    };
    CrcCalculator.crc32 = function(buf) {
      let crc2 = -1;
      for (let i = 0; i < buf.length; i++) {
        crc2 = crcTable[(crc2 ^ buf[i]) & 255] ^ crc2 >>> 8;
      }
      return crc2 ^ -1;
    };
  }
});

// node_modules/pngjs/lib/parser.js
var require_parser = __commonJS({
  "node_modules/pngjs/lib/parser.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var CrcCalculator = require_crc();
    var Parser2 = module.exports = function(options, dependencies) {
      this._options = options;
      options.checkCRC = options.checkCRC !== false;
      this._hasIHDR = false;
      this._hasIEND = false;
      this._emittedHeadersFinished = false;
      this._palette = [];
      this._colorType = 0;
      this._chunks = {};
      this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
      this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
      this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
      this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
      this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
      this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);
      this.read = dependencies.read;
      this.error = dependencies.error;
      this.metadata = dependencies.metadata;
      this.gamma = dependencies.gamma;
      this.transColor = dependencies.transColor;
      this.palette = dependencies.palette;
      this.parsed = dependencies.parsed;
      this.inflateData = dependencies.inflateData;
      this.finished = dependencies.finished;
      this.simpleTransparency = dependencies.simpleTransparency;
      this.headersFinished = dependencies.headersFinished || function() {
      };
    };
    Parser2.prototype.start = function() {
      this.read(constants.PNG_SIGNATURE.length, this._parseSignature.bind(this));
    };
    Parser2.prototype._parseSignature = function(data3) {
      let signature = constants.PNG_SIGNATURE;
      for (let i = 0; i < signature.length; i++) {
        if (data3[i] !== signature[i]) {
          this.error(new Error("Invalid file signature"));
          return;
        }
      }
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser2.prototype._parseChunkBegin = function(data3) {
      let length2 = data3.readUInt32BE(0);
      let type = data3.readUInt32BE(4);
      let name2 = "";
      for (let i = 4; i < 8; i++) {
        name2 += String.fromCharCode(data3[i]);
      }
      let ancillary = Boolean(data3[4] & 32);
      if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
        this.error(new Error("Expected IHDR on beggining"));
        return;
      }
      this._crc = new CrcCalculator();
      this._crc.write(Buffer.from(name2));
      if (this._chunks[type]) {
        return this._chunks[type](length2);
      }
      if (!ancillary) {
        this.error(new Error("Unsupported critical chunk type " + name2));
        return;
      }
      this.read(length2 + 4, this._skipChunk.bind(this));
    };
    Parser2.prototype._skipChunk = function() {
      this.read(8, this._parseChunkBegin.bind(this));
    };
    Parser2.prototype._handleChunkEnd = function() {
      this.read(4, this._parseChunkEnd.bind(this));
    };
    Parser2.prototype._parseChunkEnd = function(data3) {
      let fileCrc = data3.readInt32BE(0);
      let calcCrc = this._crc.crc32();
      if (this._options.checkCRC && calcCrc !== fileCrc) {
        this.error(new Error("Crc error - " + fileCrc + " - " + calcCrc));
        return;
      }
      if (!this._hasIEND) {
        this.read(8, this._parseChunkBegin.bind(this));
      }
    };
    Parser2.prototype._handleIHDR = function(length2) {
      this.read(length2, this._parseIHDR.bind(this));
    };
    Parser2.prototype._parseIHDR = function(data3) {
      this._crc.write(data3);
      let width = data3.readUInt32BE(0);
      let height = data3.readUInt32BE(4);
      let depth = data3[8];
      let colorType = data3[9];
      let compr = data3[10];
      let filter = data3[11];
      let interlace = data3[12];
      if (depth !== 8 && depth !== 4 && depth !== 2 && depth !== 1 && depth !== 16) {
        this.error(new Error("Unsupported bit depth " + depth));
        return;
      }
      if (!(colorType in constants.COLORTYPE_TO_BPP_MAP)) {
        this.error(new Error("Unsupported color type"));
        return;
      }
      if (compr !== 0) {
        this.error(new Error("Unsupported compression method"));
        return;
      }
      if (filter !== 0) {
        this.error(new Error("Unsupported filter method"));
        return;
      }
      if (interlace !== 0 && interlace !== 1) {
        this.error(new Error("Unsupported interlace method"));
        return;
      }
      this._colorType = colorType;
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._colorType];
      this._hasIHDR = true;
      this.metadata({
        width,
        height,
        depth,
        interlace: Boolean(interlace),
        palette: Boolean(colorType & constants.COLORTYPE_PALETTE),
        color: Boolean(colorType & constants.COLORTYPE_COLOR),
        alpha: Boolean(colorType & constants.COLORTYPE_ALPHA),
        bpp,
        colorType
      });
      this._handleChunkEnd();
    };
    Parser2.prototype._handlePLTE = function(length2) {
      this.read(length2, this._parsePLTE.bind(this));
    };
    Parser2.prototype._parsePLTE = function(data3) {
      this._crc.write(data3);
      let entries = Math.floor(data3.length / 3);
      for (let i = 0; i < entries; i++) {
        this._palette.push([data3[i * 3], data3[i * 3 + 1], data3[i * 3 + 2], 255]);
      }
      this.palette(this._palette);
      this._handleChunkEnd();
    };
    Parser2.prototype._handleTRNS = function(length2) {
      this.simpleTransparency();
      this.read(length2, this._parseTRNS.bind(this));
    };
    Parser2.prototype._parseTRNS = function(data3) {
      this._crc.write(data3);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR) {
        if (this._palette.length === 0) {
          this.error(new Error("Transparency chunk must be after palette"));
          return;
        }
        if (data3.length > this._palette.length) {
          this.error(new Error("More transparent colors than palette size"));
          return;
        }
        for (let i = 0; i < data3.length; i++) {
          this._palette[i][3] = data3[i];
        }
        this.palette(this._palette);
      }
      if (this._colorType === constants.COLORTYPE_GRAYSCALE) {
        this.transColor([data3.readUInt16BE(0)]);
      }
      if (this._colorType === constants.COLORTYPE_COLOR) {
        this.transColor([
          data3.readUInt16BE(0),
          data3.readUInt16BE(2),
          data3.readUInt16BE(4)
        ]);
      }
      this._handleChunkEnd();
    };
    Parser2.prototype._handleGAMA = function(length2) {
      this.read(length2, this._parseGAMA.bind(this));
    };
    Parser2.prototype._parseGAMA = function(data3) {
      this._crc.write(data3);
      this.gamma(data3.readUInt32BE(0) / constants.GAMMA_DIVISION);
      this._handleChunkEnd();
    };
    Parser2.prototype._handleIDAT = function(length2) {
      if (!this._emittedHeadersFinished) {
        this._emittedHeadersFinished = true;
        this.headersFinished();
      }
      this.read(-length2, this._parseIDAT.bind(this, length2));
    };
    Parser2.prototype._parseIDAT = function(length2, data3) {
      this._crc.write(data3);
      if (this._colorType === constants.COLORTYPE_PALETTE_COLOR && this._palette.length === 0) {
        throw new Error("Expected palette not found");
      }
      this.inflateData(data3);
      let leftOverLength = length2 - data3.length;
      if (leftOverLength > 0) {
        this._handleIDAT(leftOverLength);
      } else {
        this._handleChunkEnd();
      }
    };
    Parser2.prototype._handleIEND = function(length2) {
      this.read(length2, this._parseIEND.bind(this));
    };
    Parser2.prototype._parseIEND = function(data3) {
      this._crc.write(data3);
      this._hasIEND = true;
      this._handleChunkEnd();
      if (this.finished) {
        this.finished();
      }
    };
  }
});

// node_modules/pngjs/lib/bitmapper.js
var require_bitmapper = __commonJS({
  "node_modules/pngjs/lib/bitmapper.js"(exports) {
    "use strict";
    var interlaceUtils = require_interlace();
    var pixelBppMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, data3, pxPos, rawPos) {
        if (rawPos === data3.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data3[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = 255;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, data3, pxPos, rawPos) {
        if (rawPos + 1 >= data3.length) {
          throw new Error("Ran out of data");
        }
        let pixel = data3[rawPos];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = data3[rawPos + 1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, data3, pxPos, rawPos) {
        if (rawPos + 2 >= data3.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data3[rawPos];
        pxData[pxPos + 1] = data3[rawPos + 1];
        pxData[pxPos + 2] = data3[rawPos + 2];
        pxData[pxPos + 3] = 255;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, data3, pxPos, rawPos) {
        if (rawPos + 3 >= data3.length) {
          throw new Error("Ran out of data");
        }
        pxData[pxPos] = data3[rawPos];
        pxData[pxPos + 1] = data3[rawPos + 1];
        pxData[pxPos + 2] = data3[rawPos + 2];
        pxData[pxPos + 3] = data3[rawPos + 3];
      }
    ];
    var pixelBppCustomMapper = [
      // 0 - dummy entry
      function() {
      },
      // 1 - L
      // 0: 0, 1: 0, 2: 0, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = maxBit;
      },
      // 2 - LA
      // 0: 0, 1: 0, 2: 0, 3: 1
      function(pxData, pixelData, pxPos) {
        let pixel = pixelData[0];
        pxData[pxPos] = pixel;
        pxData[pxPos + 1] = pixel;
        pxData[pxPos + 2] = pixel;
        pxData[pxPos + 3] = pixelData[1];
      },
      // 3 - RGB
      // 0: 0, 1: 1, 2: 2, 3: 0xff
      function(pxData, pixelData, pxPos, maxBit) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = maxBit;
      },
      // 4 - RGBA
      // 0: 0, 1: 1, 2: 2, 3: 3
      function(pxData, pixelData, pxPos) {
        pxData[pxPos] = pixelData[0];
        pxData[pxPos + 1] = pixelData[1];
        pxData[pxPos + 2] = pixelData[2];
        pxData[pxPos + 3] = pixelData[3];
      }
    ];
    function bitRetriever(data3, depth) {
      let leftOver = [];
      let i = 0;
      function split() {
        if (i === data3.length) {
          throw new Error("Ran out of data");
        }
        let byte = data3[i];
        i++;
        let byte8, byte7, byte6, byte5, byte4, byte3, byte2, byte1;
        switch (depth) {
          default:
            throw new Error("unrecognised depth");
          case 16:
            byte2 = data3[i];
            i++;
            leftOver.push((byte << 8) + byte2);
            break;
          case 4:
            byte2 = byte & 15;
            byte1 = byte >> 4;
            leftOver.push(byte1, byte2);
            break;
          case 2:
            byte4 = byte & 3;
            byte3 = byte >> 2 & 3;
            byte2 = byte >> 4 & 3;
            byte1 = byte >> 6 & 3;
            leftOver.push(byte1, byte2, byte3, byte4);
            break;
          case 1:
            byte8 = byte & 1;
            byte7 = byte >> 1 & 1;
            byte6 = byte >> 2 & 1;
            byte5 = byte >> 3 & 1;
            byte4 = byte >> 4 & 1;
            byte3 = byte >> 5 & 1;
            byte2 = byte >> 6 & 1;
            byte1 = byte >> 7 & 1;
            leftOver.push(byte1, byte2, byte3, byte4, byte5, byte6, byte7, byte8);
            break;
        }
      }
      return {
        get: function(count) {
          while (leftOver.length < count) {
            split();
          }
          let returner = leftOver.slice(0, count);
          leftOver = leftOver.slice(count);
          return returner;
        },
        resetAfterLine: function() {
          leftOver.length = 0;
        },
        end: function() {
          if (i !== data3.length) {
            throw new Error("extra data found");
          }
        }
      };
    }
    function mapImage8Bit(image, pxData, getPxPos, bpp, data3, rawPos) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppMapper[bpp](pxData, data3, pxPos, rawPos);
          rawPos += bpp;
        }
      }
      return rawPos;
    }
    function mapImageCustomBit(image, pxData, getPxPos, bpp, bits, maxBit) {
      let imageWidth = image.width;
      let imageHeight = image.height;
      let imagePass = image.index;
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          let pixelData = bits.get(bpp);
          let pxPos = getPxPos(x, y, imagePass);
          pixelBppCustomMapper[bpp](pxData, pixelData, pxPos, maxBit);
        }
        bits.resetAfterLine();
      }
    }
    exports.dataToBitMap = function(data3, bitmapInfo) {
      let width = bitmapInfo.width;
      let height = bitmapInfo.height;
      let depth = bitmapInfo.depth;
      let bpp = bitmapInfo.bpp;
      let interlace = bitmapInfo.interlace;
      let bits;
      if (depth !== 8) {
        bits = bitRetriever(data3, depth);
      }
      let pxData;
      if (depth <= 8) {
        pxData = Buffer.alloc(width * height * 4);
      } else {
        pxData = new Uint16Array(width * height * 4);
      }
      let maxBit = Math.pow(2, depth) - 1;
      let rawPos = 0;
      let images;
      let getPxPos;
      if (interlace) {
        images = interlaceUtils.getImagePasses(width, height);
        getPxPos = interlaceUtils.getInterlaceIterator(width, height);
      } else {
        let nonInterlacedPxPos = 0;
        getPxPos = function() {
          let returner = nonInterlacedPxPos;
          nonInterlacedPxPos += 4;
          return returner;
        };
        images = [{ width, height }];
      }
      for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
        if (depth === 8) {
          rawPos = mapImage8Bit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            data3,
            rawPos
          );
        } else {
          mapImageCustomBit(
            images[imageIndex],
            pxData,
            getPxPos,
            bpp,
            bits,
            maxBit
          );
        }
      }
      if (depth === 8) {
        if (rawPos !== data3.length) {
          throw new Error("extra data found");
        }
      } else {
        bits.end();
      }
      return pxData;
    };
  }
});

// node_modules/pngjs/lib/format-normaliser.js
var require_format_normaliser = __commonJS({
  "node_modules/pngjs/lib/format-normaliser.js"(exports, module) {
    "use strict";
    function dePalette(indata, outdata, width, height, palette) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let color = palette[indata[pxPos]];
          if (!color) {
            throw new Error("index " + indata[pxPos] + " not in palette");
          }
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = color[i];
          }
          pxPos += 4;
        }
      }
    }
    function replaceTransparentColor(indata, outdata, width, height, transColor) {
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let makeTrans = false;
          if (transColor.length === 1) {
            if (transColor[0] === indata[pxPos]) {
              makeTrans = true;
            }
          } else if (transColor[0] === indata[pxPos] && transColor[1] === indata[pxPos + 1] && transColor[2] === indata[pxPos + 2]) {
            makeTrans = true;
          }
          if (makeTrans) {
            for (let i = 0; i < 4; i++) {
              outdata[pxPos + i] = 0;
            }
          }
          pxPos += 4;
        }
      }
    }
    function scaleDepth(indata, outdata, width, height, depth) {
      let maxOutSample = 255;
      let maxInSample = Math.pow(2, depth) - 1;
      let pxPos = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          for (let i = 0; i < 4; i++) {
            outdata[pxPos + i] = Math.floor(
              indata[pxPos + i] * maxOutSample / maxInSample + 0.5
            );
          }
          pxPos += 4;
        }
      }
    }
    module.exports = function(indata, imageData) {
      let depth = imageData.depth;
      let width = imageData.width;
      let height = imageData.height;
      let colorType = imageData.colorType;
      let transColor = imageData.transColor;
      let palette = imageData.palette;
      let outdata = indata;
      if (colorType === 3) {
        dePalette(indata, outdata, width, height, palette);
      } else {
        if (transColor) {
          replaceTransparentColor(indata, outdata, width, height, transColor);
        }
        if (depth !== 8) {
          if (depth === 16) {
            outdata = Buffer.alloc(width * height * 4);
          }
          scaleDepth(indata, outdata, width, height, depth);
        }
      }
      return outdata;
    };
  }
});

// node_modules/pngjs/lib/parser-async.js
var require_parser_async = __commonJS({
  "node_modules/pngjs/lib/parser-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var zlib = __require("zlib");
    var ChunkStream = require_chunkstream();
    var FilterAsync = require_filter_parse_async();
    var Parser2 = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    var ParserAsync = module.exports = function(options) {
      ChunkStream.call(this);
      this._parser = new Parser2(options, {
        read: this.read.bind(this),
        error: this._handleError.bind(this),
        metadata: this._handleMetaData.bind(this),
        gamma: this.emit.bind(this, "gamma"),
        palette: this._handlePalette.bind(this),
        transColor: this._handleTransColor.bind(this),
        finished: this._finished.bind(this),
        inflateData: this._inflateData.bind(this),
        simpleTransparency: this._simpleTransparency.bind(this),
        headersFinished: this._headersFinished.bind(this)
      });
      this._options = options;
      this.writable = true;
      this._parser.start();
    };
    util.inherits(ParserAsync, ChunkStream);
    ParserAsync.prototype._handleError = function(err) {
      this.emit("error", err);
      this.writable = false;
      this.destroy();
      if (this._inflate && this._inflate.destroy) {
        this._inflate.destroy();
      }
      if (this._filter) {
        this._filter.destroy();
        this._filter.on("error", function() {
        });
      }
      this.errord = true;
    };
    ParserAsync.prototype._inflateData = function(data3) {
      if (!this._inflate) {
        if (this._bitmapInfo.interlace) {
          this._inflate = zlib.createInflate();
          this._inflate.on("error", this.emit.bind(this, "error"));
          this._filter.on("complete", this._complete.bind(this));
          this._inflate.pipe(this._filter);
        } else {
          let rowSize = (this._bitmapInfo.width * this._bitmapInfo.bpp * this._bitmapInfo.depth + 7 >> 3) + 1;
          let imageSize = rowSize * this._bitmapInfo.height;
          let chunkSize = Math.max(imageSize, zlib.Z_MIN_CHUNK);
          this._inflate = zlib.createInflate({ chunkSize });
          let leftToInflate = imageSize;
          let emitError = this.emit.bind(this, "error");
          this._inflate.on("error", function(err) {
            if (!leftToInflate) {
              return;
            }
            emitError(err);
          });
          this._filter.on("complete", this._complete.bind(this));
          let filterWrite = this._filter.write.bind(this._filter);
          this._inflate.on("data", function(chunk) {
            if (!leftToInflate) {
              return;
            }
            if (chunk.length > leftToInflate) {
              chunk = chunk.slice(0, leftToInflate);
            }
            leftToInflate -= chunk.length;
            filterWrite(chunk);
          });
          this._inflate.on("end", this._filter.end.bind(this._filter));
        }
      }
      this._inflate.write(data3);
    };
    ParserAsync.prototype._handleMetaData = function(metaData) {
      this._metaData = metaData;
      this._bitmapInfo = Object.create(metaData);
      this._filter = new FilterAsync(this._bitmapInfo);
    };
    ParserAsync.prototype._handleTransColor = function(transColor) {
      this._bitmapInfo.transColor = transColor;
    };
    ParserAsync.prototype._handlePalette = function(palette) {
      this._bitmapInfo.palette = palette;
    };
    ParserAsync.prototype._simpleTransparency = function() {
      this._metaData.alpha = true;
    };
    ParserAsync.prototype._headersFinished = function() {
      this.emit("metadata", this._metaData);
    };
    ParserAsync.prototype._finished = function() {
      if (this.errord) {
        return;
      }
      if (!this._inflate) {
        this.emit("error", "No Inflate block");
      } else {
        this._inflate.end();
      }
    };
    ParserAsync.prototype._complete = function(filteredData) {
      if (this.errord) {
        return;
      }
      let normalisedBitmapData;
      try {
        let bitmapData = bitmapper.dataToBitMap(filteredData, this._bitmapInfo);
        normalisedBitmapData = formatNormaliser(bitmapData, this._bitmapInfo);
        bitmapData = null;
      } catch (ex) {
        this._handleError(ex);
        return;
      }
      this.emit("parsed", normalisedBitmapData);
    };
  }
});

// node_modules/pngjs/lib/bitpacker.js
var require_bitpacker = __commonJS({
  "node_modules/pngjs/lib/bitpacker.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    module.exports = function(dataIn, width, height, options) {
      let outHasAlpha = [constants.COLORTYPE_COLOR_ALPHA, constants.COLORTYPE_ALPHA].indexOf(
        options.colorType
      ) !== -1;
      if (options.colorType === options.inputColorType) {
        let bigEndian = (function() {
          let buffer2 = new ArrayBuffer(2);
          new DataView(buffer2).setInt16(
            0,
            256,
            true
            /* littleEndian */
          );
          return new Int16Array(buffer2)[0] !== 256;
        })();
        if (options.bitDepth === 8 || options.bitDepth === 16 && bigEndian) {
          return dataIn;
        }
      }
      let data3 = options.bitDepth !== 16 ? dataIn : new Uint16Array(dataIn.buffer);
      let maxValue = 255;
      let inBpp = constants.COLORTYPE_TO_BPP_MAP[options.inputColorType];
      if (inBpp === 4 && !options.inputHasAlpha) {
        inBpp = 3;
      }
      let outBpp = constants.COLORTYPE_TO_BPP_MAP[options.colorType];
      if (options.bitDepth === 16) {
        maxValue = 65535;
        outBpp *= 2;
      }
      let outData = Buffer.alloc(width * height * outBpp);
      let inIndex = 0;
      let outIndex = 0;
      let bgColor = options.bgColor || {};
      if (bgColor.red === void 0) {
        bgColor.red = maxValue;
      }
      if (bgColor.green === void 0) {
        bgColor.green = maxValue;
      }
      if (bgColor.blue === void 0) {
        bgColor.blue = maxValue;
      }
      function getRGBA() {
        let red;
        let green;
        let blue;
        let alpha = maxValue;
        switch (options.inputColorType) {
          case constants.COLORTYPE_COLOR_ALPHA:
            alpha = data3[inIndex + 3];
            red = data3[inIndex];
            green = data3[inIndex + 1];
            blue = data3[inIndex + 2];
            break;
          case constants.COLORTYPE_COLOR:
            red = data3[inIndex];
            green = data3[inIndex + 1];
            blue = data3[inIndex + 2];
            break;
          case constants.COLORTYPE_ALPHA:
            alpha = data3[inIndex + 1];
            red = data3[inIndex];
            green = red;
            blue = red;
            break;
          case constants.COLORTYPE_GRAYSCALE:
            red = data3[inIndex];
            green = red;
            blue = red;
            break;
          default:
            throw new Error(
              "input color type:" + options.inputColorType + " is not supported at present"
            );
        }
        if (options.inputHasAlpha) {
          if (!outHasAlpha) {
            alpha /= maxValue;
            red = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.red + alpha * red), 0),
              maxValue
            );
            green = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.green + alpha * green), 0),
              maxValue
            );
            blue = Math.min(
              Math.max(Math.round((1 - alpha) * bgColor.blue + alpha * blue), 0),
              maxValue
            );
          }
        }
        return { red, green, blue, alpha };
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let rgba = getRGBA(data3, inIndex);
          switch (options.colorType) {
            case constants.COLORTYPE_COLOR_ALPHA:
            case constants.COLORTYPE_COLOR:
              if (options.bitDepth === 8) {
                outData[outIndex] = rgba.red;
                outData[outIndex + 1] = rgba.green;
                outData[outIndex + 2] = rgba.blue;
                if (outHasAlpha) {
                  outData[outIndex + 3] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(rgba.red, outIndex);
                outData.writeUInt16BE(rgba.green, outIndex + 2);
                outData.writeUInt16BE(rgba.blue, outIndex + 4);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 6);
                }
              }
              break;
            case constants.COLORTYPE_ALPHA:
            case constants.COLORTYPE_GRAYSCALE: {
              let grayscale = (rgba.red + rgba.green + rgba.blue) / 3;
              if (options.bitDepth === 8) {
                outData[outIndex] = grayscale;
                if (outHasAlpha) {
                  outData[outIndex + 1] = rgba.alpha;
                }
              } else {
                outData.writeUInt16BE(grayscale, outIndex);
                if (outHasAlpha) {
                  outData.writeUInt16BE(rgba.alpha, outIndex + 2);
                }
              }
              break;
            }
            default:
              throw new Error("unrecognised color Type " + options.colorType);
          }
          inIndex += inBpp;
          outIndex += outBpp;
        }
      }
      return outData;
    };
  }
});

// node_modules/pngjs/lib/filter-pack.js
var require_filter_pack = __commonJS({
  "node_modules/pngjs/lib/filter-pack.js"(exports, module) {
    "use strict";
    var paethPredictor = require_paeth_predictor();
    function filterNone(pxData, pxPos, byteWidth, rawData2, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        rawData2[rawPos + x] = pxData[pxPos + x];
      }
    }
    function filterSumNone(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length2 = pxPos + byteWidth;
      for (let i = pxPos; i < length2; i++) {
        sum += Math.abs(pxData[i]);
      }
      return sum;
    }
    function filterSub(pxData, pxPos, byteWidth, rawData2, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        rawData2[rawPos + x] = val;
      }
    }
    function filterSumSub(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let val = pxData[pxPos + x] - left;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterUp(pxData, pxPos, byteWidth, rawData2, rawPos) {
      for (let x = 0; x < byteWidth; x++) {
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - up;
        rawData2[rawPos + x] = val;
      }
    }
    function filterSumUp(pxData, pxPos, byteWidth) {
      let sum = 0;
      let length2 = pxPos + byteWidth;
      for (let x = pxPos; x < length2; x++) {
        let up = pxPos > 0 ? pxData[x - byteWidth] : 0;
        let val = pxData[x] - up;
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterAvg(pxData, pxPos, byteWidth, rawData2, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        rawData2[rawPos + x] = val;
      }
    }
    function filterSumAvg(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let val = pxData[pxPos + x] - (left + up >> 1);
        sum += Math.abs(val);
      }
      return sum;
    }
    function filterPaeth(pxData, pxPos, byteWidth, rawData2, rawPos, bpp) {
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        rawData2[rawPos + x] = val;
      }
    }
    function filterSumPaeth(pxData, pxPos, byteWidth, bpp) {
      let sum = 0;
      for (let x = 0; x < byteWidth; x++) {
        let left = x >= bpp ? pxData[pxPos + x - bpp] : 0;
        let up = pxPos > 0 ? pxData[pxPos + x - byteWidth] : 0;
        let upleft = pxPos > 0 && x >= bpp ? pxData[pxPos + x - (byteWidth + bpp)] : 0;
        let val = pxData[pxPos + x] - paethPredictor(left, up, upleft);
        sum += Math.abs(val);
      }
      return sum;
    }
    var filters = {
      0: filterNone,
      1: filterSub,
      2: filterUp,
      3: filterAvg,
      4: filterPaeth
    };
    var filterSums = {
      0: filterSumNone,
      1: filterSumSub,
      2: filterSumUp,
      3: filterSumAvg,
      4: filterSumPaeth
    };
    module.exports = function(pxData, width, height, options, bpp) {
      let filterTypes;
      if (!("filterType" in options) || options.filterType === -1) {
        filterTypes = [0, 1, 2, 3, 4];
      } else if (typeof options.filterType === "number") {
        filterTypes = [options.filterType];
      } else {
        throw new Error("unrecognised filter types");
      }
      if (options.bitDepth === 16) {
        bpp *= 2;
      }
      let byteWidth = width * bpp;
      let rawPos = 0;
      let pxPos = 0;
      let rawData2 = Buffer.alloc((byteWidth + 1) * height);
      let sel = filterTypes[0];
      for (let y = 0; y < height; y++) {
        if (filterTypes.length > 1) {
          let min = Infinity;
          for (let i = 0; i < filterTypes.length; i++) {
            let sum = filterSums[filterTypes[i]](pxData, pxPos, byteWidth, bpp);
            if (sum < min) {
              sel = filterTypes[i];
              min = sum;
            }
          }
        }
        rawData2[rawPos] = sel;
        rawPos++;
        filters[sel](pxData, pxPos, byteWidth, rawData2, rawPos, bpp);
        rawPos += byteWidth;
        pxPos += byteWidth;
      }
      return rawData2;
    };
  }
});

// node_modules/pngjs/lib/packer.js
var require_packer = __commonJS({
  "node_modules/pngjs/lib/packer.js"(exports, module) {
    "use strict";
    var constants = require_constants();
    var CrcStream = require_crc();
    var bitPacker = require_bitpacker();
    var filter = require_filter_pack();
    var zlib = __require("zlib");
    var Packer = module.exports = function(options) {
      this._options = options;
      options.deflateChunkSize = options.deflateChunkSize || 32 * 1024;
      options.deflateLevel = options.deflateLevel != null ? options.deflateLevel : 9;
      options.deflateStrategy = options.deflateStrategy != null ? options.deflateStrategy : 3;
      options.inputHasAlpha = options.inputHasAlpha != null ? options.inputHasAlpha : true;
      options.deflateFactory = options.deflateFactory || zlib.createDeflate;
      options.bitDepth = options.bitDepth || 8;
      options.colorType = typeof options.colorType === "number" ? options.colorType : constants.COLORTYPE_COLOR_ALPHA;
      options.inputColorType = typeof options.inputColorType === "number" ? options.inputColorType : constants.COLORTYPE_COLOR_ALPHA;
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.colorType) === -1) {
        throw new Error(
          "option color type:" + options.colorType + " is not supported at present"
        );
      }
      if ([
        constants.COLORTYPE_GRAYSCALE,
        constants.COLORTYPE_COLOR,
        constants.COLORTYPE_COLOR_ALPHA,
        constants.COLORTYPE_ALPHA
      ].indexOf(options.inputColorType) === -1) {
        throw new Error(
          "option input color type:" + options.inputColorType + " is not supported at present"
        );
      }
      if (options.bitDepth !== 8 && options.bitDepth !== 16) {
        throw new Error(
          "option bit depth:" + options.bitDepth + " is not supported at present"
        );
      }
    };
    Packer.prototype.getDeflateOptions = function() {
      return {
        chunkSize: this._options.deflateChunkSize,
        level: this._options.deflateLevel,
        strategy: this._options.deflateStrategy
      };
    };
    Packer.prototype.createDeflate = function() {
      return this._options.deflateFactory(this.getDeflateOptions());
    };
    Packer.prototype.filterData = function(data3, width, height) {
      let packedData = bitPacker(data3, width, height, this._options);
      let bpp = constants.COLORTYPE_TO_BPP_MAP[this._options.colorType];
      let filteredData = filter(packedData, width, height, this._options, bpp);
      return filteredData;
    };
    Packer.prototype._packChunk = function(type, data3) {
      let len = data3 ? data3.length : 0;
      let buf = Buffer.alloc(len + 12);
      buf.writeUInt32BE(len, 0);
      buf.writeUInt32BE(type, 4);
      if (data3) {
        data3.copy(buf, 8);
      }
      buf.writeInt32BE(
        CrcStream.crc32(buf.slice(4, buf.length - 4)),
        buf.length - 4
      );
      return buf;
    };
    Packer.prototype.packGAMA = function(gamma) {
      let buf = Buffer.alloc(4);
      buf.writeUInt32BE(Math.floor(gamma * constants.GAMMA_DIVISION), 0);
      return this._packChunk(constants.TYPE_gAMA, buf);
    };
    Packer.prototype.packIHDR = function(width, height) {
      let buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = this._options.bitDepth;
      buf[9] = this._options.colorType;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return this._packChunk(constants.TYPE_IHDR, buf);
    };
    Packer.prototype.packIDAT = function(data3) {
      return this._packChunk(constants.TYPE_IDAT, data3);
    };
    Packer.prototype.packIEND = function() {
      return this._packChunk(constants.TYPE_IEND, null);
    };
  }
});

// node_modules/pngjs/lib/packer-async.js
var require_packer_async = __commonJS({
  "node_modules/pngjs/lib/packer-async.js"(exports, module) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var constants = require_constants();
    var Packer = require_packer();
    var PackerAsync = module.exports = function(opt) {
      Stream.call(this);
      let options = opt || {};
      this._packer = new Packer(options);
      this._deflate = this._packer.createDeflate();
      this.readable = true;
    };
    util.inherits(PackerAsync, Stream);
    PackerAsync.prototype.pack = function(data3, width, height, gamma) {
      this.emit("data", Buffer.from(constants.PNG_SIGNATURE));
      this.emit("data", this._packer.packIHDR(width, height));
      if (gamma) {
        this.emit("data", this._packer.packGAMA(gamma));
      }
      let filteredData = this._packer.filterData(data3, width, height);
      this._deflate.on("error", this.emit.bind(this, "error"));
      this._deflate.on(
        "data",
        function(compressedData) {
          this.emit("data", this._packer.packIDAT(compressedData));
        }.bind(this)
      );
      this._deflate.on(
        "end",
        function() {
          this.emit("data", this._packer.packIEND());
          this.emit("end");
        }.bind(this)
      );
      this._deflate.end(filteredData);
    };
  }
});

// node_modules/pngjs/lib/sync-inflate.js
var require_sync_inflate = __commonJS({
  "node_modules/pngjs/lib/sync-inflate.js"(exports, module) {
    "use strict";
    var assert = __require("assert").ok;
    var zlib = __require("zlib");
    var util = __require("util");
    var kMaxLength = __require("buffer").kMaxLength;
    function Inflate(opts) {
      if (!(this instanceof Inflate)) {
        return new Inflate(opts);
      }
      if (opts && opts.chunkSize < zlib.Z_MIN_CHUNK) {
        opts.chunkSize = zlib.Z_MIN_CHUNK;
      }
      zlib.Inflate.call(this, opts);
      this._offset = this._offset === void 0 ? this._outOffset : this._offset;
      this._buffer = this._buffer || this._outBuffer;
      if (opts && opts.maxLength != null) {
        this._maxLength = opts.maxLength;
      }
    }
    function createInflate(opts) {
      return new Inflate(opts);
    }
    function _close(engine, callback) {
      if (callback) {
        process.nextTick(callback);
      }
      if (!engine._handle) {
        return;
      }
      engine._handle.close();
      engine._handle = null;
    }
    Inflate.prototype._processChunk = function(chunk, flushFlag, asyncCb) {
      if (typeof asyncCb === "function") {
        return zlib.Inflate._processChunk.call(this, chunk, flushFlag, asyncCb);
      }
      let self2 = this;
      let availInBefore = chunk && chunk.length;
      let availOutBefore = this._chunkSize - this._offset;
      let leftToInflate = this._maxLength;
      let inOff = 0;
      let buffers = [];
      let nread = 0;
      let error;
      this.on("error", function(err) {
        error = err;
      });
      function handleChunk(availInAfter, availOutAfter) {
        if (self2._hadError) {
          return;
        }
        let have = availOutBefore - availOutAfter;
        assert(have >= 0, "have should not go down");
        if (have > 0) {
          let out = self2._buffer.slice(self2._offset, self2._offset + have);
          self2._offset += have;
          if (out.length > leftToInflate) {
            out = out.slice(0, leftToInflate);
          }
          buffers.push(out);
          nread += out.length;
          leftToInflate -= out.length;
          if (leftToInflate === 0) {
            return false;
          }
        }
        if (availOutAfter === 0 || self2._offset >= self2._chunkSize) {
          availOutBefore = self2._chunkSize;
          self2._offset = 0;
          self2._buffer = Buffer.allocUnsafe(self2._chunkSize);
        }
        if (availOutAfter === 0) {
          inOff += availInBefore - availInAfter;
          availInBefore = availInAfter;
          return true;
        }
        return false;
      }
      assert(this._handle, "zlib binding closed");
      let res;
      do {
        res = this._handle.writeSync(
          flushFlag,
          chunk,
          // in
          inOff,
          // in_off
          availInBefore,
          // in_len
          this._buffer,
          // out
          this._offset,
          //out_off
          availOutBefore
        );
        res = res || this._writeState;
      } while (!this._hadError && handleChunk(res[0], res[1]));
      if (this._hadError) {
        throw error;
      }
      if (nread >= kMaxLength) {
        _close(this);
        throw new RangeError(
          "Cannot create final Buffer. It would be larger than 0x" + kMaxLength.toString(16) + " bytes"
        );
      }
      let buf = Buffer.concat(buffers, nread);
      _close(this);
      return buf;
    };
    util.inherits(Inflate, zlib.Inflate);
    function zlibBufferSync(engine, buffer2) {
      if (typeof buffer2 === "string") {
        buffer2 = Buffer.from(buffer2);
      }
      if (!(buffer2 instanceof Buffer)) {
        throw new TypeError("Not a string or buffer");
      }
      let flushFlag = engine._finishFlushFlag;
      if (flushFlag == null) {
        flushFlag = zlib.Z_FINISH;
      }
      return engine._processChunk(buffer2, flushFlag);
    }
    function inflateSync(buffer2, opts) {
      return zlibBufferSync(new Inflate(opts), buffer2);
    }
    module.exports = exports = inflateSync;
    exports.Inflate = Inflate;
    exports.createInflate = createInflate;
    exports.inflateSync = inflateSync;
  }
});

// node_modules/pngjs/lib/sync-reader.js
var require_sync_reader = __commonJS({
  "node_modules/pngjs/lib/sync-reader.js"(exports, module) {
    "use strict";
    var SyncReader = module.exports = function(buffer2) {
      this._buffer = buffer2;
      this._reads = [];
    };
    SyncReader.prototype.read = function(length2, callback) {
      this._reads.push({
        length: Math.abs(length2),
        // if length < 0 then at most this length
        allowLess: length2 < 0,
        func: callback
      });
    };
    SyncReader.prototype.process = function() {
      while (this._reads.length > 0 && this._buffer.length) {
        let read = this._reads[0];
        if (this._buffer.length && (this._buffer.length >= read.length || read.allowLess)) {
          this._reads.shift();
          let buf = this._buffer;
          this._buffer = buf.slice(read.length);
          read.func.call(this, buf.slice(0, read.length));
        } else {
          break;
        }
      }
      if (this._reads.length > 0) {
        return new Error("There are some read requests waitng on finished stream");
      }
      if (this._buffer.length > 0) {
        return new Error("unrecognised content at end of stream");
      }
    };
  }
});

// node_modules/pngjs/lib/filter-parse-sync.js
var require_filter_parse_sync = __commonJS({
  "node_modules/pngjs/lib/filter-parse-sync.js"(exports) {
    "use strict";
    var SyncReader = require_sync_reader();
    var Filter = require_filter_parse();
    exports.process = function(inBuffer, bitmapInfo) {
      let outBuffers = [];
      let reader = new SyncReader(inBuffer);
      let filter = new Filter(bitmapInfo, {
        read: reader.read.bind(reader),
        write: function(bufferPart) {
          outBuffers.push(bufferPart);
        },
        complete: function() {
        }
      });
      filter.start();
      reader.process();
      return Buffer.concat(outBuffers);
    };
  }
});

// node_modules/pngjs/lib/parser-sync.js
var require_parser_sync = __commonJS({
  "node_modules/pngjs/lib/parser-sync.js"(exports, module) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = __require("zlib");
    var inflateSync = require_sync_inflate();
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var SyncReader = require_sync_reader();
    var FilterSync = require_filter_parse_sync();
    var Parser2 = require_parser();
    var bitmapper = require_bitmapper();
    var formatNormaliser = require_format_normaliser();
    module.exports = function(buffer2, options) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let err;
      function handleError(_err_) {
        err = _err_;
      }
      let metaData;
      function handleMetaData(_metaData_) {
        metaData = _metaData_;
      }
      function handleTransColor(transColor) {
        metaData.transColor = transColor;
      }
      function handlePalette(palette) {
        metaData.palette = palette;
      }
      function handleSimpleTransparency() {
        metaData.alpha = true;
      }
      let gamma;
      function handleGamma(_gamma_) {
        gamma = _gamma_;
      }
      let inflateDataList = [];
      function handleInflateData(inflatedData2) {
        inflateDataList.push(inflatedData2);
      }
      let reader = new SyncReader(buffer2);
      let parser = new Parser2(options, {
        read: reader.read.bind(reader),
        error: handleError,
        metadata: handleMetaData,
        gamma: handleGamma,
        palette: handlePalette,
        transColor: handleTransColor,
        inflateData: handleInflateData,
        simpleTransparency: handleSimpleTransparency
      });
      parser.start();
      reader.process();
      if (err) {
        throw err;
      }
      let inflateData = Buffer.concat(inflateDataList);
      inflateDataList.length = 0;
      let inflatedData;
      if (metaData.interlace) {
        inflatedData = zlib.inflateSync(inflateData);
      } else {
        let rowSize = (metaData.width * metaData.bpp * metaData.depth + 7 >> 3) + 1;
        let imageSize = rowSize * metaData.height;
        inflatedData = inflateSync(inflateData, {
          chunkSize: imageSize,
          maxLength: imageSize
        });
      }
      inflateData = null;
      if (!inflatedData || !inflatedData.length) {
        throw new Error("bad png - invalid inflate data response");
      }
      let unfilteredData = FilterSync.process(inflatedData, metaData);
      inflateData = null;
      let bitmapData = bitmapper.dataToBitMap(unfilteredData, metaData);
      unfilteredData = null;
      let normalisedBitmapData = formatNormaliser(bitmapData, metaData);
      metaData.data = normalisedBitmapData;
      metaData.gamma = gamma || 0;
      return metaData;
    };
  }
});

// node_modules/pngjs/lib/packer-sync.js
var require_packer_sync = __commonJS({
  "node_modules/pngjs/lib/packer-sync.js"(exports, module) {
    "use strict";
    var hasSyncZlib = true;
    var zlib = __require("zlib");
    if (!zlib.deflateSync) {
      hasSyncZlib = false;
    }
    var constants = require_constants();
    var Packer = require_packer();
    module.exports = function(metaData, opt) {
      if (!hasSyncZlib) {
        throw new Error(
          "To use the sync capability of this library in old node versions, please pin pngjs to v2.3.0"
        );
      }
      let options = opt || {};
      let packer = new Packer(options);
      let chunks = [];
      chunks.push(Buffer.from(constants.PNG_SIGNATURE));
      chunks.push(packer.packIHDR(metaData.width, metaData.height));
      if (metaData.gamma) {
        chunks.push(packer.packGAMA(metaData.gamma));
      }
      let filteredData = packer.filterData(
        metaData.data,
        metaData.width,
        metaData.height
      );
      let compressedData = zlib.deflateSync(
        filteredData,
        packer.getDeflateOptions()
      );
      filteredData = null;
      if (!compressedData || !compressedData.length) {
        throw new Error("bad png - invalid compressed data response");
      }
      chunks.push(packer.packIDAT(compressedData));
      chunks.push(packer.packIEND());
      return Buffer.concat(chunks);
    };
  }
});

// node_modules/pngjs/lib/png-sync.js
var require_png_sync = __commonJS({
  "node_modules/pngjs/lib/png-sync.js"(exports) {
    "use strict";
    var parse = require_parser_sync();
    var pack = require_packer_sync();
    exports.read = function(buffer2, options) {
      return parse(buffer2, options || {});
    };
    exports.write = function(png, options) {
      return pack(png, options);
    };
  }
});

// node_modules/pngjs/lib/png.js
var require_png = __commonJS({
  "node_modules/pngjs/lib/png.js"(exports) {
    "use strict";
    var util = __require("util");
    var Stream = __require("stream");
    var Parser2 = require_parser_async();
    var Packer = require_packer_async();
    var PNGSync = require_png_sync();
    var PNG = exports.PNG = function(options) {
      Stream.call(this);
      options = options || {};
      this.width = options.width | 0;
      this.height = options.height | 0;
      this.data = this.width > 0 && this.height > 0 ? Buffer.alloc(4 * this.width * this.height) : null;
      if (options.fill && this.data) {
        this.data.fill(0);
      }
      this.gamma = 0;
      this.readable = this.writable = true;
      this._parser = new Parser2(options);
      this._parser.on("error", this.emit.bind(this, "error"));
      this._parser.on("close", this._handleClose.bind(this));
      this._parser.on("metadata", this._metadata.bind(this));
      this._parser.on("gamma", this._gamma.bind(this));
      this._parser.on(
        "parsed",
        function(data3) {
          this.data = data3;
          this.emit("parsed", data3);
        }.bind(this)
      );
      this._packer = new Packer(options);
      this._packer.on("data", this.emit.bind(this, "data"));
      this._packer.on("end", this.emit.bind(this, "end"));
      this._parser.on("close", this._handleClose.bind(this));
      this._packer.on("error", this.emit.bind(this, "error"));
    };
    util.inherits(PNG, Stream);
    PNG.sync = PNGSync;
    PNG.prototype.pack = function() {
      if (!this.data || !this.data.length) {
        this.emit("error", "No data provided");
        return this;
      }
      process.nextTick(
        function() {
          this._packer.pack(this.data, this.width, this.height, this.gamma);
        }.bind(this)
      );
      return this;
    };
    PNG.prototype.parse = function(data3, callback) {
      if (callback) {
        let onParsed, onError;
        onParsed = function(parsedData) {
          this.removeListener("error", onError);
          this.data = parsedData;
          callback(null, this);
        }.bind(this);
        onError = function(err) {
          this.removeListener("parsed", onParsed);
          callback(err, null);
        }.bind(this);
        this.once("parsed", onParsed);
        this.once("error", onError);
      }
      this.end(data3);
      return this;
    };
    PNG.prototype.write = function(data3) {
      this._parser.write(data3);
      return true;
    };
    PNG.prototype.end = function(data3) {
      this._parser.end(data3);
    };
    PNG.prototype._metadata = function(metadata) {
      this.width = metadata.width;
      this.height = metadata.height;
      this.emit("metadata", metadata);
    };
    PNG.prototype._gamma = function(gamma) {
      this.gamma = gamma;
    };
    PNG.prototype._handleClose = function() {
      if (!this._parser.writable && !this._packer.readable) {
        this.emit("close");
      }
    };
    PNG.bitblt = function(src, dst, srcX, srcY, width, height, deltaX, deltaY) {
      srcX |= 0;
      srcY |= 0;
      width |= 0;
      height |= 0;
      deltaX |= 0;
      deltaY |= 0;
      if (srcX > src.width || srcY > src.height || srcX + width > src.width || srcY + height > src.height) {
        throw new Error("bitblt reading outside image");
      }
      if (deltaX > dst.width || deltaY > dst.height || deltaX + width > dst.width || deltaY + height > dst.height) {
        throw new Error("bitblt writing outside image");
      }
      for (let y = 0; y < height; y++) {
        src.data.copy(
          dst.data,
          (deltaY + y) * dst.width + deltaX << 2,
          (srcY + y) * src.width + srcX << 2,
          (srcY + y) * src.width + srcX + width << 2
        );
      }
    };
    PNG.prototype.bitblt = function(dst, srcX, srcY, width, height, deltaX, deltaY) {
      PNG.bitblt(this, dst, srcX, srcY, width, height, deltaX, deltaY);
      return this;
    };
    PNG.adjustGamma = function(src) {
      if (src.gamma) {
        for (let y = 0; y < src.height; y++) {
          for (let x = 0; x < src.width; x++) {
            let idx = src.width * y + x << 2;
            for (let i = 0; i < 3; i++) {
              let sample2 = src.data[idx + i] / 255;
              sample2 = Math.pow(sample2, 1 / 2.2 / src.gamma);
              src.data[idx + i] = Math.round(sample2 * 255);
            }
          }
        }
        src.gamma = 0;
      }
    };
    PNG.prototype.adjustGamma = function() {
      PNG.adjustGamma(this);
    };
  }
});

// node_modules/qrcode/lib/renderer/utils.js
var require_utils2 = __commonJS({
  "node_modules/qrcode/lib/renderer/utils.js"(exports) {
    function hex2rgba(hex) {
      if (typeof hex === "number") {
        hex = hex.toString();
      }
      if (typeof hex !== "string") {
        throw new Error("Color should be defined as hex string");
      }
      let hexCode = hex.slice().replace("#", "").split("");
      if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
        throw new Error("Invalid hex color: " + hex);
      }
      if (hexCode.length === 3 || hexCode.length === 4) {
        hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }));
      }
      if (hexCode.length === 6) hexCode.push("F", "F");
      const hexValue = parseInt(hexCode.join(""), 16);
      return {
        r: hexValue >> 24 & 255,
        g: hexValue >> 16 & 255,
        b: hexValue >> 8 & 255,
        a: hexValue & 255,
        hex: "#" + hexCode.slice(0, 6).join("")
      };
    }
    exports.getOptions = function getOptions(options) {
      if (!options) options = {};
      if (!options.color) options.color = {};
      const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
      const width = options.width && options.width >= 21 ? options.width : void 0;
      const scale = options.scale || 4;
      return {
        width,
        scale: width ? 4 : scale,
        margin,
        color: {
          dark: hex2rgba(options.color.dark || "#000000ff"),
          light: hex2rgba(options.color.light || "#ffffffff")
        },
        type: options.type,
        rendererOpts: options.rendererOpts || {}
      };
    };
    exports.getScale = function getScale(qrSize, opts) {
      return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
    };
    exports.getImageWidth = function getImageWidth(qrSize, opts) {
      const scale = exports.getScale(qrSize, opts);
      return Math.floor((qrSize + opts.margin * 2) * scale);
    };
    exports.qrToImageData = function qrToImageData(imgData, qr, opts) {
      const size = qr.modules.size;
      const data3 = qr.modules.data;
      const scale = exports.getScale(size, opts);
      const symbolSize = Math.floor((size + opts.margin * 2) * scale);
      const scaledMargin = opts.margin * scale;
      const palette = [opts.color.light, opts.color.dark];
      for (let i = 0; i < symbolSize; i++) {
        for (let j = 0; j < symbolSize; j++) {
          let posDst = (i * symbolSize + j) * 4;
          let pxColor = opts.color.light;
          if (i >= scaledMargin && j >= scaledMargin && i < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
            const iSrc = Math.floor((i - scaledMargin) / scale);
            const jSrc = Math.floor((j - scaledMargin) / scale);
            pxColor = palette[data3[iSrc * size + jSrc] ? 1 : 0];
          }
          imgData[posDst++] = pxColor.r;
          imgData[posDst++] = pxColor.g;
          imgData[posDst++] = pxColor.b;
          imgData[posDst] = pxColor.a;
        }
      }
    };
  }
});

// node_modules/qrcode/lib/renderer/png.js
var require_png2 = __commonJS({
  "node_modules/qrcode/lib/renderer/png.js"(exports) {
    var fs = __require("fs");
    var PNG = require_png().PNG;
    var Utils = require_utils2();
    exports.render = function render(qrData, options) {
      const opts = Utils.getOptions(options);
      const pngOpts = opts.rendererOpts;
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      pngOpts.width = size;
      pngOpts.height = size;
      const pngImage = new PNG(pngOpts);
      Utils.qrToImageData(pngImage.data, qrData, opts);
      return pngImage;
    };
    exports.renderToDataURL = function renderToDataURL(qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      exports.renderToBuffer(qrData, options, function(err, output) {
        if (err) cb(err);
        let url = "data:image/png;base64,";
        url += output.toString("base64");
        cb(null, url);
      });
    };
    exports.renderToBuffer = function renderToBuffer(qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const png = exports.render(qrData, options);
      const buffer2 = [];
      png.on("error", cb);
      png.on("data", function(data3) {
        buffer2.push(data3);
      });
      png.on("end", function() {
        cb(null, Buffer.concat(buffer2));
      });
      png.pack();
    };
    exports.renderToFile = function renderToFile(path, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      let called = false;
      const done = (...args) => {
        if (called) return;
        called = true;
        cb.apply(null, args);
      };
      const stream2 = fs.createWriteStream(path);
      stream2.on("error", done);
      stream2.on("close", done);
      exports.renderToFileStream(stream2, qrData, options);
    };
    exports.renderToFileStream = function renderToFileStream(stream2, qrData, options) {
      const png = exports.render(qrData, options);
      png.pack().pipe(stream2);
    };
  }
});

// node_modules/qrcode/lib/renderer/utf8.js
var require_utf8 = __commonJS({
  "node_modules/qrcode/lib/renderer/utf8.js"(exports) {
    var Utils = require_utils2();
    var BLOCK_CHAR = {
      WW: " ",
      WB: "\u2584",
      BB: "\u2588",
      BW: "\u2580"
    };
    var INVERTED_BLOCK_CHAR = {
      BB: " ",
      BW: "\u2584",
      WW: "\u2588",
      WB: "\u2580"
    };
    function getBlockChar(top, bottom, blocks) {
      if (top && bottom) return blocks.BB;
      if (top && !bottom) return blocks.BW;
      if (!top && bottom) return blocks.WB;
      return blocks.WW;
    }
    exports.render = function(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      let blocks = BLOCK_CHAR;
      if (opts.color.dark.hex === "#ffffff" || opts.color.light.hex === "#000000") {
        blocks = INVERTED_BLOCK_CHAR;
      }
      const size = qrData.modules.size;
      const data3 = qrData.modules.data;
      let output = "";
      let hMargin = Array(size + opts.margin * 2 + 1).join(blocks.WW);
      hMargin = Array(opts.margin / 2 + 1).join(hMargin + "\n");
      const vMargin = Array(opts.margin + 1).join(blocks.WW);
      output += hMargin;
      for (let i = 0; i < size; i += 2) {
        output += vMargin;
        for (let j = 0; j < size; j++) {
          const topModule = data3[i * size + j];
          const bottomModule = data3[(i + 1) * size + j];
          output += getBlockChar(topModule, bottomModule, blocks);
        }
        output += vMargin + "\n";
      }
      output += hMargin.slice(0, -1);
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
    exports.renderToFile = function renderToFile(path, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const fs = __require("fs");
      const utf8 = exports.render(qrData, options);
      fs.writeFile(path, utf8, cb);
    };
  }
});

// node_modules/qrcode/lib/renderer/terminal/terminal.js
var require_terminal = __commonJS({
  "node_modules/qrcode/lib/renderer/terminal/terminal.js"(exports) {
    exports.render = function(qrData, options, cb) {
      const size = qrData.modules.size;
      const data3 = qrData.modules.data;
      const black = "\x1B[40m  \x1B[0m";
      const white = "\x1B[47m  \x1B[0m";
      let output = "";
      const hMargin = Array(size + 3).join(white);
      const vMargin = Array(2).join(white);
      output += hMargin + "\n";
      for (let i = 0; i < size; ++i) {
        output += white;
        for (let j = 0; j < size; j++) {
          output += data3[i * size + j] ? black : white;
        }
        output += vMargin + "\n";
      }
      output += hMargin + "\n";
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
  }
});

// node_modules/qrcode/lib/renderer/terminal/terminal-small.js
var require_terminal_small = __commonJS({
  "node_modules/qrcode/lib/renderer/terminal/terminal-small.js"(exports) {
    var backgroundWhite = "\x1B[47m";
    var backgroundBlack = "\x1B[40m";
    var foregroundWhite = "\x1B[37m";
    var foregroundBlack = "\x1B[30m";
    var reset2 = "\x1B[0m";
    var lineSetupNormal = backgroundWhite + foregroundBlack;
    var lineSetupInverse = backgroundBlack + foregroundWhite;
    var createPalette = function(lineSetup, foregroundWhite2, foregroundBlack2) {
      return {
        // 1 ... white, 2 ... black, 0 ... transparent (default)
        "00": reset2 + " " + lineSetup,
        "01": reset2 + foregroundWhite2 + "\u2584" + lineSetup,
        "02": reset2 + foregroundBlack2 + "\u2584" + lineSetup,
        10: reset2 + foregroundWhite2 + "\u2580" + lineSetup,
        11: " ",
        12: "\u2584",
        20: reset2 + foregroundBlack2 + "\u2580" + lineSetup,
        21: "\u2580",
        22: "\u2588"
      };
    };
    var mkCodePixel = function(modules, size, x, y) {
      const sizePlus = size + 1;
      if (x >= sizePlus || y >= sizePlus || y < -1 || x < -1) return "0";
      if (x >= size || y >= size || y < 0 || x < 0) return "1";
      const idx = y * size + x;
      return modules[idx] ? "2" : "1";
    };
    var mkCode = function(modules, size, x, y) {
      return mkCodePixel(modules, size, x, y) + mkCodePixel(modules, size, x, y + 1);
    };
    exports.render = function(qrData, options, cb) {
      const size = qrData.modules.size;
      const data3 = qrData.modules.data;
      const inverse = !!(options && options.inverse);
      const lineSetup = options && options.inverse ? lineSetupInverse : lineSetupNormal;
      const white = inverse ? foregroundBlack : foregroundWhite;
      const black = inverse ? foregroundWhite : foregroundBlack;
      const palette = createPalette(lineSetup, white, black);
      const newLine = reset2 + "\n" + lineSetup;
      let output = lineSetup;
      for (let y = -1; y < size + 1; y += 2) {
        for (let x = -1; x < size; x++) {
          output += palette[mkCode(data3, size, x, y)];
        }
        output += palette[mkCode(data3, size, size, y)] + newLine;
      }
      output += reset2;
      if (typeof cb === "function") {
        cb(null, output);
      }
      return output;
    };
  }
});

// node_modules/qrcode/lib/renderer/terminal.js
var require_terminal2 = __commonJS({
  "node_modules/qrcode/lib/renderer/terminal.js"(exports) {
    var big = require_terminal();
    var small = require_terminal_small();
    exports.render = function(qrData, options, cb) {
      if (options && options.small) {
        return small.render(qrData, options, cb);
      }
      return big.render(qrData, options, cb);
    };
  }
});

// node_modules/qrcode/lib/renderer/svg-tag.js
var require_svg_tag = __commonJS({
  "node_modules/qrcode/lib/renderer/svg-tag.js"(exports) {
    var Utils = require_utils2();
    function getColorAttrib(color, attrib) {
      const alpha = color.a / 255;
      const str = attrib + '="' + color.hex + '"';
      return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
    }
    function svgCmd(cmd, x, y) {
      let str = cmd + x;
      if (typeof y !== "undefined") str += " " + y;
      return str;
    }
    function qrToPath(data3, size, margin) {
      let path = "";
      let moveBy = 0;
      let newRow = false;
      let lineLength = 0;
      for (let i = 0; i < data3.length; i++) {
        const col = Math.floor(i % size);
        const row = Math.floor(i / size);
        if (!col && !newRow) newRow = true;
        if (data3[i]) {
          lineLength++;
          if (!(i > 0 && col > 0 && data3[i - 1])) {
            path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
            moveBy = 0;
            newRow = false;
          }
          if (!(col + 1 < size && data3[i + 1])) {
            path += svgCmd("h", lineLength);
            lineLength = 0;
          }
        } else {
          moveBy++;
        }
      }
      return path;
    }
    exports.render = function render(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      const size = qrData.modules.size;
      const data3 = qrData.modules.data;
      const qrcodesize = size + opts.margin * 2;
      const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
      const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data3, size, opts.margin) + '"/>';
      const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
      const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
      const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + "</svg>\n";
      if (typeof cb === "function") {
        cb(null, svgTag);
      }
      return svgTag;
    };
  }
});

// node_modules/qrcode/lib/renderer/svg.js
var require_svg = __commonJS({
  "node_modules/qrcode/lib/renderer/svg.js"(exports) {
    var svgTagRenderer = require_svg_tag();
    exports.render = svgTagRenderer.render;
    exports.renderToFile = function renderToFile(path, qrData, options, cb) {
      if (typeof cb === "undefined") {
        cb = options;
        options = void 0;
      }
      const fs = __require("fs");
      const svgTag = exports.render(qrData, options);
      const xmlStr = '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' + svgTag;
      fs.writeFile(path, xmlStr, cb);
    };
  }
});

// node_modules/qrcode/lib/renderer/canvas.js
var require_canvas = __commonJS({
  "node_modules/qrcode/lib/renderer/canvas.js"(exports) {
    var Utils = require_utils2();
    function clearCanvas(ctx, canvas, size) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!canvas.style) canvas.style = {};
      canvas.height = size;
      canvas.width = size;
      canvas.style.height = size + "px";
      canvas.style.width = size + "px";
    }
    function getCanvasElement() {
      try {
        return document.createElement("canvas");
      } catch (e2) {
        throw new Error("You need to specify a canvas element");
      }
    }
    exports.render = function render(qrData, canvas, options) {
      let opts = options;
      let canvasEl = canvas;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!canvas) {
        canvasEl = getCanvasElement();
      }
      opts = Utils.getOptions(opts);
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      const ctx = canvasEl.getContext("2d");
      const image = ctx.createImageData(size, size);
      Utils.qrToImageData(image.data, qrData, opts);
      clearCanvas(ctx, canvasEl, size);
      ctx.putImageData(image, 0, 0);
      return canvasEl;
    };
    exports.renderToDataURL = function renderToDataURL(qrData, canvas, options) {
      let opts = options;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!opts) opts = {};
      const canvasEl = exports.render(qrData, canvas, opts);
      const type = opts.type || "image/png";
      const rendererOpts = opts.rendererOpts || {};
      return canvasEl.toDataURL(type, rendererOpts.quality);
    };
  }
});

// node_modules/qrcode/lib/browser.js
var require_browser = __commonJS({
  "node_modules/qrcode/lib/browser.js"(exports) {
    var canPromise = require_can_promise();
    var QRCode = require_qrcode();
    var CanvasRenderer = require_canvas();
    var SvgRenderer = require_svg_tag();
    function renderCanvas(renderFunc, canvas, text, opts, cb) {
      const args = [].slice.call(arguments, 1);
      const argsNum = args.length;
      const isLastArgCb = typeof args[argsNum - 1] === "function";
      if (!isLastArgCb && !canPromise()) {
        throw new Error("Callback required as last argument");
      }
      if (isLastArgCb) {
        if (argsNum < 2) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 2) {
          cb = text;
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 3) {
          if (canvas.getContext && typeof cb === "undefined") {
            cb = opts;
            opts = void 0;
          } else {
            cb = opts;
            opts = text;
            text = canvas;
            canvas = void 0;
          }
        }
      } else {
        if (argsNum < 1) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 1) {
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 2 && !canvas.getContext) {
          opts = text;
          text = canvas;
          canvas = void 0;
        }
        return new Promise(function(resolve3, reject) {
          try {
            const data3 = QRCode.create(text, opts);
            resolve3(renderFunc(data3, canvas, opts));
          } catch (e2) {
            reject(e2);
          }
        });
      }
      try {
        const data3 = QRCode.create(text, opts);
        cb(null, renderFunc(data3, canvas, opts));
      } catch (e2) {
        cb(e2);
      }
    }
    exports.create = QRCode.create;
    exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
    exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
    exports.toString = renderCanvas.bind(null, function(data3, _, opts) {
      return SvgRenderer.render(data3, opts);
    });
  }
});

// node_modules/qrcode/lib/server.js
var require_server = __commonJS({
  "node_modules/qrcode/lib/server.js"(exports) {
    var canPromise = require_can_promise();
    var QRCode = require_qrcode();
    var PngRenderer = require_png2();
    var Utf8Renderer = require_utf8();
    var TerminalRenderer = require_terminal2();
    var SvgRenderer = require_svg();
    function checkParams(text, opts, cb) {
      if (typeof text === "undefined") {
        throw new Error("String required as first argument");
      }
      if (typeof cb === "undefined") {
        cb = opts;
        opts = {};
      }
      if (typeof cb !== "function") {
        if (!canPromise()) {
          throw new Error("Callback required as last argument");
        } else {
          opts = cb || {};
          cb = null;
        }
      }
      return {
        opts,
        cb
      };
    }
    function getTypeFromFilename(path) {
      return path.slice((path.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
    }
    function getRendererFromType(type) {
      switch (type) {
        case "svg":
          return SvgRenderer;
        case "txt":
        case "utf8":
          return Utf8Renderer;
        case "png":
        case "image/png":
        default:
          return PngRenderer;
      }
    }
    function getStringRendererFromType(type) {
      switch (type) {
        case "svg":
          return SvgRenderer;
        case "terminal":
          return TerminalRenderer;
        case "utf8":
        default:
          return Utf8Renderer;
      }
    }
    function render(renderFunc, text, params) {
      if (!params.cb) {
        return new Promise(function(resolve3, reject) {
          try {
            const data3 = QRCode.create(text, params.opts);
            return renderFunc(data3, params.opts, function(err, data4) {
              return err ? reject(err) : resolve3(data4);
            });
          } catch (e2) {
            reject(e2);
          }
        });
      }
      try {
        const data3 = QRCode.create(text, params.opts);
        return renderFunc(data3, params.opts, params.cb);
      } catch (e2) {
        params.cb(e2);
      }
    }
    exports.create = QRCode.create;
    exports.toCanvas = require_browser().toCanvas;
    exports.toString = function toString(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const type = params.opts ? params.opts.type : void 0;
      const renderer = getStringRendererFromType(type);
      return render(renderer.render, text, params);
    };
    exports.toDataURL = function toDataURL(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const renderer = getRendererFromType(params.opts.type);
      return render(renderer.renderToDataURL, text, params);
    };
    exports.toBuffer = function toBuffer(text, opts, cb) {
      const params = checkParams(text, opts, cb);
      const renderer = getRendererFromType(params.opts.type);
      return render(renderer.renderToBuffer, text, params);
    };
    exports.toFile = function toFile(path, text, opts, cb) {
      if (typeof path !== "string" || !(typeof text === "string" || typeof text === "object")) {
        throw new Error("Invalid argument");
      }
      if (arguments.length < 3 && !canPromise()) {
        throw new Error("Too few arguments provided");
      }
      const params = checkParams(text, opts, cb);
      const type = params.opts.type || getTypeFromFilename(path);
      const renderer = getRendererFromType(type);
      const renderToFile = renderer.renderToFile.bind(null, path);
      return render(renderToFile, text, params);
    };
    exports.toFileStream = function toFileStream(stream2, text, opts) {
      if (arguments.length < 2) {
        throw new Error("Too few arguments provided");
      }
      const params = checkParams(text, opts, stream2.emit.bind(stream2, "error"));
      const renderer = getRendererFromType("png");
      const renderToFileStream = renderer.renderToFileStream.bind(null, stream2);
      render(renderToFileStream, text, params);
    };
  }
});

// node_modules/qrcode/lib/index.js
var require_lib = __commonJS({
  "node_modules/qrcode/lib/index.js"(exports, module) {
    module.exports = require_server();
  }
});

// src/host/audio/pipeline.ts
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// src/host/bili.ts
import { createHash } from "node:crypto";

// src/host/logger.ts
var silentLogger = {
  debug: () => void 0,
  info: () => void 0,
  warn: () => void 0,
  error: () => void 0
};
var MAX_LOG_LINES = 400;
var MAX_DATA_CHARS = 900;
function format(message, data3) {
  if (data3 === void 0) return message;
  let text;
  try {
    text = typeof data3 === "string" ? data3 : JSON.stringify(data3);
  } catch {
    text = String(data3);
  }
  if (text === void 0) text = String(data3);
  if (text.length > MAX_DATA_CHARS) {
    text = `${text.slice(0, MAX_DATA_CHARS)}\u2026(\u5171 ${text.length} \u5B57\u7B26)`;
  }
  return `${message} ${text}`;
}
var MemoryLogger = class {
  constructor(prefix = "music-player") {
    this.prefix = prefix;
  }
  prefix;
  lines = [];
  level = "info";
  setLevel(level) {
    this.level = level;
  }
  getLevel() {
    return this.level;
  }
  push(level, text) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(11, 19);
    this.lines.push(`${stamp} ${level.toUpperCase()} ${text}`);
    if (this.lines.length > MAX_LOG_LINES) this.lines.splice(0, this.lines.length - MAX_LOG_LINES);
  }
  debug(message, data3) {
    if (this.level !== "debug") return;
    const text = format(message, data3);
    this.push("debug", text);
    console.log(`[${this.prefix}] ${text}`);
  }
  info(message, data3) {
    if (this.level === "off") return;
    const text = format(message, data3);
    this.push("info", text);
    console.log(`[${this.prefix}] ${text}`);
  }
  warn(message, data3) {
    if (this.level === "off") return;
    const text = format(message, data3);
    this.push("warn", text);
    console.warn(`[${this.prefix}] ${text}`);
  }
  error(message, data3) {
    if (this.level === "off") return;
    const text = format(message, data3);
    this.push("error", text);
    console.error(`[${this.prefix}] ${text}`);
  }
  /** Recent lines, oldest first. */
  recent(limit = 200) {
    return this.lines.slice(-Math.max(1, limit));
  }
};

// src/host/bili.ts
var BilibiliError = class extends Error {
  kind;
  code;
  httpStatus;
  detail;
  constructor(kind, message, options = {}) {
    super(message, options.cause === void 0 ? void 0 : { cause: options.cause });
    this.name = "BilibiliError";
    this.kind = kind;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.detail = options.detail;
  }
  get userMessage() {
    switch (this.kind) {
      case "aborted":
        return "\u8BF7\u6C42\u5DF2\u53D6\u6D88";
      case "network":
        return "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u4EE3\u7406\u8BBE\u7F6E";
      case "http":
        return `B \u7AD9\u8FD4\u56DE\u5F02\u5E38\u72B6\u6001\uFF08HTTP ${this.httpStatus ?? "\u672A\u77E5"}\uFF09`;
      case "parse":
        return "B \u7AD9\u8FD4\u56DE\u7684\u6570\u636E\u65E0\u6CD5\u89E3\u6790\uFF0C\u63A5\u53E3\u53EF\u80FD\u5DF2\u53D8\u66F4";
      case "not-logged-in":
        return "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801\u767B\u5F55";
      case "risk":
        return "B \u7AD9\u89E6\u53D1\u4E86\u98CE\u63A7\u6821\u9A8C\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5";
      case "vip-required":
        return "\u8BE5\u66F2\u76EE\u9700\u8981\u5927\u4F1A\u5458";
      case "unavailable":
        return "\u8BE5\u89C6\u9891\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664";
      case "no-csrf":
        return "\u767B\u5F55\u51ED\u636E\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5\u6267\u884C\u5199\u64CD\u4F5C\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55";
      case "api":
        return this.message === "" ? `B \u7AD9\u63A5\u53E3\u8FD4\u56DE\u9519\u8BEF\uFF08${this.code ?? "\u672A\u77E5"}\uFF09` : this.message;
      default:
        return this.message;
    }
  }
};
function toBilibiliError(error, fallbackMessage = "\u672A\u77E5\u9519\u8BEF") {
  if (error instanceof BilibiliError) return error;
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return new BilibiliError("aborted", "\u8BF7\u6C42\u5DF2\u53D6\u6D88", { cause: error });
    }
    return new BilibiliError("network", `${fallbackMessage}\uFF1A${error.message}`, { cause: error });
  }
  return new BilibiliError("network", `${fallbackMessage}\uFF1A${String(error)}`);
}
var COOKIE_NAME = "[!#$%&'*+\\-.^_`|~0-9A-Za-z]+";
var MERGED_SET_COOKIE_SPLITTER = new RegExp(`,\\s*(?=${COOKIE_NAME}=)`, "g");
function splitMergedSetCookie(merged) {
  return merged.split(MERGED_SET_COOKIE_SPLITTER).map((part) => part.trim()).filter(Boolean);
}
function readSetCookieHeaders(headers) {
  const withGetSetCookie = headers;
  if (typeof withGetSetCookie.getSetCookie === "function") {
    const values = withGetSetCookie.getSetCookie();
    if (values.length > 0) return values;
  }
  const merged = headers.get("set-cookie");
  return merged === null ? [] : splitMergedSetCookie(merged);
}
function parseSetCookieLine(line) {
  const pair = line.split(";", 1)[0]?.trim() ?? "";
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name2 = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  return name2 === "" ? null : { name: name2, value };
}
function parseSetCookieHeaders(lines) {
  const jar = {};
  for (const line of lines) {
    const pair = parseSetCookieLine(line);
    if (pair) jar[pair.name] = pair.value;
  }
  return jar;
}
function parseCookieHeader(header2) {
  const jar = {};
  for (const part of header2.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name2 = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name2 !== "") jar[name2] = value;
  }
  return jar;
}
function serializeCookie(jar) {
  if (!jar) return "";
  return Object.entries(jar).filter(([name2, value]) => name2.trim() !== "" && value !== void 0 && value !== null).map(([name2, value]) => `${name2.trim()}=${String(value).trim().replace(/[\r\n]/g, "")}`).join("; ");
}
function getCsrfToken(jar) {
  const token = jar?.bili_jct;
  return token === void 0 || token === "" ? null : token;
}
function getUserId(jar) {
  const raw = jar?.DedeUserID;
  if (raw === void 0 || raw === "") return null;
  const mid = Number(raw);
  return Number.isFinite(mid) ? mid : null;
}
function isLoggedIn(jar) {
  if (!jar) return false;
  return getCsrfToken(jar) !== null && getUserId(jar) !== null;
}
function mergeCookies(...jars) {
  const merged = {};
  for (const jar of jars) {
    if (!jar) continue;
    for (const [name2, value] of Object.entries(jar)) merged[name2] = value;
  }
  return merged;
}
var XOR_CODE = 23442827791579n;
var MASK_CODE = 2251799813685247n;
var BASE = 58n;
var MAGIC_STR = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
var BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;
function isBvid(value) {
  return BVID_PATTERN.test(value);
}
function bv2av(bvid) {
  if (!isBvid(bvid)) throw new Error(`\u4E0D\u662F\u5408\u6CD5\u7684 BV \u53F7\uFF1A${bvid}`);
  const chars = Array.from(bvid);
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  chars.splice(0, 3);
  const tmp = chars.reduce((pre, char) => {
    const index = MAGIC_STR.indexOf(char);
    if (index < 0) throw new Error(`BV \u53F7\u542B\u975E\u6CD5\u5B57\u7B26\uFF1A${char}`);
    return pre * BASE + BigInt(index);
  }, 0n);
  return Number(tmp & MASK_CODE ^ XOR_CODE);
}
var AUDIO_QUALITY = {
  LOW: 30216,
  MEDIUM: 30232,
  HIGH: 30280
};
function stripHtmlTags(text) {
  if (text === void 0) return "";
  return text.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").trim();
}
function parseDurationText(text) {
  if (text === void 0 || text.trim() === "") return null;
  const parts = text.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}
function looksSoftBlocked(data3) {
  const empty = data3.result === null || data3.result === void 0 || data3.result.length === 0;
  return empty && data3.numPages === void 0 && data3.numResults === void 0;
}
function pickAudioStream(data3, quality) {
  const dashDuration = data3.dash?.duration;
  const durationFromTimelength = typeof data3.timelength === "number" && data3.timelength > 0 ? data3.timelength / 1e3 : null;
  const dashSeconds = typeof dashDuration === "number" && dashDuration > 0 ? dashDuration : durationFromTimelength;
  const tracks = data3.dash?.audio;
  if (Array.isArray(tracks) && tracks.length > 0) {
    const sorted = [...tracks].sort((left, right) => right.id - left.id);
    const picked = sorted.find((track) => track.id === quality) ?? sorted[0];
    if (picked && typeof picked.baseUrl === "string" && picked.baseUrl !== "") {
      return {
        url: picked.baseUrl,
        backupUrls: picked.backupUrl ?? [],
        quality: picked.id,
        codecs: picked.codecs ?? null,
        mimeType: picked.mimeType ?? null,
        container: "dash",
        durationSeconds: dashSeconds
      };
    }
  }
  const durl = data3.durl;
  if (Array.isArray(durl) && durl.length > 0 && typeof durl[0]?.url === "string") {
    return {
      url: durl[0].url,
      backupUrls: durl[0].backup_url ?? [],
      quality: data3.quality ?? 0,
      codecs: null,
      mimeType: null,
      container: "durl",
      durationSeconds: durationFromTimelength
    };
  }
  throw new BilibiliError("unavailable", "\u8BE5\u89C6\u9891\u6CA1\u6709\u8FD4\u56DE\u53EF\u7528\u7684\u97F3\u9891\u6D41\uFF0C\u53EF\u80FD\u662F\u4ED8\u8D39/\u4F1A\u5458\u4E13\u4EAB\u6216\u5DF2\u4E0B\u67B6");
}
var BILIBILI_BASE_URL = "https://api.bilibili.com";
var BILIBILI_REFERER = "https://www.bilibili.com/";
var DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
var DEFAULT_MIN_INTERVAL_MS = 350;
var DEFAULT_TIMEOUT_MS = 2e4;
var RETRY_BACKOFF_MS = 800;
function mapApiCode(code, message, detail) {
  const text = message === "" ? `B \u7AD9\u63A5\u53E3\u8FD4\u56DE code=${code}` : message;
  switch (code) {
    case -101:
      return new BilibiliError("not-logged-in", text, { code, detail });
    case -412:
      return new BilibiliError("risk", text, { code, detail });
    case -10403:
      return new BilibiliError("vip-required", text, { code, detail });
    case -404:
    case -403:
    case -10400:
    case -10401:
      return new BilibiliError("unavailable", text, { code, detail });
    default:
      return new BilibiliError("api", text, { code, detail });
  }
}
function defaultSleep(ms) {
  return new Promise((resolve3) => setTimeout(resolve3, ms));
}
function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09`));
  }, timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
    didTimeOut: () => timedOut
  };
}
function buildQuery(params) {
  if (params === void 0) return "";
  if (typeof params === "string") return params;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== void 0) search.append(key, String(value));
  }
  return search.toString();
}
var BilibiliClient = class {
  constructor(options) {
    this.options = options;
    this.logger = options.logger ?? silentLogger;
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.sleep = options.sleep ?? defaultSleep;
  }
  options;
  logger;
  fetchImpl;
  userAgent;
  sleep;
  lastRequestAt = 0;
  queue = Promise.resolve();
  cookies() {
    return this.options.readCookies();
  }
  minIntervalMs() {
    return this.options.minIntervalMs?.() ?? DEFAULT_MIN_INTERVAL_MS;
  }
  schedule(task) {
    const run = async () => {
      const wait = this.lastRequestAt + this.minIntervalMs() - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = Date.now();
      return task();
    };
    const next = this.queue.then(run, run);
    this.queue = next.then(() => void 0, () => void 0);
    return next;
  }
  async fetchRaw(options) {
    const headers = {
      "User-Agent": options.userAgent ?? this.userAgent,
      Referer: BILIBILI_REFERER,
      Origin: "https://www.bilibili.com",
      ...options.headers
    };
    if (options.skipCookie !== true) {
      const cookie = serializeCookie(this.cookies());
      if (cookie !== "") headers.Cookie = cookie;
    }
    const timeoutMs = options.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    return this.schedule(async () => {
      const guard = withTimeout(options.signal, timeoutMs);
      try {
        return await this.fetchImpl(options.url, {
          method: options.method ?? "GET",
          headers,
          ...options.body === void 0 ? {} : { body: options.body },
          signal: guard.signal,
          redirect: "follow"
        });
      } catch (error) {
        if (guard.didTimeOut()) {
          throw new BilibiliError("network", `\u8BF7\u6C42\u8D85\u65F6\uFF08${timeoutMs}ms\uFF09\uFF1A${options.url}`, { cause: error });
        }
        throw toBilibiliError(error, `\u8BF7\u6C42\u5931\u8D25\uFF1A${options.url}`);
      } finally {
        guard.done();
      }
    });
  }
  async requestEnvelope(options) {
    const query = buildQuery(options.params);
    const base = options.fullUrl ?? `${BILIBILI_BASE_URL}${options.endpoint ?? ""}`;
    const url = query === "" ? base : `${base}${base.includes("?") ? "&" : "?"}${query}`;
    const retries = options.retries ?? this.options.getRetries ?? 1;
    const allowCodes = new Set(options.allowCodes ?? []);
    let attempt = 0;
    for (; ; ) {
      attempt++;
      this.logger.debug(`\u2192 ${options.method} ${url}`, attempt > 1 ? { attempt } : void 0);
      try {
        const response = await this.fetchRaw({
          url,
          method: options.method,
          headers: {
            ...options.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
            ...options.headers
          },
          ...options.body === void 0 ? {} : { body: options.body },
          ...options.signal === void 0 ? {} : { signal: options.signal },
          ...options.timeoutMs === void 0 ? {} : { timeoutMs: options.timeoutMs },
          ...options.skipCookie === void 0 ? {} : { skipCookie: options.skipCookie }
        });
        if (!response.ok) {
          const kind = response.status === 412 ? "risk" : "http";
          throw new BilibiliError(kind, `B \u7AD9\u8FD4\u56DE HTTP ${response.status} ${response.statusText}`, {
            httpStatus: response.status
          });
        }
        let envelope;
        try {
          envelope = await response.json();
        } catch (error) {
          throw new BilibiliError("parse", `\u54CD\u5E94\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${url}`, { cause: error });
        }
        if (envelope.code !== 0 && !allowCodes.has(envelope.code)) {
          throw mapApiCode(envelope.code, envelope.message ?? envelope.msg ?? "", envelope.data);
        }
        return envelope.data;
      } catch (error) {
        const normalized = error instanceof BilibiliError ? error : toBilibiliError(error);
        const retryable = options.method === "GET" && attempt <= retries && (normalized.kind === "risk" || normalized.kind === "network" || normalized.kind === "http" && (normalized.httpStatus ?? 0) >= 500);
        if (!retryable) throw normalized;
        this.logger.warn(`\u8BF7\u6C42\u5931\u8D25\u5C06\u91CD\u8BD5\uFF08${attempt}/${retries + 1}\uFF09\uFF1A${normalized.message}`);
        await this.sleep(RETRY_BACKOFF_MS);
      }
    }
  }
  async get(options) {
    return this.requestEnvelope({ ...options, method: "GET" });
  }
  async postWithCsrf(options) {
    const csrf = getCsrfToken(this.cookies());
    if (csrf === null) throw new BilibiliError("no-csrf", "cookie \u91CC\u6CA1\u6709 bili_jct\uFF0C\u65E0\u6CD5\u6267\u884C\u5199\u64CD\u4F5C");
    const body = new URLSearchParams({ ...options.payload, csrf }).toString();
    return this.requestEnvelope({ ...options, method: "POST", body, retries: 0 });
  }
};
var MIXIN_KEY_ENC_TAB = [
  46,
  47,
  18,
  2,
  53,
  8,
  23,
  32,
  15,
  50,
  10,
  31,
  58,
  3,
  45,
  35,
  27,
  43,
  5,
  49,
  33,
  9,
  42,
  19,
  29,
  28,
  14,
  39,
  12,
  38,
  41,
  13,
  37,
  48,
  7,
  16,
  24,
  55,
  40,
  61,
  26,
  17,
  0,
  1,
  60,
  51,
  30,
  4,
  22,
  25,
  54,
  21,
  56,
  59,
  6,
  63,
  57,
  62,
  11,
  36,
  20,
  34,
  44,
  52
];
function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map((index) => orig[index] ?? "").join("").slice(0, 32);
}
function wbiKeyFromUrl(url) {
  const name2 = url.slice(url.lastIndexOf("/") + 1);
  const dot = name2.lastIndexOf(".");
  return dot > 0 ? name2.slice(0, dot) : name2;
}
function encWbi(params, imgKey, subKey, nowMs = Date.now()) {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.round(nowMs / 1e3);
  const all = {};
  for (const [key, value] of Object.entries(params)) all[key] = String(value);
  all.wts = String(wts);
  const query = Object.keys(all).sort().map((key) => {
    const value = (all[key] ?? "").replace(/[!'()*]/g, "");
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }).join("&");
  const wRid = createHash("md5").update(query + mixinKey).digest("hex");
  return `${query}&w_rid=${wRid}`;
}
function isSameDay(a, b) {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
var WbiKeyStore = class {
  constructor(options) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.logger = options.logger ?? silentLogger;
    const persisted = options.read?.() ?? null;
    if (persisted && isSameDay(persisted.fetchedAt, this.now())) this.cached = persisted;
  }
  options;
  cached = null;
  inflight = null;
  now;
  logger;
  async keys() {
    const cached = this.cached;
    if (cached && isSameDay(cached.fetchedAt, this.now())) return cached;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const { imgUrl, subUrl } = await this.options.load();
      const keys = {
        imgKey: wbiKeyFromUrl(imgUrl),
        subKey: wbiKeyFromUrl(subUrl),
        fetchedAt: this.now()
      };
      if (keys.imgKey === "" || keys.subKey === "") {
        throw new Error(`wbi keys \u89E3\u6790\u5931\u8D25\uFF1Aimg=${imgUrl} sub=${subUrl}`);
      }
      this.cached = keys;
      this.options.write?.(keys);
      this.logger.debug("\u5237\u65B0 wbi keys", { imgKey: keys.imgKey, subKey: keys.subKey });
      return keys;
    })();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
  async signQuery(params) {
    const { imgKey, subKey } = await this.keys();
    return encWbi(params, imgKey, subKey, this.now());
  }
  invalidate() {
    this.cached = null;
  }
};
var BilibiliApi = class {
  constructor(client, wbi, logger, options = {}) {
    this.client = client;
    this.wbi = wbi;
    this.logger = logger ?? silentLogger;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve3) => setTimeout(resolve3, ms)));
    this.softBlockRetryDelayMs = options.softBlockRetryDelayMs ?? 2500;
  }
  client;
  wbi;
  logger;
  sleep;
  softBlockRetryDelayMs;
  async getNav(signal) {
    return this.client.get({
      endpoint: "/x/web-interface/nav",
      allowCodes: [-101],
      ...signal === void 0 ? {} : { signal }
    });
  }
  async fetchBuvid(signal) {
    const data3 = await this.client.get({
      endpoint: "/x/frontend/finger/spi",
      ...signal === void 0 ? {} : { signal }
    });
    if (!data3 || typeof data3.b_3 !== "string" || typeof data3.b_4 !== "string") return null;
    return data3;
  }
  async searchVideos(options) {
    const page2 = options.page ?? 1;
    const query = await this.wbi.signQuery({
      keyword: options.keyword,
      search_type: "video",
      page: String(page2)
    });
    const request = async () => this.client.get({
      endpoint: "/x/web-interface/wbi/search/type",
      params: query,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    let data3 = await request();
    if (looksSoftBlocked(data3)) {
      this.logger.warn(`\u641C\u7D22\u7591\u4F3C\u88AB\u98CE\u63A7\u62E6\u622A\uFF0C${this.softBlockRetryDelayMs}ms \u540E\u91CD\u8BD5\u4E00\u6B21`);
      await this.sleep(this.softBlockRetryDelayMs);
      data3 = await request();
      if (looksSoftBlocked(data3)) {
        throw new BilibiliError("risk", "\u641C\u7D22\u88AB B \u7AD9\u98CE\u63A7\u62E6\u622A\uFF08\u8FD4\u56DE\u7A7A\u7ED3\u679C\uFF09\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\uFF0C\u6216\u626B\u7801\u767B\u5F55\u540E\u518D\u641C");
      }
    }
    const items = (data3.result ?? []).filter(
      (item) => typeof item.bvid === "string" && item.bvid !== ""
    );
    this.logger.debug(`\u641C\u7D22\u300C${options.keyword}\u300D\u7B2C ${page2} \u9875`, { count: items.length, numPages: data3.numPages });
    return { items, numPages: data3.numPages ?? 1 };
  }
  async getVideoInfo(bvid, signal) {
    const data3 = await this.client.get({
      endpoint: "/x/web-interface/view",
      params: { bvid },
      ...signal === void 0 ? {} : { signal }
    });
    return {
      bvid: data3.bvid,
      title: stripHtmlTags(data3.title),
      cover: data3.pic ?? "",
      author: data3.owner?.name ?? "",
      durationSeconds: Number.isFinite(data3.duration) ? data3.duration : 0,
      pageCount: Array.isArray(data3.pages) && data3.pages.length > 0 ? data3.pages.length : 1,
      pages: data3.pages ?? []
    };
  }
  async getPageList(bvid, signal) {
    const pages = await this.client.get({
      endpoint: "/x/player/pagelist",
      params: { bvid },
      ...signal === void 0 ? {} : { signal }
    });
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new BilibiliError("unavailable", `\u8BE5\u89C6\u9891\u6CA1\u6709\u53EF\u64AD\u653E\u7684\u5206 P\uFF1A${bvid}`);
    }
    return pages;
  }
  async getAudioStream(options) {
    const quality = options.quality ?? AUDIO_QUALITY.HIGH;
    const query = await this.wbi.signQuery({
      bvid: options.bvid,
      cid: String(options.cid),
      fnval: "4048",
      fnver: "0",
      fourk: "1",
      qlt: String(quality),
      voice_balance: "1"
    });
    const data3 = await this.client.get({
      endpoint: "/x/player/wbi/playurl",
      params: query,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    const stream2 = pickAudioStream(data3, quality);
    this.logger.debug("\u53D6\u5230\u97F3\u9891\u6D41", {
      bvid: options.bvid,
      cid: options.cid,
      container: stream2.container,
      quality: stream2.quality,
      codecs: stream2.codecs
    });
    return stream2;
  }
  async getUserInfo(signal) {
    return this.client.get({
      endpoint: "/x/space/myinfo",
      ...signal === void 0 ? {} : { signal }
    });
  }
  async getFavoriteFolders(options) {
    const params = { up_mid: options.mid };
    if (options.bvid !== void 0 && options.bvid !== "") {
      params.rid = bv2av(options.bvid);
      params.type = "2";
    }
    const data3 = await this.client.get({
      endpoint: "/x/v3/fav/folder/created/list-all",
      params,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    return data3?.list ?? [];
  }
  async getFavoriteContents(options) {
    const params = {
      media_id: String(options.mediaId),
      pn: String(options.page ?? 1),
      ps: "40"
    };
    if (options.keyword !== void 0 && options.keyword !== "") {
      params.keyword = options.keyword;
      params.type = options.scope === "all" ? "1" : "0";
    }
    const data3 = await this.client.get({
      endpoint: "/x/v3/fav/resource/list",
      params,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    this.logger.debug("\u53D6\u5230\u6536\u85CF\u5939\u5185\u5BB9", {
      mediaId: options.mediaId,
      page: options.page ?? 1,
      count: data3.medias?.length ?? 0,
      hasMore: data3.has_more
    });
    return { ...data3, medias: data3.medias ?? [] };
  }
  async getFavoriteResourceIds(mediaId, signal) {
    const data3 = await this.client.get({
      endpoint: "/x/v3/fav/resource/ids",
      params: { media_id: String(mediaId) },
      ...signal === void 0 ? {} : { signal }
    });
    return Array.isArray(data3) ? data3 : [];
  }
  async createFavoriteFolder(options) {
    return this.client.postWithCsrf({
      endpoint: "/x/v3/fav/folder/add",
      payload: {
        title: options.title,
        intro: options.intro ?? "",
        privacy: String(options.privacy ?? 0)
      }
    });
  }
  async deleteFavoriteFolders(mediaIds) {
    if (mediaIds.length === 0) return;
    await this.client.postWithCsrf({
      endpoint: "/x/v3/fav/folder/del",
      payload: { media_ids: mediaIds.join(",") }
    });
  }
  async dealFavoriteForOneVideo(options) {
    return this.client.postWithCsrf({
      endpoint: "/x/v3/fav/resource/deal",
      payload: {
        rid: String(bv2av(options.bvid)),
        type: "2",
        add_media_ids: options.addToFavoriteIds.join(","),
        del_media_ids: options.delInFavoriteIds.join(",")
      }
    });
  }
  async removeFavoriteResources(options) {
    if (options.bvids.length === 0) return;
    const resources = options.bvids.map((bvid) => `${bv2av(bvid)}:2`).join(",");
    await this.client.postWithCsrf({
      endpoint: "/x/v3/fav/resource/batch-del",
      payload: { resources, media_id: String(options.mediaId), platform: "web" }
    });
  }
};
var TYPE_VIDEO = 2;
function describeInvalidAttr(attr) {
  if (attr === 0) return null;
  if (attr === 9) return "up \u4E3B\u5DF2\u5220\u9664";
  if (attr === 1) return "\u5DF2\u88AB\u5220\u9664\u6216\u8BBE\u4E3A\u79C1\u5BC6";
  return "\u5DF2\u5931\u6548";
}
function toFavoriteEntry(item) {
  if (item.type !== TYPE_VIDEO) return null;
  if (typeof item.bvid !== "string" || item.bvid === "") return null;
  const reason = describeInvalidAttr(item.attr);
  return {
    avid: item.id,
    bvid: item.bvid,
    title: item.title ?? "",
    cover: item.cover ?? "",
    upperName: item.upper?.name ?? "",
    durationSeconds: Number.isFinite(item.duration) ? Math.max(0, Math.round(item.duration)) : 0,
    pageCount: Number.isFinite(item.page) ? Math.max(1, Math.round(item.page)) : 1,
    invalid: reason !== null,
    invalidReason: reason
  };
}
function toFavoriteContentsView(page2) {
  const entries = [];
  for (const item of page2.medias ?? []) {
    const entry = toFavoriteEntry(item);
    if (entry !== null) entries.push(entry);
  }
  return {
    title: page2.info?.title ?? "",
    total: page2.info?.media_count ?? entries.length,
    entries,
    hasMore: page2.has_more === true
  };
}

// src/host/audio/pcm.ts
import { endianness } from "node:os";
var CLIP_MAX = 32767;
var CLIP_MIN = -32768;
function floatToInt16(value) {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round(value * 32767);
  if (scaled > CLIP_MAX) return CLIP_MAX;
  if (scaled < CLIP_MIN) return CLIP_MIN;
  return scaled;
}
function interleaveToInt16(channelData, frames) {
  const channels2 = channelData.length;
  const out = new Int16Array(frames * channels2);
  for (let frame2 = 0; frame2 < frames; frame2++) {
    for (let channel2 = 0; channel2 < channels2; channel2++) {
      const track = channelData[channel2];
      const value = track === void 0 ? 0 : track[frame2] ?? 0;
      out[frame2 * channels2 + channel2] = floatToInt16(value);
    }
  }
  return out;
}
function int16ToBuffer(data3) {
  if (endianness() === "LE") {
    return Buffer.from(data3.buffer, data3.byteOffset, data3.byteLength);
  }
  const out = Buffer.allocUnsafe(data3.byteLength);
  for (let i = 0; i < data3.length; i++) out.writeInt16LE(data3[i] ?? 0, i * 2);
  return out;
}

// src/host/audio/aacDecoder.ts
var DEFAULT_FRAMES_PER_BATCH = 256;
var AacFrameDecoder = class {
  options;
  decoder = null;
  sampleRate = 0;
  channels = 0;
  released = false;
  totalFrames = 0;
  totalBytes = 0;
  chunkCount = 0;
  errors = /* @__PURE__ */ new Set();
  constructor(options = {}) {
    this.options = options;
  }
  warn(message) {
    this.options.onWarn?.(message);
  }
  /** 编译 wasm 并配置解码器。 */
  async ready() {
    const module = await Promise.resolve().then(() => (init_aac(), aac_exports));
    const asc = this.options.audioSpecificConfig ?? null;
    if (asc === null || asc.byteLength === 0) {
      throw new Error("\u7F3A\u5C11 AudioSpecificConfig\uFF0C\u65E0\u6CD5\u89E3\u7801\u88F8 AAC \u5E27");
    }
    this.decoder = new module.AACDecoder({ audioSpecificConfig: asc });
    await this.decoder.ready;
  }
  /**
   * 逐批解码并 flush（适合「一次性解一整首歌」）。
   *
   * @param frames 裸 AAC 帧
   * @param onChunk 每解出一批就回调一次
   */
  async decode(frames, onChunk) {
    const summary = await this.decodePartial(frames, onChunk);
    const decoder = this.decoder;
    if (decoder === null) return summary;
    this.consumeResult(await decoder.flush(), onChunk);
    return this.snapshot();
  }
  /**
   * 只解这一批帧，**不 flush**。
   *
   * 流式起播时是「边下边解」：如果每一段都 flush，会把解码器的内部缓冲反复清空，
   * 段与段交界处容易出现杂音；flush 只该在整条码流结束时调用一次。
   */
  async decodePartial(frames, onChunk) {
    if (this.decoder === null || this.released) {
      throw new Error("\u89E3\u7801\u5668\u5C1A\u672A\u5C31\u7EEA\u6216\u5DF2\u91CA\u653E");
    }
    const batchSize = Math.max(1, this.options.framesPerBatch ?? DEFAULT_FRAMES_PER_BATCH);
    for (let index = 0; index < frames.length; index += batchSize) {
      const batch = frames.slice(index, index + batchSize);
      this.consumeResult(await this.decoder.decodeFrames(batch), onChunk);
      await new Promise((resolve3) => setImmediate(resolve3));
    }
    return this.snapshot();
  }
  /** 整条码流结束：把解码器里剩下的数据吐出来。 */
  async flush(onChunk) {
    if (this.decoder === null || this.released) {
      throw new Error("\u89E3\u7801\u5668\u5C1A\u672A\u5C31\u7EEA\u6216\u5DF2\u91CA\u653E");
    }
    this.consumeResult(await this.decoder.flush(), onChunk);
    return this.snapshot();
  }
  snapshot() {
    return {
      sampleRate: this.sampleRate,
      channels: this.channels,
      frames: this.totalFrames,
      bytes: this.totalBytes,
      chunkCount: this.chunkCount,
      errors: [...this.errors]
    };
  }
  consumeResult(decoded, onChunk) {
    for (const error of decoded.errors ?? []) {
      if (error.message !== void 0) this.errors.add(error.message);
    }
    if (decoded.samplesDecoded <= 0 || decoded.channelData.length === 0) return;
    if (this.sampleRate === 0) {
      this.sampleRate = decoded.sampleRate;
      this.channels = decoded.channelData.length;
    } else if (decoded.sampleRate !== this.sampleRate) {
      this.warn(`\u91C7\u6837\u7387\u53D1\u751F\u53D8\u5316\uFF08${this.sampleRate} \u2192 ${decoded.sampleRate}\uFF09`);
      this.sampleRate = decoded.sampleRate;
    }
    const interleaved = interleaveToInt16(decoded.channelData, decoded.samplesDecoded);
    const pcm = int16ToBuffer(interleaved);
    this.totalFrames += decoded.samplesDecoded;
    this.totalBytes += pcm.byteLength;
    this.chunkCount++;
    onChunk?.({
      pcm,
      frames: decoded.samplesDecoded,
      sampleRate: this.sampleRate,
      channels: decoded.channelData.length
    });
  }
  /** 释放 wasm 内存；释放后实例不可再用。 */
  free() {
    this.released = true;
    for (const message of this.errors) this.warn(`AAC \u89E3\u7801\u5668\u62A5\u544A\uFF1A${message}`);
    this.decoder?.free();
    this.decoder = null;
  }
};

// node_modules/mp4box/dist/rolldown-runtime-w6R9maHv.mjs
var __defProp2 = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name2 in all) {
    __defProp2(target, name2, {
      get: all[name2],
      enumerable: true
    });
  }
  if (!no_symbols) {
    __defProp2(target, Symbol.toStringTag, { value: "Module" });
  }
  return target;
};

// node_modules/mp4box/dist/styp-9TIZZDLN.mjs
var MAX_SIZE = Math.pow(2, 32);
var MAX_UINT32 = Math.pow(2, 32) - 1;
var TFHD_FLAG_DEFAULT_BASE_IS_MOOF = 131072;
var TRUN_FLAGS_FLAGS = 1024;
var TRUN_FLAGS_CTS_OFFSET = 2048;
var MP4BoxBuffer = class MP4BoxBuffer2 extends ArrayBuffer {
  constructor(byteLength) {
    super(byteLength);
    this.fileStart = 0;
    this.usedBytes = 0;
  }
  static fromArrayBuffer(buffer2, fileStart) {
    const mp4BoxBuffer = new MP4BoxBuffer2(buffer2.byteLength);
    new Uint8Array(mp4BoxBuffer).set(new Uint8Array(buffer2));
    mp4BoxBuffer.fileStart = fileStart;
    return mp4BoxBuffer;
  }
};
var DataStream = class DataStream2 {
  static {
    this.ENDIANNESS = new Int8Array(new Int16Array([1]).buffer)[0] > 0 ? 2 : 1;
  }
  /**
  * DataStream reads scalars, arrays and structs of data from an ArrayBuffer.
  * It's like a file-like DataView on steroids.
  *
  * @param arrayBuffer ArrayBuffer to read from.
  * @param byteOffset Offset from arrayBuffer beginning for the DataStream.
  * @param endianness Endianness of the DataStream (default: BIG_ENDIAN).
  */
  constructor(arrayBuffer, byteOffset, endianness2) {
    this._byteLength = 0;
    this.failurePosition = 0;
    this._dynamicSize = 1;
    this._byteOffset = byteOffset || 0;
    if (arrayBuffer instanceof ArrayBuffer) this.buffer = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);
    else if (arrayBuffer instanceof DataView) {
      this.dataView = arrayBuffer;
      if (byteOffset) this._byteOffset += byteOffset;
    } else this.buffer = new MP4BoxBuffer(arrayBuffer || 0);
    this.position = 0;
    this.endianness = endianness2 ? endianness2 : 1;
  }
  getPosition() {
    return this.position;
  }
  /**
  * Internal function to resize the DataStream buffer when required.
  * @param extra Number of bytes to add to the buffer allocation.
  */
  _realloc(extra) {
    if (!this._dynamicSize) return;
    const req = this._byteOffset + this.position + extra;
    let blen = this._buffer.byteLength;
    if (req <= blen) {
      if (req > this._byteLength) this._byteLength = req;
      return;
    }
    if (blen < 1) blen = 1;
    while (req > blen) blen *= 2;
    const buf = new MP4BoxBuffer(blen);
    const src = new Uint8Array(this._buffer);
    new Uint8Array(buf, 0, src.length).set(src);
    this.buffer = buf;
    this._byteLength = req;
  }
  /**
  * Internal function to trim the DataStream buffer when required.
  * Used for stripping out the extra bytes from the backing buffer when
  * the virtual byteLength is smaller than the buffer byteLength (happens after
  * growing the buffer with writes and not filling the extra space completely).
  */
  _trimAlloc() {
    if (this._byteLength === this._buffer.byteLength) return;
    const buf = new MP4BoxBuffer(this._byteLength);
    const dst = new Uint8Array(buf);
    const src = new Uint8Array(this._buffer, 0, dst.length);
    dst.set(src);
    this.buffer = buf;
  }
  /**
  * Returns the byte length of the DataStream object.
  * @type {number}
  */
  get byteLength() {
    return this._byteLength - this._byteOffset;
  }
  /**
  * Set/get the backing ArrayBuffer of the DataStream object.
  * The setter updates the DataView to point to the new buffer.
  * @type {Object}
  */
  get buffer() {
    this._trimAlloc();
    return this._buffer;
  }
  set buffer(value) {
    this._buffer = value;
    this._dataView = new DataView(value, this._byteOffset);
    this._byteLength = value.byteLength;
  }
  /**
  * Set/get the byteOffset of the DataStream object.
  * The setter updates the DataView to point to the new byteOffset.
  * @type {number}
  */
  get byteOffset() {
    return this._byteOffset;
  }
  set byteOffset(value) {
    this._byteOffset = value;
    this._dataView = new DataView(this._buffer, this._byteOffset);
    this._byteLength = this._buffer.byteLength;
  }
  /**
  * Set/get the byteOffset of the DataStream object.
  * The setter updates the DataView to point to the new byteOffset.
  * @type {number}
  */
  get dataView() {
    return this._dataView;
  }
  set dataView(value) {
    this._byteOffset = value.byteOffset;
    this._buffer = MP4BoxBuffer.fromArrayBuffer(value.buffer, 0);
    this._dataView = new DataView(this._buffer, this._byteOffset);
    this._byteLength = this._byteOffset + value.byteLength;
  }
  /**
  *   Sets the DataStream read/write position to given position.
  *   Clamps between 0 and DataStream length.
  *
  *   @param pos Position to seek to.
  *   @return
  */
  seek(pos) {
    const npos = Math.max(0, Math.min(this.byteLength, pos));
    this.position = isNaN(npos) || !isFinite(npos) ? 0 : npos;
  }
  /**
  * Returns true if the DataStream seek pointer is at the end of buffer and
  * there's no more data to read.
  *
  * @return True if the seek pointer is at the end of the buffer.
  */
  isEof() {
    return this.position >= this._byteLength;
  }
  #isTupleType(type) {
    return Array.isArray(type) && type.length === 3 && type[0] === "[]";
  }
  /**
  * Maps a Uint8Array into the DataStream buffer.
  *
  * Nice for quickly reading in data.
  *
  * @param length Number of elements to map.
  * @param e Endianness of the data to read.
  * @return Uint8Array to the DataStream backing buffer.
  */
  mapUint8Array(length2) {
    this._realloc(length2 * 1);
    const arr = new Uint8Array(this._buffer, this.byteOffset + this.position, length2);
    this.position += length2 * 1;
    return arr;
  }
  /**
  * Reads an Int32Array of desired length and endianness from the DataStream.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return The read Int32Array.
  */
  readInt32Array(length2, endianness2) {
    length2 = length2 === void 0 ? this.byteLength - this.position / 4 : length2;
    const arr = new Int32Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads an Int16Array of desired length and endianness from the DataStream.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return The read Int16Array.
  */
  readInt16Array(length2, endianness2) {
    length2 = length2 === void 0 ? this.byteLength - this.position / 2 : length2;
    const arr = new Int16Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads an Int8Array of desired length from the DataStream.
  *
  * @param length Number of elements to map.
  * @param e Endianness of the data to read.
  * @return The read Int8Array.
  */
  readInt8Array(length2) {
    length2 = length2 === void 0 ? this.byteLength - this.position : length2;
    const arr = new Int8Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads a Uint32Array of desired length and endianness from the DataStream.
  *
  *  @param length Number of elements to map.
  *  @param endianness Endianness of the data to read.
  *  @return The read Uint32Array.
  */
  readUint32Array(length2, endianness2) {
    length2 = length2 === void 0 ? this.byteLength - this.position / 4 : length2;
    const arr = new Uint32Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads a Uint16Array of desired length and endianness from the DataStream.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return The read Uint16Array.
  */
  readUint16Array(length2, endianness2) {
    length2 = length2 === void 0 ? this.byteLength - this.position / 2 : length2;
    const arr = new Uint16Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads a Uint8Array of desired length from the DataStream.
  *
  * @param length Number of elements to map.
  * @param e Endianness of the data to read.
  * @return The read Uint8Array.
  */
  readUint8Array(length2) {
    length2 = length2 === void 0 ? this.byteLength - this.position : length2;
    const arr = new Uint8Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads a Float64Array of desired length and endianness from the DataStream.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return The read Float64Array.
  */
  readFloat64Array(length2, endianness2) {
    length2 = length2 === void 0 ? this.byteLength - this.position / 8 : length2;
    const arr = new Float64Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads a Float32Array of desired length and endianness from the DataStream.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return The read Float32Array.
  */
  readFloat32Array(length2, endianness2) {
    length2 = length2 === void 0 ? this.byteLength - this.position / 4 : length2;
    const arr = new Float32Array(length2);
    DataStream2.memcpy(arr.buffer, 0, this.buffer, this.byteOffset + this.position, length2 * arr.BYTES_PER_ELEMENT);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += arr.byteLength;
    return arr;
  }
  /**
  * Reads a 32-bit int from the DataStream with the desired endianness.
  *
  * @param endianness Endianness of the number.
  * @return The read number.
  */
  readInt32(endianness2) {
    const v = this._dataView.getInt32(this.position, (endianness2 ?? this.endianness) === 2);
    this.position += 4;
    return v;
  }
  /**
  * Reads a 16-bit int from the DataStream with the desired endianness.
  *
  * @param endianness Endianness of the number.
  * @return The read number.
  */
  readInt16(endianness2) {
    const v = this._dataView.getInt16(this.position, (endianness2 ?? this.endianness) === 2);
    this.position += 2;
    return v;
  }
  /**
  * Reads an 8-bit int from the DataStream.
  *
  * @return The read number.
  */
  readInt8() {
    const v = this._dataView.getInt8(this.position);
    this.position += 1;
    return v;
  }
  /**
  * Reads a 32-bit unsigned int from the DataStream with the desired endianness.
  *
  * @param endianness Endianness of the number.
  * @return The read number.
  */
  readUint32(endianness2) {
    const v = this._dataView.getUint32(this.position, (endianness2 ?? this.endianness) === 2);
    this.position += 4;
    return v;
  }
  /**
  * Reads a 16-bit unsigned int from the DataStream with the desired endianness.
  *
  * @param endianness Endianness of the number.
  * @return The read number.
  */
  readUint16(endianness2) {
    const v = this._dataView.getUint16(this.position, (endianness2 ?? this.endianness) === 2);
    this.position += 2;
    return v;
  }
  /**
  * Reads an 8-bit unsigned int from the DataStream.
  *
  * @return The read number.
  */
  readUint8() {
    const v = this._dataView.getUint8(this.position);
    this.position += 1;
    return v;
  }
  /**
  * Reads a 32-bit float from the DataStream with the desired endianness.
  *
  * @param endianness Endianness of the number.
  * @return The read number.
  */
  readFloat32(endianness2) {
    const value = this._dataView.getFloat32(this.position, (endianness2 ?? this.endianness) === 2);
    this.position += 4;
    return value;
  }
  /**
  * Reads a 64-bit float from the DataStream with the desired endianness.
  *
  * @param endianness Endianness of the number.
  * @return The read number.
  */
  readFloat64(endianness2) {
    const value = this._dataView.getFloat64(this.position, (endianness2 ?? this.endianness) === 2);
    this.position += 8;
    return value;
  }
  /**
  * Copies byteLength bytes from the src buffer at srcOffset to the
  * dst buffer at dstOffset.
  *
  * @param dst Destination ArrayBuffer to write to.
  * @param dstOffset Offset to the destination ArrayBuffer.
  * @param src Source ArrayBuffer to read from.
  * @param srcOffset Offset to the source ArrayBuffer.
  * @param byteLength Number of bytes to copy.
  */
  static memcpy(dst, dstOffset, src, srcOffset, byteLength) {
    const dstU8 = new Uint8Array(dst, dstOffset, byteLength);
    const srcU8 = new Uint8Array(src, srcOffset, byteLength);
    dstU8.set(srcU8);
  }
  /**
  * Converts array to native endianness in-place.
  *
  * @param typedArray Typed array to convert.
  * @param endianness True if the data in the array is
  *                                      little-endian. Set false for big-endian.
  * @return The converted typed array.
  */
  static arrayToNative(typedArray, endianness2) {
    if (endianness2 === DataStream2.ENDIANNESS) return typedArray;
    else return this.flipArrayEndianness(typedArray);
  }
  /**
  * Converts native endianness array to desired endianness in-place.
  *
  * @param typedArray Typed array to convert.
  * @param littleEndian True if the converted array should be
  *                               little-endian. Set false for big-endian.
  * @return The converted typed array.
  */
  static nativeToEndian(typedArray, littleEndian) {
    if (littleEndian && DataStream2.ENDIANNESS === 2) return typedArray;
    else return this.flipArrayEndianness(typedArray);
  }
  /**
  * Flips typed array endianness in-place.
  *
  * @param typedArray Typed array to flip.
  * @return The converted typed array.
  */
  static flipArrayEndianness(typedArray) {
    const u8 = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    for (let i = 0; i < typedArray.byteLength; i += typedArray.BYTES_PER_ELEMENT) for (let j = i + typedArray.BYTES_PER_ELEMENT - 1, k = i; j > k; j--, k++) {
      const tmp = u8[k];
      u8[k] = u8[j];
      u8[j] = tmp;
    }
    return typedArray;
  }
  /**
  * Read a string of desired length and encoding from the DataStream.
  *
  * @param length The length of the string to read in bytes.
  * @param encoding The encoding of the string data in the DataStream.
  *                           Defaults to ASCII.
  * @return The read string.
  */
  readString(length2, encoding) {
    if (encoding === void 0 || encoding === "ASCII") return fromCharCodeUint8(this.mapUint8Array(length2 === void 0 ? this.byteLength - this.position : length2));
    else return new TextDecoder(encoding).decode(this.mapUint8Array(length2));
  }
  /**
  * Read null-terminated string of desired length from the DataStream. Truncates
  * the returned string so that the null byte is not a part of it.
  *
  * @param length The length of the string to read.
  * @return The read string.
  */
  readCString(length2) {
    let i = 0;
    const blen = this.byteLength - this.position;
    const u8 = new Uint8Array(this._buffer, this._byteOffset + this.position);
    const len = length2 !== void 0 ? Math.min(length2, blen) : blen;
    for (; i < len && u8[i] !== 0; i++) ;
    const s = fromCharCodeUint8(this.mapUint8Array(i));
    if (length2 !== void 0) this.position += len - i;
    else if (i !== blen) this.position += 1;
    return s;
  }
  readInt64() {
    return this.readInt32() * MAX_SIZE + this.readUint32();
  }
  readUint64() {
    return this.readUint32() * MAX_SIZE + this.readUint32();
  }
  readUint24() {
    return (this.readUint8() << 16) + (this.readUint8() << 8) + this.readUint8();
  }
  /**
  * Saves the DataStream contents to the given filename.
  * Uses Chrome's anchor download property to initiate download.
  *
  * @param filename Filename to save as.
  * @return
  * @bundle DataStream-write.js
  */
  save(filename) {
    const blob = new Blob([this.buffer]);
    if (typeof window !== "undefined" && typeof document !== "undefined") if (window.URL && URL.createObjectURL) {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      document.body.appendChild(a);
      a.setAttribute("href", url);
      a.setAttribute("download", filename);
      a.setAttribute("target", "_self");
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else throw new Error("DataStream.save: Can't create object URL.");
    return blob;
  }
  /** @bundle DataStream-write.js */
  get dynamicSize() {
    return this._dynamicSize;
  }
  /** @bundle DataStream-write.js */
  set dynamicSize(v) {
    if (!v) this._trimAlloc();
    this._dynamicSize = v;
  }
  /**
  * Internal function to trim the DataStream buffer when required.
  * Used for stripping out the first bytes when not needed anymore.
  *
  * @return
  * @bundle DataStream-write.js
  */
  shift(offset) {
    const buf = new MP4BoxBuffer(this._byteLength - offset);
    const dst = new Uint8Array(buf);
    const src = new Uint8Array(this._buffer, offset, dst.length);
    dst.set(src);
    this.buffer = buf;
    this.position -= offset;
  }
  /**
  * Writes an Int32Array of specified endianness to the DataStream.
  *
  * @param array The array to write.
  * @param endianness Endianness of the data to write.
  * @bundle DataStream-write.js
  */
  writeInt32Array(array, endianness2) {
    this._realloc(array.length * 4);
    if (array instanceof Int32Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapInt32Array(array.length, endianness2);
    } else for (let i = 0; i < array.length; i++) this.writeInt32(array[i], endianness2);
  }
  /**
  * Writes an Int16Array of specified endianness to the DataStream.
  *
  * @param array The array to write.
  * @param endianness Endianness of the data to write.
  * @bundle DataStream-write.js
  */
  writeInt16Array(array, endianness2) {
    this._realloc(array.length * 2);
    if (array instanceof Int16Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapInt16Array(array.length, endianness2);
    } else for (let i = 0; i < array.length; i++) this.writeInt16(array[i], endianness2);
  }
  /**
  * Writes an Int8Array to the DataStream.
  *
  * @param array The array to write.
  * @bundle DataStream-write.js
  */
  writeInt8Array(array) {
    this._realloc(array.length * 1);
    if (array instanceof Int8Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapInt8Array(array.length);
    } else for (let i = 0; i < array.length; i++) this.writeInt8(array[i]);
  }
  /**
  * Writes a Uint32Array of specified endianness to the DataStream.
  *
  * @param array The array to write.
  * @param endianness Endianness of the data to write.
  * @bundle DataStream-write.js
  */
  writeUint32Array(array, endianness2) {
    this._realloc(array.length * 4);
    if (array instanceof Uint32Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapUint32Array(array.length, endianness2);
    } else for (let i = 0; i < array.length; i++) this.writeUint32(array[i], endianness2);
  }
  /**
  * Writes a Uint16Array of specified endianness to the DataStream.
  *
  * @param array The array to write.
  * @param endianness Endianness of the data to write.
  * @bundle DataStream-write.js
  */
  writeUint16Array(array, endianness2) {
    this._realloc(array.length * 2);
    if (array instanceof Uint16Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapUint16Array(array.length, endianness2);
    } else for (let i = 0; i < array.length; i++) this.writeUint16(array[i], endianness2);
  }
  /**
  * Writes a Uint8Array to the DataStream.
  *
  * @param array The array to write.
  * @bundle DataStream-write.js
  */
  writeUint8Array(array) {
    this._realloc(array.length * 1);
    if (array instanceof Uint8Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapUint8Array(array.length);
    } else for (let i = 0; i < array.length; i++) this.writeUint8(array[i]);
  }
  /**
  * Writes a Float64Array of specified endianness to the DataStream.
  *
  * @param array The array to write.
  * @param endianness Endianness of the data to write.
  * @bundle DataStream-write.js
  */
  writeFloat64Array(array, endianness2) {
    this._realloc(array.length * 8);
    if (array instanceof Float64Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapFloat64Array(array.length, endianness2);
    } else for (let i = 0; i < array.length; i++) this.writeFloat64(array[i], endianness2);
  }
  /**
  * Writes a Float32Array of specified endianness to the DataStream.
  *
  * @param array The array to write.
  * @param endianness Endianness of the data to write.
  * @bundle DataStream-write.js
  */
  writeFloat32Array(array, endianness2) {
    this._realloc(array.length * 4);
    if (array instanceof Float32Array && this.byteOffset + this.position % array.BYTES_PER_ELEMENT === 0) {
      DataStream2.memcpy(this._buffer, this.byteOffset + this.position, array.buffer, 0, array.byteLength);
      this.mapFloat32Array(array.length, endianness2);
    } else for (let i = 0; i < array.length; i++) this.writeFloat32(array[i], endianness2);
  }
  /**
  * Writes a 64-bit int to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeInt64(value, endianness2) {
    this._realloc(8);
    this._dataView.setBigInt64(this.position, BigInt(value), (endianness2 ?? this.endianness) === 2);
    this.position += 8;
  }
  /**
  * Writes a 32-bit int to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeInt32(value, endianness2) {
    this._realloc(4);
    this._dataView.setInt32(this.position, value, (endianness2 ?? this.endianness) === 2);
    this.position += 4;
  }
  /**
  * Writes a 16-bit int to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeInt16(value, endianness2) {
    this._realloc(2);
    this._dataView.setInt16(this.position, value, (endianness2 ?? this.endianness) === 2);
    this.position += 2;
  }
  /**
  * Writes an 8-bit int to the DataStream.
  *
  * @param value Number to write.
  * @bundle DataStream-write.js
  */
  writeInt8(value) {
    this._realloc(1);
    this._dataView.setInt8(this.position, value);
    this.position += 1;
  }
  /**
  * Writes a 32-bit unsigned int to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeUint32(value, endianness2) {
    this._realloc(4);
    this._dataView.setUint32(this.position, value, (endianness2 ?? this.endianness) === 2);
    this.position += 4;
  }
  /**
  * Writes a 16-bit unsigned int to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeUint16(value, endianness2) {
    this._realloc(2);
    this._dataView.setUint16(this.position, value, (endianness2 ?? this.endianness) === 2);
    this.position += 2;
  }
  /**
  * Writes an 8-bit unsigned  int to the DataStream.
  *
  * @param value Number to write.
  * @bundle DataStream-write.js
  */
  writeUint8(value) {
    this._realloc(1);
    this._dataView.setUint8(this.position, value);
    this.position += 1;
  }
  /**
  * Writes a 32-bit float to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeFloat32(value, endianness2) {
    this._realloc(4);
    this._dataView.setFloat32(this.position, value, (endianness2 ?? this.endianness) === 2);
    this.position += 4;
  }
  /**
  * Writes a 64-bit float to the DataStream with the desired endianness.
  *
  * @param value Number to write.
  * @param endianness Endianness of the number.
  * @bundle DataStream-write.js
  */
  writeFloat64(value, endianness2) {
    this._realloc(8);
    this._dataView.setFloat64(this.position, value, (endianness2 ?? this.endianness) === 2);
    this.position += 8;
  }
  /**
  * Write a UCS-2 string of desired endianness to the DataStream. The
  * lengthOverride argument lets you define the number of characters to write.
  * If the string is shorter than lengthOverride, the extra space is padded with
  * zeroes.
  *
  * @param value The string to write.
  * @param endianness The endianness to use for the written string data.
  * @param lengthOverride The number of characters to write.
  * @bundle DataStream-write.js
  */
  writeUCS2String(value, endianness2, lengthOverride) {
    if (lengthOverride === void 0) lengthOverride = value.length;
    let i;
    for (i = 0; i < value.length && i < lengthOverride; i++) this.writeUint16(value.charCodeAt(i), endianness2);
    for (; i < lengthOverride; i++) this.writeUint16(0);
  }
  /**
  * Writes a string of desired length and encoding to the DataStream.
  *
  * @param value The string to write.
  * @param encoding The encoding for the written string data.
  *                           Defaults to ASCII.
  * @param length The number of characters to write.
  * @bundle DataStream-write.js
  */
  writeString(value, encoding, length2) {
    let i = 0;
    if (encoding === void 0 || encoding === "ASCII") if (length2 !== void 0) {
      const len = Math.min(value.length, length2);
      for (i = 0; i < len; i++) this.writeUint8(value.charCodeAt(i));
      for (; i < length2; i++) this.writeUint8(0);
    } else for (i = 0; i < value.length; i++) this.writeUint8(value.charCodeAt(i));
    else this.writeUint8Array(new TextEncoder(encoding).encode(value.substring(0, length2)));
  }
  /**
  * Writes a null-terminated string to DataStream and zero-pads it to length
  * bytes. If length is not given, writes the string followed by a zero.
  * If string is longer than length, the written part of the string does not have
  * a trailing zero.
  *
  * @param value The string to write.
  * @param length The number of characters to write.
  * @bundle DataStream-write.js
  */
  writeCString(value, length2) {
    let i = 0;
    if (length2 !== void 0) {
      const len = Math.min(value.length, length2);
      for (i = 0; i < len; i++) this.writeUint8(value.charCodeAt(i));
      for (; i < length2; i++) this.writeUint8(0);
    } else {
      for (i = 0; i < value.length; i++) this.writeUint8(value.charCodeAt(i));
      this.writeUint8(0);
    }
  }
  /**
  * Writes a struct to the DataStream. Takes a structDefinition that gives the
  * types and a struct object that gives the values. Refer to readStruct for the
  * structure of structDefinition.
  *
  * @param structDefinition Type definition of the struct.
  * @param struct The struct data object.
  * @bundle DataStream-write.js
  */
  writeStruct(structDefinition, struct) {
    for (let i = 0; i < structDefinition.length; i++) {
      const [structName, structType] = structDefinition[i];
      const structValue = struct[structName];
      this.writeType(structType, structValue, struct);
    }
  }
  /**
  * Writes object v of type t to the DataStream.
  *
  * @param type Type of data to write.
  * @param value Value of data to write.
  * @param struct Struct to pass to write callback functions.
  * @bundle DataStream-write.js
  */
  writeType(type, value, struct) {
    if (typeof type === "function") return type(this, value);
    else if (typeof type === "object" && !(type instanceof Array)) return type.set(this, value, struct);
    let lengthOverride;
    let charset = "ASCII";
    const pos = this.position;
    let parsedType = type;
    if (typeof type === "string" && /:/.test(type)) {
      const tp = type.split(":");
      parsedType = tp[0];
      lengthOverride = parseInt(tp[1]);
    }
    if (typeof parsedType === "string" && /,/.test(parsedType)) {
      const tp = parsedType.split(",");
      parsedType = tp[0];
      charset = tp[1];
    }
    switch (parsedType) {
      case "uint8":
        this.writeUint8(value);
        break;
      case "int8":
        this.writeInt8(value);
        break;
      case "uint16":
        this.writeUint16(value, this.endianness);
        break;
      case "int16":
        this.writeInt16(value, this.endianness);
        break;
      case "uint32":
        this.writeUint32(value, this.endianness);
        break;
      case "int32":
        this.writeInt32(value, this.endianness);
        break;
      case "float32":
        this.writeFloat32(value, this.endianness);
        break;
      case "float64":
        this.writeFloat64(value, this.endianness);
        break;
      case "uint16be":
        this.writeUint16(value, 1);
        break;
      case "int16be":
        this.writeInt16(value, 1);
        break;
      case "uint32be":
        this.writeUint32(value, 1);
        break;
      case "int32be":
        this.writeInt32(value, 1);
        break;
      case "float32be":
        this.writeFloat32(value, 1);
        break;
      case "float64be":
        this.writeFloat64(value, 1);
        break;
      case "uint16le":
        this.writeUint16(value, 2);
        break;
      case "int16le":
        this.writeInt16(value, 2);
        break;
      case "uint32le":
        this.writeUint32(value, 2);
        break;
      case "int32le":
        this.writeInt32(value, 2);
        break;
      case "float32le":
        this.writeFloat32(value, 2);
        break;
      case "float64le":
        this.writeFloat64(value, 2);
        break;
      case "cstring":
        this.writeCString(value, lengthOverride);
        break;
      case "string":
        this.writeString(value, charset, lengthOverride);
        break;
      case "u16string":
        this.writeUCS2String(value, this.endianness, lengthOverride);
        break;
      case "u16stringle":
        this.writeUCS2String(value, 2, lengthOverride);
        break;
      case "u16stringbe":
        this.writeUCS2String(value, 1, lengthOverride);
        break;
      default:
        if (this.#isTupleType(parsedType)) {
          const [, ta] = parsedType;
          for (let i = 0; i < value.length; i++) this.writeType(ta, value[i]);
          break;
        } else {
          this.writeStruct(parsedType, value);
          break;
        }
    }
    if (lengthOverride) {
      this.position = pos;
      this._realloc(lengthOverride);
      this.position = pos + lengthOverride;
    }
  }
  /** @bundle DataStream-write.js */
  writeUint64(value) {
    const h = Math.floor(value / MAX_SIZE);
    this.writeUint32(h);
    this.writeUint32(value & 4294967295);
  }
  /** @bundle DataStream-write.js */
  writeUint24(value) {
    this.writeUint8((value & 16711680) >> 16);
    this.writeUint8((value & 65280) >> 8);
    this.writeUint8(value & 255);
  }
  /** @bundle DataStream-write.js */
  adjustUint32(position, value) {
    const pos = this.position;
    this.seek(position);
    this.writeUint32(value);
    this.seek(pos);
  }
  /**
  * Reads a struct of data from the DataStream. The struct is defined as
  * an array of [name, type]-pairs. See the example below:
  *
  * ```ts
  * ds.readStruct([
  *   ['headerTag', 'uint32'], // Uint32 in DataStream endianness.
  *   ['headerTag2', 'uint32be'], // Big-endian Uint32.
  *   ['headerTag3', 'uint32le'], // Little-endian Uint32.
  *   ['array', ['[]', 'uint32', 16]], // Uint32Array of length 16.
  *   ['array2', ['[]', 'uint32', 'array2Length']] // Uint32Array of length array2Length
  * ]);
  * ```
  *
  * The possible values for the type are as follows:
  *
  * ## Number types
  *
  * Unsuffixed number types use DataStream endianness.
  * To explicitly specify endianness, suffix the type with
  * 'le' for little-endian or 'be' for big-endian,
  * e.g. 'int32be' for big-endian int32.
  *
  * - `uint8` -- 8-bit unsigned int
  * - `uint16` -- 16-bit unsigned int
  * - `uint32` -- 32-bit unsigned int
  * - `int8` -- 8-bit int
  * - `int16` -- 16-bit int
  * - `int32` -- 32-bit int
  * - `float32` -- 32-bit float
  * - `float64` -- 64-bit float
  *
  * ## String types
  *
  * - `cstring` -- ASCII string terminated by a zero byte.
  * - `string:N` -- ASCII string of length N.
  * - `string,CHARSET:N` -- String of byteLength N encoded with given CHARSET.
  * - `u16string:N` -- UCS-2 string of length N in DataStream endianness.
  * - `u16stringle:N` -- UCS-2 string of length N in little-endian.
  * - `u16stringbe:N` -- UCS-2 string of length N in big-endian.
  *
  * ## Complex types
  *
  * ### Struct
  * ```ts
  * [[name, type], [name_2, type_2], ..., [name_N, type_N]]
  * ```
  *
  * ### Callback function to read and return data
  * ```ts
  * function(dataStream, struct) {}
  * ```
  *
  * ###  Getter/setter functions
  * to read and return data, handy for using the same struct definition
  * for reading and writing structs.
  * ```ts
  * {
  *    get: function(dataStream, struct) {},
  *    set: function(dataStream, struct) {}
  * }
  * ```
  *
  * ### Array
  * Array of given type and length. The length can be either
  * - a number
  * - a string that references a previously-read field
  * - `*`
  * - a callback: `function(struct, dataStream, type){}`
  *
  * If length is `*`, reads in as many elements as it can.
  * ```ts
  * ['[]', type, length]
  * ```
  *
  * @param structDefinition Struct definition object.
  * @return The read struct. Null if failed to read struct.
  * @bundle DataStream-read-struct.js
  */
  readStruct(structDefinition) {
    const struct = {};
    const p = this.position;
    for (let i = 0; i < structDefinition.length; i += 1) {
      const t2 = structDefinition[i][1];
      const v = this.readType(t2, struct);
      if (!v) {
        if (this.failurePosition === 0) this.failurePosition = this.position;
        this.position = p;
        return;
      }
      struct[structDefinition[i][0]] = v;
    }
    return struct;
  }
  /**
  * Read UCS-2 string of desired length and endianness from the DataStream.
  *
  * @param length The length of the string to read.
  * @param endianness The endianness of the string data in the DataStream.
  * @return The read string.
  * @bundle DataStream-read-struct.js
  */
  readUCS2String(length2, endianness2) {
    return String.fromCharCode.apply(void 0, this.readUint16Array(length2, endianness2));
  }
  /**
  * Reads an object of type t from the DataStream, passing struct as the thus-far
  * read struct to possible callbacks that refer to it. Used by readStruct for
  * reading in the values, so the type is one of the readStruct types.
  *
  * @param type Type of the object to read.
  * @param struct Struct to refer to when resolving length references
  *                         and for calling callbacks.
  * @return  Returns the object on successful read, null on unsuccessful.
  * @bundle DataStream-read-struct.js
  */
  readType(type, struct) {
    if (typeof type === "function") return type(this, struct);
    if (typeof type === "object" && !(type instanceof Array)) return type.get(this, struct);
    if (type instanceof Array && type.length !== 3) return this.readStruct(type);
    let value;
    let lengthOverride;
    let charset = "ASCII";
    const pos = this.position;
    let parsedType = type;
    if (typeof parsedType === "string" && /:/.test(parsedType)) {
      const tp = parsedType.split(":");
      parsedType = tp[0];
      lengthOverride = parseInt(tp[1]);
    }
    if (typeof parsedType === "string" && /,/.test(parsedType)) {
      const tp = parsedType.split(",");
      parsedType = tp[0];
      charset = tp[1];
    }
    switch (parsedType) {
      case "uint8":
        value = this.readUint8();
        break;
      case "int8":
        value = this.readInt8();
        break;
      case "uint16":
        value = this.readUint16(this.endianness);
        break;
      case "int16":
        value = this.readInt16(this.endianness);
        break;
      case "uint32":
        value = this.readUint32(this.endianness);
        break;
      case "int32":
        value = this.readInt32(this.endianness);
        break;
      case "float32":
        value = this.readFloat32(this.endianness);
        break;
      case "float64":
        value = this.readFloat64(this.endianness);
        break;
      case "uint16be":
        value = this.readUint16(1);
        break;
      case "int16be":
        value = this.readInt16(1);
        break;
      case "uint32be":
        value = this.readUint32(1);
        break;
      case "int32be":
        value = this.readInt32(1);
        break;
      case "float32be":
        value = this.readFloat32(1);
        break;
      case "float64be":
        value = this.readFloat64(1);
        break;
      case "uint16le":
        value = this.readUint16(2);
        break;
      case "int16le":
        value = this.readInt16(2);
        break;
      case "uint32le":
        value = this.readUint32(2);
        break;
      case "int32le":
        value = this.readInt32(2);
        break;
      case "float32le":
        value = this.readFloat32(2);
        break;
      case "float64le":
        value = this.readFloat64(2);
        break;
      case "cstring":
        value = this.readCString(lengthOverride);
        break;
      case "string":
        value = this.readString(lengthOverride, charset);
        break;
      case "u16string":
        value = this.readUCS2String(lengthOverride, this.endianness);
        break;
      case "u16stringle":
        value = this.readUCS2String(lengthOverride, 2);
        break;
      case "u16stringbe":
        value = this.readUCS2String(lengthOverride, 1);
        break;
      default:
        if (this.#isTupleType(parsedType)) {
          const [, ta, len] = parsedType;
          const length2 = typeof len === "function" ? len(struct, this, parsedType) : typeof len === "string" && struct[len] !== void 0 ? parseInt(struct[len]) : typeof len === "number" ? len : len === "*" ? void 0 : parseInt(len);
          if (typeof ta === "string") {
            const tap = ta.replace(/(le|be)$/, "");
            let endianness2;
            if (/le$/.test(ta)) endianness2 = 2;
            else if (/be$/.test(ta)) endianness2 = 1;
            switch (tap) {
              case "uint8":
                value = this.readUint8Array(length2);
                break;
              case "uint16":
                value = this.readUint16Array(length2, endianness2);
                break;
              case "uint32":
                value = this.readUint32Array(length2, endianness2);
                break;
              case "int8":
                value = this.readInt8Array(length2);
                break;
              case "int16":
                value = this.readInt16Array(length2, endianness2);
                break;
              case "int32":
                value = this.readInt32Array(length2, endianness2);
                break;
              case "float32":
                value = this.readFloat32Array(length2, endianness2);
                break;
              case "float64":
                value = this.readFloat64Array(length2, endianness2);
                break;
              case "cstring":
              case "utf16string":
              case "string":
                if (!length2) {
                  value = [];
                  while (!this.isEof()) {
                    const u = this.readType(ta, struct);
                    if (!u) break;
                    value.push(u);
                  }
                } else {
                  value = new Array(length2);
                  for (let i = 0; i < length2; i++) value[i] = this.readType(ta, struct);
                }
                break;
            }
          } else if (!length2) {
            value = [];
            while (true) {
              const pos2 = this.position;
              try {
                const type2 = this.readType(ta, struct);
                if (!type2) {
                  this.position = pos2;
                  break;
                }
                value.push(type2);
              } catch {
                this.position = pos2;
                break;
              }
            }
          } else {
            value = new Array(length2);
            for (let i = 0; i < length2; i++) {
              const type2 = this.readType(ta, struct);
              if (!type2) return;
              value[i] = type2;
            }
          }
          break;
        }
    }
    if (lengthOverride) this.position = pos + lengthOverride;
    return value;
  }
  /**
  * Maps an Int32Array into the DataStream buffer, swizzling it to native
  * endianness in-place. The current offset from the start of the buffer needs to
  * be a multiple of element size, just like with typed array views.
  *
  * Nice for quickly reading in data. Warning: potentially modifies the buffer
  * contents.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Int32Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapInt32Array(length2, endianness2) {
    this._realloc(length2 * 4);
    const arr = new Int32Array(this._buffer, this.byteOffset + this.position, length2);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += length2 * 4;
    return arr;
  }
  /**
  * Maps an Int16Array into the DataStream buffer, swizzling it to native
  * endianness in-place. The current offset from the start of the buffer needs to
  * be a multiple of element size, just like with typed array views.
  *
  * Nice for quickly reading in data. Warning: potentially modifies the buffer
  * contents.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Int16Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapInt16Array(length2, endianness2) {
    this._realloc(length2 * 2);
    const arr = new Int16Array(this._buffer, this.byteOffset + this.position, length2);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += length2 * 2;
    return arr;
  }
  /**
  * Maps an Int8Array into the DataStream buffer.
  *
  * Nice for quickly reading in data.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Int8Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapInt8Array(length2, _endianness) {
    this._realloc(length2 * 1);
    const arr = new Int8Array(this._buffer, this.byteOffset + this.position, length2);
    this.position += length2 * 1;
    return arr;
  }
  /**
  * Maps a Uint32Array into the DataStream buffer, swizzling it to native
  * endianness in-place. The current offset from the start of the buffer needs to
  * be a multiple of element size, just like with typed array views.
  *
  * Nice for quickly reading in data. Warning: potentially modifies the buffer
  * contents.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Uint32Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapUint32Array(length2, endianness2) {
    this._realloc(length2 * 4);
    const arr = new Uint32Array(this._buffer, this.byteOffset + this.position, length2);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += length2 * 4;
    return arr;
  }
  /**
  * Maps a Uint16Array into the DataStream buffer, swizzling it to native
  * endianness in-place. The current offset from the start of the buffer needs to
  * be a multiple of element size, just like with typed array views.
  *
  * Nice for quickly reading in data. Warning: potentially modifies the buffer
  * contents.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Uint16Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapUint16Array(length2, endianness2) {
    this._realloc(length2 * 2);
    const arr = new Uint16Array(this._buffer, this.byteOffset + this.position, length2);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += length2 * 2;
    return arr;
  }
  /**
  * Maps a Float64Array into the DataStream buffer, swizzling it to native
  * endianness in-place. The current offset from the start of the buffer needs to
  * be a multiple of element size, just like with typed array views.
  *
  * Nice for quickly reading in data. Warning: potentially modifies the buffer
  * contents.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Float64Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapFloat64Array(length2, endianness2) {
    this._realloc(length2 * 8);
    const arr = new Float64Array(this._buffer, this.byteOffset + this.position, length2);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += length2 * 8;
    return arr;
  }
  /**
  * Maps a Float32Array into the DataStream buffer, swizzling it to native
  * endianness in-place. The current offset from the start of the buffer needs to
  * be a multiple of element size, just like with typed array views.
  *
  * Nice for quickly reading in data. Warning: potentially modifies the buffer
  * contents.
  *
  * @param length Number of elements to map.
  * @param endianness Endianness of the data to read.
  * @return Float32Array to the DataStream backing buffer.
  * @bundle DataStream-map.js
  */
  mapFloat32Array(length2, endianness2) {
    this._realloc(length2 * 4);
    const arr = new Float32Array(this._buffer, this.byteOffset + this.position, length2);
    DataStream2.arrayToNative(arr, endianness2 ?? this.endianness);
    this.position += length2 * 4;
    return arr;
  }
};
function fromCharCodeUint8(uint8arr) {
  const arr = [];
  for (let i = 0; i < uint8arr.length; i++) arr[i] = uint8arr[i];
  return String.fromCharCode.apply(void 0, arr);
}
var start = /* @__PURE__ */ new Date();
var LOG_LEVEL_ERROR = 4;
var LOG_LEVEL_WARNING = 3;
var LOG_LEVEL_INFO = 2;
var LOG_LEVEL_DEBUG = 1;
var log_level = LOG_LEVEL_ERROR;
var Log = {
  setLogLevel(level) {
    if (level === this.debug) log_level = LOG_LEVEL_DEBUG;
    else if (level === this.info) log_level = LOG_LEVEL_INFO;
    else if (level === this.warn) log_level = LOG_LEVEL_WARNING;
    else if (level === this.error) log_level = LOG_LEVEL_ERROR;
    else log_level = LOG_LEVEL_ERROR;
  },
  debug(module, msg) {
    if (console.debug === void 0) console.debug = console.log;
    if (LOG_LEVEL_DEBUG >= log_level) console.debug("[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]", "[" + module + "]", msg);
  },
  log(module, _msg) {
    this.debug(module.msg);
  },
  info(module, msg) {
    if (LOG_LEVEL_INFO >= log_level) console.info("[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]", "[" + module + "]", msg);
  },
  warn(module, msg) {
    if (LOG_LEVEL_WARNING >= log_level) console.warn("[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]", "[" + module + "]", msg);
  },
  error(module, msg, isofile) {
    if (isofile?.onError) isofile.onError(module, msg);
    else if (LOG_LEVEL_ERROR >= log_level) console.error("[" + Log.getDurationString((/* @__PURE__ */ new Date()).getTime() - start.getTime(), 1e3) + "]", "[" + module + "]", msg);
  },
  getDurationString(duration2, _timescale) {
    let neg;
    function pad(number, length2) {
      const a = ("" + number).split(".");
      while (a[0].length < length2) a[0] = "0" + a[0];
      return a.join(".");
    }
    if (duration2 < 0) {
      neg = true;
      duration2 = -duration2;
    } else neg = false;
    let duration_sec = duration2 / (_timescale || 1);
    const hours = Math.floor(duration_sec / 3600);
    duration_sec -= hours * 3600;
    const minutes = Math.floor(duration_sec / 60);
    duration_sec -= minutes * 60;
    let msec = duration_sec * 1e3;
    duration_sec = Math.floor(duration_sec);
    msec -= duration_sec * 1e3;
    msec = Math.floor(msec);
    return (neg ? "-" : "") + hours + ":" + pad(minutes, 2) + ":" + pad(duration_sec, 2) + "." + pad(msec, 3);
  },
  printRanges(ranges) {
    const length2 = ranges.length;
    if (length2 > 0) {
      let str = "";
      for (let i = 0; i < length2; i++) {
        if (i > 0) str += ",";
        str += "[" + Log.getDurationString(ranges.start(i)) + "," + Log.getDurationString(ranges.end(i)) + "]";
      }
      return str;
    } else return "(empty)";
  }
};
function concatBuffers2(buffer1, buffer2) {
  Log.debug("ArrayBuffer", "Trying to create a new buffer of size: " + (buffer1.byteLength + buffer2.byteLength));
  const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
  tmp.set(new Uint8Array(buffer1), 0);
  tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
  return tmp.buffer;
}
var MultiBufferStream = class extends DataStream {
  constructor(buffer2) {
    super(/* @__PURE__ */ new ArrayBuffer(), 0);
    this.buffers = [];
    this.bufferIndex = -1;
    if (buffer2) {
      this.insertBuffer(buffer2);
      this.bufferIndex = 0;
    }
  }
  /***********************************************************************************
  *                     Methods for the managnement of the buffers                  *
  *                     (insertion, removal, concatenation, ...)                    *
  ***********************************************************************************/
  initialized() {
    if (this.bufferIndex > -1) return true;
    else if (this.buffers.length > 0) {
      const firstBuffer = this.buffers[0];
      if (firstBuffer.fileStart === 0) {
        this.buffer = firstBuffer;
        this.bufferIndex = 0;
        Log.debug("MultiBufferStream", "Stream ready for parsing");
        return true;
      } else {
        Log.warn("MultiBufferStream", "The first buffer should have a fileStart of 0");
        this.logBufferLevel();
        return false;
      }
    } else {
      Log.warn("MultiBufferStream", "No buffer to start parsing from");
      this.logBufferLevel();
      return false;
    }
  }
  /**
  * Reduces the size of a given buffer, but taking the part between offset and offset+newlength
  * @param  {ArrayBuffer} buffer
  * @param  {Number}      offset    the start of new buffer
  * @param  {Number}      newLength the length of the new buffer
  * @return {ArrayBuffer}           the new buffer
  */
  reduceBuffer(buffer2, offset, newLength) {
    const smallB = new Uint8Array(newLength);
    smallB.set(new Uint8Array(buffer2, offset, newLength));
    smallB.buffer.fileStart = buffer2.fileStart + offset;
    smallB.buffer.usedBytes = 0;
    return smallB.buffer;
  }
  /**
  * Inserts the new buffer in the sorted list of buffers,
  *  making sure, it is not overlapping with existing ones (possibly reducing its size).
  *  if the new buffer overrides/replaces the 0-th buffer (for instance because it is bigger),
  *  updates the DataStream buffer for parsing
  */
  insertBuffer(ab) {
    let to_add = true;
    let i = 0;
    for (; i < this.buffers.length; i++) {
      const b = this.buffers[i];
      if (ab.fileStart <= b.fileStart) {
        if (ab.fileStart === b.fileStart) if (ab.byteLength > b.byteLength) {
          this.buffers.splice(i, 1);
          i--;
          continue;
        } else Log.warn("MultiBufferStream", "Buffer (fileStart: " + ab.fileStart + " - Length: " + ab.byteLength + ") already appended, ignoring");
        else {
          if (ab.fileStart + ab.byteLength <= b.fileStart) {
          } else ab = this.reduceBuffer(ab, 0, b.fileStart - ab.fileStart);
          Log.debug("MultiBufferStream", "Appending new buffer (fileStart: " + ab.fileStart + " - Length: " + ab.byteLength + ")");
          this.buffers.splice(i, 0, ab);
          if (i === 0) this.buffer = ab;
        }
        to_add = false;
        break;
      } else if (ab.fileStart < b.fileStart + b.byteLength) {
        const offset = b.fileStart + b.byteLength - ab.fileStart;
        const newLength = ab.byteLength - offset;
        if (newLength > 0) ab = this.reduceBuffer(ab, offset, newLength);
        else {
          to_add = false;
          break;
        }
      }
    }
    if (to_add) {
      Log.debug("MultiBufferStream", "Appending new buffer (fileStart: " + ab.fileStart + " - Length: " + ab.byteLength + ")");
      this.buffers.push(ab);
      if (i === 0) this.buffer = ab;
    }
  }
  /**
  * Displays the status of the buffers (number and used bytes)
  * @param  {Object} info callback method for display
  */
  logBufferLevel(info) {
    const ranges = [];
    let bufferedString = "";
    let range;
    let used = 0;
    let total2 = 0;
    for (let i = 0; i < this.buffers.length; i++) {
      const buffer2 = this.buffers[i];
      if (i === 0) {
        range = {
          start: buffer2.fileStart,
          end: buffer2.fileStart + buffer2.byteLength
        };
        ranges.push(range);
        bufferedString += "[" + range.start + "-";
      } else if (range.end === buffer2.fileStart) range.end = buffer2.fileStart + buffer2.byteLength;
      else {
        range = {
          start: buffer2.fileStart,
          end: buffer2.fileStart + buffer2.byteLength
        };
        bufferedString += ranges[ranges.length - 1].end - 1 + "], [" + range.start + "-";
        ranges.push(range);
      }
      used += buffer2.usedBytes;
      total2 += buffer2.byteLength;
    }
    if (ranges.length > 0) bufferedString += range.end - 1 + "]";
    const log = info ? Log.info : Log.debug;
    if (this.buffers.length === 0) log("MultiBufferStream", "No more buffer in memory");
    else log("MultiBufferStream", "" + this.buffers.length + " stored buffer(s) (" + used + "/" + total2 + " bytes), continuous ranges: " + bufferedString);
  }
  cleanBuffers() {
    for (let i = 0; i < this.buffers.length; i++) {
      const buffer2 = this.buffers[i];
      if (buffer2.usedBytes === buffer2.byteLength) {
        Log.debug("MultiBufferStream", "Removing buffer #" + i);
        this.buffers.splice(i, 1);
        i--;
      }
    }
  }
  mergeNextBuffer() {
    if (this.bufferIndex + 1 < this.buffers.length) {
      const next_buffer = this.buffers[this.bufferIndex + 1];
      if (next_buffer.fileStart === this.buffer.fileStart + this.buffer.byteLength) {
        const oldLength = this.buffer.byteLength;
        const oldUsedBytes = this.buffer.usedBytes;
        const oldFileStart = this.buffer.fileStart;
        this.buffers[this.bufferIndex] = concatBuffers2(this.buffer, next_buffer);
        this.buffer = this.buffers[this.bufferIndex];
        this.buffers.splice(this.bufferIndex + 1, 1);
        this.buffer.usedBytes = oldUsedBytes;
        this.buffer.fileStart = oldFileStart;
        Log.debug("ISOFile", "Concatenating buffer for box parsing (length: " + oldLength + "->" + this.buffer.byteLength + ")");
        return true;
      } else return false;
    } else return false;
  }
  /*************************************************************************
  *                        Seek-related functions                         *
  *************************************************************************/
  /**
  * Finds the buffer that holds the given file position
  * @param  {Boolean} fromStart    indicates if the search should start from the current buffer (false)
  *                                or from the first buffer (true)
  * @param  {Number}  filePosition position in the file to seek to
  * @param  {Boolean} markAsUsed   indicates if the bytes in between the current position and the seek position
  *                                should be marked as used for garbage collection
  * @return {Number}               the index of the buffer holding the seeked file position, -1 if not found.
  */
  findPosition(fromStart, filePosition, markAsUsed) {
    let index = -1;
    let i = fromStart === true ? 0 : this.bufferIndex;
    while (i < this.buffers.length) {
      const abuffer2 = this.buffers[i];
      if (abuffer2 && abuffer2.fileStart <= filePosition) {
        index = i;
        if (markAsUsed) {
          if (abuffer2.fileStart + abuffer2.byteLength <= filePosition) abuffer2.usedBytes = abuffer2.byteLength;
          else abuffer2.usedBytes = filePosition - abuffer2.fileStart;
          this.logBufferLevel();
        }
      } else break;
      i++;
    }
    if (index === -1) return -1;
    const abuffer = this.buffers[index];
    if (abuffer.fileStart + abuffer.byteLength >= filePosition) {
      Log.debug("MultiBufferStream", "Found position in existing buffer #" + index);
      return index;
    } else return -1;
  }
  /**
  * Finds the largest file position contained in a buffer or in the next buffers if they are contiguous (no gap)
  * starting from the given buffer index or from the current buffer if the index is not given
  *
  * @param  {Number} inputindex Index of the buffer to start from
  * @return {Number}            The largest file position found in the buffers
  */
  findEndContiguousBuf(inputindex) {
    const index = inputindex !== void 0 ? inputindex : this.bufferIndex;
    let currentBuf = this.buffers[index];
    if (this.buffers.length > index + 1) for (let i = index + 1; i < this.buffers.length; i++) {
      const nextBuf = this.buffers[i];
      if (nextBuf.fileStart === currentBuf.fileStart + currentBuf.byteLength) currentBuf = nextBuf;
      else break;
    }
    return currentBuf.fileStart + currentBuf.byteLength;
  }
  /**
  * Returns the largest file position contained in the buffers, larger than the given position
  * @param  {Number} pos the file position to start from
  * @return {Number}     the largest position in the current buffer or in the buffer and the next contiguous
  *                      buffer that holds the given position
  */
  getEndFilePositionAfter(pos) {
    const index = this.findPosition(true, pos, false);
    if (index !== -1) return this.findEndContiguousBuf(index);
    else return pos;
  }
  /*************************************************************************
  *                  Garbage collection related functions                 *
  *************************************************************************/
  /**
  * Marks a given number of bytes as used in the current buffer for garbage collection
  * @param {Number} nbBytes
  */
  addUsedBytes(nbBytes) {
    this.buffer.usedBytes += nbBytes;
    this.logBufferLevel();
  }
  /**
  * Marks the entire current buffer as used, ready for garbage collection
  */
  setAllUsedBytes() {
    this.buffer.usedBytes = this.buffer.byteLength;
    this.logBufferLevel();
  }
  /*************************************************************************
  *          Common API between MultiBufferStream and SimpleStream        *
  *************************************************************************/
  /**
  * Tries to seek to a given file position
  * if possible, repositions the parsing from there and returns true
  * if not possible, does not change anything and returns false
  * @param  {Number}  filePosition position in the file to seek to
  * @param  {Boolean} fromStart    indicates if the search should start from the current buffer (false)
  *                                or from the first buffer (true)
  * @param  {Boolean} markAsUsed   indicates if the bytes in between the current position and the seek position
  *                                should be marked as used for garbage collection
  * @return {Boolean}              true if the seek succeeded, false otherwise
  */
  seek(filePosition, fromStart, markAsUsed) {
    const index = this.findPosition(fromStart, filePosition, markAsUsed);
    if (index !== -1) {
      this.buffer = this.buffers[index];
      this.bufferIndex = index;
      this.position = filePosition - this.buffer.fileStart;
      Log.debug("MultiBufferStream", "Repositioning parser at buffer position: " + this.position);
      return true;
    } else {
      Log.debug("MultiBufferStream", "Position " + filePosition + " not found in buffered data");
      return false;
    }
  }
  /**
  * Returns the current position in the file
  * @return {Number} the position in the file
  */
  getPosition() {
    if (this.bufferIndex === -1 || this.buffers[this.bufferIndex] === void 0) return 0;
    return this.buffers[this.bufferIndex].fileStart + this.position;
  }
  /**
  * Returns the length of the current buffer
  * @return {Number} the length of the current buffer
  */
  getLength() {
    return this.byteLength;
  }
  getEndPosition() {
    if (this.bufferIndex === -1 || this.buffers[this.bufferIndex] === void 0) return 0;
    return this.buffers[this.bufferIndex].fileStart + this.byteLength;
  }
  getAbsoluteEndPosition() {
    if (this.buffers.length === 0) return 0;
    const lastBuffer = this.buffers[this.buffers.length - 1];
    return lastBuffer.fileStart + lastBuffer.byteLength;
  }
};
var Box = class {
  static {
    this.registryId = /* @__PURE__ */ Symbol.for("BoxIdentifier");
  }
  #type;
  get type() {
    return this.constructor.fourcc ?? this.#type;
  }
  set type(value) {
    this.#type = value;
  }
  constructor(size = 0) {
    this.size = size;
  }
  addBox(box) {
    if (!this.boxes) this.boxes = [];
    this.boxes.push(box);
    if (this[box.type + "s"]) this[box.type + "s"].push(box);
    else this[box.type] = box;
    return box;
  }
  set(prop, value) {
    this[prop] = value;
    return this;
  }
  addEntry(value, _prop) {
    const prop = _prop || "entries";
    if (!this[prop]) this[prop] = [];
    this[prop].push(value);
    return this;
  }
  /** @bundle box-write.js */
  writeHeader(stream2, msg) {
    this.size += 8;
    if (this.size > MAX_UINT32 || this.original_size === 1) this.size += 8;
    if (this.type === "uuid") this.size += 16;
    Log.debug("BoxWriter", "Writing box " + this.type + " of size: " + this.size + " at position " + stream2.getPosition() + (msg || ""));
    if (this.original_size === 0) stream2.writeUint32(0);
    else if (this.size > MAX_UINT32 || this.original_size === 1) stream2.writeUint32(1);
    else {
      this.sizePosition = stream2.getPosition();
      stream2.writeUint32(this.size);
    }
    stream2.writeString(this.type, void 0, 4);
    if (this.type === "uuid") {
      const uuidBytes = /* @__PURE__ */ new Uint8Array(16);
      for (let i = 0; i < 16; i++) uuidBytes[i] = parseInt(this.uuid.substring(i * 2, i * 2 + 2), 16);
      stream2.writeUint8Array(uuidBytes);
    }
    if (this.size > MAX_UINT32 || this.original_size === 1) {
      this.sizePosition = stream2.getPosition();
      stream2.writeUint64(this.size);
    }
  }
  /** @bundle box-write.js */
  write(stream2) {
    if (this.type === "mdat") {
      const box = this;
      if (box.stream) {
        this.size = box.stream.getAbsoluteEndPosition();
        this.writeHeader(stream2);
        for (const buffer2 of box.stream.buffers) {
          const u8 = new Uint8Array(buffer2);
          stream2.writeUint8Array(u8);
        }
      } else if (box.data) {
        this.size = box.data.length;
        this.writeHeader(stream2);
        stream2.writeUint8Array(box.data);
      }
    } else {
      this.size = this.data ? this.data.length : 0;
      this.writeHeader(stream2);
      if (this.data) stream2.writeUint8Array(this.data);
    }
  }
  /** @bundle box-print.js */
  printHeader(output) {
    this.size += 8;
    if (this.size > MAX_UINT32) this.size += 8;
    if (this.type === "uuid") this.size += 16;
    output.log(output.indent + "size:" + this.size);
    output.log(output.indent + "type:" + this.type);
  }
  /** @bundle box-print.js */
  print(output) {
    this.printHeader(output);
  }
  /** @bundle box-parse.js */
  parse(stream2) {
    if (this.type !== "mdat") this.data = stream2.readUint8Array(this.size - this.hdr_size);
    else if (this.size === 0) stream2.seek(stream2.getEndPosition());
    else stream2.seek(this.start + this.size);
  }
  /** @bundle box-parse.js */
  parseDataAndRewind(stream2) {
    this.data = stream2.readUint8Array(this.size - this.hdr_size);
    stream2.seek(this.start + this.hdr_size);
  }
  /** @bundle box-parse.js */
  parseLanguage(stream2) {
    this.language = stream2.readUint16();
    const chars = [];
    chars[0] = this.language >> 10 & 31;
    chars[1] = this.language >> 5 & 31;
    chars[2] = this.language & 31;
    this.languageString = String.fromCharCode(chars[0] + 96, chars[1] + 96, chars[2] + 96);
  }
  /** @bundle isofile-advanced-creation.js */
  computeSize(stream_) {
    const stream2 = stream_ || new MultiBufferStream();
    this.write(stream2);
  }
  isEndOfBox(stream2) {
    return stream2.getPosition() === this.start + this.size;
  }
};
var FullBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.flags = 0;
    this.version = 0;
  }
  /** @bundle box-write.js */
  writeHeader(stream2) {
    this.size += 4;
    super.writeHeader(stream2, " v=" + this.version + " f=" + this.flags);
    stream2.writeUint8(this.version);
    stream2.writeUint24(this.flags);
  }
  /** @bundle box-print.js */
  printHeader(output) {
    this.size += 4;
    super.printHeader(output);
    output.log(output.indent + "version:" + this.version);
    output.log(output.indent + "flags:" + this.flags);
  }
  /** @bundle box-parse.js */
  parseDataAndRewind(stream2) {
    this.parseFullHeader(stream2);
    this.data = stream2.readUint8Array(this.size - this.hdr_size);
    this.hdr_size -= 4;
    stream2.seek(this.start + this.hdr_size);
  }
  /** @bundle box-parse.js */
  parseFullHeader(stream2) {
    this.version = stream2.readUint8();
    this.flags = stream2.readUint24();
    this.hdr_size += 4;
  }
  /** @bundle box-parse.js */
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.data = stream2.readUint8Array(this.size - this.hdr_size);
  }
};
var SampleGroupEntry = class {
  static {
    this.registryId = /* @__PURE__ */ Symbol.for("SampleGroupEntryIdentifier");
  }
  constructor(grouping_type) {
    this.grouping_type = grouping_type;
  }
  /** @bundle writing/samplegroups/samplegroup.js */
  write(stream2) {
    stream2.writeUint8Array(this.data);
  }
  /** @bundle parsing/samplegroups/samplegroup.js */
  parse(stream2) {
    Log.warn("BoxParser", `Unknown sample group type: '${this.grouping_type}'`);
    this.data = stream2.readUint8Array(this.description_length);
  }
};
var TrackGroupTypeBox = class extends FullBox {
  /** @bundle parsing/TrackGroup.js */
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.track_group_id = stream2.readUint32();
  }
};
var SingleItemTypeReferenceBox = class extends Box {
  constructor(fourcc, size, box_name, hdr_size, start2) {
    super(size);
    this.box_name = box_name;
    this.hdr_size = hdr_size;
    this.start = start2;
    this.type = fourcc;
  }
  parse(stream2) {
    this.from_item_ID = stream2.readUint16();
    const count = stream2.readUint16();
    this.references = [];
    for (let i = 0; i < count; i++) this.references[i] = { to_item_ID: stream2.readUint16() };
  }
};
var SingleItemTypeReferenceBoxLarge = class extends Box {
  constructor(fourcc, size, box_name, hdr_size, start2) {
    super(size);
    this.box_name = box_name;
    this.hdr_size = hdr_size;
    this.start = start2;
    this.type = fourcc;
  }
  parse(stream2) {
    this.from_item_ID = stream2.readUint32();
    const count = stream2.readUint16();
    this.references = [];
    for (let i = 0; i < count; i++) this.references[i] = { to_item_ID: stream2.readUint32() };
  }
};
var TrackReferenceTypeBox = class extends Box {
  constructor(fourcc, size, hdr_size, start2) {
    super(size);
    this.hdr_size = hdr_size;
    this.start = start2;
    this.type = fourcc;
  }
  parse(stream2) {
    this.track_ids = stream2.readUint32Array((this.size - this.hdr_size) / 4);
  }
  /** @bundle box-write.js */
  write(stream2) {
    this.size = this.track_ids.length * 4;
    this.writeHeader(stream2);
    stream2.writeUint32Array(this.track_ids);
  }
};
var DIFF_BOXES_PROP_NAMES = [
  "boxes",
  "entries",
  "references",
  "subsamples",
  "items",
  "item_infos",
  "extents",
  "associations",
  "subsegments",
  "ranges",
  "seekLists",
  "seekPoints",
  "esd",
  "levels"
];
var DIFF_PRIMITIVE_ARRAY_PROP_NAMES = [
  "compatible_brands",
  "matrix",
  "opcolor",
  "sample_counts",
  "sample_deltas",
  "first_chunk",
  "samples_per_chunk",
  "sample_sizes",
  "chunk_offsets",
  "sample_offsets",
  "sample_description_index",
  "sample_duration"
];
function boxEqualFields(box_a, box_b) {
  if (box_a && !box_b) return false;
  let prop;
  for (prop in box_a) if (DIFF_BOXES_PROP_NAMES.find((name2) => name2 === prop)) continue;
  else if (box_a[prop] instanceof Box || box_b[prop] instanceof Box) continue;
  else if (typeof box_a[prop] === "undefined" || typeof box_b[prop] === "undefined") continue;
  else if (typeof box_a[prop] === "function" || typeof box_b[prop] === "function") continue;
  else if ("subBoxNames" in box_a && box_a.subBoxNames.indexOf(prop.slice(0, 4)) > -1 || "subBoxNames" in box_b && box_b.subBoxNames.indexOf(prop.slice(0, 4)) > -1) continue;
  else if (prop === "data" || prop === "start" || prop === "size" || prop === "creation_time" || prop === "modification_time") continue;
  else if (DIFF_PRIMITIVE_ARRAY_PROP_NAMES.find((name2) => name2 === prop)) continue;
  else if (box_a[prop] !== box_b[prop]) return false;
  return true;
}
function boxEqual(box_a, box_b) {
  if (!boxEqualFields(box_a, box_b)) return false;
  for (let j = 0; j < DIFF_BOXES_PROP_NAMES.length; j++) {
    const name2 = DIFF_BOXES_PROP_NAMES[j];
    if (box_a[name2] && box_b[name2]) {
      if (!boxEqual(box_a[name2], box_b[name2])) return false;
    }
  }
  return true;
}
function getRegistryId(boxClass) {
  let current = boxClass;
  while (current) {
    if ("registryId" in current) return current["registryId"];
    current = Object.getPrototypeOf(current);
  }
}
var isSampleGroupEntry = (value) => {
  const symbol2 = /* @__PURE__ */ Symbol.for("SampleGroupEntryIdentifier");
  return getRegistryId(value) === symbol2;
};
var isSampleEntry = (value) => {
  const symbol2 = /* @__PURE__ */ Symbol.for("SampleEntryIdentifier");
  return getRegistryId(value) === symbol2;
};
var isBox = (value) => {
  const symbol2 = /* @__PURE__ */ Symbol.for("BoxIdentifier");
  return getRegistryId(value) === symbol2;
};
var BoxRegistry = {
  uuid: {},
  sampleEntry: {},
  sampleGroupEntry: {},
  box: {}
};
function registerBoxes(registry) {
  const localRegistry = {
    uuid: {},
    sampleEntry: {},
    sampleGroupEntry: {},
    box: {}
  };
  for (const [key, value] of Object.entries(registry)) {
    if (isSampleGroupEntry(value)) {
      const groupingType = "grouping_type" in value ? value.grouping_type : void 0;
      if (!groupingType) throw new Error(`SampleGroupEntry class ${key} does not have a valid static grouping_type. Please ensure it is defined correctly.`);
      if (groupingType in localRegistry.sampleGroupEntry) throw new Error(`SampleGroupEntry class ${key} has a grouping_type that is already registered. Please ensure it is unique.`);
      localRegistry.sampleGroupEntry[groupingType] = value;
      continue;
    }
    if (isSampleEntry(value)) {
      const fourcc = "fourcc" in value ? value.fourcc : void 0;
      if (!fourcc) throw new Error(`SampleEntry class ${key} does not have a valid static fourcc. Please ensure it is defined correctly.`);
      if (fourcc in localRegistry.sampleEntry) throw new Error(`SampleEntry class ${key} has a fourcc that is already registered. Please ensure it is unique.`);
      localRegistry.sampleEntry[fourcc] = value;
      continue;
    }
    if (isBox(value)) {
      const fourcc = "fourcc" in value ? value.fourcc : void 0;
      const uuid = "uuid" in value ? value.uuid : void 0;
      if (fourcc === "uuid") {
        if (!uuid) throw new Error(`Box class ${key} has a fourcc of 'uuid' but does not have a valid uuid. Please ensure it is defined correctly.`);
        if (uuid in localRegistry.uuid) throw new Error(`Box class ${key} has a uuid that is already registered. Please ensure it is unique.`);
        localRegistry.uuid[uuid] = value;
        continue;
      }
      localRegistry.box[fourcc] = value;
      continue;
    }
    throw new Error(`Box class ${key} does not have a valid static fourcc, uuid, or grouping_type. Please ensure it is defined correctly.`);
  }
  BoxRegistry.uuid = { ...localRegistry.uuid };
  BoxRegistry.sampleEntry = { ...localRegistry.sampleEntry };
  BoxRegistry.sampleGroupEntry = { ...localRegistry.sampleGroupEntry };
  BoxRegistry.box = { ...localRegistry.box };
  return BoxRegistry;
}
var DescriptorRegistry = {};
function registerDescriptors(registry) {
  Object.entries(registry).forEach(([key, value]) => DescriptorRegistry[key] = value);
  return DescriptorRegistry;
}
function parseUUID(stream2) {
  return parseHex16(stream2);
}
function parseHex16(stream2) {
  let hex16 = "";
  for (let i = 0; i < 16; i++) {
    const hex = stream2.readUint8().toString(16);
    hex16 += hex.length === 1 ? "0" + hex : hex;
  }
  return hex16;
}
function parseOneBox(stream2, headerOnly, parentSize) {
  let box;
  let originalSize;
  const start2 = stream2.getPosition();
  let hdr_size = 0;
  let uuid;
  if (stream2.getEndPosition() - start2 < 8) {
    Log.debug("BoxParser", "Not enough data in stream to parse the type and size of the box");
    return { code: 0 };
  }
  if (parentSize && parentSize < 8) {
    Log.debug("BoxParser", "Not enough bytes left in the parent box to parse a new box");
    return { code: 0 };
  }
  let size = stream2.readUint32();
  const type = stream2.readString(4);
  if (type.length !== 4 || !/^[\x20-\x7E]{4}$/.test(type)) {
    Log.error("BoxParser", `Invalid box type: '${type}'`);
    return {
      code: -1,
      start: start2,
      type
    };
  }
  let box_type = type;
  Log.debug("BoxParser", "Found box of type '" + type + "' and size " + size + " at position " + start2);
  hdr_size = 8;
  if (type === "uuid") {
    if (stream2.getEndPosition() - stream2.getPosition() < 16 || parentSize - hdr_size < 16) {
      stream2.seek(start2);
      Log.debug("BoxParser", "Not enough bytes left in the parent box to parse a UUID box");
      return { code: 0 };
    }
    uuid = parseUUID(stream2);
    hdr_size += 16;
    box_type = uuid;
  }
  if (size === 1) {
    if (stream2.getEndPosition() - stream2.getPosition() < 8 || parentSize && parentSize - hdr_size < 8) {
      stream2.seek(start2);
      Log.warn("BoxParser", 'Not enough data in stream to parse the extended size of the "' + type + '" box');
      return { code: 0 };
    }
    originalSize = size;
    size = stream2.readUint64();
    hdr_size += 8;
  } else if (size === 0) if (parentSize) size = parentSize;
  else if (type !== "mdat") {
    Log.error("BoxParser", "Unlimited box size not supported for type: '" + type + "'");
    box = new Box(size);
    box.type = type;
    return {
      code: 1,
      box,
      size: box.size
    };
  } else size = stream2.getEndPosition() - start2;
  if (size !== 0 && size < hdr_size) {
    Log.error("BoxParser", "Box of type " + type + " has an invalid size " + size + " (too small to be a box)");
    return {
      code: 0,
      type,
      size,
      hdr_size,
      start: start2
    };
  }
  if (size !== 0 && parentSize && size > parentSize) {
    Log.error("BoxParser", "Box of type '" + type + "' has a size " + size + " greater than its container size " + parentSize);
    return {
      code: 0,
      type,
      size,
      hdr_size,
      start: start2
    };
  }
  if (size !== 0 && start2 + size > stream2.getEndPosition()) {
    stream2.seek(start2);
    Log.info("BoxParser", "Not enough data in stream to parse the entire '" + type + "' box");
    return {
      code: 0,
      type,
      size,
      hdr_size,
      start: start2,
      original_size: originalSize
    };
  }
  if (headerOnly) return {
    code: 1,
    type,
    size,
    hdr_size,
    start: start2
  };
  else if (type in BoxRegistry.box) box = new BoxRegistry.box[type](size);
  else if (type !== "uuid") {
    Log.warn("BoxParser", `Unknown box type: '${type}'`);
    box = new Box(size);
    box.type = type;
    box.has_unparsed_data = true;
  } else if (uuid in BoxRegistry.uuid) box = new BoxRegistry.uuid[uuid](size);
  else {
    Log.warn("BoxParser", `Unknown UUID box type: '${uuid}'`);
    box = new Box(size);
    box.type = type;
    box.uuid = uuid;
    box.has_unparsed_data = true;
  }
  box.original_size = originalSize;
  box.hdr_size = hdr_size;
  box.start = start2;
  if (box.write === Box.prototype.write && box.type !== "mdat") {
    Log.info("BoxParser", "'" + box_type + "' box writing not yet implemented, keeping unparsed data in memory for later write");
    box.parseDataAndRewind(stream2);
  }
  box.parse(stream2);
  const diff = stream2.getPosition() - (box.start + box.size);
  if (diff < 0) {
    Log.warn("BoxParser", "Parsing of box '" + box_type + "' did not read the entire indicated box data size (missing " + -diff + " bytes), seeking forward");
    stream2.seek(box.start + box.size);
  } else if (diff > 0 && box.size !== 0) {
    Log.error("BoxParser", "Parsing of box '" + box_type + "' read " + diff + " more bytes than the indicated box data size, seeking backwards");
    stream2.seek(box.start + box.size);
  }
  return {
    code: 1,
    box,
    size: box.size
  };
}
var ContainerBox = class extends Box {
  /** @bundle box-write.js */
  write(stream2) {
    this.size = 0;
    this.writeHeader(stream2);
    if (this.boxes) {
      for (let i = 0; i < this.boxes.length; i++) if (this.boxes[i]) {
        this.boxes[i].write(stream2);
        this.size += this.boxes[i].size;
      }
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream2.adjustUint32(this.sizePosition, this.size);
  }
  /** @bundle box-print.js */
  print(output) {
    this.printHeader(output);
    for (let i = 0; i < this.boxes.length; i++) if (this.boxes[i]) {
      const prev_indent = output.indent;
      output.indent += " ";
      this.boxes[i].print(output);
      output.indent = prev_indent;
    }
  }
  /** @bundle box-parse.js */
  parse(stream2) {
    let ret;
    while (stream2.getPosition() < this.start + this.size) {
      ret = parseOneBox(stream2, false, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        const box = ret.box;
        if (!this.boxes) this.boxes = [];
        this.boxes.push(box);
        if (this.subBoxNames && this.subBoxNames.indexOf(box.type) !== -1) {
          const fourcc = this.subBoxNames[this.subBoxNames.indexOf(box.type)] + "s";
          if (!this[fourcc]) this[fourcc] = [];
          this[fourcc].push(box);
        } else {
          const box_type = box.type !== "uuid" ? box.type : box.uuid;
          if (this[box_type]) Log.warn("ContainerBox", `Box of type ${box_type} already exists in container box ${this.type}.`);
          else this[box_type] = box;
        }
      } else return;
    }
  }
};
var SampleEntry = class extends ContainerBox {
  static {
    this.registryId = /* @__PURE__ */ Symbol.for("SampleEntryIdentifier");
  }
  constructor(size, hdr_size, start2) {
    super(size);
    this.hdr_size = hdr_size;
    this.start = start2;
  }
  /** @bundle box-codecs.js */
  isVideo() {
    return false;
  }
  /** @bundle box-codecs.js */
  isAudio() {
    return false;
  }
  /** @bundle box-codecs.js */
  isSubtitle() {
    return false;
  }
  /** @bundle box-codecs.js */
  isMetadata() {
    return false;
  }
  /** @bundle box-codecs.js */
  isHint() {
    return false;
  }
  /** @bundle box-codecs.js */
  getCodec() {
    return this.type.replace(".", "");
  }
  /** @bundle box-codecs.js */
  getWidth() {
    return "";
  }
  /** @bundle box-codecs.js */
  getHeight() {
    return "";
  }
  /** @bundle box-codecs.js */
  getChannelCount() {
    return "";
  }
  /** @bundle box-codecs.js */
  getSampleRate() {
    return "";
  }
  /** @bundle box-codecs.js */
  getSampleSize() {
    return "";
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parseHeader(stream2) {
    stream2.readUint8Array(6);
    this.data_reference_index = stream2.readUint16();
    this.hdr_size += 8;
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parse(stream2) {
    this.parseHeader(stream2);
    this.data = stream2.readUint8Array(this.size - this.hdr_size);
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parseDataAndRewind(stream2) {
    this.parseHeader(stream2);
    this.data = stream2.readUint8Array(this.size - this.hdr_size);
    this.hdr_size -= 8;
    stream2.seek(this.start + this.hdr_size);
  }
  /** @bundle parsing/sampleentries/sampleentry.js */
  parseFooter(stream2) {
    super.parse(stream2);
  }
  /** @bundle writing/sampleentry.js */
  writeHeader(stream2) {
    this.size = 8;
    super.writeHeader(stream2);
    stream2.writeUint8(0);
    stream2.writeUint8(0);
    stream2.writeUint8(0);
    stream2.writeUint8(0);
    stream2.writeUint8(0);
    stream2.writeUint8(0);
    stream2.writeUint16(this.data_reference_index);
  }
  /** @bundle writing/sampleentry.js */
  writeFooter(stream2) {
    if (this.boxes) for (let i = 0; i < this.boxes.length; i++) {
      this.boxes[i].write(stream2);
      this.size += this.boxes[i].size;
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream2.adjustUint32(this.sizePosition, this.size);
  }
  /** @bundle writing/sampleentry.js */
  write(stream2) {
    this.writeHeader(stream2);
    stream2.writeUint8Array(this.data);
    this.size += this.data.length;
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream2.adjustUint32(this.sizePosition, this.size);
  }
};
var HintSampleEntry = class extends SampleEntry {
};
var MetadataSampleEntry = class extends SampleEntry {
  /** @bundle box-codecs.js */
  isMetadata() {
    return true;
  }
};
var SubtitleSampleEntry = class extends SampleEntry {
  /** @bundle box-codecs.js */
  isSubtitle() {
    return true;
  }
};
var TextSampleEntry = class extends SampleEntry {
};
var VisualSampleEntry = class extends SampleEntry {
  parse(stream2) {
    this.parseHeader(stream2);
    stream2.readUint16();
    stream2.readUint16();
    stream2.readUint32Array(3);
    this.width = stream2.readUint16();
    this.height = stream2.readUint16();
    this.horizresolution = stream2.readUint32();
    this.vertresolution = stream2.readUint32();
    stream2.readUint32();
    this.frame_count = stream2.readUint16();
    const compressorname_length = Math.min(31, stream2.readUint8());
    this.compressorname = stream2.readString(compressorname_length);
    if (compressorname_length < 31) stream2.readString(31 - compressorname_length);
    this.depth = stream2.readUint16();
    stream2.readUint16();
    this.parseFooter(stream2);
  }
  /** @bundle box-codecs.js */
  isVideo() {
    return true;
  }
  /** @bundle box-codecs.js */
  getWidth() {
    return this.width;
  }
  /** @bundle box-codecs.js */
  getHeight() {
    return this.height;
  }
  /** @bundle writing/sampleentries/sampleentry.js */
  write(stream2) {
    this.writeHeader(stream2);
    this.size += 70;
    stream2.writeUint16(0);
    stream2.writeUint16(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint16(this.width);
    stream2.writeUint16(this.height);
    stream2.writeUint32(this.horizresolution);
    stream2.writeUint32(this.vertresolution);
    stream2.writeUint32(0);
    stream2.writeUint16(this.frame_count);
    stream2.writeUint8(Math.min(31, this.compressorname.length));
    stream2.writeString(this.compressorname, void 0, 31);
    stream2.writeUint16(this.depth);
    stream2.writeInt16(-1);
    this.writeFooter(stream2);
  }
};
var AudioSampleEntry = class extends SampleEntry {
  parse(stream2) {
    this.parseHeader(stream2);
    this.version = stream2.readUint16();
    stream2.readUint16();
    stream2.readUint32();
    this.channel_count = stream2.readUint16();
    this.samplesize = stream2.readUint16();
    stream2.readUint16();
    stream2.readUint16();
    this.samplerate = stream2.readUint32() / 65536;
    if (stream2.isofile?.ftyp?.major_brand.includes("qt")) {
      if (this.version === 1) this.extensions = stream2.readUint8Array(16);
      else if (this.version === 2) this.extensions = stream2.readUint8Array(36);
    }
    this.parseFooter(stream2);
  }
  /** @bundle box-codecs.js */
  isAudio() {
    return true;
  }
  /** @bundle box-codecs.js */
  getChannelCount() {
    return this.channel_count;
  }
  /** @bundle box-codecs.js */
  getSampleRate() {
    return this.samplerate;
  }
  /** @bundle box-codecs.js */
  getSampleSize() {
    return this.samplesize;
  }
  /** @bundle writing/sampleentry.js */
  write(stream2) {
    this.writeHeader(stream2);
    this.size += 20;
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint16(this.channel_count);
    stream2.writeUint16(this.samplesize);
    stream2.writeUint16(0);
    stream2.writeUint16(0);
    stream2.writeUint32(this.samplerate << 16);
    this.writeFooter(stream2);
  }
};
var SystemSampleEntry = class extends SampleEntry {
  parse(stream2) {
    this.parseHeader(stream2);
    this.parseFooter(stream2);
  }
  /** @bundle writing/sampleentry.js */
  write(stream2) {
    this.writeHeader(stream2);
    this.writeFooter(stream2);
  }
};
var ParameterSetArray = class extends Array {
  toString() {
    let str = "<table class='inner-table'>";
    str += "<thead><tr><th>length</th><th>nalu_data</th></tr></thead>";
    str += "<tbody>";
    for (let i = 0; i < this.length; i++) {
      const nalu = this[i];
      str += "<tr>";
      str += "<td>" + nalu.length + "</td>";
      str += "<td>";
      str += nalu.data.reduce(function(str2, byte) {
        return str2 + byte.toString(16).padStart(2, "0");
      }, "0x");
      str += "</td></tr>";
    }
    str += "</tbody></table>";
    return str;
  }
};
var avcCBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "AVCConfigurationBox";
  }
  static {
    this.fourcc = "avcC";
  }
  parse(stream2) {
    this.configurationVersion = stream2.readUint8();
    this.AVCProfileIndication = stream2.readUint8();
    this.profile_compatibility = stream2.readUint8();
    this.AVCLevelIndication = stream2.readUint8();
    this.lengthSizeMinusOne = stream2.readUint8() & 3;
    this.nb_SPS_nalus = stream2.readUint8() & 31;
    let toparse = this.size - this.hdr_size - 6;
    this.SPS = new ParameterSetArray();
    for (let i = 0; i < this.nb_SPS_nalus; i++) {
      const length2 = stream2.readUint16();
      this.SPS.push({
        length: length2,
        data: stream2.readUint8Array(length2)
      });
      toparse -= 2 + length2;
    }
    this.nb_PPS_nalus = stream2.readUint8();
    toparse--;
    this.PPS = new ParameterSetArray();
    for (let i = 0; i < this.nb_PPS_nalus; i++) {
      const length2 = stream2.readUint16();
      this.PPS.push({
        length: length2,
        data: stream2.readUint8Array(length2)
      });
      toparse -= 2 + length2;
    }
    if (toparse > 0) this.ext = stream2.readUint8Array(toparse);
  }
  /** @bundle writing/avcC.js */
  write(stream2) {
    this.size = 7;
    for (let i = 0; i < this.SPS.length; i++) this.size += 2 + this.SPS[i].length;
    for (let i = 0; i < this.PPS.length; i++) this.size += 2 + this.PPS[i].length;
    if (this.ext) this.size += this.ext.length;
    this.writeHeader(stream2);
    stream2.writeUint8(this.configurationVersion);
    stream2.writeUint8(this.AVCProfileIndication);
    stream2.writeUint8(this.profile_compatibility);
    stream2.writeUint8(this.AVCLevelIndication);
    stream2.writeUint8(this.lengthSizeMinusOne + 252);
    stream2.writeUint8(this.SPS.length + 224);
    for (let i = 0; i < this.SPS.length; i++) {
      stream2.writeUint16(this.SPS[i].length);
      stream2.writeUint8Array(this.SPS[i].data);
    }
    stream2.writeUint8(this.PPS.length);
    for (let i = 0; i < this.PPS.length; i++) {
      stream2.writeUint16(this.PPS[i].length);
      stream2.writeUint8Array(this.PPS[i].data);
    }
    if (this.ext) stream2.writeUint8Array(this.ext);
  }
};
var mdatBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MediaDataBox";
  }
  static {
    this.fourcc = "mdat";
  }
};
var idatBox = class extends Box {
  constructor(..._args2) {
    super(..._args2);
    this.box_name = "ItemDataBox";
  }
  static {
    this.fourcc = "idat";
  }
};
var freeBox = class extends Box {
  constructor(..._args3) {
    super(..._args3);
    this.box_name = "FreeSpaceBox";
  }
  static {
    this.fourcc = "free";
  }
};
var skipBox = class extends Box {
  constructor(..._args4) {
    super(..._args4);
    this.box_name = "FreeSpaceBox";
  }
  static {
    this.fourcc = "skip";
  }
};
var hmhdBox = class extends FullBox {
  constructor(..._args5) {
    super(..._args5);
    this.box_name = "HintMediaHeaderBox";
  }
  static {
    this.fourcc = "hmhd";
  }
};
var nmhdBox = class extends FullBox {
  constructor(..._args6) {
    super(..._args6);
    this.box_name = "NullMediaHeaderBox";
  }
  static {
    this.fourcc = "nmhd";
  }
};
var iodsBox = class extends FullBox {
  constructor(..._args7) {
    super(..._args7);
    this.box_name = "ObjectDescriptorBox";
  }
  static {
    this.fourcc = "iods";
  }
};
var xmlBox = class extends FullBox {
  constructor(..._args8) {
    super(..._args8);
    this.box_name = "XMLBox";
  }
  static {
    this.fourcc = "xml ";
  }
};
var bxmlBox = class extends FullBox {
  constructor(..._args9) {
    super(..._args9);
    this.box_name = "BinaryXMLBox";
  }
  static {
    this.fourcc = "bxml";
  }
};
var iproBox = class extends FullBox {
  constructor(..._args10) {
    super(..._args10);
    this.box_name = "ItemProtectionBox";
    this.sinfs = [];
  }
  static {
    this.fourcc = "ipro";
  }
  get protections() {
    return this.sinfs;
  }
};
var moovBox = class extends ContainerBox {
  constructor(..._args11) {
    super(..._args11);
    this.box_name = "MovieBox";
    this.traks = [];
    this.psshs = [];
    this.subBoxNames = ["trak", "pssh"];
  }
  static {
    this.fourcc = "moov";
  }
};
var trakBox = class extends ContainerBox {
  constructor(..._args12) {
    super(..._args12);
    this.box_name = "TrackBox";
    this.samples = [];
  }
  static {
    this.fourcc = "trak";
  }
};
var edtsBox = class extends ContainerBox {
  constructor(..._args13) {
    super(..._args13);
    this.box_name = "EditBox";
  }
  static {
    this.fourcc = "edts";
  }
};
var mdiaBox = class extends ContainerBox {
  constructor(..._args14) {
    super(..._args14);
    this.box_name = "MediaBox";
  }
  static {
    this.fourcc = "mdia";
  }
};
var minfBox = class extends ContainerBox {
  constructor(..._args15) {
    super(..._args15);
    this.box_name = "MediaInformationBox";
  }
  static {
    this.fourcc = "minf";
  }
};
var dinfBox = class extends ContainerBox {
  constructor(..._args16) {
    super(..._args16);
    this.box_name = "DataInformationBox";
  }
  static {
    this.fourcc = "dinf";
  }
};
var stblBox = class extends ContainerBox {
  constructor(..._args17) {
    super(..._args17);
    this.box_name = "SampleTableBox";
    this.sgpds = [];
    this.sbgps = [];
    this.subBoxNames = ["sgpd", "sbgp"];
  }
  static {
    this.fourcc = "stbl";
  }
};
var mvexBox = class extends ContainerBox {
  constructor(..._args18) {
    super(..._args18);
    this.box_name = "MovieExtendsBox";
    this.trexs = [];
    this.subBoxNames = ["trex"];
  }
  static {
    this.fourcc = "mvex";
  }
};
var moofBox = class extends ContainerBox {
  constructor(..._args19) {
    super(..._args19);
    this.box_name = "MovieFragmentBox";
    this.trafs = [];
    this.subBoxNames = ["traf"];
  }
  static {
    this.fourcc = "moof";
  }
};
var trafBox = class extends ContainerBox {
  constructor(..._args20) {
    super(..._args20);
    this.box_name = "TrackFragmentBox";
    this.truns = [];
    this.sgpds = [];
    this.sbgps = [];
    this.subBoxNames = [
      "trun",
      "sgpd",
      "sbgp"
    ];
  }
  static {
    this.fourcc = "traf";
  }
};
var vttcBox = class extends ContainerBox {
  constructor(..._args21) {
    super(..._args21);
    this.box_name = "VTTCueBox";
  }
  static {
    this.fourcc = "vttc";
  }
};
var mfraBox = class extends ContainerBox {
  constructor(..._args22) {
    super(..._args22);
    this.box_name = "MovieFragmentRandomAccessBox";
    this.tfras = [];
    this.subBoxNames = ["tfra"];
  }
  static {
    this.fourcc = "mfra";
  }
};
var mecoBox = class extends ContainerBox {
  constructor(..._args23) {
    super(..._args23);
    this.box_name = "AdditionalMetadataContainerBox";
  }
  static {
    this.fourcc = "meco";
  }
};
var hntiBox = class extends ContainerBox {
  constructor(..._args24) {
    super(..._args24);
    this.box_name = "trackhintinformation";
    this.subBoxNames = ["sdp ", "rtp "];
  }
  static {
    this.fourcc = "hnti";
  }
};
var hinfBox = class extends ContainerBox {
  constructor(..._args25) {
    super(..._args25);
    this.box_name = "hintstatisticsbox";
    this.maxrs = [];
    this.subBoxNames = ["maxr"];
  }
  static {
    this.fourcc = "hinf";
  }
};
var strkBox = class extends ContainerBox {
  constructor(..._args26) {
    super(..._args26);
    this.box_name = "SubTrackBox";
  }
  static {
    this.fourcc = "strk";
  }
};
var strdBox = class extends ContainerBox {
  constructor(..._args27) {
    super(..._args27);
    this.box_name = "SubTrackDefinitionBox";
  }
  static {
    this.fourcc = "strd";
  }
};
var sinfBox = class extends ContainerBox {
  constructor(..._args28) {
    super(..._args28);
    this.box_name = "ProtectionSchemeInfoBox";
  }
  static {
    this.fourcc = "sinf";
  }
};
var rinfBox = class extends ContainerBox {
  constructor(..._args29) {
    super(..._args29);
    this.box_name = "RestrictedSchemeInfoBox";
  }
  static {
    this.fourcc = "rinf";
  }
};
var schiBox = class extends ContainerBox {
  constructor(..._args30) {
    super(..._args30);
    this.box_name = "SchemeInformationBox";
  }
  static {
    this.fourcc = "schi";
  }
};
var trgrBox = class extends ContainerBox {
  constructor(..._args31) {
    super(..._args31);
    this.box_name = "TrackGroupBox";
  }
  static {
    this.fourcc = "trgr";
  }
};
var udtaBox = class extends ContainerBox {
  constructor(..._args32) {
    super(..._args32);
    this.box_name = "UserDataBox";
    this.kinds = [];
    this.strks = [];
    this.subBoxNames = ["kind", "strk"];
  }
  static {
    this.fourcc = "udta";
  }
};
var iprpBox = class extends ContainerBox {
  constructor(..._args33) {
    super(..._args33);
    this.box_name = "ItemPropertiesBox";
    this.ipmas = [];
    this.subBoxNames = ["ipma"];
  }
  static {
    this.fourcc = "iprp";
  }
};
var ipcoBox = class extends ContainerBox {
  constructor(..._args34) {
    super(..._args34);
    this.box_name = "ItemPropertyContainerBox";
    this.hvcCs = [];
    this.ispes = [];
    this.claps = [];
    this.irots = [];
    this.subBoxNames = [
      "hvcC",
      "ispe",
      "clap",
      "irot"
    ];
  }
  static {
    this.fourcc = "ipco";
  }
};
var grplBox = class extends ContainerBox {
  constructor(..._args35) {
    super(..._args35);
    this.box_name = "GroupsListBox";
  }
  static {
    this.fourcc = "grpl";
  }
};
var j2kHBox = class extends ContainerBox {
  constructor(..._args36) {
    super(..._args36);
    this.box_name = "J2KHeaderInfoBox";
  }
  static {
    this.fourcc = "j2kH";
  }
};
var etypBox = class extends ContainerBox {
  constructor(..._args37) {
    super(..._args37);
    this.box_name = "ExtendedTypeBox";
    this.tycos = [];
    this.subBoxNames = ["tyco"];
  }
  static {
    this.fourcc = "etyp";
  }
};
var povdBox = class extends ContainerBox {
  constructor(..._args38) {
    super(..._args38);
    this.box_name = "ProjectedOmniVideoBox";
    this.subBoxNames = ["prfr"];
  }
  static {
    this.fourcc = "povd";
  }
};
var drefBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "DataReferenceBox";
  }
  static {
    this.fourcc = "dref";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.entries = [];
    const entry_count = stream2.readUint32();
    for (let i = 0; i < entry_count; i++) {
      const ret = parseOneBox(stream2, false, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        const box = ret.box;
        this.entries.push(box);
      } else return;
    }
  }
  /** @bundle writing/dref.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4;
    this.writeHeader(stream2);
    stream2.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].write(stream2);
      this.size += this.entries[i].size;
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream2.adjustUint32(this.sizePosition, this.size);
  }
};
var elngBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ExtendedLanguageBox";
  }
  static {
    this.fourcc = "elng";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.extended_language = stream2.readString(this.size - this.hdr_size);
  }
  /** @bundle writing/elng.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = this.extended_language.length;
    this.writeHeader(stream2);
    stream2.writeString(this.extended_language);
  }
};
var ftypBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "FileTypeBox";
  }
  static {
    this.fourcc = "ftyp";
  }
  parse(stream2) {
    let toparse = this.size - this.hdr_size;
    this.major_brand = stream2.readString(4);
    this.minor_version = stream2.readUint32();
    const minor_version_str = String.fromCharCode(this.minor_version >> 24, this.minor_version >> 16 & 255, this.minor_version >> 8 & 255, this.minor_version & 255);
    if (minor_version_str.match("[a-zA-Z0-9]{4}")) this.minor_version = minor_version_str;
    toparse -= 8;
    this.compatible_brands = [];
    let i = 0;
    while (toparse >= 4) {
      this.compatible_brands[i] = stream2.readString(4);
      toparse -= 4;
      i++;
    }
  }
  /** @bundle writing/ftyp.js */
  write(stream2) {
    this.size = 8 + 4 * this.compatible_brands.length;
    this.writeHeader(stream2);
    stream2.writeString(this.major_brand, void 0, 4);
    if (typeof this.minor_version === "number") stream2.writeUint32(this.minor_version);
    else stream2.writeString(this.minor_version, void 0, 4);
    for (let i = 0; i < this.compatible_brands.length; i++) stream2.writeString(this.compatible_brands[i], void 0, 4);
  }
};
var hdlrBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "HandlerBox";
  }
  static {
    this.fourcc = "hdlr";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 0) {
      stream2.readUint32();
      this.handler = stream2.readString(4);
      stream2.readUint32Array(3);
      if (!this.isEndOfBox(stream2)) {
        const name_size = this.start + this.size - stream2.getPosition();
        this.name = stream2.readCString();
        const end = this.start + this.size - 1;
        stream2.seek(end);
        if (stream2.readUint8() !== 0 && name_size > 1) {
          Log.info("BoxParser", "Warning: hdlr name is not null-terminated, possibly length-prefixed string. Trimming first byte.");
          this.name = this.name.slice(1);
        }
      }
    }
  }
  /** @bundle writing/hldr.js */
  write(stream2) {
    this.size = 20 + this.name.length + 1;
    this.version = 0;
    this.flags = 0;
    this.writeHeader(stream2);
    stream2.writeUint32(0);
    stream2.writeString(this.handler, void 0, 4);
    stream2.writeUint32Array([
      0,
      0,
      0
    ]);
    stream2.writeCString(this.name);
  }
};
var hvcCBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "HEVCConfigurationBox";
  }
  static {
    this.fourcc = "hvcC";
  }
  parse(stream2) {
    this.configurationVersion = stream2.readUint8();
    let tmp_byte = stream2.readUint8();
    this.general_profile_space = tmp_byte >> 6;
    this.general_tier_flag = (tmp_byte & 32) >> 5;
    this.general_profile_idc = tmp_byte & 31;
    this.general_profile_compatibility = stream2.readUint32();
    this.general_constraint_indicator = stream2.readUint8Array(6);
    this.general_level_idc = stream2.readUint8();
    this.min_spatial_segmentation_idc = stream2.readUint16() & 4095;
    this.parallelismType = stream2.readUint8() & 3;
    this.chroma_format_idc = stream2.readUint8() & 3;
    this.bit_depth_luma_minus8 = stream2.readUint8() & 7;
    this.bit_depth_chroma_minus8 = stream2.readUint8() & 7;
    this.avgFrameRate = stream2.readUint16();
    tmp_byte = stream2.readUint8();
    this.constantFrameRate = tmp_byte >> 6;
    this.numTemporalLayers = (tmp_byte & 13) >> 3;
    this.temporalIdNested = (tmp_byte & 4) >> 2;
    this.lengthSizeMinusOne = tmp_byte & 3;
    this.nalu_arrays = [];
    const numOfArrays = stream2.readUint8();
    for (let i = 0; i < numOfArrays; i++) {
      const nalu_array = [];
      this.nalu_arrays.push(nalu_array);
      tmp_byte = stream2.readUint8();
      nalu_array.completeness = (tmp_byte & 128) >> 7;
      nalu_array.nalu_type = tmp_byte & 63;
      const numNalus = stream2.readUint16();
      for (let j = 0; j < numNalus; j++) {
        const length2 = stream2.readUint16();
        nalu_array.push({ data: stream2.readUint8Array(length2) });
      }
    }
  }
  /** @bundle writing/write.js */
  write(stream2) {
    this.size = 23;
    for (let i = 0; i < this.nalu_arrays.length; i++) {
      this.size += 3;
      for (let j = 0; j < this.nalu_arrays[i].length; j++) this.size += 2 + this.nalu_arrays[i][j].data.length;
    }
    this.writeHeader(stream2);
    stream2.writeUint8(this.configurationVersion);
    stream2.writeUint8((this.general_profile_space << 6) + (this.general_tier_flag << 5) + this.general_profile_idc);
    stream2.writeUint32(this.general_profile_compatibility);
    stream2.writeUint8Array(this.general_constraint_indicator);
    stream2.writeUint8(this.general_level_idc);
    stream2.writeUint16(this.min_spatial_segmentation_idc + (15 << 24));
    stream2.writeUint8(this.parallelismType + 252);
    stream2.writeUint8(this.chroma_format_idc + 252);
    stream2.writeUint8(this.bit_depth_luma_minus8 + 248);
    stream2.writeUint8(this.bit_depth_chroma_minus8 + 248);
    stream2.writeUint16(this.avgFrameRate);
    stream2.writeUint8((this.constantFrameRate << 6) + (this.numTemporalLayers << 3) + (this.temporalIdNested << 2) + this.lengthSizeMinusOne);
    stream2.writeUint8(this.nalu_arrays.length);
    for (let i = 0; i < this.nalu_arrays.length; i++) {
      stream2.writeUint8((this.nalu_arrays[i].completeness << 7) + this.nalu_arrays[i].nalu_type);
      stream2.writeUint16(this.nalu_arrays[i].length);
      for (let j = 0; j < this.nalu_arrays[i].length; j++) {
        stream2.writeUint16(this.nalu_arrays[i][j].data.length);
        stream2.writeUint8Array(this.nalu_arrays[i][j].data);
      }
    }
  }
};
var mdhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MediaHeaderBox";
  }
  static {
    this.fourcc = "mdhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) {
      this.creation_time = stream2.readUint64();
      this.modification_time = stream2.readUint64();
      this.timescale = stream2.readUint32();
      this.duration = stream2.readUint64();
    } else {
      this.creation_time = stream2.readUint32();
      this.modification_time = stream2.readUint32();
      this.timescale = stream2.readUint32();
      this.duration = stream2.readUint32();
    }
    this.parseLanguage(stream2);
    stream2.readUint16();
  }
  /** @bundle writing/mdhd.js */
  write(stream2) {
    const useVersion1 = this.modification_time > MAX_UINT32 || this.creation_time > MAX_UINT32 || this.duration > MAX_UINT32 || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 20;
    this.size += useVersion1 ? 12 : 0;
    this.flags = 0;
    this.writeHeader(stream2);
    if (useVersion1) {
      stream2.writeUint64(this.creation_time);
      stream2.writeUint64(this.modification_time);
      stream2.writeUint32(this.timescale);
      stream2.writeUint64(this.duration);
    } else {
      stream2.writeUint32(this.creation_time);
      stream2.writeUint32(this.modification_time);
      stream2.writeUint32(this.timescale);
      stream2.writeUint32(this.duration);
    }
    stream2.writeUint16(this.language);
    stream2.writeUint16(0);
  }
};
var mehdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MovieExtendsHeaderBox";
  }
  static {
    this.fourcc = "mehd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.flags & 1) {
      Log.warn("BoxParser", "mehd box incorrectly uses flags set to 1, converting version to 1");
      this.version = 1;
    }
    if (this.version === 1) this.fragment_duration = stream2.readUint64();
    else this.fragment_duration = stream2.readUint32();
  }
  /** @bundle writing/mehd.js */
  write(stream2) {
    const useVersion1 = this.fragment_duration > MAX_UINT32 || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4;
    this.size += useVersion1 ? 4 : 0;
    this.flags = 0;
    this.writeHeader(stream2);
    if (useVersion1) stream2.writeUint64(this.fragment_duration);
    else stream2.writeUint32(this.fragment_duration);
  }
};
var infeBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ItemInfoEntry";
  }
  static {
    this.fourcc = "infe";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 0 || this.version === 1) {
      this.item_ID = stream2.readUint16();
      this.item_protection_index = stream2.readUint16();
      this.item_name = stream2.readCString();
      this.content_type = stream2.readCString();
      if (!this.isEndOfBox(stream2)) this.content_encoding = stream2.readCString();
    }
    if (this.version === 1) {
      this.extension_type = stream2.readString(4);
      Log.warn("BoxParser", "Cannot parse extension type");
      stream2.seek(this.start + this.size);
      return;
    }
    if (this.version >= 2) {
      if (this.version === 2) this.item_ID = stream2.readUint16();
      else if (this.version === 3) this.item_ID = stream2.readUint32();
      this.item_protection_index = stream2.readUint16();
      this.item_type = stream2.readString(4);
      this.item_name = stream2.readCString();
      if (this.item_type === "mime") {
        this.content_type = stream2.readCString();
        this.content_encoding = stream2.readCString();
      } else if (this.item_type === "uri ") this.item_uri_type = stream2.readCString();
    }
  }
};
var iinfBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ItemInfoBox";
  }
  static {
    this.fourcc = "iinf";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 0) this.entry_count = stream2.readUint16();
    else this.entry_count = stream2.readUint32();
    this.item_infos = [];
    for (let i = 0; i < this.entry_count; i++) {
      const ret = parseOneBox(stream2, false, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        const box = ret.box;
        if (box.type === "infe") this.item_infos[i] = box;
        else Log.error("BoxParser", "Expected 'infe' box, got " + ret.box.type, stream2.isofile);
      } else return;
    }
  }
};
var ilocBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ItemLocationBox";
  }
  static {
    this.fourcc = "iloc";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    let byte;
    byte = stream2.readUint8();
    this.offset_size = byte >> 4 & 15;
    this.length_size = byte & 15;
    byte = stream2.readUint8();
    this.base_offset_size = byte >> 4 & 15;
    if (this.version === 1 || this.version === 2) this.index_size = byte & 15;
    else this.index_size = 0;
    this.items = [];
    let item_count = 0;
    if (this.version < 2) item_count = stream2.readUint16();
    else if (this.version === 2) item_count = stream2.readUint32();
    else throw new Error("version of iloc box not supported");
    for (let i = 0; i < item_count; i++) {
      let item_ID = 0;
      let construction_method = 0;
      let base_offset = 0;
      if (this.version < 2) item_ID = stream2.readUint16();
      else if (this.version === 2) item_ID = stream2.readUint32();
      else throw new Error("version of iloc box not supported");
      if (this.version === 1 || this.version === 2) construction_method = stream2.readUint16() & 15;
      else construction_method = 0;
      const data_reference_index = stream2.readUint16();
      switch (this.base_offset_size) {
        case 0:
          base_offset = 0;
          break;
        case 4:
          base_offset = stream2.readUint32();
          break;
        case 8:
          base_offset = stream2.readUint64();
          break;
        default:
          throw new Error("Error reading base offset size");
      }
      const extents = [];
      const extent_count = stream2.readUint16();
      for (let j = 0; j < extent_count; j++) {
        let extent_index = 0;
        let extent_offset = 0;
        let extent_length = 0;
        if (this.version === 1 || this.version === 2) switch (this.index_size) {
          case 0:
            extent_index = 0;
            break;
          case 4:
            extent_index = stream2.readUint32();
            break;
          case 8:
            extent_index = stream2.readUint64();
            break;
          default:
            throw new Error("Error reading extent index");
        }
        switch (this.offset_size) {
          case 0:
            extent_offset = 0;
            break;
          case 4:
            extent_offset = stream2.readUint32();
            break;
          case 8:
            extent_offset = stream2.readUint64();
            break;
          default:
            throw new Error("Error reading extent index");
        }
        switch (this.length_size) {
          case 0:
            extent_length = 0;
            break;
          case 4:
            extent_length = stream2.readUint32();
            break;
          case 8:
            extent_length = stream2.readUint64();
            break;
          default:
            throw new Error("Error reading extent index");
        }
        extents.push({
          extent_index,
          extent_length,
          extent_offset
        });
      }
      this.items.push({
        base_offset,
        construction_method,
        item_ID,
        data_reference_index,
        extents
      });
    }
  }
};
var REFERENCE_TYPE_NAMES = {
  auxl: "Auxiliary image item",
  base: "Pre-derived image item base",
  cdsc: "Item describes referenced item",
  dimg: "Derived image item",
  dpnd: "Item coding dependency",
  eroi: "Region",
  evir: "EVC slice",
  exbl: "Scalable image item",
  "fdl ": "File delivery",
  font: "Font item",
  iloc: "Item data location",
  mask: "Region mask",
  mint: "Data integrity",
  pred: "Predictively coded item",
  prem: "Pre-multiplied item",
  tbas: "HEVC tile track base item",
  text: "Text item",
  thmb: "Thumbnail image item"
};
var irefBox = class irefBox2 extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ItemReferenceBox";
    this.references = [];
  }
  static {
    this.fourcc = "iref";
  }
  static {
    this.allowed_types = [
      "auxl",
      "base",
      "cdsc",
      "dimg",
      "dpnd",
      "eroi",
      "evir",
      "exbl",
      "fdl ",
      "font",
      "iloc",
      "mask",
      "mint",
      "pred",
      "prem",
      "tbas",
      "text",
      "thmb"
    ];
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.references = [];
    while (stream2.getPosition() < this.start + this.size) {
      const ret = parseOneBox(stream2, true, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        let name2 = "Unknown item reference";
        if (!irefBox2.allowed_types.includes(ret.type)) Log.warn("BoxParser", `Unknown item reference type: '${ret.type}'`);
        else name2 = REFERENCE_TYPE_NAMES[ret.type];
        const box = this.version === 0 ? new SingleItemTypeReferenceBox(ret.type, ret.size, name2, ret.hdr_size, ret.start) : new SingleItemTypeReferenceBoxLarge(ret.type, ret.size, name2, ret.hdr_size, ret.start);
        if (box.write === Box.prototype.write && box.type !== "mdat") {
          Log.warn("BoxParser", box.type + " box writing not yet implemented, keeping unparsed data in memory for later write");
          box.parseDataAndRewind(stream2);
        }
        box.parse(stream2);
        this.references.push(box);
      } else return;
    }
  }
};
var pitmBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "PrimaryItemBox";
  }
  static {
    this.fourcc = "pitm";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 0) this.item_id = stream2.readUint16();
    else this.item_id = stream2.readUint32();
  }
};
var metaBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MetaBox";
    this.isQT = false;
  }
  static {
    this.fourcc = "meta";
  }
  parse(stream2) {
    const pos = stream2.getPosition();
    if (this.size > 8) {
      stream2.readUint32();
      switch (stream2.readString(4)) {
        case "hdlr":
        case "mhdr":
        case "keys":
        case "ilst":
        case "ctry":
        case "lang":
          this.isQT = true;
          break;
        default:
          break;
      }
      stream2.seek(pos);
    }
    if (!this.isQT) this.parseFullHeader(stream2);
    ContainerBox.prototype.parse.call(this, stream2);
  }
};
var mfhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MovieFragmentHeaderBox";
  }
  static {
    this.fourcc = "mfhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.sequence_number = stream2.readUint32();
  }
  /** @bundle writing/mfhd.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4;
    this.writeHeader(stream2);
    stream2.writeUint32(this.sequence_number);
  }
};
var mvhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MovieHeaderBox";
  }
  static {
    this.fourcc = "mvhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) {
      this.creation_time = stream2.readUint64();
      this.modification_time = stream2.readUint64();
      this.timescale = stream2.readUint32();
      this.duration = stream2.readUint64();
    } else {
      this.creation_time = stream2.readUint32();
      this.modification_time = stream2.readUint32();
      this.timescale = stream2.readUint32();
      this.duration = stream2.readUint32();
    }
    this.rate = stream2.readUint32();
    this.volume = stream2.readUint16() >> 8;
    stream2.readUint16();
    stream2.readUint32Array(2);
    this.matrix = stream2.readInt32Array(9);
    stream2.readUint32Array(6);
    this.next_track_id = stream2.readUint32();
  }
  /** @bundle writing/mvhd.js */
  write(stream2) {
    const useVersion1 = this.modification_time > MAX_UINT32 || this.creation_time > MAX_UINT32 || this.duration > MAX_UINT32 || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 96;
    this.size += useVersion1 ? 12 : 0;
    this.flags = 0;
    this.writeHeader(stream2);
    if (useVersion1) {
      stream2.writeUint64(this.creation_time);
      stream2.writeUint64(this.modification_time);
      stream2.writeUint32(this.timescale);
      stream2.writeUint64(this.duration);
    } else {
      stream2.writeUint32(this.creation_time);
      stream2.writeUint32(this.modification_time);
      stream2.writeUint32(this.timescale);
      stream2.writeUint32(this.duration);
    }
    stream2.writeUint32(this.rate);
    stream2.writeUint16(this.volume << 8);
    stream2.writeUint16(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeInt32Array(this.matrix);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint32(0);
    stream2.writeUint32(this.next_track_id);
  }
  /** @bundle box-print.js */
  print(output) {
    super.printHeader(output);
    output.log(output.indent + "creation_time: " + this.creation_time);
    output.log(output.indent + "modification_time: " + this.modification_time);
    output.log(output.indent + "timescale: " + this.timescale);
    output.log(output.indent + "duration: " + this.duration);
    output.log(output.indent + "rate: " + this.rate);
    output.log(output.indent + "volume: " + (this.volume >> 8));
    output.log(output.indent + "matrix: " + this.matrix.join(", "));
    output.log(output.indent + "next_track_id: " + this.next_track_id);
  }
};
var mettSampleEntry = class extends MetadataSampleEntry {
  static {
    this.fourcc = "mett";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.content_encoding = stream2.readCString();
    this.mime_format = stream2.readCString();
    this.parseFooter(stream2);
  }
};
var metxSampleEntry = class extends MetadataSampleEntry {
  static {
    this.fourcc = "metx";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.content_encoding = stream2.readCString();
    this.namespace = stream2.readCString();
    this.schema_location = stream2.readCString();
    this.parseFooter(stream2);
  }
};
var av1CBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "AV1CodecConfigurationBox";
  }
  static {
    this.fourcc = "av1C";
  }
  parse(stream2) {
    let tmp = stream2.readUint8();
    if ((tmp >> 7 & 1) !== 1) {
      Log.error("BoxParser", "av1C marker problem", stream2.isofile);
      return;
    }
    this.version = tmp & 127;
    if (this.version !== 1) {
      Log.error("BoxParser", "av1C version " + this.version + " not supported", stream2.isofile);
      return;
    }
    tmp = stream2.readUint8();
    this.seq_profile = tmp >> 5 & 7;
    this.seq_level_idx_0 = tmp & 31;
    tmp = stream2.readUint8();
    this.seq_tier_0 = tmp >> 7 & 1;
    this.high_bitdepth = tmp >> 6 & 1;
    this.twelve_bit = tmp >> 5 & 1;
    this.monochrome = tmp >> 4 & 1;
    this.chroma_subsampling_x = tmp >> 3 & 1;
    this.chroma_subsampling_y = tmp >> 2 & 1;
    this.chroma_sample_position = tmp & 3;
    tmp = stream2.readUint8();
    this.reserved_1 = tmp >> 5 & 7;
    if (this.reserved_1 !== 0) {
      Log.error("BoxParser", "av1C reserved_1 parsing problem", stream2.isofile);
      return;
    }
    this.initial_presentation_delay_present = tmp >> 4 & 1;
    if (this.initial_presentation_delay_present === 1) this.initial_presentation_delay_minus_one = tmp & 15;
    else {
      this.reserved_2 = tmp & 15;
      if (this.reserved_2 !== 0) {
        Log.error("BoxParser", "av1C reserved_2 parsing problem", stream2.isofile);
        return;
      }
    }
    const configOBUs_length = this.size - this.hdr_size - 4;
    this.configOBUs = stream2.readUint8Array(configOBUs_length);
  }
};
var esdsBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ElementaryStreamDescriptorBox";
  }
  static {
    this.fourcc = "esds";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const esd_data = stream2.readUint8Array(this.size - this.hdr_size);
    if ("MPEG4DescriptorParser" in DescriptorRegistry) {
      const esd_parser = new DescriptorRegistry.MPEG4DescriptorParser();
      this.esd = esd_parser.parseOneDescriptor(new DataStream(esd_data.buffer, 0));
    }
  }
};
var waveBox = class extends ContainerBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "siDecompressionParamBox";
  }
  static {
    this.fourcc = "wave";
  }
};
var lvcCBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "LCEVCConfigurationBox";
  }
  static {
    this.fourcc = "lvcC";
  }
  parse(stream2) {
    this.configurationVersion = stream2.readUint8();
    if (this.configurationVersion !== 1) {
      Log.error("BoxParser", "lvcC version " + this.configurationVersion + " not supported", stream2.isofile);
      return;
    }
    this.LCEVCProfileIndication = stream2.readUint8();
    this.LCEVCLevelIndication = stream2.readUint8();
    let tmp_byte = stream2.readUint8();
    this.chroma_format_idc = tmp_byte >> 6 & 3;
    this.bit_depth_luma_minus8 = tmp_byte >> 3 & 7;
    this.bit_depth_chroma_minus8 = tmp_byte & 7;
    tmp_byte = stream2.readUint8();
    this.lengthSizeMinusOne = tmp_byte >> 6 & 3;
    let reserved2 = tmp_byte & 63;
    if (reserved2 !== 63) {
      Log.error("BoxParser", "lvcC reserved parsing problem", stream2.isofile);
      return;
    }
    this.pic_width_in_luma_samples = stream2.readUint32();
    this.pic_height_in_luma_samples = stream2.readUint32();
    tmp_byte = stream2.readUint8();
    this.sc_in_stream = tmp_byte >> 7 & 1;
    this.gc_in_stream = tmp_byte >> 6 & 1;
    this.ai_in_stream = tmp_byte >> 5 & 1;
    reserved2 = tmp_byte & 31;
    if (reserved2 !== 31) {
      Log.error("BoxParser", "lvcC reserved parsing problem", stream2.isofile);
      return;
    }
    this.nalu_arrays = [];
    const numOfArrays = stream2.readUint8();
    for (let i = 0; i < numOfArrays; i++) {
      const nalu_array = [];
      this.nalu_arrays.push(nalu_array);
      tmp_byte = stream2.readUint8();
      reserved2 = tmp_byte >> 6 & 3;
      if (reserved2 !== 0) {
        Log.error("BoxParser", "lvcC reserved parsing problem", stream2.isofile);
        return;
      }
      nalu_array.nalu_type = tmp_byte & 63;
      const numOfNalus = stream2.readUint16();
      for (let j = 0; j < numOfNalus; j++) {
        const length2 = stream2.readUint16();
        nalu_array.push({ data: stream2.readUint8Array(length2) });
      }
    }
  }
};
var vpcCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "VPCodecConfigurationRecord";
  }
  static {
    this.fourcc = "vpcC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) {
      this.profile = stream2.readUint8();
      this.level = stream2.readUint8();
      const tmp = stream2.readUint8();
      this.bitDepth = tmp >> 4;
      this.chromaSubsampling = tmp >> 1 & 7;
      this.videoFullRangeFlag = tmp & 1;
      this.colourPrimaries = stream2.readUint8();
      this.transferCharacteristics = stream2.readUint8();
      this.matrixCoefficients = stream2.readUint8();
      this.codecIntializationDataSize = stream2.readUint16();
      this.codecIntializationData = stream2.readUint8Array(this.codecIntializationDataSize);
    } else {
      this.profile = stream2.readUint8();
      this.level = stream2.readUint8();
      let tmp = stream2.readUint8();
      this.bitDepth = tmp >> 4 & 15;
      this.colorSpace = tmp & 15;
      tmp = stream2.readUint8();
      this.chromaSubsampling = tmp >> 4 & 15;
      this.transferFunction = tmp >> 1 & 7;
      this.videoFullRangeFlag = tmp & 1;
      this.codecIntializationDataSize = stream2.readUint16();
      this.codecIntializationData = stream2.readUint8Array(this.codecIntializationDataSize);
    }
  }
};
var vvcCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "VvcConfigurationBox";
  }
  static {
    this.fourcc = "vvcC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const bitReader = {
      held_bits: void 0,
      num_held_bits: 0,
      stream_read_1_bytes: function(strm) {
        this.held_bits = strm.readUint8();
        this.num_held_bits = 8;
      },
      stream_read_2_bytes: function(strm) {
        this.held_bits = strm.readUint16();
        this.num_held_bits = 16;
      },
      extract_bits: function(num_bits) {
        const ret = this.held_bits >> this.num_held_bits - num_bits & (1 << num_bits) - 1;
        this.num_held_bits -= num_bits;
        return ret;
      }
    };
    bitReader.stream_read_1_bytes(stream2);
    bitReader.extract_bits(5);
    this.lengthSizeMinusOne = bitReader.extract_bits(2);
    this.ptl_present_flag = bitReader.extract_bits(1);
    if (this.ptl_present_flag) {
      bitReader.stream_read_2_bytes(stream2);
      this.ols_idx = bitReader.extract_bits(9);
      this.num_sublayers = bitReader.extract_bits(3);
      this.constant_frame_rate = bitReader.extract_bits(2);
      this.chroma_format_idc = bitReader.extract_bits(2);
      bitReader.stream_read_1_bytes(stream2);
      this.bit_depth_minus8 = bitReader.extract_bits(3);
      bitReader.extract_bits(5);
      bitReader.stream_read_2_bytes(stream2);
      bitReader.extract_bits(2);
      this.num_bytes_constraint_info = bitReader.extract_bits(6);
      this.general_profile_idc = bitReader.extract_bits(7);
      this.general_tier_flag = bitReader.extract_bits(1);
      this.general_level_idc = stream2.readUint8();
      bitReader.stream_read_1_bytes(stream2);
      this.ptl_frame_only_constraint_flag = bitReader.extract_bits(1);
      this.ptl_multilayer_enabled_flag = bitReader.extract_bits(1);
      this.general_constraint_info = new Uint8Array(this.num_bytes_constraint_info);
      if (this.num_bytes_constraint_info) {
        for (let i = 0; i < this.num_bytes_constraint_info - 1; i++) {
          const cnstr1 = bitReader.extract_bits(6);
          bitReader.stream_read_1_bytes(stream2);
          const cnstr2 = bitReader.extract_bits(2);
          this.general_constraint_info[i] = cnstr1 << 2 | cnstr2;
        }
        this.general_constraint_info[this.num_bytes_constraint_info - 1] = bitReader.extract_bits(6);
      } else bitReader.extract_bits(6);
      if (this.num_sublayers > 1) {
        bitReader.stream_read_1_bytes(stream2);
        this.ptl_sublayer_present_mask = 0;
        for (let j = this.num_sublayers - 2; j >= 0; --j) {
          const val = bitReader.extract_bits(1);
          this.ptl_sublayer_present_mask |= val << j;
        }
        for (let j = this.num_sublayers; j <= 8 && this.num_sublayers > 1; ++j) bitReader.extract_bits(1);
        this.sublayer_level_idc = [];
        for (let j = this.num_sublayers - 2; j >= 0; --j) if (this.ptl_sublayer_present_mask & 1 << j) this.sublayer_level_idc[j] = stream2.readUint8();
      }
      this.ptl_num_sub_profiles = stream2.readUint8();
      this.general_sub_profile_idc = [];
      if (this.ptl_num_sub_profiles) for (let i = 0; i < this.ptl_num_sub_profiles; i++) this.general_sub_profile_idc.push(stream2.readUint32());
      this.max_picture_width = stream2.readUint16();
      this.max_picture_height = stream2.readUint16();
      this.avg_frame_rate = stream2.readUint16();
    }
    const VVC_NALU_OPI = 12;
    const VVC_NALU_DEC_PARAM = 13;
    this.nalu_arrays = [];
    const num_of_arrays = stream2.readUint8();
    for (let i = 0; i < num_of_arrays; i++) {
      const nalu_array = [];
      this.nalu_arrays.push(nalu_array);
      bitReader.stream_read_1_bytes(stream2);
      nalu_array.completeness = bitReader.extract_bits(1);
      bitReader.extract_bits(2);
      nalu_array.nalu_type = bitReader.extract_bits(5);
      let numNalus = 1;
      if (nalu_array.nalu_type !== VVC_NALU_DEC_PARAM && nalu_array.nalu_type !== VVC_NALU_OPI) numNalus = stream2.readUint16();
      for (let j = 0; j < numNalus; j++) {
        const len = stream2.readUint16();
        nalu_array.push({
          data: stream2.readUint8Array(len),
          length: len
        });
      }
    }
  }
};
var colrBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ColourInformationBox";
  }
  static {
    this.fourcc = "colr";
  }
  parse(stream2) {
    this.colour_type = stream2.readString(4);
    if (this.colour_type === "nclx") {
      this.colour_primaries = stream2.readUint16();
      this.transfer_characteristics = stream2.readUint16();
      this.matrix_coefficients = stream2.readUint16();
      const tmp = stream2.readUint8();
      this.full_range_flag = tmp >> 7;
    } else if (this.colour_type === "rICC") this.ICC_profile = stream2.readUint8Array(this.size - 4);
    else if (this.colour_type === "prof") this.ICC_profile = stream2.readUint8Array(this.size - 4);
  }
};
function decimalToHex(d, padding) {
  let hex = Number(d).toString(16);
  padding = typeof padding === "undefined" ? 2 : padding;
  while (hex.length < padding) hex = "0" + hex;
  return hex;
}
var avcCSampleEntryBase = class extends VisualSampleEntry {
  /** @bundle box-codecs.js */
  getCodec() {
    const baseCodec = super.getCodec();
    if (this.avcC) return `${baseCodec}.${decimalToHex(this.avcC.AVCProfileIndication)}${decimalToHex(this.avcC.profile_compatibility)}${decimalToHex(this.avcC.AVCLevelIndication)}`;
    else return baseCodec;
  }
};
var avc1SampleEntry = class extends avcCSampleEntryBase {
  constructor(..._args) {
    super(..._args);
    this.box_name = "AVCSampleEntry";
  }
  static {
    this.fourcc = "avc1";
  }
};
var avc2SampleEntry = class extends avcCSampleEntryBase {
  constructor(..._args2) {
    super(..._args2);
    this.box_name = "AVC2SampleEntry";
  }
  static {
    this.fourcc = "avc2";
  }
};
var avc3SampleEntry = class extends avcCSampleEntryBase {
  constructor(..._args3) {
    super(..._args3);
    this.box_name = "AVCSampleEntry";
  }
  static {
    this.fourcc = "avc3";
  }
};
var avc4SampleEntry = class extends avcCSampleEntryBase {
  constructor(..._args4) {
    super(..._args4);
    this.box_name = "AVC2SampleEntry";
  }
  static {
    this.fourcc = "avc4";
  }
};
var av01SampleEntry = class extends VisualSampleEntry {
  constructor(..._args5) {
    super(..._args5);
    this.box_name = "AV1SampleEntry";
  }
  static {
    this.fourcc = "av01";
  }
  /** @bundle box-codecs.js */
  getCodec() {
    const baseCodec = super.getCodec();
    const level_idx_0 = this.av1C.seq_level_idx_0;
    const level = level_idx_0 < 10 ? "0" + level_idx_0 : level_idx_0;
    let bitdepth;
    if (this.av1C.seq_profile === 2 && this.av1C.high_bitdepth === 1) bitdepth = this.av1C.twelve_bit === 1 ? "12" : "10";
    else if (this.av1C.seq_profile <= 2) bitdepth = this.av1C.high_bitdepth === 1 ? "10" : "08";
    return baseCodec + "." + this.av1C.seq_profile + "." + level + (this.av1C.seq_tier_0 ? "H" : "M") + "." + bitdepth;
  }
};
var dav1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "dav1";
  }
};
var hvcCSampleEntryBase = class extends VisualSampleEntry {
  /** @bundle box-codecs.js */
  getCodec() {
    let baseCodec = super.getCodec();
    if (this.hvcC) {
      baseCodec += ".";
      switch (this.hvcC.general_profile_space) {
        case 0:
          baseCodec += "";
          break;
        case 1:
          baseCodec += "A";
          break;
        case 2:
          baseCodec += "B";
          break;
        case 3:
          baseCodec += "C";
          break;
      }
      baseCodec += this.hvcC.general_profile_idc;
      baseCodec += ".";
      let val = this.hvcC.general_profile_compatibility;
      let reversed = 0;
      for (let i = 0; i < 32; i++) {
        reversed |= val & 1;
        if (i === 31) break;
        reversed <<= 1;
        val >>= 1;
      }
      baseCodec += decimalToHex(reversed, 0);
      baseCodec += ".";
      if (this.hvcC.general_tier_flag === 0) baseCodec += "L";
      else baseCodec += "H";
      baseCodec += this.hvcC.general_level_idc;
      let hasByte = false;
      let constraint_string = "";
      for (let i = 5; i >= 0; i--) if (this.hvcC.general_constraint_indicator[i] || hasByte) {
        constraint_string = "." + decimalToHex(this.hvcC.general_constraint_indicator[i], 0) + constraint_string;
        hasByte = true;
      }
      baseCodec += constraint_string;
    }
    return baseCodec;
  }
};
var hvc1SampleEntry = class extends hvcCSampleEntryBase {
  constructor(..._args6) {
    super(..._args6);
    this.box_name = "HEVCSampleEntry";
  }
  static {
    this.fourcc = "hvc1";
  }
};
var hvc2SampleEntry = class extends hvcCSampleEntryBase {
  static {
    this.fourcc = "hvc2";
  }
};
var hev1SampleEntry = class extends hvcCSampleEntryBase {
  constructor(..._args7) {
    super(..._args7);
    this.box_name = "HEVCSampleEntry";
    this.colrs = [];
    this.subBoxNames = ["colr"];
  }
  static {
    this.fourcc = "hev1";
  }
};
var hev2SampleEntry = class extends hvcCSampleEntryBase {
  static {
    this.fourcc = "hev2";
  }
};
var hvt1SampleEntry = class extends VisualSampleEntry {
  constructor(..._args8) {
    super(..._args8);
    this.box_name = "HEVCTileSampleSampleEntry";
  }
  static {
    this.fourcc = "hvt1";
  }
};
var lhe1SampleEntry = class extends VisualSampleEntry {
  constructor(..._args9) {
    super(..._args9);
    this.box_name = "LHEVCSampleEntry";
  }
  static {
    this.fourcc = "lhe1";
  }
};
var lhv1SampleEntry = class extends VisualSampleEntry {
  constructor(..._args10) {
    super(..._args10);
    this.box_name = "LHEVCSampleEntry";
  }
  static {
    this.fourcc = "lhv1";
  }
};
var lvc1SampleEntry = class extends VisualSampleEntry {
  constructor(..._args11) {
    super(..._args11);
    this.box_name = "LCEVCSampleEntry";
  }
  static {
    this.fourcc = "lvc1";
  }
  /** @bundle box-codecs.js */
  getCodec() {
    let baseCodec = super.getCodec();
    if (this.lvcC) {
      baseCodec += ".";
      baseCodec += "vprf";
      baseCodec += this.lvcC.LCEVCProfileIndication;
      baseCodec += ".";
      baseCodec += "vlev";
      baseCodec += this.lvcC.LCEVCLevelIndication;
    }
    return baseCodec;
  }
};
var dvh1SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "dvh1";
  }
};
var dvheSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "dvhe";
  }
};
var vvcCSampleEntryBase = class extends VisualSampleEntry {
  getCodec() {
    let baseCodec = super.getCodec();
    if (this.vvcC) {
      baseCodec += "." + this.vvcC.general_profile_idc;
      if (this.vvcC.general_tier_flag) baseCodec += ".H";
      else baseCodec += ".L";
      baseCodec += this.vvcC.general_level_idc;
      let constraint_string = "";
      if (this.vvcC.general_constraint_info) {
        const bytes = [];
        let byte = 0;
        byte |= this.vvcC.ptl_frame_only_constraint_flag << 7;
        byte |= this.vvcC.ptl_multilayer_enabled_flag << 6;
        let last_nonzero;
        for (let i = 0; i < this.vvcC.general_constraint_info.length; ++i) {
          byte |= this.vvcC.general_constraint_info[i] >> 2 & 63;
          bytes.push(byte);
          if (byte) last_nonzero = i;
          byte = this.vvcC.general_constraint_info[i] >> 2 & 3;
        }
        if (last_nonzero === void 0) constraint_string = ".CA";
        else {
          constraint_string = ".C";
          const base32_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          let held_bits = 0;
          let num_held_bits = 0;
          for (let i = 0; i <= last_nonzero; ++i) {
            held_bits = held_bits << 8 | bytes[i];
            num_held_bits += 8;
            while (num_held_bits >= 5) {
              const val = held_bits >> num_held_bits - 5 & 31;
              constraint_string += base32_chars[val];
              num_held_bits -= 5;
              held_bits &= (1 << num_held_bits) - 1;
            }
          }
          if (num_held_bits) {
            held_bits <<= 5 - num_held_bits;
            constraint_string += base32_chars[held_bits & 31];
          }
        }
      }
      baseCodec += constraint_string;
    }
    return baseCodec;
  }
};
var vvc1SampleEntry = class extends vvcCSampleEntryBase {
  constructor(..._args12) {
    super(..._args12);
    this.box_name = "VvcSampleEntry";
  }
  static {
    this.fourcc = "vvc1";
  }
};
var vvi1SampleEntry = class extends vvcCSampleEntryBase {
  constructor(..._args13) {
    super(..._args13);
    this.box_name = "VvcSampleEntry";
  }
  static {
    this.fourcc = "vvi1";
  }
};
var vvs1SampleEntry = class extends VisualSampleEntry {
  constructor(..._args14) {
    super(..._args14);
    this.box_name = "VvcSampleEntry";
  }
  static {
    this.fourcc = "vvs1";
  }
};
var vvcNSampleEntry = class extends VisualSampleEntry {
  constructor(..._args15) {
    super(..._args15);
    this.box_name = "VvcNonVCLSampleEntry";
  }
  static {
    this.fourcc = "vvcN";
  }
};
var vpcCSampleEntryBase = class extends VisualSampleEntry {
  getCodec() {
    const baseCodec = super.getCodec();
    let level = this.vpcC.level;
    if (level === 0) level = "00";
    let bitDepth2 = this.vpcC.bitDepth;
    if (bitDepth2 === 8) bitDepth2 = "08";
    return `${baseCodec}.0${this.vpcC.profile}.${level}.${bitDepth2}`;
  }
};
var vp08SampleEntry = class extends vpcCSampleEntryBase {
  static {
    this.fourcc = "vp08";
  }
};
var vp09SampleEntry = class extends vpcCSampleEntryBase {
  static {
    this.fourcc = "vp09";
  }
};
var avs3SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "avs3";
  }
};
var j2kiSampleEntry = class extends VisualSampleEntry {
  constructor(..._args16) {
    super(..._args16);
    this.box_name = "J2KSampleEntry";
  }
  static {
    this.fourcc = "j2ki";
  }
};
var mjp2SampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "mjp2";
  }
};
var mjpgSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "mjpg";
  }
};
var uncvSampleEntry = class extends VisualSampleEntry {
  constructor(..._args17) {
    super(..._args17);
    this.box_name = "UncompressedVideoSampleEntry";
  }
  static {
    this.fourcc = "uncv";
  }
};
var mp4vSampleEntry = class extends VisualSampleEntry {
  constructor(..._args18) {
    super(..._args18);
    this.box_name = "MP4VisualSampleEntry";
  }
  static {
    this.fourcc = "mp4v";
  }
};
var mp4aSampleEntry = class extends AudioSampleEntry {
  constructor(..._args19) {
    super(..._args19);
    this.box_name = "MP4AudioSampleEntry";
  }
  static {
    this.fourcc = "mp4a";
  }
  getCodec() {
    const baseCodec = super.getCodec();
    const esds = this.esds ?? this.wave?.esds;
    if (esds && esds.esd) {
      const oti = esds.esd.getOTI();
      const dsi = esds.esd.getAudioConfig();
      return baseCodec + "." + decimalToHex(oti) + (dsi ? "." + dsi : "");
    } else return baseCodec;
  }
};
var m4aeSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "m4ae";
  }
};
var ac_3SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "ac-3";
  }
};
var ac_4SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "ac-4";
  }
};
var ec_3SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "ec-3";
  }
};
var OpusSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "Opus";
  }
};
var mha1SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mha1";
  }
};
var mha2SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mha2";
  }
};
var mhm1SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mhm1";
  }
};
var mhm2SampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "mhm2";
  }
};
var fLaCSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "fLaC";
  }
};
var encvSampleEntry = class extends VisualSampleEntry {
  static {
    this.fourcc = "encv";
  }
};
var encaSampleEntry = class extends AudioSampleEntry {
  static {
    this.fourcc = "enca";
  }
};
var encuSampleEntry = class extends SubtitleSampleEntry {
  constructor(..._args20) {
    super(..._args20);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "encu";
  }
};
var encsSampleEntry = class extends SystemSampleEntry {
  constructor(..._args21) {
    super(..._args21);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "encs";
  }
};
var mp4sSampleEntry = class extends SystemSampleEntry {
  static {
    this.fourcc = "mp4s";
  }
};
var enctSampleEntry = class extends TextSampleEntry {
  constructor(..._args22) {
    super(..._args22);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "enct";
  }
};
var encmSampleEntry = class extends MetadataSampleEntry {
  constructor(..._args23) {
    super(..._args23);
    this.subBoxNames = ["sinf"];
    this.sinfs = [];
  }
  static {
    this.fourcc = "encm";
  }
};
var resvSampleEntry = class extends VisualSampleEntry {
  constructor(..._args24) {
    super(..._args24);
    this.box_name = "RestrictedVideoSampleEntry";
  }
  static {
    this.fourcc = "resv";
  }
};
var sbttSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "sbtt";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.content_encoding = stream2.readCString();
    this.mime_format = stream2.readCString();
    this.parseFooter(stream2);
  }
};
var stppSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "stpp";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.namespace = stream2.readCString();
    this.schema_location = stream2.readCString();
    this.auxiliary_mime_types = stream2.readCString();
    this.parseFooter(stream2);
  }
  /** @bundle writing/sampleentry.js */
  write(stream2) {
    this.writeHeader(stream2);
    this.size += this.namespace.length + 1 + this.schema_location.length + 1 + this.auxiliary_mime_types.length + 1;
    stream2.writeCString(this.namespace);
    stream2.writeCString(this.schema_location);
    stream2.writeCString(this.auxiliary_mime_types);
    this.writeFooter(stream2);
  }
};
var stxtSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "stxt";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.content_encoding = stream2.readCString();
    this.mime_format = stream2.readCString();
    this.parseFooter(stream2);
  }
  getCodec() {
    const baseCodec = super.getCodec();
    if (this.mime_format) return baseCodec + "." + this.mime_format;
    else return baseCodec;
  }
};
var tx3gSampleEntry = class extends SubtitleSampleEntry {
  static {
    this.fourcc = "tx3g";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.displayFlags = stream2.readUint32();
    this.horizontal_justification = stream2.readInt8();
    this.vertical_justification = stream2.readInt8();
    this.bg_color_rgba = stream2.readUint8Array(4);
    this.box_record = stream2.readInt16Array(4);
    this.style_record = stream2.readUint8Array(12);
    this.parseFooter(stream2);
  }
};
var wvttSampleEntry = class extends MetadataSampleEntry {
  static {
    this.fourcc = "wvtt";
  }
  parse(stream2) {
    this.parseHeader(stream2);
    this.parseFooter(stream2);
  }
};
var sbgpBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleToGroupBox";
  }
  static {
    this.fourcc = "sbgp";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.grouping_type = stream2.readString(4);
    if (this.version === 1) this.grouping_type_parameter = stream2.readUint32();
    else this.grouping_type_parameter = 0;
    this.entries = [];
    const entry_count = stream2.readUint32();
    for (let i = 0; i < entry_count; i++) this.entries.push({
      sample_count: stream2.readInt32(),
      group_description_index: stream2.readInt32()
    });
  }
  /** @bundle writing/sbgp.js */
  write(stream2) {
    if (this.grouping_type_parameter) this.version = 1;
    else this.version = 0;
    this.flags = 0;
    this.size = 8 + 8 * this.entries.length + (this.version === 1 ? 4 : 0);
    this.writeHeader(stream2);
    stream2.writeString(this.grouping_type, void 0, 4);
    if (this.version === 1) stream2.writeUint32(this.grouping_type_parameter);
    stream2.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      stream2.writeInt32(entry.sample_count);
      stream2.writeInt32(entry.group_description_index);
    }
  }
};
var sdtpBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleDependencyTypeBox";
  }
  static {
    this.fourcc = "sdtp";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const count = this.size - this.hdr_size;
    this.is_leading = [];
    this.sample_depends_on = [];
    this.sample_is_depended_on = [];
    this.sample_has_redundancy = [];
    for (let i = 0; i < count; i++) {
      const tmp_byte = stream2.readUint8();
      this.is_leading[i] = tmp_byte >> 6;
      this.sample_depends_on[i] = tmp_byte >> 4 & 3;
      this.sample_is_depended_on[i] = tmp_byte >> 2 & 3;
      this.sample_has_redundancy[i] = tmp_byte & 3;
    }
  }
};
var sgpdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleGroupDescriptionBox";
  }
  static {
    this.fourcc = "sgpd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.grouping_type = stream2.readString(4);
    Log.debug("BoxParser", "Found Sample Groups of type " + this.grouping_type);
    if (this.version === 1) this.default_length = stream2.readUint32();
    else this.default_length = 0;
    if (this.version >= 2) this.default_group_description_index = stream2.readUint32();
    this.entries = [];
    const entry_count = stream2.readUint32();
    for (let i = 0; i < entry_count; i++) {
      let entry;
      if (this.grouping_type in BoxRegistry.sampleGroupEntry) entry = new BoxRegistry.sampleGroupEntry[this.grouping_type](this.grouping_type);
      else entry = new SampleGroupEntry(this.grouping_type);
      this.entries.push(entry);
      if (this.version === 1) if (this.default_length === 0) entry.description_length = stream2.readUint32();
      else entry.description_length = this.default_length;
      else entry.description_length = this.default_length;
      if (entry.write === SampleGroupEntry.prototype.write) {
        Log.info("BoxParser", "SampleGroup for type " + this.grouping_type + " writing not yet implemented, keeping unparsed data in memory for later write");
        entry.data = stream2.readUint8Array(entry.description_length);
        stream2.seek(stream2.getPosition() - entry.description_length);
      }
      entry.parse(stream2);
    }
  }
  /** @bundle writing/sgpd.js */
  write(stream2) {
    this.flags = 0;
    this.size = 12;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (this.version === 1) {
        if (this.default_length === 0) this.size += 4;
        this.size += entry.data.length;
      }
    }
    this.writeHeader(stream2);
    stream2.writeString(this.grouping_type, void 0, 4);
    if (this.version === 1) stream2.writeUint32(this.default_length);
    if (this.version >= 2) stream2.writeUint32(this.default_sample_description_index);
    stream2.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (this.version === 1) {
        if (this.default_length === 0) stream2.writeUint32(entry.description_length);
      }
      entry.write(stream2);
    }
  }
};
var sidxBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompressedSegmentIndexBox";
  }
  static {
    this.fourcc = "sidx";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.reference_ID = stream2.readUint32();
    this.timescale = stream2.readUint32();
    if (this.version === 0) {
      this.earliest_presentation_time = stream2.readUint32();
      this.first_offset = stream2.readUint32();
    } else {
      this.earliest_presentation_time = stream2.readUint64();
      this.first_offset = stream2.readUint64();
    }
    stream2.readUint16();
    this.references = [];
    const count = stream2.readUint16();
    for (let i = 0; i < count; i++) {
      const type = stream2.readUint32();
      const subsegment_duration = stream2.readUint32();
      const sap = stream2.readUint32();
      this.references.push({
        reference_type: type >> 31 & 1,
        referenced_size: type & 2147483647,
        subsegment_duration,
        starts_with_SAP: sap >> 31 & 1,
        SAP_type: sap >> 28 & 7,
        SAP_delta_time: sap & 268435455
      });
    }
  }
  /** @bundle writing/sidx.js */
  write(stream2) {
    const useVersion1 = this.earliest_presentation_time > MAX_UINT32 || this.first_offset > MAX_UINT32 || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 12 + 12 * this.references.length;
    this.size += useVersion1 ? 16 : 8;
    this.flags = 0;
    this.writeHeader(stream2);
    stream2.writeUint32(this.reference_ID);
    stream2.writeUint32(this.timescale);
    if (useVersion1) {
      stream2.writeUint64(this.earliest_presentation_time);
      stream2.writeUint64(this.first_offset);
    } else {
      stream2.writeUint32(this.earliest_presentation_time);
      stream2.writeUint32(this.first_offset);
    }
    stream2.writeUint16(0);
    stream2.writeUint16(this.references.length);
    for (let i = 0; i < this.references.length; i++) {
      const ref = this.references[i];
      stream2.writeUint32(ref.reference_type << 31 | ref.referenced_size);
      stream2.writeUint32(ref.subsegment_duration);
      stream2.writeUint32(ref.starts_with_SAP << 31 | ref.SAP_type << 28 | ref.SAP_delta_time);
    }
  }
};
var smhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SoundMediaHeaderBox";
  }
  static {
    this.fourcc = "smhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.balance = stream2.readUint16();
    stream2.readUint16();
  }
  /** @bundle writing/smhd.js */
  write(stream2) {
    this.version = 0;
    this.size = 4;
    this.writeHeader(stream2);
    stream2.writeUint16(this.balance);
    stream2.writeUint16(0);
  }
};
var stcoBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ChunkOffsetBox";
  }
  static {
    this.fourcc = "stco";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.chunk_offsets = [];
    if (this.version === 0) for (let i = 0; i < entry_count; i++) this.chunk_offsets.push(stream2.readUint32());
  }
  /** @bundle writings/stco.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 4 * this.chunk_offsets.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.chunk_offsets.length);
    stream2.writeUint32Array(this.chunk_offsets);
  }
  /** @bundle box-unpack.js */
  unpack(samples2) {
    for (let i = 0; i < this.chunk_offsets.length; i++) samples2[i].offset = this.chunk_offsets[i];
  }
};
var sthdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SubtitleMediaHeaderBox";
  }
  static {
    this.fourcc = "sthd";
  }
};
var stscBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleToChunkBox";
  }
  static {
    this.fourcc = "stsc";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.first_chunk = [];
    this.samples_per_chunk = [];
    this.sample_description_index = [];
    if (this.version === 0) for (let i = 0; i < entry_count; i++) {
      this.first_chunk.push(stream2.readUint32());
      this.samples_per_chunk.push(stream2.readUint32());
      this.sample_description_index.push(stream2.readUint32());
    }
  }
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 12 * this.first_chunk.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.first_chunk.length);
    for (let i = 0; i < this.first_chunk.length; i++) {
      stream2.writeUint32(this.first_chunk[i]);
      stream2.writeUint32(this.samples_per_chunk[i]);
      stream2.writeUint32(this.sample_description_index[i]);
    }
  }
  unpack(samples2) {
    let l = 0;
    let m = 0;
    for (let i = 0; i < this.first_chunk.length; i++) for (let j = 0; j < (i + 1 < this.first_chunk.length ? this.first_chunk[i + 1] : Infinity); j++) {
      m++;
      for (let k = 0; k < this.samples_per_chunk[i]; k++) {
        if (samples2[l]) {
          samples2[l].description_index = this.sample_description_index[i];
          samples2[l].chunk_index = m;
        } else return;
        l++;
      }
    }
  }
};
var stsdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleDescriptionBox";
  }
  static {
    this.fourcc = "stsd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.entries = [];
    const entryCount = stream2.readUint32();
    for (let i = 1; i <= entryCount; i++) {
      const ret = parseOneBox(stream2, true, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        let box;
        if (ret.type in BoxRegistry.sampleEntry) {
          box = new BoxRegistry.sampleEntry[ret.type](ret.size);
          box.hdr_size = ret.hdr_size;
          box.start = ret.start;
        } else {
          Log.warn("BoxParser", `Unknown sample entry type: '${ret.type}'`);
          box = new SampleEntry(ret.size, ret.hdr_size, ret.start);
          box.type = ret.type;
        }
        if (box.write === SampleEntry.prototype.write) {
          Log.info("BoxParser", "SampleEntry " + box.type + " box writing not yet implemented, keeping unparsed data in memory for later write");
          box.parseDataAndRewind(stream2);
        }
        box.parse(stream2);
        this.entries.push(box);
      } else return;
    }
  }
  /** @bundle writing/stsd.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 0;
    this.writeHeader(stream2);
    stream2.writeUint32(this.entries.length);
    this.size += 4;
    for (let i = 0; i < this.entries.length; i++) {
      this.entries[i].write(stream2);
      this.size += this.entries[i].size;
    }
    Log.debug("BoxWriter", "Adjusting box " + this.type + " with new size " + this.size);
    stream2.adjustUint32(this.sizePosition, this.size);
  }
};
var stszBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleSizeBox";
  }
  static {
    this.fourcc = "stsz";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.sample_sizes = [];
    if (this.version === 0) {
      this.sample_size = stream2.readUint32();
      this.sample_count = stream2.readUint32();
      for (let i = 0; i < this.sample_count; i++) if (this.sample_size === 0) this.sample_sizes.push(stream2.readUint32());
      else this.sample_sizes[i] = this.sample_size;
    }
  }
  /** @bundle writing/stsz.js */
  write(stream2) {
    let constant = true;
    this.version = 0;
    this.flags = 0;
    if (this.sample_sizes.length > 0 && this.sample_size === 0) constant = false;
    this.size = 8;
    if (!constant) this.size += 4 * this.sample_sizes.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.sample_size);
    stream2.writeUint32(this.sample_sizes.length);
    if (!constant) stream2.writeUint32Array(this.sample_sizes);
  }
  /** @bundle box-unpack.js */
  unpack(samples2) {
    for (let i = 0; i < this.sample_sizes.length; i++) samples2[i].size = this.sample_sizes[i];
  }
};
var sttsBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TimeToSampleBox";
    this.sample_counts = [];
    this.sample_deltas = [];
  }
  static {
    this.fourcc = "stts";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.sample_counts.length = 0;
    this.sample_deltas.length = 0;
    if (this.version === 0) for (let i = 0; i < entry_count; i++) {
      this.sample_counts.push(stream2.readUint32());
      let delta = stream2.readInt32();
      if (delta < 0) {
        Log.warn("BoxParser", "File uses negative stts sample delta, using value 1 instead, sync may be lost!");
        delta = 1;
      }
      this.sample_deltas.push(delta);
    }
  }
  /** @bundle writing/stts.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 8 * this.sample_counts.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.sample_counts.length);
    for (let i = 0; i < this.sample_counts.length; i++) {
      stream2.writeUint32(this.sample_counts[i]);
      stream2.writeUint32(this.sample_deltas[i]);
    }
  }
  /** @bundle box-unpack.js */
  unpack(samples2) {
    let k = 0;
    for (let i = 0; i < this.sample_counts.length; i++) for (let j = 0; j < this.sample_counts[i]; j++) {
      if (k === 0) samples2[k].dts = 0;
      else samples2[k].dts = samples2[k - 1].dts + this.sample_deltas[i];
      k++;
    }
  }
};
var tfdtBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackFragmentBaseMediaDecodeTimeBox";
  }
  static {
    this.fourcc = "tfdt";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) this.baseMediaDecodeTime = stream2.readUint64();
    else this.baseMediaDecodeTime = stream2.readUint32();
  }
  /** @bundle writing/tdft.js */
  write(stream2) {
    const useVersion1 = this.baseMediaDecodeTime > MAX_UINT32 || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4;
    this.size += useVersion1 ? 4 : 0;
    this.flags = 0;
    this.writeHeader(stream2);
    if (useVersion1) stream2.writeUint64(this.baseMediaDecodeTime);
    else stream2.writeUint32(this.baseMediaDecodeTime);
  }
};
var tfhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackFragmentHeaderBox";
  }
  static {
    this.fourcc = "tfhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    let readBytes = 0;
    this.track_id = stream2.readUint32();
    if (this.size - this.hdr_size > readBytes && this.flags & 1) {
      this.base_data_offset = stream2.readUint64();
      readBytes += 8;
    } else this.base_data_offset = 0;
    if (this.size - this.hdr_size > readBytes && this.flags & 2) {
      this.default_sample_description_index = stream2.readUint32();
      readBytes += 4;
    } else this.default_sample_description_index = 0;
    if (this.size - this.hdr_size > readBytes && this.flags & 8) {
      this.default_sample_duration = stream2.readUint32();
      readBytes += 4;
    } else this.default_sample_duration = 0;
    if (this.size - this.hdr_size > readBytes && this.flags & 16) {
      this.default_sample_size = stream2.readUint32();
      readBytes += 4;
    } else this.default_sample_size = 0;
    if (this.size - this.hdr_size > readBytes && this.flags & 32) {
      this.default_sample_flags = stream2.readUint32();
      readBytes += 4;
    } else this.default_sample_flags = 0;
  }
  /** @bundle writing/tfhd.js */
  write(stream2) {
    this.version = 0;
    this.size = 4;
    if (this.flags & 1) this.size += 8;
    if (this.flags & 2) this.size += 4;
    if (this.flags & 8) this.size += 4;
    if (this.flags & 16) this.size += 4;
    if (this.flags & 32) this.size += 4;
    this.writeHeader(stream2);
    stream2.writeUint32(this.track_id);
    if (this.flags & 1) stream2.writeUint64(this.base_data_offset);
    if (this.flags & 2) stream2.writeUint32(this.default_sample_description_index);
    if (this.flags & 8) stream2.writeUint32(this.default_sample_duration);
    if (this.flags & 16) stream2.writeUint32(this.default_sample_size);
    if (this.flags & 32) stream2.writeUint32(this.default_sample_flags);
  }
};
var tkhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackHeaderBox";
    this.layer = 0;
    this.alternate_group = 0;
  }
  static {
    this.fourcc = "tkhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) {
      this.creation_time = stream2.readUint64();
      this.modification_time = stream2.readUint64();
      this.track_id = stream2.readUint32();
      stream2.readUint32();
      this.duration = stream2.readUint64();
    } else {
      this.creation_time = stream2.readUint32();
      this.modification_time = stream2.readUint32();
      this.track_id = stream2.readUint32();
      stream2.readUint32();
      this.duration = stream2.readUint32();
    }
    stream2.readUint32Array(2);
    this.layer = stream2.readInt16();
    this.alternate_group = stream2.readInt16();
    this.volume = stream2.readInt16() >> 8;
    stream2.readUint16();
    this.matrix = stream2.readInt32Array(9);
    this.width = stream2.readUint32();
    this.height = stream2.readUint32();
  }
  write(stream2) {
    const useVersion1 = this.modification_time > MAX_UINT32 || this.creation_time > MAX_UINT32 || this.duration > MAX_UINT32 || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 80;
    this.size += useVersion1 ? 12 : 0;
    this.flags = this.flags ?? 3;
    this.writeHeader(stream2);
    if (useVersion1) {
      stream2.writeUint64(this.creation_time);
      stream2.writeUint64(this.modification_time);
      stream2.writeUint32(this.track_id);
      stream2.writeUint32(0);
      stream2.writeUint64(this.duration);
    } else {
      stream2.writeUint32(this.creation_time);
      stream2.writeUint32(this.modification_time);
      stream2.writeUint32(this.track_id);
      stream2.writeUint32(0);
      stream2.writeUint32(this.duration);
    }
    stream2.writeUint32Array([0, 0]);
    stream2.writeInt16(this.layer);
    stream2.writeInt16(this.alternate_group);
    stream2.writeInt16(this.volume << 8);
    stream2.writeInt16(0);
    stream2.writeInt32Array(this.matrix);
    stream2.writeUint32(this.width);
    stream2.writeUint32(this.height);
  }
  /** @bundle box-print.js */
  print(output) {
    super.printHeader(output);
    output.log(output.indent + "creation_time: " + this.creation_time);
    output.log(output.indent + "modification_time: " + this.modification_time);
    output.log(output.indent + "track_id: " + this.track_id);
    output.log(output.indent + "duration: " + this.duration);
    output.log(output.indent + "volume: " + (this.volume >> 8));
    output.log(output.indent + "matrix: " + this.matrix.join(", "));
    output.log(output.indent + "layer: " + this.layer);
    output.log(output.indent + "alternate_group: " + this.alternate_group);
    output.log(output.indent + "width: " + this.width);
    output.log(output.indent + "height: " + this.height);
  }
};
var trexBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackExtendsBox";
  }
  static {
    this.fourcc = "trex";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.track_id = stream2.readUint32();
    this.default_sample_description_index = stream2.readUint32();
    this.default_sample_duration = stream2.readUint32();
    this.default_sample_size = stream2.readUint32();
    this.default_sample_flags = stream2.readUint32();
  }
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 20;
    this.writeHeader(stream2);
    stream2.writeUint32(this.track_id);
    stream2.writeUint32(this.default_sample_description_index);
    stream2.writeUint32(this.default_sample_duration);
    stream2.writeUint32(this.default_sample_size);
    stream2.writeUint32(this.default_sample_flags);
  }
};
var trunBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackRunBox";
    this.sample_duration = [];
    this.sample_size = [];
    this.sample_flags = [];
    this.sample_composition_time_offset = [];
  }
  static {
    this.fourcc = "trun";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    let readBytes = 0;
    this.sample_count = stream2.readUint32();
    readBytes += 4;
    if (this.size - this.hdr_size > readBytes && this.flags & 1) {
      this.data_offset = stream2.readInt32();
      readBytes += 4;
    } else this.data_offset = 0;
    if (this.size - this.hdr_size > readBytes && this.flags & 4) {
      this.first_sample_flags = stream2.readUint32();
      readBytes += 4;
    } else this.first_sample_flags = 0;
    this.sample_duration = [];
    this.sample_size = [];
    this.sample_flags = [];
    this.sample_composition_time_offset = [];
    if (this.size - this.hdr_size > readBytes) for (let i = 0; i < this.sample_count; i++) {
      if (this.flags & 256) this.sample_duration[i] = stream2.readUint32();
      if (this.flags & 512) this.sample_size[i] = stream2.readUint32();
      if (this.flags & 1024) this.sample_flags[i] = stream2.readUint32();
      if (this.flags & 2048) if (this.version === 0) this.sample_composition_time_offset[i] = stream2.readUint32();
      else this.sample_composition_time_offset[i] = stream2.readInt32();
    }
  }
  /** @bundle writing/trun.js */
  write(stream2) {
    this.size = 4;
    if (this.flags & 1) this.size += 4;
    if (this.flags & 4) this.size += 4;
    if (this.flags & 256) this.size += 4 * this.sample_duration.length;
    if (this.flags & 512) this.size += 4 * this.sample_size.length;
    if (this.flags & 1024) this.size += 4 * this.sample_flags.length;
    if (this.flags & 2048) this.size += 4 * this.sample_composition_time_offset.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.sample_count);
    if (this.flags & 1) {
      this.data_offset_position = stream2.getPosition();
      stream2.writeInt32(this.data_offset);
    }
    if (this.flags & 4) stream2.writeUint32(this.first_sample_flags);
    for (let i = 0; i < this.sample_count; i++) {
      if (this.flags & 256) stream2.writeUint32(this.sample_duration[i]);
      if (this.flags & 512) stream2.writeUint32(this.sample_size[i]);
      if (this.flags & 1024) stream2.writeUint32(this.sample_flags[i]);
      if (this.flags & 2048) if (this.version === 0) stream2.writeUint32(this.sample_composition_time_offset[i]);
      else stream2.writeInt32(this.sample_composition_time_offset[i]);
    }
  }
};
var urlBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "DataEntryUrlBox";
  }
  static {
    this.fourcc = "url ";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.flags !== 1) this.location = stream2.readCString();
  }
  /** @bundle writing/url.js */
  write(stream2) {
    this.version = 0;
    if (this.location) {
      this.flags = 0;
      this.size = this.location.length + 1;
    } else {
      this.flags = 1;
      this.size = 0;
    }
    this.writeHeader(stream2);
    if (this.location) stream2.writeCString(this.location);
  }
};
var vmhdBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "VideoMediaHeaderBox";
  }
  static {
    this.fourcc = "vmhd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.graphicsmode = stream2.readUint16();
    this.opcolor = stream2.readUint16Array(3);
  }
  /** @bundle writing/vmhd.js */
  write(stream2) {
    this.version = 0;
    this.size = 8;
    this.writeHeader(stream2);
    stream2.writeUint16(this.graphicsmode);
    stream2.writeUint16Array(this.opcolor);
  }
};
var SampleGroupInfo = class {
  constructor(grouping_type, grouping_type_parameter, sbgp) {
    this.grouping_type = grouping_type;
    this.grouping_type_parameter = grouping_type_parameter;
    this.sbgp = sbgp;
    this.last_sample_in_run = -1;
    this.entry_index = -1;
  }
};
var ISOFile = class ISOFile2 {
  constructor(stream2, discardMdatData = true) {
    this.boxes = [];
    this.mdats = [];
    this.moofs = [];
    this.isProgressive = false;
    this.moovStartFound = false;
    this.moovStartSent = false;
    this.readySent = false;
    this.sampleListBuilt = false;
    this.fragmentedTracks = [];
    this.extractedTracks = [];
    this.isFragmentationInitialized = false;
    this.sampleProcessingStarted = false;
    this.nextMoofNumber = 0;
    this.itemListBuilt = false;
    this.sidxSent = false;
    this.items = [];
    this.entity_groups = [];
    this.itemsDataSize = 0;
    this.lastMoofIndex = 0;
    this.samplesDataSize = 0;
    this.lastBoxStartPosition = 0;
    this.nextParsePosition = 0;
    this.discardMdatData = true;
    this.discardMdatData = discardMdatData;
    if (stream2) {
      this.stream = stream2;
      this.parse();
    } else this.stream = new MultiBufferStream();
    this.stream.isofile = this;
  }
  setSegmentOptions(id, user, opts) {
    const { sizePerSegment = Number.MAX_SAFE_INTEGER, rapAlignement = true, normalizeAudioSampleEntriesForMSE = true } = opts;
    let nbSamples = opts.nbSamples ?? opts.nbSamplesPerFragment ?? 1e3;
    const nbSamplesPerFragment = opts.nbSamplesPerFragment ?? nbSamples;
    if (nbSamples <= 0 || nbSamplesPerFragment <= 0 || sizePerSegment <= 0) {
      Log.error("ISOFile", `Invalid segment options: nbSamples=${nbSamples}, nbSamplesPerFragment=${nbSamplesPerFragment}, sizePerSegment=${sizePerSegment}`);
      return;
    }
    if (nbSamples < nbSamplesPerFragment) {
      Log.warn("ISOFile", `nbSamples (${nbSamples}) is less than nbSamplesPerFragment (${nbSamplesPerFragment}), setting nbSamples to nbSamplesPerFragment`);
      nbSamples = nbSamplesPerFragment;
    }
    if (this.fragmentedTracks.some((track) => track.nb_samples !== nbSamples)) {
      Log.error("ISOFile", `Cannot set segment options for track ${id}: nbSamples (${nbSamples}) does not match existing tracks`);
      return;
    }
    const trak = this.getTrackById(id);
    if (trak) {
      const fragTrack = {
        id,
        user,
        trak,
        segmentStream: void 0,
        nb_samples: nbSamples,
        nb_samples_per_fragment: nbSamplesPerFragment,
        size_per_segment: sizePerSegment,
        rapAlignement,
        normalizeAudioSampleEntriesForMSE,
        state: {
          lastFragmentSampleNumber: 0,
          lastSegmentSampleNumber: 0,
          accumulatedSize: 0
        }
      };
      this.fragmentedTracks.push(fragTrack);
      trak.nextSample = 0;
    }
    if (this.discardMdatData) Log.warn("ISOFile", "Segmentation options set but discardMdatData is true, samples will not be segmented");
  }
  unsetSegmentOptions(id) {
    let index = -1;
    for (let i = 0; i < this.fragmentedTracks.length; i++) if (this.fragmentedTracks[i].id === id) index = i;
    if (index > -1) this.fragmentedTracks.splice(index, 1);
  }
  setExtractionOptions(id, user, { nbSamples: nb_samples = 1e3 } = {}) {
    const trak = this.getTrackById(id);
    if (trak) {
      this.extractedTracks.push({
        id,
        user,
        trak,
        nb_samples,
        samples: []
      });
      trak.nextSample = 0;
    }
    if (this.discardMdatData) Log.warn("ISOFile", "Extraction options set but discardMdatData is true, samples will not be extracted");
  }
  unsetExtractionOptions(id) {
    let index = -1;
    for (let i = 0; i < this.extractedTracks.length; i++) if (this.extractedTracks[i].id === id) index = i;
    if (index > -1) this.extractedTracks.splice(index, 1);
  }
  parse() {
    const parseBoxHeadersOnly = false;
    if (this.restoreParsePosition) {
      if (!this.restoreParsePosition()) return;
    }
    while (true) if (this.hasIncompleteMdat && this.hasIncompleteMdat()) if (this.processIncompleteMdat()) continue;
    else return;
    else {
      if (this.saveParsePosition) this.saveParsePosition();
      const ret = parseOneBox(this.stream, parseBoxHeadersOnly);
      if (ret.code === 0) if (this.processIncompleteBox) if (this.processIncompleteBox(ret)) continue;
      else return;
      else return;
      else if (ret.code === 1) {
        const box = ret.box;
        this.boxes.push(box);
        if (box.type === "uuid") {
          if (this[box.uuid] !== void 0) Log.warn("ISOFile", "Duplicate Box of uuid: " + box.uuid + ", overriding previous occurrence");
          this[box.uuid] = box;
        } else switch (box.type) {
          case "mdat":
            this.mdats.push(box);
            this.transferMdatData(box);
            break;
          case "moof":
            this.moofs.push(box);
            break;
          case "free":
          case "skip":
            break;
          case "moov":
            this.moovStartFound = true;
            if (this.mdats.length === 0) this.isProgressive = true;
          default:
            if (this[box.type] !== void 0) if (Array.isArray(this[box.type + "s"])) {
              Log.info("ISOFile", `Found multiple boxes of type ${box.type} in ISOFile, adding to array`);
              this[box.type + "s"].push(box);
            } else {
              Log.warn("ISOFile", `Found multiple boxes of type ${box.type} but no array exists. Creating array dynamically.`);
              this[box.type + "s"] = [this[box.type], box];
            }
            else {
              this[box.type] = box;
              if (Array.isArray(this[box.type + "s"])) this[box.type + "s"].push(box);
            }
            break;
        }
        if (this.updateUsedBytes) this.updateUsedBytes(box, ret);
      } else if (ret.code === -1) {
        Log.error("ISOFile", `Invalid data found while parsing box of type '${ret.type}' at position ${ret.start}. Aborting parsing.`, this);
        break;
      }
    }
  }
  checkBuffer(ab) {
    if (!ab) throw new Error("Buffer must be defined and non empty");
    if (ab.byteLength === 0) {
      Log.warn("ISOFile", "Ignoring empty buffer (fileStart: " + ab.fileStart + ")");
      this.stream.logBufferLevel();
      return false;
    }
    Log.info("ISOFile", "Processing buffer (fileStart: " + ab.fileStart + ")");
    ab.usedBytes = 0;
    this.stream.insertBuffer(ab);
    this.stream.logBufferLevel();
    if (!this.stream.initialized()) {
      Log.warn("ISOFile", "Not ready to start parsing");
      return false;
    }
    return true;
  }
  /**
  * Processes a new ArrayBuffer (with a fileStart property)
  * Returns the next expected file position, or undefined if not ready to parse
  */
  appendBuffer(ab, last) {
    let nextFileStart;
    if (!this.checkBuffer(ab)) return;
    this.parse();
    if (this.moovStartFound && !this.moovStartSent) {
      this.moovStartSent = true;
      if (this.onMoovStart) this.onMoovStart();
    }
    if (this.moov) {
      if (!this.sampleListBuilt) {
        this.buildSampleLists();
        this.sampleListBuilt = true;
      }
      this.updateSampleLists();
      if (this.onReady && !this.readySent) {
        this.readySent = true;
        this.onReady(this.getInfo());
      }
      this.processSamples(last);
      if (this.nextSeekPosition) {
        nextFileStart = this.nextSeekPosition;
        this.nextSeekPosition = void 0;
      } else nextFileStart = this.nextParsePosition;
      if (this.stream.getEndFilePositionAfter) nextFileStart = this.stream.getEndFilePositionAfter(nextFileStart);
    } else if (this.nextParsePosition) nextFileStart = this.nextParsePosition;
    else nextFileStart = 0;
    if (this.sidx) {
      if (this.onSidx && !this.sidxSent) {
        this.onSidx(this.sidx);
        this.sidxSent = true;
      }
    }
    if (this.meta) {
      if (this.flattenItemInfo && !this.itemListBuilt) {
        this.flattenItemInfo();
        this.itemListBuilt = true;
      }
      if (this.processItems) this.processItems(this.onItem);
    }
    if (this.stream.cleanBuffers) {
      Log.info("ISOFile", "Done processing buffer (fileStart: " + ab.fileStart + ") - next buffer to fetch should have a fileStart position of " + nextFileStart);
      this.stream.logBufferLevel();
      this.stream.cleanBuffers();
      this.stream.logBufferLevel(true);
      Log.info("ISOFile", "Sample data size in memory: " + this.getAllocatedSampleDataSize());
    }
    return nextFileStart;
  }
  getFragmentDuration() {
    const mvex = this.getBox("mvex");
    if (!mvex) return;
    if (mvex.mehd) return {
      num: mvex.mehd.fragment_duration,
      den: this.moov.mvhd.timescale
    };
    const traks = this.getBoxes("trak", false);
    let maximum = {
      num: 0,
      den: 1
    };
    for (const trak of traks) {
      const duration2 = trak.samples_duration;
      const timescale = trak.mdia.mdhd.timescale;
      if (duration2 && timescale) {
        if (duration2 / timescale > maximum.num / maximum.den) maximum = {
          num: duration2,
          den: timescale
        };
      }
    }
    return maximum;
  }
  getInfo() {
    if (!this.moov) return {
      hasMoov: false,
      mime: ""
    };
    const _1904 = (/* @__PURE__ */ new Date("1904-01-01T00:00:00Z")).getTime();
    const isFragmented = this.getBox("mvex") !== void 0;
    const movie = {
      hasMoov: true,
      duration: this.moov.mvhd.duration,
      timescale: this.moov.mvhd.timescale,
      isFragmented,
      fragment_duration: this.getFragmentDuration(),
      isProgressive: this.isProgressive,
      hasIOD: this.moov.iods !== void 0,
      brands: [this.ftyp.major_brand].concat(this.ftyp.compatible_brands),
      created: new Date(_1904 + this.moov.mvhd.creation_time * 1e3),
      modified: new Date(_1904 + this.moov.mvhd.modification_time * 1e3),
      tracks: [],
      audioTracks: [],
      videoTracks: [],
      subtitleTracks: [],
      metadataTracks: [],
      hintTracks: [],
      otherTracks: [],
      mime: ""
    };
    for (let i = 0; i < this.moov.traks.length; i++) {
      const trak = this.moov.traks[i];
      const sample_desc = trak.mdia.minf.stbl.stsd.entries[0];
      const size = trak.samples_size;
      const track_timescale = trak.mdia.mdhd.timescale;
      const samples_duration = trak.samples_duration;
      const track = {
        samples_duration,
        bitrate: size * 8 * track_timescale / samples_duration,
        size,
        timescale: track_timescale,
        alternate_group: trak.tkhd.alternate_group,
        codec: sample_desc.getCodec(),
        created: new Date(_1904 + trak.tkhd.creation_time * 1e3),
        cts_shift: trak.mdia.minf.stbl.cslg,
        duration: trak.mdia.mdhd.duration,
        id: trak.tkhd.track_id,
        kind: trak.udta && trak.udta.kinds.length ? trak.udta.kinds[0] : {
          schemeURI: "",
          value: ""
        },
        language: trak.mdia.elng ? trak.mdia.elng.extended_language : trak.mdia.mdhd.languageString,
        layer: trak.tkhd.layer,
        matrix: trak.tkhd.matrix,
        modified: new Date(_1904 + trak.tkhd.modification_time * 1e3),
        movie_duration: trak.tkhd.duration,
        movie_timescale: movie.timescale,
        name: trak.mdia.hdlr.name,
        nb_samples: trak.samples.length,
        references: [],
        track_height: trak.tkhd.height / 65536,
        track_width: trak.tkhd.width / 65536,
        volume: trak.tkhd.volume
      };
      movie.tracks.push(track);
      if (trak.tref) for (let j = 0; j < trak.tref.references.length; j++) track.references.push({
        type: trak.tref.references[j].type,
        track_ids: trak.tref.references[j].track_ids
      });
      if (trak.edts !== void 0 && trak.edts.elst !== void 0) track.edits = trak.edts.elst.entries;
      if (sample_desc instanceof AudioSampleEntry) {
        track.type = "audio";
        movie.audioTracks.push(track);
        track.audio = {
          sample_rate: sample_desc.getSampleRate(),
          channel_count: sample_desc.getChannelCount(),
          sample_size: sample_desc.getSampleSize()
        };
      } else if (sample_desc instanceof VisualSampleEntry) {
        track.type = "video";
        movie.videoTracks.push(track);
        track.video = {
          width: sample_desc.getWidth(),
          height: sample_desc.getHeight()
        };
      } else if (sample_desc instanceof SubtitleSampleEntry) {
        track.type = "subtitles";
        movie.subtitleTracks.push(track);
      } else if (sample_desc instanceof HintSampleEntry) {
        track.type = "metadata";
        movie.hintTracks.push(track);
      } else if (sample_desc instanceof MetadataSampleEntry) {
        track.type = "metadata";
        movie.metadataTracks.push(track);
      } else {
        track.type = "metadata";
        movie.otherTracks.push(track);
      }
    }
    if (movie.videoTracks && movie.videoTracks.length > 0) movie.mime += 'video/mp4; codecs="';
    else if (movie.audioTracks && movie.audioTracks.length > 0) movie.mime += 'audio/mp4; codecs="';
    else movie.mime += 'application/mp4; codecs="';
    for (let i = 0; i < movie.tracks.length; i++) {
      if (i !== 0) movie.mime += ",";
      movie.mime += movie.tracks[i].codec;
    }
    movie.mime += '"; profiles="';
    movie.mime += this.ftyp.compatible_brands.join();
    movie.mime += '"';
    return movie;
  }
  setNextSeekPositionFromSample(sample2) {
    if (!sample2) return;
    if (this.nextSeekPosition) this.nextSeekPosition = Math.min(sample2.offset + sample2.alreadyRead, this.nextSeekPosition);
    else this.nextSeekPosition = sample2.offset + sample2.alreadyRead;
  }
  processSamples(last) {
    if (!this.sampleProcessingStarted) return;
    if (this.isFragmentationInitialized && this.onSegment !== void 0) {
      const consumedTracks = /* @__PURE__ */ new Set();
      while (consumedTracks.size < this.fragmentedTracks.length && this.fragmentedTracks.some((track) => track.trak.nextSample < track.trak.samples.length) && this.sampleProcessingStarted) for (const fragTrak of this.fragmentedTracks) {
        const trak = fragTrak.trak;
        if (!consumedTracks.has(fragTrak.id)) {
          const sample2 = trak.nextSample < trak.samples.length ? this.getSample(trak, trak.nextSample) : void 0;
          if (!sample2) {
            this.setNextSeekPositionFromSample(trak.samples[trak.nextSample]);
            consumedTracks.add(fragTrak.id);
            continue;
          }
          fragTrak.state.accumulatedSize += sample2.size;
          const sampleNum = trak.nextSample + 1;
          const isFragmentOverdue = sampleNum - fragTrak.state.lastFragmentSampleNumber > fragTrak.nb_samples_per_fragment;
          const isSegmentOverdue = sampleNum - fragTrak.state.lastSegmentSampleNumber > fragTrak.nb_samples;
          let isFragmentBoundary = isFragmentOverdue || sampleNum % fragTrak.nb_samples_per_fragment === 0;
          let isSegmentBoundary = isSegmentOverdue || sampleNum % fragTrak.nb_samples === 0;
          let isSizeBoundary = fragTrak.state.accumulatedSize >= fragTrak.size_per_segment;
          const isRAP = !fragTrak.rapAlignement || sample2.is_sync;
          const isFlush = last || trak.nextSample + 1 >= trak.samples.length;
          if (isFlush && !isRAP) Log.warn("ISOFile", "Flushing track #" + fragTrak.id + " at sample #" + trak.nextSample + " which is not a RAP, this may lead to playback issues");
          isFragmentBoundary = isFragmentBoundary && isRAP;
          isSegmentBoundary = isSegmentBoundary && isRAP;
          isSizeBoundary = isSizeBoundary && isRAP;
          if (isFragmentBoundary || isSizeBoundary || isFlush) {
            if (isFragmentOverdue) Log.warn("ISOFile", "Fragment on track #" + fragTrak.id + " is overdue, creating it with samples [" + fragTrak.state.lastFragmentSampleNumber + ", " + trak.nextSample + "]");
            else Log.debug("ISOFile", "Creating media fragment on track #" + fragTrak.id + " for samples [" + fragTrak.state.lastFragmentSampleNumber + ", " + trak.nextSample + "]");
            const result = this.createFragment(fragTrak.id, fragTrak.state.lastFragmentSampleNumber, trak.nextSample, fragTrak.segmentStream);
            if (result) {
              fragTrak.segmentStream = result;
              fragTrak.state.lastFragmentSampleNumber = trak.nextSample + 1;
            } else {
              consumedTracks.add(fragTrak.id);
              continue;
            }
          }
          if (isSegmentBoundary || isSizeBoundary || isFlush) {
            if (isSegmentOverdue) Log.warn("ISOFile", "Segment on track #" + fragTrak.id + " is overdue, sending it with samples [" + Math.max(0, trak.nextSample - fragTrak.nb_samples) + ", " + (trak.nextSample - 1) + "]");
            else Log.info("ISOFile", "Sending fragmented data on track #" + fragTrak.id + " for samples [" + Math.max(0, trak.nextSample - fragTrak.nb_samples) + ", " + (trak.nextSample - 1) + "]");
            Log.info("ISOFile", "Sample data size in memory: " + this.getAllocatedSampleDataSize());
            if (this.onSegment) this.onSegment(fragTrak.id, fragTrak.user, fragTrak.segmentStream.buffer, trak.nextSample + 1, last || trak.nextSample + 1 >= trak.samples.length);
            fragTrak.segmentStream = void 0;
            fragTrak.state.accumulatedSize = 0;
            fragTrak.state.lastSegmentSampleNumber = trak.nextSample + 1;
          }
          trak.nextSample++;
        }
      }
    }
    if (this.onSamples !== void 0) for (let i = 0; i < this.extractedTracks.length; i++) {
      const extractTrak = this.extractedTracks[i];
      const trak = extractTrak.trak;
      while (trak.nextSample < trak.samples.length && this.sampleProcessingStarted) {
        Log.debug("ISOFile", "Exporting on track #" + extractTrak.id + " sample #" + trak.nextSample);
        const sample2 = this.getSample(trak, trak.nextSample);
        if (sample2) {
          trak.nextSample++;
          extractTrak.samples.push(sample2);
        } else {
          this.setNextSeekPositionFromSample(trak.samples[trak.nextSample]);
          break;
        }
        if (trak.nextSample % extractTrak.nb_samples === 0 || trak.nextSample >= trak.samples.length) {
          Log.debug("ISOFile", "Sending samples on track #" + extractTrak.id + " for sample " + trak.nextSample);
          if (this.onSamples) this.onSamples(extractTrak.id, extractTrak.user, extractTrak.samples);
          extractTrak.samples = [];
          if (extractTrak !== this.extractedTracks[i]) break;
        }
      }
    }
  }
  getBox(type) {
    const result = this.getBoxes(type, true);
    return result.length ? result[0] : void 0;
  }
  getBoxes(type, returnEarly) {
    const result = [];
    const sweep = (root) => {
      if (root instanceof Box && root.type && root.type === type) result.push(root);
      const inner = [];
      if (root["boxes"]) inner.push(...root.boxes);
      if (root["entries"]) inner.push(...root["entries"]);
      if (root["item_infos"]) inner.push(...root["item_infos"]);
      if (root["references"]) inner.push(...root["references"]);
      for (const box of inner) {
        if (result.length && returnEarly) return;
        sweep(box);
      }
    };
    sweep(this);
    return result;
  }
  getTrackSamplesInfo(track_id) {
    const track = this.getTrackById(track_id);
    if (track) return track.samples;
  }
  getTrackSample(track_id, number) {
    const track = this.getTrackById(track_id);
    return this.getSample(track, number);
  }
  releaseUsedSamples(id, sampleNum) {
    let size = 0;
    const trak = this.getTrackById(id);
    if (!trak.lastValidSample) trak.lastValidSample = 0;
    for (let i = trak.lastValidSample; i < sampleNum; i++) size += this.releaseSample(trak, i);
    Log.info("ISOFile", "Track #" + id + " released samples up to " + sampleNum + " (released size: " + size + ", remaining: " + this.samplesDataSize + ")");
    trak.lastValidSample = sampleNum;
  }
  start() {
    this.sampleProcessingStarted = true;
    this.processSamples(false);
  }
  stop() {
    this.sampleProcessingStarted = false;
  }
  flush() {
    Log.info("ISOFile", "Flushing remaining samples");
    this.updateSampleLists();
    this.processSamples(true);
    this.stream.cleanBuffers();
    this.stream.logBufferLevel(true);
  }
  seekTrack(time, useRap, trak) {
    let rap_seek_sample_num = 0;
    let seek_sample_num = 0;
    let timescale;
    if (trak.samples.length === 0) {
      Log.info("ISOFile", "No sample in track, cannot seek! Using time " + Log.getDurationString(0, 1) + " and offset: 0");
      return {
        offset: 0,
        time: 0
      };
    }
    for (let j = 0; j < trak.samples.length; j++) {
      const sample2 = trak.samples[j];
      if (j === 0) {
        seek_sample_num = 0;
        timescale = sample2.timescale;
      } else if (sample2.cts > time * sample2.timescale) {
        seek_sample_num = j - 1;
        break;
      }
      if (useRap && sample2.is_sync) rap_seek_sample_num = j;
    }
    if (useRap) seek_sample_num = rap_seek_sample_num;
    time = trak.samples[seek_sample_num].cts;
    trak.nextSample = seek_sample_num;
    this.resetFragmentedTrackStateAfterSeek(trak, seek_sample_num);
    this.resetExtractedTrackStateAfterSeek(trak);
    while (trak.samples[seek_sample_num].alreadyRead === trak.samples[seek_sample_num].size) {
      if (!trak.samples[seek_sample_num + 1]) break;
      seek_sample_num++;
    }
    const seek_offset = trak.samples[seek_sample_num].offset + trak.samples[seek_sample_num].alreadyRead;
    Log.info("ISOFile", "Seeking to " + (useRap ? "RAP" : "") + " sample #" + trak.nextSample + " on track " + trak.tkhd.track_id + ", time " + Log.getDurationString(time, timescale) + " and offset: " + seek_offset);
    return {
      offset: seek_offset,
      time: time / timescale
    };
  }
  resetFragmentedTrackStateAfterSeek(trak, seekSampleNumber) {
    const fragTrack = this.fragmentedTracks.find((t2) => t2.trak === trak);
    if (!fragTrack) return;
    fragTrack.state.lastFragmentSampleNumber = seekSampleNumber;
    fragTrack.state.lastSegmentSampleNumber = seekSampleNumber;
    fragTrack.state.accumulatedSize = 0;
    fragTrack.segmentStream = void 0;
  }
  resetExtractedTrackStateAfterSeek(trak) {
    const extractTrack = this.extractedTracks.find((t2) => t2.trak === trak);
    if (!extractTrack) return;
    extractTrack.samples = [];
  }
  getTrackDuration(trak) {
    if (!trak.samples) return Infinity;
    const sample2 = trak.samples[trak.samples.length - 1];
    return (sample2.cts + sample2.duration) / sample2.timescale;
  }
  seek(time, useRap) {
    const moov = this.moov;
    let seek_info = {
      offset: Infinity,
      time: Infinity
    };
    if (!this.moov) throw new Error("Cannot seek: moov not received!");
    else {
      for (let i = 0; i < moov.traks.length; i++) {
        const trak = moov.traks[i];
        if (time > this.getTrackDuration(trak)) continue;
        const trak_seek_info = this.seekTrack(time, useRap, trak);
        if (trak_seek_info.offset < seek_info.offset) seek_info.offset = trak_seek_info.offset;
        if (trak_seek_info.time < seek_info.time) seek_info.time = trak_seek_info.time;
      }
      Log.info("ISOFile", "Seeking at time " + Log.getDurationString(seek_info.time, 1) + " needs a buffer with a fileStart position of " + seek_info.offset);
      if (seek_info.offset === Infinity) seek_info = {
        offset: this.nextParsePosition,
        time: 0
      };
      else seek_info.offset = this.stream.getEndFilePositionAfter(seek_info.offset);
      Log.info("ISOFile", "Adjusted seek position (after checking data already in buffer): " + seek_info.offset);
      return seek_info;
    }
  }
  equal(b) {
    let box_index = 0;
    while (box_index < this.boxes.length && box_index < b.boxes.length) {
      const a_box = this.boxes[box_index];
      const b_box = b.boxes[box_index];
      if (!boxEqual(a_box, b_box)) return false;
      box_index++;
    }
    return true;
  }
  /**
  * Rewrite the entire file
  * @bundle isofile-write.js
  */
  write(outstream) {
    for (let i = 0; i < this.boxes.length; i++) this.boxes[i].write(outstream);
  }
  /** @bundle isofile-write.js */
  createFragment(track_id, sampleStart, sampleEnd, existingStream) {
    if (sampleEnd < sampleStart) {
      Log.warn("ISOFile", `Skipping fragment creation on track #${track_id}: invalid sample range [${sampleStart}, ${sampleEnd}]`);
      return existingStream || new DataStream();
    }
    const samples2 = [];
    for (let i = sampleStart; i <= sampleEnd; i++) {
      const trak = this.getTrackById(track_id);
      const sample2 = this.getSample(trak, i);
      if (!sample2) {
        this.setNextSeekPositionFromSample(trak.samples[i]);
        return;
      }
      samples2.push(sample2);
    }
    const stream2 = existingStream || new DataStream();
    const moof = this.createMoof(samples2);
    moof.write(stream2);
    moof.trafs[0].truns[0].data_offset = moof.size + 8;
    Log.debug("MP4Box", "Adjusting data_offset with new value " + moof.trafs[0].truns[0].data_offset);
    stream2.adjustUint32(moof.trafs[0].truns[0].data_offset_position, moof.trafs[0].truns[0].data_offset);
    const mdat = new mdatBox();
    mdat.stream = new MultiBufferStream();
    let offset = 0;
    for (const sample2 of samples2) if (sample2.data) {
      const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(sample2.data.buffer, offset);
      mdat.stream.insertBuffer(mp4Buffer);
      offset += sample2.data.byteLength;
    }
    mdat.write(stream2);
    return stream2;
  }
  /**
  * Modify the file and create the initialization segment
  * @bundle isofile-write.js
  */
  static writeInitializationSegment(ftyp, moov, total_duration, normalizeAudioSampleEntryTrackIds) {
    Log.debug("ISOFile", "Generating initialization segment");
    const stream2 = new DataStream();
    ftyp.write(stream2);
    const restoreCallbacks = ISOFile2.normalizeAudioSampleEntriesForMSEFragmentedInit(moov.traks, normalizeAudioSampleEntryTrackIds);
    try {
      const mvex = moov.addBox(new mvexBox());
      if (total_duration) {
        const mehd = mvex.addBox(new mehdBox());
        mehd.fragment_duration = total_duration;
      }
      for (let i = 0; i < moov.traks.length; i++) {
        const trex = mvex.addBox(new trexBox());
        trex.track_id = moov.traks[i].tkhd.track_id;
        trex.default_sample_description_index = 1;
        trex.default_sample_duration = moov.traks[i].samples[0]?.duration ?? 0;
        trex.default_sample_size = 0;
        trex.default_sample_flags = 65536;
      }
      moov.write(stream2);
    } finally {
      for (let i = restoreCallbacks.length - 1; i >= 0; i--) restoreCallbacks[i]();
    }
    return stream2.buffer;
  }
  /** @bundle isofile-write.js */
  save(name2) {
    const stream2 = new DataStream();
    stream2.isofile = this;
    this.write(stream2);
    return stream2.save(name2);
  }
  /** @bundle isofile-write.js */
  getBuffer() {
    const stream2 = new DataStream();
    stream2.isofile = this;
    this.write(stream2);
    return stream2;
  }
  /** @bundle isofile-write.js */
  static normalizeAudioSampleEntriesForMSEFragmentedInit(traks, normalizeAudioSampleEntryTrackIds) {
    const restoreCallbacks = [];
    for (const trak of traks) {
      if (!normalizeAudioSampleEntryTrackIds?.has(trak.tkhd.track_id)) continue;
      for (const sampleEntry of trak.mdia.minf.stbl.stsd?.entries ?? []) {
        if (!(sampleEntry instanceof mp4aSampleEntry)) continue;
        const esds = sampleEntry.wave?.esds;
        if (sampleEntry.esds || !esds) continue;
        const previousEsds = sampleEntry.esds;
        const previousWave = sampleEntry.wave;
        const previousBoxes = sampleEntry.boxes;
        restoreCallbacks.push(() => {
          sampleEntry.esds = previousEsds;
          sampleEntry.wave = previousWave;
          sampleEntry.boxes = previousBoxes;
        });
        const boxesWithoutWave = Array.isArray(sampleEntry.boxes) ? sampleEntry.boxes.filter((box) => box?.type !== "wave" && box?.type !== "esds") : [];
        sampleEntry.esds = esds;
        sampleEntry.boxes = [...boxesWithoutWave, esds];
        sampleEntry.wave = void 0;
      }
    }
    return restoreCallbacks;
  }
  initializeSegmentation(mode2) {
    if (!this.onSegment) Log.warn("MP4Box", "No segmentation callback set!");
    if (mode2 !== void 0 && mode2 !== "combined" && mode2 !== "per-track") throw new Error(`Invalid segmentation mode: ${mode2}`);
    if (!this.isFragmentationInitialized) {
      this.isFragmentationInitialized = true;
      this.resetTables();
    }
    const tracksToInitialize = [];
    for (const fragmentedTrack of this.fragmentedTracks) {
      const trak = this.getTrackById(fragmentedTrack.id);
      if (!trak) {
        Log.warn("ISOFile", `Track with id ${fragmentedTrack.id} not found, skipping fragmentation initialization`);
        continue;
      }
      tracksToInitialize.push({
        id: fragmentedTrack.id,
        user: fragmentedTrack.user,
        trak
      });
    }
    const fragmentDuration = this.moov?.mvex?.mehd?.fragment_duration;
    const normalizeAudioSampleEntryTrackIds = new Set(this.fragmentedTracks.filter((track) => track.normalizeAudioSampleEntriesForMSE !== false).map((track) => track.id));
    if (mode2 === "per-track") return tracksToInitialize.map(({ id, user, trak }) => {
      const moov2 = new moovBox();
      moov2.addBox(this.moov.mvhd);
      moov2.addBox(trak);
      return {
        id,
        user,
        buffer: ISOFile2.writeInitializationSegment(this.ftyp, moov2, fragmentDuration, normalizeAudioSampleEntryTrackIds)
      };
    });
    const moov = new moovBox();
    moov.addBox(this.moov.mvhd);
    for (const track of tracksToInitialize) moov.addBox(track.trak);
    return {
      tracks: tracksToInitialize.map(({ id, user }) => ({
        id,
        user
      })),
      buffer: ISOFile2.writeInitializationSegment(this.ftyp, moov, fragmentDuration, normalizeAudioSampleEntryTrackIds)
    };
  }
  /**
  * Resets all sample tables
  * @bundle isofile-sample-processing.js
  */
  resetTables() {
    this.initial_duration = this.moov.mvhd.duration;
    this.moov.mvhd.duration = 0;
    for (let i = 0; i < this.moov.traks.length; i++) {
      const trak = this.moov.traks[i];
      trak.tkhd.duration = 0;
      trak.mdia.mdhd.duration = 0;
      const stco = trak.mdia.minf.stbl.stco || trak.mdia.minf.stbl.co64;
      stco.chunk_offsets = [];
      const stsc = trak.mdia.minf.stbl.stsc;
      stsc.first_chunk = [];
      stsc.samples_per_chunk = [];
      stsc.sample_description_index = [];
      const stsz = trak.mdia.minf.stbl.stsz || trak.mdia.minf.stbl.stz2;
      stsz.sample_sizes = [];
      const stts = trak.mdia.minf.stbl.stts;
      stts.sample_counts = [];
      stts.sample_deltas = [];
      const ctts = trak.mdia.minf.stbl.ctts;
      if (ctts) {
        ctts.sample_counts = [];
        ctts.sample_offsets = [];
      }
      const stss = trak.mdia.minf.stbl.stss;
      const k = trak.mdia.minf.stbl.boxes.indexOf(stss);
      if (k !== -1) trak.mdia.minf.stbl.boxes[k] = void 0;
    }
  }
  /** @bundle isofile-sample-processing.js */
  static initSampleGroups(trak, traf, sbgps, trak_sgpds, traf_sgpds) {
    if (traf) traf.sample_groups_info = [];
    if (!trak.sample_groups_info) trak.sample_groups_info = [];
    for (let k = 0; k < sbgps.length; k++) {
      const sample_group_key = sbgps[k].grouping_type + "/" + sbgps[k].grouping_type_parameter;
      const sample_group_info = new SampleGroupInfo(sbgps[k].grouping_type, sbgps[k].grouping_type_parameter, sbgps[k]);
      if (traf) traf.sample_groups_info[sample_group_key] = sample_group_info;
      if (!trak.sample_groups_info[sample_group_key]) trak.sample_groups_info[sample_group_key] = sample_group_info;
      for (let l = 0; l < trak_sgpds.length; l++) if (trak_sgpds[l].grouping_type === sbgps[k].grouping_type) {
        sample_group_info.description = trak_sgpds[l];
        sample_group_info.description.used = true;
      }
      if (traf_sgpds) {
        for (let l = 0; l < traf_sgpds.length; l++) if (traf_sgpds[l].grouping_type === sbgps[k].grouping_type) {
          sample_group_info.fragment_description = traf_sgpds[l];
          sample_group_info.fragment_description.used = true;
          sample_group_info.is_fragment = true;
        }
      }
    }
    if (!traf) {
      for (let k = 0; k < trak_sgpds.length; k++) if (!trak_sgpds[k].used && trak_sgpds[k].version >= 2) {
        const sample_group_key = trak_sgpds[k].grouping_type + "/0";
        const sample_group_info = new SampleGroupInfo(trak_sgpds[k].grouping_type, 0);
        if (!trak.sample_groups_info[sample_group_key]) trak.sample_groups_info[sample_group_key] = sample_group_info;
      }
    } else if (traf_sgpds) {
      for (let k = 0; k < traf_sgpds.length; k++) if (!traf_sgpds[k].used && traf_sgpds[k].version >= 2) {
        const sample_group_key = traf_sgpds[k].grouping_type + "/0";
        const sample_group_info = new SampleGroupInfo(traf_sgpds[k].grouping_type, 0);
        sample_group_info.is_fragment = true;
        if (!traf.sample_groups_info[sample_group_key]) traf.sample_groups_info[sample_group_key] = sample_group_info;
      }
    }
  }
  /** @bundle isofile-sample-processing.js */
  static setSampleGroupProperties(trak, sample2, sample_number, sample_groups_info) {
    sample2.sample_groups = [];
    for (const k in sample_groups_info) {
      sample2.sample_groups[k] = {
        grouping_type: sample_groups_info[k].grouping_type,
        grouping_type_parameter: sample_groups_info[k].grouping_type_parameter
      };
      if (sample_number >= sample_groups_info[k].last_sample_in_run) {
        if (sample_groups_info[k].last_sample_in_run < 0) sample_groups_info[k].last_sample_in_run = 0;
        sample_groups_info[k].entry_index++;
        if (sample_groups_info[k].entry_index <= sample_groups_info[k].sbgp.entries.length - 1) sample_groups_info[k].last_sample_in_run += sample_groups_info[k].sbgp.entries[sample_groups_info[k].entry_index].sample_count;
      }
      if (sample_groups_info[k].entry_index <= sample_groups_info[k].sbgp.entries.length - 1) sample2.sample_groups[k].group_description_index = sample_groups_info[k].sbgp.entries[sample_groups_info[k].entry_index].group_description_index;
      else sample2.sample_groups[k].group_description_index = -1;
      if (sample2.sample_groups[k].group_description_index !== 0) {
        let description2;
        if (sample_groups_info[k].fragment_description) description2 = sample_groups_info[k].fragment_description;
        else description2 = sample_groups_info[k].description;
        if (sample2.sample_groups[k].group_description_index > 0) {
          let index;
          if (sample2.sample_groups[k].group_description_index > 65535) index = (sample2.sample_groups[k].group_description_index >> 16) - 1;
          else index = sample2.sample_groups[k].group_description_index - 1;
          if (description2 && index >= 0) sample2.sample_groups[k].description = description2.entries[index];
        } else if (description2 && description2.version >= 2) {
          if (description2.default_group_description_index > 0) sample2.sample_groups[k].description = description2.entries[description2.default_group_description_index - 1];
        }
      }
    }
  }
  /** @bundle isofile-sample-processing.js */
  static process_sdtp(sdtp, sample2, number) {
    if (!sample2) return;
    if (sdtp) {
      sample2.is_leading = sdtp.is_leading[number];
      sample2.depends_on = sdtp.sample_depends_on[number];
      sample2.is_depended_on = sdtp.sample_is_depended_on[number];
      sample2.has_redundancy = sdtp.sample_has_redundancy[number];
    } else {
      sample2.is_leading = 0;
      sample2.depends_on = 0;
      sample2.is_depended_on = 0;
      sample2.has_redundancy = 0;
    }
  }
  buildSampleLists() {
    for (let i = 0; i < this.moov.traks.length; i++) this.buildTrakSampleLists(this.moov.traks[i]);
  }
  buildTrakSampleLists(trak) {
    let j;
    let chunk_run_index;
    let chunk_index;
    let last_chunk_in_run;
    let offset_in_chunk;
    let last_sample_in_chunk;
    trak.samples = [];
    trak.samples_duration = 0;
    trak.samples_size = 0;
    const stco = trak.mdia.minf.stbl.stco || trak.mdia.minf.stbl.co64;
    const stsc = trak.mdia.minf.stbl.stsc;
    const stsz = trak.mdia.minf.stbl.stsz || trak.mdia.minf.stbl.stz2;
    const stts = trak.mdia.minf.stbl.stts;
    const ctts = trak.mdia.minf.stbl.ctts;
    const stss = trak.mdia.minf.stbl.stss;
    const stsd = trak.mdia.minf.stbl.stsd;
    const subs = trak.mdia.minf.stbl.subs;
    const stdp = trak.mdia.minf.stbl.stdp;
    const sbgps = trak.mdia.minf.stbl.sbgps;
    const sgpds = trak.mdia.minf.stbl.sgpds;
    let last_sample_in_stts_run = -1;
    let stts_run_index = -1;
    let last_sample_in_ctts_run = -1;
    let ctts_run_index = -1;
    let last_stss_index = 0;
    let subs_entry_index = 0;
    let last_subs_sample_index = 0;
    ISOFile2.initSampleGroups(trak, void 0, sbgps, sgpds);
    if (typeof stsz === "undefined") return;
    for (j = 0; j < stsz.sample_sizes.length; j++) {
      const sample2 = {
        number: j,
        track_id: trak.tkhd.track_id,
        timescale: trak.mdia.mdhd.timescale,
        alreadyRead: 0,
        size: stsz.sample_sizes[j]
      };
      trak.samples[j] = sample2;
      trak.samples_size += sample2.size;
      if (j === 0) {
        chunk_index = 1;
        chunk_run_index = 0;
        sample2.chunk_index = chunk_index;
        sample2.chunk_run_index = chunk_run_index;
        last_sample_in_chunk = stsc.samples_per_chunk[chunk_run_index];
        offset_in_chunk = 0;
        if (chunk_run_index + 1 < stsc.first_chunk.length) last_chunk_in_run = stsc.first_chunk[chunk_run_index + 1] - 1;
        else last_chunk_in_run = Infinity;
      } else if (j < last_sample_in_chunk) {
        sample2.chunk_index = chunk_index;
        sample2.chunk_run_index = chunk_run_index;
      } else {
        chunk_index++;
        sample2.chunk_index = chunk_index;
        offset_in_chunk = 0;
        if (chunk_index <= last_chunk_in_run) {
        } else {
          chunk_run_index++;
          if (chunk_run_index + 1 < stsc.first_chunk.length) last_chunk_in_run = stsc.first_chunk[chunk_run_index + 1] - 1;
          else last_chunk_in_run = Infinity;
        }
        sample2.chunk_run_index = chunk_run_index;
        last_sample_in_chunk += stsc.samples_per_chunk[chunk_run_index];
      }
      sample2.description_index = stsc.sample_description_index[sample2.chunk_run_index] - 1;
      sample2.description = stsd.entries[sample2.description_index];
      sample2.offset = stco.chunk_offsets[sample2.chunk_index - 1] + offset_in_chunk;
      offset_in_chunk += sample2.size;
      if (j > last_sample_in_stts_run) {
        stts_run_index++;
        if (last_sample_in_stts_run < 0) last_sample_in_stts_run = 0;
        last_sample_in_stts_run += stts.sample_counts[stts_run_index];
      }
      if (j > 0) {
        trak.samples[j - 1].duration = stts.sample_deltas[stts_run_index];
        trak.samples_duration += trak.samples[j - 1].duration;
        sample2.dts = trak.samples[j - 1].dts + trak.samples[j - 1].duration;
      } else sample2.dts = 0;
      if (ctts) {
        if (j >= last_sample_in_ctts_run) {
          ctts_run_index++;
          if (last_sample_in_ctts_run < 0) last_sample_in_ctts_run = 0;
          last_sample_in_ctts_run += ctts.sample_counts[ctts_run_index];
        }
        sample2.cts = trak.samples[j].dts + ctts.sample_offsets[ctts_run_index];
      } else sample2.cts = sample2.dts;
      if (stss) {
        if (j === stss.sample_numbers[last_stss_index] - 1) {
          sample2.is_sync = true;
          last_stss_index++;
        } else {
          sample2.is_sync = false;
          sample2.degradation_priority = 0;
        }
        if (subs) {
          if (subs.entries[subs_entry_index].sample_delta + last_subs_sample_index === j + 1) {
            sample2.subsamples = subs.entries[subs_entry_index].subsamples;
            last_subs_sample_index += subs.entries[subs_entry_index].sample_delta;
            subs_entry_index++;
          }
        }
      } else sample2.is_sync = true;
      ISOFile2.process_sdtp(trak.mdia.minf.stbl.sdtp, sample2, sample2.number);
      if (stdp) sample2.degradation_priority = stdp.priority[j];
      else sample2.degradation_priority = 0;
      if (subs) {
        if (subs.entries[subs_entry_index].sample_delta + last_subs_sample_index === j) {
          sample2.subsamples = subs.entries[subs_entry_index].subsamples;
          last_subs_sample_index += subs.entries[subs_entry_index].sample_delta;
        }
      }
      if (sbgps.length > 0 || sgpds.length > 0) ISOFile2.setSampleGroupProperties(trak, sample2, j, trak.sample_groups_info);
    }
    if (j > 0) {
      trak.samples[j - 1].duration = Math.max(trak.mdia.mdhd.duration - trak.samples[j - 1].dts, 0);
      trak.samples_duration += trak.samples[j - 1].duration;
    }
  }
  /**
  * Update sample list when new 'moof' boxes are received
  * @bundle isofile-sample-processing.js
  */
  updateSampleLists() {
    let default_sample_description_index;
    let default_sample_duration;
    let default_sample_size;
    let default_sample_flags;
    let last_run_position;
    if (this.moov === void 0) return;
    while (this.lastMoofIndex < this.moofs.length) {
      const box = this.moofs[this.lastMoofIndex];
      this.lastMoofIndex++;
      if (box.type === "moof") {
        const moof = box;
        for (let i = 0; i < moof.trafs.length; i++) {
          const traf = moof.trafs[i];
          const trak = this.getTrackById(traf.tfhd.track_id);
          const trex = this.getTrexById(traf.tfhd.track_id);
          if (traf.tfhd.flags & 2) default_sample_description_index = traf.tfhd.default_sample_description_index;
          else default_sample_description_index = trex ? trex.default_sample_description_index : 1;
          if (traf.tfhd.flags & 8) default_sample_duration = traf.tfhd.default_sample_duration;
          else default_sample_duration = trex ? trex.default_sample_duration : 0;
          if (traf.tfhd.flags & 16) default_sample_size = traf.tfhd.default_sample_size;
          else default_sample_size = trex ? trex.default_sample_size : 0;
          if (traf.tfhd.flags & 32) default_sample_flags = traf.tfhd.default_sample_flags;
          else default_sample_flags = trex ? trex.default_sample_flags : 0;
          traf.sample_number = 0;
          if (traf.sbgps.length > 0) ISOFile2.initSampleGroups(trak, traf, traf.sbgps, trak.mdia.minf.stbl.sgpds, traf.sgpds);
          for (let j = 0; j < traf.truns.length; j++) {
            const trun = traf.truns[j];
            for (let k = 0; k < trun.sample_count; k++) {
              const description_index = default_sample_description_index - 1;
              let sample_flags = default_sample_flags;
              if (trun.flags & 1024) sample_flags = trun.sample_flags[k];
              else if (k === 0 && trun.flags & 4) sample_flags = trun.first_sample_flags;
              let size = default_sample_size;
              if (trun.flags & 512) size = trun.sample_size[k];
              trak.samples_size += size;
              let duration2 = default_sample_duration;
              if (trun.flags & 256) duration2 = trun.sample_duration[k];
              trak.samples_duration += duration2;
              let dts;
              if (trak.first_traf_merged || k > 0) dts = trak.samples[trak.samples.length - 1].dts + trak.samples[trak.samples.length - 1].duration;
              else {
                if (traf.tfdt) dts = traf.tfdt.baseMediaDecodeTime;
                else dts = 0;
                trak.first_traf_merged = true;
              }
              let cts = dts;
              if (trun.flags & 2048) cts = dts + trun.sample_composition_time_offset[k];
              const bdop = traf.tfhd.flags & 1 ? true : false;
              const dbim = traf.tfhd.flags & 131072 ? true : false;
              const dop = trun.flags & 1 ? true : false;
              let bdo = 0;
              if (!bdop) if (!dbim) if (j === 0) bdo = moof.start;
              else bdo = last_run_position;
              else bdo = moof.start;
              else bdo = traf.tfhd.base_data_offset;
              let offset;
              if (j === 0 && k === 0) if (dop) offset = bdo + trun.data_offset;
              else offset = bdo;
              else offset = last_run_position;
              last_run_position = offset + size;
              const number_in_traf = traf.sample_number;
              traf.sample_number++;
              const sample2 = {
                cts,
                description_index,
                description: trak.mdia.minf.stbl.stsd.entries[description_index],
                dts,
                duration: duration2,
                moof_number: this.lastMoofIndex,
                number_in_traf,
                number: trak.samples.length,
                offset,
                size,
                timescale: trak.mdia.mdhd.timescale,
                track_id: trak.tkhd.track_id,
                is_sync: sample_flags >> 16 & 1 ? false : true,
                is_leading: sample_flags >> 26 & 3,
                depends_on: sample_flags >> 24 & 3,
                is_depended_on: sample_flags >> 22 & 3,
                has_redundancy: sample_flags >> 20 & 3,
                degradation_priority: sample_flags & 65535
              };
              traf.first_sample_index = trak.samples.length;
              trak.samples.push(sample2);
              if (traf.sbgps.length > 0 || traf.sgpds.length > 0 || trak.mdia.minf.stbl.sbgps.length > 0 || trak.mdia.minf.stbl.sgpds.length > 0) ISOFile2.setSampleGroupProperties(trak, sample2, sample2.number_in_traf, traf.sample_groups_info);
            }
          }
          if (traf.subs) {
            trak.has_fragment_subsamples = true;
            let sample_index = traf.first_sample_index;
            for (let j = 0; j < traf.subs.entries.length; j++) {
              sample_index += traf.subs.entries[j].sample_delta;
              const sample2 = trak.samples[sample_index - 1];
              sample2.subsamples = traf.subs.entries[j].subsamples;
            }
          }
        }
      }
    }
  }
  /**
  * Try to get sample data for a given sample:
  * returns null if not found
  * returns the same sample if already requested
  *
  * @bundle isofile-sample-processing.js
  */
  getSample(trak, sampleNum) {
    const sample2 = trak.samples[sampleNum];
    if (!this.moov) return;
    if (!sample2.data) {
      sample2.data = new Uint8Array(sample2.size);
      sample2.alreadyRead = 0;
      this.samplesDataSize += sample2.size;
      Log.debug("ISOFile", "Allocating sample #" + sampleNum + " on track #" + trak.tkhd.track_id + " of size " + sample2.size + " (total: " + this.samplesDataSize + ")");
    } else if (sample2.alreadyRead === sample2.size) return sample2;
    while (true) {
      let stream2 = this.stream;
      let index = stream2.findPosition(true, sample2.offset + sample2.alreadyRead, false);
      let buffer2;
      let fileStart;
      if (index > -1) {
        buffer2 = stream2.buffers[index];
        fileStart = buffer2.fileStart;
      } else for (const mdat of this.mdats) {
        if (!mdat.stream) {
          Log.debug("ISOFile", "mdat stream not yet fully read for #" + this.mdats.indexOf(mdat) + " mdat");
          continue;
        }
        index = mdat.stream.findPosition(true, sample2.offset + sample2.alreadyRead - mdat.start - mdat.hdr_size, false);
        if (index > -1) {
          stream2 = mdat.stream;
          buffer2 = mdat.stream.buffers[index];
          fileStart = mdat.start + mdat.hdr_size + buffer2.fileStart;
          break;
        }
      }
      if (buffer2) {
        const lengthAfterStart = buffer2.byteLength - (sample2.offset + sample2.alreadyRead - fileStart);
        if (sample2.size - sample2.alreadyRead <= lengthAfterStart) {
          Log.debug("ISOFile", "Getting sample #" + sampleNum + " data (alreadyRead: " + sample2.alreadyRead + " offset: " + (sample2.offset + sample2.alreadyRead - fileStart) + " read size: " + (sample2.size - sample2.alreadyRead) + " full size: " + sample2.size + ")");
          DataStream.memcpy(sample2.data.buffer, sample2.alreadyRead, buffer2, sample2.offset + sample2.alreadyRead - fileStart, sample2.size - sample2.alreadyRead);
          buffer2.usedBytes += sample2.size - sample2.alreadyRead;
          stream2.logBufferLevel();
          sample2.alreadyRead = sample2.size;
          return sample2;
        } else {
          if (lengthAfterStart === 0) return;
          Log.debug("ISOFile", "Getting sample #" + sampleNum + " partial data (alreadyRead: " + sample2.alreadyRead + " offset: " + (sample2.offset + sample2.alreadyRead - fileStart) + " read size: " + lengthAfterStart + " full size: " + sample2.size + ")");
          DataStream.memcpy(sample2.data.buffer, sample2.alreadyRead, buffer2, sample2.offset + sample2.alreadyRead - fileStart, lengthAfterStart);
          sample2.alreadyRead += lengthAfterStart;
          buffer2.usedBytes += lengthAfterStart;
          stream2.logBufferLevel();
        }
      } else return;
    }
  }
  /**
  * Release the memory used to store the data of the sample
  *
  * @bundle isofile-sample-processing.js
  */
  releaseSample(trak, sampleNum) {
    const sample2 = trak.samples[sampleNum];
    if (sample2.data) {
      this.samplesDataSize -= sample2.size;
      sample2.data = void 0;
      sample2.alreadyRead = 0;
      return sample2.size;
    } else return 0;
  }
  /** @bundle isofile-sample-processing.js */
  getAllocatedSampleDataSize() {
    return this.samplesDataSize;
  }
  /**
  * Builds the MIME Type 'codecs' sub-parameters for the whole file
  *
  * @bundle isofile-sample-processing.js
  */
  getCodecs() {
    let codecs = "";
    for (let i = 0; i < this.moov.traks.length; i++) {
      const trak = this.moov.traks[i];
      if (i > 0) codecs += ",";
      codecs += trak.mdia.minf.stbl.stsd.entries[0].getCodec();
    }
    return codecs;
  }
  /**
  * Helper function
  *
  * @bundle isofile-sample-processing.js
  */
  getTrexById(id) {
    if (!this.moov || !this.moov.mvex) return;
    for (let i = 0; i < this.moov.mvex.trexs.length; i++) {
      const trex = this.moov.mvex.trexs[i];
      if (trex.track_id === id) return trex;
    }
  }
  /**
  * Helper function
  *
  * @bundle isofile-sample-processing.js
  */
  getTrackById(id) {
    if (!this.moov) return;
    for (let j = 0; j < this.moov.traks.length; j++) {
      const trak = this.moov.traks[j];
      if (trak.tkhd.track_id === id) return trak;
    }
  }
  /** @bundle isofile-item-processing.js */
  flattenItemInfo() {
    const items = this.items;
    const entity_groups = this.entity_groups;
    const meta = this.meta;
    if (!meta || !meta.hdlr || !meta.iinf) return;
    for (let i = 0; i < meta.iinf.item_infos.length; i++) {
      const id = meta.iinf.item_infos[i].item_ID;
      items[id] = {
        id,
        name: meta.iinf.item_infos[i].item_name,
        ref_to: [],
        content_type: meta.iinf.item_infos[i].content_type,
        content_encoding: meta.iinf.item_infos[i].content_encoding,
        item_uri_type: meta.iinf.item_infos[i].item_uri_type,
        type: meta.iinf.item_infos[i].item_type ? meta.iinf.item_infos[i].item_type : "mime",
        protection: meta.iinf.item_infos[i].item_protection_index > 0 ? meta.ipro.protections[meta.iinf.item_infos[i].item_protection_index - 1] : void 0
      };
    }
    if (meta.grpl) for (let i = 0; i < meta.grpl.boxes.length; i++) {
      const entityGroup = meta.grpl.boxes[i];
      entity_groups[entityGroup.group_id] = {
        id: entityGroup.group_id,
        entity_ids: entityGroup.entity_ids,
        type: entityGroup.type
      };
    }
    if (meta.iloc) for (let i = 0; i < meta.iloc.items.length; i++) {
      const itemloc = meta.iloc.items[i];
      const item = items[itemloc.item_ID];
      if (itemloc.data_reference_index !== 0) {
        Log.warn("Item storage with reference to other files: not supported");
        item.source = meta.dinf.boxes[itemloc.data_reference_index - 1];
      }
      item.extents = [];
      item.size = 0;
      for (let j = 0; j < itemloc.extents.length; j++) {
        item.extents[j] = {
          offset: itemloc.extents[j].extent_offset + itemloc.base_offset,
          length: itemloc.extents[j].extent_length,
          alreadyRead: 0
        };
        if (itemloc.construction_method === 1) item.extents[j].offset += meta.idat.start + meta.idat.hdr_size;
        item.size += item.extents[j].length;
      }
    }
    if (meta.pitm) {
      const id = meta.pitm.item_id;
      if (!items[id]) Log.warn("ISOFile", "Primary item_id #" + id + " does not exist in items");
      else items[id].primary = true;
    }
    if (meta.iref) for (let i = 0; i < meta.iref.references.length; i++) {
      const ref = meta.iref.references[i];
      for (let j = 0; j < ref.references.length; j++) items[ref.from_item_ID].ref_to.push({
        type: ref.type,
        id: ref.references[j]
      });
    }
    if (meta.iprp) for (let k = 0; k < meta.iprp.ipmas.length; k++) {
      const ipma = meta.iprp.ipmas[k];
      for (let i = 0; i < ipma.associations.length; i++) {
        const association = ipma.associations[i];
        const item = items[association.id] ?? entity_groups[association.id];
        if (item) {
          if (item.properties === void 0) item.properties = { boxes: [] };
          for (let j = 0; j < association.props.length; j++) {
            const propEntry = association.props[j];
            if (propEntry.property_index > 0 && propEntry.property_index - 1 < meta.iprp.ipco.boxes.length) {
              const propbox = meta.iprp.ipco.boxes[propEntry.property_index - 1];
              item.properties[propbox.type] = propbox;
              item.properties.boxes.push(propbox);
            }
          }
        }
      }
    }
  }
  /** @bundle isofile-item-processing.js */
  getItem(item_id) {
    if (!this.meta) return;
    const item = this.items[item_id];
    if (!item.data && item.size) {
      item.data = new Uint8Array(item.size);
      item.alreadyRead = 0;
      this.itemsDataSize += item.size;
      Log.debug("ISOFile", "Allocating item #" + item_id + " of size " + item.size + " (total: " + this.itemsDataSize + ")");
    } else if (item.alreadyRead === item.size) return item;
    for (let i = 0; i < item.extents.length; i++) {
      const extent = item.extents[i];
      if (extent.alreadyRead === extent.length) continue;
      else {
        const index = this.stream.findPosition(true, extent.offset + extent.alreadyRead, false);
        if (index > -1) {
          const buffer2 = this.stream.buffers[index];
          const lengthAfterStart = buffer2.byteLength - (extent.offset + extent.alreadyRead - buffer2.fileStart);
          if (extent.length - extent.alreadyRead <= lengthAfterStart) {
            Log.debug("ISOFile", "Getting item #" + item_id + " extent #" + i + " data (alreadyRead: " + extent.alreadyRead + " offset: " + (extent.offset + extent.alreadyRead - buffer2.fileStart) + " read size: " + (extent.length - extent.alreadyRead) + " full extent size: " + extent.length + " full item size: " + item.size + ")");
            DataStream.memcpy(item.data.buffer, item.alreadyRead, buffer2, extent.offset + extent.alreadyRead - buffer2.fileStart, extent.length - extent.alreadyRead);
            if (!this.parsingMdat || this.discardMdatData) buffer2.usedBytes += extent.length - extent.alreadyRead;
            this.stream.logBufferLevel();
            item.alreadyRead += extent.length - extent.alreadyRead;
            extent.alreadyRead = extent.length;
          } else {
            Log.debug("ISOFile", "Getting item #" + item_id + " extent #" + i + " partial data (alreadyRead: " + extent.alreadyRead + " offset: " + (extent.offset + extent.alreadyRead - buffer2.fileStart) + " read size: " + lengthAfterStart + " full extent size: " + extent.length + " full item size: " + item.size + ")");
            DataStream.memcpy(item.data.buffer, item.alreadyRead, buffer2, extent.offset + extent.alreadyRead - buffer2.fileStart, lengthAfterStart);
            extent.alreadyRead += lengthAfterStart;
            item.alreadyRead += lengthAfterStart;
            if (!this.parsingMdat || this.discardMdatData) buffer2.usedBytes += lengthAfterStart;
            this.stream.logBufferLevel();
            return;
          }
        } else return;
      }
    }
    if (item.alreadyRead === item.size) return item;
  }
  /**
  * Release the memory used to store the data of the item
  *
  * @bundle isofile-item-processing.js
  */
  releaseItem(item_id) {
    const item = this.items[item_id];
    if (item.data) {
      this.itemsDataSize -= item.size;
      item.data = void 0;
      item.alreadyRead = 0;
      for (let i = 0; i < item.extents.length; i++) {
        const extent = item.extents[i];
        extent.alreadyRead = 0;
      }
      return item.size;
    } else return 0;
  }
  /** @bundle isofile-item-processing.js */
  processItems(callback) {
    for (const i in this.items) {
      const item = this.items[i];
      this.getItem(item.id);
      if (callback && !item.sent) {
        callback(item);
        item.sent = true;
        item.data = void 0;
      }
    }
  }
  /** @bundle isofile-item-processing.js */
  hasItem(name2) {
    for (const i in this.items) {
      const item = this.items[i];
      if (item.name === name2) return item.id;
    }
    return -1;
  }
  /** @bundle isofile-item-processing.js */
  getMetaHandler() {
    if (this.meta) return this.meta.hdlr.handler;
  }
  /** @bundle isofile-item-processing.js */
  getPrimaryItem() {
    if (this.meta && this.meta.pitm) return this.getItem(this.meta.pitm.item_id);
  }
  /** @bundle isofile-item-processing.js */
  itemToFragmentedTrackFile({ itemId } = {}) {
    let item;
    if (itemId) item = this.getItem(itemId);
    else item = this.getPrimaryItem();
    if (!item) return;
    const file = new ISOFile2();
    file.discardMdatData = false;
    const trackOptions = {
      type: item.type,
      description_boxes: item.properties.boxes
    };
    if (item.properties.ispe) {
      trackOptions.width = item.properties.ispe.image_width;
      trackOptions.height = item.properties.ispe.image_height;
    }
    const trackId = file.addTrack(trackOptions);
    if (trackId) {
      file.addSample(trackId, item.data);
      return file;
    }
  }
  /** @bundle isofile-advanced-parsing.js */
  processIncompleteBox(ret) {
    if (ret.type === "mdat") {
      const box = new mdatBox(ret.size);
      this.parsingMdat = box;
      this.boxes.push(box);
      this.mdats.push(box);
      box.start = ret.start;
      box.hdr_size = ret.hdr_size;
      box.original_size = ret.original_size;
      this.stream.addUsedBytes(box.hdr_size);
      this.lastBoxStartPosition = box.start + box.size;
      if (this.stream.seek(box.start + box.size, false, this.discardMdatData)) {
        this.transferMdatData();
        this.parsingMdat = void 0;
        return true;
      } else {
        if (!this.moovStartFound) this.nextParsePosition = box.start + box.size;
        else this.nextParsePosition = this.stream.findEndContiguousBuf();
        return false;
      }
    } else {
      if (ret.type === "moov") {
        this.moovStartFound = true;
        if (this.mdats.length === 0) this.isProgressive = true;
      }
      if (this.stream.mergeNextBuffer ? this.stream.mergeNextBuffer() : false) {
        this.nextParsePosition = this.stream.getEndPosition();
        return true;
      } else {
        if (!ret.type) this.nextParsePosition = this.stream.getEndPosition();
        else if (this.moovStartFound) this.nextParsePosition = this.stream.getEndPosition();
        else this.nextParsePosition = this.stream.getPosition() + ret.size;
        return false;
      }
    }
  }
  /** @bundle isofile-advanced-parsing.js */
  hasIncompleteMdat() {
    return this.parsingMdat !== void 0;
  }
  /**
  * Transfer the data of the mdat box to its stream
  * @param mdat the mdat box to use
  */
  transferMdatData(inMdat) {
    const mdat = inMdat ?? this.parsingMdat;
    if (this.discardMdatData) {
      Log.debug("ISOFile", "Discarding 'mdat' data, not transferring it to the mdat box stream");
      return;
    }
    if (!mdat) {
      Log.warn("ISOFile", "Cannot transfer 'mdat' data, no mdat box is being parsed");
      return;
    }
    const startBufferIndex = this.stream.findPosition(true, mdat.start + mdat.hdr_size, false);
    const endBufferIndex = this.stream.findPosition(true, mdat.start + mdat.size, false);
    if (startBufferIndex === -1 || endBufferIndex === -1) {
      Log.warn("ISOFile", "Cannot transfer 'mdat' data, start or end buffer not found");
      return;
    }
    mdat.stream = new MultiBufferStream();
    for (let i = startBufferIndex; i <= endBufferIndex; i++) {
      const buffer2 = this.stream.buffers[i];
      const startOffset = i === startBufferIndex ? mdat.start + mdat.hdr_size - buffer2.fileStart : 0;
      const endOffset = i === endBufferIndex ? mdat.start + mdat.size - buffer2.fileStart : buffer2.byteLength;
      if (endOffset > startOffset) {
        Log.debug("ISOFile", "Transferring 'mdat' data from buffer #" + i + " (" + startOffset + " to " + endOffset + ")");
        const transferSize = endOffset - startOffset;
        const newBuffer = new MP4BoxBuffer(transferSize);
        const lastPosition = mdat.stream.getAbsoluteEndPosition();
        DataStream.memcpy(newBuffer, 0, buffer2, startOffset, transferSize);
        newBuffer.fileStart = lastPosition;
        mdat.stream.insertBuffer(newBuffer);
        buffer2.usedBytes += transferSize;
      }
    }
  }
  /** @bundle isofile-advanced-parsing.js */
  processIncompleteMdat() {
    const box = this.parsingMdat;
    if (this.stream.seek(box.start + box.size, false, this.discardMdatData)) {
      Log.debug("ISOFile", "Found 'mdat' end in buffered data");
      this.transferMdatData();
      this.parsingMdat = void 0;
      return true;
    } else {
      this.nextParsePosition = this.stream.findEndContiguousBuf();
      return false;
    }
  }
  /** @bundle isofile-advanced-parsing.js */
  restoreParsePosition() {
    return this.stream.seek(this.lastBoxStartPosition, true, this.discardMdatData);
  }
  /** @bundle isofile-advanced-parsing.js */
  saveParsePosition() {
    this.lastBoxStartPosition = this.stream.getPosition();
  }
  /** @bundle isofile-advanced-parsing.js */
  updateUsedBytes(box, _ret) {
    if (this.stream.addUsedBytes) if (box.type === "mdat") {
      this.stream.addUsedBytes(box.hdr_size);
      if (this.discardMdatData) this.stream.addUsedBytes(box.size - box.hdr_size);
    } else this.stream.addUsedBytes(box.size);
  }
  /** @bundle isofile-advanced-creation.js */
  addBox(box) {
    return Box.prototype.addBox.call(this, box);
  }
  /** @bundle isofile-advanced-creation.js */
  init(options = {}) {
    const ftyp = this.addBox(new ftypBox());
    ftyp.major_brand = options.brands && options.brands[0] || "iso4";
    ftyp.minor_version = 0;
    ftyp.compatible_brands = options.brands || ["iso4"];
    const moov = this.addBox(new moovBox());
    moov.addBox(new mvexBox());
    const mvhd = moov.addBox(new mvhdBox());
    mvhd.timescale = options.timescale || 600;
    mvhd.rate = options.rate || 65536;
    mvhd.creation_time = 0;
    mvhd.modification_time = 0;
    mvhd.duration = options.duration || 0;
    mvhd.volume = options.width ? 0 : 256;
    mvhd.matrix = [
      65536,
      0,
      0,
      0,
      65536,
      0,
      0,
      0,
      1073741824
    ];
    mvhd.next_track_id = 1;
    return this;
  }
  /** @bundle isofile-advanced-creation.js */
  addTrack(_options = {}) {
    if (!this.moov) this.init(_options);
    const options = _options || {};
    options.width = options.width || 320;
    options.height = options.height || 320;
    options.id = options.id || this.moov.mvhd.next_track_id;
    options.type = options.type || "avc1";
    const trak = this.moov.addBox(new trakBox());
    this.moov.mvhd.next_track_id = options.id + 1;
    const tkhd = trak.addBox(new tkhdBox());
    tkhd.flags = 1 | 2 | 4;
    tkhd.creation_time = 0;
    tkhd.modification_time = 0;
    tkhd.track_id = options.id;
    tkhd.duration = options.duration || 0;
    tkhd.layer = options.layer || 0;
    tkhd.alternate_group = 0;
    tkhd.volume = 1;
    tkhd.matrix = [
      65536,
      0,
      0,
      0,
      65536,
      0,
      0,
      0,
      1073741824
    ];
    tkhd.width = options.width << 16;
    tkhd.height = options.height << 16;
    const mdia = trak.addBox(new mdiaBox());
    const mdhd = mdia.addBox(new mdhdBox());
    mdhd.creation_time = 0;
    mdhd.modification_time = 0;
    mdhd.timescale = options.timescale || 1;
    mdhd.duration = options.media_duration || 0;
    mdhd.language = options.language || "und";
    const hdlr = mdia.addBox(new hdlrBox());
    hdlr.handler = options.hdlr || "vide";
    hdlr.name = options.name || "Track created with MP4Box.js";
    const elng = mdia.addBox(new elngBox());
    elng.extended_language = options.language || "fr-FR";
    const minf = mdia.addBox(new minfBox());
    const sampleEntry = BoxRegistry.sampleEntry[options.type];
    if (!sampleEntry) return;
    const sample_description_entry = new sampleEntry();
    sample_description_entry.data_reference_index = 1;
    if (sample_description_entry instanceof VisualSampleEntry) {
      const sde = sample_description_entry;
      const vmhd = minf.addBox(new vmhdBox());
      vmhd.graphicsmode = 0;
      vmhd.opcolor = [
        0,
        0,
        0
      ];
      sde.width = options.width;
      sde.height = options.height;
      sde.horizresolution = 72 << 16;
      sde.vertresolution = 72 << 16;
      sde.frame_count = 1;
      sde.compressorname = options.type + " Compressor";
      sde.depth = 24;
      if (options.avcDecoderConfigRecord) sde.addBox(new avcCBox(options.avcDecoderConfigRecord.byteLength)).parse(new DataStream(options.avcDecoderConfigRecord));
      else if (options.hevcDecoderConfigRecord) sde.addBox(new hvcCBox(options.hevcDecoderConfigRecord.byteLength)).parse(new DataStream(options.hevcDecoderConfigRecord));
    } else if (sample_description_entry instanceof AudioSampleEntry) {
      const sde = sample_description_entry;
      const smhd = minf.addBox(new smhdBox());
      smhd.balance = options.balance || 0;
      sde.channel_count = options.channel_count || 2;
      sde.samplesize = options.samplesize || 16;
      sde.samplerate = options.samplerate || 65536;
    } else if (sample_description_entry instanceof HintSampleEntry) minf.addBox(new hmhdBox());
    else if (sample_description_entry instanceof SubtitleSampleEntry) {
      minf.addBox(new sthdBox());
      if (sample_description_entry instanceof stppSampleEntry) {
        sample_description_entry.namespace = options.namespace || "nonamespace";
        sample_description_entry.schema_location = options.schema_location || "";
        sample_description_entry.auxiliary_mime_types = options.auxiliary_mime_types || "";
      }
    } else if (sample_description_entry instanceof MetadataSampleEntry) minf.addBox(new nmhdBox());
    else if (sample_description_entry instanceof SystemSampleEntry) minf.addBox(new nmhdBox());
    else minf.addBox(new nmhdBox());
    if (options.description) sample_description_entry.addBox.call(sample_description_entry, options.description);
    if (options.description_boxes) options.description_boxes.forEach(function(b) {
      sample_description_entry.addBox.call(sample_description_entry, b);
    });
    const dref = minf.addBox(new dinfBox()).addBox(new drefBox());
    const url = new urlBox();
    url.flags = 1;
    dref.addEntry(url);
    const stbl = minf.addBox(new stblBox());
    stbl.addBox(new stsdBox()).addEntry(sample_description_entry);
    const stts = stbl.addBox(new sttsBox());
    stts.sample_counts = [];
    stts.sample_deltas = [];
    const stsc = stbl.addBox(new stscBox());
    stsc.first_chunk = [];
    stsc.samples_per_chunk = [];
    stsc.sample_description_index = [];
    const stco = stbl.addBox(new stcoBox());
    stco.chunk_offsets = [];
    const stsz = stbl.addBox(new stszBox());
    stsz.sample_sizes = [];
    const trex = this.moov.mvex.addBox(new trexBox());
    trex.track_id = options.id;
    trex.default_sample_description_index = options.default_sample_description_index || 1;
    trex.default_sample_duration = options.default_sample_duration || 0;
    trex.default_sample_size = options.default_sample_size || 0;
    trex.default_sample_flags = options.default_sample_flags || 0;
    this.buildTrakSampleLists(trak);
    return options.id;
  }
  /** @bundle isofile-advanced-creation.js */
  addSample(track_id, data3, { sample_description_index, duration: duration2 = 1, cts = 0, dts = 0, is_sync = false, is_leading = 0, depends_on = 0, is_depended_on = 0, has_redundancy = 0, degradation_priority = 0, subsamples, offset = 0 } = {}) {
    const trak = this.getTrackById(track_id);
    if (trak === void 0) return;
    const descriptionIndex = sample_description_index ? sample_description_index - 1 : 0;
    const sample2 = {
      number: trak.samples.length,
      track_id: trak.tkhd.track_id,
      timescale: trak.mdia.mdhd.timescale,
      description_index: descriptionIndex,
      description: trak.mdia.minf.stbl.stsd.entries[descriptionIndex],
      data: data3,
      size: data3.byteLength,
      alreadyRead: data3.byteLength,
      duration: duration2,
      cts,
      dts,
      is_sync,
      is_leading,
      depends_on,
      is_depended_on,
      has_redundancy,
      degradation_priority,
      offset,
      subsamples
    };
    trak.samples.push(sample2);
    trak.samples_size += sample2.size;
    trak.samples_duration += sample2.duration;
    if (trak.first_dts === void 0) trak.first_dts = dts;
    this.processSamples();
    const moof = this.addBox(this.createMoof([sample2]));
    moof.computeSize();
    moof.trafs[0].truns[0].data_offset = moof.size + 8;
    const mdat = this.addBox(new mdatBox());
    mdat.data = new Uint8Array(data3);
    return sample2;
  }
  /** @bundle isofile-advanced-creation.js */
  createMoof(samples2) {
    if (samples2.length === 0) return;
    if (samples2.some((s) => s.track_id !== samples2[0].track_id)) throw new Error("Cannot create moof for samples from different tracks: " + samples2.map((s) => s.track_id).join(", "));
    const trackId = samples2[0].track_id;
    const trak = this.getTrackById(trackId);
    if (!trak) throw new Error("Cannot create moof for non-existing track: " + trackId);
    const moof = new moofBox();
    const mfhd = moof.addBox(new mfhdBox());
    mfhd.sequence_number = ++this.nextMoofNumber;
    const traf = moof.addBox(new trafBox());
    const tfhd = traf.addBox(new tfhdBox());
    tfhd.track_id = trackId;
    tfhd.flags = TFHD_FLAG_DEFAULT_BASE_IS_MOOF;
    const tfdt = traf.addBox(new tfdtBox());
    tfdt.baseMediaDecodeTime = samples2[0].dts - (trak.first_dts || 0);
    const trun = traf.addBox(new trunBox());
    trun.flags = 1 | 256 | 512 | TRUN_FLAGS_FLAGS | TRUN_FLAGS_CTS_OFFSET;
    trun.data_offset = 0;
    trun.first_sample_flags = 0;
    trun.sample_count = samples2.length;
    for (const sample2 of samples2) {
      let sample_flags = 0;
      if (sample2.is_sync) sample_flags = 1 << 25;
      else sample_flags = 65536;
      trun.sample_duration.push(sample2.duration);
      trun.sample_size.push(sample2.size);
      trun.sample_flags.push(sample_flags);
      trun.sample_composition_time_offset.push(sample2.cts - sample2.dts);
    }
    return moof;
  }
  /** @bundle box-print.js */
  print(output) {
    output.indent = "";
    for (let i = 0; i < this.boxes.length; i++) if (this.boxes[i]) this.boxes[i].print(output);
  }
};
function createFile(keepMdatData = false, stream2) {
  return new ISOFile(stream2, !keepMdatData);
}
var emsgBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "EventMessageBox";
  }
  static {
    this.fourcc = "emsg";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) {
      this.timescale = stream2.readUint32();
      this.presentation_time = stream2.readUint64();
      this.event_duration = stream2.readUint32();
      this.id = stream2.readUint32();
      this.scheme_id_uri = stream2.readCString();
      this.value = stream2.readCString();
    } else {
      this.scheme_id_uri = stream2.readCString();
      this.value = stream2.readCString();
      this.timescale = stream2.readUint32();
      this.presentation_time_delta = stream2.readUint32();
      this.event_duration = stream2.readUint32();
      this.id = stream2.readUint32();
    }
    let message_size = this.size - this.hdr_size - (16 + (this.scheme_id_uri.length + 1) + (this.value.length + 1));
    if (this.version === 1) message_size -= 4;
    this.message_data = stream2.readUint8Array(message_size);
  }
  /** @bundle writing/emsg.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 16 + this.message_data.length + (this.scheme_id_uri.length + 1) + (this.value.length + 1);
    this.writeHeader(stream2);
    stream2.writeCString(this.scheme_id_uri);
    stream2.writeCString(this.value);
    stream2.writeUint32(this.timescale);
    stream2.writeUint32(this.presentation_time_delta);
    stream2.writeUint32(this.event_duration);
    stream2.writeUint32(this.id);
    stream2.writeUint8Array(this.message_data);
  }
};
var ssixBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompressedSubsegmentIndexBox";
  }
  static {
    this.fourcc = "ssix";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.subsegments = [];
    const subsegment_count = stream2.readUint32();
    for (let i = 0; i < subsegment_count; i++) {
      const subsegment = {};
      this.subsegments.push(subsegment);
      subsegment.ranges = [];
      const range_count = stream2.readUint32();
      for (let j = 0; j < range_count; j++) {
        const range = {};
        subsegment.ranges.push(range);
        range.level = stream2.readUint8();
        range.range_size = stream2.readUint24();
      }
    }
  }
};
var stypBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SegmentTypeBox";
  }
  static {
    this.fourcc = "styp";
  }
  parse(stream2) {
    let toparse = this.size - this.hdr_size;
    this.major_brand = stream2.readString(4);
    this.minor_version = stream2.readUint32();
    toparse -= 8;
    this.compatible_brands = [];
    let i = 0;
    while (toparse >= 4) {
      this.compatible_brands[i] = stream2.readString(4);
      toparse -= 4;
      i++;
    }
  }
  write(stream2) {
    this.size = 8 + 4 * this.compatible_brands.length;
    this.writeHeader(stream2);
    stream2.writeString(this.major_brand, void 0, 4);
    stream2.writeUint32(this.minor_version);
    for (let i = 0; i < this.compatible_brands.length; i++) stream2.writeString(this.compatible_brands[i], void 0, 4);
  }
};

// node_modules/mp4box/dist/mp4box.all.mjs
var descriptor_exports = /* @__PURE__ */ __exportAll({
  Descriptor: () => Descriptor,
  ES_Descriptor: () => ES_Descriptor,
  MPEG4DescriptorParser: () => MPEG4DescriptorParser
});
var ES_DescrTag = 3;
var DecoderConfigDescrTag = 4;
var DecSpecificInfoTag = 5;
var SLConfigDescrTag = 6;
var Descriptor = class Descriptor2 {
  constructor(tag, size) {
    this.tag = tag;
    this.size = size;
    this.descs = [];
  }
  parse(stream2) {
    this.data = stream2.readUint8Array(this.size);
  }
  findDescriptor(tag) {
    for (let i = 0; i < this.descs.length; i++) if (this.descs[i].tag === tag) return this.descs[i];
  }
  parseOneDescriptor(stream2) {
    let size = 0;
    const tag = stream2.readUint8();
    let byteRead = stream2.readUint8();
    while (byteRead & 128) {
      size = (size << 7) + (byteRead & 127);
      byteRead = stream2.readUint8();
    }
    size = (size << 7) + (byteRead & 127);
    Log.debug("Descriptor", "Found " + (descTagToName[tag] || "Descriptor " + tag) + ", size " + size + " at position " + stream2.getPosition());
    const desc = descTagToName[tag] ? new DESCRIPTOR_CLASSES[descTagToName[tag]](size) : new Descriptor2(size);
    desc.parse(stream2);
    return desc;
  }
  parseRemainingDescriptors(stream2) {
    const start2 = stream2.getPosition();
    while (stream2.getPosition() < start2 + this.size) {
      const desc = this.parseOneDescriptor?.(stream2);
      this.descs.push(desc);
    }
  }
};
var ES_Descriptor = class extends Descriptor {
  constructor(size) {
    super(ES_DescrTag, size);
  }
  parse(stream2) {
    this.ES_ID = stream2.readUint16();
    this.flags = stream2.readUint8();
    this.size -= 3;
    if (this.flags & 128) {
      this.dependsOn_ES_ID = stream2.readUint16();
      this.size -= 2;
    } else this.dependsOn_ES_ID = 0;
    if (this.flags & 64) {
      const l = stream2.readUint8();
      this.URL = stream2.readString(l);
      this.size -= l + 1;
    } else this.URL = "";
    if (this.flags & 32) {
      this.OCR_ES_ID = stream2.readUint16();
      this.size -= 2;
    } else this.OCR_ES_ID = 0;
    this.parseRemainingDescriptors(stream2);
  }
  getOTI() {
    const dcd = this.findDescriptor(DecoderConfigDescrTag);
    if (dcd) return dcd.oti;
    else return 0;
  }
  getAudioConfig() {
    const dcd = this.findDescriptor(DecoderConfigDescrTag);
    if (!dcd) return;
    const dsi = dcd.findDescriptor(DecSpecificInfoTag);
    if (dsi && dsi.data) {
      let audioObjectType = (dsi.data[0] & 248) >> 3;
      if (audioObjectType === 31 && dsi.data.length >= 2) audioObjectType = 32 + ((dsi.data[0] & 7) << 3) + ((dsi.data[1] & 224) >> 5);
      return audioObjectType;
    }
  }
};
var DecoderConfigDescriptor = class extends Descriptor {
  constructor(size) {
    super(DecoderConfigDescrTag, size);
  }
  parse(stream2) {
    this.oti = stream2.readUint8();
    this.streamType = stream2.readUint8();
    this.upStream = (this.streamType >> 1 & 1) !== 0;
    this.streamType = this.streamType >>> 2;
    this.bufferSize = stream2.readUint24();
    this.maxBitrate = stream2.readUint32();
    this.avgBitrate = stream2.readUint32();
    this.size -= 13;
    this.parseRemainingDescriptors(stream2);
  }
};
var DecoderSpecificInfo = class extends Descriptor {
  constructor(size) {
    super(DecSpecificInfoTag, size);
  }
};
var SLConfigDescriptor = class extends Descriptor {
  constructor(size) {
    super(SLConfigDescrTag, size);
  }
};
var DESCRIPTOR_CLASSES = {
  Descriptor,
  ES_Descriptor,
  DecoderConfigDescriptor,
  DecoderSpecificInfo,
  SLConfigDescriptor
};
var descTagToName = {
  [ES_DescrTag]: "ES_Descriptor",
  [DecoderConfigDescrTag]: "DecoderConfigDescriptor",
  [DecSpecificInfoTag]: "DecoderSpecificInfo",
  [SLConfigDescrTag]: "SLConfigDescriptor"
};
var MPEG4DescriptorParser = class {
  constructor() {
    this.parseOneDescriptor = Descriptor.prototype.parseOneDescriptor;
  }
  getDescriptorName(tag) {
    return descTagToName[tag];
  }
};
var a1lxBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "AV1LayeredImageIndexingProperty";
  }
  static {
    this.fourcc = "a1lx";
  }
  parse(stream2) {
    const FieldLength = ((stream2.readUint8() & 1) + 1) * 16;
    this.layer_size = [];
    for (let i = 0; i < 3; i++) if (FieldLength === 16) this.layer_size[i] = stream2.readUint16();
    else this.layer_size[i] = stream2.readUint32();
  }
};
var a1opBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "OperatingPointSelectorProperty";
  }
  static {
    this.fourcc = "a1op";
  }
  parse(stream2) {
    this.op_index = stream2.readUint8();
  }
};
var auxCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "AuxiliaryTypeProperty";
  }
  static {
    this.fourcc = "auxC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.aux_type = stream2.readCString();
    const aux_subtype_length = this.size - this.hdr_size - (this.aux_type.length + 1);
    this.aux_subtype = stream2.readUint8Array(aux_subtype_length);
  }
};
var btrtBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "BitRateBox";
  }
  static {
    this.fourcc = "btrt";
  }
  parse(stream2) {
    this.bufferSizeDB = stream2.readUint32();
    this.maxBitrate = stream2.readUint32();
    this.avgBitrate = stream2.readUint32();
  }
};
var ccstBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CodingConstraintsBox";
  }
  static {
    this.fourcc = "ccst";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const flags = stream2.readUint8();
    this.all_ref_pics_intra = (flags & 128) === 128;
    this.intra_pred_used = (flags & 64) === 64;
    this.max_ref_per_pic = (flags & 63) >> 2;
    stream2.readUint24();
  }
};
var cdefBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ComponentDefinitionBox";
  }
  static {
    this.fourcc = "cdef";
  }
  parse(stream2) {
    this.channel_count = stream2.readUint16();
    this.channel_indexes = [];
    this.channel_types = [];
    this.channel_associations = [];
    for (let i = 0; i < this.channel_count; i++) {
      this.channel_indexes.push(stream2.readUint16());
      this.channel_types.push(stream2.readUint16());
      this.channel_associations.push(stream2.readUint16());
    }
  }
};
var clapBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CleanApertureBox";
  }
  static {
    this.fourcc = "clap";
  }
  parse(stream2) {
    this.cleanApertureWidthN = stream2.readUint32();
    this.cleanApertureWidthD = stream2.readUint32();
    this.cleanApertureHeightN = stream2.readUint32();
    this.cleanApertureHeightD = stream2.readUint32();
    this.horizOffN = stream2.readUint32();
    this.horizOffD = stream2.readUint32();
    this.vertOffN = stream2.readUint32();
    this.vertOffD = stream2.readUint32();
  }
};
var clliBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ContentLightLevelBox";
  }
  static {
    this.fourcc = "clli";
  }
  parse(stream2) {
    this.max_content_light_level = stream2.readUint16();
    this.max_pic_average_light_level = stream2.readUint16();
  }
};
var cmexBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CameraExtrinsicMatrixProperty";
  }
  static {
    this.fourcc = "cmex";
  }
  parse(stream2) {
    if (this.flags & 1) this.pos_x = stream2.readInt32();
    if (this.flags & 2) this.pos_y = stream2.readInt32();
    if (this.flags & 4) this.pos_z = stream2.readInt32();
    if (this.flags & 8) {
      if (this.version === 0) if (this.flags & 16) {
        this.quat_x = stream2.readInt32();
        this.quat_y = stream2.readInt32();
        this.quat_z = stream2.readInt32();
      } else {
        this.quat_x = stream2.readInt16();
        this.quat_y = stream2.readInt16();
        this.quat_z = stream2.readInt16();
      }
      else if (this.version === 1) {
      }
    }
    if (this.flags & 32) this.id = stream2.readUint32();
  }
};
var cminBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CameraIntrinsicMatrixProperty";
  }
  static {
    this.fourcc = "cmin";
  }
  parse(stream2) {
    this.focal_length_x = stream2.readInt32();
    this.principal_point_x = stream2.readInt32();
    this.principal_point_y = stream2.readInt32();
    if (this.flags & 1) {
      this.focal_length_y = stream2.readInt32();
      this.skew_factor = stream2.readInt32();
    }
  }
};
var cmpCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompressionConfigurationBox";
  }
  static {
    this.fourcc = "cmpC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.compression_type = stream2.readString(4);
    this.compressed_unit_type = stream2.readUint8();
  }
};
var cmpdBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ComponentDefinitionBox";
  }
  static {
    this.fourcc = "cmpd";
  }
  parse(stream2) {
    this.component_count = stream2.readUint32();
    this.component_types = [];
    this.component_type_urls = [];
    for (let i = 0; i < this.component_count; i++) {
      const component_type = stream2.readUint16();
      this.component_types.push(component_type);
      if (component_type >= 32768) this.component_type_urls.push(stream2.readCString());
    }
  }
};
var co64Box = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ChunkLargeOffsetBox";
  }
  static {
    this.fourcc = "co64";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.chunk_offsets = [];
    if (this.version === 0) for (let i = 0; i < entry_count; i++) this.chunk_offsets.push(stream2.readUint64());
  }
  /** @bundle writing/co64.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 8 * this.chunk_offsets.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.chunk_offsets.length);
    for (let i = 0; i < this.chunk_offsets.length; i++) stream2.writeUint64(this.chunk_offsets[i]);
  }
};
var CoLLBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ContentLightLevelBox";
  }
  static {
    this.fourcc = "CoLL";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.maxCLL = stream2.readUint16();
    this.maxFALL = stream2.readUint16();
  }
};
var SphereRegion = class {
  toString() {
    let s = "centre_azimuth: ";
    s += this.centre_azimuth;
    s += " (";
    s += this.centre_azimuth * 2 ** -16;
    s += "\xB0), centre_elevation: ";
    s += this.centre_elevation;
    s += " (";
    s += this.centre_elevation * 2 ** -16;
    s += "\xB0), centre_tilt: ";
    s += this.centre_tilt;
    s += " (";
    s += this.centre_tilt * 2 ** -16;
    s += "\xB0)";
    if (this.range_included_flag) {
      s += ", azimuth_range: ";
      s += this.azimuth_range;
      s += " (";
      s += this.azimuth_range * 2 ** -16;
      s += "\xB0), elevation_range: ";
      s += this.elevation_range;
      s += " (";
      s += this.elevation_range * 2 ** -16;
      s += "\xB0)";
    }
    if (this.interpolate_included_flag) {
      s += ", interpolate: ";
      s += this.interpolate;
    }
    return s;
  }
};
var CoverageSphereRegion = class {
  toString() {
    let s = "";
    if (this.view_idc) {
      s += "view_idc: ";
      s += this.view_idc;
      s += ", ";
    }
    s += "sphere_region: {";
    s += this.sphere_region;
    s += "}";
    return s;
  }
};
var coviBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CoverageInformationBox";
  }
  static {
    this.fourcc = "covi";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.coverage_shape_type = stream2.readUint8();
    const num_regions = stream2.readUint8();
    const f = stream2.readInt8();
    const view_idc_presence_flag = f & 128;
    if (view_idc_presence_flag) this.default_view_idc = (f & 96) >> 5;
    this.coverage_regions = new Array();
    for (let i = 0; i < num_regions; i++) {
      const region = new CoverageSphereRegion();
      if (view_idc_presence_flag) region.view_idc = stream2.readUint8() >> 6;
      region.sphere_region = this.parseSphereRegion(stream2, true, true);
      this.coverage_regions.push(region);
    }
  }
  parseSphereRegion(stream2, range_included_flag, interpolate_included_flag) {
    const sphere_region = new SphereRegion();
    sphere_region.centre_azimuth = stream2.readInt32();
    sphere_region.centre_elevation = stream2.readInt32();
    sphere_region.centre_tilt = stream2.readInt32();
    sphere_region.range_included_flag = range_included_flag;
    if (range_included_flag) {
      sphere_region.azimuth_range = stream2.readUint32();
      sphere_region.elevation_range = stream2.readUint32();
    }
    sphere_region.interpolate_included_flag = interpolate_included_flag;
    if (interpolate_included_flag) sphere_region.interpolate = (stream2.readUint8() & 128) === 128;
    return sphere_region;
  }
};
var cprtBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CopyrightBox";
  }
  static {
    this.fourcc = "cprt";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.parseLanguage(stream2);
    this.notice = stream2.readCString();
  }
};
var cschBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompatibleSchemeTypeBox";
  }
  static {
    this.fourcc = "csch";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.scheme_type = stream2.readString(4);
    this.scheme_version = stream2.readUint32();
    if (this.flags & 1) this.scheme_uri = stream2.readCString();
  }
};
var INT32_MAX = 2147483647;
var cslgBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompositionToDecodeBox";
  }
  static {
    this.fourcc = "cslg";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 0) {
      this.compositionToDTSShift = stream2.readInt32();
      this.leastDecodeToDisplayDelta = stream2.readInt32();
      this.greatestDecodeToDisplayDelta = stream2.readInt32();
      this.compositionStartTime = stream2.readInt32();
      this.compositionEndTime = stream2.readInt32();
    } else if (this.version === 1) {
      this.compositionToDTSShift = stream2.readInt64();
      this.leastDecodeToDisplayDelta = stream2.readInt64();
      this.greatestDecodeToDisplayDelta = stream2.readInt64();
      this.compositionStartTime = stream2.readInt64();
      this.compositionEndTime = stream2.readInt64();
    }
  }
  /** @bundle writing/cslg.js */
  write(stream2) {
    this.version = 0;
    if (this.compositionToDTSShift > INT32_MAX || this.leastDecodeToDisplayDelta > INT32_MAX || this.greatestDecodeToDisplayDelta > INT32_MAX || this.compositionStartTime > INT32_MAX || this.compositionEndTime > INT32_MAX) this.version = 1;
    this.flags = 0;
    if (this.version === 0) {
      this.size = 20;
      this.writeHeader(stream2);
      stream2.writeInt32(this.compositionToDTSShift);
      stream2.writeInt32(this.leastDecodeToDisplayDelta);
      stream2.writeInt32(this.greatestDecodeToDisplayDelta);
      stream2.writeInt32(this.compositionStartTime);
      stream2.writeInt32(this.compositionEndTime);
    } else if (this.version === 1) {
      this.size = 40;
      this.writeHeader(stream2);
      stream2.writeInt64(this.compositionToDTSShift);
      stream2.writeInt64(this.leastDecodeToDisplayDelta);
      stream2.writeInt64(this.greatestDecodeToDisplayDelta);
      stream2.writeInt64(this.compositionStartTime);
      stream2.writeInt64(this.compositionEndTime);
    }
  }
};
var cttsBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompositionOffsetBox";
  }
  static {
    this.fourcc = "ctts";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.sample_counts = [];
    this.sample_offsets = [];
    if (this.version === 0) for (let i = 0; i < entry_count; i++) {
      this.sample_counts.push(stream2.readUint32());
      const value = stream2.readInt32();
      if (value < 0) Log.warn("BoxParser", "ctts box uses negative values without using version 1");
      this.sample_offsets.push(value);
    }
    else if (this.version === 1) for (let i = 0; i < entry_count; i++) {
      this.sample_counts.push(stream2.readUint32());
      this.sample_offsets.push(stream2.readInt32());
    }
  }
  /** @bundle writing/ctts.js */
  write(stream2) {
    this.version = this.sample_offsets.some((offset) => offset < 0) ? 1 : 0;
    this.flags = 0;
    this.size = 4 + 8 * this.sample_counts.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.sample_counts.length);
    for (let i = 0; i < this.sample_counts.length; i++) {
      stream2.writeUint32(this.sample_counts[i]);
      if (this.version === 1) stream2.writeInt32(this.sample_offsets[i]);
      else stream2.writeUint32(this.sample_offsets[i]);
    }
  }
  /** @bundle box-unpack.js */
  unpack(samples2) {
    let k = 0;
    for (let i = 0; i < this.sample_counts.length; i++) for (let j = 0; j < this.sample_counts[i]; j++) {
      samples2[k].pts = samples2[k].dts + this.sample_offsets[i];
      k++;
    }
  }
};
var dac3Box = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "AC3SpecificBox";
  }
  static {
    this.fourcc = "dac3";
  }
  parse(stream2) {
    const tmp_byte1 = stream2.readUint8();
    const tmp_byte2 = stream2.readUint8();
    const tmp_byte3 = stream2.readUint8();
    this.fscod = tmp_byte1 >> 6;
    this.bsid = tmp_byte1 >> 1 & 31;
    this.bsmod = (tmp_byte1 & 1) << 2 | tmp_byte2 >> 6 & 3;
    this.acmod = tmp_byte2 >> 3 & 7;
    this.lfeon = tmp_byte2 >> 2 & 1;
    this.bit_rate_code = tmp_byte2 & 3 | tmp_byte3 >> 5 & 7;
  }
};
var dec3Box = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "EC3SpecificBox";
  }
  static {
    this.fourcc = "dec3";
  }
  parse(stream2) {
    const tmp_16 = stream2.readUint16();
    this.data_rate = tmp_16 >> 3;
    this.num_ind_sub = tmp_16 & 7;
    this.ind_subs = [];
    for (let i = 0; i < this.num_ind_sub + 1; i++) {
      const tmp_byte1 = stream2.readUint8();
      const tmp_byte2 = stream2.readUint8();
      const tmp_byte3 = stream2.readUint8();
      const ind_sub = {
        fscod: tmp_byte1 >> 6,
        bsid: tmp_byte1 >> 1 & 31,
        bsmod: (tmp_byte1 & 1) << 4 | tmp_byte2 >> 4 & 15,
        acmod: tmp_byte2 >> 1 & 7,
        lfeon: tmp_byte2 & 1,
        num_dep_sub: tmp_byte3 >> 1 & 15
      };
      this.ind_subs.push(ind_sub);
      if (ind_sub.num_dep_sub > 0) ind_sub.chan_loc = (tmp_byte3 & 1) << 8 | stream2.readUint8();
    }
  }
};
var dfLaBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "FLACSpecificBox";
  }
  static {
    this.fourcc = "dfLa";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const BLOCKTYPE_MASK = 127;
    const LASTMETADATABLOCKFLAG_MASK = 128;
    const boxesFound = [];
    const knownBlockTypes = [
      "STREAMINFO",
      "PADDING",
      "APPLICATION",
      "SEEKTABLE",
      "VORBIS_COMMENT",
      "CUESHEET",
      "PICTURE",
      "RESERVED"
    ];
    let flagAndType;
    do {
      flagAndType = stream2.readUint8();
      const type = Math.min(flagAndType & BLOCKTYPE_MASK, knownBlockTypes.length - 1);
      if (!type) {
        stream2.readUint8Array(13);
        this.samplerate = stream2.readUint32() >> 12;
        stream2.readUint8Array(20);
      } else stream2.readUint8Array(stream2.readUint24());
      boxesFound.push(knownBlockTypes[type]);
    } while (flagAndType & LASTMETADATABLOCKFLAG_MASK);
    this.numMetadataBlocks = boxesFound.length + " (" + boxesFound.join(", ") + ")";
  }
};
var dimmBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintimmediateBytesSent";
  }
  static {
    this.fourcc = "dimm";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint64();
  }
};
var dmax = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintlongestpacket";
  }
  static {
    this.fourcc = "dmax";
  }
  parse(stream2) {
    this.time = stream2.readUint32();
  }
};
var dmedBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintmediaBytesSent";
  }
  static {
    this.fourcc = "dmed";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint64();
  }
};
var dOpsBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "OpusSpecificBox";
  }
  static {
    this.fourcc = "dOps";
  }
  parse(stream2) {
    this.Version = stream2.readUint8();
    this.OutputChannelCount = stream2.readUint8();
    this.PreSkip = stream2.readUint16();
    this.InputSampleRate = stream2.readUint32();
    this.OutputGain = stream2.readInt16();
    this.ChannelMappingFamily = stream2.readUint8();
    if (this.ChannelMappingFamily !== 0) {
      this.StreamCount = stream2.readUint8();
      this.CoupledCount = stream2.readUint8();
      this.ChannelMapping = [];
      for (let i = 0; i < this.OutputChannelCount; i++) this.ChannelMapping[i] = stream2.readUint8();
    }
  }
  write(stream2) {
    this.size = 11;
    if (this.ChannelMappingFamily !== 0) this.size += 2 + this.OutputChannelCount;
    this.writeHeader(stream2);
    stream2.writeUint8(this.Version);
    stream2.writeUint8(this.OutputChannelCount);
    stream2.writeUint16(this.PreSkip);
    stream2.writeUint32(this.InputSampleRate);
    stream2.writeInt16(this.OutputGain);
    stream2.writeUint8(this.ChannelMappingFamily);
    if (this.ChannelMappingFamily !== 0) {
      stream2.writeUint8(this.StreamCount);
      stream2.writeUint8(this.CoupledCount);
      for (let i = 0; i < this.OutputChannelCount; i++) stream2.writeUint8(this.ChannelMapping[i]);
    }
  }
};
var drepBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintrepeatedBytesSent";
  }
  static {
    this.fourcc = "drep";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint64();
  }
};
var elstBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "EditListBox";
  }
  static {
    this.fourcc = "elst";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.entries = [];
    const entry_count = stream2.readUint32();
    for (let i = 0; i < entry_count; i++) {
      const entry = {
        segment_duration: this.version === 1 ? stream2.readUint64() : stream2.readUint32(),
        media_time: this.version === 1 ? stream2.readInt64() : stream2.readInt32(),
        media_rate_integer: stream2.readInt16(),
        media_rate_fraction: stream2.readInt16()
      };
      this.entries.push(entry);
    }
  }
  /** @bundle writing/elst.js */
  write(stream2) {
    const useVersion1 = this.entries.some((entry) => entry.segment_duration > MAX_UINT32 || entry.media_time > MAX_UINT32) || this.version === 1;
    this.version = useVersion1 ? 1 : 0;
    this.size = 4 + 12 * this.entries.length;
    this.size += useVersion1 ? 8 * this.entries.length : 0;
    this.writeHeader(stream2);
    stream2.writeUint32(this.entries.length);
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (useVersion1) {
        stream2.writeUint64(entry.segment_duration);
        stream2.writeInt64(entry.media_time);
      } else {
        stream2.writeUint32(entry.segment_duration);
        stream2.writeInt32(entry.media_time);
      }
      stream2.writeInt16(entry.media_rate_integer);
      stream2.writeInt16(entry.media_rate_fraction);
    }
  }
};
var EntityToGroup = class extends FullBox {
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.group_id = stream2.readUint32();
    this.num_entities_in_group = stream2.readUint32();
    this.entity_ids = [];
    for (let i = 0; i < this.num_entities_in_group; i++) {
      const entity_id = stream2.readUint32();
      this.entity_ids.push(entity_id);
    }
  }
};
var aebrBox = class extends EntityToGroup {
  constructor(..._args) {
    super(..._args);
    this.box_name = "Auto exposure bracketing";
  }
  static {
    this.fourcc = "aebr";
  }
};
var afbrBox = class extends EntityToGroup {
  constructor(..._args2) {
    super(..._args2);
    this.box_name = "Flash exposure information";
  }
  static {
    this.fourcc = "afbr";
  }
};
var albcBox = class extends EntityToGroup {
  constructor(..._args3) {
    super(..._args3);
    this.box_name = "Album collection";
  }
  static {
    this.fourcc = "albc";
  }
};
var altrBox = class extends EntityToGroup {
  constructor(..._args4) {
    super(..._args4);
    this.box_name = "Alternative entity";
  }
  static {
    this.fourcc = "altr";
  }
};
var brstBox = class extends EntityToGroup {
  constructor(..._args5) {
    super(..._args5);
    this.box_name = "Burst image";
  }
  static {
    this.fourcc = "brst";
  }
};
var dobrBox = class extends EntityToGroup {
  constructor(..._args6) {
    super(..._args6);
    this.box_name = "Depth of field bracketing";
  }
  static {
    this.fourcc = "dobr";
  }
};
var eqivBox = class extends EntityToGroup {
  constructor(..._args7) {
    super(..._args7);
    this.box_name = "Equivalent entity";
  }
  static {
    this.fourcc = "eqiv";
  }
};
var favcBox = class extends EntityToGroup {
  constructor(..._args8) {
    super(..._args8);
    this.box_name = "Favorites collection";
  }
  static {
    this.fourcc = "favc";
  }
};
var fobrBox = class extends EntityToGroup {
  constructor(..._args9) {
    super(..._args9);
    this.box_name = "Focus bracketing";
  }
  static {
    this.fourcc = "fobr";
  }
};
var iaugBox = class extends EntityToGroup {
  constructor(..._args10) {
    super(..._args10);
    this.box_name = "Image item with an audio track";
  }
  static {
    this.fourcc = "iaug";
  }
};
var panoBox = class extends EntityToGroup {
  constructor(..._args11) {
    super(..._args11);
    this.box_name = "Panorama";
  }
  static {
    this.fourcc = "pano";
  }
};
var slidBox = class extends EntityToGroup {
  constructor(..._args12) {
    super(..._args12);
    this.box_name = "Slideshow";
  }
  static {
    this.fourcc = "slid";
  }
};
var sterBox = class extends EntityToGroup {
  constructor(..._args13) {
    super(..._args13);
    this.box_name = "Stereo";
  }
  static {
    this.fourcc = "ster";
  }
};
var tsynBox = class extends EntityToGroup {
  constructor(..._args14) {
    super(..._args14);
    this.box_name = "Time-synchronized capture";
  }
  static {
    this.fourcc = "tsyn";
  }
};
var wbbrBox = class extends EntityToGroup {
  constructor(..._args15) {
    super(..._args15);
    this.box_name = "White balance bracketing";
  }
  static {
    this.fourcc = "wbbr";
  }
};
var prgrBox = class extends EntityToGroup {
  constructor(..._args16) {
    super(..._args16);
    this.box_name = "Progressive rendering";
  }
  static {
    this.fourcc = "prgr";
  }
};
var pymdBox = class extends EntityToGroup {
  constructor(..._args17) {
    super(..._args17);
    this.box_name = "Image pyramid";
  }
  static {
    this.fourcc = "pymd";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.group_id = stream2.readUint32();
    this.num_entities_in_group = stream2.readUint32();
    this.entity_ids = [];
    for (let i = 0; i < this.num_entities_in_group; i++) {
      const entity_id = stream2.readUint32();
      this.entity_ids.push(entity_id);
    }
    this.tile_size_x = stream2.readUint16();
    this.tile_size_y = stream2.readUint16();
    this.layer_binning = [];
    this.tiles_in_layer_column_minus1 = [];
    this.tiles_in_layer_row_minus1 = [];
    for (let i = 0; i < this.num_entities_in_group; i++) {
      this.layer_binning[i] = stream2.readUint16();
      this.tiles_in_layer_row_minus1[i] = stream2.readUint16();
      this.tiles_in_layer_column_minus1[i] = stream2.readUint16();
    }
  }
};
var fielBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "FieldHandlingBox";
  }
  static {
    this.fourcc = "fiel";
  }
  parse(stream2) {
    this.fieldCount = stream2.readUint8();
    this.fieldOrdering = stream2.readUint8();
  }
};
var frmaBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "OriginalFormatBox";
  }
  static {
    this.fourcc = "frma";
  }
  parse(stream2) {
    this.data_format = stream2.readString(4);
  }
};
var imirBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ImageMirror";
  }
  static {
    this.fourcc = "imir";
  }
  parse(stream2) {
    const tmp = stream2.readUint8();
    this.reserved = tmp >> 7;
    this.axis = tmp & 1;
  }
};
var ipmaBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ItemPropertyAssociationBox";
  }
  static {
    this.fourcc = "ipma";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.associations = [];
    for (let i = 0; i < entry_count; i++) {
      const id = this.version < 1 ? stream2.readUint16() : stream2.readUint32();
      const props = [];
      const association_count = stream2.readUint8();
      for (let j = 0; j < association_count; j++) {
        const tmp = stream2.readUint8();
        props.push({
          essential: (tmp & 128) >> 7 === 1,
          property_index: this.flags & 1 ? (tmp & 127) << 8 | stream2.readUint8() : tmp & 127
        });
      }
      this.associations.push({
        id,
        props
      });
    }
  }
};
var irotBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ImageRotation";
  }
  static {
    this.fourcc = "irot";
  }
  parse(stream2) {
    this.angle = stream2.readUint8() & 3;
  }
};
var ispeBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ImageSpatialExtentsProperty";
  }
  static {
    this.fourcc = "ispe";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.image_width = stream2.readUint32();
    this.image_height = stream2.readUint32();
  }
};
var itaiBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TAITimestampBox";
  }
  static {
    this.fourcc = "itai";
  }
  parse(stream2) {
    this.TAI_timestamp = stream2.readUint64();
    const status_bits = stream2.readUint8();
    this.sychronization_state = status_bits >> 7 & 1;
    this.timestamp_generation_failure = status_bits >> 6 & 1;
    this.timestamp_is_modified = status_bits >> 5 & 1;
  }
};
var kindBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "KindBox";
  }
  static {
    this.fourcc = "kind";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.schemeURI = stream2.readCString();
    if (!this.isEndOfBox(stream2)) this.value = stream2.readCString();
  }
  /** @bundle writing/kind.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = this.schemeURI.length + 1 + (this.value ? this.value.length + 1 : 0);
    this.writeHeader(stream2);
    stream2.writeCString(this.schemeURI);
    if (this.value) stream2.writeCString(this.value);
  }
};
var levaBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "LevelAssignmentBox";
  }
  static {
    this.fourcc = "leva";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const count = stream2.readUint8();
    this.levels = [];
    for (let i = 0; i < count; i++) {
      const level = {};
      this.levels[i] = level;
      level.track_ID = stream2.readUint32();
      const tmp_byte = stream2.readUint8();
      level.padding_flag = tmp_byte >> 7;
      level.assignment_type = tmp_byte & 127;
      switch (level.assignment_type) {
        case 0:
          level.grouping_type = stream2.readString(4);
          break;
        case 1:
          level.grouping_type = stream2.readString(4);
          level.grouping_type_parameter = stream2.readUint32();
          break;
        case 2:
          break;
        case 3:
          break;
        case 4:
          level.sub_track_id = stream2.readUint32();
          break;
        default:
          Log.warn("BoxParser", `Unknown level assignment type: ${level.assignment_type}`);
      }
    }
  }
};
var lhvCBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "LHEVCConfigurationBox";
  }
  static {
    this.fourcc = "lhvC";
  }
  parse(stream2) {
    this.configurationVersion = stream2.readUint8();
    this.min_spatial_segmentation_idc = stream2.readUint16() & 4095;
    this.parallelismType = stream2.readUint8() & 3;
    let tmp_byte = stream2.readUint8();
    this.numTemporalLayers = (tmp_byte & 13) >> 3;
    this.temporalIdNested = (tmp_byte & 4) >> 2;
    this.lengthSizeMinusOne = tmp_byte & 3;
    this.nalu_arrays = [];
    const numOfArrays = stream2.readUint8();
    for (let i = 0; i < numOfArrays; i++) {
      const nalu_array = [];
      this.nalu_arrays.push(nalu_array);
      tmp_byte = stream2.readUint8();
      nalu_array.completeness = (tmp_byte & 128) >> 7;
      nalu_array.nalu_type = tmp_byte & 63;
      const numNalus = stream2.readUint16();
      for (let j = 0; j < numNalus; j++) {
        const length2 = stream2.readUint16();
        nalu_array.push({ data: stream2.readUint8Array(length2) });
      }
    }
  }
};
var lselBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "LayerSelectorProperty";
  }
  static {
    this.fourcc = "lsel";
  }
  parse(stream2) {
    this.layer_id = stream2.readUint16();
  }
};
var maxrBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintmaxrate";
  }
  static {
    this.fourcc = "maxr";
  }
  parse(stream2) {
    this.period = stream2.readUint32();
    this.bytes = stream2.readUint32();
  }
};
var ColorPoint = class {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  toString() {
    return "(" + this.x + "," + this.y + ")";
  }
};
var mdcvBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MasteringDisplayColourVolumeBox";
  }
  static {
    this.fourcc = "mdcv";
  }
  parse(stream2) {
    this.display_primaries = [];
    this.display_primaries[0] = new ColorPoint(stream2.readUint16(), stream2.readUint16());
    this.display_primaries[1] = new ColorPoint(stream2.readUint16(), stream2.readUint16());
    this.display_primaries[2] = new ColorPoint(stream2.readUint16(), stream2.readUint16());
    this.white_point = new ColorPoint(stream2.readUint16(), stream2.readUint16());
    this.max_display_mastering_luminance = stream2.readUint32();
    this.min_display_mastering_luminance = stream2.readUint32();
  }
};
var mfroBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MovieFragmentRandomAccessOffsetBox";
  }
  static {
    this.fourcc = "mfro";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this._size = stream2.readUint32();
  }
};
var mskCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "MaskConfigurationProperty";
  }
  static {
    this.fourcc = "mskC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.bits_per_pixel = stream2.readUint8();
  }
};
var npckBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintPacketsSent";
  }
  static {
    this.fourcc = "npck";
  }
  parse(stream2) {
    this.packetssent = stream2.readUint32();
  }
};
var numpBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintPacketsSent";
  }
  static {
    this.fourcc = "nump";
  }
  parse(stream2) {
    this.packetssent = stream2.readUint64();
  }
};
var PaddingBit = class {
  constructor(pad1, pad2) {
    this.pad1 = pad1;
    this.pad2 = pad2;
  }
};
var padbBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "PaddingBitsBox";
  }
  static {
    this.fourcc = "padb";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const sample_count = stream2.readUint32();
    this.padbits = [];
    for (let i = 0; i < Math.floor((sample_count + 1) / 2); i++) {
      const bits = stream2.readUint8();
      const pad1 = (bits & 112) >> 4;
      const pad2 = bits & 7;
      this.padbits.push(new PaddingBit(pad1, pad2));
    }
  }
};
var paspBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "PixelAspectRatioBox";
  }
  static {
    this.fourcc = "pasp";
  }
  parse(stream2) {
    this.hSpacing = stream2.readUint32();
    this.vSpacing = stream2.readUint32();
  }
};
var paylBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CuePayloadBox";
  }
  static {
    this.fourcc = "payl";
  }
  parse(stream2) {
    this.text = stream2.readString(this.size - this.hdr_size);
  }
};
var paytBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintpayloadID";
  }
  static {
    this.fourcc = "payt";
  }
  parse(stream2) {
    this.payloadID = stream2.readUint32();
    const count = stream2.readUint8();
    this.rtpmap_string = stream2.readString(count);
  }
};
var pdinBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ProgressiveDownloadInfoBox";
    this.rate = [];
    this.initial_delay = [];
  }
  static {
    this.fourcc = "pdin";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const count = (this.size - this.hdr_size) / 8;
    for (let i = 0; i < count; i++) {
      this.rate[i] = stream2.readUint32();
      this.initial_delay[i] = stream2.readUint32();
    }
  }
};
var pixiBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "PixelInformationProperty";
  }
  static {
    this.fourcc = "pixi";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.num_channels = stream2.readUint8();
    this.bits_per_channels = [];
    for (let i = 0; i < this.num_channels; i++) this.bits_per_channels[i] = stream2.readUint8();
  }
};
var pmaxBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintlargestpacket";
  }
  static {
    this.fourcc = "pmax";
  }
  parse(stream2) {
    this.bytes = stream2.readUint32();
  }
};
var prdiBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ProgressiveDerivedImageItemInformationProperty";
  }
  static {
    this.fourcc = "prdi";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.step_count = stream2.readUint16();
    this.item_count = [];
    if (this.flags & 2) for (let i = 0; i < this.step_count; i++) this.item_count[i] = stream2.readUint16();
  }
};
var prfrBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ProjectionFormatBox";
  }
  static {
    this.fourcc = "prfr";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.projection_type = stream2.readUint8() & 31;
  }
};
var prftBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ProducerReferenceTimeBox";
  }
  static {
    this.fourcc = "prft";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.ref_track_id = stream2.readUint32();
    this.ntp_timestamp = stream2.readUint64();
    if (this.version === 0) this.media_time = stream2.readUint32();
    else this.media_time = stream2.readUint64();
  }
};
var psshBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ProtectionSystemSpecificHeaderBox";
  }
  static {
    this.fourcc = "pssh";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.system_id = parseHex16(stream2);
    this.kid = [];
    if (this.version > 0) {
      const count = stream2.readUint32();
      for (let i = 0; i < count; i++) this.kid[i] = parseHex16(stream2);
    }
    const datasize = stream2.readUint32();
    if (datasize > 0) this.protection_data = stream2.readUint8Array(datasize);
  }
};
var clefBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackCleanApertureDimensionsBox";
  }
  static {
    this.fourcc = "clef";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.width = stream2.readUint32();
    this.height = stream2.readUint32();
  }
};
function parseItifData(type, data3) {
  if (type === dataBox.Types.UTF8) return new TextDecoder("utf-8").decode(data3);
  const view = new DataView(data3.buffer);
  if (type === dataBox.Types.BE_UNSIGNED_INT) if (data3.length === 1) return view.getUint8(0);
  else if (data3.length === 2) return view.getUint16(0, false);
  else if (data3.length === 4) return view.getUint32(0, false);
  else if (data3.length === 8) return view.getBigUint64(0, false);
  else throw new Error("Unsupported ITIF_TYPE_BE_UNSIGNED_INT length " + data3.length);
  else if (type === dataBox.Types.BE_SIGNED_INT) if (data3.length === 1) return view.getInt8(0);
  else if (data3.length === 2) return view.getInt16(0, false);
  else if (data3.length === 4) return view.getInt32(0, false);
  else if (data3.length === 8) return view.getBigInt64(0, false);
  else throw new Error("Unsupported ITIF_TYPE_BE_SIGNED_INT length " + data3.length);
  else if (type === dataBox.Types.BE_FLOAT32) return view.getFloat32(0, false);
  Log.warn("DataBox", "Unsupported or unimplemented itif data type: " + type);
}
var dataBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "DataBox";
  }
  static {
    this.fourcc = "data";
  }
  static {
    this.Types = {
      RESERVED: 0,
      UTF8: 1,
      UTF16: 2,
      SJIS: 3,
      UTF8_SORT: 4,
      UTF16_SORT: 5,
      JPEG: 13,
      PNG: 14,
      BE_SIGNED_INT: 21,
      BE_UNSIGNED_INT: 22,
      BE_FLOAT32: 23,
      BE_FLOAT64: 24,
      BMP: 27,
      QT_ATOM: 28,
      BE_SIGNED_INT8: 65,
      BE_SIGNED_INT16: 66,
      BE_SIGNED_INT32: 67,
      BE_FLOAT32_POINT: 70,
      BE_FLOAT32_DIMENSIONS: 71,
      BE_FLOAT32_RECT: 72,
      BE_SIGNED_INT64: 74,
      BE_UNSIGNED_INT8: 75,
      BE_UNSIGNED_INT16: 76,
      BE_UNSIGNED_INT32: 77,
      BE_UNSIGNED_INT64: 78,
      BE_FLOAT64_AFFINE_TRANSFORM: 79
    };
  }
  parse(stream2) {
    this.valueType = stream2.readUint32();
    this.country = stream2.readUint16();
    if (this.country > 255) {
      stream2.seek(stream2.getPosition() - 2);
      this.countryString = stream2.readString(2);
    }
    this.language = stream2.readUint16();
    if (this.language > 255) {
      stream2.seek(stream2.getPosition() - 2);
      this.parseLanguage(stream2);
    }
    this.raw = stream2.readUint8Array(this.size - this.hdr_size - 8);
    this.value = parseItifData(this.valueType, this.raw);
  }
};
var enofBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackEncodedPixelsDimensionsBox";
  }
  static {
    this.fourcc = "enof";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.width = stream2.readUint32();
    this.height = stream2.readUint32();
  }
};
var ilstBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "IlstBox";
  }
  static {
    this.fourcc = "ilst";
  }
  parse(stream2) {
    this.list = {};
    let total2 = this.size - this.hdr_size;
    while (total2 > 0) {
      const size = stream2.readUint32();
      const index = stream2.readUint32();
      const res = parseOneBox(stream2, false, size - 8);
      if (res.code === 1) this.list[index] = res.box;
      total2 -= size;
    }
  }
};
var keysBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "KeysBox";
  }
  static {
    this.fourcc = "keys";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.count = stream2.readUint32();
    this.keys = {};
    for (let i = 0; i < this.count; i++) {
      const len = stream2.readUint32();
      this.keys[i + 1] = stream2.readString(len - 4);
    }
  }
};
var profBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackProductionApertureDimensionsBox";
  }
  static {
    this.fourcc = "prof";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.width = stream2.readUint32();
    this.height = stream2.readUint32();
  }
};
var taptBox = class extends ContainerBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackApertureModeDimensionsBox";
    this.clefs = [];
    this.profs = [];
    this.enofs = [];
    this.subBoxNames = [
      "clef",
      "prof",
      "enof"
    ];
  }
  static {
    this.fourcc = "tapt";
  }
};
var rtp_Box = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "rtpmoviehintinformation";
  }
  static {
    this.fourcc = "rtp ";
  }
  parse(stream2) {
    this.descriptionformat = stream2.readString(4);
    this.sdptext = stream2.readString(this.size - this.hdr_size - 4);
  }
};
var saioBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleAuxiliaryInformationOffsetsBox";
  }
  static {
    this.fourcc = "saio";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.flags & 1) {
      this.aux_info_type = stream2.readString(4);
      this.aux_info_type_parameter = stream2.readUint32();
    }
    this.entry_count = stream2.readUint32();
    this.offset = [];
    for (let i = 0; i < this.entry_count; i++) if (this.version === 0) this.offset[i] = stream2.readUint32();
    else this.offset[i] = stream2.readUint64();
  }
};
var saizBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleAuxiliaryInformationSizesBox";
  }
  static {
    this.fourcc = "saiz";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.flags & 1) {
      this.aux_info_type = stream2.readString(4);
      this.aux_info_type_parameter = stream2.readUint32();
    }
    this.default_sample_info_size = stream2.readUint8();
    this.sample_count = stream2.readUint32();
    this.sample_info_size = [];
    if (this.default_sample_info_size === 0) for (let i = 0; i < this.sample_count; i++) this.sample_info_size[i] = stream2.readUint8();
  }
};
var Pixel = class {
  constructor(bad_pixel_row, bad_pixel_column) {
    this.bad_pixel_row = bad_pixel_row;
    this.bad_pixel_column = bad_pixel_column;
  }
  toString() {
    return "[row: " + this.bad_pixel_row + ", column: " + this.bad_pixel_column + "]";
  }
};
var sbpmBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SensorBadPixelsMapBox";
  }
  static {
    this.fourcc = "sbpm";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.component_count = stream2.readUint16();
    this.component_index = [];
    for (let i = 0; i < this.component_count; i++) this.component_index.push(stream2.readUint16());
    const flags = stream2.readUint8();
    this.correction_applied = 128 === (flags & 128);
    this.num_bad_rows = stream2.readUint32();
    this.num_bad_cols = stream2.readUint32();
    this.num_bad_pixels = stream2.readUint32();
    this.bad_rows = [];
    this.bad_columns = [];
    this.bad_pixels = [];
    for (let i = 0; i < this.num_bad_rows; i++) this.bad_rows.push(stream2.readUint32());
    for (let i = 0; i < this.num_bad_cols; i++) this.bad_columns.push(stream2.readUint32());
    for (let i = 0; i < this.num_bad_pixels; i++) {
      const row = stream2.readUint32();
      const col = stream2.readUint32();
      this.bad_pixels.push(new Pixel(row, col));
    }
  }
};
var schmBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SchemeTypeBox";
  }
  static {
    this.fourcc = "schm";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.scheme_type = stream2.readString(4);
    this.scheme_version = stream2.readUint32();
    if (this.flags & 1) this.scheme_uri = stream2.readString(this.size - this.hdr_size - 8);
  }
};
var sdp_Box = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "rtptracksdphintinformation";
  }
  static {
    this.fourcc = "sdp ";
  }
  parse(stream2) {
    this.sdptext = stream2.readString(this.size - this.hdr_size);
  }
};
var sencBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SampleEncryptionBox";
  }
  static {
    this.fourcc = "senc";
  }
};
var SmDmBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SMPTE2086MasteringDisplayMetadataBox";
  }
  static {
    this.fourcc = "SmDm";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.primaryRChromaticity_x = stream2.readUint16();
    this.primaryRChromaticity_y = stream2.readUint16();
    this.primaryGChromaticity_x = stream2.readUint16();
    this.primaryGChromaticity_y = stream2.readUint16();
    this.primaryBChromaticity_x = stream2.readUint16();
    this.primaryBChromaticity_y = stream2.readUint16();
    this.whitePointChromaticity_x = stream2.readUint16();
    this.whitePointChromaticity_y = stream2.readUint16();
    this.luminanceMax = stream2.readUint32();
    this.luminanceMin = stream2.readUint32();
  }
};
var sratBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SamplingRateBox";
  }
  static {
    this.fourcc = "srat";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.sampling_rate = stream2.readUint32();
  }
};
var stdpBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "DegradationPriorityBox";
  }
  static {
    this.fourcc = "stdp";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const count = (this.size - this.hdr_size) / 2;
    this.priority = [];
    for (let i = 0; i < count; i++) this.priority[i] = stream2.readUint16();
  }
};
var striBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SubTrackInformationBox";
  }
  static {
    this.fourcc = "stri";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.switch_group = stream2.readUint16();
    this.alternate_group = stream2.readUint16();
    this.sub_track_id = stream2.readUint32();
    const count = (this.size - this.hdr_size - 8) / 4;
    this.attribute_list = [];
    for (let i = 0; i < count; i++) this.attribute_list[i] = stream2.readUint32();
  }
};
var stsgBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SubTrackSampleGroupBox";
  }
  static {
    this.fourcc = "stsg";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.grouping_type = stream2.readUint32();
    const count = stream2.readUint16();
    this.group_description_index = [];
    for (let i = 0; i < count; i++) this.group_description_index[i] = stream2.readUint32();
  }
};
var stshBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "ShadowSyncSampleBox";
  }
  static {
    this.fourcc = "stsh";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.shadowed_sample_numbers = [];
    this.sync_sample_numbers = [];
    if (this.version === 0) for (let i = 0; i < entry_count; i++) {
      this.shadowed_sample_numbers.push(stream2.readUint32());
      this.sync_sample_numbers.push(stream2.readUint32());
    }
  }
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 8 * this.shadowed_sample_numbers.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.shadowed_sample_numbers.length);
    for (let i = 0; i < this.shadowed_sample_numbers.length; i++) {
      stream2.writeUint32(this.shadowed_sample_numbers[i]);
      stream2.writeUint32(this.sync_sample_numbers[i]);
    }
  }
};
var stssBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SyncSampleBox";
  }
  static {
    this.fourcc = "stss";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    if (this.version === 0) {
      this.sample_numbers = [];
      for (let i = 0; i < entry_count; i++) this.sample_numbers.push(stream2.readUint32());
    }
  }
  /** @bundle writing/stss.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = 4 + 4 * this.sample_numbers.length;
    this.writeHeader(stream2);
    stream2.writeUint32(this.sample_numbers.length);
    stream2.writeUint32Array(this.sample_numbers);
  }
};
var stviBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "StereoVideoBox";
  }
  static {
    this.fourcc = "stvi";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const tmp32 = stream2.readUint32();
    this.single_view_allowed = tmp32 & 3;
    this.stereo_scheme = stream2.readUint32();
    const length2 = stream2.readUint32();
    this.stereo_indication_type = stream2.readString(length2);
    this.boxes = [];
    while (stream2.getPosition() < this.start + this.size) {
      const ret = parseOneBox(stream2, false, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        const box = ret.box;
        this.boxes.push(box);
        this[box.type] = box;
      } else return;
    }
  }
};
var stz2Box = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "CompactSampleSizeBox";
  }
  static {
    this.fourcc = "stz2";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.sample_sizes = [];
    if (this.version === 0) {
      this.reserved = stream2.readUint24();
      this.field_size = stream2.readUint8();
      const sample_count = stream2.readUint32();
      if (this.field_size === 4) for (let i = 0; i < sample_count; i += 2) {
        const tmp = stream2.readUint8();
        this.sample_sizes[i] = tmp >> 4 & 15;
        this.sample_sizes[i + 1] = tmp & 15;
      }
      else if (this.field_size === 8) for (let i = 0; i < sample_count; i++) this.sample_sizes[i] = stream2.readUint8();
      else if (this.field_size === 16) for (let i = 0; i < sample_count; i++) this.sample_sizes[i] = stream2.readUint16();
      else Log.error("BoxParser", "Error in length field in stz2 box", stream2.isofile);
    }
  }
};
var subsBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "SubSampleInformationBox";
  }
  static {
    this.fourcc = "subs";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const entry_count = stream2.readUint32();
    this.entries = [];
    let subsample_count;
    for (let i = 0; i < entry_count; i++) {
      const sampleInfo = {};
      this.entries[i] = sampleInfo;
      sampleInfo.sample_delta = stream2.readUint32();
      sampleInfo.subsamples = [];
      subsample_count = stream2.readUint16();
      if (subsample_count > 0) for (let j = 0; j < subsample_count; j++) {
        const subsample = {};
        sampleInfo.subsamples.push(subsample);
        if (this.version === 1) subsample.size = stream2.readUint32();
        else subsample.size = stream2.readUint16();
        subsample.priority = stream2.readUint8();
        subsample.discardable = stream2.readUint8();
        subsample.codec_specific_parameters = stream2.readUint32();
      }
    }
  }
};
var taicBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TAIClockInfoBox";
  }
  static {
    this.fourcc = "taic";
  }
  parse(stream2) {
    this.time_uncertainty = stream2.readUint64();
    this.clock_resolution = stream2.readUint32();
    this.clock_drift_rate = stream2.readInt32();
    const reserved_byte = stream2.readUint8();
    this.clock_type = (reserved_byte & 192) >> 6;
  }
};
var tencBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackEncryptionBox";
  }
  static {
    this.fourcc = "tenc";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    stream2.readUint8();
    if (this.version === 0) stream2.readUint8();
    else {
      const tmp = stream2.readUint8();
      this.default_crypt_byte_block = tmp >> 4 & 15;
      this.default_skip_byte_block = tmp & 15;
    }
    this.default_isProtected = stream2.readUint8();
    this.default_Per_Sample_IV_Size = stream2.readUint8();
    this.default_KID = parseHex16(stream2);
    if (this.default_isProtected === 1 && this.default_Per_Sample_IV_Size === 0) {
      this.default_constant_IV_size = stream2.readUint8();
      this.default_constant_IV = stream2.readUint8Array(this.default_constant_IV_size);
    }
  }
};
var TfraEntry = class {
};
var tfraBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackFragmentRandomAccessBox";
  }
  static {
    this.fourcc = "tfra";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.track_ID = stream2.readUint32();
    stream2.readUint24();
    const tmp_byte = stream2.readUint8();
    this.length_size_of_traf_num = tmp_byte >> 4 & 3;
    this.length_size_of_trun_num = tmp_byte >> 2 & 3;
    this.length_size_of_sample_num = tmp_byte & 3;
    this.entries = [];
    const number_of_entries = stream2.readUint32();
    for (let i = 0; i < number_of_entries; i++) {
      const entry = new TfraEntry();
      if (this.version === 1) {
        entry.time = stream2.readUint64();
        entry.moof_offset = stream2.readUint64();
      } else {
        entry.time = stream2.readUint32();
        entry.moof_offset = stream2.readUint32();
      }
      entry.traf_number = stream2["readUint" + 8 * (this.length_size_of_traf_num + 1)]();
      entry.trun_number = stream2["readUint" + 8 * (this.length_size_of_trun_num + 1)]();
      entry.sample_delta = stream2["readUint" + 8 * (this.length_size_of_sample_num + 1)]();
      this.entries.push(entry);
    }
  }
};
var tmaxBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintmaxrelativetime";
  }
  static {
    this.fourcc = "tmax";
  }
  parse(stream2) {
    this.time = stream2.readUint32();
  }
};
var tminBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintminrelativetime";
  }
  static {
    this.fourcc = "tmin";
  }
  parse(stream2) {
    this.time = stream2.readUint32();
  }
};
var totlBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintBytesSent";
  }
  static {
    this.fourcc = "totl";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint32();
  }
};
var tpayBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintBytesSent";
  }
  static {
    this.fourcc = "tpay";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint32();
  }
};
var tpylBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintBytesSent";
  }
  static {
    this.fourcc = "tpyl";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint64();
  }
};
var msrcTrackGroupTypeBox = class extends TrackGroupTypeBox {
  static {
    this.fourcc = "msrc";
  }
};
var trefBox = class trefBox2 extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackReferenceBox";
    this.references = [];
  }
  static {
    this.fourcc = "tref";
  }
  static {
    this.allowed_types = [
      "hint",
      "cdsc",
      "font",
      "hind",
      "vdep",
      "vplx",
      "subt",
      "thmb",
      "auxl",
      "cdtg",
      "shsc",
      "aest"
    ];
  }
  parse(stream2) {
    while (stream2.getPosition() < this.start + this.size) {
      const ret = parseOneBox(stream2, true, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        if (!trefBox2.allowed_types.includes(ret.type)) Log.warn("BoxParser", `Unknown track reference type: '${ret.type}'`);
        const box = new TrackReferenceTypeBox(ret.type, ret.size, ret.hdr_size, ret.start);
        if (box.write === Box.prototype.write && box.type !== "mdat") {
          Log.info("BoxParser", "TrackReference " + box.type + " box writing not yet implemented, keeping unparsed data in memory for later write");
          box.parseDataAndRewind(stream2);
        }
        box.parse(stream2);
        this.references.push(box);
      } else return;
    }
  }
};
var trepBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackExtensionPropertiesBox";
  }
  static {
    this.fourcc = "trep";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.track_ID = stream2.readUint32();
    this.boxes = [];
    while (stream2.getPosition() < this.start + this.size) {
      const ret = parseOneBox(stream2, false, this.size - (stream2.getPosition() - this.start));
      if (ret.code === 1) {
        const box = ret.box;
        this.boxes.push(box);
      } else return;
    }
  }
};
var trpyBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "hintBytesSent";
  }
  static {
    this.fourcc = "trpy";
  }
  parse(stream2) {
    this.bytessent = stream2.readUint64();
  }
};
var tselBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TrackSelectionBox";
  }
  static {
    this.fourcc = "tsel";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.switch_group = stream2.readUint32();
    const count = (this.size - this.hdr_size - 4) / 4;
    this.attribute_list = [];
    for (let i = 0; i < count; i++) this.attribute_list[i] = stream2.readUint32();
  }
};
var txtcBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TextConfigBox";
  }
  static {
    this.fourcc = "txtc";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.config = stream2.readCString();
  }
};
var tycoBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "TypeCombinationBox";
  }
  static {
    this.fourcc = "tyco";
  }
  parse(stream2) {
    const count = (this.size - this.hdr_size) / 4;
    this.compatible_brands = [];
    for (let i = 0; i < count; i++) this.compatible_brands[i] = stream2.readString(4);
  }
};
var udesBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "UserDescriptionProperty";
  }
  static {
    this.fourcc = "udes";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.lang = stream2.readCString();
    this.name = stream2.readCString();
    this.description = stream2.readCString();
    this.tags = stream2.readCString();
  }
};
var uncCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "UncompressedFrameConfigBox";
  }
  static {
    this.fourcc = "uncC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.profile = stream2.readString(4);
    if (this.version === 1) {
    } else if (this.version === 0) {
      this.component_count = stream2.readUint32();
      this.component_index = [];
      this.component_bit_depth_minus_one = [];
      this.component_format = [];
      this.component_align_size = [];
      for (let i = 0; i < this.component_count; i++) {
        this.component_index.push(stream2.readUint16());
        this.component_bit_depth_minus_one.push(stream2.readUint8());
        this.component_format.push(stream2.readUint8());
        this.component_align_size.push(stream2.readUint8());
      }
      this.sampling_type = stream2.readUint8();
      this.interleave_type = stream2.readUint8();
      this.block_size = stream2.readUint8();
      const flags = stream2.readUint8();
      this.component_little_endian = flags >> 7 & 1;
      this.block_pad_lsb = flags >> 6 & 1;
      this.block_little_endian = flags >> 5 & 1;
      this.block_reversed = flags >> 4 & 1;
      this.pad_unknown = flags >> 3 & 1;
      this.pixel_size = stream2.readUint32();
      this.row_align_size = stream2.readUint32();
      this.tile_align_size = stream2.readUint32();
      this.num_tile_cols_minus_one = stream2.readUint32();
      this.num_tile_rows_minus_one = stream2.readUint32();
    }
  }
};
var urnBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "DataEntryUrnBox";
  }
  static {
    this.fourcc = "urn ";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.name = stream2.readCString();
    if (this.size - this.hdr_size - this.name.length - 1 > 0) this.location = stream2.readCString();
  }
  /** @bundle writing/urn.js */
  write(stream2) {
    this.version = 0;
    this.flags = 0;
    this.size = this.name.length + 1 + (this.location ? this.location.length + 1 : 0);
    this.writeHeader(stream2);
    stream2.writeCString(this.name);
    if (this.location) stream2.writeCString(this.location);
  }
};
var vttCBox = class extends Box {
  constructor(..._args) {
    super(..._args);
    this.box_name = "WebVTTConfigurationBox";
  }
  static {
    this.fourcc = "vttC";
  }
  parse(stream2) {
    this.text = stream2.readString(this.size - this.hdr_size);
  }
};
var vvnCBox = class extends FullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "VvcNALUConfigBox";
  }
  static {
    this.fourcc = "vvnC";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    const tmp = stream2.readUint8();
    this.lengthSizeMinusOne = tmp & 3;
  }
};
var alstSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "alst";
  }
  parse(stream2) {
    const roll_count = stream2.readUint16();
    this.first_output_sample = stream2.readUint16();
    this.sample_offset = [];
    for (let i = 0; i < roll_count; i++) this.sample_offset[i] = stream2.readUint32();
    const remaining = this.description_length - 4 - 4 * roll_count;
    this.num_output_samples = [];
    this.num_total_samples = [];
    for (let i = 0; i < remaining / 4; i++) {
      this.num_output_samples[i] = stream2.readUint16();
      this.num_total_samples[i] = stream2.readUint16();
    }
  }
};
var avllSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "avll";
  }
  parse(stream2) {
    this.layerNumber = stream2.readUint8();
    this.accurateStatisticsFlag = stream2.readUint8();
    this.avgBitRate = stream2.readUint16();
    this.avgFrameRate = stream2.readUint16();
  }
};
var avssSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "avss";
  }
  parse(stream2) {
    this.subSequenceIdentifier = stream2.readUint16();
    this.layerNumber = stream2.readUint8();
    const tmp_byte = stream2.readUint8();
    this.durationFlag = tmp_byte >> 7;
    this.avgRateFlag = tmp_byte >> 6 & 1;
    if (this.durationFlag) this.duration = stream2.readUint32();
    if (this.avgRateFlag) {
      this.accurateStatisticsFlag = stream2.readUint8();
      this.avgBitRate = stream2.readUint16();
      this.avgFrameRate = stream2.readUint16();
    }
    this.dependency = [];
    const numReferences = stream2.readUint8();
    for (let i = 0; i < numReferences; i++) this.dependency.push({
      subSeqDirectionFlag: stream2.readUint8(),
      layerNumber: stream2.readUint8(),
      subSequenceIdentifier: stream2.readUint16()
    });
  }
};
var dtrtSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "dtrt";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var mvifSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "mvif";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var prolSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "prol";
  }
  parse(stream2) {
    this.roll_distance = stream2.readInt16();
  }
};
var rapSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "rap ";
  }
  parse(stream2) {
    const tmp_byte = stream2.readUint8();
    this.num_leading_samples_known = tmp_byte >> 7;
    this.num_leading_samples = tmp_byte & 127;
  }
};
var rashSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "rash";
  }
  parse(stream2) {
    this.operation_point_count = stream2.readUint16();
    if (this.description_length !== 2 + (this.operation_point_count === 1 ? 2 : this.operation_point_count * 6) + 9) {
      Log.warn("BoxParser", "Mismatch in " + this.grouping_type + " sample group length");
      this.data = stream2.readUint8Array(this.description_length - 2);
    } else {
      if (this.operation_point_count === 1) this.target_rate_share = stream2.readUint16();
      else {
        this.target_rate_share = [];
        this.available_bitrate = [];
        for (let i = 0; i < this.operation_point_count; i++) {
          this.available_bitrate[i] = stream2.readUint32();
          this.target_rate_share[i] = stream2.readUint16();
        }
      }
      this.maximum_bitrate = stream2.readUint32();
      this.minimum_bitrate = stream2.readUint32();
      this.discard_priority = stream2.readUint8();
    }
  }
};
var rollSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "roll";
  }
  parse(stream2) {
    this.roll_distance = stream2.readInt16();
  }
};
var scifSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "scif";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var scnmSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "scnm";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var seigSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "seig";
  }
  parse(stream2) {
    this.reserved = stream2.readUint8();
    const tmp = stream2.readUint8();
    this.crypt_byte_block = tmp >> 4;
    this.skip_byte_block = tmp & 15;
    this.isProtected = stream2.readUint8();
    this.Per_Sample_IV_Size = stream2.readUint8();
    this.KID = parseHex16(stream2);
    this.constant_IV_size = 0;
    this.constant_IV = 0;
    if (this.isProtected === 1 && this.Per_Sample_IV_Size === 0) {
      this.constant_IV_size = stream2.readUint8();
      this.constant_IV = stream2.readUint8Array(this.constant_IV_size);
    }
  }
};
var stsaSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "stsa";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var syncSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "sync";
  }
  parse(stream2) {
    const tmp_byte = stream2.readUint8();
    this.NAL_unit_type = tmp_byte & 63;
  }
};
var teleSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "tele";
  }
  parse(stream2) {
    const tmp_byte = stream2.readUint8();
    this.level_independently_decodable = tmp_byte >> 7;
  }
};
var tsasSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "tsas";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var tsclSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "tscl";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var viprSampleGroupEntry = class extends SampleGroupEntry {
  static {
    this.grouping_type = "vipr";
  }
  parse(_stream) {
    Log.warn("BoxParser", "Sample Group type: " + this.grouping_type + " not fully parsed");
  }
};
var UUIDBox = class extends Box {
  static {
    this.fourcc = "uuid";
  }
};
var UUIDFullBox = class extends FullBox {
  static {
    this.fourcc = "uuid";
  }
};
var piffLsmBox = class extends UUIDFullBox {
  constructor(..._args) {
    super(..._args);
    this.box_name = "LiveServerManifestBox";
  }
  static {
    this.uuid = "a5d40b30e81411ddba2f0800200c9a66";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.LiveServerManifest = stream2.readString(this.size - this.hdr_size).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
};
var piffPsshBox = class extends UUIDFullBox {
  constructor(..._args2) {
    super(..._args2);
    this.box_name = "PiffProtectionSystemSpecificHeaderBox";
  }
  static {
    this.uuid = "d08a4f1810f34a82b6c832d8aba183d3";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.system_id = parseHex16(stream2);
    const datasize = stream2.readUint32();
    if (datasize > 0) this.data = stream2.readUint8Array(datasize);
  }
};
var piffSencBox = class extends UUIDFullBox {
  constructor(..._args3) {
    super(..._args3);
    this.box_name = "PiffSampleEncryptionBox";
  }
  static {
    this.uuid = "a2394f525a9b4f14a2446c427c648df4";
  }
};
var piffTencBox = class extends UUIDFullBox {
  constructor(..._args4) {
    super(..._args4);
    this.box_name = "PiffTrackEncryptionBox";
  }
  static {
    this.uuid = "8974dbce7be74c5184f97148f9882554";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.default_AlgorithmID = stream2.readUint24();
    this.default_IV_size = stream2.readUint8();
    this.default_KID = parseHex16(stream2);
  }
};
var piffTfrfBox = class extends UUIDFullBox {
  constructor(..._args5) {
    super(..._args5);
    this.box_name = "TfrfBox";
  }
  static {
    this.uuid = "d4807ef2ca3946958e5426cb9e46a79f";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    this.fragment_count = stream2.readUint8();
    this.entries = [];
    for (let i = 0; i < this.fragment_count; i++) {
      let absolute_time = 0;
      let absolute_duration = 0;
      if (this.version === 1) {
        absolute_time = stream2.readUint64();
        absolute_duration = stream2.readUint64();
      } else {
        absolute_time = stream2.readUint32();
        absolute_duration = stream2.readUint32();
      }
      this.entries.push({
        absolute_time,
        absolute_duration
      });
    }
  }
};
var piffTfxdBox = class extends UUIDFullBox {
  constructor(..._args6) {
    super(..._args6);
    this.box_name = "TfxdBox";
  }
  static {
    this.uuid = "6d1d9b0542d544e680e2141daff757b2";
  }
  parse(stream2) {
    this.parseFullHeader(stream2);
    if (this.version === 1) {
      this.absolute_time = stream2.readUint64();
      this.duration = stream2.readUint64();
    } else {
      this.absolute_time = stream2.readUint32();
      this.duration = stream2.readUint32();
    }
  }
};
var ItemContentIDPropertyBox = class extends UUIDBox {
  constructor(..._args7) {
    super(..._args7);
    this.box_name = "ItemContentIDProperty";
  }
  static {
    this.uuid = "261ef3741d975bbaacbd9d2c8ea73522";
  }
  parse(stream2) {
    this.content_id = stream2.readCString();
  }
};
var ItemComponentContentIDPropertyBox = class extends UUIDBox {
  constructor(..._args8) {
    super(..._args8);
    this.box_name = "ItemComponentContentIDProperty";
  }
  static {
    this.uuid = "9db9dd6e373c5a4e811021fc83a911fd";
  }
  parse(stream2) {
    this.number_of_components = stream2.readUint32();
    this.content_ids = [];
    for (let i = 0; i < this.number_of_components; i++) {
      const content_id = stream2.readCString();
      this.content_ids.push(content_id);
    }
  }
};
var all_boxes_exports = /* @__PURE__ */ __exportAll({
  CoLLBox: () => CoLLBox,
  ItemComponentContentIDPropertyBox: () => ItemComponentContentIDPropertyBox,
  ItemContentIDPropertyBox: () => ItemContentIDPropertyBox,
  OpusSampleEntry: () => OpusSampleEntry,
  SmDmBox: () => SmDmBox,
  a1lxBox: () => a1lxBox,
  a1opBox: () => a1opBox,
  ac_3SampleEntry: () => ac_3SampleEntry,
  ac_4SampleEntry: () => ac_4SampleEntry,
  aebrBox: () => aebrBox,
  afbrBox: () => afbrBox,
  albcBox: () => albcBox,
  alstSampleGroupEntry: () => alstSampleGroupEntry,
  altrBox: () => altrBox,
  auxCBox: () => auxCBox,
  av01SampleEntry: () => av01SampleEntry,
  av1CBox: () => av1CBox,
  avc1SampleEntry: () => avc1SampleEntry,
  avc2SampleEntry: () => avc2SampleEntry,
  avc3SampleEntry: () => avc3SampleEntry,
  avc4SampleEntry: () => avc4SampleEntry,
  avcCBox: () => avcCBox,
  avllSampleGroupEntry: () => avllSampleGroupEntry,
  avs3SampleEntry: () => avs3SampleEntry,
  avssSampleGroupEntry: () => avssSampleGroupEntry,
  brstBox: () => brstBox,
  btrtBox: () => btrtBox,
  bxmlBox: () => bxmlBox,
  ccstBox: () => ccstBox,
  cdefBox: () => cdefBox,
  clapBox: () => clapBox,
  clefBox: () => clefBox,
  clliBox: () => clliBox,
  cmexBox: () => cmexBox,
  cminBox: () => cminBox,
  cmpCBox: () => cmpCBox,
  cmpdBox: () => cmpdBox,
  co64Box: () => co64Box,
  colrBox: () => colrBox,
  coviBox: () => coviBox,
  cprtBox: () => cprtBox,
  cschBox: () => cschBox,
  cslgBox: () => cslgBox,
  cttsBox: () => cttsBox,
  dOpsBox: () => dOpsBox,
  dac3Box: () => dac3Box,
  dataBox: () => dataBox,
  dav1SampleEntry: () => dav1SampleEntry,
  dec3Box: () => dec3Box,
  dfLaBox: () => dfLaBox,
  dimmBox: () => dimmBox,
  dinfBox: () => dinfBox,
  dmax: () => dmax,
  dmedBox: () => dmedBox,
  dobrBox: () => dobrBox,
  drefBox: () => drefBox,
  drepBox: () => drepBox,
  dtrtSampleGroupEntry: () => dtrtSampleGroupEntry,
  dvh1SampleEntry: () => dvh1SampleEntry,
  dvheSampleEntry: () => dvheSampleEntry,
  ec_3SampleEntry: () => ec_3SampleEntry,
  edtsBox: () => edtsBox,
  elngBox: () => elngBox,
  elstBox: () => elstBox,
  emsgBox: () => emsgBox,
  encaSampleEntry: () => encaSampleEntry,
  encmSampleEntry: () => encmSampleEntry,
  encsSampleEntry: () => encsSampleEntry,
  enctSampleEntry: () => enctSampleEntry,
  encuSampleEntry: () => encuSampleEntry,
  encvSampleEntry: () => encvSampleEntry,
  enofBox: () => enofBox,
  eqivBox: () => eqivBox,
  esdsBox: () => esdsBox,
  etypBox: () => etypBox,
  fLaCSampleEntry: () => fLaCSampleEntry,
  favcBox: () => favcBox,
  fielBox: () => fielBox,
  fobrBox: () => fobrBox,
  freeBox: () => freeBox,
  frmaBox: () => frmaBox,
  ftypBox: () => ftypBox,
  grplBox: () => grplBox,
  hdlrBox: () => hdlrBox,
  hev1SampleEntry: () => hev1SampleEntry,
  hev2SampleEntry: () => hev2SampleEntry,
  hinfBox: () => hinfBox,
  hmhdBox: () => hmhdBox,
  hntiBox: () => hntiBox,
  hvc1SampleEntry: () => hvc1SampleEntry,
  hvc2SampleEntry: () => hvc2SampleEntry,
  hvcCBox: () => hvcCBox,
  hvt1SampleEntry: () => hvt1SampleEntry,
  iaugBox: () => iaugBox,
  idatBox: () => idatBox,
  iinfBox: () => iinfBox,
  ilocBox: () => ilocBox,
  ilstBox: () => ilstBox,
  imirBox: () => imirBox,
  infeBox: () => infeBox,
  iodsBox: () => iodsBox,
  ipcoBox: () => ipcoBox,
  ipmaBox: () => ipmaBox,
  iproBox: () => iproBox,
  iprpBox: () => iprpBox,
  irefBox: () => irefBox,
  irotBox: () => irotBox,
  ispeBox: () => ispeBox,
  itaiBox: () => itaiBox,
  j2kHBox: () => j2kHBox,
  j2kiSampleEntry: () => j2kiSampleEntry,
  keysBox: () => keysBox,
  kindBox: () => kindBox,
  levaBox: () => levaBox,
  lhe1SampleEntry: () => lhe1SampleEntry,
  lhv1SampleEntry: () => lhv1SampleEntry,
  lhvCBox: () => lhvCBox,
  lselBox: () => lselBox,
  lvc1SampleEntry: () => lvc1SampleEntry,
  lvcCBox: () => lvcCBox,
  m4aeSampleEntry: () => m4aeSampleEntry,
  maxrBox: () => maxrBox,
  mdatBox: () => mdatBox,
  mdcvBox: () => mdcvBox,
  mdhdBox: () => mdhdBox,
  mdiaBox: () => mdiaBox,
  mecoBox: () => mecoBox,
  mehdBox: () => mehdBox,
  metaBox: () => metaBox,
  mettSampleEntry: () => mettSampleEntry,
  metxSampleEntry: () => metxSampleEntry,
  mfhdBox: () => mfhdBox,
  mfraBox: () => mfraBox,
  mfroBox: () => mfroBox,
  mha1SampleEntry: () => mha1SampleEntry,
  mha2SampleEntry: () => mha2SampleEntry,
  mhm1SampleEntry: () => mhm1SampleEntry,
  mhm2SampleEntry: () => mhm2SampleEntry,
  minfBox: () => minfBox,
  mjp2SampleEntry: () => mjp2SampleEntry,
  mjpgSampleEntry: () => mjpgSampleEntry,
  moofBox: () => moofBox,
  moovBox: () => moovBox,
  mp4aSampleEntry: () => mp4aSampleEntry,
  mp4sSampleEntry: () => mp4sSampleEntry,
  mp4vSampleEntry: () => mp4vSampleEntry,
  mskCBox: () => mskCBox,
  msrcTrackGroupTypeBox: () => msrcTrackGroupTypeBox,
  mvexBox: () => mvexBox,
  mvhdBox: () => mvhdBox,
  mvifSampleGroupEntry: () => mvifSampleGroupEntry,
  nmhdBox: () => nmhdBox,
  npckBox: () => npckBox,
  numpBox: () => numpBox,
  padbBox: () => padbBox,
  panoBox: () => panoBox,
  paspBox: () => paspBox,
  paylBox: () => paylBox,
  paytBox: () => paytBox,
  pdinBox: () => pdinBox,
  piffLsmBox: () => piffLsmBox,
  piffPsshBox: () => piffPsshBox,
  piffSencBox: () => piffSencBox,
  piffTencBox: () => piffTencBox,
  piffTfrfBox: () => piffTfrfBox,
  piffTfxdBox: () => piffTfxdBox,
  pitmBox: () => pitmBox,
  pixiBox: () => pixiBox,
  pmaxBox: () => pmaxBox,
  povdBox: () => povdBox,
  prdiBox: () => prdiBox,
  prfrBox: () => prfrBox,
  prftBox: () => prftBox,
  prgrBox: () => prgrBox,
  profBox: () => profBox,
  prolSampleGroupEntry: () => prolSampleGroupEntry,
  psshBox: () => psshBox,
  pymdBox: () => pymdBox,
  rapSampleGroupEntry: () => rapSampleGroupEntry,
  rashSampleGroupEntry: () => rashSampleGroupEntry,
  resvSampleEntry: () => resvSampleEntry,
  rinfBox: () => rinfBox,
  rollSampleGroupEntry: () => rollSampleGroupEntry,
  rtp_Box: () => rtp_Box,
  saioBox: () => saioBox,
  saizBox: () => saizBox,
  sbgpBox: () => sbgpBox,
  sbpmBox: () => sbpmBox,
  sbttSampleEntry: () => sbttSampleEntry,
  schiBox: () => schiBox,
  schmBox: () => schmBox,
  scifSampleGroupEntry: () => scifSampleGroupEntry,
  scnmSampleGroupEntry: () => scnmSampleGroupEntry,
  sdp_Box: () => sdp_Box,
  sdtpBox: () => sdtpBox,
  seigSampleGroupEntry: () => seigSampleGroupEntry,
  sencBox: () => sencBox,
  sgpdBox: () => sgpdBox,
  sidxBox: () => sidxBox,
  sinfBox: () => sinfBox,
  skipBox: () => skipBox,
  slidBox: () => slidBox,
  smhdBox: () => smhdBox,
  sratBox: () => sratBox,
  ssixBox: () => ssixBox,
  stblBox: () => stblBox,
  stcoBox: () => stcoBox,
  stdpBox: () => stdpBox,
  sterBox: () => sterBox,
  sthdBox: () => sthdBox,
  stppSampleEntry: () => stppSampleEntry,
  strdBox: () => strdBox,
  striBox: () => striBox,
  strkBox: () => strkBox,
  stsaSampleGroupEntry: () => stsaSampleGroupEntry,
  stscBox: () => stscBox,
  stsdBox: () => stsdBox,
  stsgBox: () => stsgBox,
  stshBox: () => stshBox,
  stssBox: () => stssBox,
  stszBox: () => stszBox,
  sttsBox: () => sttsBox,
  stviBox: () => stviBox,
  stxtSampleEntry: () => stxtSampleEntry,
  stypBox: () => stypBox,
  stz2Box: () => stz2Box,
  subsBox: () => subsBox,
  syncSampleGroupEntry: () => syncSampleGroupEntry,
  taicBox: () => taicBox,
  taptBox: () => taptBox,
  teleSampleGroupEntry: () => teleSampleGroupEntry,
  tencBox: () => tencBox,
  tfdtBox: () => tfdtBox,
  tfhdBox: () => tfhdBox,
  tfraBox: () => tfraBox,
  tkhdBox: () => tkhdBox,
  tmaxBox: () => tmaxBox,
  tminBox: () => tminBox,
  totlBox: () => totlBox,
  tpayBox: () => tpayBox,
  tpylBox: () => tpylBox,
  trafBox: () => trafBox,
  trakBox: () => trakBox,
  trefBox: () => trefBox,
  trepBox: () => trepBox,
  trexBox: () => trexBox,
  trgrBox: () => trgrBox,
  trpyBox: () => trpyBox,
  trunBox: () => trunBox,
  tsasSampleGroupEntry: () => tsasSampleGroupEntry,
  tsclSampleGroupEntry: () => tsclSampleGroupEntry,
  tselBox: () => tselBox,
  tsynBox: () => tsynBox,
  tx3gSampleEntry: () => tx3gSampleEntry,
  txtcBox: () => txtcBox,
  tycoBox: () => tycoBox,
  udesBox: () => udesBox,
  udtaBox: () => udtaBox,
  uncCBox: () => uncCBox,
  uncvSampleEntry: () => uncvSampleEntry,
  urlBox: () => urlBox,
  urnBox: () => urnBox,
  viprSampleGroupEntry: () => viprSampleGroupEntry,
  vmhdBox: () => vmhdBox,
  vp08SampleEntry: () => vp08SampleEntry,
  vp09SampleEntry: () => vp09SampleEntry,
  vpcCBox: () => vpcCBox,
  vttCBox: () => vttCBox,
  vttcBox: () => vttcBox,
  vvc1SampleEntry: () => vvc1SampleEntry,
  vvcCBox: () => vvcCBox,
  vvcNSampleEntry: () => vvcNSampleEntry,
  vvi1SampleEntry: () => vvi1SampleEntry,
  vvnCBox: () => vvnCBox,
  vvs1SampleEntry: () => vvs1SampleEntry,
  waveBox: () => waveBox,
  wbbrBox: () => wbbrBox,
  wvttSampleEntry: () => wvttSampleEntry,
  xmlBox: () => xmlBox
});
var BoxParser = registerBoxes(all_boxes_exports);
registerDescriptors(descriptor_exports);

// src/host/audio/demuxer.ts
function searchDescriptors(descs, wantTag) {
  if (!descs) return null;
  for (const desc of descs) {
    if (desc.tag === wantTag && desc.data instanceof Uint8Array && desc.data.byteLength > 0) {
      return desc.data;
    }
    const nested = searchDescriptors(desc.descs, wantTag);
    if (nested) return nested;
  }
  return null;
}
function extractAudioSpecificConfig(entry) {
  const descs = (entry?.esds ?? entry?.wave?.esds)?.esd?.descs;
  return searchDescriptors(descs, 5) ?? searchDescriptorsAnyData(descs);
}
function searchDescriptorsAnyData(descs) {
  if (!descs) return null;
  for (const desc of descs) {
    if (desc.data instanceof Uint8Array && desc.data.byteLength > 0) return desc.data;
    const nested = searchDescriptorsAnyData(desc.descs);
    if (nested) return nested;
  }
  return null;
}
function trackInternals(track) {
  return track;
}
function pickAudioTrack(tracks) {
  const withAudio = tracks.filter((track) => trackInternals(track).audio !== void 0);
  const candidates = withAudio.length > 0 ? withAudio : tracks;
  const mp4a = candidates.find((track) => (trackInternals(track).codec ?? "").startsWith("mp4a"));
  return mp4a ?? candidates[0] ?? null;
}
function toTrackInfo(track, trak) {
  const internals = trackInternals(track);
  const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
  const timescale = internals.timescale ?? 0;
  const duration2 = internals.duration ?? 0;
  const samplesDuration = internals.samples_duration ?? 0;
  const effectiveDuration = samplesDuration > 0 ? samplesDuration : duration2;
  return {
    trackId: internals.id,
    codec: internals.codec ?? "unknown",
    sampleRate: internals.audio?.sample_rate ?? 0,
    channelCount: internals.audio?.channel_count ?? 0,
    timescale,
    durationSeconds: timescale > 0 && effectiveDuration > 0 ? effectiveDuration / timescale : null,
    samplesDuration: samplesDuration > 0 ? samplesDuration : null,
    audioSpecificConfig: extractAudioSpecificConfig(entry),
    declaredSampleCount: typeof internals.nb_samples === "number" ? internals.nb_samples : null
  };
}
function toMp4Buffer(bytes) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return Object.assign(copy, { fileStart: 0 });
}
function demuxAudioTrack(bytes, options = {}) {
  const maxFrames = options.maxFrames ?? Number.MAX_SAFE_INTEGER;
  const warn = options.onWarn ?? (() => void 0);
  const file = createFile();
  const frames = [];
  const state = {
    info: null,
    failure: null,
    started: false
  };
  const push = (data3) => {
    if (!(data3 instanceof Uint8Array) || data3.byteLength === 0) return;
    if (frames.length >= maxFrames) return;
    frames.push(data3);
  };
  file.onError = (module, message) => {
    state.failure ??= new Error(`mp4box \u89E3\u6790\u5931\u8D25\uFF08${module}\uFF09\uFF1A${message}`);
  };
  file.onReady = (movie) => {
    const tracks = movie.tracks ?? [];
    const track = pickAudioTrack(tracks);
    if (!track) {
      state.failure ??= new Error("\u8FD9\u4E2A\u6587\u4EF6\u91CC\u6CA1\u6709\u627E\u5230\u97F3\u8F68");
      return;
    }
    state.info = toTrackInfo(track, file.getTrackById(trackInternals(track).id));
    const pending = file.setExtractionOptions(state.info.trackId, null, { nbSamples: 200 });
    if (pending !== void 0 && pending !== null && typeof pending.then === "function") {
      pending.then(void 0, (error) => {
        warn(`setExtractionOptions \u5931\u8D25\uFF1A${String(error)}`);
      });
    }
    file.start();
    state.started = true;
  };
  file.onSamples = (_trackId, _user, samples2) => {
    for (const sample2 of samples2) push(sample2.data);
  };
  file.appendBuffer(toMp4Buffer(bytes));
  file.flush();
  const info = state.info;
  if (state.failure) throw state.failure;
  if (!info) throw new Error("\u89E3\u5C01\u88C5\u5931\u8D25\uFF1A\u6CA1\u6709\u89E3\u6790\u51FA\u8F68\u9053\u4FE1\u606F");
  if (frames.length === 0 && state.started) {
    warn("onSamples \u6CA1\u6709\u56DE\u8C03\uFF0C\u9000\u56DE sample \u8868\u8BFB\u53D6");
    const track = file.getTrackById(info.trackId);
    const samples2 = trackInternals(track).samples ?? [];
    for (const sample2 of samples2) push(sample2.data);
  }
  if (frames.length === 0) throw new Error("\u89E3\u5C01\u88C5\u5931\u8D25\uFF1A\u6CA1\u6709\u53D6\u5230\u4EFB\u4F55\u97F3\u9891\u5E27");
  const totalBytes = frames.reduce((sum, frame2) => sum + frame2.byteLength, 0);
  return { info, frames, totalBytes };
}
function createStreamingDemuxer(options = {}) {
  const warn = options.onWarn ?? (() => void 0);
  const file = createFile();
  const state = { info: null, failure: null };
  let offset = 0;
  let pending = [];
  file.onError = (module, message) => {
    state.failure ??= new Error(`mp4box \u89E3\u6790\u5931\u8D25\uFF08${module}\uFF09\uFF1A${message}`);
  };
  file.onReady = (movie) => {
    const tracks = movie.tracks ?? [];
    const track = pickAudioTrack(tracks);
    if (!track) {
      state.failure ??= new Error("\u8FD9\u4E2A\u6587\u4EF6\u91CC\u6CA1\u6709\u627E\u5230\u97F3\u8F68");
      return;
    }
    state.info = toTrackInfo(
      track,
      file.getTrackById(trackInternals(track).id)
    );
    const inFlight = file.setExtractionOptions(state.info.trackId, null, { nbSamples: 200 });
    if (inFlight !== void 0 && inFlight !== null && typeof inFlight.then === "function") {
      inFlight.then(void 0, (error) => {
        warn(`setExtractionOptions \u5931\u8D25\uFF1A${String(error)}`);
      });
    }
    file.start();
  };
  file.onSamples = (_trackId, _user, samples2) => {
    for (const sample2 of samples2) {
      const data3 = sample2.data;
      if (data3 instanceof Uint8Array && data3.byteLength > 0) pending.push(data3);
    }
  };
  const drain = () => {
    const out = pending;
    pending = [];
    return out;
  };
  return {
    append(chunk) {
      if (state.failure) throw state.failure;
      const buffer2 = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(buffer2).set(chunk);
      Object.assign(buffer2, { fileStart: offset });
      offset += chunk.byteLength;
      file.appendBuffer(buffer2);
      const out = drain();
      if (state.failure) throw state.failure;
      return out;
    },
    flush() {
      file.flush();
      return drain();
    },
    get info() {
      return state.info;
    },
    get appendedBytes() {
      return offset;
    }
  };
}

// src/host/audio/wav.ts
var WAV_HEADER_BYTES = 44;
var BITS_PER_SAMPLE = 16;
var BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
function resolve(format2) {
  const sampleRate2 = Math.round(format2.sampleRate);
  const channels2 = Math.max(1, Math.round(format2.channels));
  const bitsPerSample = format2.bitsPerSample ?? BITS_PER_SAMPLE;
  if (!Number.isFinite(sampleRate2) || sampleRate2 <= 0) {
    throw new Error(`\u975E\u6CD5\u7684\u91C7\u6837\u7387\uFF1A${String(format2.sampleRate)}`);
  }
  return { sampleRate: sampleRate2, channels: channels2, bitsPerSample };
}
function pcmByteLength(frames, format2) {
  const { channels: channels2, bitsPerSample } = resolve(format2);
  return Math.max(0, Math.round(frames)) * channels2 * (bitsPerSample / 8);
}
function predictedPcmBytes(durationSeconds, format2) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const { sampleRate: sampleRate2 } = resolve(format2);
  return pcmByteLength(Math.round(durationSeconds * sampleRate2), format2);
}
function buildWavHeader(format2, dataBytes) {
  const { sampleRate: sampleRate2, channels: channels2, bitsPerSample } = resolve(format2);
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRate2 * channels2 * bytesPerSample;
  const blockAlign = channels2 * bytesPerSample;
  const dataSize = Math.max(0, Math.floor(dataBytes));
  const header2 = Buffer.alloc(WAV_HEADER_BYTES);
  header2.write("RIFF", 0, "ascii");
  header2.writeUInt32LE(36 + dataSize, 4);
  header2.write("WAVE", 8, "ascii");
  header2.write("fmt ", 12, "ascii");
  header2.writeUInt32LE(16, 16);
  header2.writeUInt16LE(1, 20);
  header2.writeUInt16LE(channels2, 22);
  header2.writeUInt32LE(sampleRate2, 24);
  header2.writeUInt32LE(byteRate, 28);
  header2.writeUInt16LE(blockAlign, 32);
  header2.writeUInt16LE(bitsPerSample, 34);
  header2.write("data", 36, "ascii");
  header2.writeUInt32LE(dataSize, 40);
  return header2;
}
function readWavFormat(wav) {
  if (wav.byteLength < WAV_HEADER_BYTES) throw new Error("WAV \u5934\u90E8\u4E0D\u5B8C\u6574");
  if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("\u4E0D\u662F\u5408\u6CD5\u7684 WAV \u6587\u4EF6");
  }
  return {
    sampleRate: wav.readUInt32LE(24),
    channels: wav.readUInt16LE(22),
    bitsPerSample: wav.readUInt16LE(34),
    dataBytes: wav.readUInt32LE(40)
  };
}
var ProgressiveWav = class {
  format;
  /** 头部里声明（预测）的 PCM 总字节数。 */
  predictedDataBytes;
  written = 0;
  constructor(format2, predictedDataBytes) {
    this.format = resolve(format2);
    this.predictedDataBytes = Math.max(0, Math.floor(predictedDataBytes));
  }
  /** 总长度（头 + 预测 PCM）。 */
  get totalBytes() {
    return WAV_HEADER_BYTES + this.predictedDataBytes;
  }
  /** 已经累计的 PCM 字节数。 */
  get writtenBytes() {
    return this.written;
  }
  header() {
    return buildWavHeader(this.format, this.predictedDataBytes);
  }
  /** 记录一批 PCM 的写入；返回真正应当发送的字节（超出预测的部分被截断）。 */
  accept(chunk) {
    const remaining = this.predictedDataBytes - this.written;
    if (remaining <= 0) return Buffer.alloc(0);
    const accepted = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
    this.written += accepted.byteLength;
    return accepted;
  }
  /** 收尾：还需要补多少字节静音才能凑满预测长度。 */
  paddingBytes() {
    return Math.max(0, this.predictedDataBytes - this.written);
  }
  finish() {
    return silence(this.paddingBytes());
  }
};
function silence(bytes) {
  return Buffer.alloc(bytes);
}

// src/host/range.ts
var RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;
function evaluateRange(header2, total2) {
  if (header2 === null || header2 === void 0) return { status: "none" };
  const match = RANGE_PATTERN.exec(header2.trim());
  if (!match) return { status: "none" };
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return { status: "none" };
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return { status: "none" };
    if (total2 === 0) return { status: "unsatisfiable" };
    return { status: "partial", range: { start: Math.max(0, total2 - suffix), end: total2 - 1 } };
  }
  const start2 = Number(rawStart);
  if (!Number.isFinite(start2)) return { status: "none" };
  if (total2 === 0 || start2 >= total2) return { status: "unsatisfiable" };
  const end = rawEnd === "" ? total2 - 1 : Number(rawEnd);
  if (!Number.isFinite(end)) return { status: "none" };
  if (start2 > end) return { status: "unsatisfiable" };
  return { status: "partial", range: { start: start2, end: Math.min(end, total2 - 1) } };
}
function formatContentRange(range, total2) {
  return `bytes ${range.start}-${range.end}/${total2}`;
}
function parseContentRangeTotal(header2) {
  if (header2 === null || header2 === void 0) return null;
  const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(header2.trim());
  if (match === null) return null;
  const total2 = Number(match[1]);
  return Number.isFinite(total2) && total2 > 0 ? total2 : null;
}

// src/host/audio/pipeline.ts
var DEFAULT_CACHE_MAX_BYTES = 500 * 1024 * 1024;
function selectCacheEvictions(files, maxBytes) {
  const total2 = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total2 <= maxBytes) return [];
  const oldestFirst = [...files].sort((left, right) => left.modifiedAt - right.modifiedAt);
  const evictions = [];
  let remaining = total2;
  for (const file of oldestFirst) {
    if (remaining <= maxBytes) break;
    evictions.push(file);
    remaining -= file.bytes;
  }
  return evictions;
}
var AudioPipeline = class {
  constructor(options) {
    this.options = options;
    this.logger = options.logger ?? silentLogger;
  }
  options;
  logger;
  cachePath(options) {
    if (this.options.cacheEnabled?.() === false) return null;
    const dir = this.options.cacheDir;
    if (!dir) return null;
    return join(dir, `${options.bvid}-${options.cid}-${options.quality}.wav`);
  }
  /** 命中磁盘缓存就直接读，省掉一次网络 + 解码。 */
  async readCache(file) {
    try {
      const info = await stat(file);
      if (info.size <= 44) return null;
      const wav = await readFile(file);
      const format2 = readWavFormat(wav);
      return {
        wav,
        sampleRate: format2.sampleRate,
        channels: format2.channels,
        durationSeconds: format2.dataBytes / (format2.sampleRate * format2.channels * (format2.bitsPerSample / 8)),
        sourceBytes: 0,
        sourceContainer: "dash",
        sourceCodecs: null,
        demuxMs: 0,
        decodeMs: 0,
        fromCache: true
      };
    } catch {
      return null;
    }
  }
  /**
   * 查磁盘缓存（供流式起播前调用）。
   *
   * 缓存命中是最快的一条路：不用下网络、不用解码，也就不会碰到「点击后超过 5 秒
   * 手势窗口」的问题。
   */
  async readCachedAudio(options) {
    const file = this.cachePath(options);
    if (file === null) return null;
    const cached = await this.readCache(file);
    if (cached !== null) this.logger.info(`\u547D\u4E2D\u97F3\u9891\u7F13\u5B58\uFF1A${file}`);
    return cached;
  }
  /** 把整段音频写进磁盘缓存，并按上限淘汰旧文件。 */
  async writeCachedAudio(options, wav) {
    const file = this.cachePath(options);
    if (file === null || wav.byteLength <= 44) return;
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, wav);
      await this.enforceCacheLimit();
    } catch (error) {
      this.logger.warn("\u5199\u5165\u97F3\u9891\u7F13\u5B58\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u64AD\u653E\uFF09", error);
    }
  }
  /** 取音频字节，主地址失败时依次尝试备用地址。 */
  async fetchAudioBytes(urls, signal) {
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await this.options.client.fetchRaw({
          url,
          ...signal === void 0 ? {} : { signal }
        });
        if (!response.ok) {
          throw new BilibiliError("http", `\u97F3\u9891 CDN \u8FD4\u56DE HTTP ${response.status}`, {
            httpStatus: response.status
          });
        }
        return { bytes: new Uint8Array(await response.arrayBuffer()), url };
      } catch (error) {
        if (error instanceof BilibiliError && error.kind === "aborted") throw error;
        lastError = error;
        this.logger.warn(`\u97F3\u9891\u5730\u5740\u5931\u8D25\uFF0C\u5C1D\u8BD5\u4E0B\u4E00\u4E2A\uFF1A${url.slice(0, 80)}\u2026`);
      }
    }
    throw lastError instanceof Error ? lastError : new BilibiliError("network", "\u6240\u6709\u97F3\u9891\u5730\u5740\u90FD\u65E0\u6CD5\u8BBF\u95EE");
  }
  /**
   * 物化一首歌。返回的 WAV 可以直接交给回环代理。
   */
  async materialize(options) {
    const stage = options.onStage ?? (() => void 0);
    const cacheFile = this.cachePath(options);
    if (cacheFile !== null) {
      stage("cache", "\u6B63\u5728\u67E5\u627E\u7F13\u5B58\u2026", null);
      const cached = await this.readCache(cacheFile);
      if (cached !== null) {
        this.logger.info(`\u547D\u4E2D\u97F3\u9891\u7F13\u5B58\uFF1A${cacheFile}`);
        stage("ready", "\u547D\u4E2D\u7F13\u5B58", 100);
        return cached;
      }
    }
    stage("fetch", "\u6B63\u5728\u83B7\u53D6\u97F3\u9891\u5730\u5740\u2026", null);
    const stream2 = await this.options.api.getAudioStream({
      bvid: options.bvid,
      cid: options.cid,
      quality: options.quality,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    const codecs = (stream2.codecs ?? "").toLowerCase();
    if (stream2.container === "dash" && codecs !== "" && !codecs.startsWith("mp4a")) {
      throw new BilibiliError(
        "unavailable",
        `\u8FD9\u4E2A\u89C6\u9891\u7684\u97F3\u8F68\u662F ${stream2.codecs}\uFF0C\u672C\u63D2\u4EF6\u53EA\u652F\u6301 AAC\uFF08mp4a\uFF09`
      );
    }
    stage("fetch", "\u6B63\u5728\u4E0B\u8F7D\u97F3\u9891\u2026", 5);
    const { bytes } = await this.fetchAudioBytes([stream2.url, ...stream2.backupUrls], options.signal);
    this.logger.info(`\u97F3\u9891\u5DF2\u4E0B\u8F7D\uFF1A${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`);
    stage("demux", "\u6B63\u5728\u89E3\u5C01\u88C5\u2026", 35);
    const demuxStart = Date.now();
    const demuxed = demuxAudioTrack(bytes, { onWarn: (message) => this.logger.warn(message) });
    const demuxMs = Date.now() - demuxStart;
    const asc = demuxed.info.audioSpecificConfig;
    if (asc === null) {
      throw new BilibiliError("parse", "\u97F3\u9891\u6587\u4EF6\u91CC\u6CA1\u6709 AudioSpecificConfig\uFF0C\u65E0\u6CD5\u89E3\u7801");
    }
    const format2 = {
      sampleRate: demuxed.info.sampleRate,
      channels: demuxed.info.channelCount,
      bitsPerSample: 16
    };
    if (format2.sampleRate <= 0 || format2.channels <= 0) {
      throw new BilibiliError("parse", `\u97F3\u9891\u683C\u5F0F\u5F02\u5E38\uFF1A${format2.sampleRate}Hz ${format2.channels}ch`);
    }
    const predictedSeconds = demuxed.info.durationSeconds ?? demuxed.info.samplesDuration ?? options.durationHintSeconds ?? 0;
    const writer = new ProgressiveWav(format2, predictedPcmBytes(predictedSeconds, format2));
    stage("decode", "\u6B63\u5728\u89E3\u7801\u2026", 45);
    const decodeStart = Date.now();
    const decoder = new AacFrameDecoder({
      audioSpecificConfig: asc,
      onWarn: (message) => this.logger.warn(message)
    });
    await decoder.ready();
    const pieces = [writer.header()];
    let decodedFrames = 0;
    let summary;
    const totalFramesHint = summaryFramesHint(predictedSeconds, format2);
    try {
      summary = await decoder.decode(demuxed.frames, (chunk) => {
        decodedFrames += chunk.frames;
        const accepted = writer.accept(chunk.pcm);
        if (accepted.byteLength > 0) pieces.push(accepted);
        if (predictedSeconds > 0) {
          const percent = Math.min(99, 45 + Math.round(decodedFrames / totalFramesHint * 54));
          stage("decode", "\u6B63\u5728\u89E3\u7801\u2026", percent);
        }
      });
    } finally {
      decoder.free();
    }
    const decodeMs = Date.now() - decodeStart;
    const padding = writer.finish();
    if (padding.byteLength > 0) pieces.push(padding);
    const wav = Buffer.concat(pieces);
    const durationSeconds = summary.sampleRate > 0 ? summary.frames / summary.sampleRate : decodedFrames / format2.sampleRate;
    this.logger.info("\u97F3\u9891\u5DF2\u7269\u5316", {
      durationSeconds: Number(durationSeconds.toFixed(3)),
      predictedSeconds: Number(predictedSeconds.toFixed(3)),
      paddingMs: Math.round(padding.byteLength / (format2.sampleRate * format2.channels * 2) * 1e3),
      demuxMs,
      decodeMs,
      wavBytes: wav.byteLength
    });
    if (cacheFile !== null) {
      try {
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, wav);
        await this.enforceCacheLimit();
      } catch (error) {
        this.logger.warn("\u5199\u5165\u97F3\u9891\u7F13\u5B58\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u64AD\u653E\uFF09", error);
      }
    }
    stage("ready", "\u51C6\u5907\u5C31\u7EEA", 100);
    return {
      wav,
      sampleRate: summary.sampleRate,
      channels: summary.channels,
      durationSeconds,
      sourceBytes: bytes.byteLength,
      sourceContainer: stream2.container,
      sourceCodecs: stream2.codecs,
      demuxMs,
      decodeMs,
      fromCache: false
    };
  }
  /** 缓存目录用量（`clearCache` 命令与状态显示用）。 */
  async cacheStats() {
    if (this.options.cacheEnabled?.() === false) return { files: 0, bytes: 0 };
    const dir = this.options.cacheDir;
    if (!dir) return { files: 0, bytes: 0 };
    try {
      const names = await readdir(dir);
      let bytes = 0;
      for (const name2 of names) {
        const info = await stat(join(dir, name2)).catch(() => null);
        if (info?.isFile()) bytes += info.size;
      }
      return { files: names.length, bytes };
    } catch {
      return { files: 0, bytes: 0 };
    }
  }
  /** 清空磁盘缓存。 */
  async clearCache() {
    const dir = this.options.cacheDir;
    if (!dir) return;
    await rm(dir, { recursive: true, force: true });
  }
  /**
   * 流式物化：先下头部就起播，剩下的在后台补。
   *
   * 与 `materialize` 的区别是它**不返回**完整 WAV，而是通过 `sink` 把 PCM 一段段推
   * 给调用方（调用方写进边写边播的缓冲区，代理按 Range 提供）。这样：
   *
   *  - 宿主可以在一秒左右就把播放地址交给界面，`play()` 落在 5 秒手势窗口内，
   *    不会再有「时钟在走却没声音」；
   *  - 出声时间从「整段下完 + 全曲解码」（实测约 6 秒）降到「头部下完 + 头部解码」
   *    （约 1～2 秒）。
   *
   * 任何一步失败都往上抛，由调用方决定是否退回 `materialize`（它更慢但更稳）。
   */
  async materializeStreaming(options) {
    const stage = options.onStage ?? (() => void 0);
    stage("fetch", "\u6B63\u5728\u83B7\u53D6\u97F3\u9891\u5730\u5740\u2026", null);
    const stream2 = await this.options.api.getAudioStream({
      bvid: options.bvid,
      cid: options.cid,
      quality: options.quality,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    const codecs = (stream2.codecs ?? "").toLowerCase();
    if (stream2.container === "dash" && codecs !== "" && !codecs.startsWith("mp4a")) {
      throw new BilibiliError("unavailable", `\u8FD9\u4E2A\u89C6\u9891\u7684\u97F3\u8F68\u662F ${stream2.codecs}\uFF0C\u672C\u63D2\u4EF6\u53EA\u652F\u6301 AAC\uFF08mp4a\uFF09`);
    }
    const durationHintSeconds = options.durationHintSeconds ?? stream2.durationSeconds ?? 0;
    if (durationHintSeconds <= 0) {
      throw new BilibiliError("parse", "\u7F3A\u5C11\u65F6\u957F\u4FE1\u606F\uFF0C\u65E0\u6CD5\u9884\u6D4B WAV \u603B\u957F");
    }
    stage("fetch", "\u6B63\u5728\u4E0B\u8F7D\u5F00\u5934\u2026", 5);
    const head = await this.fetchRange(stream2.url, 0, HEAD_FETCH_BYTES - 1, stream2.backupUrls, options.signal);
    if (!head.ranged) {
      throw new BilibiliError("network", "\u97F3\u9891 CDN \u672A\u6309 Range \u8FD4\u56DE\uFF0C\u6539\u7528\u6574\u6BB5\u4E0B\u8F7D");
    }
    const demuxer = createStreamingDemuxer({ onWarn: (message) => this.logger.warn(message) });
    let frames = demuxer.append(head.bytes);
    const info = demuxer.info;
    if (info === null) {
      throw new BilibiliError("parse", "\u5934\u90E8\u6570\u636E\u91CC\u6CA1\u6709\u89E3\u6790\u51FA\u97F3\u8F68\u4FE1\u606F");
    }
    const asc = info.audioSpecificConfig;
    if (asc === null) {
      throw new BilibiliError("parse", "\u97F3\u9891\u6587\u4EF6\u91CC\u6CA1\u6709 AudioSpecificConfig\uFF0C\u65E0\u6CD5\u89E3\u7801");
    }
    const format2 = {
      sampleRate: info.sampleRate,
      channels: info.channelCount,
      bitsPerSample: 16
    };
    if (info.sampleRate <= 0 || info.channelCount <= 0) {
      throw new BilibiliError("parse", `\u97F3\u9891\u683C\u5F0F\u5F02\u5E38\uFF1A${info.sampleRate}Hz ${info.channelCount}ch`);
    }
    const predictedSeconds = durationHintSeconds * DURATION_SAFETY_FACTOR + DURATION_SAFETY_SECONDS;
    const dataBytes = predictedPcmBytes(predictedSeconds, format2);
    const totalBytes = 44 + dataBytes;
    options.sink.onHeader({ format: format2, totalBytes, headerBytes: buildWavHeader(format2, dataBytes) });
    stage("decode", "\u6B63\u5728\u89E3\u7801\u2026", 30);
    const decoder = new AacFrameDecoder({
      audioSpecificConfig: asc,
      onWarn: (message) => this.logger.warn(message)
    });
    await decoder.ready();
    const decodeStart = Date.now();
    let pcmBytes = 0;
    const consume = (chunk) => {
      pcmBytes += chunk.pcm.byteLength;
      options.sink.onPcm(chunk.pcm);
    };
    const fedLengths = [];
    const consumeFrames = async (list) => {
      if (list.length === 0) return;
      for (const frame2 of list) fedLengths.push(frame2.byteLength);
      await decoder.decodePartial(list, consume);
    };
    await consumeFrames(frames);
    stage("decode", "\u5DF2\u5F00\u59CB\u64AD\u653E\uFF0C\u6B63\u5728\u89E3\u7801\u540E\u7EED\u5185\u5BB9\u2026", 60);
    let restBytes = 0;
    let totalSize = head.totalSize;
    let offset = head.bytes.byteLength;
    const restChunks = [];
    try {
      while (totalSize === null || offset < totalSize) {
        if (options.signal?.aborted === true) break;
        const end = totalSize === null ? offset + REST_CHUNK_BYTES - 1 : Math.min(offset + REST_CHUNK_BYTES - 1, totalSize - 1);
        const rest = await this.fetchRange(stream2.url, offset, end, stream2.backupUrls, options.signal);
        if (!rest.ranged || rest.bytes.byteLength === 0) break;
        restBytes += rest.bytes.byteLength;
        offset += rest.bytes.byteLength;
        if (rest.totalSize !== null) totalSize = rest.totalSize;
        restChunks.push(Buffer.from(rest.bytes));
        await consumeFrames(demuxer.append(rest.bytes));
      }
      await consumeFrames(demuxer.flush());
      await this.reconcileTail(
        Buffer.concat([Buffer.from(head.bytes), ...restChunks]),
        fedLengths,
        consumeFrames
      );
      await decoder.flush(consume);
    } finally {
      decoder.free();
    }
    const decodeMs = Date.now() - decodeStart;
    const paddingBytes = Math.max(0, dataBytes - pcmBytes);
    options.sink.onFinish(paddingBytes);
    const durationSeconds = info.sampleRate > 0 && info.channelCount > 0 ? pcmBytes / (info.channelCount * 2) / info.sampleRate : 0;
    this.logger.info("\u6D41\u5F0F\u7269\u5316\u5B8C\u6210", {
      headBytes: head.bytes.byteLength,
      restBytes,
      pcmBytes,
      paddingBytes,
      durationSeconds: Number(durationSeconds.toFixed(2)),
      decodeMs
    });
    return {
      sampleRate: info.sampleRate,
      channels: info.channelCount,
      totalBytes,
      pcmBytes,
      durationSeconds,
      headBytes: head.bytes.byteLength,
      restBytes,
      decodeMs
    };
  }
  /**
   * 用整段解封装给增量解析对账，补齐可能漏掉的尾部帧。
   *
   * 只在「已喂的帧长度序列与整段解析的前缀完全一致」时才补——那说明增量结果确实是
   * 整段结果的前缀，多出来的部分就是漏掉的尾部。对不上就什么都不做（宁可少听 20ms，
   * 也不能把错位的帧喂进解码器）。
   */
  async reconcileTail(accumulated, fedLengths, consumeFrames) {
    if (accumulated.byteLength === 0) return;
    let whole;
    try {
      whole = demuxAudioTrack(new Uint8Array(accumulated), {
        onWarn: (message) => this.logger.warn(message)
      });
    } catch (error) {
      this.logger.warn("\u6574\u6BB5\u5BF9\u8D26\u5931\u8D25\uFF08\u5FFD\u7565\uFF0C\u7EE7\u7EED\u7528\u589E\u91CF\u7ED3\u679C\uFF09", error);
      return;
    }
    if (whole.frames.length <= fedLengths.length) return;
    const prefixMatches = fedLengths.every(
      (length2, index) => whole.frames[index]?.byteLength === length2
    );
    if (!prefixMatches) {
      this.logger.warn("\u6574\u6BB5\u5BF9\u8D26\u53D1\u73B0\u524D\u7F00\u4E0D\u4E00\u81F4\uFF0C\u653E\u5F03\u8865\u5E27\uFF08\u907F\u514D\u5582\u9519\u4F4D\u7684\u5E27\uFF09");
      return;
    }
    const extra = whole.frames.slice(fedLengths.length);
    this.logger.info(`\u589E\u91CF\u89E3\u6790\u5C11\u7ED9\u4E86 ${extra.length} \u4E2A\u5C3E\u90E8\u5E27\uFF0C\u5DF2\u7528\u6574\u6BB5\u5BF9\u8D26\u8865\u9F50`);
    await consumeFrames(extra);
  }
  /**
   * 取一段字节。
   *
   * `ranged` 为 false 表示 CDN 没按 Range 返回（HTTP 200 整段），调用方必须据此
   * 放弃「边下边播」的假设——直接拿它当整段用是最稳的。
   */
  async fetchRange(url, start2, end, backupUrls = [], signal) {
    let lastError = null;
    for (const candidate of [url, ...backupUrls]) {
      try {
        const response = await this.options.client.fetchRaw({
          url: candidate,
          headers: { Range: `bytes=${start2}-${end}` },
          ...signal === void 0 ? {} : { signal }
        });
        if (!response.ok && response.status !== 206) {
          throw new BilibiliError("http", `\u97F3\u9891 CDN \u8FD4\u56DE HTTP ${response.status}`, {
            httpStatus: response.status
          });
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentRange = response.headers.get("content-range");
        const totalSize = parseContentRangeTotal(contentRange);
        return { bytes, ranged: response.status === 206, totalSize };
      } catch (error) {
        if (error instanceof BilibiliError && error.kind === "aborted") throw error;
        lastError = error;
        this.logger.warn(`\u5206\u6BB5\u4E0B\u8F7D\u5931\u8D25\uFF0C\u5C1D\u8BD5\u4E0B\u4E00\u4E2A\u5730\u5740\uFF1A${candidate.slice(0, 80)}\u2026`);
      }
    }
    throw lastError instanceof Error ? lastError : new BilibiliError("network", "\u5206\u6BB5\u4E0B\u8F7D\u97F3\u9891\u5931\u8D25");
  }
  /**
   * 超出上限时按「最久未修改」淘汰，返回删掉的文件数。
   *
   * 设置项 `musicPlayer.cache.maxMB` 默认 500MB，而一首 WAV 就有 30–40MB，不淘汰的话
   * 听十几首就把用户的磁盘占满了。（公开是为了能直接测这条真会删文件的路径。）
   */
  async enforceCacheLimit() {
    const dir = this.options.cacheDir;
    if (!dir) return 0;
    const maxBytes = this.options.getCacheMaxBytes?.() ?? this.options.cacheMaxBytes ?? DEFAULT_CACHE_MAX_BYTES;
    if (maxBytes <= 0) return 0;
    let names;
    try {
      names = await readdir(dir);
    } catch {
      return 0;
    }
    const files = [];
    for (const name2 of names) {
      const info = await stat(join(dir, name2)).catch(() => null);
      if (info?.isFile()) {
        files.push({ name: name2, bytes: info.size, modifiedAt: info.mtimeMs });
      }
    }
    const evictions = selectCacheEvictions(files, maxBytes);
    if (evictions.length === 0) return 0;
    for (const file of evictions) {
      await rm(join(dir, file.name), { force: true }).catch(() => void 0);
    }
    this.logger.info(
      `\u97F3\u9891\u7F13\u5B58\u8D85\u51FA\u4E0A\u9650\uFF0C\u5DF2\u6DD8\u6C70 ${evictions.length} \u4E2A\u6587\u4EF6\uFF08${Math.round(
        evictions.reduce((sum, file) => sum + file.bytes, 0) / 1024 / 1024
      )}MB\uFF09`
    );
    return evictions.length;
  }
};
function summaryFramesHint(seconds, format2) {
  return Math.max(1, Math.round(seconds * format2.sampleRate));
}
var HEAD_FETCH_BYTES = 1536e3;
var REST_CHUNK_BYTES = 1048576;
var DURATION_SAFETY_FACTOR = 1.01;
var DURATION_SAFETY_SECONDS = 0.5;

// src/host/media.ts
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir as mkdir2, readdir as readdir2, rename, rm as rm2, stat as stat2 } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname as dirname2, join as join3 } from "node:path";
import { Readable } from "node:stream";
import { pipeline as pump } from "node:stream/promises";

// src/host/paths.ts
import { homedir } from "node:os";
import { join as join2, resolve as resolve2 } from "node:path";
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME?.trim();
  return fromEnv ? resolve2(fromEnv) : join2(homedir(), ".dsh");
}
var DATA_DIR = join2(resolveDshHome(), "music-player");
var CACHE_DIR = join2(DATA_DIR, "cache");
var CACHE_WAV_DIR = join2(CACHE_DIR, "wav");
var CACHE_RAW_DIR = join2(CACHE_DIR, "raw");
var SETTINGS_FILE = join2(DATA_DIR, "settings.json");
var COOKIES_FILE = join2(DATA_DIR, "cookies.json");
var WBI_FILE = join2(DATA_DIR, "wbi.json");

// src/host/media.ts
var MAX_WAV_SECONDS = 30 * 60;
var MAX_RAW_CACHE_BYTES = 200 * 1024 * 1024;
var MAX_CONCURRENT_CACHE_DOWNLOADS = 2;
var MAX_IMAGE_BYTES = 8 * 1024 * 1024;
var IMAGE_HOSTS = /(^|\.)(hdslb\.com|biliimg\.com|bilivideo\.com)$/i;
function contentLength(response) {
  const raw = response.headers.get("content-length");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function cacheFileName(bvid, cid, quality) {
  return `${bvid}-${cid}-${quality}.m4s`;
}
var MediaService = class {
  constructor(options) {
    this.options = options;
  }
  options;
  entries = /* @__PURE__ */ new Map();
  activeDownloads = 0;
  /** Resolve a video to a playable media URL. */
  async play(options) {
    const track = await this.resolveTrack(options.bvid, options.cid, options.signal, options.track);
    const cid = track.cid;
    if (cid === void 0) throw new BilibiliError("unavailable", "\u7F3A\u5C11 cid\uFF0C\u65E0\u6CD5\u64AD\u653E");
    const durationHint = track.durationSeconds > 0 ? track.durationSeconds : 0;
    if (options.format === "wav") {
      if (durationHint > MAX_WAV_SECONDS) {
        throw new BilibiliError(
          "unavailable",
          `\u8FD9\u4E2A\u6D4F\u89C8\u5668\u65E0\u6CD5\u76F4\u63A5\u64AD\u653E AAC\uFF0C\u800C\u8BE5\u89C6\u9891\u7EA6 ${Math.round(durationHint / 60)} \u5206\u949F\uFF0C\u8F6C\u7801\u4F1A\u5360\u7528\u8FC7\u591A\u5185\u5B58`
        );
      }
      const materialized = await this.options.pipeline.materialize({
        bvid: options.bvid,
        cid,
        quality: options.quality,
        ...durationHint > 0 ? { durationHintSeconds: durationHint } : {},
        ...options.signal === void 0 ? {} : { signal: options.signal }
      });
      const id2 = randomUUID();
      const entry2 = {
        kind: "wav",
        id: id2,
        bvid: options.bvid,
        cid,
        quality: options.quality,
        title: track.title,
        contentType: "audio/wav",
        durationSeconds: materialized.durationSeconds || durationHint,
        createdAt: Date.now(),
        cachePath: null,
        bytes: materialized.wav
      };
      this.entries.set(id2, entry2);
      this.trimEntries();
      return {
        id: id2,
        url: `/dsh-music-player/media/${id2}`,
        track: { ...track, durationSeconds: entry2.durationSeconds },
        durationSeconds: entry2.durationSeconds,
        contentType: entry2.contentType,
        format: "wav",
        fromCache: materialized.fromCache,
        size: entry2.bytes.byteLength
      };
    }
    const stream2 = await this.options.api.getAudioStream({
      bvid: options.bvid,
      cid,
      quality: options.quality,
      ...options.signal === void 0 ? {} : { signal: options.signal }
    });
    const codecs = (stream2.codecs ?? "").toLowerCase();
    if (stream2.container === "dash" && codecs !== "" && !codecs.startsWith("mp4a")) {
      throw new BilibiliError("unavailable", `\u8FD9\u4E2A\u89C6\u9891\u7684\u97F3\u8F68\u662F ${stream2.codecs}\uFF0C\u76EE\u524D\u53EA\u652F\u6301 AAC`);
    }
    const cacheEnabled = this.options.cacheEnabled();
    const cachePath = cacheEnabled ? join3(CACHE_RAW_DIR, cacheFileName(options.bvid, cid, options.quality)) : null;
    let size = null;
    try {
      size = await this.probeSize(stream2.url, options.signal);
    } catch (error) {
      this.options.logger.debug("\u65E0\u6CD5\u63A2\u6D4B\u97F3\u9891\u957F\u5EA6\uFF08\u4E0D\u5F71\u54CD\u64AD\u653E\uFF09", toBilibiliError(error).message);
    }
    const id = randomUUID();
    const entry = {
      kind: "raw",
      id,
      bvid: options.bvid,
      cid,
      quality: options.quality,
      title: track.title,
      contentType: stream2.container === "durl" ? "video/mp4" : "audio/mp4",
      durationSeconds: stream2.durationSeconds ?? durationHint,
      createdAt: Date.now(),
      cachePath,
      url: stream2.url,
      backupUrls: stream2.backupUrls,
      size,
      cacheStarted: false
    };
    this.entries.set(id, entry);
    this.trimEntries();
    let fromCache = false;
    if (cachePath !== null) {
      try {
        const info = await stat2(cachePath);
        if (info.isFile() && info.size > 0) {
          entry.size = info.size;
          fromCache = true;
        }
      } catch {
      }
    }
    return {
      id,
      url: `/dsh-music-player/media/${id}`,
      track: { ...track, durationSeconds: entry.durationSeconds },
      durationSeconds: entry.durationSeconds,
      contentType: entry.contentType,
      format: "raw",
      fromCache,
      size: entry.size
    };
  }
  /** Resolve the first page's cid when the caller did not provide one. */
  async resolveTrack(bvid, cid, signal, known = {}) {
    if (cid !== void 0) {
      return {
        bvid,
        cid,
        title: known.title ?? "",
        author: known.author ?? "",
        cover: known.cover ?? "",
        durationSeconds: known.durationSeconds ?? 0,
        pageCount: known.pageCount ?? 1
      };
    }
    const pages = await this.options.api.getPageList(bvid, signal);
    const first = pages[0];
    if (!first) throw new BilibiliError("unavailable", `\u89C6\u9891\u6CA1\u6709\u5206 P\uFF1A${bvid}`);
    return {
      bvid,
      cid: first.cid,
      title: known.title ?? first.part ?? "",
      author: known.author ?? "",
      cover: known.cover ?? first.first_frame ?? "",
      durationSeconds: known.durationSeconds !== void 0 && known.durationSeconds > 0 ? known.durationSeconds : first.duration ?? 0,
      pageCount: known.pageCount !== void 0 && known.pageCount > 0 ? known.pageCount : pages.length
    };
  }
  async probeSize(url, signal) {
    const response = await this.options.client.fetchRaw({
      url,
      headers: { Range: "bytes=0-0" },
      ...signal === void 0 ? {} : { signal },
      timeoutMs: 12e3
    });
    if (!response.ok && response.status !== 206) return null;
    const fromRange = parseContentRangeTotal(response.headers.get("content-range"));
    if (fromRange !== null) {
      await response.body?.cancel();
      return fromRange;
    }
    const length2 = contentLength(response);
    await response.body?.cancel();
    return length2;
  }
  /** Serve `/media/:id`, honoring Range for both delivery paths. */
  async handleMedia(req, res, id) {
    const entry = this.entries.get(id);
    if (entry === void 0) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("media not found");
      return;
    }
    if (entry.kind === "wav") {
      this.serveBuffer(req, res, entry.bytes, entry.contentType);
      return;
    }
    if (entry.cachePath !== null) {
      try {
        const info = await stat2(entry.cachePath);
        if (info.isFile() && info.size > 0) {
          if (entry.size === null) entry.size = info.size;
          await this.serveFile(req, res, entry.cachePath, entry.contentType);
          return;
        }
      } catch {
      }
    }
    await this.proxyRaw(req, res, entry, true);
  }
  serveBuffer(req, res, bytes, contentType) {
    const total2 = bytes.byteLength;
    const outcome = evaluateRange(req.headers.range, total2);
    if (outcome.status === "unsatisfiable") {
      res.writeHead(416, { "Content-Range": `bytes */${total2}` });
      res.end();
      return;
    }
    const range = outcome.status === "partial" ? outcome.range : null;
    const headers = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store"
    };
    if (range === null) {
      headers["Content-Length"] = total2;
    } else {
      headers["Content-Length"] = range.end - range.start + 1;
      headers["Content-Range"] = formatContentRange(range, total2);
    }
    res.writeHead(range === null ? 200 : 206, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(range === null ? bytes : bytes.subarray(range.start, range.end + 1));
  }
  async serveFile(req, res, path, contentType) {
    const info = await stat2(path);
    const total2 = info.size;
    const outcome = evaluateRange(req.headers.range, total2);
    if (outcome.status === "unsatisfiable") {
      res.writeHead(416, { "Content-Range": `bytes */${total2}` });
      res.end();
      return;
    }
    const range = outcome.status === "partial" ? outcome.range : null;
    const headers = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store"
    };
    if (range === null) {
      headers["Content-Length"] = total2;
    } else {
      headers["Content-Length"] = range.end - range.start + 1;
      headers["Content-Range"] = formatContentRange(range, total2);
    }
    res.writeHead(range === null ? 200 : 206, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream2 = createReadStream(path, range === null ? {} : { start: range.start, end: range.end });
    stream2.on("error", () => res.destroy());
    stream2.pipe(res);
  }
  async proxyRaw(req, res, entry, allowRefresh) {
    const attempt = async (url) => {
      const headers2 = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com/",
        Origin: "https://www.bilibili.com"
      };
      if (typeof req.headers.range === "string") headers2.Range = req.headers.range;
      return fetch(url, { headers: headers2, redirect: "follow" });
    };
    let upstream = null;
    let lastError = null;
    for (const candidate of [entry.url, ...entry.backupUrls]) {
      try {
        const response = await attempt(candidate);
        if (response.ok || response.status === 206) {
          upstream = response;
          break;
        }
        if ((response.status === 403 || response.status === 404) && allowRefresh) {
          this.options.logger.info("\u97F3\u9891\u5730\u5740\u5DF2\u8FC7\u671F\uFF0C\u91CD\u65B0\u89E3\u6790");
          try {
            const stream2 = await this.options.api.getAudioStream({
              bvid: entry.bvid,
              cid: entry.cid,
              quality: entry.quality
            });
            entry.url = stream2.url;
            entry.backupUrls = stream2.backupUrls;
            const retried = await attempt(stream2.url);
            if (retried.ok || retried.status === 206) {
              upstream = retried;
              break;
            }
          } catch (error) {
            lastError = error;
          }
          allowRefresh = false;
        }
        lastError = new BilibiliError("http", `\u97F3\u9891 CDN \u8FD4\u56DE HTTP ${response.status}`, {
          httpStatus: response.status
        });
      } catch (error) {
        lastError = error;
        this.options.logger.warn(`\u97F3\u9891\u5730\u5740\u5931\u8D25\uFF0C\u5C1D\u8BD5\u4E0B\u4E00\u4E2A\uFF1A${candidate.slice(0, 80)}\u2026`);
      }
    }
    if (upstream === null) {
      const normalized = toBilibiliError(lastError, "\u65E0\u6CD5\u83B7\u53D6\u97F3\u9891");
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: normalized.userMessage }));
      return;
    }
    const headers = {
      "Content-Type": entry.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store"
    };
    const length2 = contentLength(upstream);
    if (length2 !== null) headers["Content-Length"] = length2;
    const contentRange = upstream.headers.get("content-range");
    if (contentRange !== null) headers["Content-Range"] = contentRange;
    if (entry.size === null) {
      const total2 = parseContentRangeTotal(contentRange);
      if (total2 !== null) entry.size = total2;
      else if (upstream.status === 200 && length2 !== null) entry.size = length2;
    }
    res.writeHead(upstream.status, headers);
    if (req.method === "HEAD" || upstream.body === null) {
      res.end();
      return;
    }
    if (this.options.cacheEnabled() && entry.cachePath !== null) {
      const isInitial = req.headers.range === void 0 || /^bytes=0-/.test(String(req.headers.range));
      if (isInitial) void this.startRawCache(entry);
    }
    try {
      await pump(Readable.fromWeb(upstream.body), res);
    } catch {
      res.destroy();
    }
  }
  async startRawCache(entry) {
    if (entry.cacheStarted || entry.cachePath === null) return;
    if (this.activeDownloads >= MAX_CONCURRENT_CACHE_DOWNLOADS) return;
    if (entry.size !== null && entry.size > MAX_RAW_CACHE_BYTES) return;
    entry.cacheStarted = true;
    this.activeDownloads++;
    const temporary = `${entry.cachePath}.${process.pid}.part`;
    try {
      const response = await fetch(entry.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: "https://www.bilibili.com/",
          Origin: "https://www.bilibili.com"
        },
        redirect: "follow"
      });
      if (!response.ok || response.body === null) return;
      const total2 = contentLength(response) ?? entry.size;
      if (total2 !== null && total2 > MAX_RAW_CACHE_BYTES) {
        await response.body.cancel();
        return;
      }
      await mkdir2(dirname2(entry.cachePath), { recursive: true });
      await pump(Readable.fromWeb(response.body), createWriteStream(temporary));
      await rename(temporary, entry.cachePath);
      const info = await stat2(entry.cachePath);
      if (entry.size === null) entry.size = info.size;
      this.options.logger.debug(`\u5DF2\u7F13\u5B58\u539F\u59CB\u97F3\u9891\uFF1A${entry.cachePath}`);
      await this.enforceCacheLimit();
    } catch (error) {
      this.options.logger.debug("\u7F13\u5B58\u539F\u59CB\u97F3\u9891\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u64AD\u653E\uFF09", toBilibiliError(error).message);
      await rm2(temporary, { force: true }).catch(() => void 0);
    } finally {
      this.activeDownloads = Math.max(0, this.activeDownloads - 1);
    }
  }
  /** Cache usage across the raw and WAV stores. */
  async cacheStats() {
    let files = 0;
    let bytes = 0;
    for (const dir of [CACHE_RAW_DIR, CACHE_WAV_DIR]) {
      try {
        const names = await readdir2(dir);
        for (const name2 of names) {
          const info = await stat2(join3(dir, name2)).catch(() => null);
          if (info?.isFile()) {
            files++;
            bytes += info.size;
          }
        }
      } catch {
      }
    }
    return {
      files,
      bytes,
      maxBytes: this.options.cacheMaxBytes(),
      dir: CACHE_WAV_DIR,
      enabled: this.options.cacheEnabled()
    };
  }
  async clearCache() {
    await this.options.pipeline.clearCache();
    await rm2(CACHE_RAW_DIR, { recursive: true, force: true });
    await mkdir2(CACHE_RAW_DIR, { recursive: true });
  }
  /** Evict the oldest files across both stores until the combined size fits. */
  async enforceCacheLimit() {
    const maxBytes = this.options.cacheMaxBytes();
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return;
    const files = [];
    for (const dir of [CACHE_RAW_DIR, CACHE_WAV_DIR]) {
      try {
        const names = await readdir2(dir);
        for (const name2 of names) {
          const path = join3(dir, name2);
          const info = await stat2(path).catch(() => null);
          if (info?.isFile()) files.push({ path, bytes: info.size, modifiedAt: info.mtimeMs });
        }
      } catch {
      }
    }
    let total2 = files.reduce((sum, file) => sum + file.bytes, 0);
    if (total2 <= maxBytes) return;
    files.sort((left, right) => left.modifiedAt - right.modifiedAt);
    for (const file of files) {
      if (total2 <= maxBytes) break;
      await rm2(file.path, { force: true }).catch(() => void 0);
      total2 -= file.bytes;
    }
  }
  /** Proxy a Bilibili image through the same origin. */
  async proxyImage(url, res, signal) {
    let target = url;
    for (let depth = 0; depth < 6; depth++) {
      let candidate;
      try {
        candidate = new URL(target, "http://localhost");
      } catch {
        try {
          target = decodeURIComponent(target);
          candidate = new URL(target, "http://localhost");
        } catch {
          break;
        }
      }
      if (!candidate.pathname.endsWith("/dsh-music-player/image")) break;
      const inner = candidate.searchParams.get("url");
      if (inner === null || inner === "") break;
      target = inner;
    }
    let parsed;
    try {
      parsed = new URL(target.startsWith("//") ? `https:${target}` : target);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      res.writeHead(400).end();
      return;
    }
    if (!IMAGE_HOSTS.test(parsed.hostname)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const response = await fetch(parsed, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: "https://www.bilibili.com/"
        },
        redirect: "follow",
        ...signal === void 0 ? {} : { signal }
      });
      if (!response.ok || response.body === null) {
        res.writeHead(response.status === 404 ? 404 : 502).end();
        return;
      }
      const length2 = contentLength(response);
      if (length2 !== null && length2 > MAX_IMAGE_BYTES) {
        await response.body.cancel();
        res.writeHead(413).end();
        return;
      }
      const type = response.headers.get("content-type") ?? "image/jpeg";
      res.writeHead(200, {
        "Content-Type": type.startsWith("image/") ? type : "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        ...length2 === null ? {} : { "Content-Length": length2 }
      });
      await pump(Readable.fromWeb(response.body), res);
    } catch {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  }
  /** Drop stale entries so a long session does not retain every decoded track. */
  trimEntries() {
    const now = Date.now();
    const maxAge = 6 * 60 * 60 * 1e3;
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > maxAge) this.entries.delete(id);
    }
    while (this.entries.size > 8) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }
  /** Test hook: expose the resolved track's content type. */
  entryInfo(id) {
    const entry = this.entries.get(id);
    return entry === void 0 ? null : { kind: entry.kind, contentType: entry.contentType, durationSeconds: entry.durationSeconds };
  }
};

// src/host/qr.ts
var import_qrcode = __toESM(require_lib(), 1);
import { randomUUID as randomUUID2 } from "node:crypto";
var PASSPORT_BASE_URL = "https://passport.bilibili.com";
var PASSPORT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0";
var QR_STATUS = {
  SUCCESS: 0,
  WAITING: 86101,
  SCANNED: 86090,
  EXPIRED: 86038
};
var SESSION_TTL_MS = 5 * 60 * 1e3;
var MAX_WAIT_MS = 180 * 1e3;
function svgToDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
var QrSessionManager = class {
  constructor(client, logger, onSuccess) {
    this.client = client;
    this.logger = logger;
    this.onSuccess = onSuccess;
  }
  client;
  logger;
  onSuccess;
  sessions = /* @__PURE__ */ new Map();
  /** Replace any previous session and request a fresh QR code. */
  async start() {
    this.prune();
    const response = await this.request(`${PASSPORT_BASE_URL}/x/passport-login/web/qrcode/generate`);
    const payload = await response.json();
    if (payload.code !== 0) {
      throw new BilibiliError("api", `\u83B7\u53D6\u4E8C\u7EF4\u7801\u5931\u8D25\uFF1A${payload.message ?? payload.code}`, {
        code: payload.code
      });
    }
    const url = payload.data?.url;
    const key = payload.data?.qrcode_key;
    if (typeof url !== "string" || url === "" || typeof key !== "string" || key === "") {
      throw new BilibiliError("parse", "\u4E8C\u7EF4\u7801\u54CD\u5E94\u7F3A\u5C11 url \u6216 qrcode_key");
    }
    const svg = await (0, import_qrcode.toString)(url, { type: "svg", margin: 1, width: 240, errorCorrectionLevel: "M" });
    const session = {
      id: randomUUID2(),
      key,
      url,
      dataUrl: svgToDataUrl(svg),
      createdAt: Date.now(),
      lastStatus: "waiting",
      message: "\u8BF7\u7528\u624B\u673A B \u7AD9 App \u626B\u63CF\u4E8C\u7EF4\u7801",
      settled: false
    };
    this.sessions.set(session.id, session);
    this.logger.info("\u767B\u5F55\u4E8C\u7EF4\u7801\u5DF2\u751F\u6210");
    return { id: session.id, url, dataUrl: session.dataUrl, expiresInMs: MAX_WAIT_MS };
  }
  /** Poll one session once. The client drives the cadence. */
  async poll(id) {
    const session = this.sessions.get(id);
    if (session === void 0) return { status: "expired", message: "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6" };
    if (session.settled) return { status: session.lastStatus, message: session.message };
    if (Date.now() - session.createdAt >= MAX_WAIT_MS) {
      return this.settle(session, "expired", "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6");
    }
    let payload;
    let cookies = {};
    try {
      const response = await this.request(
        `${PASSPORT_BASE_URL}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(session.key)}`
      );
      payload = await response.json();
      if (payload.code !== 0) {
        throw new BilibiliError("api", `\u8F6E\u8BE2\u767B\u5F55\u72B6\u6001\u5931\u8D25\uFF1A${payload.message ?? payload.code}`, {
          code: payload.code
        });
      }
      const code = payload.data?.code ?? QR_STATUS.WAITING;
      if (code === QR_STATUS.SUCCESS) {
        cookies = parseSetCookieHeaders(readSetCookieHeaders(response.headers));
        if (Object.keys(cookies).length === 0) {
          return this.settle(session, "error", "\u767B\u5F55\u6210\u529F\u4F46\u6CA1\u6709\u62FF\u5230\u51ED\u636E\uFF0C\u8BF7\u91CD\u8BD5");
        }
        await this.onSuccess(cookies);
        this.logger.info("\u626B\u7801\u767B\u5F55\u6210\u529F");
        return this.settle(session, "success", "\u767B\u5F55\u6210\u529F");
      }
      if (code === QR_STATUS.EXPIRED) {
        return this.settle(session, "expired", "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u83B7\u53D6");
      }
      if (code === QR_STATUS.SCANNED) {
        session.lastStatus = "scanned";
        session.message = "\u5DF2\u626B\u63CF\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4";
        return { status: "scanned", message: session.message };
      }
      session.lastStatus = "waiting";
      session.message = "\u7B49\u5F85\u626B\u7801\u2026";
      return { status: "waiting", message: session.message };
    } catch (error) {
      const normalized = error instanceof BilibiliError ? error : new BilibiliError("network", String(error));
      if (normalized.kind === "aborted") return { status: "cancelled", message: "\u5DF2\u53D6\u6D88\u767B\u5F55" };
      this.logger.warn("\u8F6E\u8BE2\u4E8C\u7EF4\u7801\u72B6\u6001\u5931\u8D25", normalized.message);
      return { status: "waiting", message: "\u7F51\u7EDC\u6CE2\u52A8\uFF0C\u6B63\u5728\u91CD\u8BD5\u2026" };
    }
  }
  cancel(id) {
    const session = this.sessions.get(id);
    if (session !== void 0) this.settle(session, "cancelled", "\u5DF2\u53D6\u6D88\u767B\u5F55");
  }
  settle(session, status, message) {
    session.settled = true;
    session.lastStatus = status;
    session.message = message;
    return { status, message };
  }
  async request(url) {
    const response = await this.client.fetchRaw({
      url,
      userAgent: PASSPORT_USER_AGENT,
      skipCookie: true,
      headers: { Referer: "https://www.bilibili.com/" }
    });
    if (!response.ok) {
      throw new BilibiliError("http", `passport \u63A5\u53E3\u8FD4\u56DE HTTP ${response.status}`, {
        httpStatus: response.status
      });
    }
    return response;
  }
  prune() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
  }
};

// src/host/store.ts
import { mkdir as mkdir3, readFile as readFile2, rename as rename2, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";
var DEFAULT_SETTINGS = {
  audioQuality: 30280,
  defaultPlayMode: "sequential",
  volume: 0.8,
  playbackRate: 1,
  cacheEnabled: true,
  cacheMaxMB: 500,
  requestIntervalMs: 350,
  logLevel: "info",
  showStatusBar: true
};
var SPEC = {
  audioQuality: { type: "number", values: [30216, 30232, 30280] },
  defaultPlayMode: { type: "string", values: ["sequential", "repeat-all", "repeat-one", "shuffle"] },
  volume: { type: "number", min: 0, max: 1 },
  playbackRate: { type: "number", values: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
  cacheEnabled: { type: "boolean" },
  cacheMaxMB: { type: "number", min: 50, max: 1e5 },
  requestIntervalMs: { type: "number", min: 0, max: 1e4 },
  logLevel: { type: "string", values: ["off", "info", "debug"] },
  showStatusBar: { type: "boolean" }
};
function isSettingsKey(value) {
  return Object.prototype.hasOwnProperty.call(SPEC, value);
}
function coerceSetting(key, raw) {
  const spec = SPEC[key];
  if (spec.type === "boolean") return typeof raw === "boolean" ? raw : null;
  if (spec.type === "string") {
    return typeof raw === "string" && spec.values.includes(raw) ? raw : null;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (spec.values !== void 0) return spec.values.includes(raw) ? raw : null;
  const min = spec.min ?? Number.NEGATIVE_INFINITY;
  const max = spec.max ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(raw, min), max);
}
var AtomicFile = class {
  constructor(path, logger) {
    this.path = path;
    this.logger = logger;
  }
  path;
  logger;
  queue = Promise.resolve();
  async read() {
    try {
      return await readFile2(this.path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      this.logger.warn(`\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25\uFF1A${this.path}`, error);
      return null;
    }
  }
  async write(text) {
    const run = async () => {
      await mkdir3(dirname3(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile3(temporary, text, { encoding: "utf8", mode: 384 });
      await rename2(temporary, this.path);
    };
    const next = this.queue.then(run, run);
    this.queue = next.then(() => void 0, () => void 0);
    await next;
  }
};
var SettingsStore = class {
  constructor(logger = silentLogger) {
    this.logger = logger;
    this.file = new AtomicFile(SETTINGS_FILE, logger);
  }
  logger;
  state = { ...DEFAULT_SETTINGS };
  file;
  async load() {
    const raw = await this.file.read();
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          const value = parsed[key];
          const coerced = coerceSetting(key, value);
          if (coerced !== null) this.state[key] = coerced;
        }
      } catch (error) {
        this.logger.warn("\u8BBE\u7F6E\u6587\u4EF6\u635F\u574F\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C", error);
      }
    }
    return this.current;
  }
  get current() {
    return { ...this.state };
  }
  get(key) {
    return this.state[key];
  }
  async update(key, raw) {
    if (!isSettingsKey(key)) throw new Error(`\u672A\u77E5\u8BBE\u7F6E\u9879\uFF1A${key}`);
    const coerced = coerceSetting(key, raw);
    if (coerced === null) throw new Error(`\u8BBE\u7F6E\u503C\u4E0D\u5408\u6CD5\uFF1A${key}`);
    this.state[key] = coerced;
    await this.file.write(`${JSON.stringify(this.state, null, 2)}
`);
    this.logger.debug(`\u8BBE\u7F6E\u5DF2\u66F4\u65B0\uFF1A${key}`, coerced);
    return this.current;
  }
};
var LOGIN_COOKIE_NAMES = [
  "SESSDATA",
  "bili_jct",
  "DedeUserID",
  "DedeUserID__ckMd5",
  "sid"
];
var SessionStore = class {
  constructor(logger = silentLogger) {
    this.logger = logger;
    this.file = new AtomicFile(COOKIES_FILE, logger);
  }
  logger;
  cached = null;
  loaded = false;
  file;
  async load() {
    if (this.loaded) return this.cached;
    this.loaded = true;
    const raw = await this.file.read();
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.cookies !== "object") {
        throw new Error("\u51ED\u636E\u683C\u5F0F\u4E0D\u6B63\u786E");
      }
      this.cached = parsed;
      return parsed;
    } catch (error) {
      this.logger.error("\u8BFB\u53D6\u767B\u5F55\u51ED\u636E\u5931\u8D25\uFF0C\u5C06\u89C6\u4E3A\u672A\u767B\u5F55", error);
      this.cached = null;
      return null;
    }
  }
  get cookies() {
    return this.cached?.cookies ?? null;
  }
  get credentials() {
    return this.cached;
  }
  get isLoggedIn() {
    return isLoggedIn(this.cached?.cookies);
  }
  get hasDeviceId() {
    return (this.cached?.buvid3 ?? "") !== "";
  }
  get mid() {
    return getUserId(this.cached?.cookies);
  }
  async setCookies(cookies) {
    const previous = this.cached;
    await this.persist({
      cookies,
      savedAt: Date.now(),
      ...previous?.buvid3 === void 0 ? {} : { buvid3: previous.buvid3 },
      ...previous?.buvid4 === void 0 ? {} : { buvid4: previous.buvid4 }
    });
  }
  async mergeCookies(extra) {
    const previous = this.cached;
    await this.persist({
      cookies: mergeCookies(previous?.cookies, extra),
      savedAt: Date.now(),
      ...previous?.buvid3 === void 0 ? {} : { buvid3: previous.buvid3 },
      ...previous?.buvid4 === void 0 ? {} : { buvid4: previous.buvid4 }
    });
  }
  async setCookieHeader(header2) {
    await this.setCookies(parseCookieHeader(header2));
  }
  async setBuvid(buvid3, buvid4) {
    const previous = this.cached;
    await this.persist({
      cookies: mergeCookies(previous?.cookies, { buvid3, buvid4 }),
      savedAt: previous?.savedAt ?? Date.now(),
      buvid3,
      buvid4
    });
  }
  async clearLogin() {
    const previous = this.cached;
    if (previous === null) return;
    const remaining = {};
    for (const [name2, value] of Object.entries(previous.cookies)) {
      if (!LOGIN_COOKIE_NAMES.includes(name2)) remaining[name2] = value;
    }
    await this.persist({
      cookies: remaining,
      savedAt: Date.now(),
      ...previous.buvid3 === void 0 ? {} : { buvid3: previous.buvid3 },
      ...previous.buvid4 === void 0 ? {} : { buvid4: previous.buvid4 }
    });
  }
  cookieHeader() {
    return serializeCookie(this.cookies);
  }
  async persist(next) {
    this.cached = next;
    await this.file.write(`${JSON.stringify(next)}
`);
  }
};
var WbiStore = class {
  constructor(logger = silentLogger) {
    this.logger = logger;
    this.file = new AtomicFile(WBI_FILE, logger);
  }
  logger;
  value = null;
  file;
  async load() {
    const raw = await this.file.read();
    if (raw === null) return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.imgKey === "string" && typeof parsed.subKey === "string" && typeof parsed.fetchedAt === "number") {
        this.value = parsed;
      }
    } catch (error) {
      this.logger.warn("WBI \u7F13\u5B58\u635F\u574F\uFF0C\u5C06\u91CD\u65B0\u83B7\u53D6", error);
    }
  }
  read = () => this.value;
  write = (keys) => {
    this.value = keys;
    void this.file.write(`${JSON.stringify(keys)}
`).catch((error) => {
      this.logger.warn("\u5199\u5165 WBI \u7F13\u5B58\u5931\u8D25", error);
    });
  };
};
async function ensureDataDir() {
  await mkdir3(DATA_DIR, { recursive: true });
}

// src/host/host.ts
var PREFIX = "/dsh-music-player";
var MAX_BODY_BYTES = 512 * 1024;
function normalizeImageUrl(value) {
  if (value === void 0 || value === "") return "";
  return value.startsWith("//") ? `https:${value}` : value;
}
function extractBvid(text) {
  const match = /[Bb][Vv]([0-9A-Za-z]{10})/.exec(text);
  return match === null ? null : `BV${match[1]}`;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
}
function asStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}
function sendError(res, error) {
  const normalized = toBilibiliError(error);
  const status = normalized.kind === "not-logged-in" ? 401 : normalized.kind === "aborted" ? 499 : 400;
  sendJson(res, status, {
    ok: false,
    error: normalized.userMessage,
    message: normalized.message,
    kind: normalized.kind
  });
}
async function readJson(req) {
  const contentType = String(req.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new BilibiliError("api", "\u8BF7\u6C42\u5FC5\u987B\u4F7F\u7528 application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer2 = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer2.byteLength;
    if (size > MAX_BODY_BYTES) throw new BilibiliError("api", "\u8BF7\u6C42\u4F53\u8FC7\u5927");
    chunks.push(buffer2);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch (error) {
    throw new BilibiliError("api", "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON", { cause: error });
  }
}
var MusicHost = class {
  constructor(version2) {
    this.version = version2;
    this.ready = this.initialize();
  }
  version;
  ready;
  logger = new MemoryLogger("dsh-music-player");
  settings = new SettingsStore(this.logger);
  session = new SessionStore(this.logger);
  wbiStore = new WbiStore(this.logger);
  client;
  api;
  pipeline;
  media;
  qr;
  user = null;
  userLoaded = false;
  userPromise = null;
  playAbort = null;
  initError = null;
  registered = false;
  disposed = false;
  disposers = [];
  async initialize() {
    try {
      await ensureDataDir();
      await this.settings.load();
      this.logger.setLevel(this.settings.get("logLevel"));
      await this.session.load();
      await this.wbiStore.load();
      this.client = new BilibiliClient({
        readCookies: () => this.session.cookies,
        logger: this.logger,
        minIntervalMs: () => this.settings.get("requestIntervalMs"),
        getRetries: 1
      });
      const wbi = new WbiKeyStore({
        load: async () => {
          const nav = await this.api.getNav();
          return { imgUrl: nav.wbi_img.img_url, subUrl: nav.wbi_img.sub_url };
        },
        read: this.wbiStore.read,
        write: this.wbiStore.write,
        logger: this.logger
      });
      this.api = new BilibiliApi(this.client, wbi, this.logger);
      this.pipeline = new AudioPipeline({
        api: this.api,
        client: this.client,
        logger: this.logger,
        cacheDir: CACHE_WAV_DIR,
        cacheEnabled: () => this.settings.get("cacheEnabled"),
        getCacheMaxBytes: () => Math.max(50, this.settings.get("cacheMaxMB")) * 1024 * 1024
      });
      this.media = new MediaService({
        api: this.api,
        client: this.client,
        pipeline: this.pipeline,
        logger: this.logger,
        cacheEnabled: () => this.settings.get("cacheEnabled"),
        cacheMaxBytes: () => Math.max(50, this.settings.get("cacheMaxMB")) * 1024 * 1024
      });
      this.qr = new QrSessionManager(this.client, this.logger, async (cookies) => {
        await this.session.setCookies(cookies);
        await this.refreshUser(true);
      });
      this.logger.info(`\u5BBF\u4E3B\u5DF2\u5C31\u7EEA\uFF08v${this.version}\uFF0CDSH_HOME=${process.env.DSH_HOME ?? "default"}\uFF09`);
      void this.bootstrapAccount();
    } catch (error) {
      this.initError = toBilibiliError(error, "\u97F3\u4E50\u64AD\u653E\u5668\u521D\u59CB\u5316\u5931\u8D25");
      this.logger.error("\u521D\u59CB\u5316\u5931\u8D25", this.initError.message);
    }
  }
  /** Register the prefix route on the DSH Web server. */
  register(webServer) {
    if (this.registered) return () => void 0;
    this.registered = true;
    this.disposers.push(
      webServer.register({
        kind: "prefix",
        path: PREFIX,
        handler: (req, res) => {
          void this.handle(req, res);
        }
      })
    );
    return () => this.dispose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.playAbort?.abort();
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {
      }
    }
    this.logger.info("\u5BBF\u4E3B\u5DF2\u5378\u8F7D");
  }
  async bootstrapAccount() {
    try {
      if (!this.session.hasDeviceId) {
        const buvid = await this.api.fetchBuvid();
        if (buvid !== null) await this.session.setBuvid(buvid.b_3, buvid.b_4);
      }
    } catch (error) {
      this.logger.warn("\u83B7\u53D6\u8BBE\u5907\u6307\u7EB9\u5931\u8D25\uFF08\u4E0D\u5F71\u54CD\u64AD\u653E\uFF09", toBilibiliError(error).message);
    }
    await this.refreshUser(true);
  }
  async refreshUser(force = false) {
    if (this.disposed) return;
    if (!force && this.userLoaded) return;
    if (this.userPromise !== null) return this.userPromise;
    this.userPromise = (async () => {
      if (!this.session.isLoggedIn) {
        this.user = null;
        this.userLoaded = true;
        return;
      }
      try {
        const info = await this.api.getUserInfo();
        this.user = { mid: info.mid, name: info.name, face: normalizeImageUrl(info.face) };
        this.userLoaded = true;
        this.logger.info(`\u5DF2\u767B\u5F55\uFF1A${info.name}\uFF08${info.mid}\uFF09`);
      } catch (error) {
        const normalized = toBilibiliError(error);
        if (normalized.kind === "not-logged-in") {
          await this.session.clearLogin();
          this.user = null;
          this.userLoaded = true;
          this.logger.warn("\u767B\u5F55\u51ED\u636E\u5DF2\u5931\u6548\uFF0C\u5DF2\u6E05\u9664\u767B\u5F55\u6001");
        } else {
          this.userLoaded = false;
          this.logger.warn("\u83B7\u53D6\u7528\u6237\u4FE1\u606F\u5931\u8D25\uFF08\u7A0D\u540E\u91CD\u8BD5\uFF09", normalized.message);
        }
      }
    })();
    try {
      await this.userPromise;
    } finally {
      this.userPromise = null;
    }
  }
  requireMid() {
    if (!this.session.isLoggedIn) {
      throw new BilibiliError("not-logged-in", "\u6536\u85CF\u5939\u9700\u8981\u5148\u626B\u7801\u767B\u5F55");
    }
    const mid = this.user?.mid ?? this.session.mid;
    if (mid === null) throw new BilibiliError("not-logged-in", "\u767B\u5F55\u51ED\u636E\u7F3A\u5C11\u7528\u6237 id\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
    return mid;
  }
  async accountView() {
    if (!this.userLoaded) await this.refreshUser();
    return { loggedIn: this.session.isLoggedIn, user: this.user };
  }
  async handle(req, res) {
    try {
      await this.ready;
      if (this.initError !== null) {
        sendJson(res, 503, { ok: false, error: this.initError.userMessage, kind: this.initError.kind });
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      const sub = url.pathname.slice(PREFIX.length);
      const method = req.method ?? "GET";
      const origin = req.headers.origin;
      const allowOrigin = origin === void 0 || origin === "null" ? "*" : origin;
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (sub.startsWith("/media/")) {
        if (method !== "GET" && method !== "HEAD") {
          res.writeHead(405).end();
          return;
        }
        await this.media.handleMedia(req, res, sub.slice("/media/".length));
        return;
      }
      if (sub === "/image") {
        if (method !== "GET") {
          res.writeHead(405).end();
          return;
        }
        await this.media.proxyImage(url.searchParams.get("url") ?? "", res);
        return;
      }
      if (!sub.startsWith("/api")) {
        sendJson(res, 404, { ok: false, error: "not found" });
        return;
      }
      const path = sub.replace(/\/+$/, "");
      if (method === "GET" && path === "/api/health") {
        sendJson(res, 200, { ok: true, version: this.version, ready: true });
        return;
      }
      if (method === "GET" && path === "/api/status") {
        const account = await this.accountView();
        const cache = await this.media.cacheStats();
        sendJson(res, 200, {
          ok: true,
          data: {
            version: this.version,
            loggedIn: account.loggedIn,
            user: account.user,
            settings: this.settings.current,
            cache,
            logLevel: this.logger.getLevel()
          }
        });
        return;
      }
      if (method === "GET" && path === "/api/search") {
        const keyword = (url.searchParams.get("keyword") ?? "").trim();
        const page2 = Math.max(1, Math.trunc(asNumber(url.searchParams.get("page") ?? void 0) ?? 1));
        if (keyword === "") throw new BilibiliError("api", "\u8BF7\u8F93\u5165\u641C\u7D22\u5173\u952E\u8BCD");
        const bvid = extractBvid(keyword);
        if (bvid !== null) {
          try {
            const info = await this.api.getVideoInfo(bvid);
            sendJson(res, 200, {
              ok: true,
              data: {
                keyword,
                page: 1,
                numPages: 1,
                items: [{
                  bvid: info.bvid,
                  title: info.title,
                  author: info.author,
                  cover: normalizeImageUrl(info.cover),
                  durationSeconds: info.pages.length > 0 && Number.isFinite(info.pages[0]?.duration) ? info.pages[0].duration : info.durationSeconds,
                  pageCount: info.pageCount,
                  direct: true
                }]
              }
            });
            return;
          } catch (error) {
            this.logger.debug("BV \u76F4\u94FE\u89E3\u6790\u5931\u8D25\uFF0C\u9000\u56DE\u641C\u7D22", toBilibiliError(error).message);
          }
        }
        const result = await this.api.searchVideos({ keyword, page: page2 });
        sendJson(res, 200, {
          ok: true,
          data: {
            keyword,
            page: page2,
            numPages: result.numPages,
            items: result.items.map((item) => ({
              bvid: item.bvid ?? "",
              title: stripHtmlTags(item.title),
              author: item.author ?? "",
              cover: normalizeImageUrl(item.pic),
              durationSeconds: parseDurationText(item.duration) ?? 0,
              pageCount: 0,
              views: item.play ?? 0
            }))
          }
        });
        return;
      }
      if (method === "POST" && path === "/api/play") {
        const body = await readJson(req);
        const bvid = asString(body.bvid);
        if (!isBvid(bvid)) throw new BilibiliError("api", "\u65E0\u6548\u7684 BV \u53F7");
        const cid = asNumber(body.cid);
        const quality = asNumber(body.quality) ?? this.settings.get("audioQuality");
        const format2 = body.format === "wav" ? "wav" : "raw";
        const controller = new AbortController();
        this.playAbort?.abort();
        this.playAbort = controller;
        res.on("close", () => {
          if (!res.writableEnded) controller.abort();
        });
        try {
          const result = await this.media.play({
            bvid,
            ...cid === void 0 ? {} : { cid },
            quality,
            format: format2,
            signal: controller.signal,
            ...body.track === void 0 ? {} : { track: body.track }
          });
          sendJson(res, 200, { ok: true, data: result });
        } finally {
          if (this.playAbort === controller) this.playAbort = null;
        }
        return;
      }
      if (method === "GET" && path === "/api/auth/qr") {
        const started = await this.qr.start();
        sendJson(res, 200, { ok: true, data: started });
        return;
      }
      if (method === "GET" && path === "/api/auth/poll") {
        const id = url.searchParams.get("id") ?? "";
        const status = await this.qr.poll(id);
        const account = await this.accountView();
        sendJson(res, 200, {
          ok: true,
          data: { ...status, loggedIn: account.loggedIn, user: account.user }
        });
        return;
      }
      if (method === "POST" && path === "/api/auth/logout") {
        await this.session.clearLogin();
        this.user = null;
        this.userLoaded = true;
        sendJson(res, 200, { ok: true, data: { loggedIn: false, user: null } });
        return;
      }
      if (method === "GET" && path === "/api/favorites") {
        const mid = this.requireMid();
        const folders = await this.api.getFavoriteFolders({ mid });
        sendJson(res, 200, { ok: true, data: { items: folders.map(folderView) } });
        return;
      }
      if (method === "GET" && path === "/api/favorites/contents") {
        this.requireMid();
        const mediaId = asNumber(url.searchParams.get("mediaId") ?? void 0);
        if (mediaId === void 0) throw new BilibiliError("api", "\u7F3A\u5C11\u6536\u85CF\u5939 id");
        const page2 = Math.max(1, Math.trunc(asNumber(url.searchParams.get("page") ?? void 0) ?? 1));
        const keyword = (url.searchParams.get("keyword") ?? "").trim();
        const raw = await this.api.getFavoriteContents({
          mediaId,
          page: page2,
          ...keyword === "" ? {} : { keyword, scope: "this" }
        });
        const view = toFavoriteContentsView(raw);
        sendJson(res, 200, {
          ok: true,
          data: {
            mediaId,
            page: page2,
            title: view.title,
            total: view.total,
            hasMore: view.hasMore,
            items: view.entries.map(favoriteTrack)
          }
        });
        return;
      }
      if (method === "GET" && path === "/api/favorites/membership") {
        const mid = this.requireMid();
        const bvid = url.searchParams.get("bvid") ?? "";
        if (!isBvid(bvid)) throw new BilibiliError("api", "\u65E0\u6548\u7684 BV \u53F7");
        const folders = await this.api.getFavoriteFolders({ mid, bvid });
        sendJson(res, 200, {
          ok: true,
          data: {
            bvid,
            folders: folders.map((folder) => ({
              id: folder.id,
              title: folder.title,
              selected: folder.fav_state === 1
            }))
          }
        });
        return;
      }
      if (method === "POST" && path === "/api/favorites/create") {
        this.requireMid();
        const body = await readJson(req);
        const title = asString(body.title).trim();
        if (title === "") throw new BilibiliError("api", "\u6536\u85CF\u5939\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
        const privacy = body.privacy === 1 ? 1 : 0;
        const created = await this.api.createFavoriteFolder({ title, privacy });
        sendJson(res, 200, { ok: true, data: created });
        return;
      }
      if (method === "POST" && path === "/api/favorites/delete") {
        this.requireMid();
        const body = await readJson(req);
        const mediaId = asNumber(body.mediaId);
        if (mediaId === void 0) throw new BilibiliError("api", "\u7F3A\u5C11\u6536\u85CF\u5939 id");
        await this.api.deleteFavoriteFolders([mediaId]);
        sendJson(res, 200, { ok: true, data: { mediaId } });
        return;
      }
      if (method === "POST" && path === "/api/favorites/remove") {
        this.requireMid();
        const body = await readJson(req);
        const mediaId = asNumber(body.mediaId);
        const bvids = asStringArray(body.bvids);
        if (mediaId === void 0) throw new BilibiliError("api", "\u7F3A\u5C11\u6536\u85CF\u5939 id");
        await this.api.removeFavoriteResources({ mediaId, bvids });
        sendJson(res, 200, { ok: true, data: { mediaId, removed: bvids.length } });
        return;
      }
      if (method === "POST" && path === "/api/favorites/deal") {
        this.requireMid();
        const body = await readJson(req);
        const bvid = asString(body.bvid);
        if (!isBvid(bvid)) throw new BilibiliError("api", "\u65E0\u6548\u7684 BV \u53F7");
        const result = await this.api.dealFavoriteForOneVideo({
          bvid,
          addToFavoriteIds: asStringArray(body.addIds),
          delInFavoriteIds: asStringArray(body.delIds)
        });
        sendJson(res, 200, { ok: true, data: result });
        return;
      }
      if (method === "GET" && path === "/api/settings") {
        const cache = await this.media.cacheStats();
        sendJson(res, 200, { ok: true, data: { settings: this.settings.current, cache } });
        return;
      }
      if (method === "POST" && path === "/api/settings") {
        const body = await readJson(req);
        const key = asString(body.key);
        const settings = await this.settings.update(key, body.value);
        this.logger.setLevel(settings.logLevel);
        if (key === "cacheMaxMB") void this.media.enforceCacheLimit();
        const cache = await this.media.cacheStats();
        sendJson(res, 200, { ok: true, data: { settings, cache } });
        return;
      }
      if (method === "GET" && path === "/api/cache") {
        sendJson(res, 200, { ok: true, data: await this.media.cacheStats() });
        return;
      }
      if (method === "POST" && path === "/api/cache/clear") {
        await this.media.clearCache();
        sendJson(res, 200, { ok: true, data: await this.media.cacheStats() });
        return;
      }
      if (method === "GET" && path === "/api/logs") {
        const limit = Math.min(400, Math.max(1, Math.trunc(asNumber(url.searchParams.get("limit") ?? void 0) ?? 200)));
        sendJson(res, 200, {
          ok: true,
          data: { level: this.logger.getLevel(), lines: this.logger.recent(limit) }
        });
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (error) {
      this.logger.warn(
        "\u8DEF\u7531\u5904\u7406\u5931\u8D25",
        error instanceof Error ? `${toBilibiliError(error).message}
${error.stack ?? ""}` : String(error)
      );
      if (!res.headersSent) {
        sendError(res, error);
      } else {
        res.destroy();
      }
    }
  }
};
function folderView(folder) {
  return {
    id: folder.id,
    title: folder.title,
    count: Number.isFinite(folder.media_count) ? folder.media_count : 0
  };
}
function favoriteTrack(entry) {
  return {
    bvid: entry.bvid,
    title: entry.title,
    author: entry.upperName,
    cover: normalizeImageUrl(entry.cover),
    durationSeconds: entry.durationSeconds,
    pageCount: entry.pageCount,
    ...entry.invalid ? { invalid: true } : {}
  };
}

// src/host/index.ts
var VERSION = "0.1.0";
var name = "dsh-music-player";
function apply(ctx) {
  const host = new MusicHost(VERSION ?? "0.1.0");
  ctx.effect(() => () => host.dispose(), "dsh-music-player: dispose");
  ctx.inject(["webServer"], (child) => {
    child.effect(() => host.register(child.webServer), "dsh-music-player: routes");
  });
}
export {
  apply,
  name
};
