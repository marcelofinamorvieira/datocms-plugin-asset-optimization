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
 * Interface for the job result response from DatoCMS
 */
interface JobResultResponse {
  data: {
    type: string;
    id: string;
    attributes?: {
      status: number;
      payload: {
        data: {
          type: string;
          id: string;
          attributes: Record<string, unknown>;
        };
      };
    };
  };
}

/**
 * Polls a job result endpoint until the job is complete
 * 
 * @param {string} jobId - The ID of the job to check
 * @param {string} apiToken - DatoCMS API token
 * @param {number} maxAttempts - Maximum number of polling attempts
 * @param {number} interval - Polling interval in milliseconds
 * @returns {Promise<JobResultResponse>} The final job result
 * @throws {Error} If the job fails or times out
 */
async function waitForJobCompletion(
  jobId: string,
  apiToken: string,
  maxAttempts = 60,
  interval = 2000
): Promise<JobResultResponse> {
  const baseUrl = 'https://site-api.datocms.com';
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Api-Version': '3',  
  };
  
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      const response = await fetch(`${baseUrl}/job-results/${jobId}`, {
        headers
      });
      
      if (response.status === 200) {
        const result = await response.json() as JobResultResponse;
        if (result.data.attributes?.status === 200) {
          console.log(`Job ${jobId} completed successfully`);
          return result;
        }
      }
      
      // If we got a 404 or any other status, the job is still processing
      console.log(`Job ${jobId} still processing (attempt ${attempts}/${maxAttempts})...`);
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      console.error(`Error checking job status: ${error}`);
      // Continue trying despite error
    }
  }
  
  throw new Error(`Job ${jobId} did not complete after ${maxAttempts} attempts`);
}

/**
 * Replaces an existing asset in DatoCMS with a new image from a URL.
 * 
 * @param {string} assetId - The ID of the asset to replace
 * @param {string} newImageUrl - URL of the new image to replace the original with
 * @param {string} apiToken - DatoCMS API token
 * @param {string} [filename] - Optional custom filename for the replacement
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

    // Step 5: If we received a job ID, wait for the job to complete
    const responseData = await updateResponse.json();
    
    if (responseData.data && responseData.data.type === 'job') {
      // We got a job ID instead of the completed upload, need to wait for job completion
      const jobId = responseData.data.id;
      console.log(`Asset update initiated as job ${jobId}, waiting for completion...`);
      
      // Wait for the job to complete
      const jobResult = await waitForJobCompletion(jobId, apiToken);
      
      if (jobResult.data.attributes?.status !== 200) {
        throw new Error(`Job completed with error status: ${jobResult.data.attributes?.status}`);
      }
      
      // Return the upload data from the job result
      return jobResult.data.attributes.payload as AssetUpdateResponse;
    }

    console.log('Asset replaced successfully:', responseData);
    return responseData as AssetUpdateResponse;
  } catch (error) {
    console.error('Error replacing asset:', error);
    throw error;
  }
}

export default replaceAssetFromUrl;
