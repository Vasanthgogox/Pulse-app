package com.qmobile.app  // Replace with your app's package name

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log

/**
 * Method 2: Android App Parsing — BroadcastReceiver for incoming SMS.
 * Wakes when the phone's radio receives an SMS; parses PDUs and extracts OTP/code.
 *
 * Register in AndroidManifest.xml with RECEIVE_SMS permission and intent-filter
 * for android.provider.Telephony.SMS_RECEIVED.
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val bundle = intent.extras ?: return
        val pdus = bundle.get("pdus") as? Array<*> ?: return

        for (pdu in pdus) {
            val bytes = pdu as? ByteArray ?: continue
            val smsMessage = SmsMessage.createFromPdu(bytes)
            val body = smsMessage?.messageBody ?: continue
            val sender = smsMessage.originatingAddress

            val code = extractCode(body)
            if (code != null) {
                // Call your parsing / app logic here:
                // - Send code to JS (e.g. via Expo module or EventEmitter)
                // - Store for OTP claim screen
                // - Auto-fill verification flow
                onCodeExtracted(context, code, body, sender)
            }
        }
    }

    /**
     * Extract a numeric OTP/code from message body.
     * Matches 4–8 digit codes (common OTP length). Adjust regex for your senders.
     */
    private fun extractCode(body: String): String? {
        val regex = Regex("\\b(\\d{4,8})\\b")
        return regex.find(body)?.groupValues?.get(1)
    }

    /**
     * Override or replace: handle the extracted code (e.g. post to React Native).
     */
    private fun onCodeExtracted(context: Context, code: String, fullBody: String, sender: String?) {
        Log.d(TAG, "SMS OTP parsed: code=$code sender=$sender body=$fullBody")
        // TODO: Bridge to JS — e.g. send event via Expo module or native module.
    }

    companion object {
        private const val TAG = "SmsReceiver"
    }
}
