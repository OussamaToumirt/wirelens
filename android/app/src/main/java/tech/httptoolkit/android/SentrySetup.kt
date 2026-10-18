package tech.httptoolkit.android

import android.content.Context
import io.sentry.SentryEvent
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroid
import tech.httptoolkit.android.vpn.transport.PacketHeaderException
import java.io.IOException
import java.net.BindException
import java.net.ConnectException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.security.cert.CertificateException

/**
 * Central Sentry configuration. We initialize manually (auto-init is disabled in the
 * manifest via io.sentry.auto-init) so that we can attach a beforeSend hook. This is the
 * single place where we filter out expected/unactionable noise and collapse high-cardinality
 * issues, rather than scattering ignore-checks across individual capture call sites.
 *
 * The DSN and enabled flag are still read from the manifest meta-data, so the existing
 * build-type gating (reporting only in release builds) continues to apply unchanged.
 */
fun initSentry(context: Context) {
    SentryAndroid.init(context) { options ->
        options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
            if (shouldDropEvent(event)) {
                null
            } else {
                normalizeEvent(event)
                event
            }
        }
    }
}

private fun shouldDropEvent(event: SentryEvent): Boolean {
    val throwable = event.throwable
    return throwable != null && causedByIgnorableException(throwable)
}

/**
 * Walks the full cause chain, so an expected error wrapped in something else is still dropped.
 */
private fun causedByIgnorableException(throwable: Throwable): Boolean {
    var current: Throwable? = throwable
    val seen = HashSet<Throwable>()
    while (current != null && seen.add(current)) {
        if (isIgnorableException(current)) return true
        current = current.cause
    }
    return false
}

private fun isIgnorableException(e: Throwable): Boolean {
    val message = e.message ?: ""
    return when (e) {
        // Plain connection failures: the upstream/proxy was unreachable, timed out, or the
        // local address couldn't be bound. All expected for a VPN proxy, nothing to fix here.
        is SocketTimeoutException -> true
        is ConnectException -> true
        is BindException -> true

        // IPv6 isn't supported by our packet parsing yet - known and unactionable.
        is PacketHeaderException -> message.contains("IP version should be 4 but was 6")

        // Mid-connection socket failures and file-descriptor exhaustion, all expected operationally.
        is SocketException ->
            message.contains("Connection reset") ||
            message.contains("Broken pipe") ||
            message.contains("EPIPE") ||
            message.contains("ENETUNREACH") ||
            message.contains("Network is unreachable") ||
            message.contains("EMFILE") ||
            message.contains("Too many open files")

        is IOException ->
            message.contains("unexpected end of stream") ||
            message.contains("Too many open files")

        // Android 12+ forbids starting our foreground service from the background. This is a
        // platform restriction we can't avoid here, so we don't report it as a crash.
        // (BackgroundServiceStartNotAllowedException is itself an IllegalStateException.)
        is IllegalStateException -> message.contains("Not allowed to start service")

        else -> false
    }
}

/**
 * Collapse known high-cardinality issues into a single group by giving them a stable
 * fingerprint, instead of letting dynamic values in the message split one underlying
 * problem into thousands of separate Sentry issues.
 */
private fun normalizeEvent(event: SentryEvent) {
    val throwable = event.throwable ?: return
    if (
        throwable is CertificateException &&
        (throwable.message ?: "").contains("Proxy returned mismatched certificate")
    ) {
        // The message embeds the (always different) cert fingerprints, so group by a fixed key.
        event.fingerprints = listOf("proxy-cert-mismatch")
    }
}
