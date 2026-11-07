/** Restrict only the iOS instance; desktop models retain their existing memory. */
export const mobileWasmBytes = 32 * 1024 * 1024;
export function boundedWasm(
  input: Uint8Array,
  maximumBytes = mobileWasmBytes,
): ArrayBuffer {
  const maximum = Math.floor(maximumBytes / 65536);
  const read = (offset: number): [number, number] => {
    let value = 0;
    for (let shift = 0; shift < 35 && offset < input.length; shift += 7) {
      const byte = input[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return [value, offset];
    }
    throw Error("Invalid WASM integer");
  };
  const encode = (value: number) => {
    const bytes: number[] = [];
    do {
      const byte = value & 127;
      value = Math.floor(value / 128);
      bytes.push(byte | (value ? 128 : 0));
    } while (value);
    return bytes;
  };
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximum < 1 ||
    maximum > 65536 ||
    input.length < 8 ||
    input[0] !== 0 ||
    input[1] !== 97 ||
    input[2] !== 115 ||
    input[3] !== 109
  )
    throw Error("Invalid WASM memory limit");
  for (let offset = 8; offset < input.length;) {
    const section = offset,
      id = input[offset++];
    const [length, start] = read(offset),
      end = start + length;
    if (end > input.length) throw Error("Invalid WASM section");
    if (id === 5) {
      const [count, at] = read(start),
        [flags, minimumAt] = read(at),
        [minimum, maximumAt] = read(minimumAt);
      if (count !== 1 || flags > 1 || minimum > maximum)
        throw Error("Unsupported WASM memory");
      const limit =
        flags === 1 ? Math.min(read(maximumAt)[0], maximum) : maximum;
      if (minimum > limit) throw Error("Invalid WASM memory range");
      const replacement = [1, 1, ...encode(minimum), ...encode(limit)];
      const header = [5, ...encode(replacement.length), ...replacement];
      const output = new Uint8Array(
        section + header.length + input.length - end,
      );
      output.set(input.subarray(0, section));
      output.set(header, section);
      output.set(input.subarray(end), section + header.length);
      return output.buffer;
    }
    offset = end;
  }
  throw Error("WASM memory section missing");
}
