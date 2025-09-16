import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUploadToImageKit } from '../scripts/imagekitUpload.js';

describe('uploadToImageKit', () => {
  let dependencies;
  let mockFile;
  let consoleWarnSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    mockFile = { name: 'photo.jpg', type: 'image/jpeg' };
    dependencies = {
      imagekit: { upload: vi.fn() },
      isValidImageFile: vi.fn().mockReturnValue(true),
      showToast: vi.fn(),
      clearSelectedFile: vi.fn(),
      getCurrentCategory: vi.fn().mockReturnValue('Скарга'),
    };

    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('successfully uploads valid image files', async () => {
    const uploadedUrl = 'https://ik.imagekit.io/test/photo.jpg';
    dependencies.imagekit.upload.mockImplementation((options, callback) => {
      callback(null, { url: uploadedUrl });
    });

    const uploadToImageKit = createUploadToImageKit(dependencies);
    const result = await uploadToImageKit(mockFile);

    expect(result).toBe(uploadedUrl);
    expect(dependencies.imagekit.upload).toHaveBeenCalledTimes(1);
    expect(dependencies.imagekit.upload).toHaveBeenCalledWith(
      {
        file: mockFile,
        fileName: mockFile.name,
        tags: ['feedback,Скарга'],
      },
      expect.any(Function),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('rejects with an error when the ImageKit SDK returns an error', async () => {
    dependencies.imagekit.upload.mockImplementation((options, callback) => {
      callback({ message: 'Upload failed' });
    });

    const uploadToImageKit = createUploadToImageKit(dependencies);

    await expect(uploadToImageKit(mockFile)).rejects.toThrow('Upload failed');
    expect(consoleErrorSpy).toHaveBeenCalledWith('ImageKit SDK Upload Error:', expect.anything());
    expect(dependencies.showToast).not.toHaveBeenCalled();
    expect(dependencies.clearSelectedFile).not.toHaveBeenCalled();
  });

  it('ignores files that are not valid images', async () => {
    dependencies.isValidImageFile.mockReturnValue(false);

    const uploadToImageKit = createUploadToImageKit(dependencies);
    const result = await uploadToImageKit(mockFile);

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(dependencies.showToast).toHaveBeenCalledWith(
      'Файл не відповідає вимогам зображення і не буде надісланий.',
      'error',
    );
    expect(dependencies.clearSelectedFile).toHaveBeenCalledTimes(1);
    expect(dependencies.imagekit.upload).not.toHaveBeenCalled();
  });

  it('skips upload when file is not provided', async () => {
    const uploadToImageKit = createUploadToImageKit(dependencies);

    const result = await uploadToImageKit(null);

    expect(result).toBeNull();
    expect(dependencies.imagekit.upload).not.toHaveBeenCalled();
  });
});
