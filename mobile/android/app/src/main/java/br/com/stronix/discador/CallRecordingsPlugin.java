package br.com.stronix.discador;

import android.Manifest;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Encontra as gravações de chamada feitas pelo app Telefone do aparelho (o Android não deixa outros apps
 * gravarem ligações) e abre uma delas no player do sistema.
 */
@CapacitorPlugin(
    name = "CallRecordings",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class CallRecordingsPlugin extends Plugin {

    private String permissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "storage";
    }

    /** Gravações de chamada adicionadas a partir de `since` (ms), mais recentes primeiro. */
    @PluginMethod
    public void find(PluginCall call) {
        if (getPermissionState(permissionAlias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(permissionAlias(), call, "permissionCallback");
            return;
        }
        query(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState(permissionAlias()) == PermissionState.GRANTED) {
            query(call);
        } else {
            call.reject("Sem permissão para ler as gravações", "PERMISSION_DENIED");
        }
    }

    private void query(PluginCall call) {
        long sinceSeconds = call.getLong("since", 0L) / 1000;
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATE_ADDED,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.RELATIVE_PATH
            }
            : new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATE_ADDED,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATA
            };
        String selection = MediaStore.Audio.Media.DATE_ADDED + " >= ?";
        String[] args = { String.valueOf(sinceSeconds) };

        JSArray result = new JSArray();
        try (
            Cursor cursor = getContext()
                .getContentResolver()
                .query(collection, projection, selection, args, MediaStore.Audio.Media.DATE_ADDED + " DESC")
        ) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    long id = cursor.getLong(0);
                    String name = cursor.getString(1);
                    String location = cursor.getString(4);
                    if (!isCallRecording(name, location)) continue;
                    JSObject item = new JSObject();
                    item.put("uri", ContentUris.withAppendedId(collection, id).toString());
                    item.put("name", name);
                    item.put("addedAt", cursor.getLong(2) * 1000);
                    item.put("durationMs", cursor.getLong(3));
                    result.put(item);
                }
            }
        } catch (Exception e) {
            call.reject("Não foi possível ler as gravações", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("recordings", result);
        call.resolve(ret);
    }

    /** Pasta Recordings/Call (Samsung) ou nomes de gravação de chamada usados por outros fabricantes. */
    private static boolean isCallRecording(String name, String location) {
        String haystack = ((location == null ? "" : location) + "/" + (name == null ? "" : name)).toLowerCase();
        return haystack.contains("call") || haystack.contains("chamada") || haystack.contains("ligação");
    }

    @PluginMethod
    public void open(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Gravação não informada");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.parse(uri), "audio/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nenhum app para tocar a gravação", e);
        }
    }
}
