package tech.httptoolkit.android

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.Log
import androidx.annotation.RequiresApi
import io.sentry.Sentry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.cert.Certificate

private val TAG = formatTag("tech.httptoolkit.android.CertDownloads")

private const val CERT_FILENAME_BASE = "WireLens Certificate"
private const val CERT_FILENAME_EXTENSION = ".crt"
private const val CERT_MIME_TYPE = "application/x-x509-ca-cert"

const val CERT_DOWNLOAD_FILENAME = CERT_FILENAME_BASE + CERT_FILENAME_EXTENSION

/**
 * Save the CA certificate into the downloads folder, so that the user can select it in the
 * system's certificate installer.
 *
 * Any copies we saved previously are dropped first, so that repeated setup attempts can't pile
 * up, and so that nobody can install a CA from a previous session by accident.
 *
 * Reports failure by returning false, rather than throwing.
 */
@RequiresApi(Build.VERSION_CODES.Q)
suspend fun Context.saveCertToDownloads(cert: Certificate): Boolean = withContext(Dispatchers.IO) {
    deleteDownloadedCerts()

    var lastError: Exception? = null

    // If our normal filename is somehow unavailable, we fall back to a guaranteed unique name.
    // MediaProvider gives up once 32 files share a name, which is possible despite the cleanup
    // above: certs saved by a previous install of the app are disowned when it's uninstalled,
    // so they're invisible to us, but still hold their filenames.
    val filenames = listOf(
        CERT_DOWNLOAD_FILENAME,
        "$CERT_FILENAME_BASE ${System.currentTimeMillis()}$CERT_FILENAME_EXTENSION"
    )

    for (filename in filenames) {
        try {
            writeCertToDownloads(cert, filename)
            return@withContext true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to save cert to downloads as '$filename': $e")
            lastError = e
        }
    }

    Log.e(TAG, "Could not save cert to downloads")
    lastError?.let { Sentry.captureException(it) }
    false
}

/**
 * Blocking - deletes every cert we've previously saved to downloads.
 *
 * This only covers files owned by this install of the app: MediaProvider disowns a package's
 * files when it's uninstalled, so copies from previous installs can't be removed at all.
 */
@RequiresApi(Build.VERSION_CODES.Q)
fun Context.deleteDownloadedCerts() {
    try {
        // Deleting from the collection URI only affects rows we're allowed to delete, so this
        // never throws for other apps' (or our previous installs') files:
        val deletedCount = contentResolver.delete(
            MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
            "${MediaStore.Downloads.OWNER_PACKAGE_NAME} = ? AND " +
                "${MediaStore.Downloads.DISPLAY_NAME} LIKE ?",
            arrayOf(packageName, "$CERT_FILENAME_BASE%$CERT_FILENAME_EXTENSION")
        )

        if (deletedCount > 0) Log.i(TAG, "Deleted $deletedCount downloaded cert(s)")
    } catch (e: Exception) {
        Log.e(TAG, "Failed to delete downloaded certs: $e")
        Sentry.captureException(e)
    }
}

/**
 * Blocking - writes the cert to a specific filename in downloads, throwing if that's not
 * possible (notably IllegalStateException, if the filename isn't available).
 */
@RequiresApi(Build.VERSION_CODES.Q)
private fun Context.writeCertToDownloads(cert: Certificate, filename: String) {
    val downloadsUri = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

    val contentDetails = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, filename)
        put(MediaStore.Downloads.MIME_TYPE, CERT_MIME_TYPE)
        put(MediaStore.Downloads.IS_PENDING, 1)
    }

    val certUri = contentResolver.insert(downloadsUri, contentDetails)
        ?: throw RuntimeException("Could not get download cert URI")

    try {
        contentResolver.openFileDescriptor(certUri, "w", null).use { f ->
            ParcelFileDescriptor.AutoCloseOutputStream(f).write(cert.encoded)
        }

        // Un-pending the file is the step that picks its real filename, so it's also the step
        // that fails if that name isn't available:
        contentDetails.clear()
        contentDetails.put(MediaStore.Downloads.IS_PENDING, 0)
        if (contentResolver.update(certUri, contentDetails, null, null) == 0) {
            // We just created this row, so it should always be updatable. If it isn't, the file
            // is still pending, and so invisible to the certificate installer:
            throw IllegalStateException("Could not publish downloaded cert $certUri")
        }
    } catch (e: Throwable) {
        runCatching { contentResolver.delete(certUri, null, null) } // Don't leave it pending
        throw e
    }

    Log.i(TAG, "Saved certificate to downloads as '$filename'")
}
