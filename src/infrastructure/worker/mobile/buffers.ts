/** Release an exclusively owned, non-WASM buffer once its contents are consumed.
 * Older WebKit versions retain the normal garbage-collected fallback.
 */
export function releaseBuffer(view: ArrayBufferView | ArrayBuffer) {
  const buffer = view instanceof ArrayBuffer ? view : view.buffer;
  if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength) return;
  const transferable = buffer as ArrayBuffer & {
    transfer?: (length: number) => ArrayBuffer;
  };
  transferable.transfer?.(0);
}
