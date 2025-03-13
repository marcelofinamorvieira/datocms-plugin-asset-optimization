import type { ReactElement } from 'react';
import s from '../../entrypoints/styles.module.css';
import { Spinner } from 'datocms-react-ui';
import type { Asset } from '../../utils/optimizationUtils';

interface ProgressIndicatorProps {
  current: number;
  total: number;
  isVisible: boolean;
  assetSizeCategory?: string; // Category of assets being processed (large, very large)
  currentAsset?: Asset; // Current asset being processed
}

/**
 * ProgressIndicator component displays progress during asset optimization
 * 
 * @param current - Current progress value
 * @param total - Total number of assets to process
 * @param isVisible - Whether the progress indicator should be visible
 * @param assetSizeCategory - Category of assets being processed (large, very large)
 * @param currentAsset - The current asset being processed
 * @returns Rendered progress bar or null if not visible
 */
const ProgressIndicator = ({ 
  current, 
  total, 
  isVisible,
  assetSizeCategory = 'large',
  currentAsset
}: ProgressIndicatorProps): ReactElement | null => {
  if (!isVisible) return null;
  
  // Ensure percentage is calculated correctly and bounded to 0-100
  const percentage = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
  
  return (
    <div className={s.optimizingContainer}>
      {currentAsset && (
        <div className={s.currentAssetPreview}>
          <div className={s.assetPreviewImage}>
            <img 
              src={`${currentAsset.url}?w=120&h=80&fit=crop&auto=format`} 
              alt={currentAsset.basename} 
            />
          </div>
          <div className={s.assetPreviewInfo}>
            <div className={s.assetPreviewTitle}>{currentAsset.basename}</div>
            <div className={s.assetPreviewMeta}>
              {currentAsset.path.split('.').pop()?.toUpperCase()} • {(currentAsset.size / (1024 * 1024)).toFixed(2)} MB • {currentAsset.width}×{currentAsset.height}px
            </div>
          </div>
        </div>
      )}
      <div className={s.statusText}>
        <Spinner size={16} /> <span>Processing {assetSizeCategory} assets: {current} of {total}</span>
      </div>
      <div className={s.percentageText}>
        <span>{percentage}%</span>
      </div>
      <div className={s.progressBar}>
        <div 
          className={s.progressBarFill} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressIndicator;
