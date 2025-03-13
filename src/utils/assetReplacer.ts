/**
 * DatoCMS Asset Replacement Utility
 * 
 * This module provides a function to replace existing assets in DatoCMS
 * with new optimized versions from a URL.
 * 
 * @module assetReplacer
 */

/**
 * Interface for the upload request response from DatoCMS
 */
interface UploadRequestResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      url: string;
      request_headers: Record<string, string>;
    };
  };
}

/**
 * Interface for the asset update response from DatoCMS
 */
interface AssetUpdateResponse {
  data: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  };
}

/**
 * Replaces an existing asset in DatoCMS with a new image from a URL.
 * 
 * @param {string} assetId - The ID of the asset to replace
 * @param {string} newImageUrl - URL of the new image to replace the original with
 * @param {string} [filename] - Optional custom filename for the replacement
 * @param {string} apiToken - DatoCMS API token
 * @returns {Promise<AssetUpdateResponse>} The updated asset object from DatoCMS
 * @throws {Error} If the replacement fails
 */
async function replaceAssetFromUrl(
  assetId: string,
  newImageUrl: string,
  apiToken: string,
  filename?: string
): Promise<AssetUpdateResponse> {
  console.log(`Replacing DatoCMS asset ID ${assetId} with image from URL: ${newImageUrl}`);
  
  if (!assetId || !apiToken) {
    throw new Error('Missing required parameters: assetId and apiToken are required');
  }
  
  try {
    const baseUrl = 'https://site-api.datocms.com';
    const headers = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Api-Version': '3',  
    };

    // Step 1: Create an upload request to get a pre-signed S3 URL
    const uploadRequestResponse = await fetch(`${baseUrl}/upload-requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          type: 'upload_request',
          attributes: {
            filename: filename || 'optimized-image.jpg'
          }
        }
      })
    });

    if (!uploadRequestResponse.ok) {
      const errorText = await uploadRequestResponse.text();
      throw new Error(`Failed to create upload request: ${uploadRequestResponse.status} ${errorText}`);
    }

    const uploadRequestData: UploadRequestResponse = await uploadRequestResponse.json();
    
    const { 
      id: uploadPath, 
      attributes: { 
        url: s3Url, 
        request_headers: s3Headers 
      } 
    } = uploadRequestData.data;

    // Step 2: Fetch the image from the newImageUrl
    const imageResponse = await fetch(newImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from URL: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    
    const imageBlob = await imageResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const imageBuffer = new Uint8Array(arrayBuffer);

    // Step 3: Upload the image to S3 using the pre-signed URL
    const s3Response = await fetch(s3Url, {
      method: 'PUT',
      headers: {
        ...s3Headers,
        'Content-Length': imageBuffer.length.toString()
      },
      body: imageBuffer
    });

    if (!s3Response.ok) {
      throw new Error(`Failed to upload file to S3: ${s3Response.status} ${s3Response.statusText}`);
    }

    // Step 4: Update the asset metadata to link it with the new file
    const updateResponse = await fetch(`${baseUrl}/uploads/${assetId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        data: {
          id: assetId,
          type: 'upload',
          attributes: {
            path: uploadPath
          }
        }
      })
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update asset metadata: ${updateResponse.status} ${errorText}`);
    }

    const result = await updateResponse.json() as AssetUpdateResponse;
    console.log('Asset replaced successfully:', result);
    return result;
  } catch (error) {
    console.error('Error replacing asset:', error);
    throw error;
  }
}

export default replaceAssetFromUrl;
