import { appConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { Context } from 'grammy';

const log = createLogger('voice');

/**
 * Downloads a voice message from Telegram and sends it to OpenAI's Whisper API.
 * Returns the transcribed text if successful, or null on error.
 */
export async function processVoiceMessage(ctx: Context): Promise<string | null> {
  if (!appConfig.openaiApiKey) {
    throw new Error('OpenAI API Key (openai_api_key) ist nicht konfiguriert.');
  }

  const voice = ctx.message?.voice;
  if (!voice) {
    throw new Error('Keine Sprachnachricht gefunden.');
  }

  try {
    const file = await ctx.getFile();
    if (!file.file_path) {
      throw new Error('Dateipfad von Telegram fehlt.');
    }

    const url = `https://api.telegram.org/file/bot${appConfig.telegramBotToken}/${file.file_path}`;

    log.debug('Downloading voice message', { size: voice.file_size, path: file.file_path });
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    log.debug('Sending to Whisper API', { bytes: arrayBuffer.byteLength });
    
    const formData = new FormData();
    const blob = new Blob([arrayBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'voice.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'de'); // Optimize for German

    const sttRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${appConfig.openaiApiKey}`
      },
      body: formData
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      throw new Error(`OpenAI API Fehler: ${errText}`);
    }

    const data = (await sttRes.json()) as { text: string };
    
    log.info('Voice message transcribed', { textPreview: data.text.slice(0, 50) });
    return data.text || null;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('STT conversion error', { error: errorMsg });
    throw new Error(`Spracherkennung fehlgeschlagen: ${errorMsg}`);
  }
}
