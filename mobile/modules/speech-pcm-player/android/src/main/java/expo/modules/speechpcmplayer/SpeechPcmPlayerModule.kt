package expo.modules.speechpcmplayer

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SpeechPcmPlayerModule : Module() {
  private val lock = Any()
  @Volatile private var sessionId: String? = null
  @Volatile private var track: AudioTrack? = null

  override fun definition() = ModuleDefinition {
    Name("SpeechPcmPlayer")

    AsyncFunction("start") { nextSessionId: String, sampleRate: Double, channels: Int ->
      require(sampleRate > 0 && channels == 1) { "PCM playback supports mono audio only" }
      start(nextSessionId, sampleRate.toInt())
    }

    AsyncFunction("write") { expectedSessionId: String, samples: FloatArray ->
      write(expectedSessionId, samples)
    }

    // Synchronous so Stop is independent from synthesis and queued PCM writes.
    Function("stop") {
      stopAndFlush()
    }

    OnDestroy {
      stopAndFlush()
    }
  }

  private fun start(nextSessionId: String, sampleRate: Int) {
    stopAndFlush()
    val channelMask = AudioFormat.CHANNEL_OUT_MONO
    val minSize = AudioTrack.getMinBufferSize(
      sampleRate,
      channelMask,
      AudioFormat.ENCODING_PCM_FLOAT
    )
    require(minSize > 0) { "Invalid AudioTrack buffer size" }

    val format = AudioFormat.Builder()
      .setSampleRate(sampleRate)
      .setChannelMask(channelMask)
      .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
      .build()
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_MEDIA)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    val nextTrack = AudioTrack(
      attributes,
      format,
      minSize,
      AudioTrack.MODE_STREAM,
      AudioManager.AUDIO_SESSION_ID_GENERATE
    )
    try {
      nextTrack.play()
      synchronized(lock) {
        sessionId = nextSessionId
        track = nextTrack
      }
    } catch (error: Throwable) {
      nextTrack.release()
      throw error
    }
  }

  private fun write(expectedSessionId: String, samples: FloatArray) {
    if (samples.isEmpty() || sessionId != expectedSessionId) return
    val currentTrack = track ?: return
    if (sessionId != expectedSessionId) return
    var offset = 0
    while (offset < samples.size) {
      if (sessionId != expectedSessionId || track !== currentTrack) return
      val written = try {
        currentTrack.write(samples, offset, samples.size - offset, AudioTrack.WRITE_BLOCKING)
      } catch (error: IllegalStateException) {
        // Stop may release the AudioTrack while a blocking write is returning.
        if (sessionId != expectedSessionId || track !== currentTrack) return
        throw error
      }
      if (written < 0) throw IllegalStateException("AudioTrack write failed with code $written")
      if (written == 0) throw IllegalStateException("AudioTrack write did not consume any samples")
      offset += written
    }
  }

  private fun stopAndFlush() {
    val oldTrack = synchronized(lock) {
      sessionId = null
      val value = track
      track = null
      value
    }
    oldTrack?.let {
      try { it.pause() } catch (_: IllegalStateException) {}
      try { it.flush() } catch (_: IllegalStateException) {}
      try { it.stop() } catch (_: IllegalStateException) {}
      it.release()
    }
  }
}
