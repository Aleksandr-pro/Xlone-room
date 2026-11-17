package com.xloneroom.xl3d

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class MainActivity : Activity() {

    private lateinit var rootContainer: FrameLayout
    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingAuthCallbackUrl: String? = null
    private var pageLoaded = false

    companion object {
        private const val HOST = "xl3d.local"
        private const val BASE_URL = "https://$HOST/index.html"
        private const val FILE_CHOOSER_REQUEST_CODE = 1001
        private const val PREFS_NAME = "xl3d_persistent_prefs"
        private const val KEY_AUTH_JSON = "auth_json_v2"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        rootContainer = FrameLayout(this)
        rootContainer.setBackgroundColor(0xFF17181D.toInt())

        // Respect system Status Bar and Navigation Bar insets (essential on Android 15 edge-to-edge)
        rootContainer.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val sysBars = insets.getInsets(
                    WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
                )
                v.setPadding(sysBars.left, sysBars.top, sysBars.right, sysBars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom
                )
            }
            insets
        }

        handleDeepLinkIntent(intent)

        webView = createConfiguredWebView()
        rootContainer.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(rootContainer)
        rootContainer.requestApplyInsets()
        webView.loadUrl(BASE_URL)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLinkIntent(intent)
    }

    private fun handleDeepLinkIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "xl3d" && data.host == "auth") {
            val fullUrl = data.toString()
            pendingAuthCallbackUrl = fullUrl
            if (pageLoaded) {
                dispatchAuthCallbackToWebView(fullUrl)
            }
        }
    }

    private fun dispatchAuthCallbackToWebView(callbackUrl: String) {
        val escaped = JSONObject.quote(callbackUrl)
        runOnUiThread {
            webView.evaluateJavascript(
                "window.__xl3dHandleAuthCallback && window.__xl3dHandleAuthCallback($escaped);",
                null
            )
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createConfiguredWebView(): WebView {
        val wv = WebView(this)
        wv.setBackgroundColor(0xFF17181D.toInt())

        val settings = wv.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(false)

        wv.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        wv.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageLoaded = true
                val pending = pendingAuthCallbackUrl
                if (pending != null) {
                    pendingAuthCallbackUrl = null
                    dispatchAuthCallbackToWebView(pending)
                }
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.host != HOST) return super.shouldInterceptRequest(view, request)

                var path = url.path?.trimStart('/') ?: ""
                if (path.isEmpty()) path = "index.html"

                return try {
                    val stream: InputStream = assets.open("public/$path")
                    val mime = guessMimeType(path)
                    val headers = mapOf(
                        "Access-Control-Allow-Origin" to "*",
                        "Cache-Control" to "no-cache"
                    )
                    WebResourceResponse(mime, "UTF-8", 200, "OK", headers, stream)
                } catch (_: Exception) {
                    WebResourceResponse(
                        "text/plain",
                        "UTF-8",
                        404,
                        "Not Found",
                        emptyMap(),
                        ByteArrayInputStream(ByteArray(0))
                    )
                }
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: RenderProcessGoneDetail?
            ): Boolean {
                pageLoaded = false
                rootContainer.removeView(webView)
                webView.destroy()
                webView = createConfiguredWebView()
                rootContainer.addView(
                    webView,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                webView.loadUrl(BASE_URL)
                return true
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
                return try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(
                        Intent.createChooser(intent, "Выбрать 3D модель или проект"),
                        FILE_CHOOSER_REQUEST_CODE
                    )
                    true
                } catch (_: Exception) {
                    this@MainActivity.filePathCallback = null
                    false
                }
            }
        }
        return wv
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val cb = filePathCallback
            filePathCallback = null
            if (cb != null) {
                val uris: Array<Uri>? = if (resultCode == RESULT_OK && data?.data != null) {
                    arrayOf(data.data!!)
                } else {
                    null
                }
                cb.onReceiveValue(uris)
            }
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun guessMimeType(path: String): String {
        val lower = path.lowercase()
        return when {
            lower.endsWith(".html") -> "text/html"
            lower.endsWith(".js") || lower.endsWith(".mjs") -> "application/javascript"
            lower.endsWith(".css") -> "text/css"
            lower.endsWith(".svg") -> "image/svg+xml"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".json") || lower.endsWith(".webmanifest") -> "application/json"
            lower.endsWith(".woff2") -> "font/woff2"
            else -> "application/octet-stream"
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun saveBase64File(fileName: String, mimeType: String, base64Data: String) {
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val cleanName = fileName.replace(Regex("[^a-zA-Z0-9._-]"), "_")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Downloads.DISPLAY_NAME, cleanName)
                        put(MediaStore.Downloads.MIME_TYPE, mimeType)
                        put(
                            MediaStore.Downloads.RELATIVE_PATH,
                            "${Environment.DIRECTORY_DOWNLOADS}/XL3D"
                        )
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                        ?: throw IllegalStateException("Cannot create download entry")
                    contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                } else {
                    val dir = File(
                        getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        "XL3D"
                    )
                    if (!dir.exists()) dir.mkdirs()
                    val outFile = File(dir, cleanName)
                    FileOutputStream(outFile).use { it.write(bytes) }
                }

                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "Сохранено в Загрузки/XL3D: $cleanName",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "Ошибка сохранения: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        @JavascriptInterface
        fun openExternalUrl(url: String) {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(
                        this@MainActivity,
                        "Не удалось открыть браузер: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        @JavascriptInterface
        fun savePersistentAuth(json: String) {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_AUTH_JSON, json).commit()
        }

        @JavascriptInterface
        fun loadPersistentAuth(): String {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getString(KEY_AUTH_JSON, "") ?: ""
        }

        @JavascriptInterface
        fun clearPersistentAuth() {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().remove(KEY_AUTH_JSON).commit()
        }

        @JavascriptInterface
        fun showToast(message: String) {
            runOnUiThread {
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun getAppVersion(): String = "1.5.0"
    }
}
