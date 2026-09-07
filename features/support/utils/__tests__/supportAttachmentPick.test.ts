import {
  filesFromClipboardData,
  resolveSupportAttachmentMime,
} from '@/features/support/utils/supportAttachmentMime.util';

describe('resolveSupportAttachmentMime', () => {
  it('keeps a real image mime', () => {
    expect(resolveSupportAttachmentMime('image/png', 'shot.png')).toBe('image/png');
  });

  it('maps image/jpg to jpeg', () => {
    expect(resolveSupportAttachmentMime('image/jpg', 'shot.jpg')).toBe('image/jpeg');
  });

  it('infers png when the picker leaves mime empty', () => {
    expect(resolveSupportAttachmentMime('', 'screenshot.png')).toBe('image/png');
  });

  it('infers jpeg from octet-stream + extension', () => {
    expect(resolveSupportAttachmentMime('application/octet-stream', 'photo.JPEG')).toBe(
      'image/jpeg',
    );
  });
});

describe('filesFromClipboardData', () => {
  it('reads files from the files list', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    const dt = {
      files: [file],
      items: [],
    } as unknown as DataTransfer;
    expect(filesFromClipboardData(dt)).toEqual([file]);
  });

  it('falls back to clipboard items', () => {
    const file = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });
    const dt = {
      files: [],
      items: [{ kind: 'file', getAsFile: () => file }],
    } as unknown as DataTransfer;
    expect(filesFromClipboardData(dt)).toEqual([file]);
  });
});
