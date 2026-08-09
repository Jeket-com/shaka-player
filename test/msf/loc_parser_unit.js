/**
 * Regression tests for the LOC reference timeline (JSS#687).
 *
 * A LOC reference is assembled from two clocks: startTime from the publisher's
 * wall-clock Timestamp extension, duration from a constant derived from the
 * catalog. On a live 48 kHz AAC stream that produced 90 references with ZERO
 * contiguous joins — 69 overlaps and 20 holes of ~9 ms — and StreamingEngine
 * spun at 77 updates/s appending 13.5/s, because SegmentIndex.find() returns
 * null for an instant inside a hole.
 */
describe('shaka.msf.LOCParser timeline', () => {
  /** AAC at 48 kHz: 1024 samples per frame. */
  const FRAME = 1024 / 48000;

  /**
   * Encodes a QUIC variable-length integer (RFC 9000 §16).
   * @param {bigint} value
   * @return {!Uint8Array}
   */
  function varint(value) {
    if (value < BigInt(64)) {
      return new Uint8Array([Number(value)]);
    }
    if (value < BigInt(16384)) {
      const v = Number(value);
      return new Uint8Array([0x40 | (v >> 8), v & 0xff]);
    }
    if (value < BigInt(1073741824)) {
      const v = Number(value);
      return new Uint8Array([
        0x80 | (v >>> 24), (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff,
      ]);
    }
    const bytes = new Uint8Array(8);
    let v = value;
    for (let i = 7; i >= 0; i--) {
      bytes[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    bytes[0] |= 0xc0;
    return bytes;
  }

  /**
   * Builds an extensions block carrying only a Timestamp (type 0x06).
   * Types are delta encoded and the first is absolute, so the delta is 6.
   * @param {bigint} timestampUs
   * @return {!Uint8Array}
   */
  function extensionsWithTimestamp(timestampUs) {
    const type = varint(BigInt(0x06));
    const value = varint(timestampUs);
    const out = new Uint8Array(type.byteLength + value.byteLength);
    out.set(type, 0);
    out.set(value, type.byteLength);
    return out;
  }

  /**
   * @param {number} timestampUs
   * @return {!shaka.msf.Utils.MOQObject}
   */
  function objectAt(timestampUs) {
    return /** @type {!shaka.msf.Utils.MOQObject} */ ({
      trackAlias: BigInt(1),
      location: {group: BigInt(0), object: BigInt(0), subgroup: BigInt(0)},
      // A single zero byte: no private properties, empty payload.
      data: new Uint8Array([0]),
      extensions: extensionsWithTimestamp(BigInt(Math.round(timestampUs))),
      status: null,
      payloadReadStartMs: 0,
      receiveTimestampMs: 0,
    });
  }

  it('produces a contiguous timeline from a jittery publish clock', () => {
    const parser = new shaka.msf.LOCParser(FRAME, 'audio');

    // The live stream's timestamps stepped ~20.3-20.5 ms against a 21.33 ms
    // frame — consistently short, with jitter on top.
    const steps = [20400, 20300, 20500, 20200, 20400, 20500, 20300, 20400];
    let ts = 1786303097000000;
    const refs = [];
    for (const step of steps) {
      refs.push(parser.parse(objectAt(ts)));
      ts += step;
    }

    for (let i = 1; i < refs.length; i++) {
      const prevEnd = refs[i - 1].startTime + refs[i - 1].duration;
      expect(refs[i].startTime).toBeCloseTo(prevEnd, 9);
    }
  });

  it('leaves no holes for SegmentIndex.find() to miss', () => {
    const parser = new shaka.msf.LOCParser(FRAME, 'audio');
    let ts = 1786303097000000;
    const refs = [];
    for (let i = 0; i < 50; i++) {
      refs.push(parser.parse(objectAt(ts)));
      // A step SHORTER than the frame opens a hole every few frames once the
      // accumulated error exceeds a frame; this is the live failure mode.
      ts += 20400;
    }

    let holes = 0;
    for (let i = 1; i < refs.length; i++) {
      const prevEnd = refs[i - 1].startTime + refs[i - 1].duration;
      if (refs[i].startTime - prevEnd > 1e-9) {
        holes++;
      }
    }
    expect(holes).toBe(0);
  });

  it('absorbs jitter larger than half a frame', () => {
    // The residue left by a half-frame tolerance on the live stream: holes of
    // 0.51-0.77 of a frame. These must be closed, not preserved.
    const parser = new shaka.msf.LOCParser(FRAME, 'audio');
    const base = 1786303097000000;
    const refs = [parser.parse(objectAt(base))];
    const jitterUs = [30500, 20400, 30800, 20300, 30500, 20400];
    let ts = base;
    for (const step of jitterUs) {
      ts += step;
      refs.push(parser.parse(objectAt(ts)));
    }
    for (let i = 1; i < refs.length; i++) {
      const prevEnd = refs[i - 1].startTime + refs[i - 1].duration;
      expect(refs[i].startTime).toBeCloseTo(prevEnd, 9);
    }
  });

  it('resyncs on a real discontinuity instead of snapping', () => {
    const parser = new shaka.msf.LOCParser(FRAME, 'audio');
    const first = parser.parse(objectAt(1786303097000000));

    // Beyond half a frame, the publisher's clock stays authoritative.
    const jumpedUs = 1786303097000000 + 5000000;
    const after = parser.parse(objectAt(jumpedUs));

    expect(after.startTime).toBeCloseTo(jumpedUs / 1e6, 6);
    expect(after.startTime).toBeGreaterThan(first.startTime + 1);
  });

  it('stops snapping beyond the tolerance', () => {
    const parser = new shaka.msf.LOCParser(FRAME, 'audio');
    const base = 1786303097000000;
    parser.parse(objectAt(base));

    // Past SNAP_TOLERANCE_FRAMES from the expected end: the publisher's clock
    // stays authoritative and the gap is preserved.
    const tolUs = FRAME * 1e6 * shaka.msf.LOCParser.SNAP_TOLERANCE_FRAMES;
    const farUs = base + (FRAME * 1e6) + tolUs + 1000;
    const far = parser.parse(objectAt(farUs));
    expect(far.startTime).toBeCloseTo(farUs / 1e6, 6);
  });
});
