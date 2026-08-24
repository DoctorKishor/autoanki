/**
 * Utility function to crop a sub-region of an image and optionally apply occlusion boxes over text labels.
 * 
 * @param {string} sourceImageUrl - Base64 or URL of the full source note image
 * @param {number[]} imgBox - Bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale
 * @param {number[][]} occlusions - Array of bounding boxes [[ymin, xmin, ymax, xmax], ...] on a 0-1000 scale relative to the full page image
 * @param {string} imageSide - 'front' | 'back' | 'both' | 'text'
 * @param {string} cardType - 'Basic' | 'Cloze'
 * @returns {Promise<string>} Base64 PNG Data URL of cropped (and masked if front/cloze) diagram
 */
export async function cropAndMaskDiagram(sourceImageUrl, imgBox, occlusions = [], imageSide = 'back', cardType = 'Basic') {
  return new Promise((resolve) => {
    let normalizedBox = null;
    if (Array.isArray(imgBox) && imgBox.length === 4) {
      normalizedBox = imgBox;
    } else if (imgBox && typeof imgBox === 'object' && imgBox.ymin !== undefined) {
      normalizedBox = [imgBox.ymin, imgBox.xmin, imgBox.ymax, imgBox.xmax];
    }

    if (!sourceImageUrl || !normalizedBox) {
      return resolve(null);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sourceImageUrl;

    img.onload = () => {
      try {
        const [ymin, xmin, ymax, xmax] = normalizedBox;
        const imgWidth = img.naturalWidth || img.width;
        const imgHeight = img.naturalHeight || img.height;

        if (!imgWidth || !imgHeight) {
          return resolve(null);
        }

        // Convert 0-1000 normalized coordinates to actual image pixel coordinates
        const cropX = Math.max(0, (xmin / 1000) * imgWidth);
        const cropY = Math.max(0, (ymin / 1000) * imgHeight);
        const cropW = Math.min(imgWidth - cropX, ((xmax - xmin) / 1000) * imgWidth);
        const cropH = Math.min(imgHeight - cropY, ((ymax - ymin) / 1000) * imgHeight);

        if (cropW <= 0 || cropH <= 0) {
          return resolve(null);
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(cropW);
        canvas.height = Math.round(cropH);
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return resolve(null);
        }

        // 1. Draw the cropped section of the original note page
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, Math.round(cropW), Math.round(cropH));

        // 2. Occlusion logic: Only apply occlusion masks if the image is shown BEFORE answering
        // i.e., when on the Front of a Basic card, or on a Cloze question card.
        const shouldApplyOcclusion = (cardType === 'Cloze') || (imageSide === 'front' || imageSide === 'both');

        if (shouldApplyOcclusion && Array.isArray(occlusions) && occlusions.length > 0) {
          ctx.fillStyle = '#1e1915'; // Dark solid occlusion fill
          ctx.strokeStyle = '#f59e0b'; // Amber outline border for visibility
          ctx.lineWidth = Math.max(2, Math.round(cropW / 300));

          occlusions.forEach((occBox) => {
            let oYmin, oXmin, oYmax, oXmax;
            if (Array.isArray(occBox) && occBox.length >= 4) {
              [oYmin, oXmin, oYmax, oXmax] = occBox;
            } else if (occBox && typeof occBox === 'object') {
              oYmin = occBox.ymin;
              oXmin = occBox.xmin;
              oYmax = occBox.ymax;
              oXmax = occBox.xmax;
            } else {
              return;
            }

            if (typeof oYmin === 'number' && typeof oXmin === 'number' && typeof oYmax === 'number' && typeof oXmax === 'number') {
              const spanX = Math.max(1, xmax - xmin);
              const spanY = Math.max(1, ymax - ymin);

              // Convert occlusion coordinates relative to cropped diagram area
              const occX = ((oXmin - xmin) / spanX) * cropW;
              const occY = ((oYmin - ymin) / spanY) * cropH;
              const occW = ((oXmax - oXmin) / spanX) * cropW;
              const occH = ((oYmax - oYmin) / spanY) * cropH;

              if (occW > 0 && occH > 0) {
                // Fill mask rectangle
                ctx.fillRect(Math.round(occX), Math.round(occY), Math.round(occW), Math.round(occH));
                ctx.strokeRect(Math.round(occX), Math.round(occY), Math.round(occW), Math.round(occH));
              }
            }
          });
        }

        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (err) {
        console.error('Error cropping image:', err);
        resolve(null);
      }
    };

    img.onerror = (err) => {
      console.error('Failed to load source image for cropping:', err);
      resolve(null);
    };
  });
}
