// Global variables
let oc = null;
let currentShape = null;
let scene, camera, renderer, controls;

// Initialize the application
async function init() {
    try {
        // Initialize OpenCascade
        const opencascade = await opencascadeWasm();
        oc = opencascade;
        console.log('OpenCascade initialized successfully');
        
        // Initialize Three.js for preview
        initThreeJS();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide loading message
        document.getElementById('loading').style.display = 'none';
        
        // Generate initial horn
        generateHorn();
    } catch (error) {
        console.error('Error initializing:', error);
        document.getElementById('loading').textContent = 'Error loading OpenCascade. Please refresh the page.';
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
        const m = Math.log(mouthRadius / throatRadius) / length;
        
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * length;
            const r = throatRadius * Math.exp(m * x);
            points.push({ x, r });
        }
    } else if (type === 'tractrix') {
        // Tractrix horn
        const m = 0.00001; // Small value to avoid singularity at throat
        const rm = mouthRadius;
        const rt = throatRadius;
        
        // Calculate tractrix parameter
        const a = length / (Math.acosh(rm / rt) - Math.sqrt((rm / rt) ** 2 - 1) + Math.sqrt((rt / rm) ** 2 - 1) + 1);
        
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * length;
            
            // Tractrix equation (approximation for practical horn design)
            const t = x / length;
            const r = rt * Math.exp((t * Math.log(rm / rt)));
            
            // Add tractrix curve adjustment
            const tractrixFactor = Math.sqrt(1 + (x / (length * 0.3)) ** 2);
            const adjustedR = r / Math.pow(tractrixFactor, 0.3);
            
            points.push({ x, r: Math.max(rt, Math.min(rm, adjustedR)) });
        }
    }
    
    return points;
}

// Generate horn geometry
function generateHorn() {
    if (!oc) {
        console.error('OpenCascade not initialized');
        return;
    }
    
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
        
        // Create horn shape using OpenCascade
        const shape = createHornShape(profilePoints);
        
        if (shape) {
            currentShape = shape;
            
            // Update info panel
            updateInfoPanel(hornType, throatRadius, mouthRadius, hornLength, targetFrequency);
            
            // Render the shape
            renderShape(shape);
            
            // Enable download button
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
        // Create points and build a spline through them
        const points = new oc.TColgp_Array1OfPnt_2(1, profilePoints.length);
        
        for (let i = 0; i < profilePoints.length; i++) {
            const pt = profilePoints[i];
            const point = new oc.gp_Pnt_3(pt.x, 0, 0);
            points.SetValue(i + 1, point);
        }
        
        // Create BSpline curve
        const spline = new oc.GeomAPI_PointsToBSpline_2(points, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1.0e-3);
        const curve = spline.Curve();
        
        // Create edges for the profile
        const edges = new oc.TopTools_ListOfShape_1();
        
        for (let i = 0; i < profilePoints.length - 1; i++) {
            const pt1 = profilePoints[i];
            const pt2 = profilePoints[i + 1];
            
            const p1 = new oc.gp_Pnt_3(pt1.x, pt1.r, 0);
            const p2 = new oc.gp_Pnt_3(pt2.x, pt2.r, 0);
            
            const edge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2).Edge();
            edges.Append_1(edge);
        }
        
        // Close the profile at throat
        const firstPt = profilePoints[0];
        const p1 = new oc.gp_Pnt_3(firstPt.x, firstPt.r, 0);
        const p2 = new oc.gp_Pnt_3(firstPt.x, 0, 0);
        const closingEdge1 = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2).Edge();
        edges.Append_1(closingEdge1);
        
        // Close at axis
        const lastPt = profilePoints[profilePoints.length - 1];
        const p3 = new oc.gp_Pnt_3(lastPt.x, 0, 0);
        const p4 = new oc.gp_Pnt_3(lastPt.x, lastPt.r, 0);
        const closingEdge2 = new oc.BRepBuilderAPI_MakeEdge_3(p3, p4).Edge();
        edges.Append_1(closingEdge2);
        
        // Build wire from edges
        const wireMaker = new oc.BRepBuilderAPI_MakeWire_1();
        const edgeIterator = edges.Iterator_1();
        while (edgeIterator.More()) {
            wireMaker.Add_2(oc.TopoDS.Edge_1(edgeIterator.Value()));
            edgeIterator.Next();
        }
        const wire = wireMaker.Wire();
        
        // Create face from wire
        const face = new oc.BRepBuilderAPI_MakeFace_15(wire, false).Face();
        
        // Revolve the profile around X-axis to create the horn
        const axis = new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0));
        const revolve = new oc.BRepPrimAPI_MakeRevol_1(face, axis, 2 * Math.PI, false);
        const shape = revolve.Shape();
        
        return shape;
    } catch (error) {
        console.error('Error creating horn shape:', error);
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

// Update info panel
function updateInfoPanel(hornType, throatRadius, mouthRadius, length, targetFreq) {
    const speedOfSound = 343000; // mm/s
    const cutoffFreq = speedOfSound / (4 * length);
    
    const expansionRatio = mouthRadius / throatRadius;
    const m = Math.log(expansionRatio) / length;
    
    // Calculate approximate volume (numerical integration)
    let volume = 0;
    const steps = 100;
    for (let i = 0; i < steps; i++) {
        const x = (i / steps) * length;
        const r = throatRadius * Math.exp(m * x);
        volume += Math.PI * r * r * (length / steps);
    }
    volume = volume / 1000; // Convert to cm³
    
    document.getElementById('cutoffFreq').textContent = cutoffFreq.toFixed(1);
    document.getElementById('expansionRate').textContent = m.toFixed(6);
    document.getElementById('volume').textContent = volume.toFixed(1);
}

// Download STL
function downloadSTL() {
    if (!currentShape || !oc) {
        alert('Please generate a horn first');
        return;
    }
    
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
        
        console.log('STL downloaded successfully');
    } catch (error) {
        console.error('Error downloading STL:', error);
        alert('Error exporting STL. Please try again.');
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
