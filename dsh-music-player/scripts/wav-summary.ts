export function printWavSummary(wav: Buffer): void {
  const riff = wav.toString('ascii', 0, 4)
  const wave = wav.toString('ascii', 8, 12)
  const sampleRate = wav.readUInt32LE(24)
  const channels = wav.readUInt16LE(22)
  const bits = wav.readUInt16LE(34)
  const dataBytes = wav.readUInt32LE(40)
  const seconds = dataBytes / (sampleRate * channels * (bits / 8))
  console.log('wav', {
    riff,
    wave,
    sampleRate,
    channels,
    bits,
    dataBytes,
    declaredLength: wav.readUInt32LE(4),
    actualLength: wav.byteLength,
    seconds: Number(seconds.toFixed(3)),
  })
}
