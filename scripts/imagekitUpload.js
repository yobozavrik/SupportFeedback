export function createUploadToImageKit({
  imagekit,
  isValidImageFile,
  showToast,
  clearSelectedFile,
  getCurrentCategory,
}) {
  if (!imagekit || typeof imagekit.upload !== 'function') {
    throw new Error('A valid ImageKit instance with an upload method is required.');
  }
  if (typeof isValidImageFile !== 'function') {
    throw new Error('isValidImageFile must be provided.');
  }
  if (typeof showToast !== 'function') {
    throw new Error('showToast must be provided.');
  }
  if (typeof clearSelectedFile !== 'function') {
    throw new Error('clearSelectedFile must be provided.');
  }
  if (typeof getCurrentCategory !== 'function') {
    throw new Error('getCurrentCategory must be provided.');
  }

  return function uploadToImageKit(file) {
    if (!file) {
      return Promise.resolve(null);
    }

    if (!isValidImageFile(file)) {
      console.warn('Skipping upload to ImageKit: file is not a supported image.', {
        fileName: file?.name,
        fileType: file?.type,
      });
      showToast('Файл не відповідає вимогам зображення і не буде надісланий.', 'error');
      clearSelectedFile();
      return Promise.resolve(null);
    }

    const tagValue = `feedback,${getCurrentCategory() ?? ''}`;

    return new Promise((resolve, reject) => {
      imagekit.upload(
        {
          file,
          fileName: file.name,
          tags: [tagValue],
        },
        (error, result) => {
          if (error) {
            console.error('ImageKit SDK Upload Error:', error);
            reject(new Error(error.message || 'ImageKit SDK upload failed'));
            return;
          }

          resolve(result?.url ?? null);
        },
      );
    });
  };
}

export default createUploadToImageKit;
