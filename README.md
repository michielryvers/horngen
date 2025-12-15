# Horn Generator

A web-based speaker horn generator using OpenCascade.js for 3D modeling and visualization.

## Features

- **Multiple Horn Types**: Generate exponential and tractrix horn profiles
- **Customizable Parameters**:
  - Throat diameter (driver mounting size)
  - Mouth diameter (horn opening)
  - Target frequency (automatic length calculation)
  - Manual length control
  - Adjustable segment quality
- **Live 3D Preview**: Real-time visualization using Three.js
- **STL Export**: Download generated horns as STL files for 3D printing or CNC machining
- **Freestanding Design**: Horns are generated as complete solid models

## Usage

### Online

Visit the [live application](https://michielryvers.github.io/horngen/)

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:5173 in a modern web browser

### Building for Production

To build the project for deployment:
```bash
npm run build
```

The built files will be in the `dist/` directory.

### Using the Application

1. Adjust the horn parameters in the control panel
2. Click "Generate Horn" to create the 3D model
3. Use mouse controls to interact with the preview:
   - Left-click and drag to rotate
   - Right-click and drag to pan
   - Scroll to zoom
4. Click "Download STL" to export the model

## Horn Types

### Exponential Horn
An exponential horn has a cross-sectional area that increases exponentially along its length. This provides a smooth, constant expansion rate ideal for wide frequency response.

### Tractrix Horn
A tractrix horn follows a mathematically derived curve that provides constant acoustic impedance. This design is often preferred for its smooth response characteristics.

## Parameters

- **Throat Diameter**: The diameter of the horn at the driver mounting point (typically matches the driver's exit diameter)
- **Mouth Diameter**: The diameter of the horn's opening
- **Target Frequency**: The cutoff frequency for the horn; enables automatic length calculation
- **Horn Length**: The axial length of the horn (can be auto-calculated from target frequency)
- **Segments**: Number of segments used to approximate the horn curve (higher = smoother but slower)

## Technical Details

The application uses:
- **OpenCascade.js**: For CAD-quality 3D geometry generation (installed via npm)
- **Three.js**: For real-time 3D visualization (installed via npm)
- **Vite**: For bundling and development server
- **GitHub Pages**: For static site hosting

All calculations are performed in the browser, with no server-side processing required.

## Development

The project consists of:
- `index.html`: Main application page
- `styles.css`: Styling and layout
- `main.js`: Application logic, horn calculations, and 3D rendering
- `package.json`: NPM dependencies and build scripts
- `vite.config.js`: Vite bundler configuration
- `.github/workflows/pages.yml`: GitHub Pages deployment configuration

### Build System

The project uses Vite as its build system. OpenCascade.js and Three.js are installed from npm and bundled together with the application code. The WASM files required by OpenCascade.js are copied to the public directory and served alongside the application.

## License

MIT License - feel free to use and modify for your projects.
