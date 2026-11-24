package it.dariotronic.ascolti;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * "Condividi → Ascolti": riceve il testo (di solito un link) che un'altra app condivide con Ascolti.
 *
 * Dal JavaScript (Capacitor.Plugins.ShareReceiver):
 *  - consume()            { text }: il testo condiviso all'avvio dell'app, se c'è (poi viene dimenticato)
 *  - evento "shared"      { text }: testo condiviso mentre l'app è già aperta
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static String pending = null;
    private static ShareReceiverPlugin instance = null;

    @Override
    public void load() {
        instance = this;
    }

    /** Chiamato da MainActivity per l'intent di avvio e per quelli successivi. */
    static void handleIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;
        // Solo testo breve: un link o il nome di un album, non documenti interi
        text = text.trim();
        if (text.length() > 2000) text = text.substring(0, 2000);
        if (instance != null && instance.hasListeners("shared")) {
            JSObject data = new JSObject();
            data.put("text", text);
            instance.notifyListeners("shared", data);
        } else {
            pending = text;
        }
    }

    @PluginMethod
    public void consume(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("text", pending);
        pending = null;
        call.resolve(ret);
    }
}
