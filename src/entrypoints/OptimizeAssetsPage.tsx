import type { RenderPageCtx } from 'datocms-plugin-sdk';
import { Canvas } from 'datocms-react-ui';
import { buildClient } from '@datocms/cma-client-browser';
import type { SimpleSchemaTypes } from '@datocms/cma-client-browser';
import { useState, useEffect } from 'react';

import s from './styles.module.css';

// Import components
import SettingsForm from '../components/asset-optimization/SettingsForm';
import ActivityLog, { type LogEntry } from '../components/asset-optimization/ActivityLog';
import ProgressIndicator from '../components/asset-optimization/ProgressIndicator';
import ResultsStats from '../components/asset-optimization/ResultsStats';
import AssetList from '../components/asset-optimization/AssetList';

// Import types and utilities from shared utils file
import type { AssetOptimizerResult, Asset, OptimizationSettings, OptimizedAsset, ProcessedAsset } from '../utils/optimizationUtils';
import { defaultSettings, getOptimizationParams } from '../utils/optimizationUtils';
import { formatFileSize } from '../utils/formatters';
import replaceAssetFromUrl from '../utils/assetReplacer';

/**
 * Convert DatoCMS Upload object to our internal Asset type
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

/**
 * Convert Asset to ProcessedAsset type
 */
function assetToProcessedAsset(asset: Asset): ProcessedAsset {
  return {
    id: asset.id,
    path: asset.path,
    url: asset.url
  };
}

/**
 * Convert Asset to OptimizedAsset type with size information
 */
function assetToOptimizedAsset(asset: Asset, originalSize: number, optimizedSize: number): OptimizedAsset {
  return {
    id: asset.id,
    path: asset.path,
    url: asset.url,
    originalSize,
    optimizedSize
  };
}

type Props = {
  ctx: RenderPageCtx;
};

/**
 * OptimizeAssetsPage component - main entrypoint for the asset optimization plugin
 * 
 * This component allows users to configure and run asset optimization processes
 * for DatoCMS media library assets.
 * 
 * @param ctx - DatoCMS plugin context
 */
const OptimizeAssetsPage = ({ ctx }: Props) => {
  // UI state management
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<AssetOptimizerResult | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<OptimizationSettings>({ ...defaultSettings });
  const [currentAsset, setCurrentAsset] = useState<Asset | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<'optimized' | 'skipped' | 'failed' | null>(null);

  // Load saved settings from plugin parameters on component mount
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        // Access parameters from ctx.plugin.attributes.parameters as advised by the user
        const parameters = ctx.plugin.attributes.parameters;
        if (parameters && typeof parameters.optimization_settings === 'string') {
          try {
            const savedSettings = JSON.parse(parameters.optimization_settings);
            setSettings(savedSettings);
            console.log('Loaded settings from plugin parameters:', savedSettings);
          } catch (parseError) {
            console.error('Error parsing saved settings:', parseError);
          }
        } else {
          console.log('No saved settings found, using defaults');
        }
      } catch (error) {
        console.error('Error accessing plugin parameters:', error);
      }
    };
    
    loadSavedSettings();
  }, [ctx]);

  // Add beforeunload event listener to prevent accidental navigation during optimization
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isOptimizing) {
        // Standard way to show a confirmation dialog
        const message = 'Optimization is in progress. Leaving the page now may cause you to lose assets! Are you sure you want to leave?';
        event.preventDefault();
        event.returnValue = message; // This is required for Chrome
        return message; // For other browsers
      }
    };

    // Add the event listener
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOptimizing]); // Only re-run when isOptimizing changes

  const addLog = (message: string) => {
    setLogEntries((prevLog) => [{ text: `[${new Date().toISOString()}] ${message}` }, ...prevLog]);
  };

  const addSizeComparisonLog = (assetPath: string, originalSize: number, optimizedSize: number) => {
    const sizeDifference = originalSize - optimizedSize;
    const savingsPercentage = Math.round((sizeDifference / originalSize) * 100);
    
    setLogEntries((prevLog) => [{ 
      text: `[${new Date().toISOString()}] Successfully optimized asset: ${assetPath} `,
      originalSize,
      optimizedSize,
      savingsPercentage
    }, ...prevLog]);
  };

  /**
   * Start the optimization process
   */
  const startOptimization = async () => {
    try {
      // Reset any previous results
      resetState();
      setIsOptimizing(true);
      addLog('Starting asset optimization process...');
      
      // Create DatoCMS client
      const client = buildClient({
        apiToken: ctx.currentUserAccessToken ?? '',
      });
      
      // Fetch all assets from DatoCMS
      addLog('Fetching assets from DatoCMS...');
      
      // Calculate size threshold in bytes (convert MB to bytes)
      const largeAssetThresholdBytes = settings.largeAssetThreshold * 1024 * 1024;
      
      // Use listPagedIterator to properly retrieve all uploads with pagination
      const optimizableAssets: Asset[] = [];
      let assetCount = 0;
      
      // Iterate through all pages of upload results with size filter
      for await (const upload of client.uploads.listPagedIterator({
        filter: {
          fields: {
            type: {
              eq: "image"
            },
            size: {
              gte: largeAssetThresholdBytes
            }
          }
        }
      })) {
        assetCount++;
        // We can now skip the size check since we're filtering by API
        optimizableAssets.push(uploadToAsset(upload));
      }
      
      addLog(`Found ${assetCount} assets larger than ${settings.largeAssetThreshold}MB.`);
      addLog(`Found ${optimizableAssets.length} optimizable images.`);
      setTotal(optimizableAssets.length);
      
      // Initialize counters and arrays for optimization results
      let optimized = 0;
      let skipped = 0;
      let failed = 0;
      const optimizedAssets: OptimizedAsset[] = [];
      const skippedAssets: ProcessedAsset[] = [];
      const failedAssets: ProcessedAsset[] = [];
      let originalSizeTotal = 0;
      let optimizedSizeTotal = 0;
      
      // Process each asset that needs optimization
      for (let i = 0; i < optimizableAssets.length; i++) {
        const asset = optimizableAssets[i];
        setCurrent(i + 1);
        setCurrentAsset(asset);
        
        try {
          addLog(`Processing asset: ${asset.path} (${formatFileSize(asset.size)})`);
          originalSizeTotal += asset.size;
          
          // Determine optimization parameters based on image type and size
          const optimizationParams = getOptimizationParams(asset, settings);
          
          if (!optimizationParams) {
            addLog(`Skipping asset ${asset.path}: No suitable optimization parameters found.`);
            skippedAssets.push(assetToProcessedAsset(asset));
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
            addLog(`Optimization not significant enough for ${asset.path}. Skipping.`);
            skippedAssets.push(assetToProcessedAsset(asset));
            skipped++;
            continue;
          }
          
          // Replace the original asset with the optimized one using the DatoCMS API
          addLog(`Replacing asset ${asset.path}...`);
          
          try {
            // Get the API token from the context
            const apiToken = ctx.currentUserAccessToken;
            if (!apiToken) {
              throw new Error('Failed to get API token');
            }
            
            // Create a URL for the optimized image
            const optimizedUrl = `${asset.url}${optimizationParams}`;
            
            // Use our asset replacement utility to properly replace the asset
            await replaceAssetFromUrl(
              asset.id,
              optimizedUrl,
              apiToken,
              asset.basename
            );
            
            // Add to optimized assets list
            optimizedAssets.push(assetToOptimizedAsset(asset, asset.size, optimizedImageBlob.size));
            optimizedSizeTotal += optimizedImageBlob.size;
            optimized++;
            
            // Log the size comparison information
            addSizeComparisonLog(asset.path, asset.size, optimizedImageBlob.size);
            addLog(`Successfully replaced asset ${asset.path}`);
          } catch (error) {
            addLog(`Error replacing asset: ${error instanceof Error ? error.message : String(error)}`);
            failedAssets.push(assetToProcessedAsset(asset));
            failed++;
          }
        } catch (error) {
          addLog(`Error optimizing asset ${asset.path}: ${error instanceof Error ? error.message : String(error)}`);
          failedAssets.push(assetToProcessedAsset(asset));
          failed++;
        }
      }
      
      setResult({
        optimized,
        skipped,
        failed,
        totalAssets: assetCount,
        optimizedAssets,
        skippedAssets,
        failedAssets
      });
      
      // Set overall processing stats
      addLog(`Optimization complete. Optimized: ${optimized}, Skipped: ${skipped}, Failed: ${failed}`);
      if (optimized > 0) {
        addLog(`Total size savings: ${formatFileSize(originalSizeTotal - optimizedSizeTotal)} (${Math.round((originalSizeTotal - optimizedSizeTotal) / originalSizeTotal * 100)}%)`);
      }
      
      addLog('Asset optimization process completed!');
      ctx.notice('Asset optimization process completed!');
      
    } catch (error) {
      addLog(`Error during optimization process: ${error instanceof Error ? error.message : String(error)}`);
      ctx.alert(`Error during optimization process: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsOptimizing(false);
    }
  };
  
  const resetState = () => {
    setResult(null);
    setLogEntries([]);
    setCurrent(0);
    setTotal(0);
    setCurrentAsset(undefined);
  };

  return (
    <Canvas ctx={ctx}>
      <div className={s.container}>
        <h1 className={s.title}>Asset Optimization</h1>
        
        {/* Settings Form */}
        {!isOptimizing && !result && (
          <div className={s.settingsContainer}>
            <SettingsForm 
              settings={settings} 
              onSettingsChange={setSettings} 
              onStartOptimization={startOptimization}
              ctx={ctx}
            />
          </div>
        )}
        
        {/* Progress Indicator */}
        <ProgressIndicator 
          current={current} 
          total={total} 
          isVisible={isOptimizing}
          assetSizeCategory={settings.veryLargeAssetThreshold > 0 ? 'large and very large' : 'large'}
          currentAsset={currentAsset}
        />
        
        {/* Results Statistics */}
        {result && (
          <>
            <ResultsStats 
              result={result}
              setSelectedCategory={setSelectedCategory}
              resetState={resetState}
              largeAssetThreshold={settings.largeAssetThreshold}
            />
            
            {/* Asset List showing optimized/skipped/failed assets */}
            {selectedCategory && (
              <AssetList 
                assets={selectedCategory === 'optimized' ? result.optimizedAssets :
                        selectedCategory === 'skipped' ? result.skippedAssets :
                        result.failedAssets}
                category={selectedCategory}
                onClose={() => setSelectedCategory(null)}
                ctx={ctx}
              />
            )}
          </>
        )}
        
        {/* Activity Log */}
        <ActivityLog log={logEntries} />
      </div>
    </Canvas>
  );
};

export default OptimizeAssetsPage;
