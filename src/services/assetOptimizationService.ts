import type { RenderPageCtx } from 'datocms-plugin-sdk';
import { buildClient } from '@datocms/cma-client-browser';
import type { SimpleSchemaTypes } from '@datocms/cma-client-browser';
import { getOptimizationParams } from '../utils/optimizationUtils';
import type { Asset, AssetOptimizerResult, OptimizationSettings } from '../utils/optimizationUtils';

/**
 * Handle the optimization process for assets
 * @param ctx DatoCMS context
 * @param settings Optimization settings
 * @param addLog Function to add log entries
 * @param addSizeComparisonLog Function to add size comparison log entries
 * @param setProgress Function to update the progress percentage
 * @returns The result of the optimization process
 */
export async function optimizeAssets(
  ctx: RenderPageCtx,
  settings: OptimizationSettings,
  addLog: (message: string) => void,
  addSizeComparisonLog: (assetPath: string, originalSize: number, optimizedSize: number) => void,
  setProgress: (progress: number) => void
): Promise<AssetOptimizerResult> {
  // Initialize counters and result arrays
  let optimized = 0;
  let skipped = 0;
  let failed = 0;
  const optimizedAssets: Array<{path: string, url: string, id: string, originalSize: number, optimizedSize: number}> = [];
  const skippedAssets: Array<{path: string, url: string, id: string}> = [];
  const failedAssets: Array<{path: string, url: string, id: string}> = [];
  
  // Get access token from the plugin context
  const token = ctx.currentUserAccessToken;
  
  if (!token) {
    addLog('Error: Access token not available');
    return {
      optimized,
      skipped,
      failed,
      totalAssets: 0,
      optimizedAssets,
      skippedAssets,
      failedAssets,
    };
  }

  // Initialize CMA client
  const client = buildClient({
    apiToken: token,
  });

  try {
    // Fetch all assets from the site
    const assets = await client.items.list({
      filter: {
        type: 'asset',
      },
      page: {
        // Get all assets
        limit: 100,
        offset: 0,
      },
    });

    const totalAssets = assets.length;
    addLog(`Found ${totalAssets} assets to process.`);
    setProgress(0);

    /**
     * Converts a DatoCMS CMA Upload object to our internal Asset type
     */
    function uploadToAsset(upload: SimpleSchemaTypes.Upload): Asset {
      return {
        id: upload.id,
        is_image: upload.is_image || false,
        size: upload.size || 0,
        url: upload.url || '',
        path: upload.path || '',
        basename: upload.basename || '',
        width: upload.width || undefined,
        height: upload.height || undefined,
        alt: upload.default_field_metadata?.en?.alt || undefined,
        title: upload.default_field_metadata?.en?.title || undefined,
        customData: upload.default_field_metadata?.en?.custom_data || {},
        tags: upload.tags || []
      };
    }

    // Filter out assets that are not images or don't have URLs
    const uploadAssets = [];
    
    for (const item of assets) {
      // Check if the item has the expected upload properties
      if (
        'url' in item && 
        'is_image' in item && 
        'size' in item && 
        'path' in item && 
        'basename' in item && 
        typeof item.url === 'string' && 
        typeof item.is_image === 'boolean' && 
        item.is_image && 
        item.url
      ) {
        // This item has the properties we expect from a Upload
        // Use a type-safe two-step cast by going through unknown first
        uploadAssets.push(item);
      }
    }
    
    // We've verified these items have Upload properties, so we can safely map them
    // Use a two-step cast through unknown first to satisfy TypeScript
    const optimizableAssets = uploadAssets.map(item => uploadToAsset(item as unknown as SimpleSchemaTypes.Upload));

    addLog(`Found ${optimizableAssets.length} optimizable images.`);

    // Process each asset
    for (let i = 0; i < optimizableAssets.length; i++) {
      const asset = optimizableAssets[i];
      setProgress(Math.floor((i / optimizableAssets.length) * 100));
      
      try {
        addLog(`Processing asset: ${asset.path} (${formatFileSize(asset.size)})`);
        
        // Determine optimization parameters based on image type and size
        const optimizationParams = getOptimizationParams(asset, settings);
        
        if (!optimizationParams) {
          addLog(`Skipping asset ${asset.path}: No suitable optimization parameters found.`);
          skippedAssets.push({path: asset.path, url: asset.url, id: asset.id});
          skipped++;
          continue;
        }
        
        // Create URL with optimization parameters
        const optimizedUrl = `${asset.url}${optimizationParams}`;
        addLog(`Optimizing with parameters: ${optimizationParams}`);
        
        // Fetch the optimized image
        const response = await fetch(optimizedUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch optimized image: ${response.statusText}`);
        }
        
        const optimizedImageBlob = await response.blob();
        addLog(`Optimized image size: ${formatFileSize(optimizedImageBlob.size)}`);
        
        // Skip if optimized image is not smaller by the minimum reduction percentage
        const minimumSizeThreshold = asset.size * (1 - settings.minimumReduction / 100);
        if (optimizedImageBlob.size > minimumSizeThreshold) {
          addLog(`Skipping asset ${asset.path}: Optimization didn't achieve minimum ${settings.minimumReduction}% reduction.`);
          skippedAssets.push({path: asset.path, url: asset.url, id: asset.id});
          skipped++;
          continue;
        }
        
        // Upload the optimized image back to DatoCMS
        await client.uploads.createFromFileOrBlob({
          fileOrBlob: optimizedImageBlob,
          filename: asset.basename,
          onProgress: () => {
            // Progress callback can be used to update upload progress if needed
          },
          default_field_metadata: {
            en: { 
              alt: asset.alt || '',
              title: asset.title || '',
              custom_data: asset.customData || {}
            }
          },
          tags: asset.tags || []
        });
        
        addSizeComparisonLog(asset.path, asset.size, optimizedImageBlob.size);
        optimizedAssets.push({path: asset.path, url: asset.url, id: asset.id, originalSize: asset.size, optimizedSize: optimizedImageBlob.size});
        optimized++;
      } catch (error) {
        addLog(`Error optimizing asset ${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
        failedAssets.push({path: asset.path, url: asset.url, id: asset.id});
        failed++;
      }
    }

    // Ensure progress bar reaches 100%
    setProgress(100);

    // Return the final result
    return {
      optimized,
      skipped,
      failed,
      totalAssets: optimizableAssets.length,
      optimizedAssets,
      skippedAssets,
      failedAssets,
    };
  } catch (error) {
    addLog(`Error fetching assets: ${error instanceof Error ? error.message : String(error)}`);
    
    // Return the result with the error
    return {
      optimized,
      skipped,
      failed,
      totalAssets: 0,
      optimizedAssets,
      skippedAssets,
      failedAssets,
    };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
