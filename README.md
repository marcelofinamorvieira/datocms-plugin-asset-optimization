# DatoCMS Asset Optimization Plugin

A plugin that allows you to mass apply optimizations to your DatoCMS assets, significantly reducing image file sizes while maintaining visual quality.

![Asset Optimization Plugin Cover](docs/cover-1200x800.png)

## Overview

The DatoCMS Asset Optimization Plugin leverages Imgix's powerful image processing capabilities to optimize your media library assets. It helps you:

- Reduce image file sizes without sacrificing quality
- Apply batch optimization to multiple assets
- Configure quality levels based on asset sizes
- Convert images to modern formats like AVIF or WebP
- Track optimization progress with detailed logs
- View statistics on storage savings

## Installation

### From the DatoCMS Marketplace

1. Log in to your DatoCMS project
2. Go to Settings > Plugins
3. Search for "Asset Optimization"
4. Click "Install"
5. Configure the plugin settings as desired

### Manual Installation

1. Clone this repository: `git clone https://github.com/marcelofinamorvieira/datocms-plugin-asset-optimization.git`
2. Navigate to the project directory: `cd datocms-plugin-asset-optimization`
3. Install dependencies: `npm install`
4. Build the plugin: `npm run build`
5. Create a new DatoCMS plugin entry in your project settings
6. Upload the build files from the `dist` directory

## Usage

1. After installation, navigate to the plugin in your DatoCMS dashboard
2. Configure the optimization settings according to your needs
3. Click "Start Optimization" to begin the process
4. Watch the progress as the plugin processes your assets
5. View the results including statistics on size savings

## Key Features

### Asset Filtering & Optimization

- **Size-Based Filtering**: Only process assets above a certain size threshold
- **Intelligent Optimization**: Apply different optimization strategies based on asset size categories
- **Format Conversion**: Convert images to modern formats like AVIF for better compression
- **Dimension Resizing**: Automatically resize oversized images while maintaining aspect ratio

### Optimization Settings

- **Large Asset Threshold**: Define what size (in MB) is considered a "large" asset
- **Very Large Asset Threshold**: Define what size (in MB) is considered a "very large" asset
- **Quality Settings**: Configure different quality levels for large vs. very large assets
- **Resize Dimensions**: Set maximum dimensions for resizing large and very large images
- **Minimum Reduction**: Only replace assets if optimization achieves at least this percentage of size reduction
- **Format Options**: Choose target format (AVIF, WebP, etc.) or preserve original formats

### Advanced Settings

- **Auto Compress**: Enable Imgix's automatic compression
- **DPR Settings**: Apply device pixel ratio adjustments for high-resolution displays
- **Lossless Option**: Enable lossless compression when needed
- **Chroma Subsampling**: Control chroma subsampling for JPEG-based formats
- **Color Profile Preservation**: Maintain original color profiles for accurate color reproduction

## Use Cases

### Website Performance Optimization

- Reduce page load times by decreasing image payload sizes
- Improve Core Web Vitals scores with optimized images
- Enhance mobile experience with appropriately sized images

### Storage Cost Reduction

- Minimize storage usage in your DatoCMS media library
- Reduce CDN bandwidth consumption
- Lower operating costs while maintaining quality

### Batch Processing

- Mass-update existing media libraries with optimized assets
- Apply consistent optimization settings across your entire asset collection
- Save time compared to manual optimization workflows

## Technical Implementation

This plugin uses:

- DatoCMS Plugin SDK for integration with your CMS environment
- Imgix URL parameters for high-quality image optimization
- React with TypeScript for a type-safe, modern UI
- DatoCMS React UI components for consistent styling

## Development

### Prerequisites

- Node.js (v14+)
- npm or yarn
- DatoCMS account with developer access

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the development server: `npm run dev`
4. Configure a local DatoCMS plugin in your project settings pointing to your local server

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment.

## Support

If you encounter any issues or have questions about the plugin, please [open an issue](https://github.com/marcelofinamorvieira/datocms-plugin-asset-optimization/issues) on GitHub.

## License

MIT