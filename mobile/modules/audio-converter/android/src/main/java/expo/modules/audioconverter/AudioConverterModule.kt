package expo.modules.audioconverter

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor
import kotlin.math.roundToInt

class AudioConverterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioConverter")

    AsyncFunction("prepareAudioAsync") { inputUri: String, outputUri: String ->
      val input = fileFromUri(inputUri)
      if (!input.isFile || !input.canRead()) {
        throw IllegalArgumentException("The selected audio file cannot be read.")
      }
      ensureDurationWithinLimit(input.absolutePath)
      if (isCompatibleWav(input)) {
        return@AsyncFunction mapOf("uri" to inputUri, "temporary" to false)
      }

      val output = fileFromUri(outputUri)
      output.parentFile?.mkdirs()
      try {
        convertToSpeechWav(input.absolutePath, output)
      } catch (error: Throwable) {
        output.delete()
        throw error
      }
      mapOf("uri" to Uri.fromFile(output).toString(), "temporary" to true)
    }
  }

  private fun fileFromUri(value: String): File {
    val uri = Uri.parse(value)
    return if (uri.scheme == null || uri.scheme == "file") File(uri.path ?: value) else File(value)
  }

  private fun isCompatibleWav(file: File): Boolean {
    if (file.length() < 44) return false
    return try {
      RandomAccessFile(file, "r").use { wav ->
        if (readAscii(wav, 4) != "RIFF") return false
        wav.skipBytes(4)
        if (readAscii(wav, 4) != "WAVE") return false
        var format = -1
        var channels = -1
        var sampleRate = -1
        var bits = -1
        var dataSize = -1L
        while (wav.filePointer + 8 <= wav.length()) {
          val id = readAscii(wav, 4)
          val size = readLittleInt(wav).toLong() and 0xffffffffL
          val next = wav.filePointer + size + (size and 1L)
          if (next > wav.length()) return false
          if (id == "fmt " && size >= 16) {
            format = readLittleShort(wav)
            channels = readLittleShort(wav)
            sampleRate = readLittleInt(wav)
            wav.skipBytes(6)
            bits = readLittleShort(wav)
          }
          if (id == "data") dataSize = size
          wav.seek(next)
        }
        val compatible = format == 1 && channels == 1 &&
          sampleRate == TARGET_SAMPLE_RATE && bits == 16
        if (compatible && dataSize > MAX_OUTPUT_SAMPLES * 2) {
          throw AudioDurationLimitException()
        }
        compatible
      }
    } catch (error: AudioDurationLimitException) {
      throw error
    } catch (_: Throwable) {
      false
    }
  }

  private fun ensureDurationWithinLimit(inputPath: String) {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(inputPath)
      val audioFormat = (0 until extractor.trackCount)
        .map { extractor.getTrackFormat(it) }
        .firstOrNull {
          it.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
        } ?: throw IllegalArgumentException(
          "No readable audio track was found in this file.",
        )
      if (audioFormat.containsKey(MediaFormat.KEY_DURATION)) {
        val durationUs = audioFormat.getLong(MediaFormat.KEY_DURATION)
        if (durationUs > MAX_DURATION_US) throw AudioDurationLimitException()
      }
    } finally {
      extractor.release()
    }
  }

  private fun convertToSpeechWav(inputPath: String, output: File) {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    val writer = WavWriter(output, TARGET_SAMPLE_RATE)
    try {
      extractor.setDataSource(inputPath)
      val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
        extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: throw IllegalArgumentException("No readable audio track was found in this file.")
      extractor.selectTrack(trackIndex)
      val inputFormat = extractor.getTrackFormat(trackIndex)
      val mime = inputFormat.getString(MediaFormat.KEY_MIME)
        ?: throw IllegalArgumentException("The audio format could not be identified.")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        inputFormat.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
      }
      codec = MediaCodec.createDecoderByType(mime)
      codec.configure(inputFormat, null, null, 0)
      codec.start()

      val info = MediaCodec.BufferInfo()
      var inputEnded = false
      var outputEnded = false
      var sampleRate = inputFormat.intOrDefault(MediaFormat.KEY_SAMPLE_RATE, TARGET_SAMPLE_RATE)
      var channels = inputFormat.intOrDefault(MediaFormat.KEY_CHANNEL_COUNT, 1)
      var pcmEncoding = AudioFormat.ENCODING_PCM_16BIT
      var sourceFrame = 0L
      var nextOutputPosition = 0.0
      var previousSample = 0f

      while (!outputEnded) {
        if (!inputEnded) {
          val inputIndex = codec.dequeueInputBuffer(TIMEOUT_US)
          if (inputIndex >= 0) {
            val buffer = codec.getInputBuffer(inputIndex)
              ?: throw IllegalStateException("Audio decoder input buffer is unavailable.")
            val size = extractor.readSampleData(buffer, 0)
            if (size < 0) {
              codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputEnded = true
            } else {
              codec.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        when (val outputIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val format = codec.outputFormat
            sampleRate = format.intOrDefault(MediaFormat.KEY_SAMPLE_RATE, sampleRate)
            channels = format.intOrDefault(MediaFormat.KEY_CHANNEL_COUNT, channels)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
              pcmEncoding = format.intOrDefault(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            }
          }
          MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
          else -> if (outputIndex >= 0) {
            val buffer = codec.getOutputBuffer(outputIndex)
            if (buffer != null && info.size > 0) {
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              val mono = decodeMono(buffer.slice().order(ByteOrder.LITTLE_ENDIAN), channels, pcmEncoding)
              if (mono.isNotEmpty()) {
                val chunkStart = sourceFrame
                val chunkEnd = chunkStart + mono.size
                val step = sampleRate.toDouble() / TARGET_SAMPLE_RATE
                while (nextOutputPosition < chunkEnd - 1) {
                  val leftIndex = floor(nextOutputPosition).toLong()
                  val fraction = (nextOutputPosition - leftIndex).toFloat()
                  val left = if (leftIndex < chunkStart) previousSample else mono[(leftIndex - chunkStart).toInt()]
                  val rightIndex = (leftIndex + 1 - chunkStart).toInt()
                  val right = mono[rightIndex.coerceIn(0, mono.lastIndex)]
                  writer.writeSample(left + (right - left) * fraction)
                  nextOutputPosition += step
                }
                sourceFrame = chunkEnd
                previousSample = mono.last()
              }
            }
            outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            codec.releaseOutputBuffer(outputIndex, false)
          }
        }
      }
      if (writer.sampleCount == 0L) throw IllegalArgumentException("The selected file contains no decodable audio.")
    } finally {
      try { codec?.stop() } catch (_: Throwable) {}
      codec?.release()
      extractor.release()
      writer.close()
    }
  }

  private fun decodeMono(buffer: ByteBuffer, channels: Int, encoding: Int): FloatArray {
    val bytesPerSample = when (encoding) {
      AudioFormat.ENCODING_PCM_FLOAT -> 4
      AudioFormat.ENCODING_PCM_8BIT -> 1
      else -> 2
    }
    val safeChannels = channels.coerceAtLeast(1)
    val frameCount = buffer.remaining() / (bytesPerSample * safeChannels)
    return FloatArray(frameCount) {
      var sum = 0f
      repeat(safeChannels) {
        sum += when (encoding) {
          AudioFormat.ENCODING_PCM_FLOAT -> buffer.float.coerceIn(-1f, 1f)
          AudioFormat.ENCODING_PCM_8BIT -> ((buffer.get().toInt() and 0xff) - 128) / 128f
          else -> buffer.short / 32768f
        }
      }
      sum / safeChannels
    }
  }

  private fun MediaFormat.intOrDefault(key: String, fallback: Int): Int =
    if (containsKey(key)) getInteger(key) else fallback

  private fun readAscii(file: RandomAccessFile, count: Int): String {
    val bytes = ByteArray(count)
    file.readFully(bytes)
    return bytes.toString(Charsets.US_ASCII)
  }

  private fun readLittleShort(file: RandomAccessFile): Int = java.lang.Short.reverseBytes(file.readShort()).toInt() and 0xffff
  private fun readLittleInt(file: RandomAccessFile): Int = Integer.reverseBytes(file.readInt())

  private class WavWriter(file: File, private val sampleRate: Int) : AutoCloseable {
    private val output = RandomAccessFile(file, "rw")
    var sampleCount = 0L
      private set

    init {
      output.setLength(0)
      output.write(ByteArray(44))
    }

    fun writeSample(sample: Float) {
      if (sampleCount >= MAX_OUTPUT_SAMPLES) {
        throw AudioDurationLimitException()
      }
      val value = (sample.coerceIn(-1f, 1f) * 32767f).roundToInt().toShort()
      output.write(value.toInt() and 0xff)
      output.write(value.toInt().ushr(8) and 0xff)
      sampleCount++
    }

    override fun close() {
      val dataSize = sampleCount * 2
      output.seek(0)
      output.writeBytes("RIFF")
      writeLittleInt(36 + dataSize)
      output.writeBytes("WAVEfmt ")
      writeLittleInt(16)
      writeLittleShort(1)
      writeLittleShort(1)
      writeLittleInt(sampleRate.toLong())
      writeLittleInt((sampleRate * 2).toLong())
      writeLittleShort(2)
      writeLittleShort(16)
      output.writeBytes("data")
      writeLittleInt(dataSize)
      output.close()
    }

    private fun writeLittleShort(value: Int) {
      output.write(value and 0xff)
      output.write(value.ushr(8) and 0xff)
    }

    private fun writeLittleInt(value: Long) {
      repeat(4) { shift -> output.write((value ushr (shift * 8)).toInt() and 0xff) }
    }
  }

  companion object {
    private const val TARGET_SAMPLE_RATE = 16_000
    private const val TIMEOUT_US = 10_000L
    private const val MAX_DURATION_SECONDS = 2L * 60L * 60L
    private const val MAX_DURATION_US = MAX_DURATION_SECONDS * 1_000_000L
    private const val MAX_OUTPUT_SAMPLES = MAX_DURATION_SECONDS * TARGET_SAMPLE_RATE
  }

  private class AudioDurationLimitException :
    IllegalArgumentException("Audio files must be no longer than two hours.")
}
