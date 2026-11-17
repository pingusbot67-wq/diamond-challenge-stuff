import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type ShrunkPhoto = { uri: string; base64: string; width: number; height: number; bytes: number };

const MAX_SIDE = 1024; // longest side in pixels — plenty for spotting food, and far fewer AI tokens
const QUALITY = 0.7; // JPEG quality

/**
 * Opens the camera or photo library, then shrinks the photo ON THE PHONE before upload.
 * Returns null if the user cancels. Throws a friendly Error if permission is denied.
 */
export async function pickFridgePhoto(source: 'camera' | 'library'): Promise<ShrunkPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access is off. You can turn it on in Settings, or choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  return shrink(res.assets[0].uri, res.assets[0].width, res.assets[0].height);
}

export async function shrink(uri: string, width: number, height: number): Promise<ShrunkPhoto> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG, base64: true });
  const base64 = out.base64 ?? '';
  return { uri: out.uri, base64, width: out.width, height: out.height, bytes: Math.round((base64.length * 3) / 4) };
}
