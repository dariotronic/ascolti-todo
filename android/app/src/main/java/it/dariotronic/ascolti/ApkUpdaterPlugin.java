package it.dariotronic.ascolti;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;

/**
 * Aggiornamento dentro l'app. Può installare SOLO una versione più nuova di Ascolti stessa:
 *  - scarica solo dalle Release di github.com/dariotronic/ascolti-todo, solo file .apk, al massimo 100 MB;
 *  - confronta l'impronta SHA-256 con quella dichiarata da GitHub per il file;
 *  - prima di installare controlla nome del pacchetto, versione annunciata e più nuova, stessa firma;
 *  - installa solo file della propria cartella degli aggiornamenti.
 *
 * Dal JavaScript (Capacitor.Plugins.ApkUpdater):
 *  - canInstall()                                   { value }: Android permette ad Ascolti di installare app?
 *  - download({ url, version, sha256? })            { path, versionName }; eventi "progress" { received, total, progress }
 *  - install({ path })                              { needsPermission }: apre l'installer, o le impostazioni per il permesso
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String PACKAGE = "it.dariotronic.ascolti";
    private static final String URL_PREFIX = "https://github.com/dariotronic/ascolti-todo/releases/download/";
    private static final long MAX_BYTES = 100L * 1024 * 1024;

    private File updatesDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", canInstallPackages());
        call.resolve(ret);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url", "");
        String version = call.getString("version", "");
        String sha256 = call.getString("sha256", "");
        if (!url.startsWith(URL_PREFIX) || !url.endsWith(".apk") || !version.matches("\\d+\\.\\d+\\.\\d+")
            || !(sha256.isEmpty() || sha256.matches("[0-9a-fA-F]{64}"))) {
            call.reject("Indirizzo dell'aggiornamento non valido.");
            return;
        }
        new Thread(() -> {
            File target = new File(updatesDir(), "ascolti-" + version + ".apk");
            File partial = new File(updatesDir(), "download.part");
            HttpURLConnection conn = null;
            try {
                File[] old = updatesDir().listFiles();
                if (old != null) for (File f : old) f.delete();

                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                conn.setRequestProperty("User-Agent", "Ascolti-updater");
                int code = conn.getResponseCode();
                if (code != 200) throw new Exception("Il download non è partito (HTTP " + code + ").");
                if (!"https".equals(conn.getURL().getProtocol())) throw new Exception("Il download non è sicuro.");
                long total = conn.getContentLengthLong();
                if (total > MAX_BYTES) throw new Exception("Il file dell'aggiornamento è troppo grande.");

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long received = 0, lastEmit = 0;
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(partial)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        digest.update(buf, 0, n);
                        received += n;
                        if (received > MAX_BYTES) throw new Exception("Il file dell'aggiornamento è troppo grande.");
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 100) { lastEmit = now; emit(received, total); }
                    }
                }
                emit(received, total > 0 ? total : received);

                if (!sha256.isEmpty() && !hex(digest.digest()).equals(sha256.toLowerCase(Locale.ROOT))) {
                    throw new Exception("Il file scaricato non corrisponde a quello della release: riprova.");
                }
                if (!partial.renameTo(target)) throw new Exception("Non riesco a salvare l'aggiornamento.");
                PackageInfo info = check(target, version);

                JSObject ret = new JSObject();
                ret.put("path", target.getAbsolutePath());
                ret.put("versionName", info.versionName);
                call.resolve(ret);
            } catch (Exception e) {
                partial.delete();
                target.delete();
                call.reject(e.getMessage() != null ? e.getMessage() : "Download non riuscito.");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void emit(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received);
        p.put("total", total);
        p.put("progress", total > 0 ? (double) received / total : -1);
        notifyListeners("progress", p);
    }

    // L'APK deve essere Ascolti, della versione annunciata, più nuovo di quello installato e con la stessa firma.
    private PackageInfo check(File apk, String version) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo info = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (info == null || !PACKAGE.equals(info.packageName)) throw new Exception("Il file scaricato non è Ascolti.");
        if (!version.equals(info.versionName)) throw new Exception("Il file scaricato non è la versione " + version + ".");
        PackageInfo installed = pm.getPackageInfo(PACKAGE, flags);
        if (versionCode(info) <= versionCode(installed)) throw new Exception("Hai già questa versione, o una più nuova.");
        if (!Arrays.equals(signatures(installed), signatures(info))) {
            throw new Exception("L'aggiornamento non è firmato con la chiave di Ascolti.");
        }
        return info;
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static byte[] signatures(PackageInfo info) throws Exception {
        Signature[] list;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new byte[0];
            list = info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
        } else {
            list = info.signatures;
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        if (list != null) for (Signature s : list) digest.update(s.toByteArray());
        return digest.digest();
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = new File(call.getString("path", ""));
        JSObject ret = new JSObject();
        try {
            if (!apk.getCanonicalPath().startsWith(updatesDir().getCanonicalPath() + File.separator) || !apk.exists()) {
                call.reject("Aggiornamento non trovato: scaricalo di nuovo.");
                return;
            }
            if (!canInstallPackages()) {
                Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                ret.put("needsPermission", true);
                call.resolve(ret);
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            ret.put("needsPermission", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Non riesco ad aprire l'installazione: " + e.getMessage());
        }
    }
}
