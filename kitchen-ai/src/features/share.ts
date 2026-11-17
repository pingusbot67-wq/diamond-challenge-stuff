import * as Sharing from 'expo-sharing';
import type { ComponentRef } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Turns a card into a PNG and opens the iOS share sheet (Save Image, Messages, TikTok, Instagram…). */
export async function shareCard(view: ComponentRef<typeof View> | null): Promise<void> {
  if (!view) return;
  const uri = await captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share recipe card' });
}
