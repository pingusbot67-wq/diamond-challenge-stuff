// POST { image_base64, media_type } -> { items: [{ name, amount, confidence, matched }], not_food? }
// The phone shrinks the photo to ~1024px JPEG before sending (big cost saver). We never store the photo.
import { handle, json, requireUser, adminClient, anthropicKey } from '../_shared/http.ts';
import { callStructured, FriendlyError, getClient, SCAN_MODELS } from '../_shared/claude.ts';
import { ScanSchema } from '../_shared/schemas.ts';
import { SCAN_SYSTEM } from '../_shared/prompts.ts';
import { reserve, usageWriter } from '../_shared/usage.ts';
import { loadFoodIndex } from '../_shared/foods-db.ts';
import { normalizeScanItems } from '../_shared/nutrition.ts';

const MAX_BASE64 = 1_600_000; // ~1.2 MB image — a 1024px JPEG at 70% is usually 100–250 KB
const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const image = typeof body.image_base64 === 'string' ? body.image_base64.replace(/^data:[^,]+,/, '') : '';
    const mediaType = TYPES.includes(body.media_type) ? body.media_type : 'image/jpeg';
    if (!image) throw new FriendlyError('no_image', 'Please take or choose a photo first.');
    if (image.length > MAX_BASE64) throw new FriendlyError('too_big', 'That photo is too large. Please try again.', 413);

    const admin = adminClient();
    const { data: settings } = await admin.from('ai_settings').select('scan_model').eq('id', 1).single();
    const model = SCAN_MODELS.includes(settings?.scan_model) ? settings!.scan_model : 'claude-haiku-5-5';

    const logId = await reserve(admin, user.id, 'scan', model);
    const result = await callStructured({
      client: getClient(anthropicKey()),
      model,
      system: SCAN_SYSTEM,
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
        { type: 'text', text: 'List the food you can see.' },
      ],
      schema: ScanSchema,
      maxTokens: 2000,
      onUsage: usageWriter(admin, logId),
    });

    if (!result.data.is_food_photo) return json({ items: [], not_food: true });
    const index = await loadFoodIndex(admin);
    const order = { high: 0, medium: 1, low: 2 } as const;
    const items = normalizeScanItems(result.data.items.slice(0, 60), index)
      .sort((a, b) => order[a.confidence] - order[b.confidence])
      .map((i) => ({ name: i.display, amount: i.amount, confidence: i.confidence, matched: i.matched }));
    return json({ items });
  }),
);
