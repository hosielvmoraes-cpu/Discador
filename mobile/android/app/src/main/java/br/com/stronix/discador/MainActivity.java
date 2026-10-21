package br.com.stronix.discador;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallRecordingsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
