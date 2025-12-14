// Global variables
let oc = null;
let currentShape = null;
let scene, camera, renderer, controls;

// Constants for OpenCascade library loading
const MAX_OPENCASCADE_LOAD_RETRIES = 50;
const OPENCASCADE_RETRY_INTERVAL_MS = 200;

// Initialize the application
async function init() {
    const loadingElement = document.getElementById('loading');
    try {
        // Wait for opencascadeWasm to be available
        // opencascadeWasm() is provided by the opencascade.wasm.js library loaded via CDN
        if (typeof opencascadeWasm === 'undefined') {
            console.log('Waiting for OpenCascade library to load...');
            loadingElement.textContent = 'Loading OpenCascade library...';
            
            // Wait for the library to load (max 10 seconds)
            for (let i = 0; i < MAX_OPENCASCADE_LOAD_RETRIES; i++) {
                await new Promise(resolve => setTimeout(resolve, OPENCASCADE_RETRY_INTERVAL_MS));
                if (typeof opencascadeWasm !== 'undefined') {
                    console.log(`OpenCascade library loaded after ${(i + 1) * OPENCASCADE_RETRY_INTERVAL_MS}ms`);
                    break;
                }
                if (i === MAX_OPENCASCADE_LOAD_RETRIES - 1) {
                    throw new Error('OpenCascade library did not load in time');
                }
            }
        }
        
        loadingElement.textContent = 'Initializing OpenCascade...';
        
        // Initialize OpenCascade
        const opencascade = await opencascadeWasm();
        oc = opencascade;
        console.log('OpenCascade initialized successfully');
        
        // Initialize Three.js for preview
        initThreeJS();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide loading message
        loadingElement.style.display = 'none';
        
        // Generate initial horn
        generateHorn();
    } catch (error) {
        console.error('Error initializing:', error);
        loadingElement.textContent = 'Error loading OpenCascade. Please refresh the page.';
    }
}

// Initialize Three.js scene
function initThreeJS() {
    const viewport = document.getElementById('viewport');
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f9fa);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 10000);
    camera.position.set(400, 300, 400);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    viewport.innerHTML = '';
    viewport.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    scene.add(directionalLight);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-100, -100, -100);
    scene.add(directionalLight2);
    
    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(1000, 20);
    scene.add(gridHelper);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const viewport = document.getElementById('viewport');
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

// Setup event listeners
function setupEventListeners() {
    // Update value displays
    const inputs = ['throatDiameter', 'mouthDiameter', 'targetFrequency', 'hornLength', 'segments'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        const display = document.getElementById(id + 'Value');
        input.addEventListener('input', () => {
            const unit = id === 'targetFrequency' ? ' Hz' : id === 'segments' ? '' : ' mm';
            display.textContent = input.value + unit;
        });
    });
    
    // Auto-calculate length checkbox
    document.getElementById('autoCalculateLength').addEventListener('change', (e) => {
        document.getElementById('hornLength').disabled = e.target.checked;
        if (e.target.checked) {
            updateCalculatedLength();
        }
    });
    
    // Update calculated length when frequency changes
    document.getElementById('targetFrequency').addEventListener('input', () => {
        if (document.getElementById('autoCalculateLength').checked) {
            updateCalculatedLength();
        }
    });
    
    // Generate button
    document.getElementById('generateBtn').addEventListener('click', generateHorn);
    
    // Download button
    document.getElementById('downloadBtn').addEventListener('click', downloadSTL);
}

// Update calculated length based on target frequency
function updateCalculatedLength() {
    const targetFreq = parseFloat(document.getElementById('targetFrequency').value);
    const throatDiameter = parseFloat(document.getElementById('throatDiameter').value);
    const mouthDiameter = parseFloat(document.getElementById('mouthDiameter').value);
    
    // Speed of sound in mm/s
    const speedOfSound = 343000; // mm/s
    
    // Calculate wavelength
    const wavelength = speedOfSound / targetFreq;
    
    // For exponential horn, calculate length based on expansion
    const expansionRatio = mouthDiameter / throatDiameter;
    const length = (wavelength / 4) * Math.log(expansionRatio);
    
    const calculatedLength = Math.max(50, Math.min(2000, Math.round(length)));
    document.getElementById('hornLength').value = calculatedLength;
    document.getElementById('hornLengthValue').textContent = calculatedLength + ' mm';
}

// Calculate horn profile points
function calculateHornProfile(type, throatRadius, mouthRadius, length, segments) {
    const points = [];
    
    if (type === 'exponential') {
        // Exponential horn: r(x) = r0 * exp(mx)
        // where m is the flare constant
        const flareConstant = Math.log(mouthRadius / throatRadius) / length;
        
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * length;
            const r = throatRadius * Math.exp(flareConstant * x);
            points.push({ x, r });
        }
    } else if (type === 'tractrix') {
        // Tractrix horn - a compromise between exponential and conical
        // Uses a modified exponential with smoothing factor
        const expansionRatio = mouthRadius / throatRadius;
        
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * length;
            const t = x / length; // Normalized position (0 to 1)
            
            // Base exponential expansion
            const baseR = throatRadius * Math.exp(t * Math.log(expansionRatio));
            
            // Apply tractrix-like smoothing to reduce flare at the mouth
            // This creates a more gradual transition at the throat
            const smoothingFactor = 0.3;
            const tractrixModifier = Math.sqrt(1 + (x / (length * smoothingFactor)) ** 2);
            const adjustedR = baseR / Math.pow(tractrixModifier, smoothingFactor);
            
            // Clamp to valid range
            const r = Math.max(throatRadius, Math.min(mouthRadius, adjustedR));
            points.push({ x, r });
        }
    }
    
    return points;
}

// Generate horn geometry
function generateHorn() {
    try {
        // Get parameters
        const hornType = document.getElementById('hornType').value;
        const throatDiameter = parseFloat(document.getElementById('throatDiameter').value);
        const mouthDiameter = parseFloat(document.getElementById('mouthDiameter').value);
        const targetFrequency = parseFloat(document.getElementById('targetFrequency').value);
        const hornLength = parseFloat(document.getElementById('hornLength').value);
        const segments = parseInt(document.getElementById('segments').value);
        
        const throatRadius = throatDiameter / 2;
        const mouthRadius = mouthDiameter / 2;
        
        // Calculate horn profile
        const profilePoints = calculateHornProfile(hornType, throatRadius, mouthRadius, hornLength, segments);
        
        // Update info panel
        updateInfoPanel(hornType, throatRadius, mouthRadius, hornLength, targetFrequency);
        
        // Try to use OpenCascade if available, otherwise use Three.js fallback
        if (oc) {
            // Create horn shape using OpenCascade
            const shape = createHornShape(profilePoints);
            
            if (shape) {
                currentShape = shape;
                renderShape(shape);
                document.getElementById('downloadBtn').disabled = false;
            } else {
                // Fallback to Three.js rendering
                console.warn('OpenCascade shape creation failed, using Three.js fallback');
                renderHornWithThreeJS(profilePoints);
                document.getElementById('downloadBtn').disabled = false;
            }
        } else {
            // Use Three.js fallback
            console.warn('OpenCascade not available, using Three.js fallback');
            renderHornWithThreeJS(profilePoints);
            document.getElementById('downloadBtn').disabled = false;
        }
    } catch (error) {
        console.error('Error generating horn:', error);
        alert('Error generating horn. Please check your parameters.');
    }
}

// Create horn shape using OpenCascade
function createHornShape(profilePoints) {
    try {
        // Create edges for the profile (horn surface)
        const profileEdges = [];
        
        for (let i = 0; i < profilePoints.length - 1; i++) {
            const pt1 = profilePoints[i];
            const pt2 = profilePoints[i + 1];
            
            const p1 = new oc.gp_Pnt_3(pt1.x, pt1.r, 0);
            const p2 = new oc.gp_Pnt_3(pt2.x, pt2.r, 0);
            
            const edge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2).Edge();
            profileEdges.push(edge);
        }
        
        // Create edges to close the profile
        const firstPt = profilePoints[0];
        const lastPt = profilePoints[profilePoints.length - 1];
        
        // Edge from throat opening to axis
        const throatEdge = new oc.BRepBuilderAPI_MakeEdge_3(
            new oc.gp_Pnt_3(firstPt.x, firstPt.r, 0),
            new oc.gp_Pnt_3(firstPt.x, 0, 0)
        ).Edge();
        
        // Edge along axis
        const axisEdge = new oc.BRepBuilderAPI_MakeEdge_3(
            new oc.gp_Pnt_3(firstPt.x, 0, 0),
            new oc.gp_Pnt_3(lastPt.x, 0, 0)
        ).Edge();
        
        // Edge from axis to mouth opening
        const mouthEdge = new oc.BRepBuilderAPI_MakeEdge_3(
            new oc.gp_Pnt_3(lastPt.x, 0, 0),
            new oc.gp_Pnt_3(lastPt.x, lastPt.r, 0)
        ).Edge();
        
        // Build wire from edges
        const wireMaker = new oc.BRepBuilderAPI_MakeWire_1();
        
        // Add profile edges
        for (const edge of profileEdges) {
            wireMaker.Add_1(edge);
        }
        
        // Add closing edges
        wireMaker.Add_1(mouthEdge);
        wireMaker.Add_1(axisEdge);
        wireMaker.Add_1(throatEdge);
        
        if (!wireMaker.IsDone()) {
            console.error('Failed to create wire');
            return null;
        }
        
        const wire = wireMaker.Wire();
        
        // Create face from wire
        const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, false);
        if (!faceMaker.IsDone()) {
            console.error('Failed to create face');
            return null;
        }
        const face = faceMaker.Face();
        
        // Revolve the profile around X-axis to create the horn
        const axis = new oc.gp_Ax1_2(
            new oc.gp_Pnt_3(0, 0, 0),
            new oc.gp_Dir_4(1, 0, 0)
        );
        const revolve = new oc.BRepPrimAPI_MakeRevol_1(face, axis, 2 * Math.PI, false);
        
        if (!revolve.IsDone()) {
            console.error('Failed to revolve face');
            return null;
        }
        
        const shape = revolve.Shape();
        
        console.log('Horn shape created successfully');
        return shape;
    } catch (error) {
        console.error('Error creating horn shape:', error);
        console.error('Error details:', error.message, error.stack);
        return null;
    }
}

// Render shape in Three.js
function renderShape(shape) {
    // Remove previous mesh
    const existingMesh = scene.getObjectByName('horn');
    if (existingMesh) {
        scene.remove(existingMesh);
    }
    
    try {
        // Triangulate the shape
        const triangulation = new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.1, false);
        
        // Extract mesh data
        const vertices = [];
        const indices = [];
        const normals = [];
        
        const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        
        while (explorer.More()) {
            const face = oc.TopoDS.Face_1(explorer.Current());
            const location = new oc.TopLoc_Location_1();
            const triangulationFace = oc.BRep_Tool.Triangulation(face, location);
            
            if (!triangulationFace.IsNull()) {
                const transformation = location.Transformation();
                const nodeCount = triangulationFace.NbNodes();
                const triangleCount = triangulationFace.NbTriangles();
                
                const indexOffset = vertices.length / 3;
                
                // Get vertices
                for (let i = 1; i <= nodeCount; i++) {
                    const node = triangulationFace.Node(i);
                    const transformed = node.Transformed(transformation);
                    vertices.push(transformed.X(), transformed.Y(), transformed.Z());
                    normals.push(0, 0, 0); // Will be computed later
                }
                
                // Get triangles
                for (let i = 1; i <= triangleCount; i++) {
                    const triangle = triangulationFace.Triangle(i);
                    let i1 = triangle.Value(1) - 1 + indexOffset;
                    let i2 = triangle.Value(2) - 1 + indexOffset;
                    let i3 = triangle.Value(3) - 1 + indexOffset;
                    
                    // Check face orientation
                    const orientation = face.Orientation_1();
                    if (orientation === oc.TopAbs_Orientation.TopAbs_REVERSED) {
                        [i2, i3] = [i3, i2];
                    }
                    
                    indices.push(i1, i2, i3);
                }
            }
            
            explorer.Next();
        }
        
        // Create Three.js geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Create material
        const material = new THREE.MeshPhongMaterial({
            color: 0x667eea,
            specular: 0x111111,
            shininess: 30,
            side: THREE.DoubleSide
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'horn';
        scene.add(mesh);
        
        // Add wireframe
        const wireframeGeometry = new THREE.EdgesGeometry(geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1, opacity: 0.1, transparent: true });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        mesh.add(wireframe);
        
        // Center camera on the horn
        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        
        controls.target.copy(center);
        camera.position.set(center.x + size.x * 1.5, center.y + size.y * 1.5, center.z + size.z * 1.5);
        
    } catch (error) {
        console.error('Error rendering shape:', error);
    }
}

// Fallback: Render horn using Three.js directly (without OpenCascade)
function renderHornWithThreeJS(profilePoints) {
    // Remove previous mesh
    const existingMesh = scene.getObjectByName('horn');
    if (existingMesh) {
        scene.remove(existingMesh);
    }
    
    try {
        const vertices = [];
        const indices = [];
        const radialSegments = 64; // Number of segments around the horn
        
        // Generate vertices for each profile point
        for (let i = 0; i < profilePoints.length; i++) {
            const point = profilePoints[i];
            
            for (let j = 0; j <= radialSegments; j++) {
                const theta = (j / radialSegments) * Math.PI * 2;
                const x = point.x;
                const y = Math.cos(theta) * point.r;
                const z = Math.sin(theta) * point.r;
                
                vertices.push(x, y, z);
            }
        }
        
        // Generate indices for the triangles
        for (let i = 0; i < profilePoints.length - 1; i++) {
            for (let j = 0; j < radialSegments; j++) {
                const a = i * (radialSegments + 1) + j;
                const b = a + radialSegments + 1;
                const c = a + 1;
                const d = b + 1;
                
                // Two triangles per quad
                indices.push(a, b, c);
                indices.push(c, b, d);
            }
        }
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Create material
        const material = new THREE.MeshPhongMaterial({
            color: 0x667eea,
            specular: 0x111111,
            shininess: 30,
            side: THREE.DoubleSide
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'horn';
        scene.add(mesh);
        
        // Add wireframe
        const wireframeGeometry = new THREE.EdgesGeometry(geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({ 
            color: 0x000000, 
            linewidth: 1, 
            opacity: 0.1, 
            transparent: true 
        });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        mesh.add(wireframe);
        
        // Store geometry for STL export
        mesh.userData.geometry = geometry;
        
        // Center camera on the horn
        const boundingBox = new THREE.Box3().setFromObject(mesh);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        
        controls.target.copy(center);
        camera.position.set(center.x + size.x * 1.5, center.y + size.y * 1.5, center.z + size.z * 1.5);
        
        console.log('Horn rendered using Three.js fallback');
    } catch (error) {
        console.error('Error rendering horn with Three.js:', error);
    }
}

// Update info panel
function updateInfoPanel(hornType, throatRadius, mouthRadius, length, targetFreq) {
    const speedOfSound = 343000; // mm/s
    const cutoffFreq = speedOfSound / (4 * length);
    
    const expansionRatio = mouthRadius / throatRadius;
    const flareConstant = Math.log(expansionRatio) / length;
    
    // Calculate approximate volume (numerical integration using exponential approximation)
    let volume = 0;
    const steps = 100;
    for (let i = 0; i < steps; i++) {
        const x = (i / steps) * length;
        const r = throatRadius * Math.exp(flareConstant * x);
        volume += Math.PI * r * r * (length / steps);
    }
    volume = volume / 1000; // Convert to cm³
    
    document.getElementById('cutoffFreq').textContent = cutoffFreq.toFixed(1);
    document.getElementById('expansionRate').textContent = flareConstant.toFixed(6);
    document.getElementById('volume').textContent = volume.toFixed(1);
}

// Download STL
function downloadSTL() {
    try {
        // Try OpenCascade export first
        if (currentShape && oc) {
            downloadSTLOpenCascade();
        } else {
            // Fallback to Three.js export
            downloadSTLThreeJS();
        }
    } catch (error) {
        console.error('Error downloading STL:', error);
        alert('Error exporting STL. Please try again.');
    }
}

// Download STL using OpenCascade
function downloadSTLOpenCascade() {
    try {
        // Write STL
        const stlWriter = new oc.StlAPI_Writer_1();
        const filename = 'horn.stl';
        
        // Write to virtual filesystem
        stlWriter.Write_2(currentShape, filename, true);
        
        // Read from virtual filesystem
        const stlData = oc.FS.readFile('/' + filename);
        
        // Create blob and download
        const blob = new Blob([stlData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Clean up
        oc.FS.unlink('/' + filename);
        
        console.log('STL downloaded successfully (OpenCascade)');
    } catch (error) {
        console.error('Error with OpenCascade STL export:', error);
        throw error;
    }
}

// Download STL using Three.js geometry
function downloadSTLThreeJS() {
    const hornMesh = scene.getObjectByName('horn');
    
    if (!hornMesh || !hornMesh.geometry) {
        alert('Please generate a horn first');
        return;
    }
    
    try {
        const geometry = hornMesh.geometry;
        
        // Generate STL file content
        let stlString = 'solid horn\n';
        
        const vertices = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;
        const normals = geometry.attributes.normal.array;
        
        if (indices) {
            // Indexed geometry
            for (let i = 0; i < indices.length; i += 3) {
                const i1 = indices[i] * 3;
                const i2 = indices[i + 1] * 3;
                const i3 = indices[i + 2] * 3;
                
                const n = i1; // Use first vertex normal for the facet
                
                stlString += `  facet normal ${normals[n]} ${normals[n + 1]} ${normals[n + 2]}\n`;
                stlString += '    outer loop\n';
                stlString += `      vertex ${vertices[i1]} ${vertices[i1 + 1]} ${vertices[i1 + 2]}\n`;
                stlString += `      vertex ${vertices[i2]} ${vertices[i2 + 1]} ${vertices[i2 + 2]}\n`;
                stlString += `      vertex ${vertices[i3]} ${vertices[i3 + 1]} ${vertices[i3 + 2]}\n`;
                stlString += '    endloop\n';
                stlString += '  endfacet\n';
            }
        } else {
            // Non-indexed geometry
            for (let i = 0; i < vertices.length; i += 9) {
                const n = i;
                
                stlString += `  facet normal ${normals[n]} ${normals[n + 1]} ${normals[n + 2]}\n`;
                stlString += '    outer loop\n';
                stlString += `      vertex ${vertices[i]} ${vertices[i + 1]} ${vertices[i + 2]}\n`;
                stlString += `      vertex ${vertices[i + 3]} ${vertices[i + 4]} ${vertices[i + 5]}\n`;
                stlString += `      vertex ${vertices[i + 6]} ${vertices[i + 7]} ${vertices[i + 8]}\n`;
                stlString += '    endloop\n';
                stlString += '  endfacet\n';
            }
        }
        
        stlString += 'endsolid horn\n';
        
        // Create blob and download
        const blob = new Blob([stlString], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'horn.stl';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('STL downloaded successfully (Three.js)');
    } catch (error) {
        console.error('Error with Three.js STL export:', error);
        throw error;
    }
}

// Initialize Three.js OrbitControls (inline to avoid external dependency)
THREE.OrbitControls = function(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3();
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    
    let spherical = new THREE.Spherical();
    let sphericalDelta = new THREE.Spherical();
    let scale = 1;
    let panOffset = new THREE.Vector3();
    let zoomChanged = false;
    
    const rotateStart = new THREE.Vector2();
    const rotateEnd = new THREE.Vector2();
    const rotateDelta = new THREE.Vector2();
    const panStart = new THREE.Vector2();
    const panEnd = new THREE.Vector2();
    const panDelta = new THREE.Vector2();
    
    const STATE = { NONE: -1, ROTATE: 0, DOLLY: 1, PAN: 2 };
    let state = STATE.NONE;
    
    const onMouseDown = (event) => {
        event.preventDefault();
        if (event.button === 0) {
            state = STATE.ROTATE;
            rotateStart.set(event.clientX, event.clientY);
        } else if (event.button === 2) {
            state = STATE.PAN;
            panStart.set(event.clientX, event.clientY);
        }
        domElement.addEventListener('mousemove', onMouseMove);
        domElement.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = (event) => {
        event.preventDefault();
        if (state === STATE.ROTATE) {
            rotateEnd.set(event.clientX, event.clientY);
            rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(0.005);
            sphericalDelta.theta -= rotateDelta.x;
            sphericalDelta.phi -= rotateDelta.y;
            rotateStart.copy(rotateEnd);
        } else if (state === STATE.PAN) {
            panEnd.set(event.clientX, event.clientY);
            panDelta.subVectors(panEnd, panStart).multiplyScalar(0.5);
            pan(panDelta.x, panDelta.y);
            panStart.copy(panEnd);
        }
    };
    
    const onMouseUp = () => {
        state = STATE.NONE;
        domElement.removeEventListener('mousemove', onMouseMove);
        domElement.removeEventListener('mouseup', onMouseUp);
    };
    
    const onMouseWheel = (event) => {
        event.preventDefault();
        if (event.deltaY < 0) {
            scale *= 0.95;
        } else {
            scale *= 1.05;
        }
        zoomChanged = true;
    };
    
    const pan = (deltaX, deltaY) => {
        const offset = new THREE.Vector3();
        const position = camera.position.clone();
        offset.copy(position).sub(this.target);
        let targetDistance = offset.length();
        targetDistance *= Math.tan((camera.fov / 2) * Math.PI / 180.0);
        panLeft(2 * deltaX * targetDistance / domElement.clientHeight, camera.matrix);
        panUp(2 * deltaY * targetDistance / domElement.clientHeight, camera.matrix);
    };
    
    const panLeft = (distance, objectMatrix) => {
        const v = new THREE.Vector3();
        v.setFromMatrixColumn(objectMatrix, 0);
        v.multiplyScalar(-distance);
        panOffset.add(v);
    };
    
    const panUp = (distance, objectMatrix) => {
        const v = new THREE.Vector3();
        v.setFromMatrixColumn(objectMatrix, 1);
        v.multiplyScalar(distance);
        panOffset.add(v);
    };
    
    this.update = () => {
        const offset = new THREE.Vector3();
        const position = camera.position;
        
        offset.copy(position).sub(this.target);
        spherical.setFromVector3(offset);
        
        spherical.theta += sphericalDelta.theta;
        spherical.phi += sphericalDelta.phi;
        spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
        
        if (zoomChanged) {
            spherical.radius *= scale;
            zoomChanged = false;
            scale = 1;
        }
        
        offset.setFromSpherical(spherical);
        position.copy(this.target).add(offset);
        camera.lookAt(this.target);
        
        if (this.enableDamping) {
            sphericalDelta.theta *= (1 - this.dampingFactor);
            sphericalDelta.phi *= (1 - this.dampingFactor);
        } else {
            sphericalDelta.set(0, 0, 0);
        }
        
        this.target.add(panOffset);
        panOffset.multiplyScalar(this.enableDamping ? (1 - this.dampingFactor) : 0);
    };
    
    domElement.addEventListener('mousedown', onMouseDown);
    domElement.addEventListener('wheel', onMouseWheel);
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
};

// Start the application
document.addEventListener('DOMContentLoaded', init);
